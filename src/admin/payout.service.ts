import User, { IUser } from '../user/user.model';
import { DIRECT_REFERRAL_PCT, UNILEVEL_PCTS, getTieredROIRate } from '../config/payouts';
import { startOfMonth, endOfMonth, getDaysInMonth, differenceInDays } from 'date-fns';

// --- Helper Functions ---

/**
 * Finds a user's upline chain, up to a maximum number of levels.
 * @param userId The ID of the starting user.
 * @param maxLevels The maximum number of upline levels to retrieve.
 * @returns An array of user objects representing the upline chain.
 */
async function getUpline(userId: string, maxLevels: number): Promise<IUser[]> {
  const upline: IUser[] = [];
  let currentUserId = userId;

  for (let i = 0; i < maxLevels; i++) {
    const currentUser = await User.findOne({ userId: currentUserId });
    if (!currentUser || !currentUser.sponsorId) {
      break; // Stop if user or sponsor doesn't exist
    }

    const sponsor = await User.findOne({ userId: currentUser.sponsorId });
    if (!sponsor) {
      break; // Stop if sponsor not found
    }

    upline.push(sponsor);
    currentUserId = sponsor.userId;
  }

  return upline;
}

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
 * Calculates the monthly payout snapshot for all active users for a given month.
 * @param monthDate A date within the month to calculate payouts for (e.g., new Date('2025-10-01')).
 * @returns A promise that resolves to an array of PayoutSnapshot objects.
 */
export async function calculateMonthlyPayouts(monthDate: Date): Promise<PayoutSnapshot[]> {
  const startDate = startOfMonth(monthDate);
  const endDate = endOfMonth(monthDate);
  const totalDaysInMonth = getDaysInMonth(monthDate);

  const activeUsers = await User.find({ status: 'active' }).lean();
  const newUsersThisMonth = await User.find({ dateJoined: { $gte: startDate, $lte: endDate } }).lean();

  const unilevelBonuses = new Map<string, number>();

  // 1. Calculate Unilevel Bonuses from new users
  for (const newUser of newUsersThisMonth) {
    const upline = await getUpline(newUser.userId, UNILEVEL_PCTS.length);
    for (let i = 0; i < upline.length; i++) {
      const uplineUser = upline[i];
      const bonusPercentage = UNILEVEL_PCTS[i];
      const bonusAmount = newUser.packageUSD * bonusPercentage;
      
      const currentBonus = unilevelBonuses.get(uplineUser.userId) || 0;
      unilevelBonuses.set(uplineUser.userId, currentBonus + bonusAmount);
    }
  }

  const snapshots: PayoutSnapshot[] = [];

  // 2. Calculate final snapshot for each active user
  for (const user of activeUsers) {
    // --- Prorated ROI Payout ---
    const roiRate = getTieredROIRate(user.packageUSD);
    let fullMonthROIPayout = user.packageUSD * roiRate;
    let roiPayout = fullMonthROIPayout;

    // Check if the user joined in the current month
    if (user.dateJoined >= startDate && user.dateJoined <= endDate) {
      // Calculate the number of days the user was active in the month
      // Adding 1 to include the joining day itself
      const activeDays = differenceInDays(endDate, user.dateJoined) + 1;
      const prorationFactor = activeDays / totalDaysInMonth;
      roiPayout = fullMonthROIPayout * prorationFactor;
    }
    
    // --- Direct Referral Bonus ---
    const directReferrals = await User.find({ 
      sponsorId: user.userId,
      dateJoined: { $gte: startDate, $lte: endDate }
    }).lean();
    const directReferralBonus = directReferrals.reduce((total, referral) => {
      return total + (referral.packageUSD * DIRECT_REFERRAL_PCT);
    }, 0);

    // Get aggregated unilevel bonus
    const unilevelBonus = unilevelBonuses.get(user.userId) || 0;
    
    // Salary
    const salary = user.salary || 0;

    // Total
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
