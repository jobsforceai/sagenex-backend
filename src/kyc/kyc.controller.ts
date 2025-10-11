import { Request, Response } from 'express';
import * as kycService from './kyc.service';
import multer from 'multer';
import { KycDocType } from './kyc.model';

const ALLOWED_MIMETYPES = ['image/jpeg', 'image/png', 'application/pdf'];

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPG, PNG, and PDF are allowed.'));
  }
};

const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB file size limit
});

/**
 * Middleware to handle a single KYC document upload.
 * Expects a 'document' file field.
 */
export const kycUploadHandler = upload.single('document');

/**
 * Uploads a single KYC document for the logged-in user.
 */
export const uploadDocument = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const file = req.file;
  const { docType } = req.body;

  if (!file) {
    return res.status(400).json({ message: 'Document file is required.' });
  }
  if (!docType || !['AADHAAR_FRONT', 'AADHAAR_BACK', 'PAN', 'OTHER'].includes(docType)) {
    return res.status(400).json({ message: 'A valid docType is required.' });
  }

  try {
    const kyc = await kycService.uploadKycDocument(user.userId, file, docType as KycDocType);
    res.status(200).json({ message: 'Document uploaded successfully.', kyc });
  } catch (error: any) {
    if (error.name === 'ConflictError') {
      return res.status(409).json({ message: error.message });
    }
    console.error(`Error uploading KYC document for user ${user.userId}:`, error);
    res.status(500).json({ message: 'Error uploading document.', error: error.message });
  }
};

/**
 * Submits the user's collective KYC documents for review.
 */
export const submitForReview = async (req: Request, res: Response) => {
  const user = (req as any).user;
  try {
    const kyc = await kycService.submitKycForReview(user.userId);
    res.status(200).json({ message: 'KYC successfully submitted for review.', kyc });
  } catch (error: any) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    if (error.name === 'ConflictError') {
      return res.status(409).json({ message: error.message });
    }
    console.error(`Error submitting KYC for review for user ${user.userId}:`, error);
    res.status(500).json({ message: 'Error submitting for review.', error: error.message });
  }
};

/**
 * Gets the KYC status for the logged-in user.
 */
export const getKycStatus = async (req: Request, res: Response) => {
  const user = (req as any).user;

  try {
    const kyc = await kycService.getKycStatus(user.userId);
    res.status(200).json(kyc);
  } catch (error: any) {
    console.error(`Error fetching KYC status for user ${user.userId}:`, error);
    res.status(500).json({ message: 'Error fetching KYC status.', error: error.message });
  }
};
