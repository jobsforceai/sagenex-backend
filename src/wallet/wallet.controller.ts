import { Request, Response } from 'express';
import * as walletService from './wallet.service';

/**
 * Gets the wallet summary and ledger history for a user.
 */
export const getWallet = async (req: Request, res: Response) => {
  const { userId } = req.params;
  // In a real app, you'd also check if the requesting user is authorized
  // to view this wallet (i.e., they are the user or an admin).

  try {
    const walletData = await walletService.getUserWallet(userId);
    res.status(200).json(walletData);
  } catch (error: any) {
    console.error(`Error fetching wallet for user ${userId}:`, error);
    res.status(500).json({ message: 'Error fetching wallet data.', error: error.message });
  }
};
