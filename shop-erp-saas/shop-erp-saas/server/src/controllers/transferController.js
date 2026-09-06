import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok, created } from '../utils/apiResponse.js';
import { branchFilter } from '../middleware/tenant.js';
import { logActivity } from '../middleware/activityLogger.js';
import { resolveAccountId } from '../utils/paymentAccounts.js';
import Transfer from '../models/Transfer.js';

const METHODS = ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card'];

// @route GET /api/transfers  — balance-transfer history
export const getTransfers = asyncHandler(async (req, res) => {
  const transfers = await Transfer.find(branchFilter(req)).sort('-date').populate('fromAccount', 'name accountNumber').populate('toAccount', 'name accountNumber');
  ok(res, { transfers, count: transfers.length });
});

// @route POST /api/transfers  — move money between two of the shop's own balances,
// optionally between two specific named accounts (e.g. one bank account to another).
export const createTransfer = asyncHandler(async (req, res) => {
  const { fromMethod, toMethod, fromAccount, toAccount, amount, note = '', date } = req.body;
  if (!METHODS.includes(fromMethod) || !METHODS.includes(toMethod)) throw new ApiError(400, 'Invalid payment method');
  if (!amount || Number(amount) <= 0) throw new ApiError(400, 'Amount must be greater than 0');

  const [fromAccId, toAccId] = await Promise.all([resolveAccountId(req, fromAccount), resolveAccountId(req, toAccount)]);
  // same method AND same (or no) specific account = moving money to itself
  const sameAccount = fromAccId && toAccId ? String(fromAccId) === String(toAccId) : !fromAccId && !toAccId;
  if (fromMethod === toMethod && sameAccount) throw new ApiError(400, 'Choose two different methods or accounts');

  const transfer = await Transfer.create({
    business: req.businessId,
    branch: req.branchId,
    fromMethod, toMethod,
    fromAccount: fromAccId, toAccount: toAccId,
    amount: Number(amount),
    note,
    date: date ? new Date(date) : new Date(),
    createdBy: req.user._id,
  });
  await logActivity(req, { action: 'TRANSFER_BALANCE', entity: 'Transfer', entityId: transfer._id, meta: { fromMethod, toMethod, amount: transfer.amount } });
  created(res, { transfer });
});

// @route DELETE /api/transfers/:id
export const deleteTransfer = asyncHandler(async (req, res) => {
  const transfer = await Transfer.findOneAndDelete(branchFilter(req, { _id: req.params.id }));
  if (!transfer) throw new ApiError(404, 'Transfer not found');
  await logActivity(req, { action: 'DELETE_TRANSFER', entity: 'Transfer', entityId: req.params.id });
  ok(res, {}, 'Transfer deleted');
});
