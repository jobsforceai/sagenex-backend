import { Schema, model, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import Counter from '../helpers/counter.model';

export interface ICollector extends Document {
  collectorId: string;
  fullName: string;
  email: string;
  phone?: string;
  password?: string;
}

const collectorSchema = new Schema<ICollector>({
  collectorId: { type: String, unique: true },
  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  password: { type: String, required: true, select: false },
}, { timestamps: true });

// Auto-increment collectorId
collectorSchema.pre('save', async function (next) {
  if (this.isNew) {
    const counter = await Counter.findByIdAndUpdate(
      { _id: 'collectorId' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.collectorId = `C${String(counter.seq).padStart(3, '0')}`;
  }
  next();
});

// Hash password before saving
collectorSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    return next();
  } catch (err) {
    return next(err as Error);
  }
});

const Collector = model<ICollector>('Collector', collectorSchema);

export default Collector;
