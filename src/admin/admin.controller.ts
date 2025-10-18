import { Request, Response } from 'express';
import User from '../user/user.model';
import { calculateMonthlyPayouts } from './payout.service';
import * as adminService from './admin.service';
import * as userService from '../user/user.service';
import { customAlphabet } from 'nanoid';
import Collector from '../collector/collector.model';
import { sendWelcomeEmail } from '../email/email.service';
import { buildReferralTree } from '../helpers/tree.helper';
import CurrencyRate from '../rates/currency.model';
import { companyConfig } from '../config/company';

/**
 * Onboards a new user. This is an admin-only action.
 */
export const onboardUser = async (req: Request, res: Response) => {
  try {
    const newUser = await adminService.onboardUser(req.body);
    res.status(201).json({ message: 'User onboarded successfully.', user: newUser });
  } catch (error: any) {
    if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
      return res.status(400).json({ message: error.message });
    }
    if (error.name === 'ConflictError') {
      return res.status(409).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error creating user.', error });
  }
};

/**
 * Gets the referral tree for a specific user, including their parent.
 */
export const getReferralTree = async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        
        // 1. Find the user to get their parent info
        const user = await User.findOne({ userId }).lean();
        if (!user) {
            return res.status(404).json({ message: `User with ID '${userId}' not found.` });
        }

        // 2. Build the user's downline tree
        const tree = await buildReferralTree(userId);
        if (!tree) {
            // This case is redundant due to the check above, but good for safety
            return res.status(404).json({ message: `User with ID '${userId}' not found.` });
        }

        // 3. Get parent info using the reusable service
        const parent = await userService.getParentInfo(user);

        // 4. Send the combined response
        res.status(200).json({ tree, parent });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching referral tree.', error });
    }
};

/**
 * Gets the monthly payout dashboard data.
 */
export const getMonthlyPayouts = async (req: Request, res: Response) => {
    try {
        const month = req.query.month ? new Date(req.query.month as string) : new Date();
        const payouts = await calculateMonthlyPayouts(month);
        res.status(200).json(payouts);
    } catch (error) {
        res.status(500).json({ message: 'Error calculating monthly payouts.', error });
    }
};

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
 * Gets a single user by their ID.
 */
export const getUser = async (req: Request, res: Response) => {
    try {
        const user = await adminService.getUserById(req.params.userId);
        res.status(200).json(user);
    } catch (error: any) {
        if (error.name === 'NotFoundError') {
            return res.status(404).json({ message: error.message });
        }
        res.status(500).json({ message: 'Error fetching user.', error });
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
 * Updates a single user's details.
 */
export const updateUser = async (req: Request, res: Response) => {
  try {
    const updatedUser = await userService.updateUser(req.params.userId, req.body);
    res.status(200).json({ message: 'User updated successfully.', user: updatedUser });
  } catch (error: any) {
    if (error.name === 'NotFoundError') {
      return res.status(404).json({ message: error.message });
    }
    if (error.name === 'ConflictError' || error.name === 'ValidationError') {
      return res.status(409).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error updating user.', error });
  }
};

/**
 * Assigns a user directly to the company root.
 */
export const assignUserToRoot = async (req: Request, res: Response) => {
  try {
    const updatedUser = await adminService.assignUserToRoot(req.params.userId);
    res.status(200).json({ message: 'User successfully assigned to root.', user: updatedUser });
  } catch (error: any) {
    if (error.name === 'NotFoundError') {
      return res.status(404).json({ message: error.message });
    }
    if (error.name === 'ConflictError') {
      return res.status(409).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error assigning user to root.', error });
  }
};

/**
 * Deletes a single user by their ID.
 */
export const deleteUser = async (req: Request, res: Response) => {
    const admin = (req as any).user;
    try {
        await adminService.deleteUser(req.params.userId, admin.adminId);
        res.status(204).send();
    } catch (error: any) {
        if (error.name === 'NotFoundError') {
            return res.status(404).json({ message: error.message });
        }
        res.status(500).json({ message: 'Error deleting user.', error });
    }
};

/**
 * Gets a list of all deleted users.
 */
export const getDeletedUsers = async (req: Request, res: Response) => {
    try {
        const deletedUsers = await adminService.getDeletedUsers();
        res.status(200).json(deletedUsers);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching deleted users.', error });
    }
};

/**
 * Gets a list of deposits, filterable by status.
 */
export const getDeposits = async (req: Request, res: Response) => {
    try {
        const status = (req.query.status as string)?.toUpperCase() || 'PENDING';
        if (!['PENDING', 'VERIFIED', 'REJECTED'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status query parameter.' });
        }
        const deposits = await adminService.getDepositsByStatus(status as any);
        res.status(200).json(deposits);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching deposits.', error });
    }
};

/**
 * Verifies a deposit and activates the user's package.
 */
export const verifyDeposit = async (req: Request, res: Response) => {
    const admin = (req as any).user;
    try {
        const deposit = await adminService.verifyDepositAndActivatePackage(req.params.depositId, admin.adminId);
        res.status(200).json({ message: 'Deposit verified successfully.', deposit });
    } catch (error: any) {
        if (error.name === 'NotFoundError' || error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: 'Error verifying deposit.', error });
    }
};

/**
 * Gets a list of all collectors.
 */
export const getCollectors = async (req: Request, res: Response) => {
  try {
    const collectors = await Collector.find().lean();
    res.status(200).json(collectors);
  } catch (error: any) {
    console.error("Error fetching collectors:", error);
    res.status(500).json({ message: "Error fetching collectors.", error: error.message });
  }
};

/**
 * Gets the deposit history for a specific collector.
 */
export const getCollectorDeposits = async (req: Request, res: Response) => {
    const { collectorId } = req.params;
    try {
        const deposits = await adminService.getDepositsByCollector(collectorId);
        res.status(200).json(deposits);
    } catch (error: any) {
        if (error.name === 'NotFoundError') {
            return res.status(404).json({ message: error.message });
        }
        console.error(`Error fetching deposits for collector ${collectorId}:`, error);
        res.status(500).json({ message: 'Error fetching deposits.', error: error.message });
    }
};

/**
 * Creates a new collector account.
 */
export const createCollector = async (req: Request, res: Response) => {
    try {
        const collector = await adminService.createCollector(req.body);
        res.status(201).json({ message: 'Collector created successfully.', collector });
    } catch (error: any) {
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: 'Error creating collector.', error });
    }
};

/**
 * Creates a new admin account.
 */
export const createAdmin = async (req: Request, res: Response) => {
    try {
        const admin = await adminService.createAdmin(req.body);
        res.status(201).json({ message: 'Admin created successfully.', admin });
    } catch (error: any) {
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: 'Error creating admin.', error });
    }
};

/**
 * Gets live currency rates for admin reference.
 */
export const getLiveRates = async (req: Request, res: Response) => {
    try {
        const rates = await adminService.getLiveRatesForAdmin();
        res.status(200).json(rates);
    } catch (error: any) {
        res.status(500).json({ message: 'Error fetching live rates.', error });
    }
};

/**
 * Forces a refresh of the live currency rates from the API and updates fixed rates.
 */
export const refreshLiveRates = async (req: Request, res: Response) => {
    try {
        const rates = await adminService.refreshLiveRatesAndUpdateFixed();
        res.status(200).json({ message: 'Live and fixed rates refreshed successfully.', rates });
    } catch (error: any) {
        res.status(500).json({ message: 'Error refreshing rates.', error });
    }
};

/**
 * Gets all fixed rates set by admins.
 */
export const getFixedRates = async (req: Request, res: Response) => {
    try {
        const rates = await adminService.getFixedRates();
        res.status(200).json(rates);
    } catch (error: any) {
        res.status(500).json({ message: 'Error fetching fixed rates.', error });
    }
};

/**
 * Sets or updates a fixed currency rate.
 */
export const setFixedRate = async (req: Request, res: Response) => {
    const admin = (req as any).user;
    const { currencyCode, rateToUSDT } = req.body;

    if (!currencyCode || !rateToUSDT) {
        return res.status(400).json({ message: 'currencyCode and rateToUSDT are required.' });
    }

    try {
        const rate = await adminService.setFixedRate(currencyCode, rateToUSDT, admin.adminId);
        res.status(200).json({ message: 'Fixed rate set successfully.', rate });
    } catch (error: any) {
        res.status(500).json({ message: 'Error setting fixed rate.', error });
    }
};

// --- KYC Management ---

/**
 * Gets a list of KYC submissions, filterable by status.
 */
export const getKycSubmissions = async (req: Request, res: Response) => {
    try {
        const status = (req.query.status as string)?.toUpperCase() || 'PENDING';
        if (!['PENDING', 'VERIFIED', 'REJECTED', 'NOT_SUBMITTED'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status query parameter.' });
        }
        const submissions = await adminService.getKycSubmissions(status as any);
        res.status(200).json(submissions);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching KYC submissions.', error });
    }
};

/**
 * Verifies a KYC submission.
 */
export const verifyKyc = async (req: Request, res: Response) => {
    const admin = (req as any).user;
    try {
        const kyc = await adminService.verifyKyc(req.params.kycId, admin.adminId);
        res.status(200).json({ message: 'KYC verified successfully.', kyc });
    } catch (error: any) {
        if (error.name === 'NotFoundError' || error.name === 'ConflictError') {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: 'Error verifying KYC.', error });
    }
};

/**
 * Rejects a KYC submission.
 */
export const rejectKyc = async (req: Request, res: Response) => {
    const admin = (req as any).user;
    const { reason } = req.body;

    if (!reason) {
        return res.status(400).json({ message: 'Rejection reason is required.' });
    }

    try {
        const kyc = await adminService.rejectKyc(req.params.kycId, admin.adminId, reason);
        res.status(200).json({ message: 'KYC rejected successfully.', kyc });
    } catch (error: any) {
        if (error.name === 'NotFoundError' || error.name === 'ConflictError' || error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: 'Error rejecting KYC.', error });
    }
};

// --- Withdrawal Management ---

/**
 * Gets a list of withdrawal requests, filterable by status.
 */
export const getWithdrawalRequests = async (req: Request, res: Response) => {
    try {
        const status = (req.query.status as string)?.toUpperCase() || 'PENDING';
        if (!['PENDING', 'PAID', 'REJECTED'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status query parameter.' });
        }
        const requests = await adminService.getWithdrawalRequests(status as any);
        res.status(200).json(requests);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching withdrawal requests.', error });
    }
};

/**
 * Approves a withdrawal request.
 */
export const approveWithdrawal = async (req: Request, res: Response) => {
    const admin = (req as any).user;
    try {
        const withdrawal = await adminService.approveWithdrawal(req.params.withdrawalId, admin.adminId);
        res.status(200).json({ message: 'Withdrawal approved successfully.', withdrawal });
    } catch (error: any) {
        if (error.name === 'NotFoundError' || error.name === 'ConflictError') {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: 'Error approving withdrawal.', error });
    }
};

/**
 * Rejects a withdrawal request.
 */
export const rejectWithdrawal = async (req: Request, res: Response) => {
    const admin = (req as any).user;
    const { reason } = req.body;

    if (!reason) {
        return res.status(400).json({ message: 'Rejection reason is required.' });
    }

    try {
        const withdrawal = await adminService.rejectWithdrawal(req.params.withdrawalId, admin.adminId, reason);
        res.status(200).json({ message: 'Withdrawal rejected successfully.', withdrawal });
    } catch (error: any) {
        if (error.name === 'NotFoundError' || error.name === 'ConflictError' || error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: 'Error rejecting withdrawal.', error });
    }
};