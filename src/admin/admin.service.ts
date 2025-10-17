import User, { IUser } from '../user/user.model';
import OfflineDeposit, { IOfflineDeposit } from '../deposits/offline.deposit.model';
import WalletLedger from '../wallet/wallet.ledger.model';
import WalletSummary from '../wallet/wallet.summary.model';
import { CustomError } from '../helpers/error.helper';
import { ICollector } from '../collector/collector.model';
import { currencyToCountryMap } from '../helpers/currency.data';
import { getLiveRatesObject } from '../helpers/currency.helper';
import CurrencyRate from '../rates/currency.model';
import mongoose from 'mongoose';
import Collector from '../collector/collector.model';
import Admin, { IAdmin } from './admin.model';
import { awardDirectBonus, awardUnilevelBonus, getUplineForUnilevel } from './payout.service';
import * as userService from '../user/user.service';

/**
 * Onboards a new user with width-capped unilevel placement logic.
 * @param userData The data for the new user.
 * @returns The newly created user document.
 */
export const onboardUser = async (userData: Partial<IUser> & { sponsorId?: string, placementDesigneeId?: string }) => {
  return userService.createNewUser(userData);
};


/**
 * Creates a new admin.
 * @param adminData The data for the new admin.
 * @returns The newly created admin document.
 */
export const createAdmin = async (adminData: Partial<IAdmin>) => {
  const { email, password, fullName } = adminData;
  if (!email || !password || !fullName) {
    throw new CustomError("ValidationError", "Email, password, and fullName are required.");
  }

  const existingAdmin = await Admin.findOne({ email });
  if (existingAdmin) {
    throw new CustomError("ValidationError", "An admin with this email already exists.");
  }

  const admin = new Admin(adminData);
  await admin.save();
  return admin;
};

/**
 * Creates a new collector.
 * @param collectorData The data for the new collector.
 * @returns The newly created collector document.
 */
export const createCollector = async (collectorData: Partial<ICollector>) => {
  if (!collectorData.email || !collectorData.password) {
    throw new CustomError("ValidationError", "Email and password are required.");
  }
  const collector = new Collector(collectorData);
  await collector.save();
  return collector;
};

/**
 * Gets all deposits recorded by a specific collector.
 * @param collectorId The ID of the collector.
 * @returns A promise that resolves to an array of offline deposit documents.
 */
export const getDepositsByCollector = async (collectorId: string): Promise<IOfflineDeposit[]> => {
    const collector = await Collector.findOne({ collectorId });
    if (!collector) {
        throw new CustomError('NotFoundError', `Collector with ID '${collectorId}' not found.`);
    }
    const deposits = await OfflineDeposit.find({ collectorId }).sort({ createdAt: -1 });
    return deposits;
};

/**
 * Gets the live currency rates for admin reference.
 * @param force - If true, forces a refresh of the cache.
 */
export const getLiveRatesForAdmin = async (force: boolean = false) => {
    return getLiveRatesObject(force);
};

/**
 * Refreshes live rates and automatically updates the fixed rates.
 * @returns The newly fetched live rates.
 */
export const refreshLiveRatesAndUpdateFixed = async () => {
    const liveRates = await getLiveRatesObject(true); // Force refresh

    const bulkOps = Object.entries(liveRates).map(([currencyCode, rateData]) => {
        let fixedRate: number;
        if (currencyCode.toUpperCase() === 'USD') {
            fixedRate = 1; // Always set USD to 1
        } else {
            // Apply a 2% margin and round to 4 decimal places
            fixedRate = parseFloat((rateData.rate * 1.02).toFixed(4));
        }
        const countryName = currencyToCountryMap[currencyCode.toUpperCase()];

        return {
            updateOne: {
                filter: { currencyCode },
                update: {
                    $set: {
                        rateToUSDT: fixedRate,
                        countryName,
                        lastUpdatedBy: 'SYSTEM_AUTO_UPDATE',
                    },
                },
                upsert: true,
            },
        };
    });

    if (bulkOps.length > 0) {
        await CurrencyRate.bulkWrite(bulkOps);
    }

    return liveRates;
};

/**
 * Gets all fixed rates set by admins.
 */
export const getFixedRates = async () => {
    return CurrencyRate.find().sort({ currencyCode: 1 });
};

/**
 * Creates or updates a fixed currency rate.
 * @param currencyCode The currency code (e.g., 'INR').
 * @param rateToUSDT The new rate to set.
 * @param adminId The ID of the admin setting the rate.
 */
export const setFixedRate = async (currencyCode: string, rateToUSDT: number, adminId: string) => {
    const code = currencyCode.toUpperCase();
    const countryName = currencyToCountryMap[code];
    const rate = await CurrencyRate.findOneAndUpdate(
        { currencyCode: code },
        {
            rateToUSDT,
            countryName,
            lastUpdatedBy: adminId,
        },
        { new: true, upsert: true }
    );
    return rate;
};

/**
 * Fetches a list of offline deposits by their status.
 * @param status The status to filter deposits by.
 * @returns A list of deposit documents.
 */
export const getDepositsByStatus = async (status: 'PENDING' | 'VERIFIED' | 'REJECTED'): Promise<IOfflineDeposit[]> => {
  console.log(`Querying database for deposits with status: ${status}`);
  const deposits = await OfflineDeposit.find({ status }).sort({ createdAt: -1 });
  console.log(`Found ${deposits.length} deposits with status: ${status}`);
  return deposits;
};

/**
 * Verifies a deposit, activates the user's package, and triggers commission calculations.
 * @param depositId The ID of the deposit to verify.
 * @param adminUserId The ID of the admin performing the action.
 * @returns The updated deposit document.
 */
export const verifyDepositAndActivatePackage = async (depositId: string, adminUserId: string): Promise<IOfflineDeposit> => {
  try {
    // 1. Find the deposit
    const deposit = await OfflineDeposit.findById(depositId);
    if (!deposit) {
      throw new CustomError('NotFoundError', `Deposit with ID '${depositId}' not found.`);
    }
    if (deposit.status !== 'PENDING') {
      throw new CustomError('ValidationError', `Deposit is not pending. Current status: ${deposit.status}`);
    }

    // 2. Find the user and their upline for bonuses
    const user = await User.findOne({ userId: deposit.userId });
    if (!user) {
      throw new CustomError('NotFoundError', `User with ID '${deposit.userId}' not found.`);
    }
    const unilevelUpline = await getUplineForUnilevel(user.parentId);

    // 3. Award bonuses in real-time
    const priorVerifiedDeposits = await OfflineDeposit.countDocuments({
      userId: user.userId,
      status: 'VERIFIED',
    });

    await awardDirectBonus(user, deposit);
    
    // Only award unilevel bonus on the very first deposit
    if (priorVerifiedDeposits === 0) {
      await awardUnilevelBonus(unilevelUpline, user, deposit);
    }

    // 4. Update deposit with verification info and lineage snapshot for audit
    deposit.status = 'VERIFIED';
    deposit.verifiedAt = new Date();
    deposit.lineageSnapshot = {
      originalSponsorId: user.originalSponsorId,
      parentId: user.parentId,
      unilevelUpline: unilevelUpline.map((u: IUser) => u.userId), // Store IDs for a lightweight snapshot
    };
    await deposit.save();

    // 5. Update the corresponding ledger entry for the deposit itself
    await WalletLedger.updateOne(
      { "meta.depositId": (deposit._id as any).toString(), type: 'OFFLINE_DEPOSIT' },
      { $set: { status: 'VERIFIED' } }
    );

    // 6. Activate/Update user's package and activation status
    user.packageUSD += deposit.amountUSDT;
    user.pvPoints = user.packageUSD * 0.1; // Recalculate PV points
    if (!user.isPackageActive) {
      user.isPackageActive = true;
    }
    await user.save();

    // 7. Create PACKAGE_ACTIVATION ledger entry
    const activationLedger = new WalletLedger({
      userId: user.userId,
      type: 'PACKAGE_ACTIVATION',
      amount: deposit.amountUSDT,
      status: 'POSTED',
      createdBy: adminUserId,
      meta: {
        depositId: (deposit._id as any).toString(),
      },
    });
    await activationLedger.save();

    // 8. Initialize Wallet Summary if it doesn't exist
    await WalletSummary.findOneAndUpdate(
        { userId: user.userId },
        { $setOnInsert: { userId: user.userId } },
        { upsert: true }
    );

    return deposit;

  } catch (error) {
    throw error; // Re-throw the error to be handled by the controller
  }
};

/**
 * Gets a single user by their user ID.
 * @param userId The ID of the user to fetch.
 * @returns The user document.
 */
export const getUserById = async (userId: string): Promise<IUser> => {
    const user = await User.findOne({ userId });
    if (!user) {
        throw new CustomError('NotFoundError', `User with ID '${userId}' not found.`);
    }
    return user;
};

import DeletedUser from './deleted.user.model';
import Kyc, { KycStatus } from '../kyc/kyc.model';

import { companyConfig } from '../config/company';

/**
 * Deletes a single user by their user ID, with safety checks and fund transfers.
 * @param userId The ID of the user to delete.
 * @param adminId The ID of the admin performing the deletion.
 */
export const deleteUser = async (userId: string, adminId: string): Promise<void> => {
    // 1. Find the user
    const user = await User.findOne({ userId });
    if (!user) {
        throw new CustomError('NotFoundError', `User with ID '${userId}' not found.`);
    }

    // 2. Check if the user has any direct children
    const childCount = await User.countDocuments({ parentId: userId });
    if (childCount > 0) {
        throw new CustomError('ConflictError', `Cannot delete user. User has ${childCount} direct children.`);
    }

    // 3. Transfer funds if a wallet summary exists
    const walletSummary = await WalletSummary.findOne({ userId });
    if (walletSummary) {
        const { availableToWithdraw, lifetimeEarnings } = walletSummary;
        const totalFunds = availableToWithdraw; // Or decide if other balances should be included

        if (totalFunds > 0) {
            const transferMeta = {
                sourceUserId: userId,
                sourceUserEmail: user.email,
                reason: 'User account deletion',
                transferredBy: adminId,
                originalAvailableToWithdraw: availableToWithdraw,
                originalLifetimeEarnings: lifetimeEarnings,
            };

            // Create a debit entry for the deleted user
            const debitLedger = new WalletLedger({
                userId: userId,
                type: 'FUND_TRANSFER_ON_DELETE',
                amount: -totalFunds,
                status: 'POSTED',
                createdBy: adminId,
                meta: { ...transferMeta, direction: 'out' },
            });
            await debitLedger.save();

            // Create a credit entry for the Segenex root account
            const creditLedger = new WalletLedger({
                userId: companyConfig.sponsorId,
                type: 'FUND_TRANSFER_ON_DELETE',
                amount: totalFunds,
                status: 'POSTED',
                createdBy: adminId,
                meta: { ...transferMeta, direction: 'in' },
            });
            await creditLedger.save();

            // Update the Segenex root account's wallet summary
            await WalletSummary.findOneAndUpdate(
                { userId: companyConfig.sponsorId },
                {
                    $inc: {
                        availableToWithdraw: totalFunds,
                        lifetimeEarnings: totalFunds, // Or decide how to classify this
                    },
                    $setOnInsert: { userId: companyConfig.sponsorId },
                },
                { upsert: true }
            );
        }

        // Delete the user's wallet summary
        await walletSummary.deleteOne();
    }

    // 4. Create a deleted user record for archival purposes
    const deletedUser = new DeletedUser({
        ...user.toObject(),
        _id: undefined, // Let MongoDB generate a new _id for the deleted record
        deletedAt: new Date(),
        deletedBy: adminId,
    });
    await deletedUser.save();

    // 5. Delete the original user from the main collection
    await user.deleteOne();
};

/**
 * Gets a list of all deleted users for archival and review purposes.
 * @returns A list of deleted user documents.
 */
export const getDeletedUsers = async () => {
    const deletedUsers = await DeletedUser.find().sort({ deletedAt: -1 });
    return deletedUsers;
};

// --- KYC Management ---

/**
 * Gets a list of KYC submissions, filterable by status.
 * @param status The status to filter KYC submissions by.
 * @returns A list of KYC documents.
 */
export const getKycSubmissions = async (status: KycStatus) => {
  const submissions = await Kyc.find({ status }).sort({ submittedAt: 1 });
  return submissions;
};

/**
 * Verifies a user's KYC submission.
 * @param kycId The ID of the KYC submission to verify.
 * @param adminId The ID of the admin performing the action.
 * @returns The updated KYC document.
 */
export const verifyKyc = async (kycId: string, adminId: string) => {
  const kyc = await Kyc.findById(kycId);
  if (!kyc) {
    throw new CustomError('NotFoundError', `KYC submission with ID '${kycId}' not found.`);
  }
  if (kyc.status !== 'PENDING') {
    throw new CustomError('ConflictError', `Cannot verify KYC. Status is '${kyc.status}'.`);
  }

  const user = await User.findOne({ userId: kyc.userId });
  if (!user) {
    throw new CustomError('NotFoundError', `User with ID '${kyc.userId}' associated with this KYC not found.`);
  }

  // Update KYC record
  kyc.status = 'VERIFIED';
  kyc.verifiedAt = new Date();
  kyc.verifiedBy = adminId;
  await kyc.save();

  // Sync status with user record
  user.kycStatus = 'VERIFIED';
  await user.save();

  return kyc;
};

/**
 * Rejects a user's KYC submission.
 * @param kycId The ID of the KYC submission to reject.
 * @param adminId The ID of the admin performing the action.
 * @param reason The reason for rejection.
 * @returns The updated KYC document.
 */
export const rejectKyc = async (kycId: string, adminId: string, reason: string) => {
  if (!reason) {
    throw new CustomError('ValidationError', 'A reason is required to reject KYC.');
  }

  const kyc = await Kyc.findById(kycId);
  if (!kyc) {
    throw new CustomError('NotFoundError', `KYC submission with ID '${kycId}' not found.`);
  }
  if (kyc.status !== 'PENDING') {
    throw new CustomError('ConflictError', `Cannot reject KYC. Status is '${kyc.status}'.`);
  }

  const user = await User.findOne({ userId: kyc.userId });
  if (!user) {
    throw new CustomError('NotFoundError', `User with ID '${kyc.userId}' associated with this KYC not found.`);
  }

  // Update KYC record
  kyc.status = 'REJECTED';
  kyc.rejectionReason = reason;
  kyc.verifiedAt = new Date(); // 'verifiedAt' here means 'processedAt'
  kyc.verifiedBy = adminId;
  await kyc.save();

  // Sync status with user record
  user.kycStatus = 'REJECTED';
  await user.save();

  return kyc;
};

// --- Withdrawal Management ---

/**
 * Gets a list of withdrawal requests, filterable by status.
 * @param status The status to filter requests by.
 * @returns A list of withdrawal request ledger entries.
 */
export const getWithdrawalRequests = async (status: 'PENDING' | 'PAID' | 'REJECTED') => {
  const requests = await WalletLedger.find({
    type: 'WITHDRAWAL_REQUEST',
    status,
  }).sort({ createdAt: 1 });
  return requests;
};

/**
 * Approves a withdrawal request.
 * @param withdrawalId The ID of the withdrawal ledger entry.
 * @param adminId The ID of the admin approving the request.
 * @returns The updated ledger entry.
 */
export const approveWithdrawal = async (withdrawalId: string, adminId: string) => {
  const withdrawal = await WalletLedger.findById(withdrawalId);
  if (!withdrawal || withdrawal.type !== 'WITHDRAWAL_REQUEST') {
    throw new CustomError('NotFoundError', `Withdrawal request with ID '${withdrawalId}' not found.`);
  }
  if (withdrawal.status !== 'PENDING') {
    throw new CustomError('ConflictError', `Cannot approve request. Status is '${withdrawal.status}'.`);
  }

  withdrawal.status = 'PAID';
  withdrawal.meta = { ...withdrawal.meta, processedBy: adminId, processedAt: new Date() };
  await withdrawal.save();

  return withdrawal;
};

/**
 * Rejects a withdrawal request and refunds the user.
 * @param withdrawalId The ID of the withdrawal ledger entry.
 * @param adminId The ID of the admin rejecting the request.
 * @param reason The reason for rejection.
 * @returns The updated ledger entry.
 */
export const rejectWithdrawal = async (withdrawalId: string, adminId: string, reason: string) => {
  if (!reason) {
    throw new CustomError('ValidationError', 'A reason is required to reject a withdrawal.');
  }

  const withdrawal = await WalletLedger.findById(withdrawalId);
  if (!withdrawal || withdrawal.type !== 'WITHDRAWAL_REQUEST') {
    throw new CustomError('NotFoundError', `Withdrawal request with ID '${withdrawalId}' not found.`);
  }
  if (withdrawal.status !== 'PENDING') {
    throw new CustomError('ConflictError', `Cannot reject request. Status is '${withdrawal.status}'.`);
  }

  // Refund the user by adding the amount back to their available balance
  // The ledger amount is negative, so we subtract it (e.g., balance - (-100) = balance + 100)
  await WalletSummary.updateOne(
    { userId: withdrawal.userId },
    { $inc: { availableToWithdraw: -withdrawal.amount } }
  );

  // Update the withdrawal record
  withdrawal.status = 'REJECTED';
  withdrawal.meta = { ...withdrawal.meta, processedBy: adminId, processedAt: new Date(), rejectionReason: reason };
  await withdrawal.save();

  return withdrawal;
};
