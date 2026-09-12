import { Plus, Trash2 } from 'lucide-react';
import AccountSelect from './AccountSelect.jsx';

// Repeatable "method + amount (+ named account)" rows, letting one payment be
// split across more than one tender — the exact pattern POS.jsx's own
// checkout payment rows already use (kept as a fresh, small component here
// rather than refactoring POS.jsx itself, so the most heavily-used page's
// payment UI stays completely untouched).
// rows: [{method, amount, account}]; onChange(rows); total: the amount a
// "fill remaining" click completes each row up to.
export default function PaymentRows({ rows, onChange, total = 0 }) {
  const setRow = (i, k, v) => onChange(rows.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addRow = () => onChange([...rows, { method: 'cash', amount: '', account: null }]);
  const removeRow = (i) => onChange(rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows);
  const fillRemaining = (i) => {
    const paidSum = rows.reduce((s, r, idx) => (idx === i ? s : s + (Number(r.amount) || 0)), 0);
    setRow(i, 'amount', String(Math.max(0, total - paidSum)));
  };

  return (
    <div className="space-y-1.5">
      {rows.map((p, i) => (
        <div key={i} className="space-y-1">
          <div className="flex gap-1.5 items-center">
            <select className="input !w-28 shrink-0" value={p.method} onChange={(e) => setRow(i, 'method', e.target.value)}>
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
              <option value="bkash">bKash</option>
              <option value="nagad">Nagad</option>
              <option value="rocket">Rocket</option>
              <option value="card">Card</option>
            </select>
            <input
              className="input flex-1"
              type="number"
              placeholder="Amount"
              value={p.amount}
              onChange={(e) => setRow(i, 'amount', e.target.value)}
            />
            <button type="button" className="btn-ghost !px-2 shrink-0" title="Fill remaining" onClick={() => fillRemaining(i)}>=</button>
            {rows.length > 1 && (
              <button type="button" className="text-red-500 p-1 shrink-0" onClick={() => removeRow(i)}><Trash2 size={14} /></button>
            )}
          </div>
          <AccountSelect method={p.method} value={p.account} onChange={(v) => setRow(i, 'account', v)} className="!py-1 text-xs" />
        </div>
      ))}
      <button type="button" className="btn-ghost mt-1 !py-1 text-xs" onClick={addRow}><Plus size={13} /> Add payment method</button>
    </div>
  );
}
