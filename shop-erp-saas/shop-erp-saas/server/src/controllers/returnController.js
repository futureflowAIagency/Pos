import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok, created } from '../utils/apiResponse.js';
import { tenantFilter, branchFilter } from '../middleware/tenant.js';
import { logActivity } from '../middleware/activityLogger.js';
import { expiredError } from '../utils/expiry.js';
import Return from '../models/Return.js';
import Sale from '../models/Sale.js';
import Product from '../models/Product.js';
import PhoneUnit from '../models/PhoneUnit.js';
import Customer from '../models/Customer.js';
import Business from '../models/Business.js';

const TENDERS = ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card'];

const genInvoiceNo = () =>
  'INV-' + Date.now().toString().slice(-8) + '-' + Math.floor(Math.random() * 90 + 10);

// Enforce the shop's return/exchange window (req 14 "Smart Business Rules").
// Staff may only act within the window; owner/superadmin may always override.
async function assertWithinWindow(req, sale) {
  const business = await Business.findById(req.businessId);
  const windowDays = business?.settings?.returnWindowDays || 7;
  const daysSince = (Date.now() - new Date(sale.createdAt).getTime()) / 86400000;
  if (daysSince > windowDays && !['owner', 'superadmin'].includes(req.user.role)) {
    throw new ApiError(403, `Return/exchange window (${windowDays} days) has expired for this invoice. Ask the shop owner to process it.`);
  }
}

// Validates + applies the "return out" side shared by both plain returns and
// exchanges: checks quantities/eligibility, reverses stock (resellable vs
// damaged), and mutates the sale's returnedQty/total/subTotal/profit in place.
// Everything is staged on the passed-in session; caller commits.
async function processReturnItems(req, session, sale, requestedItems) {
  if (!requestedItems.length) throw new ApiError(400, 'Select at least one item to return');

  let returnValue = 0;
  let profitReduction = 0;
  const returnDocItems = [];

  for (const ri of requestedItems) {
    const idx = Number(ri.index);
    const qty = Number(ri.qty || 0);
    const condition = ri.condition === 'damaged' ? 'damaged' : 'resellable';
    const line = sale.items[idx];
    if (!line) throw new ApiError(400, `Invalid line item index: ${idx}`);
    if (qty <= 0) throw new ApiError(400, `Enter a valid return quantity for ${line.name}`);
    const available = line.qty - (line.returnedQty || 0);
    if (qty > available) throw new ApiError(400, `Only ${available} unit(s) of "${line.name}" can still be returned`);

    if (line.product) {
      const product = await Product.findOne(branchFilter(req, { _id: line.product })).session(session);
      if (product && product.returnable === false) {
        throw new ApiError(400, `"${product.name}" is marked as not eligible for return/exchange`);
      }
      if (line.unit) {
        // serial-tracked line — qty is always 1, resolve the specific device
        const unit = await PhoneUnit.findOne(branchFilter(req, { _id: line.unit })).session(session);
        if (unit) {
          if (condition === 'resellable') {
            unit.status = 'in_stock';
            unit.sale = null; unit.installment = null; unit.soldAt = null; unit.soldPrice = 0;
            unit.customer = null; unit.customerName = '';
          } else {
            unit.status = 'damaged';
          }
          await unit.save({ session });
          const inStock = await PhoneUnit.countDocuments(branchFilter(req, { product: product._id, status: 'in_stock' })).session(session);
          product.stock = inStock;
        }
      } else if (condition === 'resellable') {
        product.stock = (product.stock || 0) + qty;
      }
      if (product) await product.save({ session });
    }

    line.returnedQty = (line.returnedQty || 0) + qty;
    returnValue += line.sellingPrice * qty;
    profitReduction += (line.sellingPrice - line.purchasePrice) * qty;

    returnDocItems.push({
      product: line.product, name: line.name, qty,
      unitPrice: line.sellingPrice, purchasePrice: line.purchasePrice,
      unit: line.unit || null, imei1: line.imei1 || '', imei2: line.imei2 || '', serial: line.serial || '',
      condition,
    });
  }

  sale.subTotal -= returnValue;
  sale.total -= returnValue;
  sale.profit -= profitReduction;
  sale.returned = sale.items.every((i) => i.returnedQty >= i.qty);

  const dueReduction = Math.min(sale.due, returnValue);
  sale.due -= dueReduction;

  return { returnValue, dueReduction, returnDocItems };
}

// @route POST /api/returns  — plain full/partial return (refund)
// body: { sale, items:[{index, qty, condition}], reason, refundType('refund'|'store_credit'), refundMethod }
export const createReturn = asyncHandler(async (req, res) => {
  const { sale: saleId, items = [], reason = '', refundType = 'refund', refundMethod = 'cash' } = req.body;
  const sale = await Sale.findOne(branchFilter(req, { _id: saleId }));
  if (!sale) throw new ApiError(404, 'Sale not found');
  await assertWithinWindow(req, sale);

  const session = await mongoose.startSession();
  let returnDoc;
  try {
    await session.withTransaction(async () => {
      const { returnValue, dueReduction, returnDocItems } = await processReturnItems(req, session, sale, items);

      // remaining value (already paid by the customer) is refunded or store-credited
      const remaining = Math.max(0, returnValue - dueReduction);
      const method = TENDERS.includes(refundMethod) ? refundMethod : 'cash';
      const cashRefund = refundType === 'store_credit' ? 0 : remaining;
      const storeCreditIssued = refundType === 'store_credit' ? remaining : 0;

      if (sale.due === 0) sale.paymentMethod = TENDERS.includes(sale.paidVia) ? sale.paidVia : 'cash';
      await sale.save({ session });

      let cust = null;
      if (sale.customer) {
        cust = await Customer.findOne(tenantFilter(req, { _id: sale.customer })).session(session);
        if (cust) {
          cust.totalDue = Math.max(0, cust.totalDue - dueReduction);
          cust.storeCredit = (cust.storeCredit || 0) + storeCreditIssued;
          await cust.save({ session });
        }
      }

      [returnDoc] = await Return.create([{
        business: req.businessId, branch: req.branchId, sale: sale._id, invoiceNo: sale.invoiceNo,
        customer: sale.customer, customerName: sale.customerName, type: 'return',
        items: returnDocItems, reason, returnValue, dueReduction, cashRefund, storeCreditIssued,
        refundMethod: method, createdBy: req.user._id,
      }], { session });
    });
  } finally {
    session.endSession();
  }

  await logActivity(req, { action: 'RETURN_SALE', entity: 'Sale', entityId: sale._id, meta: { invoiceNo: sale.invoiceNo, returnId: returnDoc._id } });
  created(res, { return: returnDoc, sale });
});

// @route POST /api/returns/exchange
// body: { sale, items:[{index, qty, condition}], reason,
//         newItems:[{product, unit?, qty}], paymentMethod, paidNow?, settlementType('refund'|'store_credit') }
export const createExchange = asyncHandler(async (req, res) => {
  const {
    sale: saleId, items = [], reason = '', newItems = [],
    paymentMethod = 'cash', paidNow, settlementType = 'refund',
  } = req.body;
  if (!newItems.length) throw new ApiError(400, 'Select at least one replacement item');

  const oldSale = await Sale.findOne(branchFilter(req, { _id: saleId }));
  if (!oldSale) throw new ApiError(404, 'Sale not found');
  await assertWithinWindow(req, oldSale);

  const session = await mongoose.startSession();
  let returnDoc, newSale;
  try {
    await session.withTransaction(async () => {
      const { returnValue, dueReduction, returnDocItems } = await processReturnItems(req, session, oldSale, items);
      const exchangeCredit = Math.max(0, returnValue - dueReduction);

      if (oldSale.due === 0) oldSale.paymentMethod = TENDERS.includes(oldSale.paidVia) ? oldSale.paidVia : 'cash';
      await oldSale.save({ session });

      let cust = null;
      if (oldSale.customer) {
        cust = await Customer.findOne(tenantFilter(req, { _id: oldSale.customer })).session(session);
        if (cust) {
          cust.totalDue = Math.max(0, cust.totalDue - dueReduction);
          await cust.save({ session });
        }
      }

      // ---- build the new sale (mirrors saleController.createSale) ----
      const lineItems = [];
      let newSubTotal = 0;
      let newProfit = 0;
      for (const it of newItems) {
        const product = await Product.findOne(branchFilter(req, { _id: it.product })).session(session);
        if (!product) throw new ApiError(404, `Product not found: ${it.product}`);
        // an exchange hands out a replacement item — same expiry rule as a sale
        const expired = expiredError(product);
        if (expired) throw new ApiError(400, expired);
        const pct = Math.min(Math.max(product.discountPercent || 0, 0), 100);
        const unitPrice = Math.round((product.sellingPrice * (1 - pct / 100)) * 100) / 100;
        const line = {
          product: product._id, name: product.name, qty: it.qty || 1,
          purchasePrice: product.purchasePrice, mrp: product.sellingPrice, discountPercent: pct, sellingPrice: unitPrice,
        };
        if (it.unit) {
          const unit = await PhoneUnit.findOne(branchFilter(req, { _id: it.unit })).session(session);
          if (!unit) throw new ApiError(404, 'Selected device unit not found');
          if (unit.status === 'sold') throw new ApiError(400, `Device ${unit.imei1 || unit.serial} is already sold`);
          if (String(unit.product) !== String(product._id)) throw new ApiError(400, 'Unit does not match product');
          line.qty = 1;
          const MONTH = 30 * 24 * 60 * 60 * 1000;
          const brandMonths = product.warrantyBrandMonths || 0;
          const shopMonths = product.warrantyShopMonths || 0;
          line.unit = unit._id; line.imei1 = unit.imei1; line.imei2 = unit.imei2; line.serial = unit.serial;
          line.warrantyBrandMonths = brandMonths; line.warrantyShopMonths = shopMonths;
          const wMonths = Math.max(brandMonths, shopMonths);
          line.warrantyMonths = wMonths;
          line.warrantyBrandExpiry = brandMonths > 0 ? new Date(Date.now() + brandMonths * MONTH) : null;
          line.warrantyShopExpiry = shopMonths > 0 ? new Date(Date.now() + shopMonths * MONTH) : null;
          line.warrantyExpiry = wMonths > 0 ? new Date(Date.now() + wMonths * MONTH) : null;

          newSubTotal += unitPrice;
          newProfit += unitPrice - product.purchasePrice;

          unit.status = 'sold'; unit.soldAt = new Date(); unit.soldPrice = unitPrice;
          unit.customer = oldSale.customer; unit.customerName = oldSale.customerName;
          unit.warrantyBrandMonths = brandMonths; unit.warrantyShopMonths = shopMonths;
          unit.warrantyBrandExpiry = line.warrantyBrandExpiry; unit.warrantyShopExpiry = line.warrantyShopExpiry;
          unit.warrantyMonths = wMonths; unit.warrantyExpiry = line.warrantyExpiry;
          await unit.save({ session });
          const inStock = await PhoneUnit.countDocuments(branchFilter(req, { product: product._id, status: 'in_stock' })).session(session);
          product.stock = inStock;
        } else {
          if (product.stock < line.qty) throw new ApiError(400, `Insufficient stock for ${product.name}`);
          newSubTotal += unitPrice * line.qty;
          newProfit += (unitPrice - product.purchasePrice) * line.qty;
          product.stock -= line.qty;
        }
        await product.save({ session });
        lineItems.push(line);
      }

      const priceDiff = Math.round((newSubTotal - exchangeCredit) * 100) / 100;
      const method = TENDERS.includes(paymentMethod) ? paymentMethod : 'cash';
      let paid = 0, due = 0, cashRefund = 0, storeCreditIssued = 0;
      if (priceDiff > 0) {
        paid = Math.min(Number(paidNow ?? priceDiff) || 0, priceDiff);
        due = priceDiff - paid;
      } else if (priceDiff < 0) {
        const owed = -priceDiff;
        if (settlementType === 'store_credit') storeCreditIssued = owed;
        else cashRefund = owed;
      }

      [newSale] = await Sale.create([{
        business: req.businessId, branch: req.branchId, invoiceNo: genInvoiceNo(),
        customer: oldSale.customer, customerName: oldSale.customerName, customerNid: oldSale.customerNid,
        items: lineItems, subTotal: newSubTotal, discount: 0, total: newSubTotal,
        paid, due, profit: newProfit,
        paymentMethod: due > 0 ? 'due' : method, paidVia: method, soldBy: req.user._id,
      }], { session });

      if (cust && storeCreditIssued > 0) {
        cust.storeCredit = (cust.storeCredit || 0) + storeCreditIssued;
        await cust.save({ session });
      }
      if (cust && due > 0) {
        cust.totalDue = (cust.totalDue || 0) + due;
        await cust.save({ session });
      }

      [returnDoc] = await Return.create([{
        business: req.businessId, branch: req.branchId, sale: oldSale._id, invoiceNo: oldSale.invoiceNo,
        customer: oldSale.customer, customerName: oldSale.customerName, type: 'exchange',
        items: returnDocItems, reason, returnValue, dueReduction, cashRefund, storeCreditIssued,
        refundMethod: method, exchangeSale: newSale._id, priceDiff, createdBy: req.user._id,
      }], { session });
    });
  } finally {
    session.endSession();
  }

  await logActivity(req, { action: 'EXCHANGE_SALE', entity: 'Sale', entityId: oldSale._id, meta: { invoiceNo: oldSale.invoiceNo, newInvoiceNo: newSale.invoiceNo } });
  created(res, { return: returnDoc, oldSale, newSale });
});

// @route GET /api/returns?sale=&customer=
export const getReturns = asyncHandler(async (req, res) => {
  const { sale, customer } = req.query;
  const q = branchFilter(req);
  if (sale) q.sale = sale;
  if (customer) q.customer = customer;
  const returns = await Return.find(q).sort('-createdAt').limit(200);
  ok(res, { returns, count: returns.length });
});

// @route GET /api/returns/:id
export const getReturn = asyncHandler(async (req, res) => {
  const doc = await Return.findOne(branchFilter(req, { _id: req.params.id }));
  if (!doc) throw new ApiError(404, 'Return not found');
  ok(res, { return: doc });
});
