import User from '../user/user.model';
import Kyc, { IKyc, KycDocType, IKycDocument } from './kyc.model';
import { CustomError } from '../helpers/error.helper';
import { uploadToS3 } from '../helpers/s3.helper';

/**
 * Uploads or updates a single KYC document for a user.
 * The overall KYC status is not changed to PENDING until submitted for review.
 * @param userId The ID of the user.
 * @param file The file object from multer.
 * @param docType The type of the document being uploaded.
 * @returns The updated KYC record.
 */
export const uploadKycDocument = async (userId: string, file: Express.Multer.File, docType: KycDocType): Promise<IKyc> => {
  const user = await User.findOne({ userId });
  if (!user) {
    throw new CustomError('NotFoundError', `User with ID '${userId}' not found.`);
  }

  if (user.kycStatus === 'VERIFIED' || user.kycStatus === 'PENDING') {
    throw new CustomError('ConflictError', `Cannot upload documents when KYC status is '${user.kycStatus}'.`);
  }

  // Upload the new file to S3
  const url = await uploadToS3(file, userId);

  // Get the existing KYC record or create a new one
  let kyc = await Kyc.findOne({ userId });
  if (!kyc) {
    kyc = new Kyc({ userId, status: 'NOT_SUBMITTED', documents: [] });
  }

  // Remove any existing document of the same type
  kyc.documents = kyc.documents.filter(doc => doc.docType !== docType);
  
  // Add the new document
  kyc.documents.push({ docType, url } as IKycDocument);

  // If status was REJECTED, move it back to NOT_SUBMITTED as changes are being made.
  if (kyc.status === 'REJECTED') {
      kyc.status = 'NOT_SUBMITTED';
      user.kycStatus = 'NOT_SUBMITTED';
      await user.save();
  }

  await kyc.save();
  return kyc;
};

/**
 * Submits the user's uploaded KYC documents for administrative review.
 * @param userId The ID of the user.
 * @returns The updated KYC record with a 'PENDING' status.
 */
export const submitKycForReview = async (userId: string): Promise<IKyc> => {
  const user = await User.findOne({ userId });
  if (!user) {
    throw new CustomError('NotFoundError', `User with ID '${userId}' not found.`);
  }

  const kyc = await Kyc.findOne({ userId });
  if (!kyc || kyc.documents.length === 0) {
    throw new CustomError('ValidationError', 'At least one document must be uploaded before submitting for review.');
  }

  if (kyc.status === 'VERIFIED' || kyc.status === 'PENDING') {
    throw new CustomError('ConflictError', `Cannot submit for review when status is already '${kyc.status}'.`);
  }

  // Update status to PENDING
  kyc.status = 'PENDING';
  kyc.submittedAt = new Date();
  kyc.rejectionReason = undefined;
  await kyc.save();

  // Sync status with the user model
  user.kycStatus = 'PENDING';
  await user.save();

  return kyc;
};

/**
 * Gets the KYC status and details for a user.
 * @param userId The ID of the user.
 * @returns The user's KYC record.
 */
export const getKycStatus = async (userId: string): Promise<IKyc | null> => {
  const kyc = await Kyc.findOne({ userId });
  if (!kyc) {
      // If no KYC record exists, it means they haven't submitted.
      // We can return a default object to represent this state.
      return {
        userId,
        status: 'NOT_SUBMITTED',
        documents: [],
      } as any; // Cast to any to satisfy return type without a full document
  }
  return kyc;
};
