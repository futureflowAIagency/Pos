import { Router } from 'express';
import { createSale, getSales, getSale, searchInvoices, updateSale, collectSaleDue, payMoneyBack, salesReport } from '../controllers/saleController.js';
import { protect } from '../middleware/auth.js';
import { requireBusiness, resolveBranch } from '../middleware/tenant.js';
import { requireModule } from '../middleware/permissions.js';

const router = Router();
router.use(protect, requireBusiness, resolveBranch, requireModule('pos'));
router.route('/').get(getSales).post(createSale);
router.get('/report', salesReport);
router.get('/search', searchInvoices); // must stay above '/:id'
router.get('/:id', getSale);
router.patch('/:id', updateSale);
router.post('/:id/collect-due', collectSaleDue);
router.post('/:id/money-back', payMoneyBack);
export default router;
