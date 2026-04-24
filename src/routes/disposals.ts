import { Router } from 'express';
import { requestDisposal, approveDisposal, getPendingDisposals } from '../controllers/disposalController';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { rejectAuditsFromInventoryRoutes } from '../middleware/auditRole';

const router = Router();

router.use(authenticateToken, rejectAuditsFromInventoryRoutes);
router.post('/request', requestDisposal);
router.post('/approve', requireAdmin, approveDisposal);
router.get('/pending', requireAdmin, getPendingDisposals);

export default router;