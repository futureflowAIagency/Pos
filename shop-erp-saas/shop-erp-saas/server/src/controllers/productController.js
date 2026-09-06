import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok, created } from '../utils/apiResponse.js';
import { tenantFilter, branchFilter } from '../middleware/tenant.js';
import { logActivity } from '../middleware/activityLogger.js';
import Product from '../models/Product.js';
import PhoneUnit from '../models/PhoneUnit.js';
import Supplier from '../models/Supplier.js';
import Purchase from '../models/Purchase.js';
import Sale from '../models/Sale.js';
import StockSnapshot from '../models/StockSnapshot.js';

const TENDERS = ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card'];
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Owner/superadmin always see the purchase/buy price; a staff login needs the
// 'view-buy-price' permission explicitly — separate from having Products
// access itself, since an owner may want staff to manage stock without
// seeing what it actually cost.
const canViewBuyPrice = (req) => req.user.role !== 'staff' || (req.user.permissions || []).includes('view-buy-price');
// Redacts purchasePrice on a plain object (call .toObject()/.toJSON() on a
// Mongoose doc first) — null rather than deleting the key, so the client's
// shape stays predictable (a missing vs. hidden field would otherwise look
// the same as "not set" everywhere the UI checks for it).
const hideBuyPrice = (obj) => { obj.purchasePrice = null; return obj; };

// Generate a barcode value that's unique within the active branch's catalog.
const genBarcodeValue = () => String(Date.now()).slice(-9) + String(Math.floor(Math.random() * 900 + 100));
const uniqueBarcode = async (req) => {
  for (let i = 0; i < 8; i++) {
    const code = genBarcodeValue();
    const clash = await Product.findOne(branchFilter(req, { barcode: code }));
    if (!clash) return code;
  }
  return genBarcodeValue() + String(Math.floor(Math.random() * 9)); // extremely unlikely fallback
};

// @route GET /api/products?search=&category=&lowStock=true
export const getProducts = asyncHandler(async (req, res) => {
  const { search, category, lowStock } = req.query;
  const q = branchFilter(req, { isActive: true });
  if (search) {
    // Also match products by a unit's IMEI/serial — a shop owner searching an
    // IMEI that's already in stock expects to find the product it belongs to,
    // not just products matched by name/SKU/barcode. Scoped to the active branch
    // — a scanned/typed code should only resolve stock actually on this shelf.
    const unitProductIds = await PhoneUnit.find(branchFilter(req, {
      $or: [{ imei1: { $regex: search, $options: 'i' } }, { imei2: { $regex: search, $options: 'i' } }, { serial: { $regex: search, $options: 'i' } }],
    })).distinct('product');
    q.$or = [
      { name: { $regex: search, $options: 'i' } },
      { sku: { $regex: search, $options: 'i' } },
      { barcode: { $regex: search, $options: 'i' } },
      ...(unitProductIds.length ? [{ _id: { $in: unitProductIds } }] : []),
    ];
  }
  if (category) q.category = category;

  let products = await Product.find(q).sort('-createdAt').populate('supplier', 'name');
  if (lowStock === 'true') products = products.filter((p) => p.stock <= p.lowStockAlert);
  const out = canViewBuyPrice(req) ? products : products.map((p) => hideBuyPrice(p.toObject()));
  ok(res, { products: out, count: out.length });
});

// @route GET /api/products/barcode/:code  — resolve a product by its barcode (scan)
export const getProductByBarcode = asyncHandler(async (req, res) => {
  const code = String(req.params.code || '').trim();
  if (!code) throw new ApiError(400, 'Barcode is required');
  const product = await Product.findOne(branchFilter(req, { barcode: code, isActive: true }));
  if (!product) throw new ApiError(404, 'No product found for this barcode');
  ok(res, { product });
});

// @route POST /api/products
export const createProduct = asyncHandler(async (req, res) => {
  const isMedicine = /medicine|medicin|drug|pharma/i.test(req.body.category || '');
  if (isMedicine && !req.body.expiryDate) {
    throw new ApiError(400, 'Expiry date is required for medicines');
  }
  // reuse a provided barcode (must be free within this branch) or auto-generate one
  let barcode = String(req.body.barcode || '').trim();
  if (barcode) {
    const clash = await Product.findOne(branchFilter(req, { barcode }));
    if (clash) throw new ApiError(409, 'Barcode already in use by another product in this branch');
  } else {
    barcode = await uniqueBarcode(req);
  }
  const product = await Product.create({ ...req.body, barcode, business: req.businessId, branch: req.branchId });
  await logActivity(req, { action: 'CREATE_PRODUCT', entity: 'Product', entityId: product._id, meta: { name: product.name } });
  created(res, { product });
});

// @route POST /api/products/batch-with-supplier
// Add one or more products in one go, all received from the same supplier/dealer —
// auto-creates (or reuses) the Supplier and records a single stock-in Purchase
// linking every created product, so it shows up in the Supplier dashboard/ledger.
// body: { supplierName, supplierPhone?, reference?, note?, paid?, source?,
//         items:[{ ...productFields, imeis?:[{imei1,imei2,serial}] }] }
export const createProductsWithSupplier = asyncHandler(async (req, res) => {
  const { supplierName = '', supplierPhone = '', reference = '', note = '', paid = 0, source = 'cash', items = [] } = req.body;
  if (!String(supplierName).trim()) throw new ApiError(400, 'Supplier / dealer name is required');
  if (!items.length) throw new ApiError(400, 'At least one item is required');

  // find-or-create the supplier (case-insensitive name match within this business)
  let supplier = await Supplier.findOne(tenantFilter(req, { name: { $regex: `^${escapeRegex(String(supplierName).trim())}$`, $options: 'i' } }));
  if (!supplier) {
    supplier = await Supplier.create({ business: req.businessId, name: String(supplierName).trim(), phone: String(supplierPhone || '').trim() });
  } else if (String(supplierPhone || '').trim() && !supplier.phone) {
    supplier.phone = String(supplierPhone).trim();
    await supplier.save();
  }

  // de-dupe IMEI/serial across the whole submitted batch before touching the DB.
  // Stays BUSINESS-wide (not branch-scoped) — a real device can't physically be
  // in two branches at once, so uniqueness holds across the whole shop.
  const allCodes = [];
  for (const raw of items) {
    if (!raw.trackSerial) continue;
    for (const u of (raw.imeis || [])) {
      const code = (u.imei1 || u.serial || '').trim();
      if (code) allCodes.push(code);
    }
  }
  const dupInBatch = allCodes.find((c, i) => allCodes.indexOf(c) !== i);
  if (dupInBatch) throw new ApiError(400, `Duplicate IMEI/serial in this submission: ${dupInBatch}`);
  if (allCodes.length) {
    const existing = await PhoneUnit.findOne(tenantFilter(req, { $or: [{ imei1: { $in: allCodes } }, { serial: { $in: allCodes } }] }));
    if (existing) throw new ApiError(409, `IMEI/serial already exists: ${existing.imei1 || existing.serial}`);
  }

  const createdProducts = [];
  const purchaseItems = [];
  let total = 0;

  for (const raw of items) {
    const name = String(raw.name || '').trim();
    if (!name) throw new ApiError(400, 'Every item needs a name');
    const isMedicine = /medicine|medicin|drug|pharma/i.test(raw.category || '');
    if (isMedicine && !raw.expiryDate) throw new ApiError(400, `Expiry date is required for medicine: ${name}`);

    let barcode = String(raw.barcode || '').trim();
    if (barcode) {
      const clash = await Product.findOne(branchFilter(req, { barcode }));
      if (clash) throw new ApiError(409, `Barcode already in use: ${barcode}`);
    } else {
      barcode = await uniqueBarcode(req);
    }

    const trackSerial = !!raw.trackSerial;
    const imeis = trackSerial ? (raw.imeis || []).filter((u) => (u.imei1 || u.serial || '').trim()) : [];
    if (trackSerial && imeis.length === 0) throw new ApiError(400, `Add at least one IMEI/serial for ${name}`);
    const qty = trackSerial ? imeis.length : Math.max(0, Number(raw.stock || 0));

    const product = await Product.create({
      ...raw,
      name, barcode,
      business: req.businessId,
      branch: req.branchId,
      trackSerial,
      supplier: supplier._id,
      stock: trackSerial ? 0 : qty, // synced from units below when trackSerial
      warrantyBrandMonths: Number(raw.warrantyBrandMonths) || 0,
      warrantyShopMonths: Number(raw.warrantyShopMonths) || 0,
      purchasePrice: Number(raw.purchasePrice) || 0,
      sellingPrice: Number(raw.sellingPrice) || 0,
      discountPercent: Number(raw.discountPercent) || 0,
      lowStockAlert: Number(raw.lowStockAlert) || 5,
    });
    createdProducts.push(product);

    if (trackSerial && imeis.length) {
      await PhoneUnit.insertMany(imeis.map((u) => ({
        business: req.businessId, branch: req.branchId, product: product._id, status: 'in_stock',
        imei1: (u.imei1 || '').trim(), imei2: (u.imei2 || '').trim(), serial: (u.serial || '').trim(),
      })));
      product.stock = imeis.length;
      await product.save();
    }

    const unitCost = Number(raw.purchasePrice) || 0;
    total += unitCost * qty;
    purchaseItems.push({ product: product._id, name: product.name, qty, unitCost });
  }

  const paidAmt = Math.max(0, Math.min(Number(paid || 0), total));
  const purchase = await Purchase.create({
    business: req.businessId,
    branch: req.branchId,
    supplier: supplier._id,
    kind: 'purchase',
    reference, note,
    items: purchaseItems,
    total,
    paid: paidAmt,
    due: Math.max(0, total - paidAmt),
    source: TENDERS.includes(source) ? source : 'cash',
    createdBy: req.user._id,
  });
  supplier.totalPurchase += total;
  supplier.totalPaid += paidAmt;
  await supplier.save();

  await logActivity(req, { action: 'CREATE_PRODUCTS_WITH_SUPPLIER', entity: 'Supplier', entityId: supplier._id, meta: { products: createdProducts.length, total } });
  created(res, { products: createdProducts, supplier, purchase });
});

// @route PUT /api/products/:id
export const updateProduct = asyncHandler(async (req, res) => {
  // if a barcode is being set, make sure no other product in this branch already owns it
  const barcode = String(req.body.barcode || '').trim();
  if (barcode) {
    const clash = await Product.findOne(branchFilter(req, { barcode, _id: { $ne: req.params.id } }));
    if (clash) throw new ApiError(409, 'Barcode already in use by another product in this branch');
  }
  // an empty string means "no supplier" — cast that to null so Mongoose doesn't
  // try (and fail) to interpret '' as an ObjectId
  const body = { ...req.body };
  if ('supplier' in body && !body.supplier) body.supplier = null;
  // A staff login without 'view-buy-price' never actually sees the real
  // purchasePrice (getProducts redacts it), so their Edit form's field is
  // blank by construction — submitting that blank must NOT overwrite the
  // real stored value. Simply drop the field rather than trust it.
  if (!canViewBuyPrice(req)) delete body.purchasePrice;

  const product = await Product.findOneAndUpdate(
    branchFilter(req, { _id: req.params.id }),
    body,
    { new: true, runValidators: true }
  ).populate('supplier', 'name');
  if (!product) throw new ApiError(404, 'Product not found');
  await logActivity(req, { action: 'UPDATE_PRODUCT', entity: 'Product', entityId: product._id });
  const out = canViewBuyPrice(req) ? product : hideBuyPrice(product.toObject());
  ok(res, { product: out }, 'Product updated');
});

// @route PATCH /api/products/:id/stock  body: { qty, mode: 'add'|'remove'|'set', note }
// Quantity-only stock movement, kept separate from the full Edit-Product form so
// restocking never means retyping the stock figure by hand (a real mis-entry risk
// for a general/pharmacy shop). `add` is the everyday case; `remove` covers
// breakage/shrinkage and `set` a physical stock-count correction.
export const adjustProductStock = asyncHandler(async (req, res) => {
  const { qty, mode = 'add', note = '' } = req.body;
  const n = Number(qty);
  if (!Number.isFinite(n) || n < 0) throw new ApiError(400, 'Enter a valid quantity (0 or more)');

  const product = await Product.findOne(branchFilter(req, { _id: req.params.id }));
  if (!product) throw new ApiError(404, 'Product not found');
  // Serial-tracked stock is DERIVED from in-stock PhoneUnit rows — a manual bump
  // here would be silently overwritten by the next unit sync, so refuse it and
  // point at the right tool instead.
  if (product.trackSerial) {
    throw new ApiError(400, `${product.name} is tracked by unique code — add its IMEI / unit codes instead, the quantity follows them automatically`);
  }

  const before = Number(product.stock) || 0;
  const after = mode === 'set' ? n : mode === 'remove' ? before - n : before + n;
  if (after < 0) throw new ApiError(400, `Cannot remove ${n} — only ${before} in stock`);
  if (after === before) return ok(res, { product }, 'Stock unchanged');

  product.stock = after;
  await product.save();

  await logActivity(req, {
    action: 'ADJUST_STOCK', entity: 'Product', entityId: product._id,
    meta: { name: product.name, mode, qty: n, before, after, note },
  });
  ok(res, { product }, 'Stock updated');
});

// @route DELETE /api/products/:id  (soft delete)
export const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findOneAndUpdate(
    branchFilter(req, { _id: req.params.id }),
    { isActive: false },
    { new: true }
  );
  if (!product) throw new ApiError(404, 'Product not found');
  await logActivity(req, { action: 'DELETE_PRODUCT', entity: 'Product', entityId: product._id });
  ok(res, {}, 'Product deleted');
});

// local calendar day (server time — same convention dashboardController's
// 'daily' period already uses) as a stable 'YYYY-MM-DD' key
const dayKey = (d = new Date()) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// @route GET /api/products/stock-snapshot?category=
// Records today's in-stock totals (for the "Stock Print by Brands" report,
// scoped the same way — same category filter, if any) and returns the most
// recent PRIOR day's totals alongside it, so the report can show a
// day-over-day comparison. Re-calling this on the same day just updates
// today's own reading rather than creating a second one.
export const getStockSnapshot = asyncHandler(async (req, res) => {
  const category = req.query.category || '';
  const q = branchFilter(req, { isActive: true, stock: { $gt: 0 } });
  if (category) q.category = category;

  const inStock = await Product.find(q).select('stock');
  const totalProducts = inStock.length;
  const totalQty = inStock.reduce((s, p) => s + (p.stock || 0), 0);
  const today = dayKey();

  await StockSnapshot.findOneAndUpdate(
    { business: req.businessId, branch: req.branchId, category, date: today },
    { totalProducts, totalQty },
    { upsert: true, setDefaultsOnInsert: true }
  );

  const lastDay = await StockSnapshot.findOne({
    business: req.businessId, branch: req.branchId, category, date: { $lt: today },
  }).sort('-date');

  ok(res, {
    today: { date: today, totalProducts, totalQty },
    lastDay: lastDay ? { date: lastDay.date, totalProducts: lastDay.totalProducts, totalQty: lastDay.totalQty } : null,
  });
});

// @route GET /api/products/:id/report
// A single product's full picture for the "Stock Print by Model" report:
// how many pieces have been sold in total, which supplier(s) it was bought
// from and how much each time, and the current stock on hand.
export const getProductReport = asyncHandler(async (req, res) => {
  const product = await Product.findOne(branchFilter(req, { _id: req.params.id })).populate('supplier', 'name');
  if (!product) throw new ApiError(404, 'Product not found');
  const bId = new mongoose.Types.ObjectId(req.businessId);
  const pId = product._id;

  const [soldAgg, purchaseAgg, saleRows] = await Promise.all([
    // Sold is NET of returns — a returned item goes back on the shelf (the
    // return already restocks Product.stock), so it must stop counting as
    // sold here too, same rule supplierProductBreakdown already applies.
    Sale.aggregate([
      { $match: { business: bId, 'items.product': pId } },
      { $unwind: '$items' },
      { $match: { 'items.product': pId } },
      { $group: {
        _id: null,
        soldQty: { $sum: { $subtract: ['$items.qty', { $ifNull: ['$items.returnedQty', 0] }] } },
        returnedQty: { $sum: { $ifNull: ['$items.returnedQty', 0] } },
      } },
    ]),
    // Every supplier this exact product was ever bought from, and how much —
    // a product can be restocked from more than one dealer over time, unlike
    // Product.supplier (the CURRENT/primary one, editable on the product form).
    Purchase.aggregate([
      { $match: { business: bId, kind: 'purchase', 'items.product': pId } },
      { $unwind: '$items' },
      { $match: { 'items.product': pId } },
      { $group: { _id: '$supplier', qty: { $sum: '$items.qty' }, lastDate: { $max: '$date' } } },
      { $sort: { qty: -1 } },
    ]),
    // Date-wise sale history — "which date did which one sell" — one row per
    // line item (a serial-tracked product sold as several devices in one
    // invoice gets a row per device, since each is its own item entry).
    Sale.aggregate([
      { $match: { business: bId, 'items.product': pId } },
      { $unwind: '$items' },
      { $match: { 'items.product': pId } },
      { $project: {
        invoiceNo: 1, createdAt: 1, customerName: 1,
        qty: '$items.qty', returnedQty: { $ifNull: ['$items.returnedQty', 0] },
        sellingPrice: '$items.sellingPrice', imei1: '$items.imei1', serial: '$items.serial',
      } },
      { $sort: { createdAt: -1 } },
    ]),
  ]);

  const supplierIds = purchaseAgg.map((p) => p._id).filter(Boolean);
  const suppliers = supplierIds.length ? await Supplier.find({ _id: { $in: supplierIds } }).select('name phone') : [];
  const supplierMap = Object.fromEntries(suppliers.map((s) => [String(s._id), s]));
  const bySupplier = purchaseAgg.map((p) => ({
    supplier: p._id ? (supplierMap[String(p._id)]?.name || 'Unknown supplier') : '— No supplier recorded —',
    phone: p._id ? (supplierMap[String(p._id)]?.phone || '') : '',
    qty: p.qty,
    lastDate: p.lastDate,
  }));

  const sold = soldAgg[0] || { soldQty: 0, returnedQty: 0 };
  ok(res, {
    product: canViewBuyPrice(req) ? product : hideBuyPrice(product.toObject()),
    totalSold: Math.max(0, sold.soldQty),
    totalReturned: sold.returnedQty || 0,
    currentStock: product.stock,
    suppliers: bySupplier,
    sales: saleRows,
  });
});
