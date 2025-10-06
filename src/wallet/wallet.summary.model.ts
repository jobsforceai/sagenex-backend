import { Schema, model, Document } from 'mongoose';

export interface IWalletSummary extends Document {
  userId: string;
  availableToWithdraw: number;
  lifetimeEarnings: number;
  lastUpdated: Date;
}

const walletSummarySchema = new Schema<IWalletSummary>({
  userId: { type: String, required: true, unique: true, ref: 'User' },
  availableToWithdraw: { type: Number, required: true, default: 0 },
  lifetimeEarnings: { type: Number, required: true, default: 0 },
  lastUpdated: { type: Date, default: Date.now },
}, { timestamps: true });

const WalletSummary = model<IWalletSummary>('WalletSummary', walletSummarySchema);

export default WalletSummary;
