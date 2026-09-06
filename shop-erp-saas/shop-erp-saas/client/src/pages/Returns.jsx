import { useEffect, useState } from 'react';
import { Undo2, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios.js';
import DataTable from '../components/ui/DataTable.jsx';
import OrderDetailsModal from '../components/OrderDetailsModal.jsx';
import { taka, fmtDateTime } from '../utils/format.js';
import { useAuth } from '../context/AuthContext.jsx';

const PAGE_SIZE = 20;

// New Return / Exchange — every sold invoice this shop has, not just
// Dashboard's 6 "Recent Orders": browse all of them (paginated, newest
// first), or narrow down instantly by invoice number, customer name/phone,
// or a date range. Click a row to open its full invoice — reprint, collect
// due, or start the actual Return/Exchange from there.
export default function Returns() {
  const { branches } = useAuth();
  const [q, setQ] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  const isSearching = q.trim().length >= 2;

  const load = async () => {
    setLoading(true);
    try {
      if (isSearching) {
        // Quick find by invoice/name/phone — business-wide, top 30 matches.
        const { data } = await api.get('/sales/search', { params: { q: q.trim() } });
        setRows(data.data.sales); setTotal(data.data.sales.length);
      } else {
        // Browse everything, paginated — respects the date filter if set.
        const { data } = await api.get('/sales', { params: { page, pageSize: PAGE_SIZE, from: dateFrom || undefined, to: dateTo || undefined } });
        setRows(data.data.sales); setTotal(data.data.total);
      }
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to load orders'); }
    setLoading(false);
  };
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [q, dateFrom, dateTo, page]);
  // typing a new search or changing the date range should always land back on page 1
  useEffect(() => { setPage(1); }, [q, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const columns = [
    { key: 'invoiceNo', label: 'Invoice', render: (r) => (
      <div>
        <span className="font-mono font-medium">{r.invoiceNo}</span>
        <div className="text-xs text-slate-400">{fmtDateTime(r.createdAt)}</div>
      </div>
    ) },
    { key: 'customerName', label: 'Customer', render: (r) => (
      <div>
        <span>{r.customerName || 'Walk-in'}</span>
        {r.customer?.phone && <div className="text-xs text-slate-400">{r.customer.phone}</div>}
        {branches?.length > 1 && r.branch?.name && <div className="text-xs text-brand-500">{r.branch.name}</div>}
      </div>
    ) },
    { key: 'items', label: 'Items', render: (r) => (
      <div className="text-xs text-slate-500 max-w-xs">
        {r.items.slice(0, 3).map((it, i) => (
          <div key={i} className="truncate">{it.qty} × {it.name}{it.imei1 ? ` (${it.imei1})` : ''}</div>
        ))}
        {r.items.length > 3 && <div>+{r.items.length - 3} more…</div>}
      </div>
    ) },
    { key: 'total', label: 'Total', className: 'text-right', render: (r) => taka(r.total) },
    { key: 'due', label: 'Due', className: 'text-right', render: (r) => (
      r.due > 0 ? <span className="text-red-500 font-semibold">{taka(r.due)}</span> : <span className="text-green-600">Paid</span>
    ) },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Undo2 size={24} /> New Return / Exchange</h1>

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
            />
          </div>
          <input type="date" className="input sm:w-auto" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="From date" disabled={isSearching} />
          <input type="date" className="input sm:w-auto" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="To date" disabled={isSearching} />
        </div>
        <p className="text-xs text-slate-400">
          {isSearching
            ? 'Searching by invoice/name/phone across every branch.'
            : 'Every invoice this branch has sold, newest first — search or pick a date range to narrow it down. Click an order to reprint it, collect a due, or start a return/exchange.'}
        </p>
      </div>

      <DataTable columns={columns} rows={rows} onRowClick={(r) => setOpenId(r._id)} empty={loading ? 'Loading…' : 'No orders found'} />

      {!isSearching && total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">{total} order(s) total — page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <button className="btn-ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      )}

      {openId && <OrderDetailsModal saleId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}
