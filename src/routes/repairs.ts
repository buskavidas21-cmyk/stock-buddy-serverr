import { Router } from 'express';
import { sendForRepair, returnFromRepair, getRepairTickets } from '../controllers/repairController';
import { authenticateToken } from '../middleware/auth';
import { rejectAuditsFromInventoryRoutes } from '../middleware/auditRole';

const router = Router();

router.use(authenticateToken, rejectAuditsFromInventoryRoutes);
router.post('/send', sendForRepair);
router.post('/return', returnFromRepair);
router.get('/', getRepairTickets);

export default router;