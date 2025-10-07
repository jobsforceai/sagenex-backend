import * as jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Admin from '../admin/admin.model';
import Collector from '../collector/collector.model';
import { CustomError } from '../helpers/error.helper';
import { OAuth2Client } from 'google-auth-library';
import User from '../user/user.model';
import { customAlphabet } from 'nanoid';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Handles Google Sign-In. Verifies the token, finds or creates a user, and returns a JWT.
 * @param idToken The ID token received from the frontend.
 * @returns An object containing the JWT and user information.
 */
export const loginWithGoogle = async (idToken: string) => {
  // 1. Verify the Google ID token
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();

  if (!payload || !payload.email) {
    throw new CustomError('AuthorizationError', 'Invalid Google token.');
  }

  const { email, name, picture } = payload;

  // 2. Find or create the user
  let user = await User.findOne({ email });

  if (!user) {
    const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 8);
    user = new User({
      fullName: name,
      email,
      profilePicture: picture,
      referralCode: nanoid(), // Generate a new referral code
      packageUSD: 0, // New users start with a 0 package
    });
    await user.save();
  }

  // 3. Generate our own application JWT
  const appPayload = {
    id: user.userId,
    role: 'user',
  };

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('FATAL: JWT_SECRET is not defined in environment variables.');
    throw new Error('Server configuration error.');
  }

  const token = jwt.sign(appPayload, secret, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    algorithm: 'HS256',
  });

  return { token, user };
};

/**
 * Logs in a user (Admin or Collector) and returns a JWT.
 * @param email The user's email.
 * @param password The user's password.
 * @param role The user's role ('admin' or 'collector').
 * @returns A JWT token.
 */
export const login = async (email: string, password: string, role: 'admin' | 'collector') => {
  try {
    // 1. Find the user by email and role
    let user: any;
    console.log(`Searching for ${role} with email: ${email}`);
    if (role === 'admin') {
      user = await Admin.findOne({ email }).select('+password');
    } else {
      user = await Collector.findOne({ email }).select('+password');
    }

    if (!user) {
      console.log(`User not found for email: ${email}`);
      throw new CustomError('AuthorizationError', 'Invalid email or password');
    }
    console.log(`User found: ${user.email}`);

    // 2. Compare passwords
    console.log('Comparing passwords...');
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('Password comparison failed.');
      throw new CustomError('AuthorizationError', 'Invalid email or password');
    }
    console.log('Password comparison successful.');

    // 3. Generate JWT
    const payload = {
      id: role === 'admin' ? user.adminId : user.collectorId,
      role: role,
    };

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('FATAL: JWT_SECRET is not defined in environment variables.');
      throw new Error('Server configuration error.');
    }

    console.log('Generating JWT...');
    const token = jwt.sign(payload, secret, {
      expiresIn: process.env.JWT_EXPIRES_IN || '1d',
      algorithm: 'HS256',
    });
    console.log('JWT generated successfully.');

    return { token, user };
  } catch (error) {
    console.error('Error in auth.service.ts:', error);
    // Re-throw the error to be caught by the controller
    throw error;
  }
};
