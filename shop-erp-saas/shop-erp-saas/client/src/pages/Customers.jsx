import { useEffect, useState } from 'react';
import { Plus, Trash2, History, HandCoins, Printer, Pencil, CalendarClock } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios.js';
import DataTable from '../components/ui/DataTable.jsx';
import Modal from '../components/ui/Modal.jsx';
import PrintWrapper from '../components/print/PrintWrapper.jsx';
import DueReceipt from '../components/print/DueReceipt.jsx';
import ThermalReceipt from '../components/print/ThermalReceipt.jsx';
import { taka, fmtDate, fmtDateTime } from '../utils/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';

const emptyForm = { name: '', phone: '', email: '', address: '', nid: '', dueDate: '' };
const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

export default function Customers() {
  const { business } = useAuth();
  const confirm = useConfirm();
  const [customers, setCustomers] = useState([]);
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [history, setHistory] = useState(null);
  const [dueModal, setDueModal] = useState(null);
  const [dueAmount, setDueAmount] = useState(0);
  const [dueMethod, setDueMethod] = useState('cash');
  const [printDue, setPrintDue] = useState(null);
  // reprint a past invoice from a customer's history (unlimited times)
  const [printSale, setPrintSale] = useState(null);

  const load = async () => { const { data } = await api.get('/customers'); setCustomers(data.data.customers); };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditId(null); setForm(emptyForm); setModal(true); };
  const openEdit = (c) => {
    setEditId(c._id);
    setForm({ name: c.name || '', phone: c.phone || '', email: c.email || '', address: c.address || '', nid: c.nid || '', dueDate: toDateInput(c.dueDate) });
    setModal(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error('Name is required');
    const payload = { ...form, dueDate: form.dueDate || null };
    try {
      if (editId) await api.put(`/customers/${editId}`, payload);
      else await api.post('/customers', payload);
      toast.success(editId ? 'Customer updated' : 'Added');
      setModal(false); setForm(emptyForm); setEditId(null); load();
    } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
  };
  const del = async (c) => {
    const ok = await confirm({
      title: 'Delete customer?',
      message: `Are you sure you want to delete "${c.name}"? This action cannot be undone.`,
      confirmText: 'Delete', tone: 'danger',
    });
    if (!ok) return;
    await api.delete(`/customers/${c._id}`); toast.success('Deleted'); load();
  };
  const viewHistory = async (c) => { const { data } = await api.get(`/customers/${c._id}/history`); setHistory(data.data); };
  const collectDue = async () => {
    if (!(Number(dueAmount) > 0)) return toast.error('Enter a valid amount');
    const { data } = await api.post(`/customers/${dueModal._id}/collect-due`, { amount: Number(dueAmount), method: dueMethod });
    toast.success('Due collected');
    setPrintDue({ customer: data.data.customer, amount: data.data.duePayment.amount, method: dueMethod });
    setDueModal(null); setDueAmount(0); setDueMethod('cash'); load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Customers</h1>
        <button className="btn-primary" onClick={openNew}><Plus size={18} /> Add Customer</button>
      </div>

      <DataTable
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'phone', label: 'Phone' },
          { key: 'nid', label: 'NID', render: (r) => r.nid ? <span className="font-mono text-xs">{r.nid}</span> : <span className="text-slate-400">—</span> },
          { key: 'address', label: 'Address', render: (r) => r.address ? <span className="truncate block max-w-[200px]" title={r.address}>{r.address}</span> : <span className="text-slate-400">—</span> },
          { key: 'totalDue', label: 'Due', className: 'text-right', render: (r) => (
            <div>
              <span className={r.totalDue > 0 ? 'text-red-500 font-semibold' : ''}>{taka(r.totalDue)}</span>
              {r.totalDue > 0 && r.dueDate && (
                <p className={`text-xs flex items-center justify-end gap-1 mt-0.5 ${new Date(r.dueDate) <= new Date() ? 'text-red-500' : 'text-slate-400'}`}>
                  <CalendarClock size={11} /> {fmtDate(r.dueDate)}
                </p>
              )}
            </div>
          )},
          { key: 'storeCredit', label: 'Store Credit', className: 'text-right', render: (r) => (
            r.storeCredit > 0 ? <span className="text-green-600 font-semibold">{taka(r.storeCredit)}</span> : <span className="text-slate-400">—</span>
          )},
          { key: 'actions', label: '', className: 'text-right', render: (r) => (
            <div className="flex justify-end gap-1">
              <button onClick={() => viewHistory(r)} className="btn-ghost p-1.5" title="History"><History size={15} /></button>
              <button onClick={() => setDueModal(r)} className="btn-ghost p-1.5 text-green-600" title="Collect due" disabled={r.totalDue <= 0}><HandCoins size={15} /></button>
              <button onClick={() => openEdit(r)} className="btn-ghost p-1.5" title="Edit"><Pencil size={15} /></button>
              <button onClick={() => del(r)} className="btn-ghost p-1.5 text-red-500"><Trash2 size={15} /></button>
            </div>
          )},
        ]}
        rows={customers}
      />

      {/* Add / Edit */}
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Edit Customer' : 'Add Customer'}
        footer={<><button className="btn-ghost" onClick={() => setModal(false)}>Cancel</button><button className="btn-primary" onClick={save}>Save</button></>}>
        <div className="space-y-3">
          <div><label className="label">Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label className="label">Email <span className="text-xs text-slate-400">(for email campaigns)</span></label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="customer@example.com" /></div>
          <div><label className="label">NID / Identity</label><input className="input" value={form.nid} onChange={(e) => setForm({ ...form, nid: e.target.value })} placeholder="National ID (optional)" /></div>
          <div><label className="label">Address</label><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div>
            <label className="label">Due Date <span className="text-xs text-slate-400">(reminder — a notification appears once this date arrives, while due &gt; 0)</span></label>
            <input className="input" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
        </div>
      </Modal>

      {/* History */}
      <Modal open={!!history} onClose={() => setHistory(null)} title={`Purchase History — ${history?.customer?.name}`} size="lg">
        {history && (
          <DataTable
            columns={[
              { key: 'invoiceNo', label: 'Invoice' },
              { key: 'createdAt', label: 'Date', render: (r) => fmtDateTime(r.createdAt) },
              { key: 'total', label: 'Total', className: 'text-right', render: (r) => taka(r.total) },
              { key: 'due', label: 'Due', className: 'text-right', render: (r) => taka(r.due) },
              { key: 'print', label: '', className: 'text-right', render: (r) => (
                <button onClick={() => setPrintSale(r)} className="btn-ghost p-1.5" title="Print invoice"><Printer size={15} /></button>
              )},
            ]}
            rows={history.sales}
            empty="No purchases yet"
          />
        )}
      </Modal>

      {/* Collect due */}
      <Modal open={!!dueModal} onClose={() => setDueModal(null)} title={`Collect Due — ${dueModal?.name}`}
        footer={<><button className="btn-ghost" onClick={() => setDueModal(null)}>Cancel</button><button className="btn-primary" onClick={collectDue}>Collect</button></>}>
        <p className="text-sm mb-2">Current due: <strong className="text-red-500">{taka(dueModal?.totalDue)}</strong></p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Amount to collect</label>
            <input className="input" type="number" value={dueAmount} onChange={(e) => setDueAmount(e.target.value)} />
          </div>
          <div>
            <label className="label">Method</label>
            <select className="input" value={dueMethod} onChange={(e) => setDueMethod(e.target.value)}>
              <option value="cash">Cash</option><option value="bank">Bank</option><option value="bkash">bKash</option>
              <option value="nagad">Nagad</option><option value="rocket">Rocket</option><option value="card">Card</option>
            </select>
          </div>
        </div>
      </Modal>

      {/* Due receipt print */}
      <PrintWrapper open={!!printDue} onClose={() => setPrintDue(null)} title="Due Receipt">
        {printDue && <DueReceipt customer={printDue.customer} amount={printDue.amount} method={printDue.method} business={business} />}
      </PrintWrapper>

      {/* Invoice reprint from history */}
      <PrintWrapper open={!!printSale} onClose={() => setPrintSale(null)} title="Invoice">
        {printSale && <ThermalReceipt sale={printSale} business={business} />}
      </PrintWrapper>
    </div>
  );
}
