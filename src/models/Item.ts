import mongoose, { Document, Schema } from 'mongoose';

export interface IItem extends Document {
  name: string;
  /** @deprecated Optional for new items; retained for legacy data and lookups. */
  sku?: string;
  modelNumber?: string;
  serialNumber?: string;
  /** Purchase / acquisition date for warranty tracking */
  purchaseDate?: Date;
  barcode?: string;
  unit: string;
  threshold: number;
  status: 'active' | 'inactive';
  image?: string; // base64 encoded image
  locations: {
    locationId: mongoose.Types.ObjectId;
    quantity: number;
  }[];
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ItemSchema = new Schema<IItem>({
  name: { type: String, required: true },
  sku: { type: String, unique: true, sparse: true },
  modelNumber: { type: String },
  serialNumber: { type: String },
  purchaseDate: { type: Date },
  barcode: { type: String, unique: true, sparse: true },
  unit: { type: String, required: true },
  threshold: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  image: { type: String }, // base64 encoded image
  locations: [{
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
    quantity: { type: Number, required: true, min: 0 }
  }],
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, {
  timestamps: true
});

ItemSchema.index({ status: 1 });
ItemSchema.index({ modelNumber: 1 });
ItemSchema.index({ serialNumber: 1 });

export default mongoose.model<IItem>('Item', ItemSchema);
