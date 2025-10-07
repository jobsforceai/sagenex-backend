import { Router } from 'express';
import * as collectorController from './collector.controller';
import { protectCollector } from '../auth/auth.middleware';

const router = Router();

// All routes in this file are protected by the collector auth middleware
router.use(protectCollector);

// Route to create a new user (similar to admin onboarding)
router.post('/users', collectorController.createUser);

// Route to get all users assigned to the collector
router.get('/users', collectorController.getAssignedUsers);

// Route to get all users that are not assigned to any collector
router.get('/users/unassigned', collectorController.getUnassignedUsers);

// Route for a collector to assign a user to themselves
router.post('/users/:userId/assign-self', collectorController.assignUserToSelf);

// Route to create a new offline deposit for a user
router.post('/deposits', collectorController.createOfflineDeposit);

export default router;
