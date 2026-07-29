import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok, created } from '../utils/apiResponse.js';
import { tenantFilter, branchFilter } from '../middleware/tenant.js';
import { logActivity } from '../middleware/activityLogger.js';
import Installment from '../models/Installment.js';
import Customer from '../models/Customer.js';
import Product from '../models/Product.js';
import PhoneUnit from '../models/PhoneUnit.js';

const TENDERS = ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card'];
const KYC_FIELDS = [
  'customerPhone', 'customerNid', 'presentAddress', 'permanentAddress',
  'fatherName', 'fatherNid', 'fatherPhone', 'motherName', 'motherNid', 'motherPhone',
  'guarantorName', 'guarantorPhone', 'guarantorNid', 'guarantorAddress',
];

// @route GET /api/installments?status=
export const getInstallments = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const q = branchFilter(req);
  if (status) q.status = status;
  const installments = await Installment.find(q).sort('-createdAt');
  const emiReceivable = installments.filter((i) => i.status === 'active').reduce((s, i) => s + i.balance, 0);
  ok(res, { installments, count: installments.length, emiReceivable });
});

// @route GET /api/installments/:id
export const getInstallment = asyncHandler(async (req, res) => {
  const installment = await Installment.findOne(branchFilter(req, { _id: req.params.id }));
  if (!installment) throw new ApiError(404, 'Installment plan not found');
  ok(res, { installment });
});

// @route POST /api/installments
// body: { customer, product?, unit?, productName, totalAmount, downPayment, downPaymentMethod, months, firstDueDate, ...KYC fields }
// If a product/unit is given, stock is deducted immediately (device is considered sold, req 10).
export const createInstallment = asyncHandler(async (req, res) => {
  const {
    customer = null, product = null, unit = null, productName = '',
    totalAmount, downPayment = 0, downPaymentMethod = 'cash', months, firstDueDate, sale = null,
  } = req.body;
  if (!customer) throw new ApiError(400, 'Customer is required');
  const total = Number(totalAmount || 0);
  const down = Number(downPayment || 0);
  const n = Number(months || 0);
  if (total <= 0) throw new ApiError(400, 'Total amount must be greater than 0');
  if (n < 1) throw new ApiError(400, 'Number of instalments must be at least 1');
  if (down > total) throw new ApiError(400, 'Down payment cannot exceed total amount');

  const cust = await Customer.findOne(tenantFilter(req, { _id: customer }));
  if (!cust) throw new ApiError(404, 'Customer not found');
  const customerName = cust.name;
  if (req.body.customerNid && !cust.nid) { cust.nid = req.body.customerNid; await cust.save(); } // backfill NID

  // ---- financed item: deduct stock (req 10) ----
  let prodDoc = null;
  let unitDoc = null;
  let imei1 = '', imei2 = '', serial = '';
  if (product) {
    prodDoc = await Product.findOne(branchFilter(req, { _id: product }));
    if (!prodDoc) throw new ApiError(404, 'Product not found');

    if (prodDoc.trackSerial) {
      if (!unit) throw new ApiError(400, 'Select a device (IMEI/serial) for this serial-tracked product');
      unitDoc = await PhoneUnit.findOne(branchFilter(req, { _id: unit }));
      if (!unitDoc) throw new ApiError(404, 'Device unit not found');
      if (unitDoc.status === 'sold') throw new ApiError(400, `Device ${unitDoc.imei1 || unitDoc.serial} is already sold`);
      if (String(unitDoc.product) !== String(prodDoc._id)) throw new ApiError(400, 'Unit does not match product');
      imei1 = unitDoc.imei1; imei2 = unitDoc.imei2; serial = unitDoc.serial;
    } else {
      if (prodDoc.stock < 1) throw new ApiError(400, `Insufficient stock for ${prodDoc.name}`);
    }
  }

  const financed = total - down;
  const per = Math.round((financed / n) * 100) / 100;
  const start = firstDueDate ? new Date(firstDueDate) : new Date();
  const schedule = [];
  let allocated = 0;
  for (let i = 0; i < n; i++) {
    const due = new Date(start);
    due.setMonth(due.getMonth() + i);
    // last instalment absorbs any rounding remainder
    const amount = i === n - 1 ? Math.round((financed - allocated) * 100) / 100 : per;
    allocated += amount;
    schedule.push({ no: i + 1, dueDate: due, amount, paid: false });
  }

  const kyc = {};
  for (const f of KYC_FIELDS) if (req.body[f] !== undefined) kyc[f] = req.body[f];

  const installment = await Installment.create({
    business: req.businessId,
    branch: req.branchId,
    customer, customerName, productName, sale,
    product: prodDoc?._id || null, unit: unitDoc?._id || null, imei1, imei2, serial,
    totalAmount: total, downPayment: down,
    downPaymentMethod: TENDERS.includes(downPaymentMethod) ? downPaymentMethod : 'cash',
    months: n, schedule, status: 'active', createdBy: req.user._id,
    ...kyc,
  });

  // now actually deduct stock / mark the device sold
  if (unitDoc) {
    unitDoc.status = 'sold';
    unitDoc.installment = installment._id;
    unitDoc.soldAt = new Date();
    unitDoc.soldPrice = total;
    unitDoc.customer = cust._id;
    unitDoc.customerName = customerName;
    const MONTH = 30 * 24 * 60 * 60 * 1000;
    const brandMonths = prodDoc.warrantyBrandMonths || 0;
    const shopMonths = prodDoc.warrantyShopMonths || 0;
    unitDoc.warrantyBrandMonths = brandMonths;
    unitDoc.warrantyShopMonths = shopMonths;
    unitDoc.warrantyBrandExpiry = brandMonths > 0 ? new Date(Date.now() + brandMonths * MONTH) : null;
    unitDoc.warrantyShopExpiry = shopMonths > 0 ? new Date(Date.now() + shopMonths * MONTH) : null;
    unitDoc.warrantyMonths = Math.max(brandMonths, shopMonths);
    unitDoc.warrantyExpiry = unitDoc.warrantyMonths > 0 ? new Date(Date.now() + unitDoc.warrantyMonths * MONTH) : null;
    await unitDoc.save();
    const inStock = await PhoneUnit.countDocuments(branchFilter(req, { product: prodDoc._id, status: 'in_stock' }));
    await Product.updateOne(branchFilter(req, { _id: prodDoc._id }), { stock: inStock });
  } else if (prodDoc) {
    prodDoc.stock = Math.max(0, prodDoc.stock - 1);
    await prodDoc.save();
  }

  await logActivity(req, { action: 'CREATE_INSTALLMENT', entity: 'Installment', entityId: installment._id, meta: { total, months: n } });
  created(res, { installment });
});

// @route PATCH /api/installments/:id/pay  body: { no, method }  -> mark one instalment paid
export const payInstallment = asyncHandler(async (req, res) => {
  const { no, method = 'cash' } = req.body;
  const installment = await Installment.findOne(branchFilter(req, { _id: req.params.id }));
  if (!installment) throw new ApiError(404, 'Installment plan not found');
  const row = installment.schedule.find((s) => s.no === Number(no));
  if (!row) throw new ApiError(404, 'Instalment not found');
  if (row.paid) throw new ApiError(400, 'Instalment already paid');
  row.paid = true;
  row.paidAt = new Date();
  row.method = TENDERS.includes(method) ? method : 'cash';
  if (installment.schedule.every((s) => s.paid)) installment.status = 'completed';
  await installment.save();
  await logActivity(req, { action: 'PAY_INSTALLMENT', entity: 'Installment', entityId: installment._id, meta: { no, method: row.method } });
  ok(res, { installment, paidRow: row }, 'Instalment marked paid');
});

// @route DELETE /api/installments/:id
export const deleteInstallment = asyncHandler(async (req, res) => {
  const installment = await Installment.findOneAndDelete(branchFilter(req, { _id: req.params.id }));
  if (!installment) throw new ApiError(404, 'Installment plan not found');
  await logActivity(req, { action: 'DELETE_INSTALLMENT', entity: 'Installment', entityId: installment._id });
  ok(res, {}, 'Installment plan deleted');
});
