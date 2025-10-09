import { Router } from 'express';
import * as collectorController from './collector.controller';
import { protectCollector } from '../auth/auth.middleware';

const router = Router();

// All routes in this file are protected by the collector auth middleware
router.use(protectCollector);

// Route to create a new user
router.post('/users', collectorController.createUser);

// Route to get a list of all users
router.get('/users', collectorController.getAllUsers);

// Route to get the deposit history for a specific user
router.get('/users/:userId/deposits', collectorController.getUserDepositHistory);

// Route to get the direct children for a user (for designee selection)
router.get('/users/:userId/children', collectorController.getDirectChildren);

// Route to get the referral tree for a user
router.get('/users/:userId/tree', collectorController.getReferralTree);

// Route to get live currency rates
router.get('/rates/live', collectorController.getLiveRates);

// Route to create a new offline deposit for a user
router.post('/deposits', collectorController.createOfflineDeposit);

export default router;