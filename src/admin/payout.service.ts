import User, { IUser } from '../user/user.model';
import {
  UNILEVEL_PCTS,
  getTieredROIRate,
  FIRST_DEPOSIT_DIRECT_BONUS_PCT,
  getReinvestmentBonusPct
} from '../config/payouts';
import { startOfMonth, endOfMonth, getDaysInMonth, differenceInDays } from 'date-fns';
import { featureFlags } from '../config/features';
import { companyConfig } from '../config/company';
import WalletLedger from '../wallet/wallet.ledger.model';
import WalletSummary from '../wallet/wallet.summary.model';
import OfflineDeposit, { IOfflineDeposit } from '../deposits/offline.deposit.model';

// --- Helper Functions ---

/**
 * Finds a user's upline chain, up to a maximum number of levels.
 */
async function getUpline(userId: string, maxLevels: number): Promise<IUser[]> {
  const upline: IUser[] = [];
  let currentUserId = userId;

  for (let i = 0; i < maxLevels; i++) {
    const currentUser = await User.findOne({ userId: currentUserId });
    if (!currentUser || !currentUser.parentId || currentUser.parentId === companyConfig.sponsorId) {
      break; // Stop if user, parent doesn't exist, or parent is the company
    }

    const parent = await User.findOne({ userId: currentUser.parentId });
    if (!parent) {
      break; // Stop if parent not found
    }

    upline.push(parent);
    currentUserId = parent.userId;
  }
  return upline;
}

/**
 * Finds a user's upline chain for unilevel bonus calculation, starting from the parent's parent.
 * @param parentId The ID of the user's direct parent.
 * @returns A promise that resolves to an array of user documents representing the upline.
 */
export async function getUplineForUnilevel(parentId: string | null): Promise<IUser[]> {
  if (!parentId || parentId === companyConfig.sponsorId) {
    return [];
  }
  // This correctly starts the chain from the parent's parent (i.e., the grandparent).
  return getUpline(parentId, UNILEVEL_PCTS.length);
}

/**
 * Awards a direct bonus in real-time when a deposit is verified.
 * - First deposit bonus goes to the original sponsor.
 * - Subsequent deposit bonuses go to the placement parent.
 * @param depositingUser The user who made the deposit.
 * @param deposit The verified deposit object.
 */
export const awardDirectBonus = async (depositingUser: IUser, deposit: IOfflineDeposit) => {
  // Determine if this is the user's first-ever verified deposit.
  // This check runs before the current deposit's status is changed to 'VERIFIED'.
  const priorVerifiedDeposits = await OfflineDeposit.countDocuments({
    userId: depositingUser.userId,
    status: 'VERIFIED',
  });
  const isFirstDeposit = priorVerifiedDeposits === 0;

  let recipientId: string | null = null;
  let bonusPct = 0;

  // Determine recipient and bonus percentage based on deposit number
  if (isFirstDeposit) {
    recipientId = depositingUser.originalSponsorId;
    bonusPct = FIRST_DEPOSIT_DIRECT_BONUS_PCT;
  } else {
    recipientId = depositingUser.parentId;
    bonusPct = getReinvestmentBonusPct(priorVerifiedDeposits);
  }

  // No bonus if there's no recipient or if the recipient is the company
  if (!recipientId || recipientId === companyConfig.sponsorId) {
    return;
  }

  const bonusAmount = deposit.amountUSDT * bonusPct;

  // 1. Create Wallet Ledger Entry for the bonus
  const ledgerEntry = new WalletLedger({
    userId: recipientId,
    type: 'DIRECT',
    amount: bonusAmount,
    status: 'POSTED',
    createdBy: 'SYSTEM_DEPOSIT_VERIFICATION',
    meta: {
      sourceUserId: depositingUser.userId,
      depositId: (deposit._id as any).toString(),
      depositAmount: deposit.amountUSDT,
      bonusPercentage: bonusPct,
    },
  });
  await ledgerEntry.save();

  // 2. Update the recipient's Wallet Summary
  await WalletSummary.findOneAndUpdate(
    { userId: recipientId },
    {
      $inc: {
        availableToWithdraw: bonusAmount,
        lifetimeEarnings: bonusAmount,
      },
      $setOnInsert: { userId: recipientId },
    },
    { upsert: true }
  );
};

/**
 * Awards unilevel bonuses in real-time when a deposit is verified.
 * The bonus chain starts from the PARENT'S PARENT.
 * @param upline The pre-fetched upline for the depositing user.
 * @param depositingUser The user who made the deposit.
 * @param deposit The verified deposit object.
 */
export const awardUnilevelBonus = async (upline: IUser[], depositingUser: IUser, deposit: IOfflineDeposit) => {
  for (let i = 0; i < upline.length; i++) {
    const uplineUser = upline[i];
    const level = i + 1;
    const bonusPercentage = UNILEVEL_PCTS[i];
    const bonusAmount = deposit.amountUSDT * bonusPercentage;

    if (bonusAmount <= 0) continue;

    // 1. Create Wallet Ledger Entry
    const ledgerEntry = new WalletLedger({
      userId: uplineUser.userId,
      type: 'UNILEVEL',
      amount: bonusAmount,
      status: 'POSTED',
      createdBy: 'SYSTEM_DEPOSIT_VERIFICATION',
      meta: {
        sourceUserId: depositingUser.userId,
        depositId: (deposit._id as any).toString(),
        depositAmount: deposit.amountUSDT,
        bonusPercentage,
        level,
      },
    });
    await ledgerEntry.save();

    // 2. Update Wallet Summary
    await WalletSummary.findOneAndUpdate(
      { userId: uplineUser.userId },
      {
        $inc: {
          availableToWithdraw: bonusAmount,
          lifetimeEarnings: bonusAmount,
        },
        $setOnInsert: { userId: uplineUser.userId },
      },
      { upsert: true }
    );
  }
};


// --- Payout Calculation Logic ---

export interface PayoutSnapshot {
  userId: string;
  fullName: string;
  packageUSD: number;
  roiPayout: number;
  directReferralBonus: number;
  unilevelBonus: number;
  salary: number;
  totalMonthlyIncome: number;
}

/**
 * Generates a monthly payout snapshot for reporting purposes by SUMMING ledger entries.
 * ROI is still calculated monthly as it depends on the package value over time.
 */
export async function calculateMonthlyPayouts(monthDate: Date): Promise<PayoutSnapshot[]> {
  const startDate = startOfMonth(monthDate);
  const endDate = endOfMonth(monthDate);
  const totalDaysInMonth = getDaysInMonth(monthDate);

  const activeUsers = await User.find({ status: 'active' }).lean();
  const snapshots: PayoutSnapshot[] = [];

  for (const user of activeUsers) {
    // --- Prorated ROI Payout ---
    const roiRate = getTieredROIRate(user.packageUSD);
    let roiPayout = user.packageUSD * roiRate;
    if (user.dateJoined >= startDate && user.dateJoined <= endDate) {
      const activeDays = differenceInDays(endDate, user.dateJoined) + 1;
      roiPayout *= (activeDays / totalDaysInMonth);
    }
    
    // --- Fetch Direct & Unilevel Bonuses from the ledger for the month ---
    const ledgerEntries = await WalletLedger.find({
      userId: user.userId,
      status: 'POSTED',
      createdAt: { $gte: startDate, $lte: endDate },
      type: { $in: ['DIRECT', 'UNILEVEL'] }
    });

    const directReferralBonus = ledgerEntries
      .filter(e => e.type === 'DIRECT')
      .reduce((sum, entry) => sum + entry.amount, 0);

    const unilevelBonus = ledgerEntries
      .filter(e => e.type === 'UNILEVEL')
      .reduce((sum, entry) => sum + entry.amount, 0);
    
    const salary = user.salary || 0;
    const totalMonthlyIncome = roiPayout + directReferralBonus + unilevelBonus + salary;

    snapshots.push({
      userId: user.userId,
      fullName: user.fullName,
      packageUSD: user.packageUSD,
      roiPayout,
      directReferralBonus,
      unilevelBonus,
      salary,
      totalMonthlyIncome,
    });
  }

  return snapshots;
}
