import { Schema, model, Document } from 'mongoose';

export type CryptoDepositStatus = 'PENDING' | 'CONFIRMED' | 'FAILED' | 'EXPIRED';

export interface ICryptoDeposit extends Document {
  userId: string;
  amountUSDT: number;
  nowPaymentsPaymentId: string;
  status: CryptoDepositStatus;
  createdAt: Date;
  confirmedAt?: Date;
}

const cryptoDepositSchema = new Schema<ICryptoDeposit>({
  userId: { type: String, required: true, ref: 'User', index: true },
  amountUSDT: { type: Number, required: true },
  nowPaymentsPaymentId: { type: String, required: true, unique: true, index: true },
  status: { type: String, required: true, enum: ['PENDING', 'CONFIRMED', 'FAILED', 'EXPIRED'], default: 'PENDING' },
  confirmedAt: { type: Date },
}, { timestamps: { createdAt: true, updatedAt: true } });

const CryptoDeposit = model<ICryptoDeposit>('CryptoDeposit', cryptoDepositSchema);

export default CryptoDeposit;
