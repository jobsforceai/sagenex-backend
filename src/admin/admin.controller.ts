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
  const { fullName, email, phone, initialInvestmentLocal, currencyCode, sponsorId, dateJoined } = req.body;

  // 1. Validation
  if (!fullName || !email) {
    return res.status(400).json({ message: 'Full name and email are required.' });
  }
  if (initialInvestmentLocal && (typeof initialInvestmentLocal !== 'number' || initialInvestmentLocal < 0)) {
    return res.status(400).json({ message: 'Initial investment must be a positive number.' });
  }
  if (initialInvestmentLocal && !currencyCode) {
    return res.status(400).json({ message: 'Currency code is required if an initial investment is provided.' });
  }
  const emailExists = await User.findOne({ email });
  if (emailExists) {
    return res.status(409).json({ message: 'Email already exists.' });
  }

  // 2. Convert currency if initial investment is provided
  let packageUSD = 0;
  if (initialInvestmentLocal && currencyCode) {
    const rate = await CurrencyRate.findOne({ currencyCode: currencyCode.toUpperCase() });
    if (!rate) {
      return res.status(400).json({ message: `No conversion rate set for currency '${currencyCode}'.` });
    }
    packageUSD = initialInvestmentLocal / rate.rateToUSDT;
  }

  // 3. Resolve Sponsor
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

  // 4. Create User
  try {
    const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 8);
    const newUser = new User({
      fullName,
      email,
      phone,
      packageUSD, // Use the converted amount
      sponsorId: resolvedSponsorId,
      dateJoined: dateJoined ? new Date(dateJoined) : new Date(),
      pvPoints: packageUSD * 0.1,
      referralCode: nanoid(),
    });

    await newUser.save();

    // 5. Send welcome email (fire and forget)
    sendWelcomeEmail(newUser, sponsorId);

    res.status(201).json({ message: 'User onboarded successfully.', user: newUser });
  } catch (error) {
    res.status(500).json({ message: 'Error creating user.', error });
  }
};

/**
 * Gets the referral tree for a specific user.
 */
export const getReferralTree = async (req: Request, res: Response) => {
    const { userId } = req.params;
    const maxDepth = req.query.depth ? parseInt(req.query.depth as string, 10) : 10;

    try {
        const tree = await buildReferralTree(userId, maxDepth);
        if (!tree) {
            return res.status(404).json({ message: `User with ID '${userId}' not found.` });
        }
        res.status(200).json(tree);
    } catch (error: any) {
        console.error(`Error building referral tree for user ${userId}:`, error);
        res.status(500).json({ message: 'Error building referral tree.', error: error.message });
    }
};

/**
 * Gets the monthly payout dashboard data.
 */
export const getMonthlyPayouts = async (req: Request, res: Response) => {
  const { month } = req.query; // Expects format 'YYYY-MM'

  if (!month || typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ message: "Invalid or missing 'month' query parameter. Expected format: YYYY-MM" });
  }

  try {
    const monthDate = new Date(`${month}-01T00:00:00Z`);
    const snapshots = await calculateMonthlyPayouts(monthDate);

    // Optional: Add summary cards
    const totalUsers = snapshots.length;
    const totalPackageVolume = snapshots.reduce((sum, user) => sum + user.packageUSD, 0);
    const totalROIMonth = snapshots.reduce((sum, user) => sum + user.roiPayout, 0);
    const totalDirectBonusMonth = snapshots.reduce((sum, user) => sum + user.directReferralBonus, 0);
    const totalUnilevelMonth = snapshots.reduce((sum, user) => sum + user.unilevelBonus, 0);

    res.status(200).json({
      summary: {
        totalUsers,
        totalPackageVolume,
        totalROIMonth,
        totalDirectBonusMonth,
        totalUnilevelMonth,
      },
      payouts: snapshots,
    });
  } catch (error) {
    console.error('Error fetching monthly payouts:', error);
    res.status(500).json({ message: 'Error fetching monthly payouts.', error });
  }
};

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

    res.status(200).json({
      users,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalUsers / limit),
        totalUsers,
      },
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
    const { userId } = req.params;
    try {
        const user = await adminService.getUserById(userId);
        res.status(200).json(user);
    } catch (error: any) {
        if (error.name === 'NotFoundError') {
            return res.status(404).json({ message: error.message });
        }
        console.error(`Error fetching user ${userId}:`, error);
        res.status(500).json({ message: 'Error fetching user.', error: error.message });
    }
};

/**
 * Deletes a single user by their ID.
 */
export const deleteUser = async (req: Request, res: Response) => {
    const { userId } = req.params;
    const admin = (req as any).user; // Admin user from protectAdmin middleware

    try {
        await adminService.deleteUser(userId, admin.adminId);
        res.status(204).send();
    } catch (error: any) {
        if (error.name === 'NotFoundError') {
            return res.status(404).json({ message: error.message });
        }
        console.error(`Error deleting user ${userId}:`, error);
        res.status(500).json({ message: 'Error deleting user.', error: error.message });
    }
};

/**
 * Assigns a collector to a specific user.
 */
export const assignCollector = async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { collectorId } = req.body;

  if (!collectorId) {
    return res.status(400).json({ message: 'collectorId is required.' });
  }

  try {
    const updatedUser = await adminService.assignCollectorToUser(userId, collectorId);
    res.status(200).json({ message: 'Collector assigned successfully.', user: updatedUser });
  } catch (error: any) {
    if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
      return res.status(400).json({ message: error.message });
    }
    console.error('Error assigning collector:', error);
    res.status(500).json({ message: 'Error assigning collector.', error: error.message });
  }
};

/**
 * Gets a list of deposits, filterable by status.
 */
export const getDeposits = async (req: Request, res: Response) => {
  const status = req.query.status as 'PENDING' | 'VERIFIED' | 'REJECTED' | undefined;
  const finalStatus = status || 'PENDING';
  console.log(`Admin request to fetch deposits with status: ${finalStatus}`);

  try {
    const deposits = await adminService.getDepositsByStatus(finalStatus);
    res.status(200).json(deposits);
  } catch (error: any) {
    console.error('Error fetching deposits:', error);
    res.status(500).json({ message: 'Error fetching deposits.', error: error.message });
  }
};

/**
 * Verifies a deposit and activates the user's package.
 */
export const verifyDeposit = async (req: Request, res: Response) => {
  const { depositId } = req.params;
  const admin = (req as any).user; // Assuming user is attached by an auth middleware

  try {
    const verifiedDeposit = await adminService.verifyDepositAndActivatePackage(depositId, admin.adminId);
    res.status(200).json({ message: 'Deposit verified and package activated successfully.', deposit: verifiedDeposit });
  } catch (error: any) {
    if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
      return res.status(400).json({ message: error.message });
    }
    console.error('Error verifying deposit:', error);
    res.status(500).json({ message: 'Error verifying deposit.', error: error.message });
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
 * Creates a new collector account.
 */
export const createCollector = async (req: Request, res: Response) => {
  try {
    const newCollector = await adminService.createCollector(req.body);
    res.status(201).json({ message: "Collector created successfully.", collector: newCollector });
  } catch (error: any) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    console.error("Error creating collector:", error);
    res.status(500).json({ message: "Error creating collector.", error: error.message });
  }
};

/**
 * Creates a new admin account.
 */
export const createAdmin = async (req: Request, res: Response) => {
  try {
    const newAdmin = await adminService.createAdmin(req.body);
    // Do not send the password back in the response
    (newAdmin as any).password = undefined;
    res.status(201).json({ message: "Admin created successfully.", admin: newAdmin });
  } catch (error: any) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    console.error("Error creating admin:", error);
    res.status(500).json({ message: "Error creating admin.", error: error.message });
  }
};

/**
 * Gets live currency rates for admin reference.
 */
export const getLiveRates = async (req: Request, res: Response) => {
    try {
        const rates = await adminService.getLiveRatesForAdmin(false); // Get from cache
        res.status(200).json(rates);
    } catch (error: any) {
        res.status(500).json({ message: 'Error fetching live rates.', error: error.message });
    }
};

/**
 * Forces a refresh of the live currency rates from the API.
 */
export const refreshLiveRates = async (req: Request, res: Response) => {
    try {
        const rates = await adminService.getLiveRatesForAdmin(true); // Force refresh
        res.status(200).json({ message: "Live rates refreshed successfully.", rates });
    } catch (error: any) {
        res.status(500).json({ message: 'Error refreshing live rates.', error: error.message });
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
        res.status(500).json({ message: 'Error fetching fixed rates.', error: error.message });
    }
};

/**
 * Sets or updates a fixed currency rate.
 */
export const setFixedRate = async (req: Request, res: Response) => {
    const { currencyCode, rate } = req.body;
    const adminId = 'A001'; // Temporary hardcoded admin ID

    if (!currencyCode || !rate) {
        return res.status(400).json({ message: 'currencyCode and rate are required.' });
    }
    if (typeof rate !== 'number' || rate <= 0) {
        return res.status(400).json({ message: 'Rate must be a positive number.' });
    }

    try {
        const newRate = await adminService.setFixedRate(currencyCode, rate, adminId);
        res.status(200).json({ message: 'Rate set successfully.', rate: newRate });
    } catch (error: any) {
        console.error("Error setting fixed rate:", error); // More detailed log
        res.status(500).json({ message: 'Error setting rate.', error: error.message });
    }
};
