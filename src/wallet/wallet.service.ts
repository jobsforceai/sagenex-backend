import WalletSummary from './wallet.summary.model';
import WalletLedger from './wallet.ledger.model';
import { CustomError } from '../helpers/error.helper';

/**
 * Gets the complete wallet data for a specific user.
 * @param userId The ID of the user whose wallet is being fetched.
 * @returns An object containing the wallet summary and ledger history.
 */
export const getUserWallet = async (userId: string) => {
  // 1. Fetch Wallet Summary
  const summary = await WalletSummary.findOne({ userId }).lean();
  if (!summary) {
    // If a user has no activity, they might not have a summary.
    // We can return a default empty state.
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

  // 2. Fetch Ledger History (add pagination in a real app)
  const ledger = await WalletLedger.find({ userId })
    .sort({ createdAt: -1 })
    .limit(100) // Basic pagination
    .lean();

  return { summary, ledger };
};
