import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok, created } from '../utils/apiResponse.js';
import { tenantFilter } from '../middleware/tenant.js';
import { logActivity } from '../middleware/activityLogger.js';
import { computeBalances, computeAccountBalances } from '../services/balanceService.js';
import PaymentAccount from '../models/PaymentAccount.js';

const METHODS = ['bank', 'bkash', 'nagad', 'rocket', 'card'];

// @route GET /api/payment-accounts?method=&activeOnly=true
export const getPaymentAccounts = asyncHandler(async (req, res) => {
  const { method, activeOnly } = req.query;
  const q = tenantFilter(req);
  if (method) q.method = method;
  if (activeOnly === 'true') q.isActive = true;
  const accounts = await PaymentAccount.find(q).sort('method name');
  ok(res, { accounts, count: accounts.length });
});

// @route POST /api/payment-accounts  body: { method, name, accountNumber, note }
export const createPaymentAccount = asyncHandler(async (req, res) => {
  const { method, name, accountNumber = '', note = '' } = req.body;
  if (!METHODS.includes(method)) throw new ApiError(400, 'Invalid payment method');
  if (!name?.trim()) throw new ApiError(400, 'Account name is required');
  const account = await PaymentAccount.create({
    business: req.businessId, method, name: name.trim(), accountNumber: accountNumber.trim(), note,
  });
  await logActivity(req, { action: 'CREATE_PAYMENT_ACCOUNT', entity: 'PaymentAccount', entityId: account._id, meta: { method, name: account.name } });
  created(res, { account });
});

// @route PUT /api/payment-accounts/:id
export const updatePaymentAccount = asyncHandler(async (req, res) => {
  const account = await PaymentAccount.findOne(tenantFilter(req, { _id: req.params.id }));
  if (!account) throw new ApiError(404, 'Account not found');
  const { method, name, accountNumber, note, isActive } = req.body;
  if (method !== undefined) {
    if (!METHODS.includes(method)) throw new ApiError(400, 'Invalid payment method');
    account.method = method;
  }
  if (name !== undefined) {
    if (!name.trim()) throw new ApiError(400, 'Account name is required');
    account.name = name.trim();
  }
  if (accountNumber !== undefined) account.accountNumber = accountNumber;
  if (note !== undefined) account.note = note;
  if (isActive !== undefined) account.isActive = !!isActive;
  await account.save();
  await logActivity(req, { action: 'UPDATE_PAYMENT_ACCOUNT', entity: 'PaymentAccount', entityId: account._id });
  ok(res, { account }, 'Account updated');
});

// @route GET /api/payment-accounts/balances?allBranches=true
// Named-account balances for Dashboard/Finance ("kon bank a koto taka ache") —
// each active account's own running balance, plus how much of each method's
// overall total (the existing per-method Balances row) isn't tied to any
// specific named account yet (older records, or an account left unspecified).
export const getPaymentAccountBalances = asyncHandler(async (req, res) => {
  const allBranches = req.query.allBranches === 'true' && ['owner', 'superadmin'].includes(req.user.role);
  const branchId = allBranches ? null : req.branchId;
  const [accounts, methodBalances, net] = await Promise.all([
    PaymentAccount.find(tenantFilter(req, { isActive: true })).sort('method name'),
    computeBalances(req.businessId, branchId),
    computeAccountBalances(req.businessId, branchId),
  ]);
  const list = accounts.map((a) => ({
    _id: a._id, method: a.method, name: a.name, accountNumber: a.accountNumber,
    balance: Math.round((net[String(a._id)] || 0) * 100) / 100,
  }));
  const unassigned = {};
  for (const m of METHODS) {
    const namedSum = list.filter((a) => a.method === m).reduce((s, a) => s + a.balance, 0);
    unassigned[m] = Math.round(((methodBalances[m] || 0) - namedSum) * 100) / 100;
  }
  ok(res, { accounts: list, unassigned, methodBalances });
});

// @route PATCH /api/payment-accounts/:id/toggle
// No hard delete — past sales/expenses/etc. may already reference this account
// by id, and deleting the document out from under them would turn a real
// historical record into an unlabeled one. A reversible toggle (matches
// Branch's own toggleActive) just hides/shows it in the pickers used when
// recording NEW money movements; existing history is unaffected either way.
export const togglePaymentAccount = asyncHandler(async (req, res) => {
  const account = await PaymentAccount.findOne(tenantFilter(req, { _id: req.params.id }));
  if (!account) throw new ApiError(404, 'Account not found');
  account.isActive = !account.isActive;
  await account.save();
  await logActivity(req, { action: 'TOGGLE_PAYMENT_ACCOUNT', entity: 'PaymentAccount', entityId: account._id, meta: { isActive: account.isActive } });
  ok(res, { account }, account.isActive ? 'Account activated' : 'Account deactivated');
});
