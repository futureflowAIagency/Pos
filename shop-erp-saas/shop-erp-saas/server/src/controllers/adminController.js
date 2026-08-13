import mongoose from 'mongoose';
import { calculateObjectSize } from 'bson';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/apiResponse.js';
import Payment from '../models/Payment.js';
import Subscription, { PLANS } from '../models/Subscription.js';
import Business from '../models/Business.js';
import Branch from '../models/Branch.js';
import User from '../models/User.js';
import { createOwnerWithBusiness, publicUser } from './authController.js';

// @route GET /api/admin/overview
export const adminOverview = asyncHandler(async (req, res) => {
  const [businesses, owners, pendingPayments, activeSubs, branchCounts] = await Promise.all([
    Business.countDocuments(),
    User.countDocuments({ role: 'owner' }),
    Payment.countDocuments({ status: 'pending' }),
    Business.countDocuments({ subscriptionStatus: 'active' }),
    Branch.aggregate([{ $group: { _id: '$business', count: { $sum: 1 } } }]),
  ]);
  // "added branches" = has more than the one auto-created Main Branch
  const shopsWithBranches = branchCounts.filter((b) => b.count > 1).length;
  ok(res, { overview: { businesses, owners, pendingPayments, activeSubs, shopsWithBranches } });
});

// @route GET /api/admin/payments?status=pending
export const listPayments = asyncHandler(async (req, res) => {
  const q = {};
  if (req.query.status) q.status = req.query.status;
  const payments = await Payment.find(q)
    .populate('business', 'name type')
    .populate('submittedBy', 'name email')
    .sort('-createdAt');
  ok(res, { payments });
});

// @route PATCH /api/admin/payments/:id  body:{ action:'approve'|'reject', note }
export const reviewPayment = asyncHandler(async (req, res) => {
  const { action, note } = req.body;
  const payment = await Payment.findById(req.params.id);
  if (!payment) throw new ApiError(404, 'Payment not found');
  if (payment.status !== 'pending') throw new ApiError(400, 'Already reviewed');

  payment.reviewedBy = req.user._id;
  payment.reviewNote = note;

  if (action === 'approve') {
    payment.status = 'approved';
    // prefer the duration snapshot taken at submit time; fall back to default tiers for old records
    const days = payment.days || PLANS[payment.plan]?.days;
    if (!days) throw new ApiError(400, 'Payment has no valid duration');
    const business = await Business.findById(payment.business);
    // extend from current expiry if still active, else from now
    const base = business.subscriptionExpiry && business.subscriptionExpiry > new Date()
      ? new Date(business.subscriptionExpiry) : new Date();
    const endDate = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

    await Subscription.create({
      business: business._id,
      plan: payment.plan,
      amount: payment.amount,
      startDate: new Date(),
      endDate,
      status: 'active',
    });
    business.subscriptionStatus = 'active';
    business.subscriptionExpiry = endDate;
    await business.save();
  } else if (action === 'reject') {
    payment.status = 'rejected';
  } else {
    throw new ApiError(400, 'Invalid action');
  }

  await payment.save();
  ok(res, { payment }, `Payment ${payment.status}`);
});

// @route GET /api/admin/businesses
// Every business gets one auto-created "Main Branch" (see ensureMainBranches); a shop
// only shows up as having "added branches" once it has more than that one. We attach
// each business's branch list here so the superadmin can see who set up branches
// without opening a second screen.
export const listBusinesses = asyncHandler(async (req, res) => {
  const businesses = await Business.find().populate('owner', 'name email phone isActive').sort('-createdAt');
  const branches = await Branch.find().select('business name isMainBranch isActive').sort('-isMainBranch name').lean();
  const byBusiness = new Map();
  for (const b of branches) {
    const key = String(b.business);
    if (!byBusiness.has(key)) byBusiness.set(key, []);
    byBusiness.get(key).push(b);
  }
  const withBranches = businesses.map((biz) => {
    const list = byBusiness.get(String(biz._id)) || [];
    return {
      ...biz.toObject(),
      branches: list,
      branchCount: list.length,
      hasExtraBranches: list.length > 1, // more than just the default Main Branch
    };
  });
  ok(res, { businesses: withBranches });
});

// @route GET /api/admin/businesses/:id/summary
// Per-collection record counts for one shop, so the superadmin can see everything
// that business owns without opening MongoDB directly. Driven off the model
// registry (any schema with a `business` path) — same discovery rule deleteBusiness
// uses to know what to wipe — so a model added later shows up here automatically.
export const getBusinessSummary = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.params.id).populate('owner', 'name email phone isActive');
  if (!business) throw new ApiError(404, 'Business not found');

  const counts = {};
  for (const name of mongoose.modelNames()) {
    if (name === 'Business') continue;
    const Model = mongoose.model(name);
    if (!Model.schema.path('business')) continue;
    const count = await Model.countDocuments({ business: business._id });
    if (count) counts[name] = count;
  }
  ok(res, { business, counts });
});

// Collections whose ref fields are worth resolving to a readable name when browsing
// — kept small and generic on purpose rather than one-off per model.
const REF_POPULATE_FIELDS = ['branch', 'customer', 'supplier', 'product', 'soldBy', 'createdBy', 'user'];

// @route GET /api/admin/businesses/:id/records?model=Product&page=1&limit=50
// Paginated, read-only browse of one shop's data in a single collection — the
// "click a shop, see its data" view. Any model with a `business` path is fair
// game (same set deleteBusiness would wipe); anything else is rejected.
export const getBusinessRecords = asyncHandler(async (req, res) => {
  const { model } = req.query;
  if (!model || !mongoose.modelNames().includes(model)) throw new ApiError(400, 'Unknown collection');
  const Model = mongoose.model(model);
  if (model === 'Business' || !Model.schema.path('business')) throw new ApiError(400, 'Not a shop-scoped collection');

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const filter = { business: req.params.id };

  let query = Model.find(filter).sort('-createdAt').skip((page - 1) * limit).limit(limit);
  for (const field of REF_POPULATE_FIELDS) {
    if (Model.schema.path(field)) query = query.populate(field, 'name');
  }

  const [records, total] = await Promise.all([query.lean(), Model.countDocuments(filter)]);
  ok(res, { records, total, page, limit, model });
});

// @route GET /api/admin/storage
// Exact per-shop data-size accounting, in bytes — MongoDB does not track this
// per tenant natively (collection stats are collection-wide, not filterable by
// business), so it's computed on demand: the real BSON size of every document
// each business owns, summed across every business-scoped model (same
// discovery rule deleteBusiness uses to know what to wipe). One aggregation per
// collection groups by business in a single pass, so cost scales with the
// number of collections, not businesses × collections — but it still walks
// every document in the database, so this is meant to be called explicitly
// (a button), not loaded automatically on every page view.
export const getStorageUsage = asyncHandler(async (req, res) => {
  const businesses = await Business.find().select('_id name').lean();
  const totals = new Map(businesses.map((b) => [String(b._id), 0]));

  for (const name of mongoose.modelNames()) {
    if (name === 'Business') continue;
    const Model = mongoose.model(name);
    if (!Model.schema.path('business')) continue;

    let rows;
    try {
      // $bsonSize needs MongoDB 4.4+; exact and fast (server-side, no data transfer)
      rows = await Model.aggregate([
        { $group: { _id: '$business', bytes: { $sum: { $bsonSize: '$$ROOT' } } } },
      ]);
    } catch {
      // fallback for older MongoDB: pull docs and size them in JS (slower)
      const perBusiness = new Map();
      const cursor = Model.find().lean().cursor();
      for await (const doc of cursor) {
        const key = String(doc.business);
        perBusiness.set(key, (perBusiness.get(key) || 0) + calculateObjectSize(doc));
      }
      rows = [...perBusiness].map(([_id, bytes]) => ({ _id, bytes }));
    }

    for (const row of rows) {
      const key = String(row._id);
      if (totals.has(key)) totals.set(key, totals.get(key) + row.bytes);
    }
  }

  const usage = businesses.map((b) => ({ business: b._id, name: b.name, bytes: totals.get(String(b._id)) || 0 }));
  ok(res, { usage, computedAt: new Date() });
});

// @route POST /api/admin/owners  (Super Admin creates an Owner + their shop)
export const createOwner = asyncHandler(async (req, res) => {
  const { user, business } = await createOwnerWithBusiness(req.body);
  ok(res, { owner: publicUser(user), business }, 'Owner account created');
});

// @route PATCH /api/admin/businesses/:id/plan  (set/clear a shop's custom subscription price)
export const setBusinessPlan = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.params.id);
  if (!business) throw new ApiError(404, 'Business not found');

  const { enabled, label, price, days } = req.body;
  if (enabled) {
    const p = Number(price);
    const d = Number(days);
    if (!(p >= 0)) throw new ApiError(400, 'Valid price required');
    if (!(d > 0)) throw new ApiError(400, 'Valid duration (days) required');
    business.customPlan = {
      enabled: true,
      label: (label || 'Custom Plan').trim(),
      price: p,
      days: d,
    };
  } else {
    business.customPlan = { enabled: false, label: 'Custom Plan', price: 0, days: 30 };
  }
  await business.save();
  ok(res, { business }, 'Custom plan updated');
});

// Generates a random, human-typeable temporary password (avoids visually
// ambiguous characters like 0/O, 1/l/I).
const genTempPassword = () => {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
};

// @route POST /api/admin/businesses/:id/reset-password
// Resets the business owner's password to a freshly generated temporary one and
// returns it exactly once in this response. Passwords are always one-way hashed —
// there is no way to look up an existing password (by design), so a locked-out
// user is helped by issuing them a brand-new password, not by recovering the old one.
export const resetOwnerPassword = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.params.id);
  if (!business) throw new ApiError(404, 'Business not found');
  const owner = await User.findById(business.owner);
  if (!owner) throw new ApiError(404, 'Owner not found');

  const tempPassword = genTempPassword();
  owner.password = tempPassword; // hashed by User's pre-save hook
  await owner.save();

  ok(res, { tempPassword, owner: publicUser(owner) }, 'Password reset — share this with the owner now, it will not be shown again');
});

// @route DELETE /api/admin/businesses/:id
// Permanently removes a customer from the platform: the owner login, every staff
// login under that shop, the business itself, and all of its data. Irreversible —
// the UI makes the superadmin type the business name before this can be called.
// Deactivating (PATCH .../toggle) remains the reversible option.
export const deleteBusiness = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.params.id);
  if (!business) throw new ApiError(404, 'Business not found');

  const users = await User.find({ business: business._id });
  // a superadmin account must never be removable through the tenant list
  if (users.some((u) => u.role === 'superadmin') || String(business.owner) === String(req.user._id)) {
    throw new ApiError(400, 'This account cannot be deleted from here');
  }

  // Wipe every business-scoped collection. Driving this off the model registry
  // (any schema with a `business` path) means a model added later is covered
  // automatically instead of silently leaving orphaned rows behind.
  const deleted = {};
  for (const name of mongoose.modelNames()) {
    if (name === 'Business') continue;
    const Model = mongoose.model(name);
    if (!Model.schema.path('business')) continue;
    const { deletedCount } = await Model.deleteMany({ business: business._id });
    if (deletedCount) deleted[name] = deletedCount;
  }
  // the owner may predate the `business` back-reference — remove them explicitly too
  await User.deleteMany({ _id: business.owner, role: { $ne: 'superadmin' } });
  await Business.deleteOne({ _id: business._id });

  ok(res, { deleted, business: business.name }, `${business.name} and its data were deleted`);
});

// @route PATCH /api/admin/businesses/:id/toggle  (enable/disable owner)
export const toggleBusinessOwner = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.params.id);
  if (!business) throw new ApiError(404, 'Business not found');
  const owner = await User.findById(business.owner);
  owner.isActive = !owner.isActive;
  await owner.save();
  ok(res, { ownerActive: owner.isActive }, 'Owner status toggled');
});
