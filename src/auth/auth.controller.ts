import { Request, Response } from 'express';
import * as authService from './auth.service';

/**
 * Handles the Google Sign-In process.
 */
export const googleLogin = async (req: Request, res: Response) => {
  const { idToken, sponsorId } = req.body;

  if (!idToken) {
    return res.status(400).json({ message: 'Google ID token is required.' });
  }

  try {
    const { token, user } = await authService.loginWithGoogle(idToken, sponsorId);
    res.status(200).json({ token, user });
  } catch (error: any) {
    if (error.name === 'AuthorizationError') {
      return res.status(401).json({ message: error.message });
    }
    if (error.name === 'NotFoundError') {
      return res.status(404).json({ message: error.message });
    }
    console.error('Google login error:', error);
    res.status(500).json({ message: 'An error occurred during the login process.', error: error.message });
  }
};

/**
 * Checks if a user exists based on a Google ID token.
 */
export const checkUser = async (req: Request, res: Response) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ message: 'Google ID token is required.' });
  }

  try {
    const result = await authService.checkUserWithGoogle(idToken);
    res.status(200).json(result);
  } catch (error: any) {
    if (error.name === 'AuthorizationError') {
      return res.status(401).json({ message: error.message });
    }
    console.error('Check user error:', error);
    res.status(500).json({ message: 'An error occurred while checking user existence.', error: error.message });
  }
};

/**
 * Handles user registration via email.
 */
export const registerWithEmail = async (req: Request, res: Response) => {
  const { fullName, email, phone, sponsorId } = req.body;

  if (!fullName || !email || !phone) {
    return res.status(400).json({ message: 'Full name, email, and phone are required.' });
  }

  try {
    const result = await authService.registerWithEmail({ fullName, email, phone, sponsorId });
    res.status(201).json(result);
  } catch (error: any) {
    if (error.name === 'ConflictError') {
      return res.status(409).json({ message: error.message });
    }
    console.error('Email registration error:', error);
    res.status(500).json({ message: 'An error occurred during registration.', error: error.message });
  }
};

/**
 * Handles a request for a login OTP.
 */
export const requestLoginOtp = async (req: Request, res: Response) => {
  const { email } = req.body;
  console.log('Requesting login OTP for email:', email);
  if (!email) {
    return res.status(400).json({ message: 'Email is required.' });
  }

  try {
    const result = await authService.requestLoginOtp(email);
    res.status(200).json(result);
  } catch (error: any) {
    if (error.name === 'NotFoundError') {
      return res.status(404).json({ message: error.message });
    }
    if (error.name === 'AuthorizationError') {
      return res.status(403).json({ message: error.message });
    }
    console.error('Request login OTP error:', error);
    res.status(500).json({ message: 'An error occurred while requesting OTP.', error: error.message });
  }
};

/**
 * Handles email verification using OTP.
 */
export const verifyEmailOtp = async (req: Request, res: Response) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: 'Email and OTP are required.' });
  }

  try {
    const { token, user } = await authService.verifyEmailOtp(email, otp);
    res.status(200).json({ message: 'Email verified successfully.', token, user });
  } catch (error: any) {
    if (error.name === 'NotFoundError') {
      return res.status(404).json({ message: error.message });
    }
    if (error.name === 'AuthorizationError') {
      return res.status(401).json({ message: error.message });
    }
    console.error('Email verification error:', error);
    res.status(500).json({ message: 'An error occurred during email verification.', error: error.message });
  }
};

/**
 * Handles login for Admin and Collector roles.
 */
export const login = async (req: Request, res: Response) => {
  const { email, password, role } = req.body;

  if (!email || !password || !role) {
    return res.status(400).json({ message: 'Email, password, and role are required.' });
  }

  if (role !== 'admin' && role !== 'collector') {
    return res.status(400).json({ message: 'Invalid role specified.' });
  }

  try {
    const { token, user } = await authService.login(email, password, role);
    res.status(200).json({ token, user: { id: user.id, email: user.email, role } });
  } catch (error: any) {
    if (error.name === 'AuthorizationError') {
      return res.status(401).json({ message: error.message });
    }
    console.error(`${role} login error:`, error);
    res.status(500).json({ message: 'An error occurred during the login process.', error: error.message });
  }
};