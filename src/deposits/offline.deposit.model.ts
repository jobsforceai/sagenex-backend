import { Schema, model, Document } from 'mongoose';

export type DepositStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface IOfflineDeposit extends Document {
  userId: string;
  collectorId: string;
  amountUSDT: number;
  amountLocal: number;
  currencyCode: string;
  conversionRate: number;
  method: 'CASH' | 'UPI' | 'BANK_TRANSFER';
  reference?: string;
  proofUrl?: string;
  status: DepositStatus;
  createdAt: Date;
  verifiedAt?: Date;
  lineageSnapshot?: Record<string, unknown>;
}

const offlineDepositSchema = new Schema<IOfflineDeposit>({
  userId: { type: String, required: true, ref: 'User', index: true },
  collectorId: { type: String, required: true, ref: 'User', index: true },
  amountUSDT: { type: Number, required: true },
  amountLocal: { type: Number, required: true },
  currencyCode: { type: String, required: true },
  conversionRate: { type: Number, required: true },
  method: { type: String, required: true, enum: ['CASH', 'UPI', 'BANK_TRANSFER'] },
  reference: { type: String },
  proofUrl: { type: String },
  status: { type: String, required: true, enum: ['PENDING', 'VERIFIED', 'REJECTED'], default: 'PENDING' },
  verifiedAt: { type: Date },
  lineageSnapshot: { type: Schema.Types.Mixed },
}, { timestamps: { createdAt: true, updatedAt: true } });

const OfflineDeposit = model<IOfflineDeposit>('OfflineDeposit', offlineDepositSchema);

export default OfflineDeposit;
