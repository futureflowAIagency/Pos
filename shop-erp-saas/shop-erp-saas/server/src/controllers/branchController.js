import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok, created } from '../utils/apiResponse.js';
import { tenantFilter } from '../middleware/tenant.js';
import { logActivity } from '../middleware/activityLogger.js';
import Branch from '../models/Branch.js';

// @route GET /api/branches — every branch for this business (owner/superadmin only)
export const getBranches = asyncHandler(async (req, res) => {
  const branches = await Branch.find(tenantFilter(req)).sort('-isMainBranch name');
  ok(res, { branches, count: branches.length });
});

// @route POST /api/branches  body: { name, address, phone }
export const createBranch = asyncHandler(async (req, res) => {
  const { name, address = '', phone = '' } = req.body;
  if (!name?.trim()) throw new ApiError(400, 'Branch name is required');
  // the very first branch for a business is automatically the main one
  const hasAny = await Branch.exists({ business: req.businessId });
  const branch = await Branch.create({
    business: req.businessId, name: name.trim(), address, phone, isMainBranch: !hasAny,
  });
  await logActivity(req, { action: 'CREATE_BRANCH', entity: 'Branch', entityId: branch._id, meta: { name: branch.name } });
  created(res, { branch });
});

// @route PUT /api/branches/:id  body: { name, address, phone }
export const updateBranch = asyncHandler(async (req, res) => {
  const { name, address, phone } = req.body;
  const branch = await Branch.findOne(tenantFilter(req, { _id: req.params.id }));
  if (!branch) throw new ApiError(404, 'Branch not found');
  if (name !== undefined) {
    if (!name.trim()) throw new ApiError(400, 'Branch name is required');
    branch.name = name.trim();
  }
  if (address !== undefined) branch.address = address;
  if (phone !== undefined) branch.phone = phone;
  await branch.save();
  await logActivity(req, { action: 'UPDATE_BRANCH', entity: 'Branch', entityId: branch._id });
  ok(res, { branch }, 'Branch updated');
});

// @route PATCH /api/branches/:id/main — make this the business's main (default/fallback) branch
export const setMainBranch = asyncHandler(async (req, res) => {
  const branch = await Branch.findOne(tenantFilter(req, { _id: req.params.id, isActive: true }));
  if (!branch) throw new ApiError(404, 'Branch not found');
  await Branch.updateMany({ business: req.businessId, _id: { $ne: branch._id } }, { isMainBranch: false });
  branch.isMainBranch = true;
  await branch.save();
  await logActivity(req, { action: 'SET_MAIN_BRANCH', entity: 'Branch', entityId: branch._id });
  ok(res, { branch }, 'Main branch updated');
});

// @route PATCH /api/branches/:id/toggle — activate/deactivate (no hard delete in this phase)
export const toggleBranch = asyncHandler(async (req, res) => {
  const branch = await Branch.findOne(tenantFilter(req, { _id: req.params.id }));
  if (!branch) throw new ApiError(404, 'Branch not found');
  if (branch.isMainBranch && branch.isActive) throw new ApiError(400, 'Set another branch as main before deactivating this one');
  branch.isActive = !branch.isActive;
  await branch.save();
  await logActivity(req, { action: 'TOGGLE_BRANCH', entity: 'Branch', entityId: branch._id, meta: { isActive: branch.isActive } });
  ok(res, { branch }, branch.isActive ? 'Branch activated' : 'Branch deactivated');
});
