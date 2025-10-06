import { Schema, model, Document } from 'mongoose';

export interface ICurrencyRate extends Document {
  currencyCode: string;
  rateToUSDT: number;
  lastUpdatedBy: string; // Admin ID
}

const currencyRateSchema = new Schema<ICurrencyRate>({
  currencyCode: { type: String, required: true, unique: true, uppercase: true },
  rateToUSDT: { type: Number, required: true },
  lastUpdatedBy: { type: String, required: true, ref: 'Admin' },
}, { timestamps: true });

const CurrencyRate = model<ICurrencyRate>('CurrencyRate', currencyRateSchema);

export default CurrencyRate;
