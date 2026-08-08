import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/apiResponse.js';
import { tenantFilter } from '../middleware/tenant.js';
import Notification from '../models/Notification.js';
import { ensureNotifications } from '../services/notificationService.js';

// Branch-specific notices (low stock) only show while that branch is active;
// business-wide notices (customer due-date reminders, branch: null) always show.
export const getNotifications = asyncHandler(async (req, res) => {
  await ensureNotifications(req);
  const notifications = await Notification.find(
    tenantFilter(req, { $or: [{ branch: null }, { branch: req.branchId }] })
  ).sort('-createdAt').limit(50);
  const unread = notifications.filter((n) => !n.isRead).length;
  ok(res, { notifications, unread });
});

export const markRead = asyncHandler(async (req, res) => {
  // only clears what's actually visible right now (this branch's notices +
  // business-wide ones) — doesn't silently clear another branch's unread stock alerts
  await Notification.updateMany(
    tenantFilter(req, { isRead: false, $or: [{ branch: null }, { branch: req.branchId }] }),
    { isRead: true }
  );
  ok(res, {}, 'Marked all as read');
});
