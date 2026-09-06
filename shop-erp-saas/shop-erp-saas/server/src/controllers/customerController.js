import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok, created } from '../utils/apiResponse.js';
import { tenantFilter } from '../middleware/tenant.js';
import { logActivity } from '../middleware/activityLogger.js';
import { resolveAccountId } from '../utils/paymentAccounts.js';
import Customer from '../models/Customer.js';
import Sale from '../models/Sale.js';
import DuePayment from '../models/DuePayment.js';

const TENDERS = ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card'];

export const getCustomers = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const q = tenantFilter(req, { isActive: true });
  if (search) q.$or = [{ name: { $regex: search, $options: 'i' } }, { phone: { $regex: search, $options: 'i' } }];
  const customers = await Customer.find(q).sort('-createdAt');
  ok(res, { customers, count: customers.length });
});

export const createCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.create({ ...req.body, business: req.businessId });
  await logActivity(req, { action: 'CREATE_CUSTOMER', entity: 'Customer', entityId: customer._id });
  created(res, { customer });
});

export const updateCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findOneAndUpdate(tenantFilter(req, { _id: req.params.id }), req.body, { new: true });
  if (!customer) throw new ApiError(404, 'Customer not found');
  ok(res, { customer }, 'Customer updated');
});

export const deleteCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findOneAndUpdate(tenantFilter(req, { _id: req.params.id }), { isActive: false }, { new: true });
  if (!customer) throw new ApiError(404, 'Customer not found');
  ok(res, {}, 'Customer deleted');
});

// purchase history + due + due-payment history
export const customerHistory = asyncHandler(async (req, res) => {
  const customer = await Customer.findOne(tenantFilter(req, { _id: req.params.id }));
  if (!customer) throw new ApiError(404, 'Customer not found');
  const [sales, duePayments] = await Promise.all([
    Sale.find(tenantFilter(req, { customer: customer._id })).sort('-createdAt').populate('soldBy', 'name'),
    DuePayment.find(tenantFilter(req, { customer: customer._id })).sort('-date').populate('account', 'name accountNumber method'),
  ]);
  ok(res, { customer, sales, duePayments });
});

// record a due payment (customer pays back). Allocates across the customer's
// unpaid invoices oldest-first so each Sale.due updates in real time (req 4),
// records a DuePayment (history + balance by method), and returns receipt data.
export const collectDue = asyncHandler(async (req, res) => {
  const { amount, method = 'cash', account } = req.body;
  const amt = Number(amount || 0);
  if (amt <= 0) throw new ApiError(400, 'Enter a valid amount');
  const m = TENDERS.includes(method) ? method : 'cash';

  const customer = await Customer.findOne(tenantFilter(req, { _id: req.params.id }));
  if (!customer) throw new ApiError(404, 'Customer not found');

  const previousDue = customer.totalDue;
  const pay = Math.min(amt, customer.totalDue);

  // spread the payment across unpaid invoices, oldest first
  let remaining = pay;
  const dueSales = await Sale.find(tenantFilter(req, { customer: customer._id, due: { $gt: 0 } })).sort('createdAt');
  for (const s of dueSales) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, s.due);
    s.due = Math.max(0, s.due - take);
    if (s.due === 0) s.paymentMethod = m; // settled → DUE badge clears
    await s.save();
    remaining -= take;
  }

  customer.totalDue = Math.max(0, customer.totalDue - pay);
  if (customer.totalDue === 0) customer.dueDate = null; // fully settled — no reminder needed anymore
  await customer.save();

  const duePayment = await DuePayment.create({
    // `branch` was missing here entirely — DuePayment.branch is required (Phase
    // 25), and this route never chained resolveBranch, so every customer-level
    // Collect Due threw a validation error after already reducing the due (the
    // exact same class of bug the Pay Salary fix caught earlier this session).
    business: req.businessId, branch: req.branchId, customer: customer._id, sale: null,
    amount: pay, method: m, account: await resolveAccountId(req, account), previousDue, remainingDue: customer.totalDue, collectedBy: req.user._id,
  });
  await duePayment.populate('account', 'name accountNumber method');
  await logActivity(req, { action: 'COLLECT_DUE', entity: 'Customer', entityId: customer._id, meta: { amount: pay, method: m } });
  ok(res, { customer, duePayment }, 'Due collected');
});
