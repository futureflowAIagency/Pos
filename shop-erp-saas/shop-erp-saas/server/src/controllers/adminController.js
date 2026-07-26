import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/apiResponse.js';
import Payment from '../models/Payment.js';
import Subscription, { PLANS } from '../models/Subscription.js';
import Business from '../models/Business.js';
import User from '../models/User.js';
import { createOwnerWithBusiness, publicUser } from './authController.js';

// @route GET /api/admin/overview
export const adminOverview = asyncHandler(async (req, res) => {
  const [businesses, owners, pendingPayments, activeSubs] = await Promise.all([
    Business.countDocuments(),
    User.countDocuments({ role: 'owner' }),
    Payment.countDocuments({ status: 'pending' }),
    Business.countDocuments({ subscriptionStatus: 'active' }),
  ]);
  ok(res, { overview: { businesses, owners, pendingPayments, activeSubs } });
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
export const listBusinesses = asyncHandler(async (req, res) => {
  const businesses = await Business.find().populate('owner', 'name email phone isActive').sort('-createdAt');
  ok(res, { businesses });
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
