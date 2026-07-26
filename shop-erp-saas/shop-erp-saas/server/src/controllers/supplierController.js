import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok, created } from '../utils/apiResponse.js';
import { tenantFilter } from '../middleware/tenant.js';
import { logActivity } from '../middleware/activityLogger.js';
import Supplier from '../models/Supplier.js';
import Purchase from '../models/Purchase.js';
import Product from '../models/Product.js';
import Sale from '../models/Sale.js';

const TENDERS = ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card'];

// @route GET /api/suppliers?search=
export const getSuppliers = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const q = tenantFilter(req, { isActive: true });
  if (search) q.$or = [{ name: { $regex: search, $options: 'i' } }, { phone: { $regex: search, $options: 'i' } }];
  const suppliers = await Supplier.find(q).sort('-createdAt');
  ok(res, { suppliers, count: suppliers.length });
});

// @route POST /api/suppliers
export const createSupplier = asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) throw new ApiError(400, 'Supplier name is required');
  const supplier = await Supplier.create({ ...req.body, business: req.businessId });
  await logActivity(req, { action: 'CREATE_SUPPLIER', entity: 'Supplier', entityId: supplier._id, meta: { name: supplier.name } });
  created(res, { supplier });
});

// @route PUT /api/suppliers/:id
export const updateSupplier = asyncHandler(async (req, res) => {
  // running totals are managed by purchase/payment entries, not direct edits
  const { totalPurchase, totalPaid, ...rest } = req.body;
  const supplier = await Supplier.findOneAndUpdate(tenantFilter(req, { _id: req.params.id }), rest, { new: true });
  if (!supplier) throw new ApiError(404, 'Supplier not found');
  await logActivity(req, { action: 'UPDATE_SUPPLIER', entity: 'Supplier', entityId: supplier._id });
  ok(res, { supplier }, 'Supplier updated');
});

// @route DELETE /api/suppliers/:id  (soft delete)
export const deleteSupplier = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findOneAndUpdate(tenantFilter(req, { _id: req.params.id }), { isActive: false }, { new: true });
  if (!supplier) throw new ApiError(404, 'Supplier not found');
  await logActivity(req, { action: 'DELETE_SUPPLIER', entity: 'Supplier', entityId: supplier._id });
  ok(res, {}, 'Supplier deleted');
});

// @route GET /api/suppliers/:id  -> supplier + purchase/payment ledger
export const supplierLedger = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findOne(tenantFilter(req, { _id: req.params.id }));
  if (!supplier) throw new ApiError(404, 'Supplier not found');
  const entries = await Purchase.find(tenantFilter(req, { supplier: supplier._id })).sort('-createdAt');
  ok(res, { supplier, entries });
});

// @route POST /api/suppliers/:id/purchase
// body: { items:[{name, qty, unitCost}], reference, note, paid, source }
export const recordPurchase = asyncHandler(async (req, res) => {
  const { items = [], reference = '', note = '', paid = 0, source = 'cash' } = req.body;
  const supplier = await Supplier.findOne(tenantFilter(req, { _id: req.params.id }));
  if (!supplier) throw new ApiError(404, 'Supplier not found');

  const total = items.reduce((s, it) => s + Number(it.unitCost || 0) * Number(it.qty || 0), 0);
  if (total <= 0) throw new ApiError(400, 'Purchase total must be greater than 0');
  const paidAmt = Math.min(Number(paid || 0), total);

  const purchase = await Purchase.create({
    business: req.businessId,
    supplier: supplier._id,
    kind: 'purchase',
    reference, note,
    items: items.map((it) => ({ name: it.name, qty: Number(it.qty || 0), unitCost: Number(it.unitCost || 0) })),
    total,
    paid: paidAmt,
    due: Math.max(0, total - paidAmt),
    source: TENDERS.includes(source) ? source : 'cash',
    createdBy: req.user._id,
  });

  supplier.totalPurchase += total;
  supplier.totalPaid += paidAmt;
  await supplier.save();

  await logActivity(req, { action: 'RECORD_PURCHASE', entity: 'Supplier', entityId: supplier._id, meta: { total, paid: paidAmt } });
  created(res, { purchase, supplier });
});

// @route POST /api/suppliers/:id/pay  body: { amount, note, source }
export const paySupplier = asyncHandler(async (req, res) => {
  const { amount, note = '', source = 'cash' } = req.body;
  const amt = Number(amount || 0);
  if (amt <= 0) throw new ApiError(400, 'Payment amount must be greater than 0');
  const supplier = await Supplier.findOne(tenantFilter(req, { _id: req.params.id }));
  if (!supplier) throw new ApiError(404, 'Supplier not found');

  const payment = await Purchase.create({
    business: req.businessId,
    supplier: supplier._id,
    kind: 'payment',
    note,
    items: [],
    total: 0,
    paid: amt,
    due: 0,
    source: TENDERS.includes(source) ? source : 'cash',
    createdBy: req.user._id,
  });

  supplier.totalPaid += amt;
  await supplier.save();

  await logActivity(req, { action: 'PAY_SUPPLIER', entity: 'Supplier', entityId: supplier._id, meta: { amount: amt } });
  ok(res, { payment, supplier }, 'Payment recorded');
});

// @route PATCH /api/suppliers/:id/due  body: { due, note }
// Sets the supplier's outstanding due to an exact figure. This is a CORRECTION,
// not a payment: `totalPaid` (real money that actually left the shop) is never
// touched — `totalPurchase` is moved to `totalPaid + due` so the due virtual
// lands exactly on the requested number. The signed difference is written to the
// ledger as a `kind:'adjustment'` entry with `paid: 0`, so the change is
// auditable while leaving the balance engine and the purchase reports alone.
// Used for opening balances carried over from an old system, or fixing a
// mistyped purchase — money actually paid still goes through /pay.
export const adjustSupplierDue = asyncHandler(async (req, res) => {
  const { due, note = '' } = req.body;
  const target = Number(due);
  if (!Number.isFinite(target) || target < 0) throw new ApiError(400, 'Enter a valid due amount (0 or more)');

  const supplier = await Supplier.findOne(tenantFilter(req, { _id: req.params.id }));
  if (!supplier) throw new ApiError(404, 'Supplier not found');

  const previousDue = Math.max(0, (supplier.totalPurchase || 0) - (supplier.totalPaid || 0));
  const newTotalPurchase = (supplier.totalPaid || 0) + target;
  const delta = newTotalPurchase - (supplier.totalPurchase || 0);
  if (delta === 0) return ok(res, { supplier }, 'Due is already this amount');

  const adjustment = await Purchase.create({
    business: req.businessId,
    supplier: supplier._id,
    kind: 'adjustment',
    note: note || `Due corrected from ${previousDue} to ${target}`,
    items: [],
    total: delta, // signed: positive raises the due, negative lowers it
    paid: 0,      // no money moved — keeps balances/reports untouched
    due: delta,
    createdBy: req.user._id,
  });

  supplier.totalPurchase = newTotalPurchase;
  await supplier.save();

  await logActivity(req, {
    action: 'ADJUST_SUPPLIER_DUE', entity: 'Supplier', entityId: supplier._id,
    meta: { previousDue, newDue: target, delta },
  });
  ok(res, { adjustment, supplier }, 'Due updated');
});

// @route GET /api/suppliers/:id/products — per-product breakdown for one supplier:
// how much of each product was bought from them, how many have sold (shop-wide,
// since a sale doesn't record which supplier a unit came from), and live stock.
export const supplierProductBreakdown = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findOne(tenantFilter(req, { _id: req.params.id }));
  if (!supplier) throw new ApiError(404, 'Supplier not found');
  const bId = new mongoose.Types.ObjectId(req.businessId);

  const purchased = await Purchase.aggregate([
    { $match: { business: bId, supplier: supplier._id, kind: 'purchase' } },
    { $unwind: '$items' },
    { $match: { 'items.product': { $ne: null } } },
    { $group: { _id: '$items.product', name: { $last: '$items.name' }, purchasedQty: { $sum: '$items.qty' } } },
    { $sort: { purchasedQty: -1 } },
  ]);
  if (!purchased.length) return ok(res, { supplier, products: [] });

  const productIds = purchased.map((p) => p._id);
  const [products, soldAgg] = await Promise.all([
    Product.find(tenantFilter(req, { _id: { $in: productIds } })),
    Sale.aggregate([
      { $match: { business: bId } },
      { $unwind: '$items' },
      { $match: { 'items.product': { $in: productIds } } },
      { $group: { _id: '$items.product', soldQty: { $sum: '$items.qty' } } },
    ]),
  ]);
  const soldMap = Object.fromEntries(soldAgg.map((s) => [String(s._id), s.soldQty]));
  const prodMap = Object.fromEntries(products.map((p) => [String(p._id), p]));

  const rows = purchased.map((p) => ({
    productId: p._id,
    name: prodMap[String(p._id)]?.name || p.name,
    purchasedQty: p.purchasedQty,
    soldQty: soldMap[String(p._id)] || 0, // shop-wide sold qty for this product, not exclusively from this supplier's batch
    currentStock: prodMap[String(p._id)]?.stock ?? null,
  }));

  ok(res, { supplier, products: rows });
});

// @route GET /api/suppliers/dashboard/summary — aggregate supplier financials (req 12)
export const supplierDashboard = asyncHandler(async (req, res) => {
  const suppliers = await Supplier.find(tenantFilter(req, { isActive: true }));
  const totals = suppliers.reduce((acc, s) => {
    acc.totalPurchase += s.totalPurchase || 0;
    acc.totalPaid += s.totalPaid || 0;
    return acc;
  }, { totalPurchase: 0, totalPaid: 0 });
  totals.totalDue = Math.max(0, totals.totalPurchase - totals.totalPaid);

  const topDue = suppliers
    .map((s) => ({ _id: s._id, name: s.name, phone: s.phone, due: s.due }))
    .filter((s) => s.due > 0)
    .sort((a, b) => b.due - a.due)
    .slice(0, 8);

  const recentPurchases = await Purchase.find(tenantFilter(req, { kind: 'purchase' }))
    .sort('-createdAt').limit(8).populate('supplier', 'name');

  ok(res, { totals, topDue, recentPurchases, supplierCount: suppliers.length });
});
