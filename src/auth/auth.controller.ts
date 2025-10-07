import { Request, Response } from 'express';
import * as authService from './auth.service';

/**
 * Handles Google Sign-In for users.
 */
export const googleLoginController = async (req: Request, res: Response) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ message: 'Google ID token is required.' });
  }

  try {
    const { token, user } = await authService.loginWithGoogle(idToken);
    res.status(200).json({
      message: 'Google login successful.',
      token,
      user,
    });
  } catch (error: any) {
    if (error.name === 'AuthorizationError') {
      return res.status(401).json({ message: error.message });
    }
    console.error('Google login error:', error);
    res.status(500).json({ message: 'An internal server error occurred.' });
  }
};

/**
 * Handles user login.
 */
export const loginController = async (req: Request, res: Response) => {
  console.log('Login attempt received:', req.body);
  const { email, password, role } = req.body;

  // 1. Validation
  if (!email || !password || !role) {
    console.log('Login validation failed: Missing fields.');
    return res.status(400).json({ message: 'Email, password, and role are required.' });
  }
  if (role !== 'admin' && role !== 'collector') {
    console.log(`Login validation failed: Invalid role '${role}'.`);
    return res.status(400).json({ message: 'Role must be either "admin" or "collector".' });
  }

  try {
    console.log(`Calling authService.login for email: ${email}, role: ${role}`);
    const { token, user } = await authService.login(email, password, role);
    
    // Remove password from user object before sending response
    user.password = undefined;

    console.log(`Login successful for user: ${user.email}`);
    res.status(200).json({
      message: 'Login successful.',
      token,
      user,
    });
  } catch (error: any) {
    if (error.name === 'AuthorizationError') {
      console.log(`Authorization error for ${email}: ${error.message}`);
      return res.status(401).json({ message: error.message });
    }
    console.error('Unhandled login error in controller:', error);
    res.status(500).json({ message: 'An internal server error occurred.' });
  }
};
