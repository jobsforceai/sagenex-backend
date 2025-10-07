import { Request, Response } from 'express';
import * as collectorService from './collector.service';

/**
 * Creates a record of an offline deposit made by a user.
 * This is a Collector-only action.
 */
export const createOfflineDeposit = async (req: Request, res: Response) => {
  const collector = (req as any).user;
  const { userId, amountLocal, currencyCode, method, reference, proofUrl } = req.body;

  // 1. Validation
  if (!userId || !amountLocal || !method || !currencyCode) {
    return res.status(400).json({ message: 'userId, amountLocal, currencyCode, and method are required.' });
  }
  if (typeof amountLocal !== 'number' || amountLocal <= 0) {
    return res.status(400).json({ message: 'amountLocal must be a positive number.' });
  }
  const validMethods = ['CASH', 'UPI', 'BANK_TRANSFER'];
  if (!validMethods.includes(method)) {
    return res.status(400).json({ message: `Method must be one of: ${validMethods.join(', ')}` });
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
    // Check for specific error types from the service
    if (error.name === 'ValidationError') {
        return res.status(400).json({ message: error.message });
    }
    if (error.name === 'AuthorizationError') {
        return res.status(403).json({ message: error.message });
    }
    if (error.name === 'NotFoundError') {
        return res.status(404).json({ message: error.message });
    }
    
    console.error('Error creating offline deposit:', error);
    res.status(500).json({ message: 'Error creating offline deposit.', error: error.message });
  }
};

/**
 * Gets a list of all users assigned to the logged-in collector.
 */
export const getAssignedUsers = async (req: Request, res: Response) => {
  const collector = (req as any).user;

  try {
    const users = await collectorService.getAssignedUsers(collector.collectorId);
    res.status(200).json(users);
  } catch (error: any) {
    console.error('Error fetching assigned users:', error);
    res.status(500).json({ message: 'Error fetching assigned users.', error: error.message });
  }
};

/**
 * Creates a new user, similar to the admin onboarding process.
 * This is a Collector-only action.
 */
export const createUser = async (req: Request, res: Response) => {
    const collector = (req as any).user;
    try {
        const newUser = await collectorService.createUser(req.body, collector.collectorId);
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
 * Gets a list of all users that are not assigned to any collector.
 */
export const getUnassignedUsers = async (req: Request, res: Response) => {
    try {
        const users = await collectorService.getUnassignedUsers();
        res.status(200).json(users);
    } catch (error: any) {
        console.error('Error fetching unassigned users:', error);
        res.status(500).json({ message: 'Error fetching unassigned users.', error: error.message });
    }
};

/**
 * Allows a collector to assign a user to themselves.
 * The user must not already have a collector assigned.
 */
export const assignUserToSelf = async (req: Request, res: Response) => {
    const collector = (req as any).user;
    const { userId } = req.params;

    try {
        const updatedUser = await collectorService.assignUserToCollector(userId, collector.collectorId);
        res.status(200).json({ message: `User ${userId} assigned successfully.`, user: updatedUser });
    } catch (error: any) {
        if (error.name === 'ValidationError' || error.name === 'NotFoundError' || error.name === 'ConflictError') {
            return res.status(400).json({ message: error.message });
        }
        console.error(`Error assigning user ${userId}:`, error);
        res.status(500).json({ message: 'Error assigning user.', error: error.message });
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

