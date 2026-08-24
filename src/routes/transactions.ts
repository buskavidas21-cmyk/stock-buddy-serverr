import { Router } from 'express';
import {
  getTransactions,
  getTransactionById,
  getPrintableTransactions,
  exportTransactionsToPdf,
  exportTransactionsToExcel,
  patchRepairReturnChecklist,
  deleteOrphanedTransactions,
} from '../controllers/transactionController';
import { authenticateToken, requireAdmin, requireStaffOrAdmin } from '../middleware/auth';

const router = Router();

// Static routes must be declared before /:id so they are not swallowed by the param route.
router.get('/export/print',    authenticateToken, getPrintableTransactions);
router.get('/export/pdf',      authenticateToken, exportTransactionsToPdf);
router.get('/export/excel',    authenticateToken, exportTransactionsToExcel);
router.delete('/orphaned',     authenticateToken, requireAdmin, deleteOrphanedTransactions);
router.get('/',                authenticateToken, getTransactions);
router.patch('/:id/repair-checklist', authenticateToken, requireStaffOrAdmin, patchRepairReturnChecklist);
router.get('/:id',             authenticateToken, getTransactionById);

export default router;
