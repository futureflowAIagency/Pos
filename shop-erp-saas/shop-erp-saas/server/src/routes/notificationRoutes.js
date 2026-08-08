import { Router } from 'express';
import { getNotifications, markRead } from '../controllers/notificationController.js';
import { protect } from '../middleware/auth.js';
import { requireBusiness, resolveBranch } from '../middleware/tenant.js';

const router = Router();
router.use(protect, requireBusiness, resolveBranch);
router.get('/', getNotifications);
router.patch('/read', markRead);
export default router;
