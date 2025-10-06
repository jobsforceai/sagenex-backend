import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import Admin from '../admin/admin.model';
import Collector from '../collector/collector.model';

interface AuthRequest extends Request {
  user?: any;
}

const protect = (role: 'admin' | 'collector') => async (req: AuthRequest, res: Response, next: NextFunction) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // 1. Get token from header
      token = req.headers.authorization.split(' ')[1];

      // 2. Verify token
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        throw new Error('Server configuration error: JWT_SECRET not set.');
      }
      const decoded: any = jwt.verify(token, secret);

      // 3. Check if user still exists and has the correct role
      if (decoded.role !== role) {
        return res.status(403).json({ message: 'Forbidden: Insufficient permissions.' });
      }

      let user;
      if (role === 'admin') {
        user = await Admin.findOne({ adminId: decoded.id });
      } else {
        user = await Collector.findOne({ collectorId: decoded.id });
      }

      if (!user) {
        return res.status(401).json({ message: 'Not authorized, user not found.' });
      }

      // 4. Grant access
      req.user = user;
      next();
    } catch (error) {
      console.error('Authentication error:', error);
      return res.status(401).json({ message: 'Not authorized, token failed.' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token.' });
  }
};

export const protectAdmin = protect('admin');
export const protectCollector = protect('collector');
