import { Router } from 'express';
import * as adminController from './admin.controller';
import { protectAdmin } from '../auth/auth.middleware';
import { checkApiKey } from '../auth/api.key.middleware';

const router = Router();

// Special route to create the first admin, protected by a static API key
router.post('/create', checkApiKey, adminController.createAdmin);

// All other admin routes are protected by JWT authentication
router.use(protectAdmin);

// Route to onboard a new user
router.post('/onboard', adminController.onboardUser);

// Route to get the monthly payouts dashboard
router.get('/payouts', adminController.getMonthlyPayouts);

// Route to get a list of all users
router.get('/users', adminController.getAllUsers);

// Route to get a single user by ID
router.get('/users/:userId', adminController.getUser);

// Route to get the direct children for a user (for designee selection)
router.get('/users/:userId/children', adminController.getDirectChildren);

// Route to update a single user by ID
router.patch('/users/:userId', adminController.updateUser);

// Route to delete a single user by ID
router.delete('/users/:userId', adminController.deleteUser);

// Route to get the referral tree for a user
router.get('/users/:userId/tree', adminController.getReferralTree);

// Routes for managing collectors
router.post('/collectors', adminController.createCollector);
router.get('/collectors', adminController.getCollectors);
router.get('/collectors/:collectorId/deposits', adminController.getCollectorDeposits);

// Routes for managing currency rates
router.get('/rates/live', adminController.getLiveRates);
router.post('/rates/live/refresh', adminController.refreshLiveRates);
router.get('/rates', adminController.getFixedRates);
router.post('/rates', adminController.setFixedRate);

// Routes for managing offline deposits
router.get('/deposits', adminController.getDeposits);
router.post('/deposits/:depositId/verify', adminController.verifyDeposit);

export default router;
