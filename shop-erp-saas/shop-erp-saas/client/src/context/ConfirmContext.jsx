import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { AlertTriangle, Trash2, CheckCircle2, XCircle, X } from 'lucide-react';

const ConfirmContext = createContext();
export const useConfirm = () => useContext(ConfirmContext);

const TONE = {
  danger: { Icon: Trash2, ring: 'text-red-500 bg-red-100 dark:bg-red-500/15', btn: 'btn-danger' },
  warning: { Icon: AlertTriangle, ring: 'text-amber-500 bg-amber-100 dark:bg-amber-500/15', btn: 'btn-primary' },
  success: { Icon: CheckCircle2, ring: 'text-green-600 bg-green-100 dark:bg-green-500/15', btn: 'btn-primary' },
  deactivate: { Icon: XCircle, ring: 'text-amber-500 bg-amber-100 dark:bg-amber-500/15', btn: 'btn-primary' },
};

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { title, message, confirmText, cancelText, tone }
  const resolver = useRef(null);

  const confirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      resolver.current = resolve;
      setState({
        title: options.title || 'Are you sure?',
        message: options.message || 'This action cannot be undone. Do you want to continue?',
        confirmText: options.confirmText || 'Confirm',
        cancelText: options.cancelText || 'Cancel',
        tone: options.tone || 'warning',
      });
    });
  }, []);

  const close = (result) => {
    if (resolver.current) resolver.current(result);
    resolver.current = null;
    setState(null);
  };

  const t = state ? (TONE[state.tone] || TONE.warning) : TONE.warning;
  const Icon = t.Icon;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {/* Backdrop clicks are ignored on purpose — same rule as Modal.jsx: a
          dialog only closes through an explicit ✕ / Cancel / confirm click. */}
      {state && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <div className="card w-full max-w-md">
            <div className="flex items-start gap-4 p-5">
              <div className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center ${t.ring}`}>
                <Icon size={22} />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{state.title}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-300 mt-1">{state.message}</p>
              </div>
              <button onClick={() => close(false)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700"><X size={18} /></button>
            </div>
            <div className="px-5 pb-5 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => close(false)}>{state.cancelText}</button>
              <button className={t.btn} onClick={() => close(true)}>{state.confirmText}</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
