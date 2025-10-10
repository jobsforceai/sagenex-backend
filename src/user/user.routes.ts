import { Router } from 'express';
import * as userController from './user.controller';
import * as payoutsController from './payouts.controller';
import { protectUser } from '../auth/auth.middleware';

const router = Router();

// All routes in this file are protected and accessible only by logged-in users.
router.use(protectUser);

// Route to get dashboard data
router.get('/dashboard', userController.getDashboard);

// Route to get the user's profile
router.get('/profile', userController.getProfile);

// Route to get wallet transaction history
router.get('/wallet', userController.getWalletHistory);

// Route to get the user's referral tree
router.get('/team/tree', userController.getReferralTree);

// Route to get the user's monthly payout history
router.get('/payouts', payoutsController.getMonthlyPayouts);

export default router;