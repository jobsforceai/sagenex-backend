import { Request, Response } from 'express';
import User from '../user/user.model';
import { calculateMonthlyPayouts } from './payout.service';
import * as adminService from './admin.service';
import { customAlphabet } from 'nanoid';
import Collector from '../collector/collector.model';
import { sendWelcomeEmail } from '../email/email.service';
import { buildReferralTree } from '../helpers/tree.helper';
import CurrencyRate from '../rates/currency.model';

/**
 * Onboards a new user. This is an admin-only action.
 */
export const onboardUser = async (req: Request, res: Response) => {
  console.log(`[Admin Controller] ==> Entering onboardUser`);
  const startTime = Date.now();
  const { fullName, email, phone, sponsorId, dateJoined } = req.body;

  // 1. Validation
  if (!fullName || !email) {
    return res.status(400).json({ message: 'Full name and email are required.' });
  }
  const emailExists = await User.findOne({ email });
  if (emailExists) {
    return res.status(409).json({ message: 'Email already exists.' });
  }

  // 2. Resolve Sponsor
  let resolvedSponsorId: string | null = null;
  if (sponsorId) {
    const sponsor = await User.findOne({
      $or: [{ userId: sponsorId }, { referralCode: sponsorId }]
    });
    if (!sponsor) {
      return res.status(404).json({ message: `Sponsor with ID or Referral Code '${sponsorId}' not found.` });
    }
    resolvedSponsorId = sponsor.userId;
  }

  // 3. Create User
  try {
    const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 8);
    const newUser = new User({
      fullName,
      email,
      phone,
      packageUSD: 0, // Package is now 0 by default
      sponsorId: resolvedSponsorId,
      dateJoined: dateJoined ? new Date(dateJoined) : new Date(),
      pvPoints: 0, // PV points are 0 by default
      referralCode: nanoid(),
    });

    await newUser.save();

    // 4. Send welcome email (fire and forget)
    sendWelcomeEmail(newUser, sponsorId);
    console.log(`[Admin Controller] <== Exiting onboardUser. Duration: ${Date.now() - startTime}ms`);
    res.status(201).json({ message: 'User onboarded successfully.', user: newUser });
  } catch (error) {
    console.error(`[Admin Controller] Error in onboardUser. Duration: ${Date.now() - startTime}ms`, error);
    res.status(500).json({ message: 'Error creating user.', error });
  }
};

/**
 * Gets the referral tree for a specific user.
 */
export const getReferralTree = async (req: Request, res: Response) => {
    console.log(`[Admin Controller] ==> Entering getReferralTree for userId: ${req.params.userId}`);
    const startTime = Date.now();
    // Logic remains the same
    try {
        const { userId } = req.params;
        const tree = await buildReferralTree(userId);
        if (!tree) {
            return res.status(404).json({ message: `User with ID '${userId}' not found.` });
        }
        console.log(`[Admin Controller] <== Exiting getReferralTree. Duration: ${Date.now() - startTime}ms`);
        res.status(200).json(tree);
    } catch (error) {
        console.error(`[Admin Controller] Error in getReferralTree. Duration: ${Date.now() - startTime}ms`, error);
        res.status(500).json({ message: 'Error fetching referral tree.', error });
    }
};

/**
 * Gets the monthly payout dashboard data.
 */
export const getMonthlyPayouts = async (req: Request, res: Response) => {
    console.log(`[Admin Controller] ==> Entering getMonthlyPayouts`);
    const startTime = Date.now();
    try {
        const month = req.query.month ? new Date(req.query.month as string) : new Date();
        const payouts = await calculateMonthlyPayouts(month);
        console.log(`[Admin Controller] <== Exiting getMonthlyPayouts. Duration: ${Date.now() - startTime}ms`);
        res.status(200).json(payouts);
    } catch (error) {
        console.error(`[Admin Controller] Error in getMonthlyPayouts. Duration: ${Date.now() - startTime}ms`, error);
        res.status(500).json({ message: 'Error calculating monthly payouts.', error });
    }
};

/**
 * Gets a paginated and searchable list of all onboarded users.
 */
export const getAllUsers = async (req: Request, res: Response) => {
  console.log(`[Admin Controller] ==> Entering getAllUsers`);
  const startTime = Date.now();
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

    // --- DEBUG LOGGING ---
    console.log('--- Sending data from getAllUsers ---');
    console.log('Users Count:', users.length);
    console.log('Pagination:', JSON.stringify(pagination, null, 2));
    console.log('------------------------------------');
    // --- END DEBUG LOGGING ---
    console.log(`[Admin Controller] <== Exiting getAllUsers. Duration: ${Date.now() - startTime}ms`);
    res.status(200).json({
      users,
      pagination,
    });
  } catch (error) {
    console.error(`[Admin Controller] Error in getAllUsers. Duration: ${Date.now() - startTime}ms`, error);
    res.status(500).json({ message: 'Error fetching users.', error });
  }
};

/**
 * Gets a single user by their ID.
 */
export const getUser = async (req: Request, res: Response) => {
    console.log(`[Admin Controller] ==> Entering getUser for userId: ${req.params.userId}`);
    const startTime = Date.now();
    try {
        const user = await adminService.getUserById(req.params.userId);
        console.log(`[Admin Controller] <== Exiting getUser. Duration: ${Date.now() - startTime}ms`);
        res.status(200).json(user);
    } catch (error: any) {
        if (error.name === 'NotFoundError') {
            return res.status(404).json({ message: error.message });
        }
        console.error(`[Admin Controller] Error in getUser. Duration: ${Date.now() - startTime}ms`, error);
        res.status(500).json({ message: 'Error fetching user.', error });
    }
};

/**
 * Deletes a single user by their ID.
 */
export const deleteUser = async (req: Request, res: Response) => {
    console.log(`[Admin Controller] ==> Entering deleteUser for userId: ${req.params.userId}`);
    const startTime = Date.now();
    const admin = (req as any).user;
    try {
        await adminService.deleteUser(req.params.userId, admin.adminId);
        console.log(`[Admin Controller] <== Exiting deleteUser. Duration: ${Date.now() - startTime}ms`);
        res.status(204).send();
    } catch (error: any) {
        if (error.name === 'NotFoundError') {
            return res.status(404).json({ message: error.message });
        }
        console.error(`[Admin Controller] Error in deleteUser. Duration: ${Date.now() - startTime}ms`, error);
        res.status(500).json({ message: 'Error deleting user.', error });
    }
};

/**
 * Gets a list of deposits, filterable by status.
 */
export const getDeposits = async (req: Request, res: Response) => {
    console.log(`[Admin Controller] ==> Entering getDeposits`);
    const startTime = Date.now();
    try {
        const status = (req.query.status as string)?.toUpperCase() || 'PENDING';
        if (!['PENDING', 'VERIFIED', 'REJECTED'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status query parameter.' });
        }
        const deposits = await adminService.getDepositsByStatus(status as any);
        console.log(`[Admin Controller] <== Exiting getDeposits. Duration: ${Date.now() - startTime}ms`);
        res.status(200).json(deposits);
    } catch (error) {
        console.error(`[Admin Controller] Error in getDeposits. Duration: ${Date.now() - startTime}ms`, error);
        res.status(500).json({ message: 'Error fetching deposits.', error });
    }
};

/**
 * Verifies a deposit and activates the user's package.
 */
export const verifyDeposit = async (req: Request, res: Response) => {
    console.log(`[Admin Controller] ==> Entering verifyDeposit for depositId: ${req.params.depositId}`);
    const startTime = Date.now();
    const admin = (req as any).user;
    try {
        const deposit = await adminService.verifyDepositAndActivatePackage(req.params.depositId, admin.adminId);
        console.log(`[Admin Controller] <== Exiting verifyDeposit. Duration: ${Date.now() - startTime}ms`);
        res.status(200).json({ message: 'Deposit verified successfully.', deposit });
    } catch (error: any) {
        if (error.name === 'NotFoundError' || error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        console.error(`[Admin Controller] Error in verifyDeposit. Duration: ${Date.now() - startTime}ms`, error);
        res.status(500).json({ message: 'Error verifying deposit.', error });
    }
};

/**
 * Gets a list of all collectors.
 */
export const getCollectors = async (req: Request, res: Response) => {
  console.log(`[Admin Controller] ==> Entering getCollectors`);
  const startTime = Date.now();
  try {
    const collectors = await Collector.find().lean();
    console.log(`[Admin Controller] <== Exiting getCollectors. Duration: ${Date.now() - startTime}ms`);
    res.status(200).json(collectors);
  } catch (error: any) {
    console.error(`[Admin Controller] Error in getCollectors. Duration: ${Date.now() - startTime}ms`, error);
    res.status(500).json({ message: "Error fetching collectors.", error: error.message });
  }
};

/**
 * Gets the deposit history for a specific collector.
 */
export const getCollectorDeposits = async (req: Request, res: Response) => {
    console.log(`[Admin Controller] ==> Entering getCollectorDeposits for collectorId: ${req.params.collectorId}`);
    const startTime = Date.now();
    const { collectorId } = req.params;
    try {
        const deposits = await adminService.getDepositsByCollector(collectorId);
        console.log(`[Admin Controller] <== Exiting getCollectorDeposits. Duration: ${Date.now() - startTime}ms`);
        res.status(200).json(deposits);
    } catch (error: any) {
        if (error.name === 'NotFoundError') {
            return res.status(404).json({ message: error.message });
        }
        console.error(`[Admin Controller] Error in getCollectorDeposits. Duration: ${Date.now() - startTime}ms`, error);
        res.status(500).json({ message: 'Error fetching deposits.', error: error.message });
    }
};

/**
 * Creates a new collector account.
 */
export const createCollector = async (req: Request, res: Response) => {
    console.log(`[Admin Controller] ==> Entering createCollector`);
    const startTime = Date.now();
    try {
        const collector = await adminService.createCollector(req.body);
        console.log(`[Admin Controller] <== Exiting createCollector. Duration: ${Date.now() - startTime}ms`);
        res.status(201).json({ message: 'Collector created successfully.', collector });
    } catch (error: any) {
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        console.error(`[Admin Controller] Error in createCollector. Duration: ${Date.now() - startTime}ms`, error);
        res.status(500).json({ message: 'Error creating collector.', error });
    }
};

/**
 * Creates a new admin account.
 */
export const createAdmin = async (req: Request, res: Response) => {
    console.log(`[Admin Controller] ==> Entering createAdmin`);
    const startTime = Date.now();
    try {
        const admin = await adminService.createAdmin(req.body);
        console.log(`[Admin Controller] <== Exiting createAdmin. Duration: ${Date.now() - startTime}ms`);
        res.status(201).json({ message: 'Admin created successfully.', admin });
    } catch (error: any) {
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        console.error(`[Admin Controller] Error in createAdmin. Duration: ${Date.now() - startTime}ms`, error);
        res.status(500).json({ message: 'Error creating admin.', error });
    }
};

/**
 * Gets live currency rates for admin reference.
 */
export const getLiveRates = async (req: Request, res: Response) => {
    console.log(`[Admin Controller] ==> Entering getLiveRates`);
    const startTime = Date.now();
    try {
        const rates = await adminService.getLiveRatesForAdmin();
        console.log(`[Admin Controller] <== Exiting getLiveRates. Duration: ${Date.now() - startTime}ms`);
        res.status(200).json(rates);
    } catch (error: any) {
        console.error(`[Admin Controller] Error in getLiveRates. Duration: ${Date.now() - startTime}ms`, error);
        res.status(500).json({ message: 'Error fetching live rates.', error });
    }
};

/**
 * Forces a refresh of the live currency rates from the API.
 */
export const refreshLiveRates = async (req: Request, res: Response) => {
    console.log(`[Admin Controller] ==> Entering refreshLiveRates`);
    const startTime = Date.now();
    try {
        const rates = await adminService.getLiveRatesForAdmin(true); // force refresh
        console.log(`[Admin Controller] <== Exiting refreshLiveRates. Duration: ${Date.now() - startTime}ms`);
        res.status(200).json({ message: 'Live rates refreshed successfully.', rates });
    } catch (error: any) {
        console.error(`[Admin Controller] Error in refreshLiveRates. Duration: ${Date.now() - startTime}ms`, error);
        res.status(500).json({ message: 'Error refreshing live rates.', error });
    }
};

/**
 * Gets all fixed rates set by admins.
 */
export const getFixedRates = async (req: Request, res: Response) => {
    console.log(`[Admin Controller] ==> Entering getFixedRates`);
    const startTime = Date.now();
    try {
        const rates = await adminService.getFixedRates();
        console.log(`[Admin Controller] <== Exiting getFixedRates. Duration: ${Date.now() - startTime}ms`);
        res.status(200).json(rates);
    } catch (error: any) {
        console.error(`[Admin Controller] Error in getFixedRates. Duration: ${Date.now() - startTime}ms`, error);
        res.status(500).json({ message: 'Error fetching fixed rates.', error });
    }
};

/**
 * Sets or updates a fixed currency rate.
 */
export const setFixedRate = async (req: Request, res: Response) => {
    console.log(`[Admin Controller] ==> Entering setFixedRate`);
    const startTime = Date.now();
    const admin = (req as any).user;
    const { currencyCode, rateToUSDT } = req.body;

    if (!currencyCode || !rateToUSDT) {
        return res.status(400).json({ message: 'currencyCode and rateToUSDT are required.' });
    }

    try {
        const rate = await adminService.setFixedRate(currencyCode, rateToUSDT, admin.adminId);
        console.log(`[Admin Controller] <== Exiting setFixedRate. Duration: ${Date.now() - startTime}ms`);
        res.status(200).json({ message: 'Fixed rate set successfully.', rate });
    } catch (error: any) {
        console.error(`[Admin Controller] Error in setFixedRate. Duration: ${Date.now() - startTime}ms`, error);
        res.status(500).json({ message: 'Error setting fixed rate.', error });
    }
};
