import { Request, Response } from 'express';
import * as walletService from './wallet.service';

/**
 * Gets the wallet summary and ledger history for a user.
 */
export const getWallet = async (req: Request, res: Response) => {
  const user = (req as any).user;

  try {
    const walletData = await walletService.getUserWallet(user.userId);
    res.status(200).json(walletData);
  } catch (error: any) {
    console.error(`Error fetching wallet for user ${user.userId}:`, error);
    res.status(500).json({ message: 'Error fetching wallet data.', error: error.message });
  }
};

/**
 * Creates a new withdrawal request for the logged-in user.
 */
export const requestWithdrawal = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { amount, withdrawalAddress } = req.body;

  if (!amount || !withdrawalAddress) {
    return res.status(400).json({ message: 'Amount and withdrawalAddress are required.' });
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount)) {
    return res.status(400).json({ message: 'Invalid amount format.' });
  }

  try {
    const withdrawalRequest = await walletService.createWithdrawalRequest(user.userId, parsedAmount, withdrawalAddress);
    res.status(201).json({ message: 'Withdrawal request submitted successfully.', request: withdrawalRequest });
  } catch (error: any) {
    if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
      return res.status(400).json({ message: error.message });
    }
    if (error.name === 'AuthorizationError') {
      return res.status(403).json({ message: error.message });
    }
    console.error(`Error creating withdrawal request for user ${user.userId}:`, error);
    res.status(500).json({ message: 'Error creating withdrawal request.', error: error.message });
  }
};

/**
 * Generates and sends an OTP to the user's email for transfer verification.
 */
export const sendTransferOtp = async (req: Request, res: Response) => {
  const user = (req as any).user;
  try {
    await walletService.generateAndSendTransferOtp(user.userId);
    res.status(200).json({ message: 'An OTP has been sent to your registered email.' });
  } catch (error: any) {
    console.error(`Error sending OTP for user ${user.userId}:`, error);
    res.status(500).json({ message: 'Error sending OTP.', error: error.message });
  }
};

/**
 * Executes a user-to-user fund transfer.
 */
export const executeTransfer = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { recipientId, amount, otp } = req.body;

  if (!recipientId || !amount || !otp) {
    return res.status(400).json({ message: 'recipientId, amount, and otp are required.' });
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount)) {
    return res.status(400).json({ message: 'Invalid amount format.' });
  }

  try {
    const result = await walletService.executeTransfer(user.userId, recipientId, parsedAmount, otp);
    res.status(200).json({ message: 'Transfer successful.', ...result });
  } catch (error: any) {
    if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
      return res.status(400).json({ message: error.message });
    }
    if (error.name === 'AuthorizationError') {
      return res.status(403).json({ message: error.message });
    }
    console.error(`Error executing transfer for user ${user.userId}:`, error);
    res.status(500).json({ message: 'Error executing transfer.', error: error.message });
  }
};

/**
 * Creates a new crypto deposit invoice for the logged-in user.
 */
export const createCryptoDeposit = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { amount } = req.body;

  if (!amount) {
    return res.status(400).json({ message: 'Amount is required.' });
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ message: 'Invalid amount format.' });
  }

  try {
    const invoice = await walletService.createCryptoDepositInvoice(user.userId, parsedAmount);
    res.status(201).json({ message: 'Invoice created successfully.', invoice });
  } catch (error: any) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    if (error.name === 'ServiceUnavailableError' || error.name === 'ApiError') {
      return res.status(503).json({ message: error.message });
    }
    console.error(`Error creating crypto deposit for user ${user.userId}:`, error);
    res.status(500).json({ message: 'Error creating deposit invoice.', error: error.message });
  }
};
