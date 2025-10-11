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
