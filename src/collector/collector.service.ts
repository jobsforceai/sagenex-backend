import User, { IUser } from '../user/user.model';
import OfflineDeposit, { IOfflineDeposit } from '../deposits/offline.deposit.model';
import WalletLedger from '../wallet/wallet.ledger.model';
import { CustomError } from '../helpers/error.helper';
import CurrencyRate from '../rates/currency.model';
import { sendWelcomeEmail } from '../email/email.service';
import { customAlphabet } from 'nanoid';
import { getLiveRatesObject } from '../helpers/currency.helper';
import { featureFlags } from '../config/features';
import { companyConfig } from '../config/company';

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
 * Any collector can now record a deposit for any user.
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

  // 2. Fetch the conversion rate
  const rate = await CurrencyRate.findOne({ currencyCode: currencyCode.toUpperCase() });
  if (!rate) {
    throw new CustomError('ValidationError', `No conversion rate set for currency '${currencyCode}'.`);
  }
  const conversionRate = rate.rateToUSDT;
  const amountUSDT = amountLocal / conversionRate;

  // 3. Create the OfflineDeposit record
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

  // 4. Create the corresponding WalletLedger entry
  const ledgerEntry = new WalletLedger({
    userId,
    type: 'OFFLINE_DEPOSIT',
    amount: amountUSDT,
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
 * Creates a new user with width-capped unilevel placement logic.
 * @param userData The data for the new user.
 * @returns The newly created user document.
 */
export const createUser = async (userData: Partial<IUser> & { sponsorId?: string, placementDesigneeId?: string }) => {
  const { fullName, email, phone, sponsorId, placementDesigneeId, dateJoined } = userData;

  // 1. Basic Validation
  if (!fullName || !email) {
    throw new CustomError('ValidationError', 'Full name and email are required.');
  }
  const emailExists = await User.findOne({ email });
  if (emailExists) {
    throw new CustomError('ConflictError', 'Email already exists.');
  }

  let originalSponsorId: string | null = null;
  let parentId: string | null = null;
  let isSplitSponsor = false;

  // 2. Resolve Sponsor and Determine Placement
  const effectiveSponsorId = sponsorId || companyConfig.sponsorId;

  if (effectiveSponsorId === companyConfig.sponsorId) {
    // Case A: User is sponsored by the company
    originalSponsorId = companyConfig.sponsorId;
    parentId = companyConfig.sponsorId;
  } else {
    // Case B: User has a real sponsor
    const originalSponsor = await User.findOne({ $or: [{ userId: effectiveSponsorId }, { referralCode: effectiveSponsorId }] });
    if (!originalSponsor) {
      throw new CustomError('NotFoundError', `Sponsor with ID or Referral Code '${effectiveSponsorId}' not found.`);
    }
    originalSponsorId = originalSponsor.userId;

    const sponsorDirectCount = await User.countDocuments({ parentId: originalSponsor.userId });

    if (sponsorDirectCount < featureFlags.directWidthCap) {
      // Sponsor has capacity
      if (placementDesigneeId) {
        throw new CustomError('ValidationError', 'Designee not allowed; sponsor has capacity.');
      }
      parentId = originalSponsor.userId;
    } else {
      // Sponsor is full, designee is required
      if (!placementDesigneeId) {
        throw new CustomError('ValidationError', 'Sponsor is full; a placement designee is required.');
      }

      const designee = await User.findOne({ userId: placementDesigneeId });
      if (!designee || designee.parentId !== originalSponsor.userId) {
        throw new CustomError('ValidationError', 'Designee must be one of the sponsor’s direct children.');
      }

      const designeeDirectCount = await User.countDocuments({ parentId: designee.userId });
      if (designeeDirectCount >= featureFlags.directWidthCap) {
        throw new CustomError('ConflictError', 'Selected designee already has 6 directs. Pick a different designee.');
      }
      
      parentId = designee.userId;
      isSplitSponsor = true;
    }
  }

  // 3. Create User
  const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 8);
  const newUser = new User({
    fullName,
    email,
    phone,
    packageUSD: 0,
    originalSponsorId,
    parentId,
    isSplitSponsor,
    dateJoined: dateJoined ? new Date(dateJoined) : new Date(),
    pvPoints: 0,
    referralCode: nanoid(),
  });

  await newUser.save();

  // 4. Send welcome email (fire and forget)
  sendWelcomeEmail(newUser, sponsorId);

  return newUser;
};

/**
 * Gets the deposit history for a specific user.
 * @param userId The ID of the user.
 * @returns A promise that resolves to an array of offline deposit documents.
 */
export const getUserDepositHistory = async (userId: string): Promise<IOfflineDeposit[]> => {
    const user = await User.findOne({ userId });
    if (!user) {
        throw new CustomError('NotFoundError', `User with ID '${userId}' not found.`);
    }
    const deposits = await OfflineDeposit.find({ userId }).sort({ createdAt: -1 });
    return deposits;
};

/**
 * Gets the live currency rates for collector reference.
 */
export const getLiveRates = async () => {
    return getLiveRatesObject(false);
};