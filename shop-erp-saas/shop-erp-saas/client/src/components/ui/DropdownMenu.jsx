import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

// A trigger button that opens a small floating list of actions — same idiom
// NotificationBell.jsx already uses (relative wrapper, absolute panel,
// click-outside backdrop), generalized so any page can group several related
// buttons under one menu instead of a long row of separate buttons.
// items: [{ label, icon?: LucideIcon, onClick, disabled? }]
export default function DropdownMenu({ label, icon: TriggerIcon, items, buttonClassName = 'btn-ghost' }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button type="button" className={buttonClassName} onClick={() => setOpen((v) => !v)}>
        {TriggerIcon && <TriggerIcon size={18} />} {label}
        <ChevronDown size={14} className={`ml-1 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          {/* click-outside-to-close backdrop, same idiom as NotificationBell.jsx/Modal.jsx */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 mt-1 min-w-[220px] z-50 rounded-lg border border-brand-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1">
            {items.map((it, i) => {
              const Icon = it.icon;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={it.disabled}
                  onClick={() => { setOpen(false); it.onClick?.(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-brand-50 dark:hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {Icon && <Icon size={15} className="shrink-0 text-slate-400" />}
                  <span className="truncate">{it.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
