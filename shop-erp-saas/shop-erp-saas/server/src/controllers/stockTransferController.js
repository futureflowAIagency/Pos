import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok, created } from '../utils/apiResponse.js';
import { tenantFilter } from '../middleware/tenant.js';
import { logActivity } from '../middleware/activityLogger.js';
import StockTransfer from '../models/StockTransfer.js';
import Branch from '../models/Branch.js';
import Product from '../models/Product.js';
import PhoneUnit from '../models/PhoneUnit.js';

const genTransferNo = () =>
  'TRF-' + Date.now().toString().slice(-8) + '-' + Math.floor(Math.random() * 90 + 10);

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Serial-tracked stock is always DERIVED from the in-stock unit count, never
// set directly — the same rule productController/phoneUnitController follow.
const syncSerialStock = async (productId, branchId, businessId, session) => {
  const inStock = await PhoneUnit.countDocuments({
    business: businessId, branch: branchId, product: productId, status: 'in_stock',
  }).session(session);
  await Product.updateOne({ _id: productId }, { stock: inStock }).session(session);
};

const activeBranch = async (req, id, label) => {
  if (!id) throw new ApiError(400, `${label} branch is required`);
  const branch = await Branch.findOne(tenantFilter(req, { _id: id, isActive: true }));
  if (!branch) throw new ApiError(404, `${label} branch not found`);
  return branch;
};

// @route GET /api/stock-transfers/stock?branch=<id>&search=
// What's actually on the shelf at a given branch, for the transfer picker.
// Takes the branch explicitly rather than the X-Branch-Id header, because this
// screen deliberately reads a branch other than the one you're working in.
export const getBranchStock = asyncHandler(async (req, res) => {
  const branch = await activeBranch(req, req.query.branch, 'Source');
  const { search } = req.query;

  const q = tenantFilter(req, { branch: branch._id, isActive: true });
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    // an IMEI/serial should find the product holding it, same as the Products page
    const unitProductIds = await PhoneUnit.find(tenantFilter(req, {
      branch: branch._id, status: 'in_stock',
      $or: [{ imei1: rx }, { imei2: rx }, { serial: rx }],
    })).distinct('product');
    q.$or = [
      { name: rx }, { sku: rx }, { barcode: rx },
      ...(unitProductIds.length ? [{ _id: { $in: unitProductIds } }] : []),
    ];
  }

  const products = await Product.find(q).sort('name').limit(100).lean();
  const withStock = products.filter((p) => (p.stock || 0) > 0);

  // attach the in-stock devices for serial-tracked products, so the picker can
  // let the owner choose exactly which handsets go
  const serialIds = withStock.filter((p) => p.trackSerial).map((p) => p._id);
  const units = serialIds.length
    ? await PhoneUnit.find(tenantFilter(req, {
        branch: branch._id, product: { $in: serialIds }, status: 'in_stock',
      })).select('product imei1 imei2 serial').lean()
    : [];
  const byProduct = new Map();
  for (const u of units) {
    const k = String(u.product);
    if (!byProduct.has(k)) byProduct.set(k, []);
    byProduct.get(k).push(u);
  }

  ok(res, {
    products: withStock.map((p) => ({ ...p, units: byProduct.get(String(p._id)) || [] })),
  });
});

// Finds the destination branch's own Product for the same item, creating it if
// that branch has never stocked it. Matching by barcode first (a barcode
// identifies the model) then name+category, both case-insensitive — the same
// keys Smart Import already treats as a product's natural identity.
const resolveDestinationProduct = async (req, source, toBranchId, session) => {
  const base = { business: req.businessId, branch: toBranchId };
  let dest = null;

  if (source.barcode) {
    dest = await Product.findOne({ ...base, barcode: source.barcode }).session(session);
  }
  if (!dest) {
    dest = await Product.findOne({
      ...base,
      name: { $regex: `^${escapeRegex(source.name)}$`, $options: 'i' },
      category: { $regex: `^${escapeRegex(source.category || 'General')}$`, $options: 'i' },
    }).session(session);
  }
  if (dest) return { dest, createdNew: false };

  // never stocked here before — clone the item into this branch's catalog at 0
  // stock; the transfer itself is what puts stock on the shelf below.
  const copy = {
    business: req.businessId,
    branch: toBranchId,
    name: source.name,
    sku: source.sku,
    barcode: source.barcode,
    category: source.category,
    unit: source.unit,
    supplier: source.supplier || null,
    purchasePrice: source.purchasePrice,
    sellingPrice: source.sellingPrice,
    discountPercent: source.discountPercent,
    lowStockAlert: source.lowStockAlert,
    expiryDate: source.expiryDate,
    batchNo: source.batchNo,
    trackSerial: source.trackSerial,
    brand: source.brand,
    color: source.color,
    storage: source.storage,
    warrantyBrandMonths: source.warrantyBrandMonths,
    warrantyShopMonths: source.warrantyShopMonths,
    returnable: source.returnable,
    stock: 0,
  };
  const [made] = await Product.create([copy], { session });
  return { dest: made, createdNew: true };
};

// @route POST /api/stock-transfers
// body: { fromBranch, toBranch, note, items:[{ product, qty, unitIds:[] }] }
// Moves stock between two branches in one transaction: serial-tracked devices
// are re-homed unit by unit (so a specific IMEI physically follows the paperwork),
// quantity stock is decremented at the source and incremented at the destination.
export const createStockTransfer = asyncHandler(async (req, res) => {
  const { fromBranch, toBranch, note = '', items = [] } = req.body;
  if (String(fromBranch) === String(toBranch)) throw new ApiError(400, 'Pick two different branches');
  if (!items.length) throw new ApiError(400, 'Add at least one product to transfer');

  const from = await activeBranch(req, fromBranch, 'Source');
  const to = await activeBranch(req, toBranch, 'Destination');

  const session = await mongoose.startSession();
  let transfer;
  let createdProducts = 0;
  try {
    await session.withTransaction(async () => {
      const lines = [];
      let totalQty = 0;

      for (const it of items) {
        const source = await Product.findOne({
          _id: it.product, business: req.businessId, branch: from._id,
        }).session(session);
        if (!source) throw new ApiError(404, `Product not found at ${from.name}`);

        const { dest, createdNew } = await resolveDestinationProduct(req, source, to._id, session);
        if (createdNew) createdProducts += 1;

        const line = { product: source._id, toProduct: dest._id, name: source.name, units: [] };

        if (source.trackSerial) {
          const unitIds = it.unitIds || [];
          if (!unitIds.length) throw new ApiError(400, `Pick which devices to transfer for ${source.name}`);

          const units = await PhoneUnit.find({
            _id: { $in: unitIds },
            business: req.businessId, branch: from._id, product: source._id, status: 'in_stock',
          }).session(session);
          if (units.length !== unitIds.length) {
            throw new ApiError(400, `Some selected devices for ${source.name} are no longer in stock at ${from.name}`);
          }

          // re-home each device: it now lives in the destination branch, and
          // belongs to THAT branch's product document
          await PhoneUnit.updateMany(
            { _id: { $in: units.map((u) => u._id) } },
            { branch: to._id, product: dest._id }
          ).session(session);

          line.qty = units.length;
          line.units = units.map((u) => ({ unit: u._id, imei1: u.imei1, imei2: u.imei2, serial: u.serial }));

          await syncSerialStock(source._id, from._id, req.businessId, session);
          await syncSerialStock(dest._id, to._id, req.businessId, session);
        } else {
          const qty = Number(it.qty) || 0;
          if (qty <= 0) throw new ApiError(400, `Enter a quantity for ${source.name}`);
          if (qty > (source.stock || 0)) {
            throw new ApiError(400, `Only ${source.stock || 0} of ${source.name} in stock at ${from.name}`);
          }
          line.qty = qty;
          source.stock -= qty;
          await source.save({ session });
          dest.stock = (dest.stock || 0) + qty;
          await dest.save({ session });
        }

        totalQty += line.qty;
        lines.push(line);
      }

      const [made] = await StockTransfer.create([{
        business: req.businessId,
        transferNo: genTransferNo(),
        fromBranch: from._id,
        toBranch: to._id,
        items: lines,
        totalQty,
        note,
        createdBy: req.user._id,
      }], { session });
      transfer = made;
    });
  } finally {
    session.endSession();
  }

  await logActivity(req, {
    action: 'STOCK_TRANSFER', entity: 'StockTransfer', entityId: transfer._id,
    meta: { from: from.name, to: to.name, qty: transfer.totalQty },
  });
  created(res, { transfer, createdProducts });
});

// @route GET /api/stock-transfers — history, newest first (business-wide: a
// transfer is a movement BETWEEN branches, so it isn't scoped to either one).
export const getStockTransfers = asyncHandler(async (req, res) => {
  const transfers = await StockTransfer.find(tenantFilter(req))
    .populate('fromBranch', 'name')
    .populate('toBranch', 'name')
    .populate('createdBy', 'name')
    .sort('-createdAt')
    .limit(200);
  ok(res, { transfers });
});
