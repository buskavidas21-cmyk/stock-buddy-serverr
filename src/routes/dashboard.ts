import { Router } from 'express';
import { getDashboardData, getLowStockItems } from '../controllers/dashboardController';
import { authenticateToken } from '../middleware/auth';
import { rejectAuditsFromInventoryRoutes } from '../middleware/auditRole';

const router = Router();

router.get('/low-stock', authenticateToken, rejectAuditsFromInventoryRoutes, getLowStockItems);
router.get('/', authenticateToken, rejectAuditsFromInventoryRoutes, getDashboardData);

export default router;