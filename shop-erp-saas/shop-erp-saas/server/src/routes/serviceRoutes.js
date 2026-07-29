import { Router } from 'express';
import {
  getServiceJobs, getServiceJob, createServiceJob, updateServiceJob, setServiceStatus, deleteServiceJob,
} from '../controllers/serviceController.js';
import { protect } from '../middleware/auth.js';
import { requireBusiness, resolveBranch } from '../middleware/tenant.js';
import { requireModule } from '../middleware/permissions.js';

const router = Router();
router.use(protect, requireBusiness, resolveBranch, requireModule('services'));

router.route('/').get(getServiceJobs).post(createServiceJob);
router.route('/:id').get(getServiceJob).put(updateServiceJob).delete(deleteServiceJob);
router.patch('/:id/status', setServiceStatus);

export default router;
