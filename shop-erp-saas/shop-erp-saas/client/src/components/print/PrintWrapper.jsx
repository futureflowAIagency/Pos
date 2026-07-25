import { useEffect } from 'react';
import { Printer, X } from 'lucide-react';

/**
 * Generic print modal: shows a preview + a Print button.
 * Children render inside `.print-area` so the @media print CSS isolates them.
 * Esc closes it, so a keyboard-only counter (POS) never needs the mouse.
 */
export default function PrintWrapper({ open, onClose, children, title = 'Print Preview' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 overflow-auto no-print-bg">
      <div className="min-h-full flex flex-col items-center py-6">
        <div className="no-print w-full max-w-[220mm] flex justify-between items-center px-4 mb-4">
          <h3 className="text-white font-semibold">{title}</h3>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="btn-primary"><Printer size={18} /> Print</button>
            <button onClick={onClose} className="btn-ghost"><X size={18} /> Close</button>
          </div>
        </div>
        <div className="print-area shadow-2xl">{children}</div>
      </div>
    </div>
  );
}
