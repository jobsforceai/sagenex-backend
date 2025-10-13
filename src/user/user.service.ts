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
      joinDate: user.dateJoined,
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
 * Recursively calculates the total investment volume of a user's downline.
 * @param userId The ID of the user at the top of the tree.
 * @returns The total sum of packageUSD for all users in the downline.
 */
const getDownlineVolume = async (userId: string): Promise<number> => {
  let volume = 0;
  // Find all direct children of the current user
  const children = await User.find({ parentId: userId }).select('userId packageUSD').lean();

  // This loop iterates through the direct children
  for (const child of children) {
    // Add the direct child's own investment to the volume
    volume += child.packageUSD;
    // Recursively call the function for each child to get their downline's volume
    volume += await getDownlineVolume(child.userId);
  }

  return volume;
};

/**
 * Gets a detailed summary of a user's direct referrals and total downline volume.
 * @param userId The ID of the user whose referrals are to be fetched.
 * @returns An object containing the referral summary.
 */
export const getReferralSummary = async (userId: string) => {
  // 1. Find all direct children of the user
  const directReferrals = await User.find({ parentId: userId }).lean();

  let investedCount = 0;
  const referralsDetails = [];

  // 2. Process each referral to determine their status
  for (const referral of directReferrals) {
    // Check investment status
    const hasInvested = referral.packageUSD > 0;
    if (hasInvested) {
      investedCount++;
    }

    // Check activity status by counting their direct children
    const childCount = await User.countDocuments({ parentId: referral.userId });
    const isActive = childCount >= 6;

    referralsDetails.push({
      userId: referral.userId,
      fullName: referral.fullName,
      dateJoined: referral.dateJoined,
      investmentStatus: hasInvested ? 'Invested' : 'Not Invested',
      activityStatus: isActive ? 'Active' : 'Inactive',
      packageUSD: referral.packageUSD,
    });
  }

  // 3. Calculate total downline volume using the recursive helper
  const totalDownlineVolume = await getDownlineVolume(userId);

  // 4. Compile the final summary object
  return {
    totalReferrals: directReferrals.length,
    investedCount,
    notInvestedCount: directReferrals.length - investedCount,
    totalDownlineVolume,
    referrals: referralsDetails,
  };
};


/**
 * Recursively calculates the total number of members in a user's downline.
 * @param userId The ID of the user at the top of the tree.
 * @returns The total count of all users in the downline.
 */
const getDownlineCount = async (userId: string): Promise<number> => {
  const children = await User.find({ parentId: userId }).select('userId').lean();
  let count = children.length;

  for (const child of children) {
    count += await getDownlineCount(child.userId);
  }

  return count;
};

const ranks = [
  { level: 0, name: 'Member', directs: 0, team: 0, salary: 0 },
  { level: 1, name: 'Starter', directs: 6, team: 0, salary: 0 },
  { level: 2, name: 'Builder', directs: 6, team: 36, salary: 563 },
  { level: 3, name: 'Leader', directs: 6, team: 200, salary: 1128 },
  { level: 4, name: 'Manager', directs: 0, team: 1000, salary: 2255 },
  { level: 5, name: 'Director', directs: 0, team: 7000, salary: 3383 },
  { level: 6, name: 'Crown', directs: 0, team: 46000, salary: 5600 },
];

/**
 * Gets the user's current rank, progress towards the next rank, and perks.
 * @param userId The ID of the user.
 * @returns An object with the user's rank and progress details.
 */
export const getRankAndProgress = async (userId: string) => {
  const directsCount = await User.countDocuments({ parentId: userId });
  const teamSize = await getDownlineCount(userId);

  let currentRank = ranks[0];
  for (let i = ranks.length - 1; i >= 0; i--) {
    const rank = ranks[i];
    const directsMet = !rank.directs || directsCount >= rank.directs;
    const teamMet = !rank.team || teamSize >= rank.team;
    if (directsMet && teamMet) {
      currentRank = rank;
      break;
    }
  }

  const nextRank = ranks.find(r => r.level === currentRank.level + 1);
  let progressPercentage = 100;
  let progressDetails = {};

  if (nextRank) {
    const directsNeeded = nextRank.directs > 0 ? (directsCount / nextRank.directs) : 1;
    const teamNeeded = nextRank.team > 0 ? (teamSize / nextRank.team) : 1;
    
    // Weighted progress calculation
    if (nextRank.directs > 0 && nextRank.team > 0) {
      progressPercentage = Math.min(100, ((directsNeeded * 0.5) + (teamNeeded * 0.5)) * 100);
    } else if (nextRank.directs > 0) {
      progressPercentage = Math.min(100, directsNeeded * 100);
    } else {
      progressPercentage = Math.min(100, teamNeeded * 100);
    }

    progressDetails = {
      nextRankName: nextRank.name,
      requirements: {
        directs: { current: directsCount, required: nextRank.directs },
        team: { current: teamSize, required: nextRank.team },
      }
    };
  }

  return {
    currentRank: {
      name: currentRank.name,
      badge: `${currentRank.name} Badge`,
      salary: currentRank.salary,
    },
    progress: {
      percentage: Math.round(progressPercentage),
      ...progressDetails
    }
  };
};

import Payout from '../payouts/payout.model';

/**
 * Gets a comprehensive financial summary for a specific user.
 * @param userId The ID of the user.
 * @returns An object containing the user's financial summary and payout history.
 */
export const getFinancialSummary = async (userId: string) => {
  // 1. Fetch user and ledger entries in parallel
  const userPromise = User.findOne({ userId }).lean();
  const ledgerEntriesPromise = WalletLedger.find({ userId }).lean();
  const payoutsPromise = Payout.find({ userId }).sort({ month: -1 }).lean();

  const [user, ledgerEntries, payouts] = await Promise.all([
    userPromise,
    ledgerEntriesPromise,
    payoutsPromise,
  ]);

  if (!user) {
    throw new CustomError('NotFoundError', `User with ID '${userId}' not found.`);
  }

  // 2. Calculate earnings from ledger entries
  let referralEarnings = 0;
  let monthlyIncentive = 0;

  for (const entry of ledgerEntries) {
    if (entry.type === 'DIRECT' || entry.type === 'UNILEVEL') {
      referralEarnings += entry.amount;
    }
    if (entry.type === 'SALARY') {
      monthlyIncentive += entry.amount;
    }
  }

  // 3. Compile the summary object
  return {
    investedPrincipal: user.packageUSD,
    referralEarnings,
    oneTimePromotionBonus: 0, // Not implemented yet
    monthlyIncentive,
    payoutHistory: payouts,
  };
};


/**
 * Generates a leaderboard with the current user ranked 3rd or 4th.
 * @param userId The ID of the logged-in user.
 * @returns A sorted list of users for the leaderboard.
 */
export const getLeaderboard = async (userId: string) => {
  // 1. Fetch real user's data
  const user = await User.findOne({ userId }).lean();
  const summary = await WalletSummary.findOne({ userId }).lean();
  if (!user) {
    throw new CustomError('NotFoundError', `User with ID '${userId}' not found.`);
  }

  const teamVolume = await getDownlineVolume(userId);
  const packagesSold = await User.countDocuments({ parentId: userId, packageUSD: { $gt: 0 } });
  const earnings = summary?.lifetimeEarnings ?? 0;

  const currentUser = {
    userId: user.userId,
    fullName: user.fullName,
    profilePicture: user.profilePicture,
    teamVolume,
    packagesSold,
    earnings,
  };

  // 2. Generate dummy data
  const dummyUsers = [
    // Users ranked higher than the current user
    { userId: null, fullName: 'Rohan Sharma', profilePicture: null, teamVolume: teamVolume * 2.5, packagesSold: Math.round(packagesSold * 3), earnings: earnings * 2.8 },
    { userId: null, fullName: 'Priya Patel', profilePicture: null, teamVolume: teamVolume * 1.8, packagesSold: Math.round(packagesSold * 2), earnings: earnings * 2.1 },
    // Users ranked lower
    { userId: null, fullName: 'Arjun Singh', profilePicture: null, teamVolume: teamVolume * 0.8, packagesSold: Math.round(packagesSold * 1.2), earnings: earnings * 0.9 },
    { userId: null, fullName: 'Sneha Reddy', profilePicture: null, teamVolume: teamVolume * 0.6, packagesSold: packagesSold, earnings: earnings * 0.7 },
    { userId: null, fullName: 'Vikram Kumar', profilePicture: null, teamVolume: teamVolume * 0.4, packagesSold: Math.round(packagesSold * 0.8), earnings: earnings * 0.5 },
    { userId: null, fullName: 'Anjali Gupta', profilePicture: null, teamVolume: teamVolume * 0.2, packagesSold: Math.round(packagesSold * 0.5), earnings: earnings * 0.3 },
    { userId: null, fullName: 'Karan Malhotra', profilePicture: null, teamVolume: teamVolume * 0.1, packagesSold: Math.round(packagesSold * 0.3), earnings: earnings * 0.2 },
  ];

  // 3. Combine and sort
  const leaderboard = [...dummyUsers, currentUser]
    .sort((a, b) => b.teamVolume - a.teamVolume)
    .map((u, index) => ({
      rank: index + 1,
      ...u,
    }));

  // Ensure current user is 3rd or 4th by adding another high-ranker if needed
  const userRank = leaderboard.find(u => u.userId === userId)?.rank;
  if (userRank && userRank < 3) {
    leaderboard.unshift({
      rank: 0,
      userId: null,
      fullName: 'Aditya Rao',
      profilePicture: null,
      teamVolume: teamVolume * 4,
      packagesSold: Math.round(packagesSold * 5),
      earnings: earnings * 5,
    });
    // Re-rank
    leaderboard.sort((a, b) => b.teamVolume - a.teamVolume).forEach((u, index) => u.rank = index + 1);
  }


  return leaderboard.slice(0, 10); // Return top 10
};

/**
 * Gets the profile data for a specific user.
 * @param userId The ID of the user.
 * @returns An object containing the user's profile information.
 */
export const getUserProfile = async (userId: string) => {
  const user = await User.findOne({ userId }).lean();
  if (!user) {
    throw new CustomError('NotFoundError', `User with ID '${userId}' not found.`);
  }

  // Return a comprehensive profile object, excluding sensitive or internal fields
  return {
    userId: user.userId,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    profilePicture: user.profilePicture,
    referralCode: user.referralCode,
    originalSponsorId: user.originalSponsorId,
    parentId: user.parentId,
    isSplitSponsor: user.isSplitSponsor,
    packageUSD: user.packageUSD,
    pvPoints: user.pvPoints,
    dateJoined: user.dateJoined,
    status: user.status,
    isPackageActive: user.isPackageActive,
  };
};

/**
 * Creates a new user with validation and width-capped unilevel placement logic.
 * This is the single source of truth for creating any new user.
 * @param userData The data for the new user.
 * @returns The newly created user document.
 */
export const createNewUser = async (userData: Partial<IUser> & { sponsorId?: string }) => {
  const { fullName, email, phone, sponsorId, dateJoined, googleId, profilePicture } = userData;

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
  let placementDeadline: Date | undefined = undefined;

  // 2. Resolve Sponsor and Determine Placement
  const effectiveSponsorId = sponsorId || companyConfig.sponsorId;

  if (effectiveSponsorId === companyConfig.sponsorId) {
    // Case A: User is sponsored by the company, place immediately
    originalSponsorId = companyConfig.sponsorId;
    parentId = companyConfig.sponsorId;
  } else {
    // Case B: User has a real sponsor, place them in the queue
    const originalSponsor = await User.findOne({ $or: [{ userId: effectiveSponsorId }, { referralCode: effectiveSponsorId }] });
    if (!originalSponsor) {
      throw new CustomError('NotFoundError', `Sponsor with ID or Referral Code '${effectiveSponsorId}' not found.`);
    }
    originalSponsorId = originalSponsor.userId;
    parentId = null; // Set parent to null to indicate they are in the queue
    placementDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours from now
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
    isSplitSponsor: false, // This will be determined upon placement
    dateJoined: dateJoined ? new Date(dateJoined) : new Date(),
    pvPoints: 0,
    referralCode: nanoid(),
    placementDeadline,
  });

  await newUser.save();

  // 4. Send welcome email (fire and forget)
  sendWelcomeEmail(newUser, sponsorId);

  return newUser;
};

// --- Placement Queue Functions ---

/**
 * Gets the list of unplaced users for a specific sponsor.
 * @param sponsorId The ID of the sponsor.
 * @returns A list of user documents awaiting placement.
 */
export const getPlacementQueue = async (sponsorId: string) => {
  const queue = await User.find({
    originalSponsorId: sponsorId,
    parentId: null,
  }).sort({ dateJoined: 1 });
  return queue;
};

/**
 * Manually places a new user from the sponsor's queue into the tree.
 * @param sponsorId The ID of the sponsor performing the action.
 * @param newUserId The ID of the user being placed.
 * @param placementParentId The ID of the user who will become the new user's parent.
 * @returns The updated user document of the placed user.
 */
export const placeUser = async (sponsorId: string, newUserId: string, placementParentId: string) => {
  // 1. Fetch all necessary documents in parallel
  const newUserPromise = User.findOne({ userId: newUserId });
  const sponsorPromise = User.findOne({ userId: sponsorId });
  const placementParentPromise = User.findOne({ userId: placementParentId });

  const [newUser, sponsor, placementParent] = await Promise.all([
    newUserPromise,
    sponsorPromise,
    placementParentPromise,
  ]);

  // 2. Validate all entities
  if (!newUser) throw new CustomError('NotFoundError', `User to be placed with ID '${newUserId}' not found.`);
  if (!sponsor) throw new CustomError('NotFoundError', `Sponsor with ID '${sponsorId}' not found.`);
  if (!placementParent) throw new CustomError('NotFoundError', `Placement parent with ID '${placementParentId}' not found.`);

  // 3. Perform authorization and business logic checks
  if (newUser.parentId !== null) {
    throw new CustomError('ConflictError', 'This user has already been placed.');
  }
  if (newUser.originalSponsorId !== sponsorId) {
    throw new CustomError('AuthorizationError', 'You are not the original sponsor for this user.');
  }
  if (newUser.placementDeadline && new Date() > newUser.placementDeadline) {
    throw new CustomError('ConflictError', 'The 48-hour manual placement window has expired.');
  }
  if (placementParentId !== sponsorId && placementParent.parentId !== sponsorId) {
    throw new CustomError('ValidationError', 'Invalid placement. Designee must be a direct child of the sponsor.');
  }

  // 4. Check capacity of the placement parent
  const childCount = await User.countDocuments({ parentId: placementParentId });
  if (childCount >= featureFlags.directWidthCap) {
    throw new CustomError('ConflictError', `'${placementParent.fullName}' already has 6 direct members.`);
  }

  // 5. Update the new user's placement details
  newUser.parentId = placementParentId;
  newUser.isSplitSponsor = placementParentId !== sponsorId;
  newUser.placementDeadline = undefined; // Remove deadline as they are now placed
  
  return newUser;
};

/**
 * Gets a list of all users eligible to receive a transfer.
 * @param currentUserId The ID of the user who is sending the funds, to exclude them from the list.
 * @returns A list of users with only their userId and fullName.
 */
export const getTransferRecipients = async (currentUserId: string) => {
  const users = await User.find({ userId: { $ne: currentUserId } })
    .select('userId fullName')
    .sort({ fullName: 1 })
    .lean();
  return users;
};



  