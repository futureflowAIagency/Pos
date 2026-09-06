import { Router } from 'express';
import { getPaymentAccounts, getPaymentAccountBalances, createPaymentAccount, updatePaymentAccount, togglePaymentAccount } from '../controllers/paymentAccountController.js';
import { protect } from '../middleware/auth.js';
import { requireBusiness, resolveBranch } from '../middleware/tenant.js';
import { authorize } from '../middleware/role.js';
import { requireModule } from '../middleware/permissions.js';

const router = Router();
// Managing the shop's named bank/mobile-banking accounts is an owner-level
// decision (same reasoning as Branches) — but every staff login that can
// record money (POS, Finance, Collect Due...) needs to READ the plain list to
// pick an account, so listing has no module gate. The actual BALANCES are more
// sensitive than the list of names, though — gated to the 'finance' module
// (same as the Finance page itself) so a plain POS cashier can pick an
// account without being able to see the whole shop's running bank balances.
router.use(protect, requireBusiness, resolveBranch);
router.get('/', getPaymentAccounts);
router.get('/balances', requireModule('finance'), getPaymentAccountBalances);
router.post('/', authorize('owner', 'superadmin'), createPaymentAccount);
router.put('/:id', authorize('owner', 'superadmin'), updatePaymentAccount);
router.patch('/:id/toggle', authorize('owner', 'superadmin'), togglePaymentAccount);

export default router;
