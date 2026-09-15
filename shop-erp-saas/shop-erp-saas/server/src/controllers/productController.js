import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok, created } from '../utils/apiResponse.js';
import { tenantFilter, branchFilter } from '../middleware/tenant.js';
import { logActivity } from '../middleware/activityLogger.js';
import { canViewBuyPrice, hideBuyPrice } from '../utils/buyPrice.js';
import { resolveAccountId } from '../utils/paymentAccounts.js';
import Product from '../models/Product.js';
import PhoneUnit from '../models/PhoneUnit.js';
import Supplier from '../models/Supplier.js';
import Purchase from '../models/Purchase.js';
import PurchaseBatch from '../models/PurchaseBatch.js';
import Sale from '../models/Sale.js';
import StockSnapshot from '../models/StockSnapshot.js';
import Business from '../models/Business.js';
import Return from '../models/Return.js';
import Installment from '../models/Installment.js';
import ActivityLog from '../models/ActivityLog.js';

const TENDERS = ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card'];
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// `canViewBuyPrice` / `hideBuyPrice` now live in utils/buyPrice.js — the same
// gate is needed by the exports, the advanced report and the dashboard, which
// all hand back product documents of their own.

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
    const term = escapeRegex(search);
    const rx = { $regex: term, $options: 'i' };
    // Anchored (starts-with) match for the code-like fields. A leading-wildcard
    // regex can't use an index at all, so on a big catalog those had to scan
    // every row; anchoring lets the barcode/SKU/IMEI indexes actually be used.
    // Names stay 'contains' — a shopkeeper types a word from the middle of a
    // product name and still expects to find it.
    const pre = { $regex: '^' + term, $options: 'i' };
    const unitProductIds = await PhoneUnit.find(branchFilter(req, {
      $or: [{ imei1: pre }, { imei2: pre }, { serial: pre }],
    })).distinct('product');
    q.$or = [
      { name: rx },
      { sku: pre },
      { barcode: pre },
      // "smart search" — also match category/brand/storage/color, so e.g.
      // typing "128GB" or "Black" or a category name surfaces matches too,
      // not just an exact product-name/SKU/barcode hit.
      { category: rx },
      { brand: rx },
      { storage: rx },
      { color: rx },
      ...(unitProductIds.length ? [{ _id: { $in: unitProductIds } }] : []),
    ];
  }
  if (category) q.category = category;
  // Low-stock filtering happens IN the query (a field-to-field comparison needs
  // $expr), not by filtering the fetched array afterwards — otherwise it would
  // only ever filter within whichever page happened to be loaded.
  if (lowStock === 'true') q.$expr = { $lte: ['$stock', '$lowStockAlert'] };

  // Pagination is OPT-IN: a caller that sends no page/pageSize gets the full
  // list exactly as before. That matters because several callers genuinely need
  // every row — the Stock Print reports, the supplier/product pickers and the
  // IMEI-import product dropdown would all silently report wrong numbers if they
  // were quietly cut to one page. Only the table views ask for a page.
  const wantsPage = req.query.page !== undefined || req.query.pageSize !== undefined;
  const pg = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));

  let query = Product.find(q).sort('-createdAt').populate('supplier', 'name');
  if (wantsPage) query = query.skip((pg - 1) * pageSize).limit(pageSize);

  const [products, total] = await Promise.all([
    query,
    wantsPage ? Product.countDocuments(q) : Promise.resolve(null),
  ]);

  const out = canViewBuyPrice(req) ? products : products.map((p) => hideBuyPrice(p.toObject()));
  ok(res, {
    products: out,
    count: out.length,
    ...(wantsPage ? { total, page: pg, pageSize } : {}),
  });
});

// @route GET /api/products/categories
// Just the distinct category names for this branch. The Products page used to
// derive its category dropdown from whatever products it had loaded — which is
// correct only while it loads the WHOLE catalog, so paginating the list would
// have silently shrunk that dropdown to the categories on page 1. This is both
// the fix for that and far cheaper than fetching every product to read one field.
export const getProductCategories = asyncHandler(async (req, res) => {
  const categories = (await Product.distinct('category', branchFilter(req, { isActive: true })))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  ok(res, { categories });
});

// @route GET /api/products/barcode/:code  — resolve a product by its barcode (scan)
export const getProductByBarcode = asyncHandler(async (req, res) => {
  const code = String(req.params.code || '').trim();
  if (!code) throw new ApiError(400, 'Barcode is required');
  const product = await Product.findOne(branchFilter(req, { barcode: code, isActive: true }));
  if (!product) throw new ApiError(404, 'No product found for this barcode');
  // Same buy-price gate as the Products list — this is the route a counter
  // staff member actually uses all day (every scan), so leaving it open would
  // make the whole "View Buy Price" toggle pointless for exactly the people
  // it's meant to restrict.
  ok(res, { product: canViewBuyPrice(req) ? product : hideBuyPrice(product.toObject()) });
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
// Each item is either a brand-new product, OR an explicit restock of one the
// caller already picked (`existingProductId`) — see the price-history note below.
// body: { supplierName, supplierPhone?, reference?, note?, paid?, source?,
//         payments?:[{method,amount,account}],
//         items:[{ existingProductId?, ...productFields, imeis?:[{imei1,imei2,serial}] }] }
//
// Price/stock history: buying the same product again at a different price must
// NEVER change what's already on the shelf — a customer who bought at the old
// price, or a unit sitting in stock from the earlier purchase, keeps its own
// old cost/selling price forever. Every purchase event here creates a
// `PurchaseBatch` row (the historical record) and, for serial-tracked items,
// stamps that event's price directly onto the new `PhoneUnit`s — existing units
// from an earlier purchase are never read or modified. `Product.purchasePrice`/
// `sellingPrice` become the "current/reference" price shown in the catalog and
// used as the default for the NEXT sale of stock with no more specific price of
// its own (see server/src/utils/purchaseBatch.js for how a sale actually
// resolves which historical price applies).
export const createProductsWithSupplier = asyncHandler(async (req, res) => {
  const {
    supplierName = '', supplierPhone = '', reference = '', note = '',
    paid = 0, source = 'cash', payments: reqPayments = null, items = [],
  } = req.body;
  if (!items.length) throw new ApiError(400, 'At least one item is required');
  const trimmedSupplierName = String(supplierName).trim();
  if (!trimmedSupplierName && !items.every((it) => it.existingProductId)) {
    throw new ApiError(400, 'Supplier / dealer name is required');
  }
  // Fallback default for a brand-new item that didn't send its own Low Stock
  // Alert — the shop's own configured threshold, never a hardcoded number
  // (that was a real bug: this used to hardcode 5 regardless of what the
  // owner had set in Settings).
  const businessForDefaults = await Business.findById(req.businessId).select('settings.lowStockThreshold');
  const defaultLowStockAlert = Number(businessForDefaults?.settings?.lowStockThreshold ?? 1) || 1;

  let supplier;
  if (trimmedSupplierName) {
    // find-or-create the supplier (case-insensitive name match within this business)
    supplier = await Supplier.findOne(tenantFilter(req, { name: { $regex: `^${escapeRegex(trimmedSupplierName)}$`, $options: 'i' } }));
    if (!supplier) {
      supplier = await Supplier.create({ business: req.businessId, name: trimmedSupplierName, phone: String(supplierPhone || '').trim() });
    } else if (String(supplierPhone || '').trim() && !supplier.phone) {
      supplier.phone = String(supplierPhone).trim();
      await supplier.save();
    }
  } else {
    // No supplier name sent — every item is a restock (checked above), so this
    // request is the per-product "Update Price" action, which deliberately
    // never asks for the supplier again since the product already has one from
    // when it was first added. Reuse that existing supplier rather than
    // creating a new one; only fall back to a generic supplier if this
    // particular product genuinely has none set yet.
    const first = await Product.findOne(branchFilter(req, { _id: String(items[0].existingProductId).trim() }));
    if (!first) throw new ApiError(404, `Product to restock not found: ${items[0].existingProductId}`);
    if (first.supplier) {
      supplier = await Supplier.findOne(tenantFilter(req, { _id: first.supplier }));
    }
    if (!supplier) {
      supplier = await Supplier.findOne(tenantFilter(req, { name: { $regex: '^Unknown Supplier$', $options: 'i' } }));
      if (!supplier) supplier = await Supplier.create({ business: req.businessId, name: 'Unknown Supplier' });
    }
  }

  // de-dupe IMEI/serial across the whole submitted batch before touching the DB.
  // Stays BUSINESS-wide (not branch-scoped) — a real device can't physically be
  // in two branches at once, so uniqueness holds across the whole shop.
  const allCodes = [];
  for (const raw of items) {
    if (!raw.trackSerial && !raw.existingProductId) continue;
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
  const batchIds = [];
  let total = 0;

  for (const raw of items) {
    const restockId = String(raw.existingProductId || '').trim();
    const purchasePriceNow = Number(raw.purchasePrice) || 0;
    const sellingPriceNow = Number(raw.sellingPrice) || 0;
    let product;
    let qty;

    if (restockId) {
      // ---- Restock an EXISTING product — only when the caller explicitly
      // picked one. Deliberately NO auto-detection by name/barcode: a live
      // day-to-day restock has no review step, so silently merging two
      // different phones that happen to share a display name would be a real
      // risk a preview-then-accept flow (like Smart Import) doesn't have. ----
      product = await Product.findOne(branchFilter(req, { _id: restockId }));
      if (!product) throw new ApiError(404, `Product to restock not found: ${restockId}`);

      const trackSerial = product.trackSerial;
      const imeis = trackSerial ? (raw.imeis || []).filter((u) => (u.imei1 || u.serial || '').trim()) : [];
      if (trackSerial && imeis.length === 0) throw new ApiError(400, `Add at least one IMEI/serial for ${product.name}`);
      qty = trackSerial ? imeis.length : Math.max(0, Number(raw.stock || 0));

      // "Current/reference" price + supplier move to this event's values —
      // every other field (name/category/barcode/brand/color/storage/
      // warranty/etc.) is left completely untouched, and no EXISTING
      // PhoneUnit document is read or written, only new ones inserted.
      product.purchasePrice = purchasePriceNow;
      product.sellingPrice = sellingPriceNow;
      product.supplier = supplier._id;

      const batch = await PurchaseBatch.create({
        business: req.businessId, branch: req.branchId, product: product._id, supplier: supplier._id,
        purchasePrice: purchasePriceNow, sellingPrice: sellingPriceNow,
        qtyPurchased: qty, qtyRemaining: qty, createdBy: req.user._id,
      });
      batchIds.push(batch._id);

      if (trackSerial && imeis.length) {
        await PhoneUnit.insertMany(imeis.map((u) => ({
          business: req.businessId, branch: req.branchId, product: product._id, status: 'in_stock',
          imei1: (u.imei1 || '').trim(), imei2: (u.imei2 || '').trim(), serial: (u.serial || '').trim(),
          purchasePrice: purchasePriceNow, sellingPrice: sellingPriceNow, batch: batch._id,
        })));
        // Full recount, NOT `imeis.length` — this product already has other
        // in-stock units from an earlier purchase; overwriting stock to just
        // this new batch's count would silently wipe them off the books.
        product.stock = await PhoneUnit.countDocuments(branchFilter(req, { product: product._id, status: 'in_stock' }));
      } else if (!trackSerial) {
        product.stock = (product.stock || 0) + qty;
      }
      await product.save();
      createdProducts.push(product);
    } else {
      // ---- Brand-new product — unchanged creation behavior, plus its own
      // first PurchaseBatch row so batch history exists uniformly from day one.
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
      qty = trackSerial ? imeis.length : Math.max(0, Number(raw.stock || 0));

      product = await Product.create({
        ...raw,
        name, barcode,
        business: req.businessId,
        branch: req.branchId,
        trackSerial,
        supplier: supplier._id,
        stock: trackSerial ? 0 : qty, // synced from units below when trackSerial
        warrantyBrandMonths: Number(raw.warrantyBrandMonths) || 0,
        warrantyShopMonths: Number(raw.warrantyShopMonths) || 0,
        purchasePrice: purchasePriceNow,
        sellingPrice: sellingPriceNow,
        discountPercent: Number(raw.discountPercent) || 0,
        lowStockAlert: Number(raw.lowStockAlert) || defaultLowStockAlert,
      });
      createdProducts.push(product);

      const batch = await PurchaseBatch.create({
        business: req.businessId, branch: req.branchId, product: product._id, supplier: supplier._id,
        purchasePrice: purchasePriceNow, sellingPrice: sellingPriceNow,
        qtyPurchased: qty, qtyRemaining: qty, createdBy: req.user._id,
      });
      batchIds.push(batch._id);

      if (trackSerial && imeis.length) {
        await PhoneUnit.insertMany(imeis.map((u) => ({
          business: req.businessId, branch: req.branchId, product: product._id, status: 'in_stock',
          imei1: (u.imei1 || '').trim(), imei2: (u.imei2 || '').trim(), serial: (u.serial || '').trim(),
          purchasePrice: purchasePriceNow, sellingPrice: sellingPriceNow, batch: batch._id,
        })));
        product.stock = imeis.length; // brand-new product — nothing pre-existing to preserve
        await product.save();
      }
    }

    total += purchasePriceNow * qty;
    purchaseItems.push({ product: product._id, name: product.name, qty, unitCost: purchasePriceNow });
  }

  // Split-tender if the client sent >1 payment line; else a single tender from
  // the legacy source+paid pair — same dual-path pattern as Sale.payments[].
  const cleanPayments = (await Promise.all(
    (Array.isArray(reqPayments) ? reqPayments : []).map(async (p) => ({
      method: TENDERS.includes(p.method) ? p.method : 'cash',
      amount: Number(p.amount) || 0,
      account: await resolveAccountId(req, p.account),
    }))
  )).filter((p) => p.amount > 0);
  const paidFromPayments = cleanPayments.reduce((s, p) => s + p.amount, 0);
  const paidAmt = Math.max(0, Math.min(cleanPayments.length ? paidFromPayments : Number(paid || 0), total));
  const primarySource = cleanPayments[0]?.method || (TENDERS.includes(source) ? source : 'cash');
  const finalPayments = cleanPayments.length ? cleanPayments : (paidAmt > 0 ? [{ method: primarySource, amount: paidAmt, account: null }] : []);

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
    source: primarySource,
    payments: finalPayments,
    createdBy: req.user._id,
  });
  supplier.totalPurchase += total;
  supplier.totalPaid += paidAmt;
  await supplier.save();

  // Now that the Purchase doc exists, link every batch created above to it.
  if (batchIds.length) await PurchaseBatch.updateMany({ _id: { $in: batchIds } }, { purchase: purchase._id });

  await logActivity(req, { action: 'CREATE_PRODUCTS_WITH_SUPPLIER', entity: 'Supplier', entityId: supplier._id, meta: { products: createdProducts.length, total } });
  created(res, { products: createdProducts, supplier, purchase });
});

// @route GET /api/products/:id/purchase-batches — "Item Purchase Rate
// Information": every purchase event for this product, newest first, plus the
// most recent rate as a quick headline figure.
export const getProductPurchaseBatches = asyncHandler(async (req, res) => {
  const product = await Product.findOne(branchFilter(req, { _id: req.params.id }));
  if (!product) throw new ApiError(404, 'Product not found');

  const batches = await PurchaseBatch.find(branchFilter(req, { product: product._id }))
    .sort('-purchaseDate -createdAt')
    .populate('supplier', 'name');
  const show = canViewBuyPrice(req);
  const out = show ? batches : batches.map((b) => ({ ...b.toObject(), purchasePrice: null }));
  ok(res, { batches: out, lastPurchaseRate: out[0] || null });
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

// ---------------------------------------------------------------------------
// Stock Print by Date — compare the shop's stock on any TWO chosen days, with
// each day's own sales (who bought what, and who sold it) printed alongside.
//
// Nothing in this system stores a per-product stock figure per day, so each
// day's stock is RECONSTRUCTED by winding today's stock backwards through every
// movement recorded since then:
//   - serial-tracked products are exact: each PhoneUnit knows when it was
//     created and when it was sold, so "in stock at the end of day D" is just a
//     count of the units that existed by then and weren't sold yet;
//   - quantity products wind back sales, purchases, resellable returns, EMI
//     plans and manual stock adjustments (ActivityLog records before/after for
//     those), which between them cover every routine way stock moves here.
// The one movement NOT wound back is a branch-to-branch Stock Transfer, and a
// unit deleted outright from Manage IMEIs can't be counted for a day it was
// still on the shelf. Both are stated on the report itself rather than left to
// quietly skew a number the owner is about to act on.
// ---------------------------------------------------------------------------

const dayStart = (d) => new Date(`${d}T00:00:00.000`);
const dayEnd = (d) => new Date(`${d}T23:59:59.999`);
const variantOf = (p) => [p.brand, p.storage, p.color].filter(Boolean).join(' - ');

// Stock on hand at `asOf` for every product in `products`, keyed by product id.
async function stockAsOf(req, asOf, products) {
  const bizOid = new mongoose.Types.ObjectId(req.businessId);
  const branchOid = new mongoose.Types.ObjectId(req.branchId);
  const serialIds = products.filter((p) => p.trackSerial).map((p) => p._id);
  const qtyProducts = products.filter((p) => !p.trackSerial);
  const qtyIds = qtyProducts.map((p) => p._id);
  const out = new Map();

  // ---- serial-tracked: exact, straight off the unit rows ----
  if (serialIds.length) {
    const rows = await PhoneUnit.aggregate([
      {
        $match: {
          business: bizOid,
          branch: branchOid,
          product: { $in: serialIds },
          createdAt: { $lte: asOf },
          // not yet sold as of that moment (an unsold unit has soldAt null)
          $or: [{ soldAt: null }, { soldAt: { $gt: asOf } }],
        },
      },
      { $group: { _id: '$product', n: { $sum: 1 } } },
    ]);
    for (const r of rows) out.set(String(r._id), r.n);
    for (const id of serialIds) if (!out.has(String(id))) out.set(String(id), 0);
  }

  // ---- quantity products: wind today's number backwards ----
  if (qtyIds.length) {
    const idSet = new Set(qtyIds.map(String));
    const delta = new Map(); // product id -> net change that happened AFTER asOf
    const bump = (pid, n) => { const k = String(pid); if (idSet.has(k)) delta.set(k, (delta.get(k) || 0) + n); };

    const [sales, batches, returns, emiPlans, adjustments] = await Promise.all([
      Sale.find(branchFilter(req, { createdAt: { $gt: asOf } })).select('items.product items.qty').lean(),
      PurchaseBatch.find(branchFilter(req, { purchaseDate: { $gt: asOf }, product: { $in: qtyIds } })).select('product qtyPurchased').lean(),
      Return.find(branchFilter(req, { createdAt: { $gt: asOf } })).select('items.product items.qty items.condition').lean(),
      Installment.find(tenantFilter(req, { createdAt: { $gt: asOf }, product: { $in: qtyIds } })).select('product').lean(),
      ActivityLog.find(tenantFilter(req, { action: 'ADJUST_STOCK', entity: 'Product', entityId: { $in: qtyIds }, createdAt: { $gt: asOf } })).select('entityId meta').lean(),
    ]);

    // a sale after asOf took stock out -> add it back
    for (const s of sales) for (const it of (s.items || [])) bump(it.product, Number(it.qty) || 0);
    // a purchase after asOf brought stock in -> take it back out
    for (const b of batches) bump(b.product, -(Number(b.qtyPurchased) || 0));
    // a resellable return after asOf put stock back -> take it back out
    // (a damaged return never restocks, so it must NOT be wound back)
    for (const r of returns) for (const it of (r.items || [])) {
      if (it.condition !== 'damaged') bump(it.product, -(Number(it.qty) || 0));
    }
    // an EMI plan after asOf took one unit out -> add it back
    for (const p of emiPlans) bump(p.product, 1);
    // a manual adjustment after asOf moved stock by (after - before) -> undo it
    for (const a of adjustments) {
      const before = Number(a.meta?.before);
      const after = Number(a.meta?.after);
      if (Number.isFinite(before) && Number.isFinite(after)) bump(a.entityId, -(after - before));
    }

    for (const p of qtyProducts) {
      const n = (Number(p.stock) || 0) + (delta.get(String(p._id)) || 0);
      out.set(String(p._id), Math.max(0, Math.round(n * 1000) / 1000));
    }
  }

  return out;
}

// Every sale line that went out on one calendar day, with the customer who
// bought it and the employee who rang it up.
async function salesOnDay(req, day) {
  const sales = await Sale.find(branchFilter(req, { createdAt: { $gte: dayStart(day), $lte: dayEnd(day) } }))
    .populate('soldBy', 'name')
    .sort('createdAt')
    .lean();
  const rows = [];
  for (const s of sales) {
    for (const it of (s.items || [])) {
      rows.push({
        invoiceNo: s.invoiceNo,
        at: s.createdAt,
        productName: it.name,
        imei: it.imei1 || it.serial || '',
        qty: it.qty,
        returnedQty: it.returnedQty || 0,
        sellingPrice: it.sellingPrice,
        lineTotal: Math.round(it.sellingPrice * it.qty * 100) / 100,
        customerName: s.customerName || 'Walk-in',
        // the employee typed at the counter, else the login that rang it up
        soldByName: s.soldByName || s.soldBy?.name || '-',
        isEmi: !!s.isEmi,
      });
    }
  }
  return rows;
}

// @route GET /api/products/stock-by-date?date1=YYYY-MM-DD&date2=YYYY-MM-DD&category=
export const getStockByDate = asyncHandler(async (req, res) => {
  const { date1, date2, category } = req.query;
  const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
  if (!isDay(date1) || !isDay(date2)) throw new ApiError(400, 'Pick both dates (YYYY-MM-DD)');
  // always report oldest -> newest, whichever order they were picked in
  const [d1, d2] = date1 <= date2 ? [date1, date2] : [date2, date1];

  const q = branchFilter(req);
  if (category) q.category = category;
  const products = await Product.find(q)
    .select('name category brand storage color unit stock trackSerial supplier')
    .populate('supplier', 'name')
    .sort('name')
    .lean();

  const [stock1, stock2, sales1, sales2] = await Promise.all([
    stockAsOf(req, dayEnd(d1), products),
    stockAsOf(req, dayEnd(d2), products),
    salesOnDay(req, d1),
    salesOnDay(req, d2),
  ]);

  // One row per product that had stock on either day, so the printed comparison
  // reads as a single side-by-side list.
  const rows = products.map((p) => {
    const k = String(p._id);
    const qty1 = stock1.get(k) || 0;
    const qty2 = stock2.get(k) || 0;
    return {
      product: p._id,
      name: p.name,
      category: p.category || '',
      variant: variantOf(p),
      unit: p.unit || 'pcs',
      supplier: p.supplier?.name || '',
      qty1,
      qty2,
      change: Math.round((qty2 - qty1) * 1000) / 1000,
    };
  }).filter((r) => r.qty1 > 0 || r.qty2 > 0);

  const sum = (rws, k) => Math.round(rws.reduce((s, r) => s + (Number(r[k]) || 0), 0) * 1000) / 1000;
  const soldQty = (rws) => Math.round(rws.reduce((s, r) => s + (Number(r.qty) || 0), 0) * 1000) / 1000;
  const soldValue = (rws) => Math.round(rws.reduce((s, r) => s + (Number(r.lineTotal) || 0), 0) * 100) / 100;

  ok(res, {
    report: {
      category: category || '',
      date1: d1,
      date2: d2,
      rows,
      // products that ran out entirely between the two dates, and how many
      // simply moved - the questions the owner actually asks of this report
      soldOut: rows.filter((r) => r.qty1 > 0 && r.qty2 === 0).map((r) => r.name),
      decreased: rows.filter((r) => r.change < 0).length,
      increased: rows.filter((r) => r.change > 0).length,
      totals: {
        date1: { products: rows.filter((r) => r.qty1 > 0).length, qty: sum(rows, 'qty1'), soldLines: sales1.length, soldQty: soldQty(sales1), soldValue: soldValue(sales1) },
        date2: { products: rows.filter((r) => r.qty2 > 0).length, qty: sum(rows, 'qty2'), soldLines: sales2.length, soldQty: soldQty(sales2), soldValue: soldValue(sales2) },
      },
      sales1,
      sales2,
    },
  });
});
