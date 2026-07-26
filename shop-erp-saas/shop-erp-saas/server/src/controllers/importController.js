import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/apiResponse.js';
import { tenantFilter } from '../middleware/tenant.js';
import { logActivity } from '../middleware/activityLogger.js';
import { parseCSV } from '../utils/csv.js';
import { parseUploadedFile } from '../utils/smartImport.js';
import ImportExportLog from '../models/ImportExportLog.js';
import Customer from '../models/Customer.js';
import Supplier from '../models/Supplier.js';
import Product from '../models/Product.js';
import Expense from '../models/Expense.js';
import PhoneUnit from '../models/PhoneUnit.js';
import Business from '../models/Business.js';

const TENDERS = ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card'];
const toBool = (v) => ['true', '1', 'yes', 'y'].includes(String(v ?? '').trim().toLowerCase());
const num = (v, def) => { const n = Number(v); return Number.isFinite(n) ? n : def; };

// header row + one example row — lets a shop owner migrating from another
// system know exactly which columns to fill in (req 13 "নির্ধারিত Template").
const TEMPLATES = {
  customers: { columns: ['name', 'phone', 'email', 'address', 'nid'], example: ['Rahim Uddin', '01711000000', 'rahim@example.com', 'Dhaka', '1234567890'] },
  suppliers: { columns: ['name', 'phone', 'address', 'note'], example: ['ABC Distributors', '01911000000', 'Motijheel, Dhaka', 'Main phone supplier'] },
  products: {
    columns: ['name', 'barcode', 'sku', 'category', 'unit', 'purchasePrice', 'sellingPrice', 'discountPercent', 'stock', 'lowStockAlert', 'trackSerial', 'brand', 'color', 'storage', 'returnable'],
    example: ['iPhone 13', '', 'IP13-BLK', 'Mobile', 'pcs', '55000', '62000', '0', '5', '2', 'true', 'Apple', 'Black', '128GB', 'true'],
  },
  expenses: { columns: ['title', 'category', 'amount', 'source', 'note', 'date'], example: ['Shop Rent', 'Rent', '15000', 'cash', 'July rent', ''] },
  units: { columns: ['imei1', 'imei2', 'serial'], example: ['356789012345678', '', ''] },
  // For shops migrating from another system into "Smart Stock Import" (not the
  // strict per-entity importer above) — one row per product, with all its IMEIs
  // together in one cell. If a product with this exact name already exists here,
  // only its IMEIs are added; otherwise the whole product is created from this row.
  migration: {
    columns: ['Product Name', 'Category', 'Brand', 'Storage', 'Color', 'Buy Price', 'Sell Price', 'Discount %', 'Brand Warranty (months)', 'Shop Warranty (months)', 'Supplier / Seller Name', 'IMEIs (comma separated)'],
    example: ['iPhone 13', 'Mobile', 'Apple', '128GB', 'Black', '55000', '62000', '0', '12', '6', 'Anik Telecom', '356789012345671, 356789012345672, 356789012345673'],
  },
};

// @route GET /api/import/:entity/template
export const downloadTemplate = asyncHandler(async (req, res) => {
  const t = TEMPLATES[req.params.entity];
  if (!t) throw new ApiError(400, `Unknown import entity: ${req.params.entity}`);
  // Quote any field containing a comma (e.g. the migration template's multi-IMEI
  // example) so it round-trips correctly through parseCSV as one field, not several.
  const escCsv = (v) => (/[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
  const csv = [t.columns.map(escCsv).join(','), t.example.map(escCsv).join(',')].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.entity}-template.csv"`);
  res.send(csv);
});

// ---- per-row validators: return { ok:true, data } or { ok:false, message } ----
function validateCustomerRow(row) {
  if (!row.name?.trim()) return { ok: false, message: 'Name is required' };
  return { ok: true, data: { name: row.name.trim(), phone: row.phone?.trim() || '', email: row.email?.trim() || '', address: row.address?.trim() || '', nid: row.nid?.trim() || '' } };
}
function validateSupplierRow(row) {
  if (!row.name?.trim()) return { ok: false, message: 'Name is required' };
  return { ok: true, data: { name: row.name.trim(), phone: row.phone?.trim() || '', address: row.address?.trim() || '', note: row.note?.trim() || '' } };
}
function validateProductRow(row) {
  if (!row.name?.trim()) return { ok: false, message: 'Name is required' };
  const purchasePrice = num(row.purchasePrice, NaN);
  const sellingPrice = num(row.sellingPrice, NaN);
  if (!Number.isFinite(purchasePrice) || purchasePrice < 0) return { ok: false, message: 'Purchase Price must be a non-negative number' };
  if (!Number.isFinite(sellingPrice) || sellingPrice < 0) return { ok: false, message: 'Selling Price must be a non-negative number' };
  return {
    ok: true,
    data: {
      name: row.name.trim(), barcode: row.barcode?.trim() || '', sku: row.sku?.trim() || '',
      category: row.category?.trim() || 'General', unit: row.unit?.trim() || 'pcs',
      purchasePrice, sellingPrice, discountPercent: Math.min(100, Math.max(0, num(row.discountPercent, 0))),
      stock: num(row.stock, 0), lowStockAlert: num(row.lowStockAlert, 5),
      trackSerial: toBool(row.trackSerial), brand: row.brand?.trim() || '', color: row.color?.trim() || '', storage: row.storage?.trim() || '',
      returnable: row.returnable === undefined || row.returnable === '' ? true : toBool(row.returnable),
    },
  };
}
function validateExpenseRow(row) {
  if (!row.title?.trim()) return { ok: false, message: 'Title is required' };
  const amount = num(row.amount, NaN);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: 'Amount must be greater than 0' };
  const source = TENDERS.includes((row.source || '').toLowerCase()) ? row.source.toLowerCase() : 'cash';
  const date = row.date && !Number.isNaN(new Date(row.date).getTime()) ? new Date(row.date) : new Date();
  return { ok: true, data: { title: row.title.trim(), category: row.category?.trim() || 'General', amount, source, note: row.note?.trim() || '', date } };
}
// units also checks against the DB (not just the file) — the most business-critical
// duplicate to catch before committing, so it's verified during the dry-run too.
async function validateUnitRow(row, seen, req) {
  const imei1 = row.imei1?.trim() || '';
  const imei2 = row.imei2?.trim() || '';
  const serial = row.serial?.trim() || '';
  if (!imei1 && !serial) return { ok: false, message: 'Each row needs an IMEI 1 or a Serial number' };
  const key = imei1 || serial;
  if (seen.has(key)) return { ok: false, message: `Duplicate IMEI/serial in file: ${key}` };
  seen.add(key);
  const clash = await PhoneUnit.findOne(tenantFilter(req, { $or: [...(imei1 ? [{ imei1 }] : []), ...(serial ? [{ serial }] : [])] }));
  if (clash) return { ok: false, message: `Already exists in this shop: ${key}` };
  return { ok: true, data: { imei1, imei2, serial } };
}

async function runValidation(entity, csvText, req) {
  const rawRows = parseCSV(csvText);
  if (!rawRows.length) throw new ApiError(400, 'The file is empty or has no data rows');

  let results;
  if (entity === 'customers') results = rawRows.map(validateCustomerRow);
  else if (entity === 'suppliers') results = rawRows.map(validateSupplierRow);
  else if (entity === 'products') results = rawRows.map(validateProductRow);
  else if (entity === 'expenses') results = rawRows.map(validateExpenseRow);
  else if (entity === 'units') { const seen = new Set(); results = await Promise.all(rawRows.map((r) => validateUnitRow(r, seen, req))); }
  else throw new ApiError(400, `Unknown import entity: ${entity}`);

  const errors = [];
  const valid = [];
  results.forEach((r, i) => {
    if (r.ok) valid.push(r.data);
    else errors.push({ row: i + 2, message: r.message }); // +2: header row + 1-indexed
  });
  return { total: rawRows.length, valid, errors };
}

// @route POST /api/import/:entity/validate  body: { csv }
export const validateImport = asyncHandler(async (req, res) => {
  const { csv } = req.body;
  if (!csv) throw new ApiError(400, 'No file content received');
  const { total, valid, errors } = await runValidation(req.params.entity, csv, req);
  ok(res, { total, validCount: valid.length, errorCount: errors.length, errors: errors.slice(0, 200) });
});

// @route POST /api/import/:entity/commit  body: { csv, product? }
// Re-validates (never trusts a stale client-side dry-run), then writes. Existing
// records are upserted by a natural key (phone/name/barcode) so re-importing the
// same file is safe and doesn't create duplicates.
export const commitImport = asyncHandler(async (req, res) => {
  const { entity } = req.params;
  const { csv } = req.body;
  if (!csv) throw new ApiError(400, 'No file content received');
  const { valid, errors } = await runValidation(entity, csv, req);

  let createdCount = 0, updatedCount = 0;
  if (entity === 'customers') {
    for (const data of valid) {
      const existing = data.phone ? await Customer.findOne(tenantFilter(req, { phone: data.phone })) : null;
      if (existing) { Object.assign(existing, data); await existing.save(); updatedCount++; }
      else { await Customer.create({ ...data, business: req.businessId }); createdCount++; }
    }
  } else if (entity === 'suppliers') {
    for (const data of valid) {
      const existing = await Supplier.findOne(tenantFilter(req, { name: data.name }));
      if (existing) { Object.assign(existing, data); await existing.save(); updatedCount++; }
      else { await Supplier.create({ ...data, business: req.businessId }); createdCount++; }
    }
  } else if (entity === 'products') {
    for (const data of valid) {
      const existing = data.barcode ? await Product.findOne(tenantFilter(req, { barcode: data.barcode })) : null;
      if (existing) { Object.assign(existing, data); await existing.save(); updatedCount++; }
      else { await Product.create({ ...data, business: req.businessId }); createdCount++; }
    }
  } else if (entity === 'expenses') {
    for (const data of valid) { await Expense.create({ ...data, business: req.businessId }); createdCount++; }
  } else if (entity === 'units') {
    const { product } = req.body;
    if (!product) throw new ApiError(400, 'Select a product for the IMEI/serial import');
    const prod = await Product.findOne(tenantFilter(req, { _id: product }));
    if (!prod) throw new ApiError(404, 'Product not found');
    for (const data of valid) {
      await PhoneUnit.create({ ...data, business: req.businessId, product: prod._id, status: 'in_stock' });
      createdCount++;
    }
    if (createdCount > 0) {
      const inStock = await PhoneUnit.countDocuments(tenantFilter(req, { product: prod._id, status: 'in_stock' }));
      await Product.updateOne(tenantFilter(req, { _id: prod._id }), { stock: inStock, trackSerial: true });
    }
  }

  await ImportExportLog.create({ business: req.businessId, action: 'import', entity, format: 'csv', recordCount: createdCount + updatedCount, errorCount: errors.length, createdBy: req.user._id });
  await logActivity(req, { action: 'IMPORT_DATA', entity: 'Import', meta: { entity, created: createdCount, updated: updatedCount, errors: errors.length } });
  ok(res, { created: createdCount, updated: updatedCount, skipped: errors.length, errors: errors.slice(0, 200) }, 'Import complete');
});

// Turns a raw parsed row (from any file shape) into clean product-migration
// data, or an error message. Stock/prices default to 0 when the source file
// doesn't have them (e.g. this shop's old software never recorded prices) —
// the owner fills those in afterward from the normal Edit Product screen.
// If the row lists IMEIs, stock is derived from how many were actually listed
// (one unit per IMEI) rather than trusting a separate stock/qty column.
function normalizeSmartRow(row) {
  const name = String(row.name || '').trim();
  if (!name) return { ok: false, message: 'Missing product name' };
  const category = String(row.category || '').trim().replace(/^\(+\s*/, '').replace(/\s*\)+$/, '').trim() || 'General';
  const imeis = [...new Set(String(row.imeisRaw || '').split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean))];
  return {
    ok: true,
    data: {
      supplierName: String(row.supplierName || '').trim(),
      name,
      category,
      stock: imeis.length || Math.max(0, Math.round(num(row.stock, 0))),
      barcode: String(row.barcode || '').trim(),
      sku: String(row.sku || '').trim(),
      purchasePrice: Math.max(0, num(row.purchasePrice, 0)),
      sellingPrice: Math.max(0, num(row.sellingPrice, 0)),
      discountPercent: Math.min(100, Math.max(0, num(row.discountPercent, 0))),
      brand: String(row.brand || '').trim(),
      storage: String(row.storage || '').trim(),
      color: String(row.color || '').trim(),
      warrantyBrandMonths: Math.max(0, num(row.warrantyBrandMonths, 0)),
      warrantyShopMonths: Math.max(0, num(row.warrantyShopMonths, 0)),
      imeis,
    },
  };
}

// A migration file routinely has 500+ rows (this client's own legacy exports are
// 552 and 460 items). Looking each one up with its own query meant 500+ sequential
// round-trips to the remote Atlas cluster — slow enough that the upload timed out
// before finishing. Every lookup below is therefore done ONCE, in bulk, and matched
// in memory: the product identity key is name+category, both case-insensitive.
const productKey = (name, category) =>
  `${String(name || '').trim().toLowerCase()}::${String(category || '').trim().toLowerCase()}`;

// name+category -> { _id, name } for every product in this business (one query)
async function loadProductIndex(req) {
  const all = await Product.find(tenantFilter(req, {})).select('name category isActive').lean();
  const byKey = new Map();
  for (const p of all) {
    const k = productKey(p.name, p.category);
    // an active product always wins over a soft-deleted one with the same name
    if (!byKey.has(k) || (p.isActive && !byKey.get(k).isActive)) byKey.set(k, p);
  }
  return byKey;
}

// Classifies each valid row as: 'new' (no product with this name+category yet —
// will be created from this row's data), 'existing' (a matching product already
// exists — per the client's instruction, ONLY its IMEIs get added, nothing else
// about it changes), or 'conflict' (one or more of this row's IMEIs already
// belong to a unit somewhere in this shop). Conflicts default to NOT accepted —
// the owner must explicitly tick them to proceed, everything else defaults to accepted.
async function classifyRows(req, valid) {
  const allImeis = [...new Set(valid.flatMap((v) => v.imeis))];
  const imeiSet = new Set(allImeis);
  const existingUnits = allImeis.length
    ? await PhoneUnit.find(tenantFilter(req, { $or: [{ imei1: { $in: allImeis } }, { imei2: { $in: allImeis } }, { serial: { $in: allImeis } }] })).populate('product', 'name')
    : [];
  const imeiOwner = new Map(); // imei/serial -> owning product's name
  for (const u of existingUnits) {
    for (const code of [u.imei1, u.imei2, u.serial]) {
      if (code && imeiSet.has(code)) imeiOwner.set(code, u.product?.name || 'another product');
    }
  }

  const byKey = await loadProductIndex(req);
  return valid.map((data) => {
    const existingProduct = byKey.get(productKey(data.name, data.category)) || null;
    const conflicts = data.imeis.filter((code) => imeiOwner.has(code)).map((code) => ({ imei: code, existingProduct: imeiOwner.get(code) }));
    const status = conflicts.length ? 'conflict' : existingProduct ? 'existing' : 'new';
    return { data, status, matchedProductName: existingProduct?.name || null, conflicts, accepted: status !== 'conflict' };
  });
}

function runSmartValidation(req) {
  if (!req.file) throw new ApiError(400, 'No file uploaded');
  const { rows, format, info = {} } = parseUploadedFile(req.file.buffer, req.file.originalname);
  if (!rows.length) throw new ApiError(400, 'Could not read any product rows from this file. The product name is the only thing required — a single column of names is enough.');
  const results = rows.map(normalizeSmartRow);
  const errors = [];
  const valid = [];
  results.forEach((r, i) => { if (r.ok) valid.push(r.data); else errors.push({ row: i + 2, message: r.message }); });
  return { format, total: rows.length, valid, errors, info };
}

// @route POST /api/import/smart/preview  (multipart, field: file)
// Dry-run for the "Smart Stock Import" — accepts any file shape (this shop's
// old-software HTML-as-.xls export, a real .xlsx/.xls, or CSV/TXT with
// whatever column names) and previews what it understood before writing anything.
// Every row is classified as new / existing (IMEIs only) / conflict, so the
// owner can review and accept or decline each one before committing.
export const smartImportPreview = asyncHandler(async (req, res) => {
  const { format, total, valid, errors, info } = runSmartValidation(req);
  const suppliers = [...new Set(valid.map((v) => v.supplierName).filter(Boolean))].sort();
  const withPrices = valid.some((v) => v.purchasePrice > 0 || v.sellingPrice > 0);
  const business = await Business.findById(req.businessId);
  const rows = await classifyRows(req, valid);
  ok(res, {
    format, total, validCount: valid.length, errorCount: errors.length,
    errors: errors.slice(0, 200), suppliers, withPrices, rows,
    conflictCount: rows.filter((r) => r.status === 'conflict').length,
    defaultTrackSerial: business?.type === 'mobile',
    // what the parser made of the file's columns — lets the owner confirm the
    // mapping (and see when the name column had to be guessed) before importing
    columnMap: info.columnMap || {},
    assumedNameColumn: info.assumedNameColumn || null,
    ignoredColumns: info.ignoredColumns || [],
  });
});

// @route POST /api/import/smart/commit  (multipart, field: file, plus a
// `skipRows` form field — a JSON array of 0-based indices into the valid-row
// list the owner declined during preview, e.g. conflict rows left unticked)
// Find-or-creates a Supplier per distinct name. If a product with this exact
// name+category already exists, ONLY its IMEIs are added — none of its own
// fields (price/warranty/etc.) are touched. Otherwise the whole product is
// created from the row. This is a historical-data migration, not a live
// transaction — no Purchase/Expense is booked, since there's no real payment
// happening right now.
export const smartImportCommit = asyncHandler(async (req, res) => {
  const { valid, errors } = runSmartValidation(req);
  let skipRows = new Set();
  try { skipRows = new Set(JSON.parse(req.body.skipRows || '[]').map(Number)); } catch { /* malformed — treat as none skipped */ }

  let createdProducts = 0, existingProductsGivenImeis = 0, createdSuppliers = 0, addedUnits = 0, skippedDuplicateImeis = 0;

  // Mobile shops track every device by IMEI/serial individually — match the
  // same default the manual Add Product form already uses for this business type,
  // so imported phone stock shows the same "Manage IMEIs" controls everywhere.
  const business = await Business.findById(req.businessId);
  const defaultTrackSerial = business?.type === 'mobile';

  const rows = valid.filter((_, i) => !skipRows.has(i));

  // ---- suppliers: one read + one bulk insert for the whole file ----
  const supplierByName = new Map(); // lowercased name -> _id
  const wantedSuppliers = [...new Map(
    rows.map((r) => r.supplierName.trim()).filter(Boolean).map((n) => [n.toLowerCase(), n])
  ).values()];
  if (wantedSuppliers.length) {
    const existing = await Supplier.find(tenantFilter(req, {})).select('name').lean();
    for (const s of existing) supplierByName.set(String(s.name || '').trim().toLowerCase(), s._id);
    const missing = wantedSuppliers.filter((n) => !supplierByName.has(n.toLowerCase()));
    if (missing.length) {
      const made = await Supplier.insertMany(missing.map((name) => ({ business: req.businessId, name })));
      for (const s of made) supplierByName.set(String(s.name || '').trim().toLowerCase(), s._id);
      createdSuppliers = made.length;
    }
  }

  // ---- products: one read + one bulk insert ----
  const productIndex = await loadProductIndex(req);
  const productIdByKey = new Map();
  for (const [k, p] of productIndex) productIdByKey.set(k, p._id);

  const newDocs = new Map(); // key -> doc (dedupes rows repeating the same product)
  for (const data of rows) {
    const k = productKey(data.name, data.category);
    if (productIdByKey.has(k)) { existingProductsGivenImeis++; continue; } // its own fields are never touched
    if (newDocs.has(k)) continue;
    newDocs.set(k, {
      business: req.businessId, name: data.name, category: data.category,
      stock: data.imeis.length ? 0 : data.stock, // synced from real units below when IMEIs are given
      purchasePrice: data.purchasePrice, sellingPrice: data.sellingPrice, discountPercent: data.discountPercent,
      barcode: data.barcode || undefined, sku: data.sku,
      brand: data.brand, storage: data.storage, color: data.color,
      warrantyBrandMonths: data.warrantyBrandMonths, warrantyShopMonths: data.warrantyShopMonths,
      supplier: supplierByName.get(data.supplierName.trim().toLowerCase()) || null,
      trackSerial: data.imeis.length > 0 || defaultTrackSerial,
    });
  }
  if (newDocs.size) {
    const made = await Product.insertMany([...newDocs.values()]);
    for (const p of made) productIdByKey.set(productKey(p.name, p.category), p._id);
    createdProducts = made.length;
  }

  // ---- IMEI units: one clash read + one bulk insert + one stock resync ----
  const imeiRows = rows.filter((r) => r.imeis.length);
  if (imeiRows.length) {
    const allCodes = [...new Set(imeiRows.flatMap((r) => r.imeis))];
    const clashes = await PhoneUnit.find(tenantFilter(req, {
      $or: [{ imei1: { $in: allCodes } }, { imei2: { $in: allCodes } }, { serial: { $in: allCodes } }],
    })).select('imei1 imei2 serial').lean();
    const taken = new Set();
    for (const u of clashes) for (const c of [u.imei1, u.imei2, u.serial]) if (c) taken.add(c);

    const unitDocs = [];
    for (const data of imeiRows) {
      const productId = productIdByKey.get(productKey(data.name, data.category));
      if (!productId) continue;
      for (const code of data.imeis) {
        // already flagged during preview; re-checked here so an accepted conflict
        // row only skips the codes truly taken, and repeats inside the file collapse
        if (taken.has(code)) { skippedDuplicateImeis++; continue; }
        taken.add(code);
        unitDocs.push({ business: req.businessId, product: productId, imei1: code, status: 'in_stock' });
      }
    }
    if (unitDocs.length) {
      await PhoneUnit.insertMany(unitDocs);
      addedUnits = unitDocs.length;
      const touched = [...new Set(unitDocs.map((u) => String(u.product)))].map((id) => new mongoose.Types.ObjectId(id));
      const counts = await PhoneUnit.aggregate([
        { $match: { business: new mongoose.Types.ObjectId(req.businessId), product: { $in: touched }, status: 'in_stock' } },
        { $group: { _id: '$product', n: { $sum: 1 } } },
      ]);
      if (counts.length) {
        await Product.bulkWrite(counts.map((c) => ({
          updateOne: {
            filter: { _id: c._id, business: new mongoose.Types.ObjectId(req.businessId) },
            update: { $set: { stock: c.n, trackSerial: true } },
          },
        })));
      }
    }
  }

  const recordCount = createdProducts + existingProductsGivenImeis;
  await ImportExportLog.create({
    business: req.businessId, action: 'import', entity: 'smart-products', format: 'auto',
    recordCount, errorCount: errors.length, createdBy: req.user._id,
  });
  await logActivity(req, {
    action: 'IMPORT_DATA', entity: 'Import',
    meta: { entity: 'smart-products', created: createdProducts, existingGivenImeis: existingProductsGivenImeis, suppliersCreated: createdSuppliers, unitsAdded: addedUnits, duplicateImeisSkipped: skippedDuplicateImeis, errors: errors.length },
  });
  ok(res, {
    createdProducts, existingProductsGivenImeis, createdSuppliers, addedUnits, skippedDuplicateImeis,
    skipped: errors.length, errors: errors.slice(0, 200),
  }, 'Import complete');
});

// @route POST /api/import/backup/restore  body: { json }
// Additive-only restore of the foundational (non-relational) entities from a
// full backup — Products, Customers, Suppliers, Expenses. Sales/Purchases/
// Installments/Returns reference other collections and would need id-remapping
// to stay consistent, so they're exported for record-keeping/migration but not
// auto-restored here — re-enter transactional history by hand if ever needed.
export const restoreBackup = asyncHandler(async (req, res) => {
  const { json } = req.body;
  if (!json || typeof json !== 'object') throw new ApiError(400, 'Invalid backup file');
  const strip = (doc) => { const { _id, business, createdAt, updatedAt, __v, ...rest } = doc; return rest; };

  const counts = { products: 0, customers: 0, suppliers: 0, expenses: 0 };
  for (const p of json.products || []) { await Product.create({ ...strip(p), business: req.businessId }); counts.products++; }
  for (const c of json.customers || []) { await Customer.create({ ...strip(c), business: req.businessId }); counts.customers++; }
  for (const s of json.suppliers || []) { await Supplier.create({ ...strip(s), business: req.businessId }); counts.suppliers++; }
  for (const e of json.expenses || []) { await Expense.create({ ...strip(e), business: req.businessId }); counts.expenses++; }

  const recordCount = Object.values(counts).reduce((a, b) => a + b, 0);
  await ImportExportLog.create({ business: req.businessId, action: 'restore', entity: 'full', format: 'json', recordCount, createdBy: req.user._id });
  await logActivity(req, { action: 'RESTORE_BACKUP', entity: 'Business', meta: counts });
  ok(res, { counts }, 'Backup restored (Products, Customers, Suppliers, Expenses)');
});
