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
  // Opt-in pagination: callers that send no page/pageSize (the customer picker
  // on the EMI screen, for instance) still get the full list exactly as before.
  const wantsPage = req.query.page !== undefined || req.query.pageSize !== undefined;
  const pg = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));

  let cq = Customer.find(q).sort('-createdAt').lean();
  if (wantsPage) cq = cq.skip((pg - 1) * pageSize).limit(pageSize);
  const [customers, total] = await Promise.all([
    cq,
    wantsPage ? Customer.countDocuments(q) : Promise.resolve(null),
  ]);

  // How much of each customer's outstanding due came from a sale marked EMI at
  // the cart, and which products those were — so the list can separate "EMI Due"
  // from an ordinary due instead of showing one undifferentiated number.
  // Business-wide, exactly like Customer.totalDue itself (customers are shared
  // across branches), and computed live from the sales rather than stored, so it
  // can never drift out of step with what's actually owed.
  const emiSales = await Sale.find(tenantFilter(req, { isEmi: true, due: { $gt: 0 }, customer: { $ne: null } }))
    .select('customer due invoiceNo createdAt items.name items.qty')
    .lean();
  const emiByCustomer = new Map(); // customerId -> { amount, invoices:[{invoiceNo, due, date, products}] }
  for (const s of emiSales) {
    const key = String(s.customer);
    const entry = emiByCustomer.get(key) || { amount: 0, invoices: [] };
    entry.amount += s.due || 0;
    entry.invoices.push({
      invoiceNo: s.invoiceNo,
      due: s.due || 0,
      date: s.createdAt,
      products: (s.items || []).map((i) => (i.qty > 1 ? `${i.name} ×${i.qty}` : i.name)),
    });
    emiByCustomer.set(key, entry);
  }
  for (const c of customers) {
    const e = emiByCustomer.get(String(c._id));
    c.emiDue = e ? Math.round(e.amount * 100) / 100 : 0;
    c.emiInvoices = e ? e.invoices : [];
    // whatever is left over is ordinary (non-EMI) due
    c.regularDue = Math.max(0, Math.round(((c.totalDue || 0) - c.emiDue) * 100) / 100);
  }

  ok(res, { customers, count: customers.length, ...(wantsPage ? { total, page: pg, pageSize } : {}) });
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
