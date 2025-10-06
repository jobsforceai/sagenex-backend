import { Request, Response, NextFunction } from 'express';

export const checkApiKey = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];
  const expectedApiKey = process.env.ADMIN_API_KEY;

  if (!expectedApiKey) {
    console.error('FATAL: ADMIN_API_KEY is not set in the environment variables.');
    return res.status(500).json({ message: 'Server configuration error.' });
  }

  if (apiKey && apiKey === expectedApiKey) {
    next();
  } else {
    res.status(403).json({ message: 'Forbidden: Invalid or missing API key.' });
  }
};
