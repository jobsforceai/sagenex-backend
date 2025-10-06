import User, { IUser } from '../user/user.model';
import OfflineDeposit, { IOfflineDeposit } from '../deposits/offline.deposit.model';
import WalletLedger from '../wallet/wallet.ledger.model';
import WalletSummary from '../wallet/wallet.summary.model';
import { CustomError } from '../helpers/error.helper';
import { ICollector } from '../collector/collector.model';
import { getLiveRatesObject } from '../helpers/currency.helper';
import CurrencyRate from '../rates/currency.model';
import mongoose from 'mongoose';
import Collector from '../collector/collector.model';
import Admin, { IAdmin } from './admin.model';

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
 * Assigns a cash collector to a user.
 * @param userId The ID of the user to assign the collector to.
 * @param collectorId The ID of the collector.
 * @returns The updated user document.
 */
export const assignCollectorToUser = async (userId: string, collectorId: string) => {
  // 1. Find the user to be assigned
  const user = await User.findOne({ userId });
  if (!user) {
    throw new CustomError('NotFoundError', `User with ID '${userId}' not found.`);
  }

  // 2. Find the collector from the Collector model
  const collector = await Collector.findOne({ collectorId: collectorId });
  if (!collector) {
    throw new CustomError('NotFoundError', `Collector with ID '${collectorId}' not found.`);
  }

  // 3. Assign the collector and save
  user.assignedCollectorId = collector.collectorId;
  await user.save();

  return user;
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
  console.log('Collector created in service:', collector); // Debugging log
  return collector;
};

/**
 * Gets the live currency rates for admin reference.
 * @param force - If true, forces a refresh of the cache.
 */
export const getLiveRatesForAdmin = async (force: boolean = false) => {
    return getLiveRatesObject(force);
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
    const rate = await CurrencyRate.findOneAndUpdate(
        { currencyCode: code },
        {
            rateToUSDT,
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

    // 2. Find the user
    const user = await User.findOne({ userId: deposit.userId });
    if (!user) {
      throw new CustomError('NotFoundError', `User with ID '${deposit.userId}' not found.`);
    }

    // 3. Update deposit and ledger status
    deposit.status = 'VERIFIED';
    deposit.verifiedAt = new Date();
    await deposit.save();

    await WalletLedger.updateOne(
      { "meta.depositId": (deposit._id as any).toString(), type: 'OFFLINE_DEPOSIT' },
      { $set: { status: 'VERIFIED' } }
    );

    // 4. Activate/Update user's package
    user.packageUSD += deposit.amountUSDT;
    user.pvPoints = user.packageUSD * 0.1; // Recalculate PV points
    await user.save();

    // 5. Create PACKAGE_ACTIVATION ledger entry
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

    // 6. Initialize Wallet Summary if it doesn't exist
    await WalletSummary.findOneAndUpdate(
        { userId: user.userId },
        { $setOnInsert: { userId: user.userId } },
        { upsert: true }
    );

    // TODO: Trigger real-time commission calculations (ROI, Direct, Unilevel)
    // This is a complex step that requires adapting the monthly payout logic.
    // For now, we are only activating the package. The earnings will be calculated
    // in the monthly batch process as per the existing logic.

    return deposit;

  } catch (error) {
    // The function will now throw any error directly to be handled by the controller
    throw error;
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
