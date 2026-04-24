import { Router } from 'express';
import {
  getTransactions,
  getTransactionById,
  getPrintableTransactions,
  patchRepairReturnChecklist
} from '../controllers/transactionController';
import { authenticateToken, requireStaffOrAdmin } from '../middleware/auth';

const router = Router();

router.get('/export/print', authenticateToken, getPrintableTransactions);
router.get('/', authenticateToken, getTransactions);
router.patch('/:id/repair-checklist', authenticateToken, requireStaffOrAdmin, patchRepairReturnChecklist);
router.get('/:id', authenticateToken, getTransactionById);

export default router;
