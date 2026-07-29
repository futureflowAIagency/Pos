import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok, created } from '../utils/apiResponse.js';
import { generateToken } from '../utils/generateToken.js';
import { logActivity } from '../middleware/activityLogger.js';
import User from '../models/User.js';
import Business from '../models/Business.js';
import Branch from '../models/Branch.js';

export const publicUser = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  role: u.role,
  business: u.business,
  preferences: u.preferences,
  // which modules this user can see — only meaningful for role:'staff'
  permissions: u.permissions || [],
  // a staff login locked to one branch — null = free to switch (owner default)
  assignedBranch: u.assignedBranch || null,
});

// @desc Public self-registration is DISABLED.
//       Owner accounts can only be created by a Super Admin (see adminController.createOwner).
// @route POST /api/auth/register
export const register = asyncHandler(async (req, res) => {
  throw new ApiError(403, 'Public registration is disabled. Please contact the administrator to create an account.');
});

// Internal helper reused by the admin "create owner" flow.
export const createOwnerWithBusiness = async ({ name, email, password, phone, businessName, businessType }) => {
  if (!name || !email || !password || !businessName)
    throw new ApiError(400, 'name, email, password and businessName are required');

  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) throw new ApiError(409, 'Email already registered');

  const session = await mongoose.startSession();
  let user, business;
  try {
    await session.withTransaction(async () => {
      [user] = await User.create([{ name, email, password, phone, role: 'owner' }], { session });
      [business] = await Business.create(
        [{ name: businessName, type: businessType || 'general', owner: user._id, phone }],
        { session }
      );
      user.business = business._id;
      await user.save({ session });
      // every business needs at least one branch — this one is the default
      // fallback until the owner adds more from the Branches page
      await Branch.create([{ business: business._id, name: 'Main Branch', isMainBranch: true }], { session });
    });
  } finally {
    session.endSession();
  }
  return { user, business };
};

// @desc Login
// @route POST /api/auth/login
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new ApiError(400, 'Email and password required');

  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user || !(await user.matchPassword(password))) throw new ApiError(401, 'Invalid credentials');
  if (!user.isActive) throw new ApiError(403, 'Account disabled');

  const token = generateToken({ id: user._id });
  await logActivity({ ...req, user, businessId: user.business?.toString() }, { action: 'LOGIN', entity: 'User', entityId: user._id });
  ok(res, { token, user: publicUser(user) }, 'Login successful');
});

// @desc Get current user
// @route GET /api/auth/me
// Also resolves the active branch (same precedence as middleware/tenant.js's
// resolveBranch: assignedBranch lock > X-Branch-Id header > main branch) so the
// client can populate its branch switcher right after login/refresh without a
// second round trip. No `requireBusiness` on this route (superadmin has none),
// so branches/activeBranch are only computed when the user actually has a business.
export const getMe = asyncHandler(async (req, res) => {
  const business = req.user.business ? await Business.findById(req.user.business) : null;
  let branches = [];
  let activeBranchId = null;
  if (business) {
    branches = await Branch.find({ business: business._id }).sort('-isMainBranch name');
    const assigned = req.user.assignedBranch ? String(req.user.assignedBranch) : null;
    const requested = assigned || req.headers['x-branch-id'];
    const active = (requested && branches.find((b) => String(b._id) === requested && b.isActive))
      || branches.find((b) => b.isMainBranch)
      || branches.find((b) => b.isActive)
      || null;
    activeBranchId = active?._id || null;
  }
  ok(res, { user: publicUser(req.user), business, branches, activeBranchId });
});

// @desc Update theme preference
// @route PATCH /api/auth/preferences
export const updatePreferences = asyncHandler(async (req, res) => {
  const { theme } = req.body;
  if (theme) req.user.preferences.theme = theme;
  await req.user.save();
  ok(res, { preferences: req.user.preferences }, 'Preferences updated');
});

// @desc Change password — verify the current password, then set a new one (logged-in user)
// @route POST /api/auth/password/change
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) throw new ApiError(400, 'Current and new password are required');
  if (String(newPassword).length < 6) throw new ApiError(400, 'Password must be at least 6 characters');

  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.matchPassword(currentPassword))) throw new ApiError(400, 'Current password is incorrect');

  user.password = newPassword; // hashed by the pre-save hook
  await user.save();

  await logActivity(req, { action: 'CHANGE_PASSWORD', entity: 'User', entityId: user._id });
  ok(res, {}, 'Password changed successfully');
});
