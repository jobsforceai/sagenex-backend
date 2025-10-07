import { Request, Response } from 'express';
import * as payoutsService from './payouts.service';

/**
 * Gets the monthly payout history for the logged-in user.
 */
export const getMonthlyPayouts = async (req: Request, res: Response) => {
  const user = (req as any).user;

  try {
    const payouts = await payoutsService.getMonthlyPayouts(user.userId);
    res.status(200).json(payouts);
  } catch (error: any) {
    console.error(`Error fetching monthly payouts for user ${user.userId}:`, error);
    res.status(500).json({ message: 'Error fetching monthly payouts.', error: error.message });
  }
};
