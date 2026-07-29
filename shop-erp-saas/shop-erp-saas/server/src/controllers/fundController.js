import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok, created } from '../utils/apiResponse.js';
import { branchFilter } from '../middleware/tenant.js';
import { logActivity } from '../middleware/activityLogger.js';
import Fund from '../models/Fund.js';

// @route GET /api/funds  — list fund entries (optionally by date range)
export const getFunds = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const q = branchFilter(req);
  if (from || to) {
    q.date = {};
    if (from) q.date.$gte = new Date(from);
    if (to) q.date.$lte = new Date(to + 'T23:59:59');
  }
  const funds = await Fund.find(q).sort('-date').populate('addedBy', 'name');
  const total = funds.reduce((s, f) => s + (f.amount || 0), 0);
  ok(res, { funds, count: funds.length, total });
});

// @route POST /api/funds  — add capital into a payment-method balance, or (type:'withdraw')
// take part/all of previously-added capital back out. Neither is income or an expense.
export const createFund = asyncHandler(async (req, res) => {
  const { source = 'cash', type = 'add', amount, note = '', date } = req.body;
  if (!amount || Number(amount) <= 0) throw new ApiError(400, 'Amount must be greater than 0');
  const fund = await Fund.create({
    business: req.businessId,
    branch: req.branchId,
    source,
    type: type === 'withdraw' ? 'withdraw' : 'add',
    amount: Number(amount),
    note,
    date: date ? new Date(date) : new Date(),
    addedBy: req.user._id,
  });
  await logActivity(req, { action: type === 'withdraw' ? 'WITHDRAW_FUND' : 'ADD_FUND', entity: 'Fund', entityId: fund._id });
  created(res, { fund });
});

// @route DELETE /api/funds/:id
export const deleteFund = asyncHandler(async (req, res) => {
  const fund = await Fund.findOneAndDelete(branchFilter(req, { _id: req.params.id }));
  if (!fund) throw new ApiError(404, 'Fund entry not found');
  await logActivity(req, { action: 'DELETE_FUND', entity: 'Fund', entityId: req.params.id });
  ok(res, {}, 'Fund entry deleted');
});
