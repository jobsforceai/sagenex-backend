import { Schema, model, Document } from 'mongoose';
import { IUser } from '../user/user.model';

// Extend IUser to include deletion info
export interface IDeletedUser extends IUser {
  deletedAt: Date;
  deletedBy: string; // Admin's ID
}

// The schema is almost identical to the User schema
const deletedUserSchema = new Schema<IDeletedUser>({
  userId: { type: String, required: true },
  fullName: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String },
  profilePicture: { type: String },
  originalSponsorId: { type: String, default: null },
  parentId: { type: String, default: null },
  isSplitSponsor: { type: Boolean, default: false },
  referralCode: { type: String, required: true },
  packageUSD: { type: Number, required: true, default: 0 },
  pvPoints: { type: Number, default: 0 },
  dateJoined: { type: Date, required: true },
  status: { type: String, enum: ['active', 'inactive'], required: true },
  salary: { type: Number, default: 0 },
  deletedAt: { type: Date, default: Date.now },
  deletedBy: { type: String, required: true },
}, {
  timestamps: true, // This will add createdAt and updatedAt from the original user document
  collection: 'deleted_users', // Store in a separate collection
});

const DeletedUser = model<IDeletedUser>('DeletedUser', deletedUserSchema);

export default DeletedUser;
