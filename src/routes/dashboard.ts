import { Router } from 'express';
import { getDashboardData } from '../controllers/dashboardController';
import { authenticateToken } from '../middleware/auth';
import { rejectAuditsFromInventoryRoutes } from '../middleware/auditRole';

const router = Router();

router.get('/', authenticateToken, rejectAuditsFromInventoryRoutes, getDashboardData);

export default router;