import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import Item from '../models/Item';
import RepairTicket from '../models/RepairTicket';
import Transaction from '../models/Transaction';
import mongoose from 'mongoose';
import { notifyUsers } from '../utils/notificationService';
import { notifyLowStock } from '../utils/inventoryAlerts';
import { itemInventoryRef } from '../utils/itemRef';

const MAX_REPAIR_RETURN_CHECKLIST = 50;

const normalizeRepairReturnChecklist = (raw: unknown) => {
  if (!Array.isArray(raw)) {
    return [];
  }

  const items: { label: string; completed: boolean }[] = [];

  for (const row of raw.slice(0, MAX_REPAIR_RETURN_CHECKLIST)) {
    const label = String((row as any)?.label ?? (row as any)?.text ?? '').trim();
    if (!label) {
      continue;
    }
    items.push({
      label: label.slice(0, 500),
      completed: Boolean((row as any)?.completed)
    });
  }

  return items;
};

export const sendForRepair = async (req: AuthRequest, res: Response) => {
  try {
    const { itemId, locationId, quantity, vendorName, serialNumber, note, photo } = req.body;
    console.log('Request Body:', req.body);
    const item = await Item.findById(itemId);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Get location name for email
    const Location = require('../models/Location').default;
    const location = await Location.findById(locationId);
    const locationName = location?.name || 'Unknown Location';

    // Check stock availability
    const locationIndex = item.locations.findIndex(
      loc => loc.locationId.toString() === locationId
    );

    if (locationIndex < 0 || item.locations[locationIndex].quantity < quantity) {
      return res.status(400).json({ error: 'Insufficient stock at location' });
    }

    const previousStock = item.locations[locationIndex].quantity;
    const remainingStock = previousStock - quantity;

    // Reduce stock
    item.locations[locationIndex].quantity -= quantity;
    await item.save();

    // Create repair ticket
    const repairTicket = new RepairTicket({
      itemId,
      locationId,
      quantity,
      vendorName,
      serialNumber,
      note,
      photo,
      createdBy: req.user?._id
    });

    await repairTicket.save();

    // Create transaction record
    const transaction = new Transaction({
      type: 'REPAIR_OUT',
      itemId,
      fromLocationId: locationId,
      quantity,
      vendorName,
      serialNumber,
      note,
      photo,
      createdBy: req.user?._id
    });

    await transaction.save();

    // Prepare email attachments if photo exists
    const attachments = [];
    if (photo && photo.startsWith('data:image/')) {
      const matches = photo.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        const [, extension, base64Data] = matches;
        attachments.push({
          filename: `repair_item_${Date.now()}.${extension}`,
          content: base64Data,
          encoding: 'base64',
          cid: 'repair_photo'
        });
      }
    }

    const currentDate = new Date().toLocaleString();
    const photoSection = photo ? `
      <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
        <h3 style="margin-top: 0; color: #374151;">📸 Item Condition</h3>
        <img src="cid:repair_photo" alt="Item for Repair" style="max-width: 100%; max-height: 300px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);"/>
        <p style="font-size: 12px; color: #6b7280; margin-top: 10px;">Photo of item sent for repair</p>
      </div>
    ` : '';

    await notifyUsers({
      title: 'Item Sent for Repair',
      message: `${quantity} ${item.unit} of ${item.name} were sent to ${vendorName}.`,
      data: {
        itemId: item.id,
        repairTicketId: repairTicket.id
      },
      emailSubject: `🔧 StockBuddy Update – ${item.name} sent for repair`,
      emailHtml: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #ea580c; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">🔧 Item Sent for Repair</h2>
          
          <div style="background-color: #fff7ed; border-left: 4px solid #ea580c; padding: 20px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #c2410c;">Repair Service Initiated</h3>
            <p>Items have been sent to vendor for repair services.</p>
          </div>

          <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1f2937;">Item Details</h3>
            <ul style="list-style: none; padding: 0;">
              <li><strong>Item:</strong> ${item.name}</li>
              <li><strong>Ref:</strong> ${itemInventoryRef(item)}</li>
              <li><strong>Unit:</strong> ${item.unit}</li>
              <li><strong>Threshold:</strong> ${item.threshold} ${item.unit}</li>
            </ul>
          </div>

          <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #92400e;">Repair Details</h3>
            <ul style="list-style: none; padding: 0;">
              <li><strong>Quantity Sent:</strong> ${quantity} ${item.unit}</li>
              <li><strong>Previous Stock:</strong> ${previousStock} ${item.unit}</li>
              <li><strong>Remaining Stock:</strong> ${remainingStock} ${item.unit}</li>
              <li><strong>Location:</strong> ${locationName}</li>
              <li><strong>Vendor:</strong> ${vendorName}</li>
              ${serialNumber ? `<li><strong>Serial Number:</strong> ${serialNumber}</li>` : ''}
            </ul>
          </div>

          ${note ? `
          <div style="background-color: #f0f9ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <strong>Repair Notes:</strong><br/>
            <em>${note}</em>
          </div>
          ` : ''}

          ${photoSection}

          <div style="background-color: #f1f5f9; padding: 15px; border-radius: 8px; margin: 20px 0; font-size: 14px; color: #64748b;">
            <p><strong>Sent by:</strong> ${req.user?.name || 'Staff'} (${req.user?.email || 'N/A'})</p>
            <p><strong>Date & Time:</strong> ${currentDate}</p>
            <p><strong>Repair Ticket ID:</strong> ${repairTicket.id}</p>
            <p><strong>Transaction ID:</strong> ${transaction.id}</p>
          </div>

          <div style="background-color: #ecfdf5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #065f46;"><strong>🔔 Remember to track repair progress and update when items are returned.</strong></p>
          </div>
        </div>
      `,
      attachments
    });

    await notifyLowStock(item);

    res.status(201).json({ message: 'Item sent for repair', repairTicket });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send item for repair' });
  }
};

export const returnFromRepair = async (req: AuthRequest, res: Response) => {
  try {
    const { repairTicketId, locationId, note, checklist } = req.body;

    const repairTicket = await RepairTicket.findById(repairTicketId);
    if (!repairTicket || repairTicket.status !== 'sent') {
      return res.status(404).json({ error: 'Repair ticket not found or already processed' });
    }

    const item = await Item.findById(repairTicket.itemId);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Get location name for email
    const Location = require('../models/Location').default;
    const location = await Location.findById(locationId);
    const locationName = location?.name || 'Unknown Location';

    // Add stock back
    const locationIndex = item.locations.findIndex(
      loc => loc.locationId.toString() === locationId
    );

    if (locationIndex >= 0) {
      item.locations[locationIndex].quantity += repairTicket.quantity;
    } else {
      item.locations.push({ locationId: new mongoose.Types.ObjectId(locationId), quantity: repairTicket.quantity });
    }

    await item.save();

    // Update repair ticket
    repairTicket.status = 'returned';
    repairTicket.returnedDate = new Date();
    await repairTicket.save();

    const repairReturnChecklist = normalizeRepairReturnChecklist(checklist);

    // Create transaction record
    const transaction = new Transaction({
      type: 'REPAIR_IN',
      itemId: repairTicket.itemId,
      toLocationId: locationId,
      quantity: repairTicket.quantity,
      note,
      repairReturnChecklist: repairReturnChecklist.length ? repairReturnChecklist : undefined,
      createdBy: req.user?._id
    });

    await transaction.save();

    await notifyUsers({
      title: 'Repair Completed',
      message: `${repairTicket.quantity} ${item.unit} of ${item.name} returned from repair.`,
      data: {
        itemId: item.id,
        repairTicketId: repairTicket.id
      },
      emailSubject: `StockBuddy Update – ${item.name} returned from repair`,
      emailHtml: `
        <p>${repairTicket.quantity} ${item.unit} of <strong>${item.name}</strong> have been returned from repair.</p>
        <ul>
          <li>Vendor: ${repairTicket.vendorName}</li>
          <li>Location: ${locationName}</li>
        </ul>
        <p>Returned by: ${req.user?.name || 'Staff'}</p>
      `
    });

    res.json({ message: 'Item returned from repair', repairTicket });
  } catch (error) {
    res.status(500).json({ error: 'Failed to return item from repair' });
  }
};

export const getRepairTickets = async (req: AuthRequest, res: Response) => {
  try {
    const tickets = await RepairTicket.find()
      .populate('itemId', 'name sku')
      .populate('locationId', 'name')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });

    res.json(tickets);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch repair tickets' });
  }
};