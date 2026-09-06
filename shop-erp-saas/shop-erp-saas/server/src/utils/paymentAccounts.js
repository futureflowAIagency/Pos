import PaymentAccount from '../models/PaymentAccount.js';
import { tenantFilter } from '../middleware/tenant.js';

// Resolve a client-sent account id to a real id belonging to this business, or
// null (blank/invalid/foreign ids all collapse to "no specific account" rather
// than throwing — the account tag is optional everywhere it's used, same as
// leaving a payment method's account unspecified always worked before this
// feature existed).
export async function resolveAccountId(req, accountId) {
  if (!accountId) return null;
  const acc = await PaymentAccount.findOne(tenantFilter(req, { _id: accountId }));
  return acc ? acc._id : null;
}
