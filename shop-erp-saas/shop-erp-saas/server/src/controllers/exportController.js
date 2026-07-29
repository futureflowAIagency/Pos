import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/apiResponse.js';
import { tenantFilter, branchFilter } from '../middleware/tenant.js';
import { logActivity } from '../middleware/activityLogger.js';
import { toCSV } from '../utils/csv.js';
import ImportExportLog from '../models/ImportExportLog.js';

import Product from '../models/Product.js';
import PhoneUnit from '../models/PhoneUnit.js';
import Customer from '../models/Customer.js';
import Supplier from '../models/Supplier.js';
import Purchase from '../models/Purchase.js';
import Sale from '../models/Sale.js';
import Expense from '../models/Expense.js';
import Installment from '../models/Installment.js';
import Employee from '../models/Employee.js';
import Fund from '../models/Fund.js';
import ServiceJob from '../models/ServiceJob.js';
import Return from '../models/Return.js';
import DuePayment from '../models/DuePayment.js';
import Business from '../models/Business.js';
import Branch from '../models/Branch.js';

// Optional ?from=&to= date filter, applied to whichever field each entity uses.
const dateRange = (req) => {
  const q = {};
  if (req.query.from) q.$gte = new Date(req.query.from);
  if (req.query.to) q.$lte = new Date(req.query.to + 'T23:59:59');
  return Object.keys(q).length ? q : null;
};

// Branch-scoped entities (Products/Units/Sales/Purchases/Expenses/Installments)
// default to the active branch; ?allBranches=true (owner/superadmin only)
// exports across the whole business instead.
const scoped = (req, extra = {}) =>
  (req.query.allBranches === 'true' && ['owner', 'superadmin'].includes(req.user.role))
    ? tenantFilter(req, extra)
    : branchFilter(req, extra);

// Every exportable entity (req 13): builds { columns, rows } for CSV/JSON output.
const ENTITY_BUILDERS = {
  customers: async (req) => ({
    rows: await Customer.find(tenantFilter(req)).lean(),
    columns: [
      { key: 'name', label: 'Name' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' },
      { key: 'address', label: 'Address' }, { key: 'nid', label: 'NID' },
      { key: 'totalDue', label: 'Total Due' }, { key: 'storeCredit', label: 'Store Credit' },
    ],
  }),
  suppliers: async (req) => ({
    rows: await Supplier.find(tenantFilter(req)).lean(),
    columns: [
      { key: 'name', label: 'Name' }, { key: 'phone', label: 'Phone' }, { key: 'address', label: 'Address' }, { key: 'note', label: 'Note' },
      { key: 'totalPurchase', label: 'Total Purchase' }, { key: 'totalPaid', label: 'Total Paid' },
      { key: 'due', label: 'Due', value: (r) => Math.max(0, (r.totalPurchase || 0) - (r.totalPaid || 0)) },
    ],
  }),
  products: async (req) => ({
    rows: await Product.find(scoped(req)).lean(),
    columns: [
      { key: 'name', label: 'Name' }, { key: 'barcode', label: 'Barcode' }, { key: 'sku', label: 'SKU' },
      { key: 'category', label: 'Category' }, { key: 'unit', label: 'Unit' },
      { key: 'purchasePrice', label: 'Purchase Price' }, { key: 'sellingPrice', label: 'Selling Price' }, { key: 'discountPercent', label: 'Discount %' },
      { key: 'stock', label: 'Stock' }, { key: 'lowStockAlert', label: 'Low Stock Alert' },
      { key: 'trackSerial', label: 'Track Serial' }, { key: 'brand', label: 'Brand' }, { key: 'color', label: 'Color' }, { key: 'storage', label: 'Storage' },
      { key: 'returnable', label: 'Returnable' },
    ],
  }),
  units: async (req) => ({
    rows: await PhoneUnit.find(scoped(req)).populate('product', 'name').lean(),
    columns: [
      { key: 'product', label: 'Product', value: (r) => r.product?.name || '' },
      { key: 'imei1', label: 'IMEI 1' }, { key: 'imei2', label: 'IMEI 2' }, { key: 'serial', label: 'Serial' },
      { key: 'status', label: 'Status' }, { key: 'soldAt', label: 'Sold At' }, { key: 'soldPrice', label: 'Sold Price' }, { key: 'customerName', label: 'Customer' },
    ],
  }),
  sales: async (req) => {
    const range = dateRange(req);
    const q = scoped(req); if (range) q.createdAt = range;
    return {
      rows: await Sale.find(q).sort('-createdAt').lean(),
      columns: [
        { key: 'invoiceNo', label: 'Invoice' }, { key: 'createdAt', label: 'Date' }, { key: 'customerName', label: 'Customer' },
        { key: 'items', label: 'Items', value: (r) => r.items.map((i) => `${i.name} x${i.qty}`).join('; ') },
        { key: 'subTotal', label: 'Subtotal' }, { key: 'discount', label: 'Discount' }, { key: 'total', label: 'Total' },
        { key: 'paid', label: 'Paid' }, { key: 'due', label: 'Due' }, { key: 'paymentMethod', label: 'Payment Method' }, { key: 'profit', label: 'Profit' },
      ],
    };
  },
  purchases: async (req) => {
    const range = dateRange(req);
    const q = scoped(req, { kind: 'purchase' }); if (range) q.createdAt = range;
    return {
      rows: await Purchase.find(q).sort('-createdAt').populate('supplier', 'name').lean(),
      columns: [
        { key: 'createdAt', label: 'Date' }, { key: 'supplier', label: 'Supplier', value: (r) => r.supplier?.name || '' }, { key: 'reference', label: 'Reference' },
        { key: 'items', label: 'Items', value: (r) => r.items.map((i) => `${i.name} x${i.qty}`).join('; ') },
        { key: 'total', label: 'Total' }, { key: 'paid', label: 'Paid' }, { key: 'due', label: 'Due' }, { key: 'source', label: 'Paid From' },
      ],
    };
  },
  expenses: async (req) => {
    const range = dateRange(req);
    const q = scoped(req); if (range) q.date = range;
    return {
      rows: await Expense.find(q).sort('-date').lean(),
      columns: [
        { key: 'title', label: 'Title' }, { key: 'category', label: 'Category' }, { key: 'amount', label: 'Amount' },
        { key: 'source', label: 'Paid From' }, { key: 'note', label: 'Note' }, { key: 'date', label: 'Date' },
      ],
    };
  },
  installments: async (req) => ({
    rows: await Installment.find(scoped(req)).sort('-createdAt').lean(),
    columns: [
      { key: 'customerName', label: 'Customer' }, { key: 'productName', label: 'Item' }, { key: 'imei1', label: 'IMEI' },
      { key: 'totalAmount', label: 'Total' }, { key: 'downPayment', label: 'Down Payment' }, { key: 'months', label: 'Months' },
      { key: 'balance', label: 'Balance', value: (r) => {
        const paid = (r.schedule || []).filter((s) => s.paid).reduce((a, s) => a + s.amount, 0);
        return Math.max(0, (r.totalAmount || 0) - (r.downPayment || 0) - paid);
      } },
      { key: 'status', label: 'Status' }, { key: 'createdAt', label: 'Date' },
    ],
  }),
  dues: async (req) => ({
    rows: await Customer.find(tenantFilter(req, { totalDue: { $gt: 0 } })).lean(),
    columns: [{ key: 'name', label: 'Customer' }, { key: 'phone', label: 'Phone' }, { key: 'totalDue', label: 'Due Amount' }],
  }),
};

// @route GET /api/export/:entity?from=&to=&format=csv|json
export const exportEntity = asyncHandler(async (req, res) => {
  const { entity } = req.params;
  const format = req.query.format === 'json' ? 'json' : 'csv';
  const builder = ENTITY_BUILDERS[entity];
  if (!builder) throw new ApiError(400, `Unknown export entity: ${entity}`);
  const { columns, rows } = await builder(req);

  await ImportExportLog.create({ business: req.businessId, branch: req.branchId, action: 'export', entity, format, recordCount: rows.length, createdBy: req.user._id });
  await logActivity(req, { action: 'EXPORT_DATA', entity: 'Export', meta: { entity, format, count: rows.length } });

  if (format === 'json') {
    res.setHeader('Content-Disposition', `attachment; filename="${entity}.json"`);
    return res.json(rows);
  }
  const csv = toCSV(rows, columns);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${entity}.csv"`);
  res.send(csv);
});

// @route GET /api/export/backup/full — complete business data dump (JSON, req 13 "System Backup/Migration")
export const fullBackup = asyncHandler(async (req, res) => {
  // A full backup spans every branch (it's the whole business account) —
  // business-wide on purpose, unlike the per-entity exports above.
  const q = tenantFilter(req);
  const [business, branches, products, units, customers, suppliers, purchases, sales, expenses, installments, employees, funds, services, returns, duePayments] = await Promise.all([
    Business.findById(req.businessId).lean(),
    Branch.find(q).lean(),
    Product.find(q).lean(), PhoneUnit.find(q).lean(), Customer.find(q).lean(), Supplier.find(q).lean(),
    Purchase.find(q).lean(), Sale.find(q).lean(), Expense.find(q).lean(), Installment.find(q).lean(),
    Employee.find(q).lean(), Fund.find(q).lean(), ServiceJob.find(q).lean(), Return.find(q).lean(), DuePayment.find(q).lean(),
  ]);
  const backup = {
    meta: { exportedAt: new Date(), business: business?.name, version: 1 },
    business, branches, products, units, customers, suppliers, purchases, sales, expenses, installments, employees, funds, services, returns, duePayments,
  };
  const recordCount = [branches, products, units, customers, suppliers, purchases, sales, expenses, installments, employees, funds, services, returns, duePayments]
    .reduce((s, arr) => s + arr.length, 0);

  await ImportExportLog.create({ business: req.businessId, action: 'backup', entity: 'full', format: 'json', recordCount, createdBy: req.user._id });
  await logActivity(req, { action: 'BACKUP_DATA', entity: 'Business', meta: { recordCount } });

  res.setHeader('Content-Disposition', `attachment; filename="backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(backup);
});

// @route GET /api/export/history/list
export const importExportHistory = asyncHandler(async (req, res) => {
  const logs = await ImportExportLog.find(tenantFilter(req)).sort('-createdAt').limit(100).populate('createdBy', 'name');
  ok(res, { logs, count: logs.length });
});
