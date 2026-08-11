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
// body: { customer?, customerName?, customerPhone?, product?, unit?, productName, totalAmount,
//         purchasePrice?, downPayment, downPaymentMethod, months, firstDueDate, ...KYC fields }
// This is a real sale on credit: if a product/unit is given, stock is deducted
// immediately (the device leaves the shop), and the item's cost is snapshotted so
// the plan's profit can be recognised payment by payment (see emiService.js).
export const createInstallment = asyncHandler(async (req, res) => {
  const {
    customer = null, product = null, unit = null, productName = '',
    totalAmount, downPayment = 0, downPaymentMethod = 'cash', months, firstDueDate, sale = null,
  } = req.body;
  const total = Number(totalAmount || 0);
  const down = Number(downPayment || 0);
  const n = Number(months || 0);
  if (total <= 0) throw new ApiError(400, 'Total amount must be greater than 0');
  if (n < 1) throw new ApiError(400, 'Number of instalments must be at least 1');
  if (down > total) throw new ApiError(400, 'Down payment cannot exceed total amount');

  // Resolve the buyer: an existing customer, one matched by phone, or a new
  // record created here — an EMI sale should never be blocked on going to the
  // Customers page first. A named customer stays mandatory (unlike a walk-in
  // POS sale): the whole plan is money owed over months.
  let cust = null;
  if (customer) cust = await Customer.findOne(tenantFilter(req, { _id: customer }));
  const typedPhone = String(req.body.customerPhone || '').trim();
  const typedName = String(req.body.customerName || '').trim();
  if (!cust && typedPhone) cust = await Customer.findOne(tenantFilter(req, { phone: typedPhone }));
  if (!cust && (typedName || typedPhone)) {
    cust = await Customer.create({
      business: req.businessId,
      name: typedName || 'Customer',
      phone: typedPhone,
      nid: String(req.body.customerNid || '').trim(),
      address: String(req.body.presentAddress || '').trim(),
    });
  }
  if (!cust) throw new ApiError(400, "Select a customer, or enter the buyer's name and phone");
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

  // Cost basis for profit: what the shop paid for this item. Taken from the
  // linked product, unless the user typed one in (a hand-entered item, or a
  // device whose product record has no purchase price set).
  const typedCost = Number(req.body.purchasePrice);
  const purchasePrice = Number.isFinite(typedCost) && typedCost > 0
    ? typedCost
    : Number(prodDoc?.purchasePrice) || 0;

  // The product's normal price, so the EMI markup stays visible later. Falls back
  // to the linked product's (discount-adjusted) selling price.
  const typedBase = Number(req.body.basePrice);
  const productPrice = prodDoc
    ? Math.round(prodDoc.sellingPrice * (1 - Math.min(Math.max(prodDoc.discountPercent || 0, 0), 100) / 100) * 100) / 100
    : 0;
  const basePrice = Number.isFinite(typedBase) && typedBase > 0 ? typedBase : productPrice;

  const installment = await Installment.create({
    business: req.businessId,
    branch: req.branchId,
    customer: cust._id, customerName, productName, sale,
    product: prodDoc?._id || null, unit: unitDoc?._id || null, imei1, imei2, serial,
    totalAmount: total, basePrice, purchasePrice, downPayment: down,
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

// @route PATCH /api/installments/:id/cost  body: { purchasePrice }
// Set (or correct) what the financed item cost the shop. Plans created before
// the cost field existed show no profit at all until this is filled in, and a
// mistyped cost would otherwise be stuck for the life of the plan. Only the cost
// basis is editable here — the amounts the customer owes are not touched.
export const setInstallmentCost = asyncHandler(async (req, res) => {
  const cost = Number(req.body.purchasePrice);
  if (!Number.isFinite(cost) || cost < 0) throw new ApiError(400, 'Enter a valid item cost (0 or more)');
  const installment = await Installment.findOne(branchFilter(req, { _id: req.params.id }));
  if (!installment) throw new ApiError(404, 'Installment plan not found');
  if (cost > installment.totalAmount) throw new ApiError(400, 'Item cost cannot be more than the EMI price');

  const previous = installment.purchasePrice || 0;
  installment.purchasePrice = cost;
  await installment.save();

  await logActivity(req, {
    action: 'UPDATE_INSTALLMENT_COST', entity: 'Installment', entityId: installment._id,
    meta: { previous, cost },
  });
  ok(res, { installment }, 'Item cost updated');
});

// @route DELETE /api/installments/:id
export const deleteInstallment = asyncHandler(async (req, res) => {
  const installment = await Installment.findOneAndDelete(branchFilter(req, { _id: req.params.id }));
  if (!installment) throw new ApiError(404, 'Installment plan not found');
  await logActivity(req, { action: 'DELETE_INSTALLMENT', entity: 'Installment', entityId: installment._id });
  ok(res, {}, 'Installment plan deleted');
});
