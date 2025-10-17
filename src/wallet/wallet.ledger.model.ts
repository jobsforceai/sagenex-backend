import { Schema, model, Document } from 'mongoose';

export type LedgerEntryType =
  | 'OFFLINE_DEPOSIT'
  | 'PACKAGE_ACTIVATION'
  | 'ROI'
  | 'DIRECT'
  | 'UNILEVEL'
  | 'SALARY'
  | 'WITHDRAWAL_REQUEST'
  | 'ADJUSTMENT'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'FUND_TRANSFER_ON_DELETE';

export type LedgerEntryStatus =
  | 'PENDING'
  | 'VERIFIED'
  | 'POSTED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'PAID';

export interface IWalletLedger extends Document {
  userId: string;
  type: LedgerEntryType;
  amount: number;
  status: LedgerEntryStatus;
  createdBy: string; // Can be a userId of an Admin or Collector
  createdAt: Date;
  meta?: Record<string, unknown>;
}

const walletLedgerSchema = new Schema<IWalletLedger>({
  userId: { type: String, required: true, ref: 'User', index: true },
  type: {
    type: String,
    required: true,
    enum: [
      'OFFLINE_DEPOSIT',
      'PACKAGE_ACTIVATION',
      'ROI',
      'DIRECT',
      'UNILEVEL',
      'SALARY',
      'WITHDRAWAL_REQUEST',
      'ADJUSTMENT',
      'TRANSFER_IN',
      'TRANSFER_OUT'
    ]
  },
  amount: { type: Number, required: true },
  status: {
    type: String,
    required: true,
    enum: ['PENDING', 'VERIFIED', 'POSTED', 'REJECTED', 'CANCELLED', 'PAID'],
    default: 'PENDING'
  },
  createdBy: { type: String, required: true, ref: 'User' },
  meta: { type: Schema.Types.Mixed },
}, { timestamps: { createdAt: true, updatedAt: false } }); // Only createdAt

const WalletLedger = model<IWalletLedger>('WalletLedger', walletLedgerSchema);

export default WalletLedger;
