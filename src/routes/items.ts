import { Router } from 'express';
import { createItem, getItems, getItemsByLocation, getItemById, updateItem, searchItems, getItemByBarcode, assignBarcode, deleteItem } from '../controllers/itemController';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { rejectAuditsFromInventoryRoutes } from '../middleware/auditRole';

const router = Router();

router.use(authenticateToken, rejectAuditsFromInventoryRoutes);
router.post('/', requireAdmin, createItem);
router.get('/', getItems);
router.get('/search', searchItems);
router.get('/by-location/:locationId', getItemsByLocation);
router.get('/barcode/:barcode', getItemByBarcode);
router.get('/:id', getItemById);
router.put('/:id', requireAdmin, updateItem);
router.delete('/:id', requireAdmin, deleteItem);
router.post('/:id/barcode', requireAdmin, assignBarcode);

export default router;
