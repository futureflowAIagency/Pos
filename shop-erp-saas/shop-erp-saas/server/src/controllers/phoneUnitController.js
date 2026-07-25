import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok, created } from '../utils/apiResponse.js';
import { tenantFilter } from '../middleware/tenant.js';
import { logActivity } from '../middleware/activityLogger.js';
import PhoneUnit from '../models/PhoneUnit.js';
import Product from '../models/Product.js';

// Recompute a product's stock from its in-stock units.
const syncProductStock = async (req, productId) => {
  const inStock = await PhoneUnit.countDocuments(tenantFilter(req, { product: productId, status: 'in_stock' }));
  await Product.updateOne(tenantFilter(req, { _id: productId }), { stock: inStock, trackSerial: true });
  return inStock;
};

// @route GET /api/units?product=&status=&search=
export const getUnits = asyncHandler(async (req, res) => {
  const { product, status, search } = req.query;
  const q = tenantFilter(req);
  if (product) q.product = product;
  if (status) q.status = status;
  if (search) q.$or = [
    { imei1: { $regex: search, $options: 'i' } },
    { imei2: { $regex: search, $options: 'i' } },
    { serial: { $regex: search, $options: 'i' } },
  ];
  const units = await PhoneUnit.find(q).populate('product', 'name brand color storage sellingPrice discountPercent expiryDate').sort('-createdAt');
  ok(res, { units, count: units.length });
});

// @route POST /api/units  body: { product, units:[{imei1, imei2, serial}] }
export const addUnits = asyncHandler(async (req, res) => {
  const { product, units = [] } = req.body;
  if (!product) throw new ApiError(400, 'Product is required');
  if (!units.length) throw new ApiError(400, 'Provide at least one IMEI / serial');

  const prod = await Product.findOne(tenantFilter(req, { _id: product }));
  if (!prod) throw new ApiError(404, 'Product not found');

  // validate + de-dupe within the submitted batch
  const seen = new Set();
  const clean = [];
  for (const u of units) {
    const imei1 = (u.imei1 || '').trim();
    const serial = (u.serial || '').trim();
    if (!imei1 && !serial) throw new ApiError(400, 'Each unit needs an IMEI or a serial number');
    const key = imei1 || serial;
    if (seen.has(key)) throw new ApiError(400, `Duplicate IMEI/serial in submission: ${key}`);
    seen.add(key);
    clean.push({ imei1, imei2: (u.imei2 || '').trim(), serial });
  }

  // block IMEIs/serials that already exist for this business
  const existing = await PhoneUnit.find(tenantFilter(req, {
    $or: [
      { imei1: { $in: clean.map((c) => c.imei1).filter(Boolean) } },
      { serial: { $in: clean.map((c) => c.serial).filter(Boolean) } },
    ],
  }));
  if (existing.length) {
    const dup = existing[0].imei1 || existing[0].serial;
    throw new ApiError(409, `IMEI/serial already exists: ${dup}`);
  }

  const docs = await PhoneUnit.insertMany(
    clean.map((c) => ({ ...c, business: req.businessId, product: prod._id, status: 'in_stock' }))
  );
  const stock = await syncProductStock(req, prod._id);

  await logActivity(req, { action: 'ADD_UNITS', entity: 'Product', entityId: prod._id, meta: { count: docs.length } });
  created(res, { units: docs, stock });
});

// @route DELETE /api/units/:id  (only in-stock units may be removed)
export const deleteUnit = asyncHandler(async (req, res) => {
  const unit = await PhoneUnit.findOne(tenantFilter(req, { _id: req.params.id }));
  if (!unit) throw new ApiError(404, 'Unit not found');
  if (unit.status === 'sold') throw new ApiError(400, 'Cannot delete a sold unit');
  await unit.deleteOne();
  await syncProductStock(req, unit.product);
  ok(res, {}, 'Unit removed');
});

// @route GET /api/units/lookup?imei=...  -> resolve one in-stock unit for POS
export const lookupUnit = asyncHandler(async (req, res) => {
  const { imei } = req.query;
  if (!imei) throw new ApiError(400, 'IMEI / serial is required');
  const term = imei.trim();
  const unit = await PhoneUnit.findOne(tenantFilter(req, {
    status: 'in_stock',
    $or: [{ imei1: term }, { imei2: term }, { serial: term }],
  })).populate('product');
  if (!unit) throw new ApiError(404, 'No in-stock device found for this IMEI/serial');
  ok(res, { unit });
});

// @route GET /api/units/warranty?imei=...  -> warranty check portal
export const warrantyCheck = asyncHandler(async (req, res) => {
  const { imei } = req.query;
  if (!imei) throw new ApiError(400, 'IMEI / serial is required');
  const term = imei.trim();
  const unit = await PhoneUnit.findOne(tenantFilter(req, {
    $or: [{ imei1: term }, { imei2: term }, { serial: term }],
  })).populate('product', 'name brand color storage');
  if (!unit) throw new ApiError(404, 'No device found for this IMEI/serial');

  const now = new Date();
  const active = unit.status === 'sold' && unit.warrantyExpiry && new Date(unit.warrantyExpiry) >= now;
  ok(res, {
    result: {
      product: unit.product,
      imei1: unit.imei1,
      imei2: unit.imei2,
      serial: unit.serial,
      status: unit.status,
      soldAt: unit.soldAt,
      customerName: unit.customerName,
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
