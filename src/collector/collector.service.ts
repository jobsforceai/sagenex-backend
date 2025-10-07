import User, { IUser } from '../user/user.model';
import OfflineDeposit, { IOfflineDeposit } from '../deposits/offline.deposit.model';
import WalletLedger from '../wallet/wallet.ledger.model';
import { CustomError } from '../helpers/error.helper';
import CurrencyRate from '../rates/currency.model';
import { sendWelcomeEmail } from '../email/email.service';

interface DepositData {
  userId: string;
  collectorId: string;
  amountLocal: number;
  currencyCode: string;
  method: 'CASH' | 'UPI' | 'BANK_TRANSFER';
  reference?: string;
  proofUrl?: string;
}

/**
 * Records an offline deposit, converts it to USDT, and creates the initial ledger entry.
 * @param data The deposit data in local currency.
 * @returns The newly created offline deposit record.
 */
export const recordDeposit = async (data: DepositData): Promise<IOfflineDeposit> => {
  const { userId, collectorId, amountLocal, currencyCode, method, reference, proofUrl } = data;

  // 1. Find the user for whom the deposit is being made
  const user = await User.findOne({ userId });
  if (!user) {
    throw new CustomError('NotFoundError', `User with ID '${userId}' not found.`);
  }

  // 2. Security Check: Verify the collector is assigned to this user
  if (user.assignedCollectorId !== collectorId) {
    throw new CustomError('AuthorizationError', 'You are not assigned to this user.');
  }

  // 3. Fetch the conversion rate
  const rate = await CurrencyRate.findOne({ currencyCode: currencyCode.toUpperCase() });
  if (!rate) {
    throw new CustomError('ValidationError', `No conversion rate set for currency '${currencyCode}'.`);
  }
  const conversionRate = rate.rateToUSDT;
  const amountUSDT = amountLocal / conversionRate;

  // 4. Create the OfflineDeposit record
  const newDeposit = new OfflineDeposit({
    userId,
    collectorId,
    amountUSDT,
    amountLocal,
    currencyCode,
    conversionRate,
    method,
    reference,
    proofUrl,
    status: 'PENDING',
  });
  await newDeposit.save();

  // 5. Create the corresponding WalletLedger entry with the USDT amount
  const ledgerEntry = new WalletLedger({
    userId,
    type: 'OFFLINE_DEPOSIT',
    amount: amountUSDT, // Use the converted USDT amount
    status: 'PENDING',
    createdBy: collectorId,
    meta: {
      depositId: (newDeposit._id as any).toString(),
      method,
      reference,
      amountLocal,
      currencyCode,
    },
  });
  await ledgerEntry.save();

  return newDeposit;
};

/**
 * Gets a list of all users assigned to a specific collector.
 * @param collectorId The ID of the collector.
 * @returns A promise that resolves to an array of user documents.
 */
export const getAssignedUsers = async (collectorId: string): Promise<IUser[]> => {
  const users = await User.find({ assignedCollectorId: collectorId }).select('-password'); // Exclude sensitive data
  return users;
};

/**
 * Allows a collector to assign a user to themselves, if the user is unassigned.
 * @param userId The user to be assigned.
 * @param collectorId The collector performing the action.
 * @returns The updated user document.
 */
export const assignUserToCollector = async (userId: string, collectorId: string): Promise<IUser> => {
  // 1. Find the user by their userId
  const user = await User.findOne({ userId });
  if (!user) {
    throw new CustomError('NotFoundError', `User with ID '${userId}' not found.`);
  }

  // 2. Check if the user is already assigned to a collector
  if (user.assignedCollectorId) {
    if (user.assignedCollectorId === collectorId) {
      throw new CustomError('ConflictError', 'User is already assigned to you.');
    } else {
      throw new CustomError('ConflictError', 'User is already assigned to another collector.');
    }
  }

  // 3. Assign the user to the current collector
  user.assignedCollectorId = collectorId;
  await user.save();

  return user;
};

import { customAlphabet } from 'nanoid';

/**
 * Creates a new user, similar to the admin onboarding process.
 * @param userData The data for the new user.
 * @param collectorId The ID of the collector creating the user.
 * @returns The newly created user document.
 */
export const createUser = async (userData: Partial<IUser>, collectorId: string) => {
    const { fullName, email, phone, initialInvestmentLocal, currencyCode, sponsorId, dateJoined } = userData as any;

    // 1. Validation
    if (!fullName || !email) {
        throw new CustomError('ValidationError', 'Full name and email are required.');
    }
    const emailExists = await User.findOne({ email });
    if (emailExists) {
        throw new CustomError('ConflictError', 'Email already exists.');
    }

    // 2. Convert currency if initial investment is provided
    let packageUSD = 0;
    if (initialInvestmentLocal && currencyCode) {
        const rate = await CurrencyRate.findOne({ currencyCode: currencyCode.toUpperCase() });
        if (!rate) {
            throw new CustomError('ValidationError', `No conversion rate set for currency '${currencyCode}'.`);
        }
        packageUSD = initialInvestmentLocal / rate.rateToUSDT;
    }

    // 3. Resolve Sponsor
    let resolvedSponsorId: string | null = null;
    if (sponsorId) {
        const sponsor = await User.findOne({ $or: [{ userId: sponsorId }, { referralCode: sponsorId }] });
        if (!sponsor) {
            throw new CustomError('ValidationError', `Sponsor with ID or Referral Code '${sponsorId}' not found.`);
        }
        resolvedSponsorId = sponsor.userId;
    }

    // 4. Create User
    const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 8);
    const newUser = new User({
        fullName,
        email,
        phone,
        packageUSD,
        sponsorId: resolvedSponsorId,
        dateJoined: dateJoined ? new Date(dateJoined) : new Date(),
        pvPoints: packageUSD * 0.1,
        referralCode: nanoid(),
        assignedCollectorId: collectorId, // Assign to the collector who created the user
    });

    await newUser.save();

    // Send welcome email (fire and forget)
    sendWelcomeEmail(newUser, sponsorId);

    return newUser;
};

import { getLiveRatesObject } from '../helpers/currency.helper';

/**
 * Gets a list of all users that are not assigned to any collector.
 * @returns A promise that resolves to an array of user documents.
 */
export const getUnassignedUsers = async (): Promise<IUser[]> => {
    const users = await User.find({ assignedCollectorId: null }).select('-password');
    return users;
};

/**
 * Gets the live currency rates for collector reference.
 */
export const getLiveRates = async () => {
    // Reuse the same helper function as the admin service
    // Pass false to get the cached rates and avoid unnecessary API calls
    return getLiveRatesObject(false);
};

