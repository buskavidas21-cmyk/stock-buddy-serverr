import { notifyUsers } from './notificationService';
import { itemInventoryRef } from './itemRef';

export const calculateTotalStock = (item: any) => {
  return item.locations.reduce((sum: number, loc: any) => sum + loc.quantity, 0);
};

export const notifyLowStock = async (item: any) => {
  const totalStock = calculateTotalStock(item);
  if (totalStock <= item.threshold) {
    const itemId = (item as any).id ?? String((item as any)._id);
    const ref = itemInventoryRef(item);
    await notifyUsers({
      title: 'Low Stock Alert',
      message: `${item.name} (${ref}) is at ${totalStock} ${item.unit}, below the threshold of ${item.threshold}.`,
      data: {
        itemId,
        sku: item.sku,
        modelNumber: item.modelNumber,
        totalStock
      },
      roles: ['admin'],
      emailSubject: `StockBuddy Alert – ${item.name} is Low`,
      emailHtml: `
        <p><strong>${item.name}</strong> (${ref}) is low on stock.</p>
        <p>Current stock: ${totalStock} ${item.unit}</p>
        <p>Threshold: ${item.threshold} ${item.unit}</p>
        <p>Please review and take action.</p>
      `
    });
  }
};

