import { Router } from 'express';
import { getTransfers, createTransfer, deleteTransfer } from '../controllers/transferController.js';
import { protect } from '../middleware/auth.js';
import { requireBusiness, resolveBranch } from '../middleware/tenant.js';
import { requireModule } from '../middleware/permissions.js';

const router = Router();
router.use(protect, requireBusiness, resolveBranch, requireModule('finance'));
router.route('/').get(getTransfers).post(createTransfer);
router.delete('/:id', deleteTransfer);
export default router;
