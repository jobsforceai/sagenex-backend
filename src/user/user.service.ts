import WalletLedger from '../wallet/wallet.ledger.model';
import { buildReferralTree } from '../helpers/tree.helper';
import User from './user.model';
import { CustomError } from '../helpers/error.helper';
import WalletSummary from '../wallet/wallet.summary.model';

/**
 * Gets the dashboard data for a specific user.
 * @param userId The ID of the user.
 * @returns An object containing the user's profile, package info, and wallet summary.
 */
export const getDashboardData = async (userId: string) => {
  // 1. Fetch user data (including package info)
  const user = await User.findOne({ userId }).lean();
  if (!user) {
    throw new CustomError('NotFoundError', `User with ID '${userId}' not found.`);
  }

  // 2. Fetch wallet summary
  const summary = await WalletSummary.findOne({ userId }).lean();

  // 3. Combine and return the data
  return {
    profile: {
      userId: user.userId,
      fullName: user.fullName,
      email: user.email,
      profilePicture: user.profilePicture,
      referralCode: user.referralCode,
      dateJoined: user.dateJoined,
    },
    package: {
      packageUSD: user.packageUSD,
      pvPoints: user.pvPoints,
    },
    wallet: {
      availableToWithdraw: summary?.availableToWithdraw ?? 0,
      lifetimeEarnings: summary?.lifetimeEarnings ?? 0,
    },
  };
};

/**
 * Gets the full wallet transaction history for a specific user.
 * @param userId The ID of the user.
 * @returns A list of wallet ledger entries.
 */
export const getWalletHistory = async (userId: string) => {
  const ledger = await WalletLedger.find({ userId })
    .sort({ createdAt: -1 })
    .limit(100) // Basic pagination
    .lean();
  return ledger;
};

/**
 * Gets the referral tree for a specific user.
 * @param userId The ID of the user.
 * @param maxDepth The maximum depth of the tree to fetch.
 * @returns The user's referral tree.
 */
export const getReferralTree = async (userId: string, maxDepth: number) => {
  const tree = await buildReferralTree(userId, maxDepth);
  if (!tree) {
    throw new CustomError('NotFoundError', `User with ID '${userId}' not found.`);
  }
  return tree;
};