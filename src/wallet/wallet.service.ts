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

import User from '../user/user.model';

/**
 * Creates a withdrawal request for a user after performing necessary checks.
 * @param userId The ID of the user requesting the withdrawal.
 * @param amount The amount to withdraw.
 * @param withdrawalAddress The crypto address for the withdrawal.
 * @returns The newly created wallet ledger entry for the withdrawal request.
 */
export const createWithdrawalRequest = async (userId: string, amount: number, withdrawalAddress: string) => {
  // 1. Fetch user and wallet summary in parallel
  const userPromise = User.findOne({ userId });
  const summaryPromise = WalletSummary.findOne({ userId });
  const [user, summary] = await Promise.all([userPromise, summaryPromise]);

  if (!user) {
    throw new CustomError('NotFoundError', `User with ID '${userId}' not found.`);
  }
  if (!summary) {
    throw new CustomError('NotFoundError', `Wallet for user with ID '${userId}' not found.`);
  }

  // 2. CRITICAL: Check KYC status
  if (user.kycStatus !== 'VERIFIED') {
    throw new CustomError('AuthorizationError', 'KYC must be verified before you can withdraw funds.');
  }

  // 3. Validate withdrawal amount
  if (amount <= 0) {
    throw new CustomError('ValidationError', 'Withdrawal amount must be positive.');
  }
  if (amount > summary.availableToWithdraw) {
    throw new CustomError('ValidationError', 'Insufficient funds. Withdrawal amount exceeds available balance.');
  }

  // 4. Create the withdrawal ledger entry
  const ledgerEntry = new WalletLedger({
    userId,
    type: 'WITHDRAWAL_REQUEST',
    amount: -amount, // Use a negative value for withdrawals
    status: 'PENDING',
    createdBy: userId,
    meta: {
      withdrawalAddress,
    },
  });
  await ledgerEntry.save();

  // 5. Update the wallet summary
  summary.availableToWithdraw -= amount;
  await summary.save();

  return ledgerEntry;
};
