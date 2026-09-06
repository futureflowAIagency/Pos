// Dashboard modules an owner can grant/revoke per staff login. Keys mirror the
// client Sidebar's route paths (minus the leading slash) so both sides stay in sync.
export const MODULES = [
  'dashboard', 'products', 'pos', 'customers', 'suppliers', 'employees', 'finance',
  'returns', 'import-export', 'marketing', 'crm', 'subscription', 'activity', 'settings',
  'warranty', 'installments', 'services', // mobile-shop-only modules
  // Not a page — a finer-grained restriction inside Products (and the
  // Stock Print by Model report): whether this staff login may see the
  // purchase/buy price at all, separate from having Products access itself.
  'view-buy-price',
];
