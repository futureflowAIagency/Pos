import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Package, ShoppingCart, Users, UserCog,
  Wallet, CreditCard, Settings, ScrollText, ShieldCheck, X,
  Truck, ShieldQuestion, CalendarClock, Wrench, Megaphone, Contact2, Undo2, FileSpreadsheet, Store, RefreshCw, ReceiptText,
  ChevronDown, PackageCheck, ClipboardList,
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
  // Same 'pos' permission: everything it can do (view, reprint, collect due,
  // return) already lives behind that module on the server.
  { to: '/invoice-search', key: 'pos', label: 'Invoice Search', icon: ReceiptText },
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
// Warranty renders as its own two-item sub-menu (like Branches below) rather
// than a flat link, since it now has two separate tools (Check / Claim).
const mobileLinks = [
  { to: '/installments', key: 'installments', label: 'EMI / Installments', icon: CalendarClock },
  { to: '/services', key: 'services', label: 'Service / Repair', icon: Wrench },
];

export default function Sidebar({ open, onClose }) {
  const { user, business, activeBranch, branches } = useAuth();
  const { t } = useLang();
  const { pathname } = useLocation();
  const isAdmin = user?.role === 'superadmin';
  const isMobile = business?.type === 'mobile';
  // Branch management is an owner-level business-structure decision (matches
  // the server's branchRoutes.js gate), not a per-module staff permission.
  const canManageBranches = ['owner', 'superadmin'].includes(user?.role);
  const { current, updateAvailable } = useAppVersion();
  // Branches expands into its own two tools; keep it open while you're on either.
  const inBranchSection = ['/branches', '/stock-transfer'].includes(pathname);
  const [branchOpen, setBranchOpen] = useState(inBranchSection);
  useEffect(() => { if (inBranchSection) setBranchOpen(true); }, [inBranchSection]);
  // Warranty expands into Check Warranty / Claim Warranty; same pattern as Branches.
  const inWarrantySection = ['/warranty', '/claim-warranty'].includes(pathname);
  const [warrantyOpen, setWarrantyOpen] = useState(inWarrantySection);
  useEffect(() => { if (inWarrantySection) setWarrantyOpen(true); }, [inWarrantySection]);
  const canSeeWarranty = isMobile && (user?.role !== 'staff' || (user.permissions || []).includes('warranty'));

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

  // Warranty's sub-menu renders right where its old flat link used to sit —
  // immediately after "Suppliers" (same spot mobileLinks are spliced in above).
  // Falls back to the end of the list if a staff login's permissions filtered
  // "Suppliers" itself out, rather than mis-splitting to index 0.
  const supplierIdx = ownerLinks.findIndex((l) => l.to === '/suppliers');
  const warrantyInsertAt = supplierIdx === -1 ? ownerLinks.length : supplierIdx + 1;
  const linksBeforeWarranty = ownerLinks.slice(0, warrantyInsertAt);
  const linksAfterWarranty = ownerLinks.slice(warrantyInsertAt);

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />}
      {/* A fixed dark-teal sidebar, independent of the app's own light/dark
          theme toggle (that toggle still governs the content area) — the
          client picked this teal + coral combination specifically. */}
      <aside className={`no-print fixed lg:static z-50 h-full w-64 flex flex-col bg-brand-950 border-r border-brand-900 transition-transform ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex items-center justify-between h-16 px-4 border-b border-brand-900 shrink-0">
          <div>
            <h1 className="font-bold text-white">{t('Shop ERP')}</h1>
            <p className="text-xs text-brand-300/70 truncate max-w-[150px]">{business?.name || t('Workspace')}</p>
            {branches.length > 1 && activeBranch && (
              <p className="text-[11px] text-coral-300 truncate max-w-[150px]">{activeBranch.name}</p>
            )}
          </div>
          <button onClick={onClose} className="lg:hidden p-1 rounded-lg text-brand-200 hover:bg-brand-900"><X size={18} /></button>
        </div>

        <nav className="p-3 space-y-1 overflow-y-auto flex-1">
          {isAdmin ? (
            <NavLink to="/admin" className={navClass}><ShieldCheck size={18} /> {t('Admin Panel')}</NavLink>
          ) : (
            <>
              {linksBeforeWarranty.map((l) => (
                <NavLink key={l.to} to={l.to} end={l.end} className={navClass} onClick={onClose}>
                  <l.icon size={18} /> {t(l.label)}
                </NavLink>
              ))}
              {canSeeWarranty && (
                <div>
                  <button
                    onClick={() => setWarrantyOpen((o) => !o)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                      inWarrantySection
                        ? 'text-coral-300'
                        : 'text-brand-100/90 hover:bg-brand-900/70 hover:text-white'
                    }`}
                  >
                    <ShieldQuestion size={18} /> {t('Warranty')}
                    <ChevronDown size={15} className={`ml-auto transition-transform ${warrantyOpen ? '' : '-rotate-90'}`} />
                  </button>
                  {warrantyOpen && (
                    <div className="ml-4 pl-3 border-l border-brand-800 space-y-1 mt-1">
                      <NavLink to="/warranty" className={navClass} onClick={onClose}>
                        <ShieldQuestion size={16} /> {t('Check Warranty')}
                      </NavLink>
                      <NavLink to="/claim-warranty" className={navClass} onClick={onClose}>
                        <ClipboardList size={16} /> {t('Claim Warranty')}
                      </NavLink>
                    </div>
                  )}
                </div>
              )}
              {linksAfterWarranty.map((l) => (
                <NavLink key={l.to} to={l.to} end={l.end} className={navClass} onClick={onClose}>
                  <l.icon size={18} /> {t(l.label)}
                </NavLink>
              ))}
              {canManageBranches && (
                <div>
                  <button
                    onClick={() => setBranchOpen((o) => !o)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                      inBranchSection
                        ? 'text-coral-300'
                        : 'text-brand-100/90 hover:bg-brand-900/70 hover:text-white'
                    }`}
                  >
                    <Store size={18} /> {t('Branches')}
                    <ChevronDown size={15} className={`ml-auto transition-transform ${branchOpen ? '' : '-rotate-90'}`} />
                  </button>
                  {branchOpen && (
                    <div className="ml-4 pl-3 border-l border-brand-800 space-y-1 mt-1">
                      <NavLink to="/branches" className={navClass} onClick={onClose}>
                        <Store size={16} /> {t('All Branches')}
                      </NavLink>
                      <NavLink to="/stock-transfer" className={navClass} onClick={onClose}>
                        <PackageCheck size={16} /> {t('Stock Transfer')}
                      </NavLink>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </nav>

        {/* App version — bottom-left. Swaps to a clickable "relaunch to update"
            prompt once a newer commit is detected running on the server. */}
        <div className="shrink-0 border-t border-brand-900 px-3 py-2 text-center">
          {updateAvailable ? (
            <button
              onClick={() => location.reload()}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-amber-300 hover:underline"
              title={t('A new version has been deployed — click to reload')}
            >
              <RefreshCw size={12} /> {t('Relaunch to update')}
            </button>
          ) : (
            <span
              className="text-[11px] text-brand-400/70"
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
      ? 'bg-coral-600 text-white'
      : 'text-brand-100/90 hover:bg-brand-900/70 hover:text-white'
  }`;
