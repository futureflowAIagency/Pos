import { Router } from 'express';
import { dashboardSummary, revenueChart, aiSummary } from '../controllers/dashboardController.js';
import { protect } from '../middleware/auth.js';
import { requireBusiness, resolveBranch } from '../middleware/tenant.js';
import { requireModule } from '../middleware/permissions.js';

const router = Router();
router.use(protect, requireBusiness, resolveBranch, requireModule('dashboard'));
router.get('/summary', dashboardSummary);
router.get('/revenue-chart', revenueChart);
router.post('/ai-summary', aiSummary);
export default router;
