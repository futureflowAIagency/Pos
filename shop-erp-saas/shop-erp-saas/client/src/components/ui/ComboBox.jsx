import { useMemo, useState } from 'react';

// A real, app-rendered dropdown for a text field backed by a list of known
// values — same idiom already used for POS's product-search dropdown and the
// Stock-Print-by-Model suggestion list (an `absolute` panel that opens on
// focus/click, filters as you type, closes on blur/Escape/pick). Unlike a
// native `<input list>` datalist, this reliably shows EVERY option when the
// field is empty/just focused (browsers don't guarantee that for datalists),
// and can be styled to match the app. It's still a plain text input
// underneath — nothing stops typing a brand-new value that isn't in the list.
export default function ComboBox({ value, onChange, options = [], placeholder = '', className = 'input' }) {
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = String(value || '').trim().toLowerCase();
    const list = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    return list.slice(0, 40);
  }, [value, options]);

  return (
    <div className="relative">
      <input
        className={className}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-brand-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg">
          {filtered.map((o) => (
            <button
              key={o}
              type="button"
              onMouseDown={(e) => e.preventDefault()} // keep focus so onBlur doesn't close before onClick fires
              onClick={() => { onChange(o); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-brand-50 dark:hover:bg-slate-700/50 truncate"
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
