import { Router } from 'express';
import { getMyBusiness, updateBusiness, applyLowStockThresholdToAllProducts } from '../controllers/businessController.js';
import { protect } from '../middleware/auth.js';
import { requireBusiness } from '../middleware/tenant.js';
import { authorize } from '../middleware/role.js';
import { requireModule } from '../middleware/permissions.js';

const router = Router();
router.use(protect, requireBusiness);
// Every page needs basic business context (name/logo/currency), so GET stays open to
// any authenticated business user. Editing (PUT) is owner/superadmin-only regardless
// of module permissions — the 'settings' checkbox only controls whether the Settings
// nav link is shown to a staff member on the frontend, since they could never save here anyway.
router.get('/', getMyBusiness);
router.put('/', authorize('owner', 'superadmin'), updateBusiness);
router.patch('/apply-low-stock-threshold', authorize('owner', 'superadmin'), applyLowStockThresholdToAllProducts);
export default router;
