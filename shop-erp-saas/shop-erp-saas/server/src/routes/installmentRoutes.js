import { Router } from 'express';
import {
  getInstallments, getInstallment, createInstallment, payInstallment, deleteInstallment,
} from '../controllers/installmentController.js';
import { protect } from '../middleware/auth.js';
import { requireBusiness, resolveBranch } from '../middleware/tenant.js';
import { requireModule } from '../middleware/permissions.js';

const router = Router();
router.use(protect, requireBusiness, resolveBranch, requireModule('installments'));

router.route('/').get(getInstallments).post(createInstallment);
router.route('/:id').get(getInstallment).delete(deleteInstallment);
router.patch('/:id/pay', payInstallment);

export default router;
