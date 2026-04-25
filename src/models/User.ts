import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  email: string;
  password: string;
  name: string;
  role: 'admin' | 'staff' | 'audits';
  isAuditApproved: boolean;
  isActive: boolean;
  lastLogin?: Date;
  resetToken?: string;
  resetTokenExpiry?: Date;
  noti?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['admin', 'staff', 'audits'], default: 'staff' },
  isAuditApproved: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date },
  resetToken: { type: String },
  resetTokenExpiry: { type: Date },
  noti: { type: String },
}, {
  timestamps: true
});

export default mongoose.model<IUser>('User', UserSchema);