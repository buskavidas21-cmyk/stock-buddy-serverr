import { Response } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/auth';
import Item from '../models/Item';
import Manager from '../models/Manager';
import Location from '../models/Location';

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

    const locationId = body.locationId ?? body.location_id;
    const managerId = body.managerId ?? body.manager_id;
    const initialQuantity = body.initialQuantity ?? body.initial_quantity ?? 0;
    const qty = Number(initialQuantity);

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!unit) {
      return res.status(400).json({ error: 'unit is required' });
    }
    if (Number.isNaN(threshold) || threshold < 0) {
      return res.status(400).json({ error: 'threshold must be a non-negative number' });
    }
    if (Number.isNaN(qty) || qty < 0) {
      return res.status(400).json({ error: 'initialQuantity must be a non-negative number' });
    }

    if (locationId) {
      const location = await Location.findById(locationId);
      if (!location || !location.isActive) {
        return res.status(400).json({ error: 'Invalid locationId' });
      }
    }

    if (managerId) {
      const manager = await Manager.findOne({ _id: managerId, isActive: true });
      if (!manager) {
        return res.status(400).json({ error: 'Invalid managerId' });
      }
    }

    const locations: Array<{ locationId: mongoose.Types.ObjectId; quantity: number; managerId?: mongoose.Types.ObjectId }> = [];
    const registeredLocationIds: mongoose.Types.ObjectId[] = [];

    if (locationId) {
      const locOid = new mongoose.Types.ObjectId(locationId);
      registeredLocationIds.push(locOid);
      locations.push({
        locationId: locOid,
        quantity: qty,
        ...(managerId ? { managerId: new mongoose.Types.ObjectId(managerId) } : {}),
      });
    }

    const payload: Record<string, unknown> = {
      name,
      unit,
      threshold,
      locations,
      registeredLocationIds,
      createdBy: req.user?._id
    };

    if (sku) payload.sku = sku;
    if (modelNumber) payload.modelNumber = modelNumber;
    if (serialNumber) payload.serialNumber = serialNumber;
    if (purchaseDate) payload.purchaseDate = purchaseDate;
    if (barcode) payload.barcode = barcode;
    if (image !== undefined) payload.image = image;
    if (managerId) payload.assignedManagerId = new mongoose.Types.ObjectId(managerId);

    const item = new Item(payload as any);

    await item.save();
    await item.populate([
      { path: 'assignedManagerId', select: 'name email' },
      { path: 'registeredLocationIds', select: 'name' },
      { path: 'locations.locationId', select: 'name' },
      { path: 'locations.managerId', select: 'name email' },
    ]);
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
    const locationId = req.query.locationId as string | undefined;
    const filter: Record<string, unknown> = { status: 'active' };
    if (locationId) {
      filter.registeredLocationIds = locationId;
    }

    const items = await Item.find(filter)
      .select('-image')
      .populate('locations.locationId', 'name')
      .populate('locations.managerId', 'name email')
      .populate('assignedManagerId', 'name email')
      .populate('registeredLocationIds', 'name')
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

export const getItemsByLocation = async (req: AuthRequest, res: Response) => {
  try {
    const { locationId } = req.params;

    const items = await Item.find({
      status: 'active',
      registeredLocationIds: locationId,
    })
      .select('-image')
      .populate('locations.locationId', 'name')
      .populate('locations.managerId', 'name email')
      .populate('assignedManagerId', 'name email')
      .populate('registeredLocationIds', 'name')
      .lean();

    const itemsWithStock = items.map((item) => {
      const locationStock = item.locations.find(
        (loc) => String(loc.locationId?._id ?? loc.locationId) === locationId
      );
      const totalStock = item.locations.reduce((sum, loc) => sum + loc.quantity, 0);
      return {
        ...item,
        quantityAtLocation: locationStock?.quantity ?? 0,
        totalStock,
        stockStatus: totalStock <= item.threshold ? 'low' : 'sufficient',
      };
    });

    res.json(itemsWithStock);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch items by location' });
  }
};

export const getItemById = async (req: AuthRequest, res: Response) => {
  try {
    const item = await Item.findById(req.params.id)
      .populate('locations.locationId', 'name')
      .populate('locations.managerId', 'name email')
      .populate('assignedManagerId', 'name email')
      .populate('registeredLocationIds', 'name')
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