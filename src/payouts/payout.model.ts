import { Schema, model, Document } from 'mongoose';

export interface IPayout extends Document {
  userId: string;
  month: string; // Format: YYYY-MM
  packageUSD: number;
  roiPayout: number;
  directReferralBonus: number;
  unilevelBonus: number;
  salary: number;
  totalMonthlyIncome: number;
  calculatedAt: Date;
}

const payoutSchema = new Schema<IPayout>({
  userId: { type: String, required: true, ref: 'User', index: true },
  month: { type: String, required: true, index: true },
  packageUSD: { type: Number, required: true },
  roiPayout: { type: Number, required: true },
  directReferralBonus: { type: Number, required: true },
  unilevelBonus: { type: Number, required: true },
  salary: { type: Number, required: true },
  totalMonthlyIncome: { type: Number, required: true },
  calculatedAt: { type: Date, default: Date.now },
});

// Compound index to ensure only one payout record per user per month
payoutSchema.index({ userId: 1, month: 1 }, { unique: true });

const Payout = model<IPayout>('Payout', payoutSchema);

export default Payout;
