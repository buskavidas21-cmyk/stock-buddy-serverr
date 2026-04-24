import { Router } from 'express';
import { addStock, transferStock, getStockByLocation, reviewTransfer, getPendingTransfers } from '../controllers/stockController';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { rejectAuditsFromInventoryRoutes } from '../middleware/auditRole';

const router = Router();

router.use(authenticateToken, rejectAuditsFromInventoryRoutes);
router.post('/add', addStock);
router.post('/transfer', transferStock);
router.get('/location/:locationId', getStockByLocation);
router.get('/transfers/pending', requireAdmin, getPendingTransfers);
router.post('/transfer/review', requireAdmin, reviewTransfer);

export default router;