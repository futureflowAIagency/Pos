import { Router } from 'express';
import { createScanSession, getScanSession, submitScan, closeScanSession } from '../controllers/scanSessionController.js';
import { protect } from '../middleware/auth.js';
import { requireBusiness, resolveBranch } from '../middleware/tenant.js';
import { requireModule } from '../middleware/permissions.js';

const router = Router();

// Public — no login. This is what an unauthenticated phone browser hits after
// scanning the POS's QR code; access is gated by the random session token, not a
// user session (the global /api rate limiter in app.js already applies here, and
// the token has too large a keyspace to brute-force within its 10-minute life).
router.get('/:id', getScanSession);
router.post('/:id/scans', submitScan);

// Authenticated — the connection is app-wide (Topbar), reachable from POS or Products.
router.post('/', protect, requireBusiness, resolveBranch, requireModule('pos', 'products'), createScanSession);
router.delete('/:id', protect, requireBusiness, resolveBranch, requireModule('pos', 'products'), closeScanSession);

export default router;
