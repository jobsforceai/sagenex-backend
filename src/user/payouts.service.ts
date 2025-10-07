import Payout from '../payouts/payout.model';

/**
 * Gets the historical monthly payouts for a specific user.
 * @param userId The ID of the user.
 * @returns A list of the user's past payout records.
 */
export const getMonthlyPayouts = async (userId: string) => {
  const payouts = await Payout.find({ userId }).sort({ month: -1 }).lean();
  return payouts;
};
