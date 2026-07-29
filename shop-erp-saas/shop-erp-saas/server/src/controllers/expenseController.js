import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok, created } from '../utils/apiResponse.js';
import { branchFilter } from '../middleware/tenant.js';
import { logActivity } from '../middleware/activityLogger.js';
import Expense from '../models/Expense.js';

export const getExpenses = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const q = branchFilter(req);
  if (from || to) {
    q.date = {};
    if (from) q.date.$gte = new Date(from);
    if (to) q.date.$lte = new Date(to + 'T23:59:59');
  }
  const expenses = await Expense.find(q).sort('-date');
  ok(res, { expenses, count: expenses.length });
});

export const createExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.create({ ...req.body, business: req.businessId, branch: req.branchId });
  await logActivity(req, { action: 'CREATE_EXPENSE', entity: 'Expense', entityId: expense._id });
  created(res, { expense });
});

export const deleteExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findOneAndDelete(branchFilter(req, { _id: req.params.id }));
  if (!expense) throw new ApiError(404, 'Expense not found');
  ok(res, {}, 'Expense deleted');
});
