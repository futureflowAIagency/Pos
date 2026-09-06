import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok, created } from '../utils/apiResponse.js';
import { tenantFilter, branchFilter } from '../middleware/tenant.js';
import { logActivity } from '../middleware/activityLogger.js';
import WarrantyClaim, { WARRANTY_CLAIM_STATUSES } from '../models/WarrantyClaim.js';
import PhoneUnit from '../models/PhoneUnit.js';
import Customer from '../models/Customer.js';
import Product from '../models/Product.js';

const genClaimNo = () => 'WC-' + Date.now().toString().slice(-8) + '-' + Math.floor(Math.random() * 90 + 10);

// @route GET /api/warranty-claims/lookup?imei=...
// Prefills the "New Claim" form from a device this shop actually sold — product,
// IMEI/serial and the customer's full contact details, plus current warranty
// status so the counter can see at a glance whether the claim is legitimate.
// Business-wide (like the Warranty Check portal) — a customer may not remember
// which branch they bought from.
export const lookupForClaim = asyncHandler(async (req, res) => {
  const { imei } = req.query;
  if (!imei) throw new ApiError(400, 'IMEI / serial is required');
  const term = imei.trim();
  const unit = await PhoneUnit.findOne(tenantFilter(req, {
    $or: [{ imei1: term }, { imei2: term }, { serial: term }],
  }))
    .populate('product', 'name brand color storage')
    .populate('customer', 'name phone nid address');
  if (!unit) throw new ApiError(404, 'No device found for this IMEI/serial in your shop — you can still add this claim manually');

  const now = new Date();
  const active = unit.status === 'sold' && unit.warrantyExpiry && new Date(unit.warrantyExpiry) >= now;
  ok(res, {
    result: {
      unit: unit._id,
      product: unit.product?._id || null,
      productName: unit.product?.name || '',
      productVariant: [unit.product?.brand, unit.product?.storage, unit.product?.color].filter(Boolean).join(' – '),
      imei1: unit.imei1,
      imei2: unit.imei2,
      serial: unit.serial,
      soldStatus: unit.status,
      soldAt: unit.soldAt,
      customer: unit.customer?._id || null,
      customerName: unit.customer?.name || unit.customerName || '',
      customerPhone: unit.customer?.phone || '',
      customerNid: unit.customer?.nid || '',
      customerAddress: unit.customer?.address || '',
      warrantyMonths: unit.warrantyMonths,
      warrantyExpiry: unit.warrantyExpiry,
      warrantyBrandMonths: unit.warrantyBrandMonths,
      warrantyShopMonths: unit.warrantyShopMonths,
      warrantyBrandExpiry: unit.warrantyBrandExpiry,
      warrantyShopExpiry: unit.warrantyShopExpiry,
      warrantyStatus: unit.status !== 'sold' ? 'not_sold' : (active ? 'active' : 'expired'),
    },
  });
});

// @route GET /api/warranty-claims/summary
// Counts by status — independent of whatever search/status filter the claims
// list itself is currently showing, so the dashboard always reflects the truth.
export const getClaimsSummary = asyncHandler(async (req, res) => {
  const rows = await WarrantyClaim.aggregate([
    { $match: branchFilter(req) },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const counts = Object.fromEntries(WARRANTY_CLAIM_STATUSES.map((s) => [s, 0]));
  rows.forEach((r) => { if (counts[r._id] !== undefined) counts[r._id] = r.count; });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  ok(res, { counts, total });
});

// @route GET /api/warranty-claims?status=&search=
export const getClaims = asyncHandler(async (req, res) => {
  const { status, search } = req.query;
  const q = branchFilter(req);
  if (status) q.status = status;
  if (search) q.$or = [
    { claimNo: { $regex: search, $options: 'i' } },
    { customerName: { $regex: search, $options: 'i' } },
    { customerPhone: { $regex: search, $options: 'i' } },
    { productName: { $regex: search, $options: 'i' } },
    { imei1: { $regex: search, $options: 'i' } },
    { serial: { $regex: search, $options: 'i' } },
  ];
  const claims = await WarrantyClaim.find(q).sort('-createdAt');
  ok(res, { claims, count: claims.length });
});

// @route GET /api/warranty-claims/:id
export const getClaim = asyncHandler(async (req, res) => {
  const claim = await WarrantyClaim.findOne(branchFilter(req, { _id: req.params.id }));
  if (!claim) throw new ApiError(404, 'Warranty claim not found');
  ok(res, { claim });
});

// @route POST /api/warranty-claims
// body: { unit?, product?, productName, imei1?, imei2?, serial?, customer?,
//         customerName, customerPhone?, customerNid?, customerAddress?, problem? }
// Works whether the device was matched via IMEI lookup (unit/product/customer ids
// present) or entered by hand (ids blank, everything else free text).
export const createClaim = asyncHandler(async (req, res) => {
  const { productName, customerName, unit, customer, product } = req.body;
  if (!productName?.trim()) throw new ApiError(400, 'Product name is required');
  if (!customerName?.trim()) throw new ApiError(400, "Customer name is required");

  // only keep referenced ids if they actually belong to this business — the ids
  // normally come straight from our own lookup response, but never trust them blindly
  let unitId = null;
  if (unit) {
    const u = await PhoneUnit.findOne(tenantFilter(req, { _id: unit }));
    if (u) unitId = u._id;
  }
  let customerId = null;
  if (customer) {
    const c = await Customer.findOne(tenantFilter(req, { _id: customer }));
    if (c) customerId = c._id;
  }
  let productId = null;
  if (product) {
    const p = await Product.findOne(tenantFilter(req, { _id: product }));
    if (p) productId = p._id;
  }

  const claim = await WarrantyClaim.create({
    business: req.businessId,
    branch: req.branchId,
    claimNo: genClaimNo(),
    unit: unitId,
    product: productId,
    productName: productName.trim(),
    imei1: req.body.imei1 || '',
    imei2: req.body.imei2 || '',
    serial: req.body.serial || '',
    customer: customerId,
    customerName: customerName.trim(),
    customerPhone: req.body.customerPhone || '',
    customerNid: req.body.customerNid || '',
    customerAddress: req.body.customerAddress || '',
    problem: req.body.problem || '',
    status: 'pending',
    statusHistory: [{ status: 'pending', at: new Date() }],
    createdBy: req.user._id,
  });
  await logActivity(req, { action: 'CREATE_WARRANTY_CLAIM', entity: 'WarrantyClaim', entityId: claim._id, meta: { claimNo: claim.claimNo } });
  created(res, { claim });
});

// @route PATCH /api/warranty-claims/:id/status  body: { status }
export const setClaimStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!WARRANTY_CLAIM_STATUSES.includes(status)) throw new ApiError(400, 'Invalid status');
  const claim = await WarrantyClaim.findOne(branchFilter(req, { _id: req.params.id }));
  if (!claim) throw new ApiError(404, 'Warranty claim not found');
  claim.status = status;
  claim.statusHistory.push({ status, at: new Date() });
  await claim.save();
  await logActivity(req, { action: 'WARRANTY_CLAIM_STATUS', entity: 'WarrantyClaim', entityId: claim._id, meta: { status } });
  ok(res, { claim }, `Status updated to ${status}`);
});

// @route DELETE /api/warranty-claims/:id
export const deleteClaim = asyncHandler(async (req, res) => {
  const claim = await WarrantyClaim.findOneAndDelete(branchFilter(req, { _id: req.params.id }));
  if (!claim) throw new ApiError(404, 'Warranty claim not found');
  await logActivity(req, { action: 'DELETE_WARRANTY_CLAIM', entity: 'WarrantyClaim', entityId: claim._id });
  ok(res, {}, 'Warranty claim deleted');
});
