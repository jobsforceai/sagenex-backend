import { Request, Response } from 'express';
import * as userService from './user.service';

/**
 * Gets the list of unplaced users for the logged-in sponsor.
 */
export const getPlacementQueue = async (req: Request, res: Response) => {
  const user = (req as any).user;
  try {
    const queue = await userService.getPlacementQueue(user.userId);
    res.status(200).json(queue);
  } catch (error: any) {
    console.error(`Error fetching placement queue for user ${user.userId}:`, error);
    res.status(500).json({ message: 'Error fetching placement queue.', error: error.message });
  }
};

/**
 * Places a user from the sponsor's queue into the genealogy tree.
 */
export const placeUser = async (req: Request, res: Response) => {
  const sponsor = (req as any).user;
  const { newUserId, placementParentId } = req.body;

  if (!newUserId || !placementParentId) {
    return res.status(400).json({ message: 'newUserId and placementParentId are required.' });
  }

  try {
    const placedUser = await userService.placeUser(sponsor.userId, newUserId, placementParentId);
    res.status(200).json({ message: 'User placed successfully.', user: placedUser });
  } catch (error: any) {
    if (error.name === 'NotFoundError' || error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    if (error.name === 'ConflictError') {
      return res.status(409).json({ message: error.message });
    }
    if (error.name === 'AuthorizationError') {
      return res.status(403).json({ message: error.message });
    }
    console.error(`Error placing user ${newUserId} for sponsor ${sponsor.userId}:`, error);
    res.status(500).json({ message: 'Error placing user.', error: error.message });
  }
};
