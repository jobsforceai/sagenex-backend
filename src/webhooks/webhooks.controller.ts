import { Request, Response } from 'express';
import * as walletService from '../wallet/wallet.service';
import crypto from 'crypto';

const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;

/**
 * Handles incoming webhook notifications from NOWPayments.
 */
export const handleNowPaymentsWebhook = async (req: Request, res: Response) => {
  const hmac = req.headers['x-nowpayments-sig'];

  if (!NOWPAYMENTS_IPN_SECRET) {
    console.error('NOWPAYMENTS_IPN_SECRET is not set. Cannot verify webhook.');
    return res.status(500).send('Webhook processing error.');
  }

  try {
    const sortedBody = JSON.stringify(req.body, Object.keys(req.body).sort());
    const signature = crypto.createHmac('sha512', NOWPAYMENTS_IPN_SECRET).update(sortedBody).digest('hex');

    if (hmac !== signature) {
      return res.status(401).send('Invalid webhook signature.');
    }

    const { payment_id, payment_status, order_id } = req.body;

    if (payment_status === 'finished') {
      await walletService.processCryptoDeposit(order_id, payment_id);
    } else if (['failed', 'refunded', 'expired'].includes(payment_status)) {
      await walletService.updateCryptoDepositStatus(order_id, payment_status.toUpperCase());
    }

    res.status(200).send('Webhook received.');
  } catch (error: any) {
    console.error('Error processing NOWPayments webhook:', error);
    res.status(500).json({ message: 'Error processing webhook.', error: error.message });
  }
};
