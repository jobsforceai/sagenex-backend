import axios from 'axios';
import { CustomError } from '../helpers/error.helper';

const NOWPAYMENTS_API_URL = 'https://api.nowpayments.io/v1';

// It's crucial to set these in your .env file
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;

if (!NOWPAYMENTS_API_KEY) {
  console.warn('NOWPAYMENTS_API_KEY is not set in environment variables. NOWPayments service will not work.');
}

const api = axios.create({
  baseURL: NOWPAYMENTS_API_URL,
  headers: {
    'x-api-key': NOWPAYMENTS_API_KEY,
    'Content-Type': 'application/json',
  },
});

/**
 * Creates a payment invoice in NOWPayments.
 * @param amount The amount in USDT.
 * @param orderId A unique identifier for the payment from our system.
 * @returns The payment invoice data from NOWPayments.
 */
export const createPaymentInvoice = async (amount: number, orderId: string) => {
  if (!NOWPAYMENTS_API_KEY) {
    throw new CustomError('ServiceUnavailableError', 'Crypto payment service is currently unavailable.');
  }
  try {
    const response = await api.post('/payment', {
      price_amount: amount,
      price_currency: 'usd',
      pay_currency: 'usdttrc20', // Specify USDT on TRC20 network
      order_id: orderId,
      ipn_callback_url: `${process.env.API_BASE_URL}/api/v1/webhooks/nowpayments`,
    });
    return response.data;
  } catch (error: any) {
    console.error('Error creating NOWPayments invoice:', error.response?.data || error.message);
    throw new CustomError('ApiError', 'Failed to create payment invoice.');
  }
};

/**
 * Creates a payout (withdrawal) to a user's wallet.
 * @param address The user's USDT TRC20 wallet address.
 * @param amount The amount to withdraw in USDT.
 * @returns The payout response data from NOWPayments.
 */
export const createPayout = async (address: string, amount: number) => {
  if (!NOWPAYMENTS_API_KEY) {
    throw new CustomError('ServiceUnavailableError', 'Crypto withdrawal service is currently unavailable.');
  }
  try {
    const response = await api.post('/payout', {
      address,
      currency: 'usdttrc20',
      amount,
    });
    return response.data;
  } catch (error: any) {
    console.error('Error creating NOWPayments payout:', error.response?.data || error.message);
    throw new CustomError('ApiError', 'Failed to process withdrawal.');
  }
};
