import * as jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { customAlphabet } from 'nanoid';
import Admin from '../admin/admin.model';
import Collector from '../collector/collector.model';
import { CustomError } from '../helpers/error.helper';
import User from '../user/user.model';
import * as userService from '../user/user.service';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Handles Google Sign-In. Verifies the token, finds or creates a user, and returns a JWT.
 * @param idToken The ID token received from the frontend.
 * @param sponsorId The optional sponsor code provided during sign-up.
 * @returns An object containing the JWT and user information.
 */
export const loginWithGoogle = async (idToken: string, sponsorId?: string) => {
  // 1. Verify the Google ID token
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();

  if (!payload || !payload.email || !payload.sub) {
    throw new CustomError('AuthorizationError', 'Invalid Google token.');
  }

  const { email, name, picture, sub: googleId } = payload;

  // 2. Find user by Google ID first
  let user = await User.findOne({ googleId });

  if (!user) {
    // 3. If not found, try to find by email to link accounts
    user = await User.findOne({ email });
    if (user) {
      // User was pre-registered by admin/collector, link their Google ID
      user.googleId = googleId;
      user.profilePicture = user.profilePicture || picture; // Update picture if not set
      await user.save();
    } else {
      // 4. If no user exists, create a new one using the centralized service
      user = await userService.createNewUser({
        googleId,
        email,
        profilePicture: picture,
        fullName: name || email.split('@')[0],
        sponsorId, // Pass the sponsorId through (will default to SAGENEX-GOLD if undefined)
      });
    }
  }

  // 5. Generate our application JWT
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
 * Checks if a user exists based on a Google ID token.
 * @param idToken The ID token received from the frontend.
 * @returns An object indicating if the user exists.
 */
export const checkUserWithGoogle = async (idToken: string) => {
  // 1. Verify the Google ID token
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();

  if (!payload || !payload.email || !payload.sub) {
    throw new CustomError('AuthorizationError', 'Invalid Google token.');
  }

  const { email, sub: googleId } = payload;

  // 2. Check if a user exists with either the Google ID or the email
  const user = await User.findOne({ $or: [{ googleId }, { email }] });

  return { exists: !!user };
};


/**
 * Generates a JWT for a given user.
 * @param user The user object.
 * @returns A JWT token.
 */
export const generateToken = (user: any) => {
  const payload = {
    id: user.userId, // Ensure we use userId for consistency
    role: user.role || 'user',
  };

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('FATAL: JWT_SECRET is not defined in environment variables.');
    throw new Error('Server configuration error.');
  }

  return jwt.sign(payload, secret, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    algorithm: 'HS256',
  });
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
    if (role === 'admin') {
      user = await Admin.findOne({ email }).select('+password');
    } else {
      user = await Collector.findOne({ email }).select('+password');
    }

    if (!user) {
      throw new CustomError('AuthorizationError', 'Invalid email or password');
    }

    // 2. Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new CustomError('AuthorizationError', 'Invalid email or password');
    }

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

    const token = jwt.sign(payload, secret, {
      expiresIn: process.env.JWT_EXPIRES_IN || '1d',
      algorithm: 'HS256',
    });

    return { token, user };
  } catch (error) {
    // Re-throw the error to be caught by the controller
    throw error;
  }
};