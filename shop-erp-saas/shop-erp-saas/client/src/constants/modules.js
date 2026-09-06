// Dashboard modules an owner can grant/revoke per staff login. Keys mirror the
// Sidebar's route paths (minus the leading slash) and the server's config/modules.js.
export const MODULES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'products', label: 'Products' },
  { key: 'pos', label: 'POS / Sales' },
  { key: 'customers', label: 'Customers' },
  { key: 'suppliers', label: 'Suppliers' },
  { key: 'employees', label: 'Employees' },
  { key: 'finance', label: 'Finance' },
  { key: 'returns', label: 'Returns & Exchange' },
  { key: 'import-export', label: 'Import / Export' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'crm', label: 'CRM' },
  { key: 'subscription', label: 'Subscription' },
  { key: 'activity', label: 'Activity Logs' },
  { key: 'settings', label: 'Settings' },
  { key: 'warranty', label: 'Warranty' },
  { key: 'installments', label: 'EMI / Installments' },
  { key: 'services', label: 'Service / Repair' },
];
