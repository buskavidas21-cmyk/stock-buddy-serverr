import mongoose, { Document, Schema } from 'mongoose';

export interface IManagerNotificationPreferences {
  stock: boolean;
  repair: boolean;
  disposal: boolean;
  transfer: boolean;
}

export interface IManager extends Document {
  name: string;
  email: string;
  phone?: string;
  assignedLocationIds: mongoose.Types.ObjectId[];
  notificationPreferences: IManagerNotificationPreferences;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationPreferencesSchema = new Schema<IManagerNotificationPreferences>(
  {
    stock: { type: Boolean, default: true },
    repair: { type: Boolean, default: true },
    disposal: { type: Boolean, default: true },
    transfer: { type: Boolean, default: true }
  },
  { _id: false }
);

const ManagerSchema = new Schema<IManager>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    assignedLocationIds: [{ type: Schema.Types.ObjectId, ref: 'Location' }],
    notificationPreferences: {
      type: NotificationPreferencesSchema,
      default: () => ({})
    },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

ManagerSchema.index({ isActive: 1 });
ManagerSchema.index({ assignedLocationIds: 1 });

export default mongoose.model<IManager>('Manager', ManagerSchema);
