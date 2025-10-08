import { Request, Response } from 'express';
import * as collectorService from './collector.service';
import User from '../user/user.model';

/**
 * Gets a paginated and searchable list of all onboarded users.
 */
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;

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

    const users = await User.find(query)
      .sort({ dateJoined: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const totalUsers = await User.countDocuments(query);
    const pagination = {
      currentPage: page,
      totalPages: Math.ceil(totalUsers / limit),
      totalUsers,
    };
    res.status(200).json({
      users,
      pagination,
    });
  } catch (error) {
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
        if (error.name === 'ValidationError') {
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
