import { X } from 'lucide-react';

// NOTE: clicking the dark backdrop deliberately does NOT close this dialog.
// Every modal in this app is a data-entry form (create owner, add product, EMI
// plan, …) and a stray click outside used to wipe everything typed. Closing is
// always explicit: the ✕ in the header, or the form's own Cancel button.
export default function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className={`card w-full ${widths[size]} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-semibold text-lg">{title}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700"><X size={20} /></button>
        </div>
        <div className="p-4">{children}</div>
        {footer && <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
