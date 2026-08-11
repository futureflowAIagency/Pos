import { useEffect, useState } from 'react';
import { Printer, Pencil, HandCoins, Undo2, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios.js';
import Modal from './ui/Modal.jsx';
import PrintWrapper from './print/PrintWrapper.jsx';
import ThermalReceipt from './print/ThermalReceipt.jsx';
import DuePaymentInvoice from './print/DuePaymentInvoice.jsx';
import ReturnExchangeModal from './ReturnExchangeModal.jsx';
import { taka, fmtDateTime } from '../utils/format.js';
import { useAuth } from '../context/AuthContext.jsx';

const TENDERS = ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card'];

// View a single order/invoice with full details, then reprint, edit, or collect
// its due. Used from the dashboard Recent Orders (req 3) and reusable elsewhere.
export default function OrderDetailsModal({ saleId, onClose, onChanged }) {
  const { business, activeBranch, branches } = useAuth();
  const [sale, setSale] = useState(null);
  const [moneyBack, setMoneyBack] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('view'); // view | edit | due | moneyback
  const [edit, setEdit] = useState({ discount: 0, paid: 0, paymentMethod: 'cash', customerName: '' });
  const [dueForm, setDueForm] = useState({ amount: 0, method: 'cash' });
  const [mbForm, setMbForm] = useState({ amount: 0, method: 'cash', note: '' });
  const [reprint, setReprint] = useState(false);
  const [dueInvoice, setDueInvoice] = useState(null); // { sale, duePayment }
  const [showReturn, setShowReturn] = useState(false);

  const fetchSale = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/sales/${saleId}`);
      const s = data.data.sale;
      const mb = data.data.moneyBack || 0;
      setSale(s);
      setMoneyBack(mb);
      setEdit({ discount: s.discount, paid: s.paid, paymentMethod: TENDERS.includes(s.paidVia) ? s.paidVia : 'cash', customerName: s.customerName });
      setDueForm({ amount: s.due, method: 'cash' });
      setMbForm({ amount: mb, method: TENDERS.includes(s.paidVia) ? s.paidVia : 'cash', note: '' });
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to load order'); }
    setLoading(false);
  };
  useEffect(() => { if (saleId) fetchSale(); }, [saleId]);

  const saveEdit = async () => {
    try {
      await api.patch(`/sales/${saleId}`, {
        discount: Number(edit.discount) || 0,
        paid: Number(edit.paid) || 0,
        paymentMethod: edit.paymentMethod,
        customerName: edit.customerName,
      });
      toast.success('Invoice updated');
      setMode('view'); await fetchSale(); onChanged?.();
    } catch (e) { toast.error(e.response?.data?.message || 'Update failed'); }
  };

  const collect = async () => {
    const amt = Number(dueForm.amount);
    if (!amt || amt <= 0) return toast.error('Enter a valid amount');
    try {
      const { data } = await api.post(`/sales/${saleId}/collect-due`, { amount: amt, method: dueForm.method });
      toast.success('Due collected');
      setDueInvoice({ sale: data.data.sale, duePayment: data.data.duePayment });
      setMode('view'); await fetchSale(); onChanged?.();
    } catch (e) { toast.error(e.response?.data?.message || 'Collection failed'); }
  };

  const giveMoneyBack = async () => {
    const amt = Number(mbForm.amount);
    if (!amt || amt <= 0) return toast.error('Enter a valid amount');
    try {
      await api.post(`/sales/${saleId}/money-back`, { amount: amt, method: mbForm.method, note: mbForm.note });
      toast.success('Money given back to the customer');
      setMode('view'); await fetchSale(); onChanged?.();
    } catch (e) { toast.error(e.response?.data?.message || 'Could not give the money back'); }
  };

  const paidTotal = sale ? (sale.total - sale.due) : 0;
  const hasReturnable = sale ? sale.items.some((it) => (it.qty - (it.returnedQty || 0)) > 0) : false;
  // An invoice from another branch can be looked up (Invoice Search) but not
  // acted on — its money belongs to that branch's till, so edits/collections
  // have to be made while that branch is the active one.
  const saleBranchId = sale ? String(sale.branch?._id || sale.branch || '') : '';
  const otherBranch = !!(sale && branches?.length > 1 && activeBranch?._id && saleBranchId && saleBranchId !== String(activeBranch._id));

  return (
    <>
      <Modal open onClose={onClose} title={sale ? `Invoice ${sale.invoiceNo}` : 'Order'} size="lg"
        footer={sale && mode === 'view' ? (
          <>
            <button className="btn-ghost" onClick={() => setReprint(true)}><Printer size={16} /> Reprint</button>
            {!otherBranch && <button className="btn-ghost" onClick={() => setMode('edit')}><Pencil size={16} /> Edit</button>}
            {!otherBranch && moneyBack > 0 && (
              <button className="btn-ghost text-amber-600" onClick={() => setMode('moneyback')}><Wallet size={16} /> Money Back</button>
            )}
            {!otherBranch && hasReturnable && <button className="btn-ghost" onClick={() => setShowReturn(true)}><Undo2 size={16} /> Return / Exchange</button>}
            {!otherBranch && sale.due > 0 && <button className="btn-primary" onClick={() => setMode('due')}><HandCoins size={16} /> Collect Due</button>}
          </>
        ) : (
          <button className="btn-ghost" onClick={() => (mode === 'view' ? onClose() : setMode('view'))}>{mode === 'view' ? 'Close' : 'Back'}</button>
        )}>
        {loading || !sale ? (
          <p className="text-center py-8 text-slate-400">Loading…</p>
        ) : mode === 'edit' ? (
          <div className="space-y-3">
            <div><label className="label">Customer Name</label><input className="input" value={edit.customerName} onChange={(e) => setEdit({ ...edit, customerName: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Discount (flat)</label><input className="input" type="number" value={edit.discount} onChange={(e) => setEdit({ ...edit, discount: e.target.value })} /></div>
              <div><label className="label">Paid (at sale)</label><input className="input" type="number" value={edit.paid} onChange={(e) => setEdit({ ...edit, paid: e.target.value })} /></div>
            </div>
            <div><label className="label">Payment Method</label>
              <select className="input" value={edit.paymentMethod} onChange={(e) => setEdit({ ...edit, paymentMethod: e.target.value })}>
                <option value="cash">Cash</option><option value="bank">Bank</option><option value="bkash">bKash</option>
                <option value="nagad">Nagad</option><option value="rocket">Rocket</option><option value="card">Card</option>
              </select>
            </div>
            <p className="text-xs text-slate-400">Editing amounts recomputes total, due and profit. To add/remove items, use Return &amp; Exchange.</p>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-ghost" onClick={() => setMode('view')}>Cancel</button>
              <button className="btn-primary" onClick={saveEdit}>Save changes</button>
            </div>
          </div>
        ) : mode === 'moneyback' ? (
          <div className="space-y-3">
            <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 rounded-lg p-3 text-sm">
              This customer paid <strong>{taka(sale.paid)}</strong> against a <strong>{taka(sale.total)}</strong> bill —
              <strong> {taka(moneyBack)}</strong> of their money is still with the shop. Giving it back does not change the
              invoice, the items or the profit; it only takes the money back out of the till.
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Amount to give back</label>
                <input className="input" type="number" value={mbForm.amount} onChange={(e) => setMbForm({ ...mbForm, amount: e.target.value })} />
              </div>
              <div><label className="label">Given back from</label>
                <select className="input" value={mbForm.method} onChange={(e) => setMbForm({ ...mbForm, method: e.target.value })}>
                  <option value="cash">Cash</option><option value="bank">Bank</option><option value="bkash">bKash</option>
                  <option value="nagad">Nagad</option><option value="rocket">Rocket</option><option value="card">Card</option>
                </select>
              </div>
            </div>
            <div><label className="label">Note (optional)</label>
              <input className="input" value={mbForm.note} onChange={(e) => setMbForm({ ...mbForm, note: e.target.value })} placeholder="e.g. change given back when customer came back" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-ghost" onClick={() => setMode('view')}>Cancel</button>
              <button className="btn-primary" onClick={giveMoneyBack}>Give back {taka(Number(mbForm.amount) || 0)}</button>
            </div>
          </div>
        ) : mode === 'due' ? (
          <div className="space-y-3">
            <p className="text-sm">Current due: <strong className="text-red-500">{taka(sale.due)}</strong></p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Amount to collect</label><input className="input" type="number" value={dueForm.amount} onChange={(e) => setDueForm({ ...dueForm, amount: e.target.value })} /></div>
              <div><label className="label">Method</label>
                <select className="input" value={dueForm.method} onChange={(e) => setDueForm({ ...dueForm, method: e.target.value })}>
                  <option value="cash">Cash</option><option value="bank">Bank</option><option value="bkash">bKash</option>
                  <option value="nagad">Nagad</option><option value="rocket">Rocket</option><option value="card">Card</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-ghost" onClick={() => setMode('view')}>Cancel</button>
              <button className="btn-primary" onClick={collect}>Collect &amp; print</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {otherBranch && (
              <p className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg p-2">
                This invoice was made at <strong>{sale.branch?.name || 'another branch'}</strong>. You can view and reprint it here;
                switch to that branch to edit it or take money against it.
              </p>
            )}
            <div className="flex justify-between text-sm">
              <div>
                <p className="font-medium">{sale.customerName}</p>
                {sale.customerNid && <p className="text-xs text-slate-400">NID: {sale.customerNid}</p>}
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">{fmtDateTime(sale.createdAt)}</p>
                <span className={`badge ${sale.due > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                  {sale.due > 0 ? 'DUE' : 'PAID'} · {(sale.paymentMethod || '').toUpperCase()}
                </span>
              </div>
            </div>
            <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-700/50 text-left">
                  <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-center">Qty</th><th className="px-3 py-2 text-right">Price</th></tr>
                </thead>
                <tbody>
                  {sale.items.map((it, i) => (
                    <tr key={i} className="border-t border-slate-100 dark:border-slate-700">
                      <td className="px-3 py-2">
                        {it.name}
                        {it.imei1 && <div className="text-xs text-slate-400">IMEI: {it.imei1}</div>}
                        {it.serial && <div className="text-xs text-slate-400">SN: {it.serial}</div>}
                        {it.returnedQty > 0 && <div className="text-xs text-amber-600">{it.returnedQty} returned</div>}
                      </td>
                      <td className="px-3 py-2 text-center">{it.qty}</td>
                      <td className="px-3 py-2 text-right">{taka(it.sellingPrice * it.qty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-1 text-sm">
              <Row l="Subtotal" r={taka(sale.subTotal)} />
              <Row l="Discount" r={`-${taka(sale.discount)}`} />
              <Row l="Total" r={taka(sale.total)} bold />
              {sale.payments?.length > 1 ? (
                sale.payments.map((p, i) => <Row key={i} l={`Paid (${p.method})`} r={taka(p.amount)} />)
              ) : (
                <Row l="Paid" r={taka(paidTotal)} />
              )}
              <Row l="Due" r={taka(sale.due)} red={sale.due > 0} />
            </div>

            {/* Money back — money taken above the bill that still belongs to the
                customer, plus whatever has already been handed back. */}
            {(moneyBack > 0 || sale.moneyBacks?.length > 0) && (
              <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm">
                <div className="flex items-center justify-between font-medium text-amber-700 dark:text-amber-300">
                  <span className="flex items-center gap-1.5"><Wallet size={15} /> Money Back</span>
                  <span>{taka(moneyBack)}</span>
                </div>
                {moneyBack > 0 && (
                  <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-1">
                    Paid {taka(sale.paid)} against a {taka(sale.total)} bill — this much is still the customer's.
                  </p>
                )}
                {sale.moneyBacks?.map((r, i) => (
                  <p key={i} className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Given back {taka(r.amount)} ({r.method}) on {fmtDateTime(r.date)}{r.note ? ` — ${r.note}` : ''}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <PrintWrapper open={reprint} onClose={() => setReprint(false)} title="Invoice">
        <ThermalReceipt sale={sale} business={business} />
      </PrintWrapper>
      <PrintWrapper open={!!dueInvoice} onClose={() => setDueInvoice(null)} title="Due Payment Invoice">
        {dueInvoice && <DuePaymentInvoice sale={dueInvoice.sale} duePayment={dueInvoice.duePayment} business={business} />}
      </PrintWrapper>
      {showReturn && sale && (
        <ReturnExchangeModal
          sale={sale}
          onClose={() => setShowReturn(false)}
          onDone={async () => { await fetchSale(); onChanged?.(); }}
        />
      )}
    </>
  );
}

const Row = ({ l, r, bold, red }) => (
  <div className={`flex justify-between ${bold ? 'font-bold text-base' : ''} ${red ? 'text-red-500' : ''}`}>
    <span>{l}</span><span>{r}</span>
  </div>
);
