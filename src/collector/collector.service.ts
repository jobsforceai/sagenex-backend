import User, { IUser } from '../user/user.model';
import OfflineDeposit, { IOfflineDeposit } from '../deposits/offline.deposit.model';
import WalletLedger from '../wallet/wallet.ledger.model';
import { CustomError } from '../helpers/error.helper';
import CurrencyRate from '../rates/currency.model';

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
      throw new CustomError('ValidationError', 'User is already assigned to you.');
    } else {
      throw new CustomError('ValidationError', 'User is already assigned to another collector.');
    }
  }

  // 3. Assign the user to the current collector
  user.assignedCollectorId = collectorId;
  await user.save();

  return user;
};
