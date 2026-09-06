import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import api from '../api/axios.js';
import DataTable from '../components/ui/DataTable.jsx';
import { taka, fmtDateTime } from '../utils/format.js';

// Permanent audit history of every return & exchange (req 14). Sibling page
// to Returns.jsx ("New Return / Exchange"), reached via the same Sidebar
// sub-menu.
export default function ReturnHistory() {
  const [returns, setReturns] = useState([]);

  useEffect(() => {
    api.get('/returns').then(({ data }) => setReturns(data.data.returns));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2"><History size={24} /> Return &amp; Exchange History</h1>

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
