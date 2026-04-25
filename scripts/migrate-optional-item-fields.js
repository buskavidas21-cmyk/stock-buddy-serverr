require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI is required');
  process.exit(1);
}

const itemSchema = new mongoose.Schema(
  {
    sku: { type: String },
    modelNumber: { type: String },
    serialNumber: { type: String },
    purchaseDate: { type: Date }
  },
  { strict: false, collection: 'items' }
);

const transactionSchema = new mongoose.Schema(
  {
    repairReturnChecklist: { type: Array }
  },
  { strict: false, collection: 'transactions' }
);

const userSchema = new mongoose.Schema(
  {
    role: { type: String },
    email: { type: String }
  },
  { strict: false, collection: 'users' }
);

const Item = mongoose.model('ItemMigration', itemSchema);
const Transaction = mongoose.model('TransactionMigration', transactionSchema);
const User = mongoose.model('UserMigration', userSchema);

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const itemResult = await Item.updateMany(
    {},
    [
      {
        $set: {
          modelNumber: {
            $cond: [
              {
                $or: [
                  { $eq: [{ $type: '$modelNumber' }, 'missing'] },
                  { $eq: ['$modelNumber', ''] }
                ]
              },
              '$$REMOVE',
              '$modelNumber'
            ]
          },
          serialNumber: {
            $cond: [
              {
                $or: [
                  { $eq: [{ $type: '$serialNumber' }, 'missing'] },
                  { $eq: ['$serialNumber', ''] }
                ]
              },
              '$$REMOVE',
              '$serialNumber'
            ]
          }
        }
      }
    ]
  );
  console.log('Items normalized:', itemResult.modifiedCount);

  const txResult = await Transaction.updateMany(
    { type: 'REPAIR_IN', repairReturnChecklist: { $exists: false } },
    { $set: { repairReturnChecklist: [] } }
  );
  console.log('Repair return transactions backfilled:', txResult.modifiedCount);

  console.log('Audits role is admin-controlled; no bulk user role mutation applied.');
  await mongoose.disconnect();
  console.log('Migration completed');
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch (_) {
    // ignore disconnect errors
  }
  process.exit(1);
});
