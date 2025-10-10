import { Router } from 'express';
import * as authController from './auth.controller';

const router = Router();

router.post('/login', authController.loginController);
router.post('/google/login', authController.googleLoginController);
router.post('/google/check-user', authController.googleCheckUserController);

export default router;