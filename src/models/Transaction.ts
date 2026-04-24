import mongoose, { Document, Schema } from 'mongoose';

export interface IRepairReturnChecklistItem {
  _id: mongoose.Types.ObjectId;
  label: string;
  completed: boolean;
}

export interface ITransaction extends Document {
  type: 'ADD' | 'TRANSFER' | 'REPAIR_OUT' | 'REPAIR_IN' | 'DISPOSE';
  itemId: mongoose.Types.ObjectId;
  fromLocationId?: mongoose.Types.ObjectId;
  toLocationId?: mongoose.Types.ObjectId;
  quantity: number;
  note?: string;
  photo?: string; // Base64 encoded
  vendorName?: string; // For repairs
  serialNumber?: string; // For repairs
  /** Checklist for return-from-repair flow (REPAIR_IN). */
  repairReturnChecklist?: IRepairReturnChecklistItem[];
  reason?: 'Broken' | 'Expired' | 'Obsolete'; // For disposals
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const RepairReturnChecklistItemSchema = new Schema<IRepairReturnChecklistItem>(
  {
    label: { type: String, required: true, maxlength: 500 },
    completed: { type: Boolean, default: false }
  },
  { _id: true }
);

const TransactionSchema = new Schema<ITransaction>({
  type: { 
    type: String, 
    enum: ['ADD', 'TRANSFER', 'REPAIR_OUT', 'REPAIR_IN', 'DISPOSE'], 
    required: true 
  },
  itemId: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
  fromLocationId: { type: Schema.Types.ObjectId, ref: 'Location' },
  toLocationId: { type: Schema.Types.ObjectId, ref: 'Location' },
  quantity: { type: Number, required: true, min: 1 },
  note: { type: String },
  photo: { type: String }, // Base64 encoded image
  vendorName: { type: String }, // For repair transactions
  serialNumber: { type: String }, // For repair transactions
  repairReturnChecklist: { type: [RepairReturnChecklistItemSchema], default: undefined },
  reason: { type: String, enum: ['Broken', 'Expired', 'Obsolete'] }, // For disposal
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved' },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, {
  timestamps: true
});

TransactionSchema.index({ createdAt: -1 });
TransactionSchema.index({ type: 1, status: 1, createdAt: -1 });

export default mongoose.model<ITransaction>('Transaction', TransactionSchema);
