import { Router } from 'express';
import {
  lookupForClaim, getClaims, getClaim, createClaim, setClaimStatus, deleteClaim,
} from '../controllers/warrantyClaimController.js';
import { protect } from '../middleware/auth.js';
import { requireBusiness, resolveBranch } from '../middleware/tenant.js';
import { requireModule } from '../middleware/permissions.js';

const router = Router();
router.use(protect, requireBusiness, resolveBranch, requireModule('warranty'));

router.get('/lookup', lookupForClaim);
router.route('/').get(getClaims).post(createClaim);
router.route('/:id').get(getClaim).delete(deleteClaim);
router.patch('/:id/status', setClaimStatus);

export default router;
