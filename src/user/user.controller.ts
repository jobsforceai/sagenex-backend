import { Request, Response } from 'express';
import * as userService from './user.service';

/**
 * Gets the dashboard data for the logged-in user.
 */
export const getDashboard = async (req: Request, res: Response) => {
  const user = (req as any).user;

  try {
    const dashboardData = await userService.getDashboardData(user.userId);
    res.status(200).json(dashboardData);
  } catch (error: any) {
    if (error.name === 'NotFoundError') {
      return res.status(404).json({ message: error.message });
    }
    console.error(`Error fetching dashboard for user ${user.userId}:`, error);
    res.status(500).json({ message: 'Error fetching dashboard data.', error: error.message });
  }
};

/**
 * Gets the wallet transaction history for the logged-in user.
 */
export const getWalletHistory = async (req: Request, res: Response) => {
  const user = (req as any).user;

  try {
    const history = await userService.getWalletHistory(user.userId);
    res.status(200).json(history);
  } catch (error: any) {
    console.error(`Error fetching wallet history for user ${user.userId}:`, error);
    res.status(500).json({ message: 'Error fetching wallet history.', error: error.message });
  }
};

/**
 * Gets the referral tree for the logged-in user.
 */
export const getReferralTree = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const maxDepth = req.query.depth ? parseInt(req.query.depth as string, 10) : 6; // Default to 6 levels

  try {
    const { tree, parent } = await userService.getReferralTree(user.userId, maxDepth);
    res.status(200).json({ tree, parent });
  } catch (error: any) {
    if (error.name === 'NotFoundError') {
      return res.status(404).json({ message: error.message });
    }
    console.error(`Error fetching referral tree for user ${user.userId}:`, error);
        res.status(500).json({ message: 'Error building referral tree.', error: error.message });
      }
    };

/**
 * Gets a summary of direct referrals for the logged-in user.
 */
export const getReferralSummary = async (req: Request, res: Response) => {
  const user = (req as any).user;

  try {
    const summary = await userService.getReferralSummary(user.userId);
    res.status(200).json(summary);
  } catch (error: any) {
    console.error(`Error fetching referral summary for user ${user.userId}:`, error);
    res.status(500).json({ message: 'Error fetching referral summary.', error: error.message });
  }
};

/**
 * Gets the rank and progress details for the logged-in user.
 */
export const getRankAndProgress = async (req: Request, res: Response) => {
  const user = (req as any).user;

  try {
    const rankData = await userService.getRankAndProgress(user.userId);
    res.status(200).json(rankData);
  } catch (error: any) {
    console.error(`Error fetching rank and progress for user ${user.userId}:`, error);
    res.status(500).json({ message: 'Error fetching rank and progress data.', error: error.message });
  }
};

/**
 * Gets the financial summary for the logged-in user.
 */
export const getFinancialSummary = async (req: Request, res: Response) => {
  const user = (req as any).user;

  try {
    const summary = await userService.getFinancialSummary(user.userId);
    res.status(200).json(summary);
  } catch (error: any) {
    if (error.name === 'NotFoundError') {
      return res.status(404).json({ message: error.message });
    }
    console.error(`Error fetching financial summary for user ${user.userId}:`, error);
    res.status(500).json({ message: 'Error fetching financial summary.', error: error.message });
  }
};

/**
 * Gets the leaderboard data.
 */
export const getLeaderboard = async (req: Request, res: Response) => {
  const user = (req as any).user;

  try {
    const leaderboardData = await userService.getLeaderboard(user.userId);
    res.status(200).json(leaderboardData);
  } catch (error: any) {
    if (error.name === 'NotFoundError') {
      return res.status(404).json({ message: error.message });
    }
    console.error(`Error fetching leaderboard for user ${user.userId}:`, error);
    res.status(500).json({ message: 'Error fetching leaderboard data.', error: error.message });
  }
};
    
    /**
     * Gets the profile for the logged-in user.
     */
    export const getProfile = async (req: Request, res: Response) => {
      const user = (req as any).user;
    
      try {
        const profileData = await userService.getUserProfile(user.userId);
        res.status(200).json(profileData);
      } catch (error: any) {
        if (error.name === 'NotFoundError') {
          return res.status(404).json({ message: error.message });
        }
        console.error(`Error fetching profile for user ${user.userId}:`, error);
        res.status(500).json({ message: 'Error fetching profile data.', error: error.message });
      }
    };

/**
 * Updates the profile for the logged-in user.
 */
export const updateProfile = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { fullName, phone, usdtTrc20Address } = req.body;

  try {
    const updatedUser = await userService.updateUserProfile(user.userId, { fullName, phone, usdtTrc20Address });
    res.status(200).json({ message: 'Profile updated successfully.', user: updatedUser });
  } catch (error: any) {
    if (error.name === 'NotFoundError') {
      return res.status(404).json({ message: error.message });
    }
    console.error(`Error updating profile for user ${user.userId}:`, error);
    res.status(500).json({ message: 'Error updating profile.', error: error.message });
  }
};

/**
 * Gets a list of users eligible to receive a fund transfer.
 */
export const getTransferRecipients = async (req: Request, res: Response) => {
  const user = (req as any).user;
  try {
    const recipients = await userService.getTransferRecipients(user.userId);
    res.status(200).json(recipients);
  } catch (error: any) {
    console.error(`Error fetching transfer recipients for user ${user.userId}:`, error);
    res.status(500).json({ message: 'Error fetching transfer recipients.', error: error.message });
  }
};
    