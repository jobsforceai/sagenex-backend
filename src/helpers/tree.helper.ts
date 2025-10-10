import User, { IUser } from '../user/user.model';

// Define the structure of a node in the referral tree
export interface ReferralTreeNode {
  userId: string;
  fullName: string;
  email: string;
  packageUSD: number;
  dateJoined: Date;
  isSplitSponsor: boolean;
  originalSponsorId: string | null;
  activityStatus: 'Active' | 'Inactive';
  children: ReferralTreeNode[];
}

/**
 * Recursively fetches the children (direct placements) for a given user ID.
 * @param parentId The ID of the user whose children are to be fetched.
 * @param currentDepth The current depth in the tree.
 * @param maxDepth The maximum depth to fetch.
 * @returns A promise that resolves to an array of tree nodes.
 */
const findChildren = async (parentId: string, currentDepth: number, maxDepth: number): Promise<ReferralTreeNode[]> => {
  if (currentDepth >= maxDepth) {
    return [];
  }

  // Find all users placed directly under the current user
  const directChildren = await User.find({ parentId }).lean();

  const children: ReferralTreeNode[] = [];

  for (const child of directChildren) {
    // Recursively find the children of the current child
    const grandchildren = await findChildren(child.userId, currentDepth + 1, maxDepth);
    
    // Check activity status by counting their direct children
    const childCount = await User.countDocuments({ parentId: child.userId });
    const isActive = childCount >= 6;

    children.push({
      userId: child.userId,
      fullName: child.fullName,
      email: child.email,
      packageUSD: child.packageUSD,
      dateJoined: child.dateJoined,
      isSplitSponsor: child.isSplitSponsor,
      originalSponsorId: child.originalSponsorId,
      activityStatus: isActive ? 'Active' : 'Inactive',
      children: grandchildren,
    });
  }

  return children;
};

/**
 * Builds the entire referral tree (downline) for a given starting user.
 * @param startUserId The ID of the user at the root of the tree.
 * @param maxDepth The maximum depth to retrieve. Defaults to 10.
 * @returns A promise that resolves to the complete referral tree node or null if the user is not found.
 */
export const buildReferralTree = async (startUserId: string, maxDepth: number = 10): Promise<ReferralTreeNode | null> => {
  const rootUser = await User.findOne({ userId: startUserId }).lean();

  if (!rootUser) {
    return null;
  }

  // Start the recursive process to find all children
  const children = await findChildren(rootUser.userId, 0, maxDepth);

  // Calculate activity status for the root user
  const rootChildCount = await User.countDocuments({ parentId: rootUser.userId });
  const isRootActive = rootChildCount >= 6;

  const tree: ReferralTreeNode = {
    userId: rootUser.userId,
    fullName: rootUser.fullName,
    email: rootUser.email,
    packageUSD: rootUser.packageUSD,
    dateJoined: rootUser.dateJoined,
    isSplitSponsor: rootUser.isSplitSponsor,
    originalSponsorId: rootUser.originalSponsorId,
    activityStatus: isRootActive ? 'Active' : 'Inactive',
    children: children,
  };

  return tree;
};
