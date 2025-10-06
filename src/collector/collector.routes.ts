import { Router } from 'express';
import * as collectorController from './collector.controller';
import { protectCollector } from '../auth/auth.middleware';

const router = Router();

// All routes in this file are protected by the collector auth middleware
router.use(protectCollector);

// Route to create a new offline deposit for a user
router.post('/deposits', collectorController.createOfflineDeposit);

// Route to get all users assigned to the collector
router.get('/users', collectorController.getAssignedUsers);

// Route for a collector to assign a user to themselves
router.post('/users/assign', collectorController.assignUser);

export default router;
