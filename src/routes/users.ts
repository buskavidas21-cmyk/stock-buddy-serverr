import { Router } from 'express';
import { getUsers, createUser, updateUser, resetUserPassword } from '../controllers/userController';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { rejectAuditsFromInventoryRoutes } from '../middleware/auditRole';

const router = Router();

router.use(authenticateToken, rejectAuditsFromInventoryRoutes, requireAdmin);
router.get('/', getUsers);
router.post('/', createUser);
router.put('/:id', updateUser);
router.post('/:id/reset-password', resetUserPassword);

export default router;