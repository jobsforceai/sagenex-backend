import { Request, Response } from 'express';
import User from '../user/user.model';
import { calculateMonthlyPayouts } from './payout.service';
import { customAlphabet } from 'nanoid';

/**
 * Onboards a new user. This is an admin-only action.
 */
export const onboardUser = async (req: Request, res: Response) => {
  const { fullName, email, phone, packageUSD, sponsorId, dateJoined } = req.body;

  // 1. Validation
  if (!fullName || !email || !packageUSD) {
    return res.status(400).json({ message: 'Full name, email, and packageUSD are required.' });
  }
  if (typeof packageUSD !== 'number' || packageUSD < 0) {
    return res.status(400).json({ message: 'PackageUSD must be a positive number.' });
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
    resolvedSponsorId = sponsor.userId; // Correctly use the sponsor's actual userId
  }

  // 3. Create User
  try {
    const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 8);
    const newUser = new User({
      fullName,
      email,
      phone,
      packageUSD,
      sponsorId: resolvedSponsorId, // Assign the resolved sponsor's userId
      dateJoined: dateJoined ? new Date(dateJoined) : new Date(),
      pvPoints: packageUSD * 0.1,
      referralCode: nanoid(),
    });

    await newUser.save();
    res.status(201).json({ message: 'User onboarded successfully.', user: newUser });
  } catch (error) {
    res.status(500).json({ message: 'Error creating user.', error });
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

    const query = {};
    if (search) {
      const searchRegex = new RegExp(search, 'i'); // Case-insensitive search
      Object.assign(query, {
        $or: [
          { fullName: searchRegex },
          { email: searchRegex },
          { userId: searchRegex },
          { referralCode: searchRegex },
        ],
      });
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