import { Router } from 'express';
import * as authController from './auth.controller';

const router = Router();

// Route for user Google Sign-In
router.post('/user/google', authController.googleLogin);

// Route to check if a user exists via Google token
router.post('/user/check', authController.checkUser);

// Route for user registration with email
router.post('/user/register', authController.registerWithEmail);

// Route for requesting a login OTP
router.post('/user/login-otp', authController.requestLoginOtp);

// Route for verifying user's email with OTP
router.post('/user/verify-email', authController.verifyEmailOtp);

// Route for Admin/Collector login
router.post('/login', authController.login);

export default router;