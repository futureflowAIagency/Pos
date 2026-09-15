import mongoose from 'mongoose';
import Sale from '../models/Sale.js';
import Fund from '../models/Fund.js';
import Expense from '../models/Expense.js';
import DuePayment from '../models/DuePayment.js';
import ServiceJob from '../models/ServiceJob.js';
import Installment from '../models/Installment.js';
import Purchase from '../models/Purchase.js';
import Return from '../models/Return.js';
import Transfer from '../models/Transfer.js';

export const METHODS = ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card'];

const emptyMap = () => METHODS.reduce((m, k) => { m[k] = 0; return m; }, {});

// Cumulative money-in/out per payment method → current balance per method.
// Money IN  = sale at-sale `paid` — split across `payments[]` when present (multi-tender
//           checkout), else the legacy single `paidVia` (includes exchange-created sales)
//           + due collections (by method) + service job `payments[]` (split
//           across methods when a job's bill was collected in parts, same
//           pattern as Sale; legacy jobs with no payments[] fall back to `paid`+`paymentMethod`)
//           + EMI down payments (by downPaymentMethod) + EMI instalment payments
//           (by schedule.method) + funds added (by source) + transfers in (by toMethod)
// Money OUT = expenses (by source) + supplier purchase/payment `paid` (by source)
//           + return/exchange cash refunds (by refundMethod; store-credit is excluded — no cash moves)
//           + "money back" hand-backs of an overpayment (by moneyBacks.method)
//           + funds withdrawn (by source) + transfers out (by fromMethod)
//
// Each branch keeps its own till — pass `branchId` to scope to one branch (the
// normal case, the active branch); pass null/omit for the owner's "All Branches"
// combined view. Only Sale/DuePayment/ServiceJob/Installment/Fund/Transfer/
// Expense/Purchase/Return carry `branch` — Customer/Supplier/Employee (not
// queried here) stay business-wide by design.
//
// This scans EVERY money-moving document the business has ever recorded —
// there is no date filter, by design, since it's a lifetime running balance —
// so its cost grows with the shop's whole history, not with how busy today
// was. `computeBalances` below is the real function; `computeBalancesUncached`
// is what actually does the work.
async function computeBalancesUncached(businessId, branchId = null) {
  const bId = new mongoose.Types.ObjectId(businessId);
  const branchMatch = branchId ? { branch: new mongoose.Types.ObjectId(branchId) } : {};

  const [
    splitSalesIn, legacySalesIn, dueIn, splitServiceIn, legacyServiceIn, emiDownIn, emiScheduleIn,
    fundsAddIn, fundsWithdrawOut, transfersIn, transfersOut,
    expOut, splitSupplierOut, legacySupplierOut, refundOut, moneyBackOut,
  ] = await Promise.all([
    // Multi-tender sales: unwind the payments[] breakdown
    Sale.aggregate([
      { $match: { business: bId, ...branchMatch, 'payments.0': { $exists: true } } },
      { $unwind: '$payments' },
      { $group: { _id: '$payments.method', amount: { $sum: '$payments.amount' } } },
    ]),
    // Legacy single-tender sales (no payments[] recorded) — fall back to paid+paidVia
    Sale.aggregate([
      { $match: { business: bId, ...branchMatch, $or: [{ payments: { $exists: false } }, { payments: { $size: 0 } }] } },
      { $group: { _id: { $ifNull: ['$paidVia', 'cash'] }, amount: { $sum: '$paid' } } },
    ]),
    DuePayment.aggregate([
      { $match: { business: bId, ...branchMatch } },
      { $group: { _id: { $ifNull: ['$method', 'cash'] }, amount: { $sum: '$amount' } } },
    ]),
    // Service jobs with a payments[] ledger (every job created/collected-from
    // since the ledger was added): unwind it, same pattern as Sale.payments[]
    ServiceJob.aggregate([
      { $match: { business: bId, ...branchMatch, 'payments.0': { $exists: true } } },
      { $unwind: '$payments' },
      { $group: { _id: '$payments.method', amount: { $sum: '$payments.amount' } } },
    ]),
    // Legacy jobs with no payments[] recorded (pre-existing data) — fall back to paid+paymentMethod
    ServiceJob.aggregate([
      { $match: { business: bId, ...branchMatch, $or: [{ payments: { $exists: false } }, { payments: { $size: 0 } }] } },
      { $group: { _id: { $ifNull: ['$paymentMethod', 'cash'] }, amount: { $sum: '$paid' } } },
    ]),
    Installment.aggregate([
      { $match: { business: bId, ...branchMatch } },
      { $group: { _id: { $ifNull: ['$downPaymentMethod', 'cash'] }, amount: { $sum: '$downPayment' } } },
    ]),
    Installment.aggregate([
      { $match: { business: bId, ...branchMatch } },
      { $unwind: '$schedule' },
      { $match: { 'schedule.paid': true } },
      { $group: { _id: { $ifNull: ['$schedule.method', 'cash'] }, amount: { $sum: '$schedule.amount' } } },
    ]),
    // Capital brought in (money IN)
    Fund.aggregate([
      { $match: { business: bId, ...branchMatch, type: { $ne: 'withdraw' } } },
      { $group: { _id: { $ifNull: ['$source', 'cash'] }, amount: { $sum: '$amount' } } },
    ]),
    // Capital taken back out (money OUT) — not an expense, just a reversal of prior capital
    Fund.aggregate([
      { $match: { business: bId, ...branchMatch, type: 'withdraw' } },
      { $group: { _id: { $ifNull: ['$source', 'cash'] }, amount: { $sum: '$amount' } } },
    ]),
    // Balance transfers — money arriving in the `to` method
    Transfer.aggregate([
      { $match: { business: bId, ...branchMatch } },
      { $group: { _id: '$toMethod', amount: { $sum: '$amount' } } },
    ]),
    // Balance transfers — money leaving the `from` method
    Transfer.aggregate([
      { $match: { business: bId, ...branchMatch } },
      { $group: { _id: '$fromMethod', amount: { $sum: '$amount' } } },
    ]),
    Expense.aggregate([
      { $match: { business: bId, ...branchMatch } },
      { $group: { _id: { $ifNull: ['$source', 'cash'] }, amount: { $sum: '$amount' } } },
    ]),
    // supplier purchases (paid-now portion) — money OUT. Multi-tender purchases:
    // unwind the payments[] breakdown, same pattern as Sale.payments[].
    Purchase.aggregate([
      { $match: { business: bId, ...branchMatch, 'payments.0': { $exists: true } } },
      { $unwind: '$payments' },
      { $group: { _id: '$payments.method', amount: { $sum: '$payments.amount' } } },
    ]),
    // Legacy single-tender purchases (no payments[] recorded) — fall back to paid+source
    Purchase.aggregate([
      { $match: { business: bId, ...branchMatch, $or: [{ payments: { $exists: false } }, { payments: { $size: 0 } }] } },
      { $group: { _id: { $ifNull: ['$source', 'cash'] }, amount: { $sum: '$paid' } } },
    ]),
    // return/exchange cash refunds — money OUT (store credit is intentionally excluded)
    Return.aggregate([
      { $match: { business: bId, ...branchMatch } },
      { $group: { _id: { $ifNull: ['$refundMethod', 'cash'] }, amount: { $sum: '$cashRefund' } } },
    ]),
    // "money back" hand-backs — an overpayment the shop took in and later gave
    // back, so it leaves the till the same way it came in (money OUT)
    Sale.aggregate([
      { $match: { business: bId, ...branchMatch, 'moneyBacks.0': { $exists: true } } },
      { $unwind: '$moneyBacks' },
      { $group: { _id: { $ifNull: ['$moneyBacks.method', 'cash'] }, amount: { $sum: '$moneyBacks.amount' } } },
    ]),
  ]);

  const inflow = emptyMap();
  const outflow = emptyMap();
  for (const r of splitSalesIn) if (r._id in inflow) inflow[r._id] += r.amount || 0;
  for (const r of legacySalesIn) if (r._id in inflow) inflow[r._id] += r.amount || 0;
  for (const r of dueIn) if (r._id in inflow) inflow[r._id] += r.amount || 0;
  for (const r of splitServiceIn) if (r._id in inflow) inflow[r._id] += r.amount || 0;
  for (const r of legacyServiceIn) if (r._id in inflow) inflow[r._id] += r.amount || 0;
  for (const r of emiDownIn) if (r._id in inflow) inflow[r._id] += r.amount || 0;
  for (const r of emiScheduleIn) if (r._id in inflow) inflow[r._id] += r.amount || 0;
  for (const r of fundsAddIn) if (r._id in inflow) inflow[r._id] += r.amount || 0;
  for (const r of transfersIn) if (r._id in inflow) inflow[r._id] += r.amount || 0;
  for (const r of fundsWithdrawOut) if (r._id in outflow) outflow[r._id] += r.amount || 0;
  for (const r of transfersOut) if (r._id in outflow) outflow[r._id] += r.amount || 0;
  for (const r of expOut) if (r._id in outflow) outflow[r._id] += r.amount || 0;
  for (const r of splitSupplierOut) if (r._id in outflow) outflow[r._id] += r.amount || 0;
  for (const r of legacySupplierOut) if (r._id in outflow) outflow[r._id] += r.amount || 0;
  for (const r of refundOut) if (r._id in outflow) outflow[r._id] += r.amount || 0;
  for (const r of moneyBackOut) if (r._id in outflow) outflow[r._id] += r.amount || 0;

  const balances = emptyMap();
  for (const m of METHODS) balances[m] = inflow[m] - outflow[m];
  return balances; // { cash, bank, bkash, nagad, rocket, card }
}

// Short-lived cache in front of the full lifetime scan above. Every caller
// (Dashboard, Finance's payment-account balances, the Advanced Report) only
// ever DISPLAYS this number — no checkout, expense, purchase or any other
// money-moving action anywhere in this app reads it to decide whether to
// allow something — so a few seconds of staleness is invisible in practice
// and self-corrects the moment the cache entry expires. This does not change
// what gets computed or how, only how often; if it's ever removed, every
// caller keeps working exactly as before, just slower again.
const BALANCE_CACHE_TTL_MS = 20_000;
const balanceCache = new Map(); // "businessId:branchId" -> { at, promise }

export function computeBalances(businessId, branchId = null) {
  const key = `${businessId}:${branchId || 'all'}`;
  const hit = balanceCache.get(key);
  if (hit && Date.now() - hit.at < BALANCE_CACHE_TTL_MS) return hit.promise;
  // Cache the in-flight PROMISE, not just the resolved value — several
  // requests landing within the same instant (e.g. Dashboard's own
  // Promise.all calling this alongside everything else) share one query
  // instead of each kicking off their own copy of all 16 aggregations.
  const promise = computeBalancesUncached(businessId, branchId).catch((err) => {
    balanceCache.delete(key); // don't cache a failure
    throw err;
  });
  balanceCache.set(key, { at: Date.now(), promise });
  return promise;
}

// Per-NAMED-ACCOUNT balance (e.g. each of the shop's 5-10 real bank accounts,
// or several bKash/Nagad numbers), on top of the per-method totals above. Only
// the flows that actually carry an `account` tag contribute here — an entry
// recorded before this feature existed, or where the account was simply left
// blank, still counts toward its method's overall balance (computeBalances)
// but isn't attributable to one specific account, so it's excluded here rather
// than guessed at.
//
// Deliberately covers the same money-movement set the client asked about:
// Sale.payments[] (POS), Sale.moneyBacks[], Fund (add/withdraw), Transfer
// (both sides), Expense, DuePayment (Collect Due), and Purchase.payments[]
// (supplier purchases, an outflow). EMI/Installment payments and Service jobs
// still do NOT carry an `account` field — a deliberate scope decision, not an
// oversight; add it there the same way if the client wants full coverage later.
export async function computeAccountBalances(businessId, branchId = null) {
  const bId = new mongoose.Types.ObjectId(businessId);
  const branchMatch = branchId ? { branch: new mongoose.Types.ObjectId(branchId) } : {};

  const [salesIn, fundIn, fundOut, transferIn, transferOut, dueIn, expOut, moneyBackOut, purchaseOut] = await Promise.all([
    Sale.aggregate([
      { $match: { business: bId, ...branchMatch, 'payments.0': { $exists: true } } },
      { $unwind: '$payments' },
      { $match: { 'payments.account': { $ne: null } } },
      { $group: { _id: '$payments.account', amount: { $sum: '$payments.amount' } } },
    ]),
    Fund.aggregate([
      { $match: { business: bId, ...branchMatch, type: { $ne: 'withdraw' }, account: { $ne: null } } },
      { $group: { _id: '$account', amount: { $sum: '$amount' } } },
    ]),
    Fund.aggregate([
      { $match: { business: bId, ...branchMatch, type: 'withdraw', account: { $ne: null } } },
      { $group: { _id: '$account', amount: { $sum: '$amount' } } },
    ]),
    Transfer.aggregate([
      { $match: { business: bId, ...branchMatch, toAccount: { $ne: null } } },
      { $group: { _id: '$toAccount', amount: { $sum: '$amount' } } },
    ]),
    Transfer.aggregate([
      { $match: { business: bId, ...branchMatch, fromAccount: { $ne: null } } },
      { $group: { _id: '$fromAccount', amount: { $sum: '$amount' } } },
    ]),
    DuePayment.aggregate([
      { $match: { business: bId, ...branchMatch, account: { $ne: null } } },
      { $group: { _id: '$account', amount: { $sum: '$amount' } } },
    ]),
    Expense.aggregate([
      { $match: { business: bId, ...branchMatch, account: { $ne: null } } },
      { $group: { _id: '$account', amount: { $sum: '$amount' } } },
    ]),
    Sale.aggregate([
      { $match: { business: bId, ...branchMatch, 'moneyBacks.0': { $exists: true } } },
      { $unwind: '$moneyBacks' },
      { $match: { 'moneyBacks.account': { $ne: null } } },
      { $group: { _id: '$moneyBacks.account', amount: { $sum: '$moneyBacks.amount' } } },
    ]),
    Purchase.aggregate([
      { $match: { business: bId, ...branchMatch, 'payments.0': { $exists: true } } },
      { $unwind: '$payments' },
      { $match: { 'payments.account': { $ne: null } } },
      { $group: { _id: '$payments.account', amount: { $sum: '$payments.amount' } } },
    ]),
  ]);

  const net = {};
  const apply = (rows, sign) => { for (const r of rows) { const k = String(r._id); net[k] = (net[k] || 0) + sign * (r.amount || 0); } };
  apply(salesIn, 1);
  apply(fundIn, 1);
  apply(fundOut, -1);
  apply(transferIn, 1);
  apply(transferOut, -1);
  apply(dueIn, 1);
  apply(expOut, -1);
  apply(moneyBackOut, -1);
  apply(purchaseOut, -1);
  return net; // { [accountId]: balance }
}
