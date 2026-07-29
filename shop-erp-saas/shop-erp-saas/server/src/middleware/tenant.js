import { ApiError } from '../utils/ApiError.js';
import Branch from '../models/Branch.js';

// Ensures the request belongs to a business workspace.
// Adds req.businessId guaranteed (used by all tenant resources).
export const requireBusiness = (req, res, next) => {
  if (req.user.role === 'superadmin') {
    // superadmin may pass ?businessId= for inspection
    req.businessId = req.query.businessId || req.businessId;
  }
  if (!req.businessId) throw new ApiError(400, 'No business workspace associated');
  next();
};

// Helper to always inject the tenant filter into queries.
export const tenantFilter = (req, extra = {}) => ({ business: req.businessId, ...extra });

// Resolves which branch (physical location) this request operates on. Run this
// AFTER requireBusiness on routes for branch-scoped resources (Products, POS,
// Purchases, Expenses, Fund, Transfer, Installments, Services, Returns, reports).
// Adds req.branchId, guaranteed to belong to req.businessId.
//
// Precedence: a staff login locked to one branch (`user.assignedBranch`) always
// wins — this is a server-side enforcement so a staff user can never see another
// branch's data by tampering with the client-sent header. Otherwise the client's
// `X-Branch-Id` header (set after the user picks a branch in the switcher) is
// used if it validates against this business; if missing/invalid, falls back to
// the business's main branch (so an old client with no branch selected yet still
// works, and a fresh login always resolves to something).
export const resolveBranch = async (req, res, next) => {
  const assigned = req.user.assignedBranch ? String(req.user.assignedBranch) : null;
  const requested = assigned || req.headers['x-branch-id'] || req.query.branchId;

  let branch = null;
  if (requested) {
    branch = await Branch.findOne({ _id: requested, business: req.businessId, isActive: true }).select('_id');
  }
  if (!branch) {
    branch = await Branch.findOne({ business: req.businessId, isMainBranch: true }).select('_id')
      || await Branch.findOne({ business: req.businessId, isActive: true }).sort('createdAt').select('_id');
  }
  if (!branch) throw new ApiError(400, 'No branch found for this business');
  req.branchId = branch._id.toString();
  next();
};

// Helper for models scoped by BOTH business and branch (Product, PhoneUnit, Sale,
// Purchase, Expense, Fund, Transfer, Installment, ServiceJob, Return, DuePayment).
// Requires resolveBranch to have run first. Customers/Suppliers/Employees stay on
// plain tenantFilter — they are shared across all of a business's branches.
export const branchFilter = (req, extra = {}) => ({ business: req.businessId, branch: req.branchId, ...extra });
