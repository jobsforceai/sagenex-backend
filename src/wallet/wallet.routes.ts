import { Router } from 'express';
import * as walletController from './wallet.controller';
import { protectUser } from '../auth/auth.middleware';

const router = Router();

// All wallet routes are protected and require a logged-in user
router.use(protectUser);

// Route to get the logged-in user's wallet summary and ledger
router.get('/', walletController.getWallet);

// Route to create a new withdrawal request
router.post('/request-withdrawal', walletController.requestWithdrawal);

// Routes for user-to-user transfers
router.post('/transfer/send-otp', walletController.sendTransferOtp);
router.post('/transfer/execute', walletController.executeTransfer);

export default router;
