import { Router } from 'express';
import { getEmployees, getEmployee, createEmployee, updateEmployee, setEmployeeStatus, deleteEmployee, paySalary, resetEmployeePassword } from '../controllers/employeeController.js';
import { protect } from '../middleware/auth.js';
import { requireBusiness, resolveBranch } from '../middleware/tenant.js';
import { authorize } from '../middleware/role.js';
import { requireModule } from '../middleware/permissions.js';

const router = Router();
// Employee itself stays business-wide (shared across branches, per Phase 25) —
// resolveBranch is chained anyway because paySalary books an Expense, which IS
// branch-scoped and required. Every other handler here simply ignores req.branchId.
router.use(protect, requireBusiness, resolveBranch, requireModule('employees'));

// Only the shop owner (or platform superadmin) may manage employees.
const ownerOnly = authorize('owner', 'superadmin');

router.route('/')
  .get(getEmployees)
  .post(ownerOnly, createEmployee);
router.route('/:id')
  .get(getEmployee)
  .put(ownerOnly, updateEmployee)
  .delete(ownerOnly, deleteEmployee);
router.patch('/:id/status', ownerOnly, setEmployeeStatus);
router.post('/:id/salary', ownerOnly, paySalary);
router.post('/:id/reset-password', ownerOnly, resetEmployeePassword);
export default router;
