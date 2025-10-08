import { Schema, model, Document } from 'mongoose';
import Counter from '../helpers/counter.model';

export interface IUser extends Document {
  userId: string;
  googleId?: string;
  fullName: string;
  email: string;
  phone: string;
  profilePicture?: string;
  sponsorId: string | null;
  referralCode: string;
  packageUSD: number;
  pvPoints: number;
  dateJoined: Date;
  status: 'active' | 'inactive';
  salary: number;
}

const userSchema = new Schema<IUser>({
  userId: { type: String, unique: true },
  googleId: { type: String, unique: true, sparse: true },
  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  profilePicture: { type: String },
  sponsorId: { type: String, default: null, index: true },
  referralCode: { type: String, required: true, unique: true },
  packageUSD: { type: Number, required: true, default: 0 },
  pvPoints: { type: Number, default: 0 },
  dateJoined: { type: Date, default: Date.now },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  salary: { type: Number, default: 0 },
}, { timestamps: true });

// Auto-increment userId before saving a new user
userSchema.pre('save', async function (next) {
  if (this.isNew) {
    const counter = await Counter.findByIdAndUpdate(
      { _id: 'userId' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.userId = `U${String(counter.seq).padStart(3, '0')}`;
  }
  next();
});

const User = model<IUser>('User', userSchema);

export default User;
