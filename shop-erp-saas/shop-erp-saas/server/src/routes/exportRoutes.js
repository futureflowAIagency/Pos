import { Router } from 'express';
import { exportEntity, fullBackup, importExportHistory } from '../controllers/exportController.js';
import { protect } from '../middleware/auth.js';
import { requireBusiness, resolveBranch } from '../middleware/tenant.js';
import { requireModule } from '../middleware/permissions.js';

const router = Router();
router.use(protect, requireBusiness, resolveBranch, requireModule('import-export'));
router.get('/backup/full', fullBackup);
router.get('/history/list', importExportHistory);
router.get('/:entity', exportEntity);
export default router;
