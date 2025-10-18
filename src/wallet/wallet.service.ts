import WalletSummary from './wallet.summary.model';
import WalletLedger from './wallet.ledger.model';
import { CustomError } from '../helpers/error.helper';
import User from '../user/user.model';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { sendTransferOtpEmail } from '../email/email.service';
import { customAlphabet } from 'nanoid';
import CryptoDeposit, { ICryptoDeposit } from '../deposits/crypto.deposit.model';
import * as nowpaymentsService from '../services/nowpayments.service';
import * as adminService from '../admin/admin.service'; // For reusing the activation logic
import { IUser } from '../user/user.model';
import { getUplineForUnilevel } from '../admin/payout.service';
import { awardDirectBonus, awardUnilevelBonus } from '../admin/payout.service';
import { IOfflineDeposit } from '../deposits/offline.deposit.model';

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

// --- Crypto Deposits (NOWPayments) ---

/**
 * Creates a crypto deposit invoice via NOWPayments and records it in the database.
 * @param userId The ID of the user making the deposit.
 * @param amount The amount in USDT.
 * @returns The invoice data from NOWPayments to be sent to the frontend.
 */
export const createCryptoDepositInvoice = async (userId: string, amount: number) => {
  const MINIMUM_DEPOSIT_USD = 15;

  if (amount < MINIMUM_DEPOSIT_USD) {
    throw new CustomError('ValidationError', `Deposit amount must be at least $${MINIMUM_DEPOSIT_USD}.`);
  }
  if (amount <= 0) {
    throw new CustomError('ValidationError', 'Deposit amount must be positive.');
  }

  // 1. Create a pending deposit record in our database first
  const pendingDeposit = new CryptoDeposit({
    userId,
    amountUSDT: amount,
    status: 'PENDING',
    // Temporary placeholder for the payment ID
    nowPaymentsPaymentId: `TEMP_${new mongoose.Types.ObjectId().toString()}`,
  });
  await pendingDeposit.save();

  try {
    // 2. Create the invoice with NOWPayments, using our internal record's ID as the order_id
    const invoice = await nowpaymentsService.createPaymentInvoice(amount, (pendingDeposit._id as any).toString());

    // 3. Update our record with the actual payment ID from NOWPayments
    pendingDeposit.nowPaymentsPaymentId = invoice.payment_id;
    await pendingDeposit.save();

    return invoice;
  } catch (error) {
    // If invoice creation fails, mark our internal record as failed
    pendingDeposit.status = 'FAILED';
    await pendingDeposit.save();
    throw error; // Re-throw the error to be handled by the controller
  }
};

/**
 * Processes a confirmed crypto deposit after receiving a webhook notification.
 * This function mirrors the logic of `adminService.verifyDepositAndActivatePackage`.
 * @param depositId The internal ID of the crypto deposit record (from `order_id`).
 * @param nowPaymentsPaymentId The payment ID from NOWPayments for verification.
 */
export const processCryptoDeposit = async (depositId: string, nowPaymentsPaymentId: string) => {
  const deposit = await CryptoDeposit.findById(depositId);

  if (!deposit) {
    throw new CustomError('NotFoundError', `Crypto deposit with internal ID '${depositId}' not found.`);
  }
  if (deposit.status !== 'PENDING') {
    console.warn(`Webhook for a non-pending crypto deposit received. Status: ${deposit.status}`);
    return; // Avoid reprocessing
  }
  if (deposit.nowPaymentsPaymentId !== nowPaymentsPaymentId) {
      throw new CustomError('ValidationError', 'NOWPayments Payment ID mismatch.');
  }

  // This logic is adapted from `adminService.verifyDepositAndActivatePackage`
  const user = await User.findOne({ userId: deposit.userId });
  if (!user) {
    throw new CustomError('NotFoundError', `User with ID '${deposit.userId}' not found.`);
  }

  // Note: We create a temporary object that mimics IOfflineDeposit for the bonus functions
  const depositForBonus: Partial<IOfflineDeposit> = {
    _id: (deposit._id as any),
    amountUSDT: deposit.amountUSDT,
    userId: user.userId,
  };

  await awardDirectBonus(user, depositForBonus as IOfflineDeposit);
  
  const priorVerifiedDeposits = await CryptoDeposit.countDocuments({ userId: user.userId, status: 'CONFIRMED' });
  if (priorVerifiedDeposits === 0) {
    const unilevelUpline = await getUplineForUnilevel(user.parentId);
    await awardUnilevelBonus(unilevelUpline, user, depositForBonus as IOfflineDeposit);
  }

  deposit.status = 'CONFIRMED';
  deposit.confirmedAt = new Date();
  await deposit.save();

  user.packageUSD += deposit.amountUSDT;
  user.pvPoints = user.packageUSD * 0.1;
  if (!user.isPackageActive) {
    user.isPackageActive = true;
  }
  await user.save();

  const activationLedger = new WalletLedger({
    userId: user.userId,
    type: 'PACKAGE_ACTIVATION',
    amount: deposit.amountUSDT,
    status: 'POSTED',
    createdBy: 'SYSTEM_NOWPAYMENTS',
    meta: {
      cryptoDepositId: (deposit._id as any).toString(),
      nowPaymentsPaymentId,
    },
  });
  await activationLedger.save();

  await WalletSummary.findOneAndUpdate(
      { userId: user.userId },
      { $setOnInsert: { userId: user.userId } },
      { upsert: true }
  );
};

/**
 * Updates the status of a crypto deposit for failed, refunded, or expired payments.
 * @param depositId The internal ID of the crypto deposit record.
 * @param status The new status from the webhook.
 */
export const updateCryptoDepositStatus = async (depositId: string, status: 'FAILED' | 'EXPIRED') => {
  await CryptoDeposit.updateOne(
    { _id: depositId, status: 'PENDING' }, // Ensure we only update pending deposits
    { $set: { status } }
  );
};