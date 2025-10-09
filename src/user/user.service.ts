import WalletLedger from '../wallet/wallet.ledger.model';
import { buildReferralTree } from '../helpers/tree.helper';
import User from './user.model';
import { CustomError } from '../helpers/error.helper';
import WalletSummary from '../wallet/wallet.summary.model';

/**
 * Gets a paginated, searchable, and sortable list of all users.
 * @param options - Options for pagination, searching, and sorting.
 * @returns An object containing the list of users and pagination details.
 */
export const getAllUsers = async (options: {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) => {
  const {
    page = 1,
    limit = 10,
    search = '',
    sortBy = 'userId',
    sortOrder = 'asc',
  } = options;

  // 1. Build Search Query
  const query: any = {};
  if (search) {
    const searchRegex = new RegExp(search, 'i'); // Case-insensitive search
    query.$or = [
      { fullName: searchRegex },
      { email: searchRegex },
      { userId: searchRegex },
      { referralCode: searchRegex },
    ];
  }

  // 2. Build Sort Options
  const sortOptions: { [key: string]: 1 | -1 } = {};
  sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

  // 3. Execute Query with Sorting and Pagination
  const users = await User.find(query)
    .sort(sortOptions)
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  // 4. Get Total Count for Pagination
  const totalUsers = await User.countDocuments(query);
  const pagination = {
    currentPage: page,
    totalPages: Math.ceil(totalUsers / limit),
    totalUsers,
  };

  return { users, pagination };
};


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

/**
 * Gets a list of direct children for a specific user.
 * @param userId The ID of the parent user.
 * @returns A list of the user's direct children, containing only their userId and fullName.
 */
export const getDirectChildren = async (userIdentifier: string) => {
  // 1. Verify the parent user exists by either userId or referralCode
  const parent = await User.findOne({
    $or: [{ userId: userIdentifier }, { referralCode: userIdentifier }],
  }).lean();
  
  if (!parent) {
    throw new CustomError('NotFoundError', `User with ID or Referral Code '${userIdentifier}' not found.`);
  }

  // 2. Fetch direct children using the definitive parent userId
    const children = await User.find({ parentId: parent.userId })
      .select('userId fullName')
      .lean();
  
    return children;
  };
  
  import OfflineDeposit from '../deposits/offline.deposit.model';
  
  /**
   * Updates a user's details with validation for parent and original sponsor changes.
   * @param userId The ID of the user to update.
   * @param updateData The data to update.
   * @returns The updated user document.
   */
  export const updateUser = async (userId: string, updateData: {
    fullName?: string;
    phone?: string;
    parentId?: string;
  }) => {
    const { fullName, phone, parentId } = updateData;
  
    // 1. Find the user
    const user = await User.findOne({ userId });
    if (!user) {
      throw new CustomError('NotFoundError', `User with ID '${userId}' not found.`);
    }
  
    // 2. Handle Parent ID change with advanced validation
    if (parentId && parentId !== user.parentId) {
      // 2a. Validate the new parent first
      const newParent = await User.findOne({ userId: parentId });
      if (!newParent) {
        throw new CustomError('NotFoundError', `New parent with ID '${parentId}' not found.`);
      }
  
      // 2b. Check if the new parent has capacity
      const parentChildCount = await User.countDocuments({ parentId: newParent.userId });
      if (parentChildCount >= 6) { // Assuming directWidthCap is 6
        throw new CustomError('ConflictError', `New parent '${newParent.fullName}' has reached their direct capacity.`);
      }
  
      // 2c. Logic for changing originalSponsorId (Full Reassignment)
      if (user.originalSponsorId === user.parentId) {
        // SAFETY CHECK: This is only allowed if the user has no financial history.
        const verifiedDeposits = await OfflineDeposit.countDocuments({ userId: user.userId, status: 'VERIFIED' });
        if (verifiedDeposits > 0) {
          throw new CustomError('ConflictError', 'Cannot change original sponsor after a deposit has been verified.');
        }
        // If safe, reassign both original sponsor and parent.
        user.originalSponsorId = parentId;
        user.parentId = parentId;
      } 
      // 2d. Logic for changing parentId only (Placement Change)
      else {
        // CRITICAL: Check if the user has any children before changing placement.
        const childCount = await User.countDocuments({ parentId: user.userId });
        if (childCount > 0) {
          throw new CustomError('ConflictError', 'Cannot change parent: User already has direct children.');
        }
        user.parentId = parentId;
      }
    }
  
    // 3. Update other fields if provided
    if (fullName) {
      user.fullName = fullName;
    }
    if (phone) {
      user.phone = phone;
    }
  
    // 4. Save and return the updated user
    await user.save();
    return user;
  };
  