import User, { IUser } from '../user/user.model';

// Define the structure of a node in the referral tree
export interface ReferralTreeNode {
  userId: string;
  fullName: string;
  email: string;
  packageUSD: number;
  dateJoined: Date;
  children: ReferralTreeNode[];
}

/**
 * Recursively fetches the children (direct referrals) for a given user ID.
 * @param sponsorId The ID of the user whose children are to be fetched.
 * @param currentDepth The current depth in the tree.
 * @param maxDepth The maximum depth to fetch.
 * @returns A promise that resolves to an array of tree nodes.
 */
const findChildren = async (sponsorId: string, currentDepth: number, maxDepth: number): Promise<ReferralTreeNode[]> => {
  if (currentDepth >= maxDepth) {
    return [];
  }

  // Find all users sponsored by the current user
  const directReferrals = await User.find({ sponsorId }).lean();

  const children: ReferralTreeNode[] = [];

  for (const referral of directReferrals) {
    // Recursively find the children of the current referral
    const grandchildren = await findChildren(referral.userId, currentDepth + 1, maxDepth);
    
    children.push({
      userId: referral.userId,
      fullName: referral.fullName,
      email: referral.email,
      packageUSD: referral.packageUSD,
      dateJoined: referral.dateJoined,
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

  const tree: ReferralTreeNode = {
    userId: rootUser.userId,
    fullName: rootUser.fullName,
    email: rootUser.email,
    packageUSD: rootUser.packageUSD,
    dateJoined: rootUser.dateJoined,
    children: children,
  };

  return tree;
};
