import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import Item from '../models/Item';
import Transaction from '../models/Transaction';
import RepairTicket from '../models/RepairTicket';

const buildLowStockRows = (items: any[]) => {
  const rows: any[] = [];

  for (const item of items) {
    const totalStock = item.locations.reduce((sum: number, loc: any) => sum + loc.quantity, 0);

    if (totalStock <= item.threshold) {
      rows.push({
        id: item._id,
        name: item.name,
        sku: item.sku,
        barcode: item.barcode,
        modelNumber: item.modelNumber,
        serialNumber: item.serialNumber,
        purchaseDate: item.purchaseDate,
        unit: item.unit,
        threshold: item.threshold,
        currentStock: totalStock,
        stockStatus: totalStock === 0 ? 'out_of_stock' : 'low',
        assignedManager: item.assignedManagerId,
        locations: item.locations.map((loc: any) => ({
          locationId: loc.locationId?._id ?? loc.locationId,
          locationName: loc.locationId?.name,
          quantity: loc.quantity,
          manager: loc.managerId,
          status: loc.quantity <= item.threshold ? 'low' : 'sufficient',
        })),
      });
      continue;
    }

    for (const loc of item.locations) {
      if (loc.quantity <= item.threshold) {
        rows.push({
          id: item._id,
          name: item.name,
          sku: item.sku,
          barcode: item.barcode,
          modelNumber: item.modelNumber,
          serialNumber: item.serialNumber,
          purchaseDate: item.purchaseDate,
          unit: item.unit,
          threshold: item.threshold,
          currentStock: loc.quantity,
          stockStatus: loc.quantity === 0 ? 'out_of_stock' : 'low',
          assignedManager: item.assignedManagerId,
          locationId: loc.locationId?._id ?? loc.locationId,
          locationName: loc.locationId?.name,
          manager: loc.managerId,
          locations: item.locations.map((l: any) => ({
            locationId: l.locationId?._id ?? l.locationId,
            locationName: l.locationId?.name,
            quantity: l.quantity,
            manager: l.managerId,
            status: l.quantity <= item.threshold ? 'low' : 'sufficient',
          })),
        });
      }
    }
  }

  return rows;
};

export const getDashboardData = async (req: AuthRequest, res: Response) => {
  try {
    const totalItems = await Item.countDocuments({ status: 'active' });

    const items = await Item.find({ status: 'active' })
      .populate('assignedManagerId', 'name email')
      .populate('locations.locationId', 'name')
      .populate('locations.managerId', 'name email');

    const totalStock = items.reduce((sum, item) => {
      return sum + item.locations.reduce((locSum, loc) => locSum + loc.quantity, 0);
    }, 0);

    const lowStockItems = buildLowStockRows(items);

    const pendingRepairs = await RepairTicket.countDocuments({ status: 'sent' });

    const pendingDisposals = await Transaction.countDocuments({
      type: 'DISPOSE',
      status: 'pending'
    });

    const recentTransactions = await Transaction.find()
      .populate('itemId', 'name sku barcode modelNumber serialNumber purchaseDate')
      .populate('createdBy', 'name')
      .populate('fromLocationId', 'name')
      .populate('toLocationId', 'name')
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      summary: {
        totalItems,
        totalStock,
        lowStockCount: lowStockItems.length,
        pendingRepairs,
        pendingDisposals
      },
      lowStockItems,
      recentTransactions
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
};

export const getLowStockItems = async (req: AuthRequest, res: Response) => {
  try {
    const locationId = req.query.locationId as string | undefined;
    const filter: Record<string, unknown> = { status: 'active' };
    if (locationId) {
      filter.registeredLocationIds = locationId;
    }

    const items = await Item.find(filter)
      .populate('assignedManagerId', 'name email phone')
      .populate('registeredLocationIds', 'name')
      .populate('locations.locationId', 'name address')
      .populate('locations.managerId', 'name email phone')
      .lean();

    const lowStockItems = buildLowStockRows(items);

    res.json({
      count: lowStockItems.length,
      items: lowStockItems,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch low stock items' });
  }
};
