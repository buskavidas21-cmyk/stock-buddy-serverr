import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/auth';
import Manager from '../models/Manager';
import Location from '../models/Location';

const defaultPreferences = {
  stock: true,
  repair: true,
  disposal: true,
  transfer: true,
};

export const createManager = async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, phone, assignedLocationIds, notificationPreferences } = req.body;

    if (!name?.trim() || !email?.trim()) {
      return res.status(400).json({ error: 'name and email are required' });
    }

    const manager = new Manager({
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      phone: phone?.trim() || undefined,
      assignedLocationIds: Array.isArray(assignedLocationIds) ? assignedLocationIds : [],
      notificationPreferences: { ...defaultPreferences, ...notificationPreferences },
      createdBy: req.user?._id,
    });

    await manager.save();
    await manager.populate('assignedLocationIds', 'name');

    res.status(201).json({ message: 'Manager created successfully', manager });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Manager email already exists' });
    }
    res.status(500).json({ error: 'Failed to create manager' });
  }
};

export const getManagers = async (req: AuthRequest, res: Response) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const filter = includeInactive ? {} : { isActive: true };

    const managers = await Manager.find(filter)
      .populate('assignedLocationIds', 'name address')
      .populate('createdBy', 'name')
      .sort({ name: 1 });

    res.json(managers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch managers' });
  }
};

export const getManagerById = async (req: AuthRequest, res: Response) => {
  try {
    const manager = await Manager.findById(req.params.id)
      .populate('assignedLocationIds', 'name address')
      .populate('createdBy', 'name');

    if (!manager) {
      return res.status(404).json({ error: 'Manager not found' });
    }

    res.json(manager);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch manager' });
  }
};

export const updateManager = async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, phone, isActive, notificationPreferences } = req.body;
    const update: Record<string, unknown> = {};

    if (name !== undefined) update.name = String(name).trim();
    if (email !== undefined) update.email = String(email).trim().toLowerCase();
    if (phone !== undefined) update.phone = phone?.trim() || undefined;
    if (isActive !== undefined) update.isActive = Boolean(isActive);
    if (notificationPreferences !== undefined) {
      // Use dot-notation so Mongoose $set updates each field individually.
      // Spreading a Mongoose EmbeddedDocument does not produce a plain object,
      // causing findByIdAndUpdate to silently drop the nested update.
      if (notificationPreferences.stock !== undefined)
        update['notificationPreferences.stock'] = Boolean(notificationPreferences.stock);
      if (notificationPreferences.repair !== undefined)
        update['notificationPreferences.repair'] = Boolean(notificationPreferences.repair);
      if (notificationPreferences.disposal !== undefined)
        update['notificationPreferences.disposal'] = Boolean(notificationPreferences.disposal);
      if (notificationPreferences.transfer !== undefined)
        update['notificationPreferences.transfer'] = Boolean(notificationPreferences.transfer);
    }

    const manager = await Manager.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('assignedLocationIds', 'name address');

    if (!manager) {
      return res.status(404).json({ error: 'Manager not found' });
    }

    res.json({ message: 'Manager updated successfully', manager });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Manager email already exists' });
    }
    res.status(500).json({ error: 'Failed to update manager' });
  }
};

export const assignManagerLocations = async (req: AuthRequest, res: Response) => {
  try {
    const { locationIds } = req.body;

    if (!Array.isArray(locationIds)) {
      return res.status(400).json({ error: 'locationIds must be an array' });
    }

    const validIds = locationIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length !== locationIds.length) {
      return res.status(400).json({ error: 'One or more locationIds are invalid' });
    }

    const existingLocations = await Location.countDocuments({ _id: { $in: validIds }, isActive: true });
    if (existingLocations !== validIds.length) {
      return res.status(400).json({ error: 'One or more locations were not found' });
    }

    const manager = await Manager.findByIdAndUpdate(
      req.params.id,
      { assignedLocationIds: validIds },
      { new: true }
    ).populate('assignedLocationIds', 'name address');

    if (!manager) {
      return res.status(404).json({ error: 'Manager not found' });
    }

    res.json({ message: 'Manager locations updated successfully', manager });
  } catch (error) {
    res.status(500).json({ error: 'Failed to assign manager locations' });
  }
};

export const getManagersByLocation = async (req: AuthRequest, res: Response) => {
  try {
    const { locationId } = req.params;
    const managers = await Manager.find({
      isActive: true,
      assignedLocationIds: locationId,
    })
      .select('name email phone notificationPreferences')
      .sort({ name: 1 });

    res.json(managers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch managers for location' });
  }
};
