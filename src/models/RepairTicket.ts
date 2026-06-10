import mongoose, { Document, Schema } from 'mongoose';

export interface IRepairTicket extends Document {
  itemId: mongoose.Types.ObjectId;
  locationId: mongoose.Types.ObjectId;
  quantity: number;
  vendorName: string;
  serialNumber?: string;
  note?: string;
  photo?: string;
  status: 'sent' | 'returned' | 'lost' | 'dispose_pending';
  sentDate: Date;
  returnedDate?: Date;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const RepairTicketSchema = new Schema<IRepairTicket>({
  itemId: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
  locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
  quantity: { type: Number, required: true, min: 1 },
  vendorName: { type: String, required: true },
  serialNumber: { type: String },
  note: { type: String },
  photo: { type: String },
  status: {
    type: String,
    enum: ['sent', 'returned', 'lost', 'dispose_pending'],
    default: 'sent'
  },
  sentDate: { type: Date, default: Date.now },
  returnedDate: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, {
  timestamps: true
});

export default mongoose.model<IRepairTicket>('RepairTicket', RepairTicketSchema);
