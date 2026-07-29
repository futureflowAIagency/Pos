import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok, created } from '../utils/apiResponse.js';
import { tenantFilter } from '../middleware/tenant.js';
import { logActivity } from '../middleware/activityLogger.js';
import Employee from '../models/Employee.js';
import Expense from '../models/Expense.js';
import User from '../models/User.js';
import Branch from '../models/Branch.js';
import { MODULES } from '../config/modules.js';

// Generate the next sequential employee id for a business (collision-safe even after deletes)
const nextEmployeeId = async (businessId) => {
  const docs = await Employee.find({ business: businessId }, 'employeeId').lean();
  let max = 0;
  for (const d of docs) {
    const m = /(\d+)\s*$/.exec(d.employeeId || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return 'EMP-' + String(max + 1).padStart(4, '0');
};

// Random, human-typeable temporary password (avoids visually ambiguous characters).
const genTempPassword = () => {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
};

const cleanPermissions = (perms) => (Array.isArray(perms) ? perms.filter((p) => MODULES.includes(p)) : []);

// A staff login can be locked to one branch (multi-branch shops only). Verifies
// the submitted id actually belongs to this business before trusting it —
// returns undefined (leave unset) for a blank/absent value, null to explicitly clear it.
async function resolveAssignedBranch(req, assignedBranch) {
  if (assignedBranch === undefined) return undefined;
  if (!assignedBranch) return null;
  const branch = await Branch.findOne({ _id: assignedBranch, business: req.businessId });
  if (!branch) throw new ApiError(400, 'Invalid branch selection');
  return branch._id;
}

// @route GET /api/employees?status=active|inactive&designation=&search=
export const getEmployees = asyncHandler(async (req, res) => {
  const { status, designation, search } = req.query;
  const q = tenantFilter(req);
  if (status === 'active') q.isActive = true;
  else if (status === 'inactive') q.isActive = false;
  if (designation) q.designation = designation;
  if (search) {
    q.$or = [
      { name: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      { employeeId: { $regex: search, $options: 'i' } },
      { designation: { $regex: search, $options: 'i' } },
    ];
  }
  const employees = await Employee.find(q).sort('-createdAt').populate('user', 'email permissions isActive assignedBranch');
  ok(res, { employees, count: employees.length });
});

// @route GET /api/employees/:id
export const getEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne(tenantFilter(req, { _id: req.params.id })).populate('user', 'email permissions isActive assignedBranch');
  if (!employee) throw new ApiError(404, 'Employee not found');
  ok(res, { employee });
});

// @route POST /api/employees
// body: { ...employee fields, grantLogin?, permissions?:[] }
// When grantLogin is true, a linked login (User, role:'staff') is created with a
// fresh temporary password returned exactly once — the owner controls exactly
// which dashboard modules that login can see via `permissions`.
export const createEmployee = asyncHandler(async (req, res) => {
  const { email, grantLogin, permissions, assignedBranch, ...rest } = req.body;
  if (grantLogin) {
    if (!email?.trim()) throw new ApiError(400, 'Email is required to grant login access');
    const exists = await User.findOne({ email: email.toLowerCase().trim() });
    if (exists) throw new ApiError(409, 'This email is already registered to another account');
  }
  const branchId = await resolveAssignedBranch(req, assignedBranch);

  const employeeId = rest.employeeId || (await nextEmployeeId(req.businessId));
  const employee = await Employee.create({ ...rest, email, employeeId, business: req.businessId });

  let tempPassword;
  if (grantLogin) {
    tempPassword = genTempPassword();
    const user = await User.create({
      name: employee.name, email: email.trim(), phone: employee.phone, password: tempPassword,
      role: 'staff', business: req.businessId, permissions: cleanPermissions(permissions),
      assignedBranch: branchId || null,
    });
    employee.user = user._id;
    await employee.save();
  }

  await logActivity(req, { action: 'CREATE_EMPLOYEE', entity: 'Employee', entityId: employee._id, meta: { name: employee.name, employeeId } });
  created(res, { employee, tempPassword });
});

// @route PUT /api/employees/:id
// body: { ...employee fields, grantLogin?, permissions?:[] }
// Granting login access later (an employee added without one) works the same way
// as at creation; if a login already exists, permissions can be adjusted anytime
// and the linked login's name/phone are kept in sync.
export const updateEmployee = asyncHandler(async (req, res) => {
  const { email, grantLogin, permissions, assignedBranch, ...rest } = req.body;
  delete rest.employeeId; // employee id is immutable
  delete rest.business;
  delete rest.user;

  const employee = await Employee.findOne(tenantFilter(req, { _id: req.params.id }));
  if (!employee) throw new ApiError(404, 'Employee not found');

  Object.assign(employee, rest);
  if (email !== undefined) employee.email = email;
  const branchId = await resolveAssignedBranch(req, assignedBranch);

  let tempPassword;
  if (!employee.user && grantLogin) {
    if (!employee.email?.trim()) throw new ApiError(400, 'Email is required to grant login access');
    const exists = await User.findOne({ email: employee.email.toLowerCase().trim() });
    if (exists) throw new ApiError(409, 'This email is already registered to another account');
    tempPassword = genTempPassword();
    const user = await User.create({
      name: employee.name, email: employee.email.trim(), phone: employee.phone, password: tempPassword,
      role: 'staff', business: req.businessId, permissions: cleanPermissions(permissions),
      assignedBranch: branchId || null,
    });
    employee.user = user._id;
  } else if (employee.user) {
    const update = { name: employee.name, phone: employee.phone };
    if (permissions !== undefined) update.permissions = cleanPermissions(permissions);
    if (branchId !== undefined) update.assignedBranch = branchId;
    await User.updateOne({ _id: employee.user }, update);
  }

  await employee.save();
  await logActivity(req, { action: 'UPDATE_EMPLOYEE', entity: 'Employee', entityId: employee._id });
  ok(res, { employee, tempPassword }, 'Employee updated');
});

// @route POST /api/employees/:id/reset-password
// Passwords are one-way hashed and never stored/viewable — the only way to help a
// locked-out employee is to issue a brand-new temporary password, shown once.
export const resetEmployeePassword = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne(tenantFilter(req, { _id: req.params.id }));
  if (!employee) throw new ApiError(404, 'Employee not found');
  if (!employee.user) throw new ApiError(400, 'This employee has no login access set up yet');

  const user = await User.findById(employee.user);
  if (!user) throw new ApiError(404, 'Linked login account not found');

  const tempPassword = genTempPassword();
  user.password = tempPassword;
  await user.save();

  await logActivity(req, { action: 'RESET_EMPLOYEE_PASSWORD', entity: 'Employee', entityId: employee._id });
  ok(res, { tempPassword }, 'Password reset — share this with the employee now, it will not be shown again');
});

// @route PATCH /api/employees/:id/status  body:{ isActive }
// Deactivating an employee also deactivates their login (if any) — otherwise a
// let-go employee would keep dashboard access.
export const setEmployeeStatus = asyncHandler(async (req, res) => {
  const isActive = !!req.body.isActive;
  const employee = await Employee.findOneAndUpdate(tenantFilter(req, { _id: req.params.id }), { isActive }, { new: true });
  if (!employee) throw new ApiError(404, 'Employee not found');
  if (employee.user) await User.updateOne({ _id: employee.user }, { isActive });
  await logActivity(req, { action: isActive ? 'ACTIVATE_EMPLOYEE' : 'DEACTIVATE_EMPLOYEE', entity: 'Employee', entityId: employee._id });
  ok(res, { employee }, `Employee ${isActive ? 'activated' : 'deactivated'}`);
});

// @route DELETE /api/employees/:id  (permanent delete)
// The linked login (if any) is deactivated rather than deleted, to preserve
// referential integrity with existing activity-log entries.
export const deleteEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.findOneAndDelete(tenantFilter(req, { _id: req.params.id }));
  if (!employee) throw new ApiError(404, 'Employee not found');
  if (employee.user) await User.updateOne({ _id: employee.user }, { isActive: false });
  await logActivity(req, { action: 'DELETE_EMPLOYEE', entity: 'Employee', entityId: employee._id, meta: { name: employee.name } });
  ok(res, {}, 'Employee deleted');
});

// Collect a salary payment for a given month. If no record exists yet for that
// month, one is created using `totalAmount` (falls back to the employee's current
// monthlySalary). Each call books its own Expense for the actual amount paid —
// supports partial payments (e.g. pay 10,000 of a 20,000 salary now, settle the
// rest later via another call for the same month).
// body: { month, totalAmount?, amount, source='cash' }
export const paySalary = asyncHandler(async (req, res) => {
  const { month, totalAmount, amount, source = 'cash' } = req.body;
  if (!month) throw new ApiError(400, 'Month is required');
  const pay = Number(amount);
  if (!pay || pay <= 0) throw new ApiError(400, 'Enter a valid payment amount');

  const employee = await Employee.findOne(tenantFilter(req, { _id: req.params.id }));
  if (!employee) throw new ApiError(404, 'Employee not found');

  let entry = employee.salaryHistory.find((s) => s.month === month);
  if (!entry) {
    entry = { month, amount: Number(totalAmount) || employee.monthlySalary || 0, paidAmount: 0, status: 'due', payments: [] };
    employee.salaryHistory.push(entry);
    entry = employee.salaryHistory[employee.salaryHistory.length - 1];
  } else if (totalAmount != null) {
    entry.amount = Number(totalAmount); // allow correcting the month's total (e.g. pro-rated month)
  }

  const due = Math.max(0, entry.amount - entry.paidAmount);
  if (due <= 0) throw new ApiError(400, 'This month\'s salary is already fully paid');
  const applied = Math.min(pay, due);
  const method = ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card'].includes(source) ? source : 'cash';

  entry.payments.push({ amount: applied, method, date: new Date() });
  entry.paidAmount += applied;
  entry.status = entry.paidAmount >= entry.amount ? 'paid' : entry.paidAmount > 0 ? 'partial' : 'due';
  entry.paidAt = entry.status === 'paid' ? new Date() : entry.paidAt;

  await employee.save();

  // Every payment is a real, discrete money movement — book its own Expense.
  await Expense.create({
    business: req.businessId,
    title: `Salary — ${employee.name} (${month})`,
    category: 'Salary',
    amount: applied,
    source: method,
    note: `Employee ${employee.employeeId}${entry.status === 'partial' ? ' (partial)' : ''}`,
  });

  await logActivity(req, { action: 'PAY_SALARY', entity: 'Employee', entityId: employee._id, meta: { month, amount: applied, status: entry.status } });
  ok(res, { employee }, 'Salary payment recorded');
});
