import { Router } from 'express';
import { getCustomers, createCustomer, updateCustomer, deleteCustomer, customerHistory, collectDue } from '../controllers/customerController.js';
import { protect } from '../middleware/auth.js';
import { requireBusiness, resolveBranch } from '../middleware/tenant.js';
import { requireModule } from '../middleware/permissions.js';

const router = Router();
// Customer itself is business-wide (Phase 25), not branch-scoped — resolveBranch
// is only needed here so collect-due can stamp DuePayment.branch (that model IS
// branch-scoped, since collecting a due happens at a specific till).
router.use(protect, requireBusiness, resolveBranch, requireModule('customers'));
router.route('/').get(getCustomers).post(createCustomer);
router.route('/:id').put(updateCustomer).delete(deleteCustomer);
router.get('/:id/history', customerHistory);
router.post('/:id/collect-due', collectDue);
export default router;
