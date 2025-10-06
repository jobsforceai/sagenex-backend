import { Schema, model, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import Counter from '../helpers/counter.model';

export interface IAdmin extends Document {
  adminId: string;
  fullName: string;
  email: string;
  phone?: string;
  password?: string;
}

const adminSchema = new Schema<IAdmin>({
  adminId: { type: String, unique: true },
  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  password: { type: String, required: true, select: false }, // select: false hides it by default
}, { timestamps: true });

// Auto-increment adminId
adminSchema.pre('save', async function (next) {
  if (this.isNew) {
    const counter = await Counter.findByIdAndUpdate(
      { _id: 'adminId' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.adminId = `A${String(counter.seq).padStart(3, '0')}`;
  }
  next();
});

// Hash password before saving
adminSchema.pre('save', async function (next) {
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

const Admin = model<IAdmin>('Admin', adminSchema);

export default Admin;
