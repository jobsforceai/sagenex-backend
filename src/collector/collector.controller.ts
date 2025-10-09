import { Request, Response } from 'express';
import * as collectorService from './collector.service';
import * as userService from '../user/user.service';
import User from '../user/user.model';
import { buildReferralTree } from '../helpers/tree.helper';
import { companyConfig } from '../config/company';

/**
 * Gets a paginated, searchable, and sortable list of all onboarded users.
 */
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const options = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
      search: req.query.search as string,
      sortBy: req.query.sortBy as string,
      sortOrder: req.query.sortOrder as 'asc' | 'desc',
    };

    const { users, pagination } = await userService.getAllUsers(options);

    res.status(200).json({
      users,
      pagination,
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Error fetching users.', error });
  }
};

/**
 * Creates a record of an offline deposit made by a user.
 */
export const createOfflineDeposit = async (req: Request, res: Response) => {
  const collector = (req as any).user;
  const { userId, amountLocal, currencyCode, method, reference, proofUrl } = req.body;

  if (!userId || !amountLocal || !method || !currencyCode) {
    return res.status(400).json({ message: 'userId, amountLocal, currencyCode, and method are required.' });
  }

  try {
    const depositData = {
      userId,
      collectorId: collector.collectorId,
      amountLocal,
      currencyCode,
      method,
      reference,
      proofUrl,
    };
    const newDeposit = await collectorService.recordDeposit(depositData);
    res.status(201).json({ message: 'Offline deposit recorded successfully.', deposit: newDeposit });
  } catch (error: any) {
    if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
        return res.status(400).json({ message: error.message });
    }
    console.error('Error creating offline deposit:', error);
    res.status(500).json({ message: 'Error creating offline deposit.', error: error.message });
  }
};

/**
 * Creates a new user.
 */
export const createUser = async (req: Request, res: Response) => {
    try {
        const newUser = await collectorService.createUser(req.body);
        res.status(201).json({ message: 'User created successfully.', user: newUser });
    } catch (error: any) {
        if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
            return res.status(400).json({ message: error.message });
        }
        if (error.name === 'ConflictError') {
            return res.status(409).json({ message: error.message });
        }
        console.error('Error creating user:', error);
        res.status(500).json({ message: 'Error creating user.', error: error.message });
    }
};

/**
 * Gets the deposit history for a specific user.
 */
export const getUserDepositHistory = async (req: Request, res: Response) => {
    const { userId } = req.params;
    try {
        const deposits = await collectorService.getUserDepositHistory(userId);
        res.status(200).json(deposits);
    } catch (error: any) {
        if (error.name === 'NotFoundError') {
            return res.status(404).json({ message: error.message });
        }
        console.error(`Error fetching deposit history for user ${userId}:`, error);
        res.status(500).json({ message: 'Error fetching deposit history.', error: error.message });
    }
};

/**
 * Gets the direct children for a specific user.
 */
export const getDirectChildren = async (req: Request, res: Response) => {
  try {
    const children = await userService.getDirectChildren(req.params.userId);
    res.status(200).json({ children });
  } catch (error: any) {
    if (error.name === 'NotFoundError') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error fetching direct children.', error });
  }
};

/**
 * Gets the referral tree for a specific user, including their parent.
 */
export const getReferralTree = async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        
        // 1. Build the user's downline tree
        const tree = await buildReferralTree(userId);
        if (!tree) {
            return res.status(404).json({ message: `User with ID '${userId}' not found.` });
        }

        // 2. Find the user's parent
        const user = await User.findOne({ userId }).lean();
        let parent = null;
        if (user && user.parentId) {
            if (user.parentId === companyConfig.sponsorId) {
                parent = {
                    userId: companyConfig.sponsorId,
                    fullName: 'SAGENEX',
                };
            } else {
                parent = await User.findOne({ userId: user.parentId }).select('userId fullName').lean();
            }
        }

        // 3. Send the combined response
        res.status(200).json({ tree, parent });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching referral tree.', error });
    }
};

/**
 * Gets live currency rates for collector reference.
 */
export const getLiveRates = async (req: Request, res: Response) => {
    try {
        const rates = await collectorService.getLiveRates();
        res.status(200).json(rates);
    } catch (error: any) {
        res.status(500).json({ message: 'Error fetching live rates.', error: error.message });
    }
};