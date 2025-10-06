import { Router } from 'express';
import * as walletController from './wallet.controller';

const router = Router();

// TODO: Add authorization middleware to ensure only the user or an admin can access this route.

// Route to get a user's wallet summary and ledger
router.get('/:userId', walletController.getWallet);

export default router;
