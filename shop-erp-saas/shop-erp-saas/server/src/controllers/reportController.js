import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/apiResponse.js';
import Sale from '../models/Sale.js';
import Purchase from '../models/Purchase.js';
import Expense from '../models/Expense.js';
import Product from '../models/Product.js';
import Customer from '../models/Customer.js';
import Supplier from '../models/Supplier.js';
import { computeBalances } from '../services/balanceService.js';

// @route GET /api/reports/advanced?from=&to=
// A single comprehensive, date-ranged report (req 8): sales/purchase/profit/expense
// totals, per-method balances, customer + supplier due, product-wise sales/profit,
// and a current stock summary. Powers the printable/PDF "Advanced Report".
export const advancedReport = asyncHandler(async (req, res) => {
  const bId = new mongoose.Types.ObjectId(req.businessId);
  // Sales/Purchases/Expenses/Stock are branch-scoped by default; `allBranches`
  // (owner/superadmin only) combines every branch. Customer due + Supplier due
  // stay business-wide — both entities are shared across branches.
  const allBranches = req.query.allBranches === 'true' && ['owner', 'superadmin'].includes(req.user.role);
  const bMatch = allBranches ? {} : { branch: new mongoose.Types.ObjectId(req.branchId) };
  const now = new Date();
  const from = req.query.from ? new Date(req.query.from) : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = req.query.to ? new Date(req.query.to + 'T23:59:59') : now;

  const [salesAgg, purchaseAgg, expenseAgg, productWise, products, customerDueAgg, suppliers, balances] = await Promise.all([
    Sale.aggregate([
      { $match: { business: bId, ...bMatch, createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: null, total: { $sum: '$total' }, profit: { $sum: '$profit' }, count: { $sum: 1 } } },
    ]),
    Purchase.aggregate([
      { $match: { business: bId, ...bMatch, kind: 'purchase', createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),
    Expense.aggregate([
      { $match: { business: bId, ...bMatch, date: { $gte: from, $lte: to } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    // product-wise sales + profit within the range
    Sale.aggregate([
      { $match: { business: bId, ...bMatch, createdAt: { $gte: from, $lte: to } } },
      { $unwind: '$items' },
      { $group: {
        _id: '$items.name',
        qty: { $sum: '$items.qty' },
        revenue: { $sum: { $multiply: ['$items.qty', '$items.sellingPrice'] } },
        profit: { $sum: { $multiply: ['$items.qty', { $subtract: ['$items.sellingPrice', '$items.purchasePrice'] }] } },
      } },
      { $sort: { revenue: -1 } },
    ]),
    // current stock snapshot (not date-ranged — it's a point-in-time position)
    Product.find({ business: bId, ...bMatch, isActive: true }).select('name category stock lowStockAlert purchasePrice'),
    Customer.aggregate([
      { $match: { business: bId } },
      { $group: { _id: null, totalDue: { $sum: '$totalDue' } } },
    ]),
    Supplier.find({ business: bId, isActive: true }).select('totalPurchase totalPaid'),
    // cumulative per-method balances (money on hand right now)
    computeBalances(req.businessId, allBranches ? null : req.branchId),
  ]);

  const supplierDue = suppliers.reduce((s, x) => s + Math.max(0, (x.totalPurchase || 0) - (x.totalPaid || 0)), 0);

  const stockItems = products.map((p) => ({
    name: p.name,
    category: p.category,
    stock: p.stock,
    lowStockAlert: p.lowStockAlert,
    stockValue: Math.round((p.stock || 0) * (p.purchasePrice || 0) * 100) / 100,
  }));
  const stockTotals = stockItems.reduce((acc, it) => {
    acc.totalQty += it.stock || 0;
    acc.totalValue += it.stockValue || 0;
    if (it.stock <= it.lowStockAlert) acc.lowStockCount += 1;
    return acc;
  }, { totalQty: 0, totalValue: 0, lowStockCount: 0 });

  const totalSales = salesAgg[0]?.total || 0;
  const totalProfit = salesAgg[0]?.profit || 0;
  const totalPurchase = purchaseAgg[0]?.total || 0;
  const totalExpense = expenseAgg[0]?.total || 0;

  ok(res, {
    range: { from, to },
    totals: {
      sales: totalSales,
      purchase: totalPurchase,
      profit: totalProfit,
      expense: totalExpense,
      netProfit: totalProfit - totalExpense,
      salesCount: salesAgg[0]?.count || 0,
    },
    balances,
    customerDue: customerDueAgg[0]?.totalDue || 0,
    supplierDue,
    productWise,
    stock: { totalProducts: products.length, ...stockTotals, items: stockItems },
  });
});
