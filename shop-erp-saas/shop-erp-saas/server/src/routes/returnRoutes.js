import { Router } from 'express';
import { createReturn, createExchange, getReturns, getReturn } from '../controllers/returnController.js';
import { protect } from '../middleware/auth.js';
import { requireBusiness, resolveBranch } from '../middleware/tenant.js';
import { requireModule } from '../middleware/permissions.js';

const router = Router();
router.use(protect, requireBusiness, resolveBranch, requireModule('returns'));
router.route('/').get(getReturns).post(createReturn);
router.post('/exchange', createExchange);
router.get('/:id', getReturn);
export default router;
