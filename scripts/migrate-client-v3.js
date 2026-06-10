require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI is required');
  process.exit(1);
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  const items = db.collection('items');

  const cursor = items.find({ locations: { $exists: true, $ne: [] } });
  let backfilled = 0;

  while (await cursor.hasNext()) {
    const item = await cursor.next();
    const locationIds = (item.locations || [])
      .map((loc) => loc.locationId)
      .filter(Boolean);

    if (!locationIds.length) continue;

    const existing = new Set((item.registeredLocationIds || []).map(String));
    const merged = [...existing];
    for (const id of locationIds) {
      const s = String(id);
      if (!merged.includes(s)) merged.push(id);
    }

    if (merged.length !== (item.registeredLocationIds || []).length) {
      await items.updateOne({ _id: item._id }, { $set: { registeredLocationIds: merged } });
      backfilled += 1;
    }
  }

  console.log('Items backfilled with registeredLocationIds:', backfilled);
  await mongoose.disconnect();
  console.log('Migration completed');
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch (_) {
    // ignore
  }
  process.exit(1);
});
