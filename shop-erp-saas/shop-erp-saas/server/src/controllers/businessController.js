import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/apiResponse.js';
import { logActivity } from '../middleware/activityLogger.js';
import Business from '../models/Business.js';
import Product from '../models/Product.js';

// @route GET /api/business
export const getMyBusiness = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.businessId);
  ok(res, { business });
});

// @route PUT /api/business
export const updateBusiness = asyncHandler(async (req, res) => {
  const allowed = ['name', 'type', 'address', 'phone', 'email', 'logoUrl', 'currency', 'footerWebsite', 'settings'];
  const update = {};
  allowed.forEach((k) => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
  const business = await Business.findByIdAndUpdate(req.businessId, update, { new: true });
  await logActivity(req, { action: 'UPDATE_BUSINESS', entity: 'Business', entityId: business._id });
  ok(res, { business }, 'Business updated');
});

// @route PATCH /api/business/apply-low-stock-threshold
// Retroactively sets EVERY existing product's own Low Stock Alert to the
// shop's current Settings → Low Stock Threshold value (business-wide, across
// every branch — this setting isn't per-branch). Needed because the
// threshold shown in Settings only ever drove the DEFAULT for brand-new
// products/imports going forward; products that already existed before the
// owner picked a number (or before this feature existed at all) keep
// whatever value they were originally created with, which can silently
// disagree with the shop's current setting — this is an explicit, owner-
// triggered action to bring the whole existing catalog back in sync, not
// something that runs automatically on every Settings save.
export const applyLowStockThresholdToAllProducts = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.businessId);
  const threshold = Number(business?.settings?.lowStockThreshold);
  if (!Number.isFinite(threshold) || threshold < 0) throw new ApiError(400, 'Set a valid Low Stock Threshold first');
  const result = await Product.updateMany({ business: req.businessId }, { $set: { lowStockAlert: threshold } });
  await logActivity(req, { action: 'APPLY_LOW_STOCK_THRESHOLD', entity: 'Business', entityId: business._id, meta: { threshold, matched: result.matchedCount, modified: result.modifiedCount } });
  ok(res, { threshold, updated: result.modifiedCount }, `Low Stock Alert updated on ${result.modifiedCount} product(s)`);
});
