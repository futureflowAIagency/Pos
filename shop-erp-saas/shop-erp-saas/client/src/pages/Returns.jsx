import { useEffect, useState } from 'react';
import { Undo2, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios.js';
import DataTable from '../components/ui/DataTable.jsx';
import OrderDetailsModal from '../components/OrderDetailsModal.jsx';
import { taka, fmtDateTime } from '../utils/format.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Returns() {
  const [tab, setTab] = useState('new'); // 'new' | 'history'
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Undo2 size={24} /> Returns &amp; Exchange</h1>
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
        <TabButton active={tab === 'new'} onClick={() => setTab('new')}>New Return / Exchange</TabButton>
        <TabButton active={tab === 'history'} onClick={() => setTab('history')}>History</TabButton>
      </div>
      {tab === 'new' ? <NewReturnExchange /> : <ReturnHistory />}
    </div>
  );
}

const TabButton = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
      active ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
    }`}
  >
    {children}
  </button>
);

// ---------------------------------------------------------------------------
// Tab 1: New Return / Exchange — find the sale by invoice number or customer
// phone/name (same lookup Invoice Search uses), then open it — the actual
// Return/Exchange button lives inside that invoice's own details modal.
// ---------------------------------------------------------------------------
function NewReturnExchange() {
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
  ];

  return (
    <div className="space-y-4 pt-4">
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
        <p className="text-xs text-slate-400">Find the sale by its invoice number or the customer's phone number, then open it to return or exchange an item.</p>
      </div>

      {rows !== null && (
        <>
          <p className="text-xs font-semibold text-slate-400">
            {rows.length} invoice{rows.length === 1 ? '' : 's'} found for "{q.trim()}"{rows.length === 30 ? ' (showing the 30 most recent)' : ''}
          </p>
          <DataTable columns={columns} rows={rows} onRowClick={(r) => setOpenId(r._id)} empty="No invoice matches that — it is not in our records." />
        </>
      )}

      {openId && <OrderDetailsModal saleId={openId} onClose={() => setOpenId(null)} onChanged={run} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2: History — permanent audit trail of every return & exchange (req 14).
// ---------------------------------------------------------------------------
function ReturnHistory() {
  const [returns, setReturns] = useState([]);

  useEffect(() => {
    api.get('/returns').then(({ data }) => setReturns(data.data.returns));
  }, []);

  return (
    <div className="pt-4">
      <DataTable
        columns={[
          { key: 'createdAt', label: 'Date', render: (r) => fmtDateTime(r.createdAt) },
          { key: 'invoiceNo', label: 'Invoice' },
          { key: 'customerName', label: 'Customer', render: (r) => r.customerName || '—' },
          { key: 'type', label: 'Type', render: (r) => (
            <span className={`badge ${r.type === 'exchange' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{r.type}</span>
          ) },
          { key: 'items', label: 'Items', render: (r) => (
            <div className="text-xs">
              {r.items.map((it, i) => (
                <div key={i}>{it.name} × {it.qty} <span className="text-slate-400">({it.condition})</span></div>
              ))}
            </div>
          ) },
          { key: 'reason', label: 'Reason', render: (r) => r.reason || '—' },
          { key: 'returnValue', label: 'Return Value', className: 'text-right', render: (r) => taka(r.returnValue) },
          { key: 'settlement', label: 'Settlement', className: 'text-right', render: (r) => (
            <div className="text-xs">
              {r.dueReduction > 0 && <div>Due cleared: {taka(r.dueReduction)}</div>}
              {r.cashRefund > 0 && <div className="text-red-500">Refunded ({r.refundMethod}): {taka(r.cashRefund)}</div>}
              {r.storeCreditIssued > 0 && <div className="text-green-600">Store credit: {taka(r.storeCreditIssued)}</div>}
              {r.type === 'exchange' && (
                <div className={r.priceDiff > 0 ? 'text-red-500' : r.priceDiff < 0 ? 'text-green-600' : ''}>
                  {r.priceDiff > 0 ? `Customer paid ${taka(r.priceDiff)}` : r.priceDiff < 0 ? `Diff settled ${taka(-r.priceDiff)}` : 'Even exchange'}
                </div>
              )}
            </div>
          ) },
        ]}
        rows={returns}
        empty="No returns or exchanges yet"
      />
    </div>
  );
}
