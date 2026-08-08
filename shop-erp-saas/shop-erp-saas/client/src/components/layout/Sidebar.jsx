import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Package, ShoppingCart, Users, UserCog,
  Wallet, CreditCard, Settings, ScrollText, ShieldCheck, X,
  Truck, ShieldQuestion, CalendarClock, Wrench, Megaphone, Contact2, Undo2, FileSpreadsheet, Store, RefreshCw,
} from 'lucide-react';
import api from '../../api/axios.js';
import { fmtDateTime } from '../../utils/format.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLang } from '../../context/LanguageContext.jsx';

const VERSION_CHECK_MS = 3 * 60 * 1000; // matches NotificationBell's cadence

// Detects a fresh deploy while this tab has been open: captures the version the
// app was loaded with, then polls the server's actual version and flags a
// mismatch. `/api/version` reflects the git commit currently running on the
// server (see server/src/utils/appVersion.js) — it changes exactly when a real
// deploy happens (pm2 restart after git pull), so this never nags on its own.
function useAppVersion() {
  const [loaded, setLoaded] = useState(null);
  const [current, setCurrent] = useState(null);

  useEffect(() => {
    const check = async () => {
      try {
        const { data } = await api.get('/version');
        setCurrent(data.data);
        setLoaded((prev) => prev || data.data); // only the FIRST successful check anchors "loaded"
      } catch { /* offline/blip — next poll retries, don't nag on a fluke */ }
    };
    check();
    const id = setInterval(check, VERSION_CHECK_MS);
    return () => clearInterval(id);
  }, []);

  return { loaded, current, updateAvailable: !!(loaded && current && loaded.version !== current.version) };
}

// Links shown to every shop owner. Mobile-specific links are spliced in below.
// `key` matches the module keys used by the staff permission system (server
// config/modules.js + client constants/modules.js) so links can be filtered per-login.
const baseLinks = [
  { to: '/', key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/products', key: 'products', label: 'Products', icon: Package },
  { to: '/pos', key: 'pos', label: 'POS / Sales', icon: ShoppingCart },
  { to: '/customers', key: 'customers', label: 'Customers', icon: Users },
  { to: '/suppliers', key: 'suppliers', label: 'Suppliers', icon: Truck },
  { to: '/employees', key: 'employees', label: 'Employees', icon: UserCog },
  { to: '/finance', key: 'finance', label: 'Finance', icon: Wallet },
  { to: '/returns', key: 'returns', label: 'Returns & Exchange', icon: Undo2 },
  { to: '/import-export', key: 'import-export', label: 'Import / Export', icon: FileSpreadsheet },
  { to: '/marketing', key: 'marketing', label: 'Marketing', icon: Megaphone },
  { to: '/crm', key: 'crm', label: 'CRM', icon: Contact2 },
  { to: '/subscription', key: 'subscription', label: 'Subscription', icon: CreditCard },
  { to: '/activity', key: 'activity', label: 'Activity Logs', icon: ScrollText },
  { to: '/settings', key: 'settings', label: 'Settings', icon: Settings },
];

// Extra modules enabled only for Technology Management System businesses.
const mobileLinks = [
  { to: '/warranty', key: 'warranty', label: 'Warranty Check', icon: ShieldQuestion },
  { to: '/installments', key: 'installments', label: 'EMI / Installments', icon: CalendarClock },
  { to: '/services', key: 'services', label: 'Service / Repair', icon: Wrench },
];

export default function Sidebar({ open, onClose }) {
  const { user, business, activeBranch, branches } = useAuth();
  const { t } = useLang();
  const isAdmin = user?.role === 'superadmin';
  const isMobile = business?.type === 'mobile';
  // Branch management is an owner-level business-structure decision (matches
  // the server's branchRoutes.js gate), not a per-module staff permission.
  const canManageBranches = ['owner', 'superadmin'].includes(user?.role);
  const { current, updateAvailable } = useAppVersion();

  // insert mobile module links right after "Suppliers" for mobile shops
  let ownerLinks = isMobile
    ? (() => {
        const idx = baseLinks.findIndex((l) => l.to === '/suppliers');
        return [...baseLinks.slice(0, idx + 1), ...mobileLinks, ...baseLinks.slice(idx + 1)];
      })()
    : baseLinks;

  // A staff login only sees the modules the owner has explicitly granted;
  // owner/superadmin always see everything, regardless of `user.permissions`.
  if (user?.role === 'staff') {
    const allowed = user.permissions || [];
    ownerLinks = ownerLinks.filter((l) => allowed.includes(l.key));
  }

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />}
      <aside className={`no-print fixed lg:static z-50 h-full w-64 flex flex-col bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transition-transform ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex items-center justify-between h-16 px-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div>
            <h1 className="font-bold text-brand-600">{t('Shop ERP')}</h1>
            <p className="text-xs text-slate-400 truncate max-w-[150px]">{business?.name || t('Workspace')}</p>
            {branches.length > 1 && activeBranch && (
              <p className="text-[11px] text-brand-500 truncate max-w-[150px]">{activeBranch.name}</p>
            )}
          </div>
          <button onClick={onClose} className="lg:hidden btn-ghost p-1"><X size={18} /></button>
        </div>

        <nav className="p-3 space-y-1 overflow-y-auto flex-1">
          {isAdmin ? (
            <NavLink to="/admin" className={navClass}><ShieldCheck size={18} /> {t('Admin Panel')}</NavLink>
          ) : (
            <>
              {ownerLinks.map((l) => (
                <NavLink key={l.to} to={l.to} end={l.end} className={navClass} onClick={onClose}>
                  <l.icon size={18} /> {t(l.label)}
                </NavLink>
              ))}
              {canManageBranches && (
                <NavLink to="/branches" className={navClass} onClick={onClose}>
                  <Store size={18} /> {t('Branches')}
                </NavLink>
              )}
            </>
          )}
        </nav>

        {/* App version — bottom-left. Swaps to a clickable "relaunch to update"
            prompt once a newer commit is detected running on the server. */}
        <div className="shrink-0 border-t border-slate-200 dark:border-slate-700 px-3 py-2 text-center">
          {updateAvailable ? (
            <button
              onClick={() => location.reload()}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
              title={t('A new version has been deployed — click to reload')}
            >
              <RefreshCw size={12} /> {t('Relaunch to update')}
            </button>
          ) : (
            <span
              className="text-[11px] text-slate-400 dark:text-slate-500"
              title={current?.deployedAt ? fmtDateTime(current.deployedAt) : ''}
            >
              {current ? `v${current.version}` : '…'}
            </span>
          )}
        </div>
      </aside>
    </>
  );
}

const navClass = ({ isActive }) =>
  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
    isActive
      ? 'bg-brand-600 text-white'
      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
  }`;
