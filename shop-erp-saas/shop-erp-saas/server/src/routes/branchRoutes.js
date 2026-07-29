import { Router } from 'express';
import { getBranches, createBranch, updateBranch, setMainBranch, toggleBranch } from '../controllers/branchController.js';
import { protect } from '../middleware/auth.js';
import { requireBusiness } from '../middleware/tenant.js';
import { authorize } from '../middleware/role.js';

const router = Router();
// Branch management is an owner-level business-structure decision, not a
// per-module staff permission — no requireModule/requireBranch here, since this
// route defines the branches other routes' resolveBranch depends on.
router.use(protect, requireBusiness, authorize('owner', 'superadmin'));

router.route('/').get(getBranches).post(createBranch);
router.put('/:id', updateBranch);
router.patch('/:id/main', setMainBranch);
router.patch('/:id/toggle', toggleBranch);

export default router;
