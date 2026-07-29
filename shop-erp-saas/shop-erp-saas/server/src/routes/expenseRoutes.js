import { Router } from 'express';
import { getExpenses, createExpense, deleteExpense } from '../controllers/expenseController.js';
import { protect } from '../middleware/auth.js';
import { requireBusiness, resolveBranch } from '../middleware/tenant.js';
import { requireModule } from '../middleware/permissions.js';

const router = Router();
router.use(protect, requireBusiness, resolveBranch, requireModule('finance'));
router.route('/').get(getExpenses).post(createExpense);
router.delete('/:id', deleteExpense);
export default router;
