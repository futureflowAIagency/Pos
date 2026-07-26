import { Router } from 'express';
import { adminOverview, listPayments, reviewPayment, listBusinesses, toggleBusinessOwner, createOwner, setBusinessPlan, resetOwnerPassword, deleteBusiness } from '../controllers/adminController.js';
import { protect } from '../middleware/auth.js';
import { superadminOnly } from '../middleware/role.js';

const router = Router();
router.use(protect, superadminOnly);
router.get('/overview', adminOverview);
router.get('/payments', listPayments);
router.patch('/payments/:id', reviewPayment);
router.get('/businesses', listBusinesses);
router.post('/owners', createOwner);
router.patch('/businesses/:id/toggle', toggleBusinessOwner);
router.post('/businesses/:id/reset-password', resetOwnerPassword);
router.patch('/businesses/:id/plan', setBusinessPlan);
router.delete('/businesses/:id', deleteBusiness);
export default router;
