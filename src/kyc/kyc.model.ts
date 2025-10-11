import { Schema, model, Document } from 'mongoose';

export type KycStatus = 'NOT_SUBMITTED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
export type KycDocType = 'AADHAAR_FRONT' | 'AADHAAR_BACK' | 'PAN' | 'OTHER';

export interface IKycDocument extends Document {
  docType: KycDocType;
  url: string;
}

export interface IKyc extends Document {
  userId: string;
  status: KycStatus;
  documents: IKycDocument[];
  rejectionReason?: string;
  submittedAt?: Date;
  verifiedAt?: Date;
  verifiedBy?: string; // Admin ID
}

const kycDocumentSchema = new Schema<IKycDocument>({
  docType: { 
    type: String, 
    required: true, 
    enum: ['AADHAAR_FRONT', 'AADHAAR_BACK', 'PAN', 'OTHER'] 
  },
  url: { type: String, required: true },
}, { _id: false });

const kycSchema = new Schema<IKyc>({
  userId: { type: String, required: true, unique: true, ref: 'User' },
  status: { 
    type: String, 
    required: true, 
    enum: ['NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED'], 
    default: 'NOT_SUBMITTED' 
  },
  documents: [kycDocumentSchema],
  rejectionReason: { type: String },
  submittedAt: { type: Date },
  verifiedAt: { type: Date },
  verifiedBy: { type: String, ref: 'Admin' },
}, { timestamps: true });

const Kyc = model<IKyc>('Kyc', kycSchema);

export default Kyc;
