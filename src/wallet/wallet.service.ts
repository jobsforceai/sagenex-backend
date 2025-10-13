import WalletSummary from './wallet.summary.model';
import WalletLedger from './wallet.ledger.model';
import { CustomError } from '../helpers/error.helper';
import User from '../user/user.model';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { sendTransferOtpEmail } from '../email/email.service';
import { customAlphabet } from 'nanoid';

/**
 * Gets the complete wallet data for a specific user.
 * @param userId The ID of the user whose wallet is being fetched.
 * @returns An object containing the wallet summary and ledger history.
 */
export const getUserWallet = async (userId: string) => {
  // 1. Fetch Wallet Summary
  const summary = await WalletSummary.findOne({ userId }).lean();
  if (!summary) {
    return {
      summary: {
        userId,
        availableToWithdraw: 0,
        lifetimeEarnings: 0,
        lastUpdated: new Date(),
      },
      ledger: [],
    };
  }

  // 2. Fetch Ledger History
  const ledger = await WalletLedger.find({ userId })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  return { summary, ledger };
};

/**
 * Creates a withdrawal request for a user after performing necessary checks.
 * @param userId The ID of the user requesting the withdrawal.
 * @param amount The amount to withdraw.
 * @param withdrawalAddress The crypto address for the withdrawal.
 * @returns The newly created wallet ledger entry for the withdrawal request.
 */
export const createWithdrawalRequest = async (userId: string, amount: number, withdrawalAddress: string) => {
  const user = await User.findOne({ userId });
  const summary = await WalletSummary.findOne({ userId });

  if (!user) throw new CustomError('NotFoundError', `User with ID '${userId}' not found.`);
  if (!summary) throw new CustomError('NotFoundError', `Wallet for user with ID '${userId}' not found.`);
  if (user.kycStatus !== 'VERIFIED') throw new CustomError('AuthorizationError', 'KYC must be verified before you can withdraw funds.');
  if (amount <= 0) throw new CustomError('ValidationError', 'Withdrawal amount must be positive.');
  if (amount > summary.availableToWithdraw) throw new CustomError('ValidationError', 'Insufficient funds.');

  const ledgerEntry = new WalletLedger({
    userId,
    type: 'WITHDRAWAL_REQUEST',
    amount: -amount,
    status: 'PENDING',
    createdBy: userId,
    meta: { withdrawalAddress },
  });
  await ledgerEntry.save();

  summary.availableToWithdraw -= amount;
  await summary.save();

  return ledgerEntry;
};

// --- User-to-User Transfer ---

/**
 * Generates, saves, and sends a 6-digit OTP for transfer verification.
 * @param userId The ID of the user initiating the transfer.
 */
export const generateAndSendTransferOtp = async (userId: string) => {
  const user = await User.findOne({ userId });
  if (!user) {
    throw new CustomError('NotFoundError', `User with ID '${userId}' not found.`);
  }

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Reset count if the last request was more than an hour ago
  if (user.otpRequestTimestamp && user.otpRequestTimestamp < oneHourAgo) {
    user.otpRequestCount = 0;
  }

  // Check request limit
  if (user.otpRequestCount && user.otpRequestCount >= 5) {
    throw new CustomError('ValidationError', 'You have exceeded the OTP request limit. Please try after 1 hour.');
  }

  const nanoid = customAlphabet('1234567890', 6);
  const otp = nanoid();
  
  const salt = await bcrypt.genSalt(10);
  user.otp = await bcrypt.hash(otp, salt);
  user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // Expires in 10 minutes
  user.otpRequestCount = (user.otpRequestCount || 0) + 1;
  user.otpRequestTimestamp = now;
  await user.save();

  await sendTransferOtpEmail(user, otp);
};

/**
 * Executes a fund transfer from one user to another within a database transaction.
 * @param senderId The ID of the user sending the funds.
 * @param recipientId The ID of the user receiving the funds.
 * @param amount The amount to transfer.
 * @param otp The one-time password for verification.
 * @returns A unique transaction ID for the transfer.
 */
export const executeTransfer = async (senderId: string, recipientId: string, amount: number, otp: string) => {
  if (senderId === recipientId) throw new CustomError('ValidationError', 'Cannot transfer funds to yourself.');
  if (amount <= 0) throw new CustomError('ValidationError', 'Transfer amount must be a positive number.');

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const sender = await User.findOne({ userId: senderId }).session(session);
    const recipient = await User.findOne({ userId: recipientId }).session(session);
    const senderWallet = await WalletSummary.findOne({ userId: senderId }).session(session);

    if (!sender) throw new CustomError('NotFoundError', 'Sender not found.');
    if (!recipient) throw new CustomError('NotFoundError', 'Recipient not found.');
    if (!senderWallet) throw new CustomError('NotFoundError', 'Sender wallet not found.');

    // Check for account lockout
    if (sender.otpLockoutExpires && new Date() < sender.otpLockoutExpires) {
      throw new CustomError('AuthorizationError', 'Account is locked due to too many failed OTP attempts. Please try again later.');
    }

    if (!sender.otp || !sender.otpExpires) throw new CustomError('AuthorizationError', 'No OTP has been generated.');
    if (new Date() > sender.otpExpires) throw new CustomError('AuthorizationError', 'OTP has expired.');

    const isOtpValid = await bcrypt.compare(otp, sender.otp);
    if (!isOtpValid) {
      sender.failedOtpAttempts = (sender.failedOtpAttempts || 0) + 1;
      if (sender.failedOtpAttempts >= 5) {
        sender.otpLockoutExpires = new Date(Date.now() + 60 * 60 * 1000); // Lock for 1 hour
      }
      await sender.save({ session });
      throw new CustomError('AuthorizationError', 'Invalid OTP.');
    }

    if (senderWallet.availableToWithdraw < amount) throw new CustomError('ValidationError', 'Insufficient funds.');

    const transactionId = `T-${customAlphabet('1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ', 12)()}`;

    senderWallet.availableToWithdraw -= amount;
    await senderWallet.save({ session });

    await WalletSummary.updateOne(
      { userId: recipientId },
      { $inc: { availableToWithdraw: amount, lifetimeEarnings: amount } },
      { upsert: true, session }
    );

    const senderLedger = new WalletLedger({
      userId: senderId,
      type: 'TRANSFER_OUT',
      amount: -amount,
      status: 'POSTED',
      createdBy: senderId,
      meta: { recipientId, recipientName: recipient.fullName, transactionId },
    });
    await senderLedger.save({ session });

    const receiverLedger = new WalletLedger({
      userId: recipientId,
      type: 'TRANSFER_IN',
      amount: amount,
      status: 'POSTED',
      createdBy: senderId,
      meta: { senderId, senderName: sender.fullName, transactionId },
    });
    await receiverLedger.save({ session });

    sender.otp = undefined;
    sender.otpExpires = undefined;
    sender.failedOtpAttempts = 0; // Reset on successful transfer
    sender.otpLockoutExpires = undefined;
    await sender.save({ session });

    await session.commitTransaction();
    return { transactionId };

  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};