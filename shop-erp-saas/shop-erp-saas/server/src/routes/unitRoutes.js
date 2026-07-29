import { Router } from 'express';
import { getUnits, addUnits, deleteUnit, lookupUnit, warrantyCheck } from '../controllers/phoneUnitController.js';
import { protect } from '../middleware/auth.js';
import { requireBusiness, resolveBranch } from '../middleware/tenant.js';
import { requireModule } from '../middleware/permissions.js';

const router = Router();
// Units (IMEI/serial) are used from Products, POS, EMI, and Warranty Check — any one grants access.
router.use(protect, requireBusiness, resolveBranch, requireModule('products', 'pos', 'installments', 'warranty'));

router.get('/lookup', lookupUnit);     // POS: resolve an in-stock device by IMEI
router.get('/warranty', warrantyCheck); // Warranty check portal
router.route('/').get(getUnits).post(addUnits);
router.delete('/:id', deleteUnit);

export default router;
