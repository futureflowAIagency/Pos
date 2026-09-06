import { useEffect, useState } from 'react';
import { Bell, PackageX, PackageMinus, CalendarClock, Info, CheckCheck } from 'lucide-react';
import api from '../../api/axios.js';
import { fmtDateTime } from '../../utils/format.js';
import { useLang } from '../../context/LanguageContext.jsx';

// Low stock / out of stock and customer due-date reminders are generated
// server-side (server/src/services/notificationService.js) whenever this list
// is fetched — no separate "check now" action needed, just open the bell.
const REFRESH_MS = 3 * 60 * 1000; // keep the badge reasonably fresh without polling hard

const ICONS = {
  'Out of stock': PackageX,
  'Low stock': PackageMinus,
  'Customer due date reached': CalendarClock,
};

export default function NotificationBell() {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/notifications');
      setItems(data.data.notifications);
      setUnread(data.data.unread);
    } catch { /* silent — a failed background refresh shouldn't nag the user */ }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) load(); // fresh list every time it's opened
  };

  const markAllRead = async () => {
    await api.patch('/notifications/read');
    setItems((list) => list.map((n) => ({ ...n, isRead: true })));
    setUnread(0);
  };

  return (
    <div className="relative">
      <button onClick={toggle} className="btn-ghost p-2 relative" title={t('Notifications')}>
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] leading-[16px] font-bold text-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* click-outside-to-close backdrop, same idiom as Modal.jsx */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-80 max-h-96 overflow-y-auto z-50 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg">
            <div className="flex items-center justify-between px-3 py-2 border-b border-brand-200 dark:border-slate-700">
              <span className="font-semibold text-sm">{t('Notifications')}</span>
              {unread > 0 && (
                <button onClick={markAllRead} className="text-xs text-brand-600 hover:underline flex items-center gap-1">
                  <CheckCheck size={13} /> {t('Mark all as read')}
                </button>
              )}
            </div>
            {loading && !items.length ? (
              <p className="text-slate-400 text-sm text-center py-6">{t('Loading...')}</p>
            ) : items.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-6">{t('No notifications')}</p>
            ) : (
              items.map((n) => {
                const Icon = ICONS[n.title] || Info;
                const color = n.type === 'error' ? 'text-red-500' : n.type === 'warning' ? 'text-amber-500' : 'text-brand-500';
                return (
                  <div key={n._id} className={`flex items-start gap-2.5 px-3 py-2.5 border-b border-slate-50 dark:border-slate-700/50 ${!n.isRead ? 'bg-slate-50 dark:bg-slate-700/30' : ''}`}>
                    <Icon size={16} className={`shrink-0 mt-0.5 ${color}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{n.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{n.message}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{fmtDateTime(n.createdAt)}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
