import { Router } from 'express';
import {
  getSuppliers, createSupplier, updateSupplier, deleteSupplier,
  supplierLedger, recordPurchase, paySupplier, supplierDashboard, supplierProductBreakdown,
  adjustSupplierDue,
} from '../controllers/supplierController.js';
import { protect } from '../middleware/auth.js';
import { requireBusiness } from '../middleware/tenant.js';
import { requireModule } from '../middleware/permissions.js';

const router = Router();
router.use(protect, requireBusiness, requireModule('suppliers'));

router.route('/').get(getSuppliers).post(createSupplier);
router.get('/dashboard/summary', supplierDashboard);
router.route('/:id').get(supplierLedger).put(updateSupplier).delete(deleteSupplier);
router.post('/:id/purchase', recordPurchase);
router.post('/:id/pay', paySupplier);
router.patch('/:id/due', adjustSupplierDue);
router.get('/:id/products', supplierProductBreakdown);

export default router;
