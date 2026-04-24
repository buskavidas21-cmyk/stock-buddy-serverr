import { Response } from 'express';
import crypto from 'crypto';
import { AuthRequest } from '../middleware/auth';
import Item from '../models/Item';

export const createItem = async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body || {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const unit = typeof body.unit === 'string' ? body.unit.trim() : '';
    const threshold = Number(body.threshold);

    const skuRaw = body.sku ?? body.SKU;
    const sku = typeof skuRaw === 'string' && skuRaw.trim() ? skuRaw.trim() : undefined;

    const modelNumberRaw = body.modelNumber ?? body.model_number;
    const modelNumber =
      typeof modelNumberRaw === 'string' && modelNumberRaw.trim() ? modelNumberRaw.trim() : undefined;

    const serialNumberRaw = body.serialNumber ?? body.serial_number;
    const serialNumber =
      typeof serialNumberRaw === 'string' && serialNumberRaw.trim() ? serialNumberRaw.trim() : undefined;

    const purchaseRaw = body.purchaseDate ?? body.purchase_date ?? body.date_added;
    let purchaseDate: Date | undefined;
    if (purchaseRaw !== undefined && purchaseRaw !== null && purchaseRaw !== '') {
      const d = new Date(purchaseRaw);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ error: 'Invalid purchase date' });
      }
      purchaseDate = d;
    }

    const barcode =
      typeof body.barcode === 'string' && body.barcode.trim() ? body.barcode.trim() : undefined;
    const image = body.image;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!unit) {
      return res.status(400).json({ error: 'unit is required' });
    }
    if (Number.isNaN(threshold) || threshold < 0) {
      return res.status(400).json({ error: 'threshold must be a non-negative number' });
    }

    const payload: Record<string, unknown> = {
      name,
      unit,
      threshold,
      locations: [],
      createdBy: req.user?._id
    };

    if (sku) payload.sku = sku;
    if (modelNumber) payload.modelNumber = modelNumber;
    if (serialNumber) payload.serialNumber = serialNumber;
    if (purchaseDate) payload.purchaseDate = purchaseDate;
    if (barcode) payload.barcode = barcode;
    if (image !== undefined) payload.image = image;

    const item = new Item(payload as any);

    await item.save();
    res.status(201).json({ message: 'Item created successfully', item });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Unique field conflict (sku or barcode already exists)' });
    }
    res.status(500).json({ error: 'Failed to create item' });
  }
};

export const getItems = async (req: AuthRequest, res: Response) => {
  try {
    const items = await Item.find({ status: 'active' })
      .select('-image')
      .populate('locations.locationId', 'name')
      .populate('createdBy', 'name')
      .lean();
    
    const itemsWithStock = items.map(item => {
      const totalStock = item.locations.reduce((sum, loc) => sum + loc.quantity, 0);
      return {
        ...item,
        totalStock,
        stockStatus: totalStock <= item.threshold ? 'low' : 'sufficient'
      };
    });

    res.json(itemsWithStock);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch items' });
  }
};

export const getItemById = async (req: AuthRequest, res: Response) => {
  try {
    const item = await Item.findById(req.params.id)
      .populate('locations.locationId', 'name')
      .populate('createdBy', 'name');
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch item' });
  }
};

export const updateItem = async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body || {};
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, 1> = {};

    if (body.name !== undefined) {
      const n = String(body.name).trim();
      if (!n) {
        return res.status(400).json({ error: 'name cannot be empty' });
      }
      $set.name = n;
    }
    if (body.unit !== undefined) {
      const u = String(body.unit).trim();
      if (!u) {
        return res.status(400).json({ error: 'unit cannot be empty' });
      }
      $set.unit = u;
    }
    if (body.threshold !== undefined) {
      const t = Number(body.threshold);
      if (Number.isNaN(t) || t < 0) {
        return res.status(400).json({ error: 'threshold must be a non-negative number' });
      }
      $set.threshold = t;
    }
    if (body.status !== undefined) {
      $set.status = body.status;
    }

    if (body.sku !== undefined) {
      const s = String(body.sku).trim();
      if (s) {
        $set.sku = s;
      } else {
        $unset.sku = 1;
      }
    }
    if (body.modelNumber !== undefined || body.model_number !== undefined) {
      const v = body.modelNumber ?? body.model_number;
      if (typeof v === 'string' && v.trim()) {
        $set.modelNumber = v.trim();
      } else {
        $unset.modelNumber = 1;
      }
    }
    if (body.serialNumber !== undefined || body.serial_number !== undefined) {
      const v = body.serialNumber ?? body.serial_number;
      if (typeof v === 'string' && v.trim()) {
        $set.serialNumber = v.trim();
      } else {
        $unset.serialNumber = 1;
      }
    }
    const purchaseRaw = body.purchaseDate ?? body.purchase_date ?? body.date_added;
    if (purchaseRaw !== undefined) {
      if (purchaseRaw === null || purchaseRaw === '') {
        $unset.purchaseDate = 1;
      } else {
        const d = new Date(purchaseRaw);
        if (Number.isNaN(d.getTime())) {
          return res.status(400).json({ error: 'Invalid purchase date' });
        }
        $set.purchaseDate = d;
      }
    }

    const updatePayload: Record<string, unknown> = {};
    if (Object.keys($set).length) {
      updatePayload.$set = $set;
    }
    if (Object.keys($unset).length) {
      updatePayload.$unset = $unset;
    }

    const item =
      Object.keys(updatePayload).length === 0
        ? await Item.findByIdAndUpdate(req.params.id, {}, { new: true })
        : await Item.findByIdAndUpdate(req.params.id, updatePayload, { new: true });

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json({ message: 'Item updated successfully', item });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Unique field conflict (sku or barcode already exists)' });
    }
    res.status(500).json({ error: 'Failed to update item' });
  }
};

export const searchItems = async (req: AuthRequest, res: Response) => {
  try {
    const { query } = req.query;
    
    const items = await Item.find({
      status: 'active',
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { sku: { $regex: query, $options: 'i' } },
        { modelNumber: { $regex: query, $options: 'i' } },
        { serialNumber: { $regex: query, $options: 'i' } },
        { barcode: { $regex: query, $options: 'i' } }
      ]
    }).populate('locations.locationId', 'name');

    res.json(items);
  } catch (error) {
    res.status(500).json({ error: 'Failed to search items' });
  }
};

export const getItemByBarcode = async (req: AuthRequest, res: Response) => {
  try {
    const { barcode } = req.params;

    const item = await Item.findOne({ barcode })
      .populate('locations.locationId', 'name')
      .populate('createdBy', 'name');

    if (!item) {
      return res.status(404).json({ error: 'Item not found for the provided barcode' });
    }

    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch item by barcode' });
  }
};

const generateUniqueBarcode = async () => {
  let barcode: string;
  let exists = true;

  do {
    barcode = crypto.randomBytes(4).toString('hex').toUpperCase();
    exists = !!(await Item.exists({ barcode }));
  } while (exists);

  return barcode;
};

export const assignBarcode = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { barcode: providedBarcode, overwrite } = req.body;

    const item = await Item.findById(id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    if (item.barcode && !overwrite) {
      return res.status(400).json({ error: 'Item already has a barcode. Set overwrite=true to replace it.' });
    }

    const barcode = providedBarcode || await generateUniqueBarcode();

    const duplicate = await Item.findOne({ barcode, _id: { $ne: id } });
    if (duplicate) {
      return res.status(400).json({ error: 'Barcode already assigned to another item' });
    }

    item.barcode = barcode;
    await item.save();

    res.json({ message: 'Barcode assigned successfully', item });
  } catch (error) {
    res.status(500).json({ error: 'Failed to assign barcode' });
  }
};