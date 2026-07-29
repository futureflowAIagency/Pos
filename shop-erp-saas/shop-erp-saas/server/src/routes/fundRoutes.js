import { Router } from 'express';
import { getFunds, createFund, deleteFund } from '../controllers/fundController.js';
import { protect } from '../middleware/auth.js';
import { requireBusiness, resolveBranch } from '../middleware/tenant.js';
import { requireModule } from '../middleware/permissions.js';

const router = Router();
router.use(protect, requireBusiness, resolveBranch, requireModule('finance'));
router.route('/').get(getFunds).post(createFund);
router.delete('/:id', deleteFund);
export default router;
