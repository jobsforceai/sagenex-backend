import { Router } from 'express';
import * as adminController from './admin.controller';
import { checkAdminAuth } from './admin.middleware';

const router = Router();

// All routes in this file are protected by the admin auth middleware
router.use(checkAdminAuth);

// Route to onboard a new user
router.post('/onboard', adminController.onboardUser);

// Route to get the monthly payouts dashboard
router.get('/payouts', adminController.getMonthlyPayouts);

// Route to get a list of all users
router.get('/users', adminController.getAllUsers);

export default router;
