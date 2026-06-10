import { Router } from 'express';
import {
  createManager,
  getManagers,
  getManagerById,
  updateManager,
  assignManagerLocations,
  getManagersByLocation,
} from '../controllers/managerController';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { rejectAuditsFromInventoryRoutes } from '../middleware/auditRole';

const router = Router();

router.use(authenticateToken, rejectAuditsFromInventoryRoutes);

router.post('/', requireAdmin, createManager);
router.get('/', getManagers);
router.get('/by-location/:locationId', getManagersByLocation);
router.get('/:id', getManagerById);
router.put('/:id', requireAdmin, updateManager);
router.put('/:id/locations', requireAdmin, assignManagerLocations);

export default router;
