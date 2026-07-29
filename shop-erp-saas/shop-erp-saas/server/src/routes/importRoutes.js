import { Router } from 'express';
import multer from 'multer';
import { downloadTemplate, validateImport, commitImport, restoreBackup, smartImportPreview, smartImportCommit } from '../controllers/importController.js';
import { protect } from '../middleware/auth.js';
import { requireBusiness, resolveBranch } from '../middleware/tenant.js';
import { authorize } from '../middleware/role.js';
import { requireModule } from '../middleware/permissions.js';
import { uploadDataFile } from '../middleware/upload.js';

const router = Router();
router.use(protect, requireBusiness, resolveBranch, requireModule('import-export'));
const ownerOnly = authorize('owner', 'superadmin');

// Turn multer's own errors (e.g. file too large) into clean 400 responses.
const handleDataUpload = (req, res, next) =>
  uploadDataFile(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 10MB)' : err.message;
      return res.status(400).json({ success: false, message });
    }
    if (err) return res.status(err.statusCode || 400).json({ success: false, message: err.message });
    next();
  });

router.get('/:entity/template', downloadTemplate);
router.post('/backup/restore', ownerOnly, restoreBackup);
router.post('/smart/preview', ownerOnly, handleDataUpload, smartImportPreview);
router.post('/smart/commit', ownerOnly, handleDataUpload, smartImportCommit);
router.post('/:entity/validate', ownerOnly, validateImport);
router.post('/:entity/commit', ownerOnly, commitImport);
export default router;
