import Notification from '../models/Notification.js';
import Product from '../models/Product.js';
import Customer from '../models/Customer.js';

const taka = (n = 0) => '৳' + Number(n || 0).toLocaleString('en-BD', { maximumFractionDigits: 2 });

/**
 * Lazily (re)generates the two kinds of automatic notifications this shop
 * needs, called every time the notification panel is opened rather than from
 * a background cron job (this project has no scheduler process — a request
 * -driven refresh is simpler and just as timely for a small shop's checking
 * pattern). Idempotent: uses `dedupeKey` to never insert the same notice twice,
 * and prunes stale UNREAD notices once their underlying condition clears
 * (restocked / due fully paid) so the unread badge doesn't lie.
 *
 * - Low stock / out of stock: branch-scoped (Product is per-branch since
 *   Phase 25) — only the active branch's products are checked.
 * - Customer due-date reminder: business-wide (Customer is shared across
 *   branches) — fires once the due date is reached or passed, for as long as
 *   totalDue > 0.
 */
export async function ensureNotifications(req) {
  const business = req.businessId;
  const branch = req.branchId || null;

  await Promise.all([
    ensureStockNotifications(business, branch),
    ensureDueDateNotifications(business),
  ]);
}

async function ensureStockNotifications(business, branch) {
  if (!branch) return; // no active branch resolved (shouldn't happen on a real request)

  const products = await Product.find({ business, branch, isActive: true })
    .select('name stock lowStockAlert');
  const low = products.filter((p) => p.stock <= (p.lowStockAlert ?? 0));
  const liveKeys = low.map((p) => `stock-${p._id}`);

  // the condition cleared (restocked) — drop the stale UNREAD notice so the
  // badge count reflects reality; read ones stay as history, same as other logs
  await Notification.deleteMany({
    business, branch, isRead: false,
    dedupeKey: { $regex: '^stock-', $nin: liveKeys },
  });

  if (!low.length) return;
  const existing = new Set(
    (await Notification.find({ business, dedupeKey: { $in: liveKeys } }).select('dedupeKey')).map((n) => n.dedupeKey)
  );
  const toCreate = low
    .filter((p) => !existing.has(`stock-${p._id}`))
    .map((p) => ({
      business, branch,
      type: p.stock === 0 ? 'error' : 'warning',
      title: p.stock === 0 ? 'Out of stock' : 'Low stock',
      message: p.stock === 0
        ? `${p.name} is out of stock.`
        : `${p.name} — only ${p.stock} left (alert at ${p.lowStockAlert}).`,
      dedupeKey: `stock-${p._id}`,
    }));
  if (toCreate.length) await Notification.insertMany(toCreate);
}

async function ensureDueDateNotifications(business) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dueCustomers = await Customer.find({
    business, isActive: true, totalDue: { $gt: 0 }, dueDate: { $ne: null, $lte: today },
  }).select('name phone totalDue dueDate');
  if (!dueCustomers.length) return;

  const keys = dueCustomers.map((c) => dueKey(c));
  const existing = new Set(
    (await Notification.find({ business, dedupeKey: { $in: keys } }).select('dedupeKey')).map((n) => n.dedupeKey)
  );
  const toCreate = dueCustomers
    .filter((c) => !existing.has(dueKey(c)))
    .map((c) => ({
      business,
      type: 'warning',
      title: 'Customer due date reached',
      message: `${c.name}${c.phone ? ` (${c.phone})` : ''} — due ${taka(c.totalDue)}, reminder set for ${new Date(c.dueDate).toLocaleDateString('en-GB')}.`,
      dedupeKey: dueKey(c),
    }));
  if (toCreate.length) await Notification.insertMany(toCreate);
}

// per due-date value, not per-day-checked — so editing the date to a new one
// can raise a fresh reminder, but re-opening the panel on the same overdue
// date doesn't spam a second notice
const dueKey = (c) => `due-${c._id}-${new Date(c.dueDate).toISOString().slice(0, 10)}`;
