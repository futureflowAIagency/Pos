import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok, created } from '../utils/apiResponse.js';
import { tenantFilter } from '../middleware/tenant.js';
import { logActivity } from '../middleware/activityLogger.js';
import Sale from '../models/Sale.js';
import Product from '../models/Product.js';
import Customer from '../models/Customer.js';
import PhoneUnit from '../models/PhoneUnit.js';
import DuePayment from '../models/DuePayment.js';

const TENDERS = ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card'];

const genInvoiceNo = () =>
  'INV-' + Date.now().toString().slice(-8) + '-' + Math.floor(Math.random() * 90 + 10);

// @route POST /api/sales  (POS checkout)
// body: { items:[{product, qty, unit?}], discount, paid, paymentMethod, payments?:[{method,amount}], customer, customerName, customerPhone, customerNid }
// `payments` (split/multi-tender) takes precedence when provided; otherwise a single
// tender is synthesized from paymentMethod+paid (back-compat with older clients).
export const createSale = asyncHandler(async (req, res) => {
  const { items = [], discount = 0, paid = 0, paymentMethod = 'cash', payments: reqPayments = null, customer = null, customerName: reqName = '', customerPhone = '', customerNid = '' } = req.body;
  if (!items.length) throw new ApiError(400, 'No items in sale');
  // Customer identity is OPTIONAL for every shop type — a counter/walk-in sale
  // needs no name or phone. The one exception is enforced below, once the due is
  // known: an unpaid balance must be attached to someone or it's untraceable.

  // Normalize the payment breakdown: drop zero/invalid lines, clamp to known tenders.
  const cleanPayments = (Array.isArray(reqPayments) ? reqPayments : [])
    .map((p) => ({ method: TENDERS.includes(p.method) ? p.method : 'cash', amount: Number(p.amount) || 0 }))
    .filter((p) => p.amount > 0);
  const paidTotal = cleanPayments.length ? cleanPayments.reduce((s, p) => s + p.amount, 0) : Number(paid) || 0;

  const session = await mongoose.startSession();
  let sale;
  try {
    await session.withTransaction(async () => {
      const lineItems = [];
      const soldUnits = []; // { unit, warrantyMonths, warrantyExpiry, sellingPrice }
      let subTotal = 0;
      let profit = 0;

      for (const it of items) {
        const product = await Product.findOne(tenantFilter(req, { _id: it.product })).session(session);
        if (!product) throw new ApiError(404, `Product not found: ${it.product}`);

        // apply the product's percentage discount to get the effective selling price
        const pct = Math.min(Math.max(product.discountPercent || 0, 0), 100);
        const unitPrice = Math.round((product.sellingPrice * (1 - pct / 100)) * 100) / 100;

        const line = {
          product: product._id,
          name: product.name,
          qty: it.qty,
          purchasePrice: product.purchasePrice,
          mrp: product.sellingPrice,
          discountPercent: pct,
          sellingPrice: unitPrice,
        };

        if (it.unit) {
          // serial-tracked (mobile) line — exactly one specific device by IMEI
          const unit = await PhoneUnit.findOne(tenantFilter(req, { _id: it.unit })).session(session);
          if (!unit) throw new ApiError(404, 'Selected device unit not found');
          if (unit.status === 'sold') throw new ApiError(400, `Device ${unit.imei1 || unit.serial} is already sold`);
          if (String(unit.product) !== String(product._id)) throw new ApiError(400, 'Unit does not match product');

          line.qty = 1;
          const MONTH = 30 * 24 * 60 * 60 * 1000;
          const now = Date.now();
          const brandMonths = product.warrantyBrandMonths || 0;
          const shopMonths = product.warrantyShopMonths || 0;
          const brandExpiry = brandMonths > 0 ? new Date(now + brandMonths * MONTH) : null;
          const shopExpiry = shopMonths > 0 ? new Date(now + shopMonths * MONTH) : null;
          const wMonths = Math.max(brandMonths, shopMonths);            // effective (legacy)
          const wExpiry = wMonths > 0 ? new Date(now + wMonths * MONTH) : null;
          line.unit = unit._id;
          line.imei1 = unit.imei1;
          line.imei2 = unit.imei2;
          line.serial = unit.serial;
          line.warrantyMonths = wMonths;
          line.warrantyExpiry = wExpiry;
          line.warrantyBrandMonths = brandMonths;
          line.warrantyShopMonths = shopMonths;
          line.warrantyBrandExpiry = brandExpiry;
          line.warrantyShopExpiry = shopExpiry;

          subTotal += unitPrice;
          profit += unitPrice - product.purchasePrice;
          product.stock = Math.max(0, product.stock - 1);
          await product.save({ session });
          soldUnits.push({ unit, warrantyMonths: wMonths, warrantyExpiry: wExpiry, brandMonths, shopMonths, brandExpiry, shopExpiry, sellingPrice: unitPrice });
        } else {
          // standard quantity-based line
          if (product.stock < it.qty) throw new ApiError(400, `Insufficient stock for ${product.name}`);
          subTotal += unitPrice * it.qty;
          profit += (unitPrice - product.purchasePrice) * it.qty;
          product.stock -= it.qty;
          await product.save({ session });
        }

        lineItems.push(line);
      }

      const total = Math.max(0, subTotal - discount);
      const due = Math.max(0, total - paidTotal);

      // Resolve the customer — find an existing one (by id or phone) or create a
      // new record on the fly. This keeps dues attached and lets old invoices be
      // looked up by phone number later.
      let custDoc = null;
      if (customer) custDoc = await Customer.findOne(tenantFilter(req, { _id: customer })).session(session);
      if (!custDoc && customerPhone) custDoc = await Customer.findOne(tenantFilter(req, { phone: String(customerPhone).trim() })).session(session);
      if (!custDoc && (reqName || customerPhone)) {
        [custDoc] = await Customer.create([{
          business: req.businessId,
          name: String(reqName).trim() || 'Customer',
          phone: String(customerPhone).trim(),
          nid: customerNid || '',
        }], { session });
      }

      // A due can only be collected later if it belongs to a customer record.
      if (due > 0 && !custDoc) throw new ApiError(400, 'Customer name or phone is required when the sale leaves a due');

      const customerName = custDoc?.name || String(reqName).trim() || 'Walk-in';
      const nid = customerNid || custDoc?.nid || '';
      if (custDoc) {
        if (customerNid && !custDoc.nid) custDoc.nid = customerNid; // backfill NID captured at sale
        if (due > 0) custDoc.totalDue += due;
        await custDoc.save({ session });
      }

      // Multi-tender if the client sent >1 payment line; else fall back to the
      // single paymentMethod (back-compat with EMI/exchange/older clients).
      const finalPayments = cleanPayments.length ? cleanPayments : (paidTotal > 0 ? [{ method: ['due', 'emi'].includes(paymentMethod) ? 'cash' : paymentMethod, amount: paidTotal }] : []);
      const primaryMethod = finalPayments[0]?.method || 'cash';
      const badgeMethod = due > 0 ? 'due' : (finalPayments.length > 1 ? 'split' : primaryMethod);

      [sale] = await Sale.create([{
        business: req.businessId,
        invoiceNo: genInvoiceNo(),
        customer: custDoc?._id || null,
        customerName,
        customerNid: nid,
        items: lineItems,
        subTotal, discount, total, paid: paidTotal, due,
        profit: profit - discount, // discount reduces realized profit
        paymentMethod: badgeMethod,
        // real tender for the paid portion — legacy field, kept as the primary/first tender
        paidVia: primaryMethod,
        payments: finalPayments,
        soldBy: req.user._id,
      }], { session });

      // mark each sold device unit as sold + stamp warranty
      for (const su of soldUnits) {
        su.unit.status = 'sold';
        su.unit.sale = sale._id;
        su.unit.soldAt = sale.createdAt || new Date();
        su.unit.soldPrice = su.sellingPrice;
        su.unit.customer = custDoc?._id || null;
        su.unit.customerName = customerName;
        su.unit.warrantyMonths = su.warrantyMonths;
        su.unit.warrantyExpiry = su.warrantyExpiry;
        su.unit.warrantyBrandMonths = su.brandMonths;
        su.unit.warrantyShopMonths = su.shopMonths;
        su.unit.warrantyBrandExpiry = su.brandExpiry;
        su.unit.warrantyShopExpiry = su.shopExpiry;
        await su.unit.save({ session });
      }
    });
  } finally {
    session.endSession();
  }

  await logActivity(req, { action: 'CREATE_SALE', entity: 'Sale', entityId: sale._id, meta: { invoiceNo: sale.invoiceNo, total: sale.total } });
  created(res, { sale });
});

// @route GET /api/sales?from=&to=
export const getSales = asyncHandler(async (req, res) => {
  const { from, to, limit = 100 } = req.query;
  const q = tenantFilter(req);
  if (from || to) {
    q.createdAt = {};
    if (from) q.createdAt.$gte = new Date(from);
    if (to) q.createdAt.$lte = new Date(to + 'T23:59:59');
  }
  const sales = await Sale.find(q).sort('-createdAt').limit(Number(limit));
  ok(res, { sales, count: sales.length });
});

// @route GET /api/sales/:id  — full invoice + its due-payment history
export const getSale = asyncHandler(async (req, res) => {
  const sale = await Sale.findOne(tenantFilter(req, { _id: req.params.id }));
  if (!sale) throw new ApiError(404, 'Sale not found');
  const duePayments = await DuePayment.find(tenantFilter(req, { sale: sale._id })).sort('date');
  ok(res, { sale, duePayments });
});

// @route PATCH /api/sales/:id  — edit an invoice's money fields + customer name.
// body: { discount?, paid?, paymentMethod?, customerName? }
// Line items are not edited here (stock/IMEI reversal is out of scope); use
// Return & Exchange (Phase 9) for item changes.
export const updateSale = asyncHandler(async (req, res) => {
  const sale = await Sale.findOne(tenantFilter(req, { _id: req.params.id }));
  if (!sale) throw new ApiError(404, 'Sale not found');
  const { discount, paid, paymentMethod, customerName } = req.body;
  const oldDue = sale.due;

  if (discount != null) sale.discount = Math.max(0, Number(discount) || 0);
  if (paid != null) sale.paid = Math.max(0, Number(paid) || 0);
  if (customerName != null && String(customerName).trim()) sale.customerName = String(customerName).trim();

  // recompute totals from the (unchanged) line items
  const itemProfit = sale.items.reduce((s, i) => s + ((i.sellingPrice - i.purchasePrice) * i.qty), 0);
  sale.total = Math.max(0, sale.subTotal - sale.discount);
  sale.due = Math.max(0, sale.total - sale.paid);
  sale.profit = itemProfit - sale.discount;

  if (TENDERS.includes(paymentMethod)) sale.paidVia = paymentMethod;
  // classification/badge: 'due' while owing, else the real tender
  sale.paymentMethod = sale.due > 0 ? 'due' : (TENDERS.includes(sale.paidVia) ? sale.paidVia : 'cash');

  // This editor only supports a single tender — collapse any prior split-payment
  // breakdown so the balance engine (which prefers `payments` when non-empty)
  // doesn't use a now-stale multi-tender split alongside the new `paid` amount.
  if (paid != null || paymentMethod != null) {
    sale.payments = sale.paid > 0 ? [{ method: sale.paidVia, amount: sale.paid }] : [];
  }

  await sale.save();

  // keep the customer's aggregate due in sync by the change delta
  if (sale.customer) {
    const delta = sale.due - oldDue;
    if (delta !== 0) {
      await Customer.updateOne(tenantFilter(req, { _id: sale.customer }), { $inc: { totalDue: delta } });
      await Customer.updateOne(tenantFilter(req, { _id: sale.customer, totalDue: { $lt: 0 } }), { $set: { totalDue: 0 } });
    }
  }
  await logActivity(req, { action: 'UPDATE_SALE', entity: 'Sale', entityId: sale._id, meta: { invoiceNo: sale.invoiceNo } });
  ok(res, { sale }, 'Invoice updated');
});

// @route POST /api/sales/:id/collect-due  — pay down a specific invoice's due.
// body: { amount, method }. Records a DuePayment (history + balance), clears the
// DUE badge when settled (req 4), and returns data for the due-payment invoice (req 11).
export const collectSaleDue = asyncHandler(async (req, res) => {
  const { amount, method = 'cash' } = req.body;
  const amt = Number(amount);
  if (!amt || amt <= 0) throw new ApiError(400, 'Enter a valid amount');
  const m = TENDERS.includes(method) ? method : 'cash';

  const sale = await Sale.findOne(tenantFilter(req, { _id: req.params.id }));
  if (!sale) throw new ApiError(404, 'Sale not found');
  if (sale.due <= 0) throw new ApiError(400, 'This invoice has no due');

  const pay = Math.min(amt, sale.due);
  const previousDue = sale.due;
  sale.due = Math.max(0, sale.due - pay);
  if (sale.due === 0) sale.paymentMethod = m; // settled → DUE badge clears
  await sale.save();

  if (sale.customer) {
    await Customer.updateOne(tenantFilter(req, { _id: sale.customer }), { $inc: { totalDue: -pay } });
    await Customer.updateOne(tenantFilter(req, { _id: sale.customer, totalDue: { $lt: 0 } }), { $set: { totalDue: 0 } });
  }

  const duePayment = await DuePayment.create({
    business: req.businessId, customer: sale.customer, sale: sale._id,
    amount: pay, method: m, previousDue, remainingDue: sale.due, collectedBy: req.user._id,
  });
  await logActivity(req, { action: 'COLLECT_DUE', entity: 'Sale', entityId: sale._id, meta: { amount: pay, method: m } });
  ok(res, { sale, duePayment }, 'Due collected');
});

// @route GET /api/sales/report?period=daily|monthly
export const salesReport = asyncHandler(async (req, res) => {
  const { period = 'daily' } = req.query;
  const fmt = period === 'monthly' ? '%Y-%m' : '%Y-%m-%d';
  const report = await Sale.aggregate([
    { $match: { business: new mongoose.Types.ObjectId(req.businessId) } },
    {
      $group: {
        _id: { $dateToString: { format: fmt, date: '$createdAt' } },
        totalSales: { $sum: '$total' },
        totalProfit: { $sum: '$profit' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: -1 } },
    { $limit: 31 },
  ]);
  ok(res, { period, report: report.reverse() });
});
