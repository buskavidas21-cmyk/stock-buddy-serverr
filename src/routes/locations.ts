import { Router } from 'express';
import { createLocation, getLocations, updateLocation } from '../controllers/locationController';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { rejectAuditsFromInventoryRoutes } from '../middleware/auditRole';

const router = Router(); // location routes

router.use(authenticateToken);
router.post('/', requireAdmin, createLocation);
router.get('/', getLocations);
router.put('/:id', requireAdmin, updateLocation);

export default router;