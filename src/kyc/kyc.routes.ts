import { Router } from 'express';
import * as kycController from './kyc.controller';
import { protectUser } from '../auth/auth.middleware';

const router = Router();

// All KYC routes are protected and require a logged-in user
router.use(protectUser);

/**
 * @route   POST /api/v1/kyc/document
 * @desc    Upload a single KYC document
 * @access  Private (User)
 */
router.post('/document', kycController.kycUploadHandler, kycController.uploadDocument);

/**
 * @route   POST /api/v1/kyc/submit-for-review
 * @desc    Submit all uploaded documents for verification
 * @access  Private (User)
 */
router.post('/submit-for-review', kycController.submitForReview);


/**
 * @route   GET /api/v1/kyc/status
 * @desc    Get the current KYC status for the user
 * @access  Private (User)
 */
router.get('/status', kycController.getKycStatus);

export default router;
