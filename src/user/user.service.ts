import { buildReferralTree } from '../helpers/tree.helper';
import WalletLedger from '../wallet/wallet.ledger.model';
import User, { IUser } from './user.model';
import { CustomError } from '../helpers/error.helper';
import WalletSummary from '../wallet/wallet.summary.model';
import { companyConfig } from '../config/company';
import { featureFlags } from '../config/features';
import { sendWelcomeEmail } from '../email/email.service';
import { customAlphabet } from 'nanoid';

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
 * Gets the parent information for a given user.
 * @param user The user document for whom to find the parent.
 * @returns The parent's details or a default object for the company sponsor.
 */
export const getParentInfo = async (user: { parentId: string | null } | null) => {
    if (!user || !user.parentId) {
        return null;
    }

    if (user.parentId === companyConfig.sponsorId) {
        return {
            userId: companyConfig.sponsorId,
            fullName: 'SAGENEX',
        };
    }

    return User.findOne({ userId: user.parentId }).select('userId fullName').lean();
};

/**
 * Gets the referral tree and parent for a specific user.
 * @param userId The ID of the user.
 * @param maxDepth The maximum depth of the tree to fetch.
 * @returns The user's referral tree and their parent's info.
 */
export const getReferralTree = async (userId: string, maxDepth: number) => {
  const user = await User.findOne({ userId }).lean();
  if (!user) {
    throw new CustomError('NotFoundError', `User with ID '${userId}' not found.`);
  }

  const tree = await buildReferralTree(user.userId, maxDepth);
  if (!tree) {
    // This case should not be reached if the user was found, but is a safeguard.
    throw new CustomError('NotFoundError', `Could not build tree for user with ID '${userId}'.`);
  }
  
  const parent = await getParentInfo(user);

  return { tree, parent };
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

/**
 * Creates a new user with validation and width-capped unilevel placement logic.
 * This is the single source of truth for creating any new user.
 * @param userData The data for the new user.
 * @returns The newly created user document.
 */
export const createNewUser = async (userData: Partial<IUser> & { sponsorId?: string, placementDesigneeId?: string }) => {
  const { fullName, email, phone, sponsorId, placementDesigneeId, dateJoined, googleId, profilePicture } = userData;

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
    googleId,
    profilePicture,
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

  