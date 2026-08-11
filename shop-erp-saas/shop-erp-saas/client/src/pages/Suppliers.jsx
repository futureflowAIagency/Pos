import { useEffect, useState } from 'react';
import { Plus, Pencil, PencilLine, Trash2, Search, Wallet, PackagePlus, ScrollText, Printer, TrendingUp, TrendingDown, AlertTriangle, Boxes } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios.js';
import DataTable from '../components/ui/DataTable.jsx';
import Modal from '../components/ui/Modal.jsx';
import StatCard from '../components/ui/StatCard.jsx';
import PrintWrapper from '../components/print/PrintWrapper.jsx';
import PurchaseReceipt from '../components/print/PurchaseReceipt.jsx';
import { taka, fmtDateTime } from '../utils/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';

const TENDER_OPTIONS = [
  { value: 'cash', label: 'Cash' }, { value: 'bank', label: 'Bank' }, { value: 'bkash', label: 'bKash' },
  { value: 'nagad', label: 'Nagad' }, { value: 'rocket', label: 'Rocket' }, { value: 'card', label: 'Card' },
];

const empty = { name: '', phone: '', address: '', note: '' };
const due = (s) => Math.max(0, (s.totalPurchase || 0) - (s.totalPaid || 0));

export default function Suppliers() {
  const confirm = useConfirm();
  const { business } = useAuth();
  const [suppliers, setSuppliers] = useState([]);
  const [dash, setDash] = useState(null); // { totals, topDue, recentPurchases, supplierCount }
  // purchase report to print/reprint: { purchase, supplier }
  const [printPurchase, setPrintPurchase] = useState(null);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);

  // purchase / payment / ledger sub-modals
  const [purchaseFor, setPurchaseFor] = useState(null);
  const [payFor, setPayFor] = useState(null);
  const [dueFor, setDueFor] = useState(null); // direct due correction
  const [ledgerFor, setLedgerFor] = useState(null);
  const [productsFor, setProductsFor] = useState(null);

  const load = async () => {
    const { data } = await api.get('/suppliers', { params: { search } });
    setSuppliers(data.data.suppliers);
  };
  const loadDashboard = async () => {
    const { data } = await api.get('/suppliers/dashboard/summary');
    setDash(data.data);
  };
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => { loadDashboard(); }, []);
  const refreshAll = () => { load(); loadDashboard(); };

  const openNew = () => { setForm(empty); setEditId(null); setModal(true); };
  const openEdit = (s) => { setForm({ name: s.name, phone: s.phone || '', address: s.address || '', note: s.note || '' }); setEditId(s._id); setModal(true); };

  const save = async () => {
    if (!form.name.trim()) return toast.error('Name is required');
    try {
      if (editId) await api.put(`/suppliers/${editId}`, form);
      else await api.post('/suppliers', form);
      toast.success('Saved'); setModal(false); load();
    } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
  };

  const del = async (s) => {
    const ok = await confirm({ title: 'Delete supplier?', message: `Delete "${s.name}"?`, confirmText: 'Delete', tone: 'danger' });
    if (!ok) return;
    await api.delete(`/suppliers/${s._id}`); toast.success('Deleted'); load();
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Suppliers</h1>
        <button className="btn-primary" onClick={openNew}><Plus size={18} /> Add Supplier</button>
      </div>

      {/* Supplier Dashboard — aggregate totals + top-due + recent purchases (req 12) */}
      {dash && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard icon={TrendingUp} label="Total Purchase" value={taka(dash.totals.totalPurchase)} sub={`${dash.supplierCount} supplier(s)`} accent="brand" />
            <StatCard icon={TrendingDown} label="Total Paid" value={taka(dash.totals.totalPaid)} accent="green" />
            <StatCard icon={AlertTriangle} label="Total Due" value={taka(dash.totals.totalDue)} accent="red" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card p-4">
              <h3 className="font-semibold mb-3">Top Suppliers by Due</h3>
              <DataTable
                columns={[
                  { key: 'name', label: 'Supplier' },
                  { key: 'phone', label: 'Phone', render: (r) => r.phone || '—' },
                  { key: 'due', label: 'Due', className: 'text-right', render: (r) => <span className="text-red-500 font-semibold">{taka(r.due)}</span> },
                ]}
                rows={dash.topDue}
                empty="No outstanding dues"
              />
            </div>
            <div className="card p-4">
              <h3 className="font-semibold mb-3">Recent Purchases</h3>
              <DataTable
                columns={[
                  { key: 'supplier', label: 'Supplier', render: (r) => r.supplier?.name || '—' },
                  { key: 'createdAt', label: 'Date', render: (r) => fmtDateTime(r.createdAt) },
                  { key: 'total', label: 'Total', className: 'text-right', render: (r) => taka(r.total) },
                  { key: 'due', label: 'Due', className: 'text-right', render: (r) => (r.due > 0 ? <span className="text-red-500">{taka(r.due)}</span> : <span className="text-green-600">Paid</span>) },
                ]}
                rows={dash.recentPurchases}
                empty="No purchases yet"
              />
            </div>
          </div>
        </>
      )}

      <div className="relative max-w-sm">
        <Search size={18} className="absolute left-3 top-2.5 text-slate-400" />
        <input className="input pl-10" placeholder="Search suppliers..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <DataTable
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'phone', label: 'Phone', render: (r) => r.phone || '—' },
          { key: 'totalPurchase', label: 'Total Purchase', className: 'text-right', render: (r) => taka(r.totalPurchase) },
          { key: 'totalPaid', label: 'Paid', className: 'text-right', render: (r) => taka(r.totalPaid) },
          { key: 'due', label: 'Due', className: 'text-right', render: (r) => (
            <span className={due(r) > 0 ? 'text-red-500 font-semibold' : 'text-green-600'}>{taka(due(r))}</span>
          )},
          { key: 'actions', label: '', className: 'text-right', render: (r) => (
            <div className="flex justify-end gap-1">
              <button onClick={() => setPurchaseFor(r)} className="btn-ghost p-1.5" title="Record purchase"><PackagePlus size={15} /></button>
              <button onClick={() => setPayFor(r)} className="btn-ghost p-1.5" title="Pay due"><Wallet size={15} /></button>
              <button onClick={() => setDueFor(r)} className="btn-ghost p-1.5" title="Edit due directly (correction, not a payment)"><PencilLine size={15} /></button>
              <button onClick={() => setLedgerFor(r)} className="btn-ghost p-1.5" title="Ledger"><ScrollText size={15} /></button>
              <button onClick={() => setProductsFor(r)} className="btn-ghost p-1.5" title="Products bought (sold vs remaining)"><Boxes size={15} /></button>
              <button onClick={() => openEdit(r)} className="btn-ghost p-1.5"><Pencil size={15} /></button>
              <button onClick={() => del(r)} className="btn-ghost p-1.5 text-red-500"><Trash2 size={15} /></button>
            </div>
          )},
        ]}
        rows={suppliers}
        empty="No suppliers yet"
      />

      {/* Add / Edit */}
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Edit Supplier' : 'Add Supplier'}
        footer={<><button className="btn-ghost" onClick={() => setModal(false)}>Cancel</button><button className="btn-primary" onClick={save}>Save</button></>}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className="label">Name</label><input className="input" value={form.name} onChange={set('name')} /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={set('phone')} /></div>
          <div><label className="label">Address</label><input className="input" value={form.address} onChange={set('address')} /></div>
          <div className="col-span-2"><label className="label">Note</label><input className="input" value={form.note} onChange={set('note')} /></div>
        </div>
      </Modal>

      {purchaseFor && <PurchaseModal supplier={purchaseFor} onClose={() => setPurchaseFor(null)} onDone={refreshAll} onPrint={setPrintPurchase} />}
      {payFor && <PayModal supplier={payFor} onClose={() => setPayFor(null)} onDone={refreshAll} />}
      {dueFor && <EditDueModal supplier={dueFor} onClose={() => setDueFor(null)} onDone={refreshAll} />}
      {ledgerFor && <LedgerModal supplier={ledgerFor} onClose={() => setLedgerFor(null)} onPrint={setPrintPurchase} />}
      {productsFor && <SupplierProductsModal supplier={productsFor} onClose={() => setProductsFor(null)} />}

      {/* Purchase report print / reprint */}
      <PrintWrapper open={!!printPurchase} onClose={() => setPrintPurchase(null)} title="Purchase Report">
        {printPurchase && <PurchaseReceipt purchase={printPurchase.purchase} supplier={printPurchase.supplier} business={business} />}
      </PrintWrapper>
    </div>
  );
}

function PurchaseModal({ supplier, onClose, onDone, onPrint }) {
  const [items, setItems] = useState([{ name: '', qty: 1, unitCost: 0 }]);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [paid, setPaid] = useState(0);
  const [source, setSource] = useState('cash');
  const [saving, setSaving] = useState(false);

  const total = items.reduce((s, it) => s + Number(it.unitCost || 0) * Number(it.qty || 0), 0);
  const setItem = (i, k, v) => setItems(items.map((it, idx) => idx === i ? { ...it, [k]: v } : it));
  const addRow = () => setItems([...items, { name: '', qty: 1, unitCost: 0 }]);
  const removeRow = (i) => setItems(items.filter((_, idx) => idx !== i));

  const submit = async () => {
    const clean = items.filter((it) => it.name.trim() && Number(it.qty) > 0 && Number(it.unitCost) >= 0);
    if (!clean.length) return toast.error('Add at least one item');
    setSaving(true);
    try {
      const { data } = await api.post(`/suppliers/${supplier._id}/purchase`, { items: clean, reference, note, paid: Number(paid || 0), source });
      toast.success('Purchase recorded'); onDone(); onClose();
      onPrint?.({ purchase: data.data.purchase, supplier: data.data.supplier || supplier });
    } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
    setSaving(false);
  };

  return (
    <Modal open onClose={onClose} title={`Record Purchase — ${supplier.name}`} size="lg"
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={saving} onClick={submit}>Save Purchase</button></>}>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div><label className="label">Reference / Memo No</label><input className="input" value={reference} onChange={(e) => setReference(e.target.value)} /></div>
        <div><label className="label">Note</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </div>
      <label className="label">Items</label>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <input className="input col-span-6" placeholder="Item name" value={it.name} onChange={(e) => setItem(i, 'name', e.target.value)} />
            <input className="input col-span-2" type="number" placeholder="Qty" value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} />
            <input className="input col-span-3" type="number" placeholder="Unit cost" value={it.unitCost} onChange={(e) => setItem(i, 'unitCost', e.target.value)} />
            <button className="text-red-500 col-span-1" onClick={() => removeRow(i)}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      <button className="btn-ghost mt-2" onClick={addRow}><Plus size={15} /> Add Item</button>

      <div className="border-t border-slate-200 dark:border-slate-700 mt-3 pt-3 grid grid-cols-2 gap-3">
        <div className="flex items-center justify-between col-span-2 font-semibold"><span>Total</span><span>{taka(total)}</span></div>
        <div><label className="label">Paid now</label><input className="input" type="number" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="0" /></div>
        <div><label className="label">Paid From</label>
          <select className="input" value={source} onChange={(e) => setSource(e.target.value)}>
            {TENDER_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="col-span-2 flex flex-col justify-end">
          <span className="label">Due added</span>
          <div className="input bg-slate-50 dark:bg-slate-800 flex items-center font-semibold text-red-500">{taka(Math.max(0, total - Number(paid || 0)))}</div>
        </div>
      </div>
    </Modal>
  );
}

function PayModal({ supplier, onClose, onDone }) {
  const confirm = useConfirm();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [source, setSource] = useState('cash');
  const [saving, setSaving] = useState(false);
  const due = Math.max(0, (supplier.totalPurchase || 0) - (supplier.totalPaid || 0));

  const submit = async () => {
    if (!amount || Number(amount) <= 0 || Number.isNaN(Number(amount))) return toast.error('Enter a valid amount');
    const ok = await confirm({
      title: 'Record payment?',
      message: `Are you sure you want to record this payment of ${taka(Number(amount))}?`,
      confirmText: 'Confirm',
      cancelText: 'Cancel',
      tone: 'success',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await api.post(`/suppliers/${supplier._id}/pay`, { amount: Number(amount), note, source });
      toast.success('Payment recorded'); onDone(); onClose();
    } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
    setSaving(false);
  };

  return (
    <Modal open onClose={onClose} title={`Pay — ${supplier.name}`}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={saving} onClick={submit}>Record Payment</button></>}>
      <p className="text-sm mb-3">Current due: <strong className="text-red-500">{taka(due)}</strong></p>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Amount</label><input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div><label className="label">Pay From</label>
            <select className="input" value={source} onChange={(e) => setSource(e.target.value)}>
              {TENDER_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>
        <div><label className="label">Note</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </div>
    </Modal>
  );
}

// Direct due correction — for an opening balance carried over from an old system
// or a mistyped purchase. Deliberately separate from "Pay": this moves the due
// figure only and books NO money, so cash/bank balances stay untouched.
function EditDueModal({ supplier, onClose, onDone }) {
  const confirm = useConfirm();
  const current = Math.max(0, (supplier.totalPurchase || 0) - (supplier.totalPaid || 0));
  const [amount, setAmount] = useState(String(current));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const target = Number(amount);
  const valid = amount !== '' && Number.isFinite(target) && target >= 0;
  const delta = valid ? target - current : 0;

  const submit = async () => {
    if (!valid) return toast.error('Enter a valid due amount (0 or more)');
    const okc = await confirm({
      title: 'Update due?',
      message: `Set this supplier's due to ${taka(target)} (currently ${taka(current)})? This is a correction only — no payment is recorded and no balance changes.`,
      confirmText: 'Update Due', cancelText: 'Cancel',
    });
    if (!okc) return;
    setSaving(true);
    try {
      await api.patch(`/suppliers/${supplier._id}/due`, { due: target, note });
      toast.success('Due updated'); onDone(); onClose();
    } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
    setSaving(false);
  };

  return (
    <Modal open onClose={onClose} title={`Edit Due — ${supplier.name}`}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={saving} onClick={submit}>Update Due</button></>}>
      <p className="text-sm mb-3">Current due: <strong className="text-red-500">{taka(current)}</strong></p>
      <div className="space-y-3">
        <div>
          <label className="label">New due amount</label>
          <input className="input" type="number" min="0" value={amount} autoFocus
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
          {valid && delta !== 0 && (
            <p className={`text-xs mt-1 ${delta > 0 ? 'text-red-500' : 'text-green-600'}`}>
              {delta > 0 ? `Due increases by ${taka(delta)}` : `Due decreases by ${taka(-delta)}`}
            </p>
          )}
        </div>
        <div><label className="label">Reason / Note</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. opening balance from old book" /></div>
        <p className="text-xs text-amber-600 flex items-start gap-1">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          This only corrects the due figure — it records no payment, so Cash/Bank balances and the sales reports are unaffected. If money actually changed hands, use <b>Pay due</b> instead. The change is logged in this supplier's ledger.
        </p>
      </div>
    </Modal>
  );
}

function LedgerModal({ supplier, onClose, onPrint }) {
  const [data, setData] = useState(null);
  useEffect(() => { api.get(`/suppliers/${supplier._id}`).then(({ data }) => setData(data.data)); }, [supplier._id]);

  return (
    <Modal open onClose={onClose} title={`Ledger — ${supplier.name}`} size="lg" footer={<button className="btn-ghost" onClick={onClose}>Close</button>}>
      {!data ? <p className="text-slate-400 text-center py-6">Loading...</p> : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-3 text-center">
            <div className="card p-3"><p className="text-xs text-slate-400">Total Purchase</p><p className="font-bold">{taka(data.supplier.totalPurchase)}</p></div>
            <div className="card p-3"><p className="text-xs text-slate-400">Paid</p><p className="font-bold">{taka(data.supplier.totalPaid)}</p></div>
            <div className="card p-3"><p className="text-xs text-slate-400">Due</p><p className="font-bold text-red-500">{taka(due(data.supplier))}</p></div>
          </div>
          <div className="max-h-72 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50 text-left">
                <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Ref</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Paid</th><th className="px-3 py-2"></th></tr>
              </thead>
              <tbody>
                {data.entries.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">No entries</td></tr>}
                {data.entries.map((e) => (
                  <tr key={e._id} className="border-t border-slate-100 dark:border-slate-700">
                    <td className="px-3 py-2">{fmtDateTime(e.createdAt)}</td>
                    <td className="px-3 py-2 capitalize">
                      {e.kind === 'adjustment'
                        ? <span className="badge bg-amber-100 text-amber-700">Due correction</span>
                        : e.kind}
                    </td>
                    <td className="px-3 py-2">{e.reference || e.note || '—'}</td>
                    <td className="px-3 py-2 text-right">
                      {/* an adjustment's total is a signed correction, not goods bought */}
                      {e.kind === 'adjustment'
                        ? <span className={e.total >= 0 ? 'text-red-500' : 'text-green-600'}>{e.total >= 0 ? '+' : '−'}{taka(Math.abs(e.total))}</span>
                        : taka(e.total)}
                    </td>
                    <td className="px-3 py-2 text-right">{taka(e.paid)}</td>
                    <td className="px-3 py-2 text-right">
                      {e.kind === 'purchase' && (
                        <button onClick={() => onPrint?.({ purchase: e, supplier: data.supplier })} className="btn-ghost p-1" title="Print purchase report"><Printer size={14} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}

// Per-product breakdown for a supplier: how many bought, how many sold, how many
// remain in stock right now (req: "10 pcs Samsung S23 Ultra bought — koyta bikri
// korlam, koyta thaklo").
function SupplierProductsModal({ supplier, onClose }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    api.get(`/suppliers/${supplier._id}/products`).then(({ data }) => setRows(data.data.products));
  }, [supplier._id]);

  return (
    <Modal open onClose={onClose} title={`Products Bought — ${supplier.name}`} size="lg" footer={<button className="btn-ghost" onClick={onClose}>Close</button>}>
      {!rows ? (
        <p className="text-slate-400 text-center py-6">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-slate-400 text-center py-6 text-sm">No product-linked purchases yet from this supplier. (Only purchases made via Add Product's supplier field are tracked per-product here.)</p>
      ) : (
        <div className="max-h-96 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700/50 text-left sticky top-0">
              <tr>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2 text-right">Purchased</th>
                <th className="px-3 py-2 text-right">Sold</th>
                <th className="px-3 py-2 text-right">Returned</th>
                <th className="px-3 py-2 text-right">Current Stock</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.productId} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-right">{r.purchasedQty}</td>
                  <td className="px-3 py-2 text-right">{r.soldQty}</td>
                  <td className={`px-3 py-2 text-right ${r.returnedQty > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{r.returnedQty || '—'}</td>
                  <td className="px-3 py-2 text-right font-semibold">{r.currentStock ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-slate-400 p-3">Sold is net of returns — a returned item goes back into stock and stops counting as sold. Sold/Returned/Current Stock are shop-wide for each product (a sale doesn't record which supplier a specific unit came from).</p>
        </div>
      )}
    </Modal>
  );
}
