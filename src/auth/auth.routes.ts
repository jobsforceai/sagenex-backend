import { Router } from 'express';
import * as authController from './auth.controller';

const router = Router();

router.post('/login', authController.loginController);
router.post('/google/login', authController.googleLoginController);

export default router;
