import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import Item from '../models/Item';
import Transaction from '../models/Transaction';
import RepairTicket from '../models/RepairTicket';

export const getDashboardData = async (req: AuthRequest, res: Response) => {
  try {
    // Get total items count
    const totalItems = await Item.countDocuments({ status: 'active' });

    // Calculate total stock across all locations
    const items = await Item.find({ status: 'active' });
    const totalStock = items.reduce((sum, item) => {
      return sum + item.locations.reduce((locSum, loc) => locSum + loc.quantity, 0);
    }, 0);

    // Get low stock items (below threshold)
    const lowStockItems = items.filter(item => {
      const totalItemStock = item.locations.reduce((sum, loc) => sum + loc.quantity, 0);
      return totalItemStock <= item.threshold;
    }).map(item => ({
      id: item._id,
      name: item.name,
      sku: item.sku,
      modelNumber: item.modelNumber,
      serialNumber: item.serialNumber,
      purchaseDate: item.purchaseDate,
      currentStock: item.locations.reduce((sum, loc) => sum + loc.quantity, 0),
      threshold: item.threshold
    }));

    // Get pending repairs
    const pendingRepairs = await RepairTicket.countDocuments({ status: 'sent' });

    // Get pending disposals (transactions requiring approval)
    const pendingDisposals = await Transaction.countDocuments({ 
      type: 'DISPOSE', 
      status: 'pending' 
    });

    // Get recent transactions (last 10)
    const recentTransactions = await Transaction.find()
      .populate('itemId', 'name sku modelNumber serialNumber purchaseDate')
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