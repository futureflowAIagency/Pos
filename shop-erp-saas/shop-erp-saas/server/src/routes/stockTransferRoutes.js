import { Router } from 'express';
import { getBranchStock, createStockTransfer, getStockTransfers } from '../controllers/stockTransferController.js';
import { protect } from '../middleware/auth.js';
import { requireBusiness } from '../middleware/tenant.js';
import { authorize } from '../middleware/role.js';

const router = Router();
// Owner-level, same gate as branchRoutes: moving stock between branches is a
// cross-branch action, so deliberately no resolveBranch here (these routes take
// the branches explicitly) and no per-module staff permission — a branch-locked
// staff login must not be able to move stock out of its own branch.
router.use(protect, requireBusiness, authorize('owner', 'superadmin'));

router.get('/stock', getBranchStock);
router.route('/').get(getStockTransfers).post(createStockTransfer);

export default router;
