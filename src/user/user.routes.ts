import { Router } from 'express';
import * as userController from './user.controller';
import * as payoutsController from './payouts.controller';
import * as placementController from './placement.controller';
import { protectUser } from '../auth/auth.middleware';

const router = Router();

// All routes in this file are protected and accessible only by logged-in users.
router.use(protectUser);

// Route to get dashboard data
router.get('/dashboard', userController.getDashboard);

// Route to get the user's profile
router.get('/profile', userController.getProfile);

// Route to update the user's profile
router.patch('/profile', userController.updateProfile);

// Route to get wallet transaction history
router.get('/wallet', userController.getWalletHistory);

// Route to get the user's referral tree
router.get('/team/tree', userController.getReferralTree);

// Route to get the user's referral summary
router.get('/team/summary', userController.getReferralSummary);

// Route to get the user's rank and progress
router.get('/rank-progress', userController.getRankAndProgress);

// Route to get the user's financial summary
router.get('/financial-summary', userController.getFinancialSummary);

// Route to get the leaderboard
router.get('/leaderboard', userController.getLeaderboard);

// Route to get the user's monthly payout history
router.get('/payouts', payoutsController.getMonthlyPayouts);

// Routes for placement queue
router.get('/team/placement-queue', placementController.getPlacementQueue);
router.post('/team/place-user', placementController.placeUser);
router.post('/team/transfer-user', placementController.transferUser);

// Route to get the list of users for fund transfers
router.get('/transfer-recipients', userController.getTransferRecipients);

export default router;