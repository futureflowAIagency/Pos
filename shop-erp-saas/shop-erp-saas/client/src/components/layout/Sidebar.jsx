import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Package, ShoppingCart, Users, UserCog,
  Wallet, CreditCard, Settings, ScrollText, ShieldCheck, X,
  Truck, ShieldQuestion, CalendarClock, Wrench, Megaphone, Contact2, Undo2, FileSpreadsheet, Store, RefreshCw, ReceiptText,
  ChevronDown, PackageCheck, ClipboardList, History,
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
// Warranty and Returns & Exchange are NOT here — both render as their own
// two-item sub-menus (like Branches further down) since each now has two
// separate tools, spliced in at their old flat-link position (see navItems below).
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
  { to: '/import-export', key: 'import-export', label: 'Import / Export', icon: FileSpreadsheet },
  { to: '/marketing', key: 'marketing', label: 'Marketing', icon: Megaphone },
  { to: '/crm', key: 'crm', label: 'CRM', icon: Contact2 },
  { to: '/subscription', key: 'subscription', label: 'Subscription', icon: CreditCard },
  { to: '/activity', key: 'activity', label: 'Activity Logs', icon: ScrollText },
  { to: '/settings', key: 'settings', label: 'Settings', icon: Settings },
];

// Extra modules enabled only for Technology Management System businesses,
// spliced in right after "Suppliers" (Warranty's own group goes there too).
const mobileLinks = [
  { to: '/installments', key: 'installments', label: 'EMI / Installments', icon: CalendarClock },
  { to: '/services', key: 'services', label: 'Service / Repair', icon: Wrench },
];

// A collapsible two-item sub-menu (Warranty, Returns & Exchange, Branches all
// use this same shape) — stays open while on either of its own routes.
function NavGroup({ icon: Icon, label, active, open, onToggle, children }) {
  return (
    <div>
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
          active ? 'text-coral-300' : 'text-brand-100/90 hover:bg-brand-900/70 hover:text-white'
        }`}
      >
        <Icon size={18} /> {label}
        <ChevronDown size={15} className={`ml-auto transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="ml-4 pl-3 border-l border-brand-800 space-y-1 mt-1">{children}</div>}
    </div>
  );
}

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

  const inBranchSection = ['/branches', '/stock-transfer'].includes(pathname);
  const [branchOpen, setBranchOpen] = useState(inBranchSection);
  useEffect(() => { if (inBranchSection) setBranchOpen(true); }, [inBranchSection]);

  const inWarrantySection = ['/warranty', '/claim-warranty'].includes(pathname);
  const [warrantyOpen, setWarrantyOpen] = useState(inWarrantySection);
  useEffect(() => { if (inWarrantySection) setWarrantyOpen(true); }, [inWarrantySection]);
  const canSeeWarranty = isMobile && (user?.role !== 'staff' || (user.permissions || []).includes('warranty'));

  const inReturnsSection = ['/returns', '/return-history'].includes(pathname);
  const [returnsOpen, setReturnsOpen] = useState(inReturnsSection);
  useEffect(() => { if (inReturnsSection) setReturnsOpen(true); }, [inReturnsSection]);
  const canSeeReturns = user?.role !== 'staff' || (user.permissions || []).includes('returns');

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

  // Build one ordered render list: flat links, with the Warranty group spliced
  // in right after "Suppliers" and the Returns & Exchange group right after
  // "Finance" — the exact spots their old flat links used to sit. Falls back
  // to appending at the end if a staff login's permissions filtered that
  // anchor link out, rather than never showing the group at all.
  const navItems = [];
  let placedWarranty = !canSeeWarranty, placedReturns = !canSeeReturns;
  for (const l of ownerLinks) {
    navItems.push({ type: 'link', ...l });
    if (canSeeWarranty && l.to === '/suppliers') { navItems.push({ type: 'warranty' }); placedWarranty = true; }
    if (canSeeReturns && l.to === '/finance') { navItems.push({ type: 'returns' }); placedReturns = true; }
  }
  if (!placedWarranty) navItems.push({ type: 'warranty' });
  if (!placedReturns) navItems.push({ type: 'returns' });

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
              {navItems.map((item) => {
                if (item.type === 'link') {
                  return (
                    <NavLink key={item.to} to={item.to} end={item.end} className={navClass} onClick={onClose}>
                      <item.icon size={18} /> {t(item.label)}
                    </NavLink>
                  );
                }
                if (item.type === 'warranty') {
                  return (
                    <NavGroup key="warranty" icon={ShieldQuestion} label={t('Warranty')} active={inWarrantySection} open={warrantyOpen} onToggle={() => setWarrantyOpen((o) => !o)}>
                      <NavLink to="/warranty" className={navClass} onClick={onClose}><ShieldQuestion size={16} /> {t('Check Warranty')}</NavLink>
                      <NavLink to="/claim-warranty" className={navClass} onClick={onClose}><ClipboardList size={16} /> {t('Claim Warranty')}</NavLink>
                    </NavGroup>
                  );
                }
                if (item.type === 'returns') {
                  return (
                    <NavGroup key="returns" icon={Undo2} label={t('Returns & Exchange')} active={inReturnsSection} open={returnsOpen} onToggle={() => setReturnsOpen((o) => !o)}>
                      <NavLink to="/returns" end className={navClass} onClick={onClose}><Undo2 size={16} /> {t('New Return / Exchange')}</NavLink>
                      <NavLink to="/return-history" className={navClass} onClick={onClose}><History size={16} /> {t('History')}</NavLink>
                    </NavGroup>
                  );
                }
                return null;
              })}
              {canManageBranches && (
                <NavGroup icon={Store} label={t('Branches')} active={inBranchSection} open={branchOpen} onToggle={() => setBranchOpen((o) => !o)}>
                  <NavLink to="/branches" className={navClass} onClick={onClose}><Store size={16} /> {t('All Branches')}</NavLink>
                  <NavLink to="/stock-transfer" className={navClass} onClick={onClose}><PackageCheck size={16} /> {t('Stock Transfer')}</NavLink>
                </NavGroup>
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
