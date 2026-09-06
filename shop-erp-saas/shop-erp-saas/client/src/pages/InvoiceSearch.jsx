import { useState } from 'react';
import { Search, ReceiptText } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios.js';
import DataTable from '../components/ui/DataTable.jsx';
import OrderDetailsModal from '../components/OrderDetailsModal.jsx';
import { taka, fmtDateTime } from '../utils/format.js';
import { useAuth } from '../context/AuthContext.jsx';

// Invoice Search — a customer walks in with a printed bill and a problem. Type
// the invoice number to confirm it's really ours and see everything about it:
// what was bought, how much was paid, through which method, what's still due.
// Lookup spans every branch (the server keeps a branch-locked staff login inside
// its own branch); opening a row gives the full invoice, reprint included.
export default function InvoiceSearch() {
  const { branches } = useAuth();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null); // null = nothing searched yet
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState(null);

  const run = async () => {
    const term = q.trim();
    if (term.length < 2) return toast.error('Type at least 2 characters');
    setLoading(true);
    try {
      const { data } = await api.get('/sales/search', { params: { q: term } });
      setRows(data.data.sales);
      if (!data.data.sales.length) toast('No invoice found for that', { icon: '🔍' });
    } catch (e) { toast.error(e.response?.data?.message || 'Search failed'); }
    setLoading(false);
  };

  const methodLabel = (s) => {
    if (s.payments?.length > 1) return s.payments.map((p) => p.method).join(' + ');
    return (s.payments?.[0]?.method || s.paidVia || s.paymentMethod || '—');
  };

  const columns = [
    { key: 'invoiceNo', label: 'Invoice', render: (r) => (
      <div>
        <span className="font-mono font-medium">{r.invoiceNo}</span>
        <div className="text-xs text-slate-400">{fmtDateTime(r.createdAt)}</div>
      </div>
    )},
    { key: 'customerName', label: 'Customer', render: (r) => (
      <div>
        <span>{r.customerName || 'Walk-in'}</span>
        {r.customer?.phone && <div className="text-xs text-slate-400">{r.customer.phone}</div>}
        {branches?.length > 1 && r.branch?.name && <div className="text-xs text-brand-500">{r.branch.name}</div>}
      </div>
    )},
    { key: 'items', label: 'Items', render: (r) => (
      <div className="text-xs text-slate-500 max-w-xs">
        {r.items.slice(0, 3).map((it, i) => (
          <div key={i} className="truncate">{it.qty} × {it.name}{it.imei1 ? ` (${it.imei1})` : ''}</div>
        ))}
        {r.items.length > 3 && <div>+{r.items.length - 3} more…</div>}
      </div>
    )},
    { key: 'total', label: 'Total', className: 'text-right', render: (r) => taka(r.total) },
    { key: 'paid', label: 'Paid', className: 'text-right', render: (r) => (
      <div>
        <span>{taka(r.total - r.due)}</span>
        <div className="text-xs text-slate-400">{methodLabel(r)}</div>
      </div>
    )},
    { key: 'due', label: 'Due', className: 'text-right', render: (r) => (
      r.due > 0 ? <span className="text-red-500 font-semibold">{taka(r.due)}</span> : <span className="text-green-600">Paid</span>
    )},
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2"><ReceiptText size={24} /> Invoice Search</h1>

      <div className="card p-4 space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              className="input pl-10"
              autoFocus
              placeholder="Invoice number, customer name or phone…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
            />
          </div>
          <button className="btn-primary sm:w-32" disabled={loading} onClick={run}>
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
        <p className="text-xs text-slate-400">
          Checks every invoice in your records. Click a result to see the full bill, reprint it, collect a due or start a return.
        </p>
      </div>

      {rows !== null && (
        <>
          <p className="text-xs font-semibold text-slate-400">
            {rows.length} invoice{rows.length === 1 ? '' : 's'} found for “{q.trim()}”{rows.length === 30 ? ' (showing the 30 most recent)' : ''}
          </p>
          <DataTable columns={columns} rows={rows} onRowClick={(r) => setOpenId(r._id)} empty="No invoice matches that — it is not in our records." />
        </>
      )}

      {openId && <OrderDetailsModal saleId={openId} onClose={() => setOpenId(null)} onChanged={run} />}
    </div>
  );
}
