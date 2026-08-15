import { Moon, Sun, Menu, LogOut, Languages, Store } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLang } from '../../context/LanguageContext.jsx';
import NotificationBell from './NotificationBell.jsx';
import ScannerWidget from './ScannerWidget.jsx';

export default function Topbar({ onMenu }) {
  const { theme, toggleTheme } = useTheme();
  const { user, branches, activeBranch, switchBranch, logout } = useAuth();
  const { lang, toggleLang, t } = useLang();
  // A staff login locked to one branch (assignedBranch) can't switch — the
  // server would ignore the header anyway, so don't offer a dropdown that lies.
  const canSwitch = branches.length > 1 && !user?.assignedBranch;
  return (
    <header className="no-print sticky top-0 z-30 flex items-center justify-between px-4 h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
      <button onClick={onMenu} className="lg:hidden btn-ghost p-2"><Menu size={20} /></button>
      <div className="flex-1" />
      <div className="flex items-center gap-2">
        {canSwitch && (
          <div className="hidden sm:flex items-center gap-1.5" title={t('Active branch')}>
            <Store size={16} className="text-slate-400 shrink-0" />
            <select
              className="input !py-1.5 !w-auto text-sm"
              value={activeBranch?._id || ''}
              onChange={(e) => switchBranch(e.target.value)}
            >
              {branches.filter((b) => b.isActive).map((b) => (
                <option key={b._id} value={b._id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}
        <ScannerWidget />
        <NotificationBell />
        <button onClick={toggleLang} className="btn-ghost p-2 flex items-center gap-1" title={t('Toggle language')}>
          <Languages size={18} />
          <span className="text-xs font-semibold">{lang === 'en' ? 'বাং' : 'EN'}</span>
        </button>
        <button onClick={toggleTheme} className="btn-ghost p-2" title={t('Toggle theme')}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <div className="hidden sm:flex flex-col items-end mr-1">
          <span className="text-sm font-medium">{user?.name}</span>
          <span className="text-xs text-slate-400 capitalize">{user?.role}</span>
        </div>
        <button onClick={logout} className="btn-ghost p-2" title={t('Logout')}><LogOut size={18} /></button>
      </div>
    </header>
  );
}
