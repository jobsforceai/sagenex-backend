import { Router } from 'express';
import * as webhooksController from './webhooks.controller';

const router = Router();

// Route for handling NOWPayments IPN (Instant Payment Notification) callbacks
router.post('/nowpayments', webhooksController.handleNowPaymentsWebhook);

export default router;
