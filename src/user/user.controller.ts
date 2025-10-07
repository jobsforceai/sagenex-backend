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
    const tree = await userService.getReferralTree(user.userId, maxDepth);
    res.status(200).json(tree);
  } catch (error: any) {
    if (error.name === 'NotFoundError') {
      return res.status(404).json({ message: error.message });
    }
    console.error(`Error fetching referral tree for user ${user.userId}:`, error);
    res.status(500).json({ message: 'Error building referral tree.', error: error.message });
  }
};