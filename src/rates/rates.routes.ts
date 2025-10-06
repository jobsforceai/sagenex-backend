import { Router } from 'express';
import CurrencyRate from './currency.model';

const router = Router();

/**
 * @route   GET /api/v1/rates
 * @desc    Get all fixed currency rates set by the admin
 * @access  Public
 */
router.get('/', async (req, res) => {
    try {
        const rates = await CurrencyRate.find().select('currencyCode rateToUSDT -_id').lean();
        res.status(200).json(rates);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching rates.' });
    }
});

export default router;
