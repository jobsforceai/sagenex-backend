import * as jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Admin from '../admin/admin.model';
import Collector from '../collector/collector.model';
import { CustomError } from '../helpers/error.helper';
import User from '../user/user.model';

/**
 * Generates a JWT for a given user.
 * @param user The user object.
 * @returns A JWT token.
 */
export const generateToken = (user: any) => {
  const payload = {
    id: user.id,
    role: user.role || 'user', // Default role to 'user' if not specified
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
