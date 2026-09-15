import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok, created } from '../utils/apiResponse.js';
import { branchFilter } from '../middleware/tenant.js';
import { logActivity } from '../middleware/activityLogger.js';
import { resolveAccountId } from '../utils/paymentAccounts.js';
import Expense from '../models/Expense.js';

export const getExpenses = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const q = branchFilter(req);
  if (from || to) {
    q.date = {};
    if (from) q.date.$gte = new Date(from);
    if (to) q.date.$lte = new Date(to + 'T23:59:59');
  }
  // Opt-in pagination: callers that send no page/pageSize (the customer picker
  // on the EMI screen, for instance) still get the full list exactly as before.
  const wantsPage = req.query.page !== undefined || req.query.pageSize !== undefined;
  const pg = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));

  let eq = Expense.find(q).sort('-date').populate('account', 'name accountNumber');
  if (wantsPage) eq = eq.skip((pg - 1) * pageSize).limit(pageSize);
  const [expenses, total] = await Promise.all([
    eq,
    wantsPage ? Expense.countDocuments(q) : Promise.resolve(null),
  ]);
  ok(res, { expenses, count: expenses.length, ...(wantsPage ? { total, page: pg, pageSize } : {}) });
});

export const createExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.create({
    ...req.body,
    business: req.businessId,
    branch: req.branchId,
    account: await resolveAccountId(req, req.body.account),
  });
  await logActivity(req, { action: 'CREATE_EXPENSE', entity: 'Expense', entityId: expense._id });
  created(res, { expense });
});

export const deleteExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findOneAndDelete(branchFilter(req, { _id: req.params.id }));
  if (!expense) throw new ApiError(404, 'Expense not found');
  ok(res, {}, 'Expense deleted');
});
