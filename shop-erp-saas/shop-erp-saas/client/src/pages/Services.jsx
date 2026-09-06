import { useEffect, useState } from 'react';
import { Plus, Wrench, Trash2, Search, Printer, HandCoins } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios.js';
import DataTable from '../components/ui/DataTable.jsx';
import Modal from '../components/ui/Modal.jsx';
import PrintWrapper from '../components/print/PrintWrapper.jsx';
import ServiceThermal from '../components/print/ServiceThermal.jsx';
import ServiceDueReceipt from '../components/print/ServiceDueReceipt.jsx';
import { taka, fmtDateTime } from '../utils/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';

const STATUSES = ['pending', 'repairing', 'completed', 'delivered'];
const STATUS_BADGE = {
  pending: 'bg-slate-200 text-slate-700',
  repairing: 'bg-amber-100 text-amber-700',
  completed: 'bg-blue-100 text-blue-700',
  delivered: 'bg-green-100 text-green-700',
};
const empty = { customerName: '', customerPhone: '', deviceModel: '', imei: '', problem: '', technician: '', serviceFee: 0, partsCost: 0, technicianCost: 0, paid: 0, paymentMethod: 'cash' };

export default function Services() {
  const confirm = useConfirm();
  const { business } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  // customer service invoice to print / reprint (unlimited times)
  const [printJob, setPrintJob] = useState(null);
  // collect due — the job being paid down + the amount/method form + the
  // resulting due receipt to print
  const [dueModal, setDueModal] = useState(null);
  const [dueAmount, setDueAmount] = useState('');
  const [dueMethod, setDueMethod] = useState('cash');
  const [dueReceipt, setDueReceipt] = useState(null);

  const load = async () => {
    const { data } = await api.get('/services', { params: { search, status: statusFilter || undefined } });
    setJobs(data.data.jobs);
  };
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [search, statusFilter]);

  const openNew = () => { setForm(empty); setEditId(null); setModal(true); };
  const openEdit = (j) => {
    setForm({
      customerName: j.customerName, customerPhone: j.customerPhone || '', deviceModel: j.deviceModel || '',
      imei: j.imei || '', problem: j.problem || '', technician: j.technician || '',
      serviceFee: j.serviceFee || 0, partsCost: j.partsCost || 0, technicianCost: j.technicianCost || 0,
      paid: j.paid || 0, paymentMethod: j.paymentMethod || 'cash',
    });
    setEditId(j._id); setModal(true);
  };

  const save = async () => {
    if (!form.customerName.trim()) return toast.error('Customer name is required');
    if (!form.deviceModel.trim()) return toast.error('Device model is required');
    const payload = {
      ...form,
      serviceFee: +form.serviceFee || 0, partsCost: +form.partsCost || 0,
      technicianCost: +form.technicianCost || 0, paid: +form.paid || 0,
    };
    try {
      const { data } = editId
        ? await api.put(`/services/${editId}`, payload)
        : await api.post('/services', payload);
      toast.success('Saved'); setModal(false); load();
      if (data?.data?.job) setPrintJob(data.data.job);
    } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
  };

  const openDue = (j) => { setDueModal(j); setDueAmount(''); setDueMethod('cash'); };
  const collectDue = async () => {
    if (!(Number(dueAmount) > 0)) return toast.error('Enter a valid amount');
    try {
      const { data } = await api.post(`/services/${dueModal._id}/collect-due`, { amount: Number(dueAmount), method: dueMethod });
      toast.success('Due collected');
      setDueReceipt({ job: data.data.job, amount: Number(dueAmount), method: dueMethod });
      setDueModal(null); load();
    } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
  };

  const changeStatus = async (j, status) => {
    try { await api.patch(`/services/${j._id}/status`, { status }); load(); }
    catch (e) { toast.error(e.response?.data?.message || 'Error'); }
  };

  const del = async (j) => {
    const ok = await confirm({ title: 'Delete job sheet?', message: `Delete job ${j.jobNo}?`, confirmText: 'Delete', tone: 'danger' });
    if (!ok) return;
    await api.delete(`/services/${j._id}`); toast.success('Deleted'); load();
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  // customer bill = service charge only; parts/technician cost are internal (profit calc)
  const total = +form.serviceFee || 0;
  const profit = total - (+form.partsCost || 0) - (+form.technicianCost || 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Wrench size={24} /> Service / Repair</h1>
        <button className="btn-primary" onClick={openNew}><Plus size={18} /> New Job Sheet</button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative max-w-sm flex-1">
          <Search size={18} className="absolute left-3 top-2.5 text-slate-400" />
          <input className="input pl-10" placeholder="Search by job no, customer, device..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input max-w-[180px]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
        </select>
      </div>

      <DataTable
        columns={[
          { key: 'jobNo', label: 'Job No' },
          { key: 'customerName', label: 'Customer', render: (r) => (
            <div><span className="font-medium">{r.customerName}</span>{r.customerPhone && <div className="text-xs text-slate-400">{r.customerPhone}</div>}</div>
          )},
          { key: 'deviceModel', label: 'Device', render: (r) => (
            <div>{r.deviceModel}{r.problem && <div className="text-xs text-slate-400 truncate max-w-[180px]">{r.problem}</div>}</div>
          )},
          { key: 'technician', label: 'Technician', render: (r) => r.technician || '—' },
          { key: 'total', label: 'Bill', className: 'text-right', render: (r) => taka(r.total) },
          { key: 'due', label: 'Due', className: 'text-right', render: (r) => {
            const due = Math.max(0, (r.total || 0) - (r.paid || 0));
            return due > 0 ? <span className="text-red-500 font-semibold">{taka(due)}</span> : <span className="text-green-600">Paid</span>;
          } },
          { key: 'status', label: 'Status', render: (r) => (
            <select className={`badge border-0 ${STATUS_BADGE[r.status]} capitalize cursor-pointer`} value={r.status} onChange={(e) => changeStatus(r, e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )},
          { key: 'actions', label: '', className: 'text-right', render: (r) => (
            <div className="flex justify-end gap-1">
              <button className="btn-ghost p-1.5" title="Print invoice" onClick={() => setPrintJob(r)}><Printer size={15} /></button>
              <button
                className="btn-ghost p-1.5 text-green-600" title="Collect due"
                disabled={(r.total || 0) - (r.paid || 0) <= 0}
                onClick={() => openDue(r)}
              ><HandCoins size={15} /></button>
              <button className="btn-ghost text-xs" onClick={() => openEdit(r)}>Edit</button>
              <button className="btn-ghost p-1.5 text-red-500" onClick={() => del(r)}><Trash2 size={15} /></button>
            </div>
          )},
        ]}
        rows={jobs}
        empty="No service jobs yet"
      />

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Edit Job Sheet' : 'New Job Sheet'} size="lg"
        footer={<><button className="btn-ghost" onClick={() => setModal(false)}>Cancel</button><button className="btn-primary" onClick={save}>Save</button></>}>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Customer Name</label><input className="input" value={form.customerName} onChange={set('customerName')} /></div>
          <div><label className="label">Customer Phone</label><input className="input" value={form.customerPhone} onChange={set('customerPhone')} /></div>
          <div><label className="label">Device Model</label><input className="input" value={form.deviceModel} onChange={set('deviceModel')} /></div>
          <div><label className="label">IMEI / Serial</label><input className="input" value={form.imei} onChange={set('imei')} /></div>
          <div className="col-span-2"><label className="label">Problem / Fault</label><input className="input" value={form.problem} onChange={set('problem')} /></div>
          <div className="col-span-2"><label className="label">Technician</label><input className="input" value={form.technician} onChange={set('technician')} /></div>

          <div className="col-span-2"><label className="label">Service Charge <span className="text-xs text-slate-400 font-normal">(what the customer is billed — shown on their invoice)</span></label><input className="input" type="number" value={form.serviceFee} onChange={set('serviceFee')} /></div>

          <div className="col-span-2 grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
            <p className="col-span-2 text-xs text-slate-500">Internal costs — never shown to the customer, used only to compute your profit.</p>
            <div><label className="label">Parts Cost</label><input className="input" type="number" value={form.partsCost} onChange={set('partsCost')} /></div>
            <div><label className="label">Technician Cost</label><input className="input" type="number" value={form.technicianCost} onChange={set('technicianCost')} /></div>
          </div>

          <div>
            <label className="label">Paid {editId && <span className="text-xs text-slate-400 font-normal">(at creation — use "Collect Due" in the list for later payments)</span>}</label>
            <input className="input" type="number" value={form.paid} onChange={set('paid')} />
          </div>
          <div><label className="label">Payment Method</label>
            <select className="input" value={form.paymentMethod} onChange={set('paymentMethod')}>
              <option value="cash">Cash</option><option value="bank">Bank</option><option value="bkash">bKash</option>
              <option value="nagad">Nagad</option><option value="rocket">Rocket</option><option value="card">Card</option>
            </select>
          </div>
          <div className="flex flex-col justify-end">
            <span className="label">Customer Total Bill</span>
            <div className="input bg-slate-50 dark:bg-slate-800 flex items-center font-semibold">{taka(total)}</div>
          </div>
          <div className="flex flex-col justify-end">
            <span className="label">Your Profit (internal)</span>
            <div className={`input bg-slate-50 dark:bg-slate-800 flex items-center font-semibold ${profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>{taka(profit)}</div>
          </div>
        </div>
      </Modal>

      {/* Collect due */}
      <Modal open={!!dueModal} onClose={() => setDueModal(null)} title={`Collect Due — ${dueModal?.jobNo}`}
        footer={<><button className="btn-ghost" onClick={() => setDueModal(null)}>Cancel</button><button className="btn-primary" onClick={collectDue}>Collect</button></>}>
        <p className="text-sm mb-2">
          Current due: <strong className="text-red-500">{taka(Math.max(0, (dueModal?.total || 0) - (dueModal?.paid || 0)))}</strong>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between">
              <label className="label mb-0">Amount to collect</label>
              <button type="button" className="text-xs text-brand-600" onClick={() => setDueAmount(String(Math.max(0, (dueModal?.total || 0) - (dueModal?.paid || 0))))}>Pay full due</button>
            </div>
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

      {/* Customer service invoice — print / reprint */}
      <PrintWrapper open={!!printJob} onClose={() => setPrintJob(null)} title="Service Invoice">
        {printJob && <ServiceThermal job={printJob} business={business} />}
      </PrintWrapper>

      {/* Due payment receipt */}
      <PrintWrapper open={!!dueReceipt} onClose={() => setDueReceipt(null)} title="Due Receipt">
        {dueReceipt && <ServiceDueReceipt job={dueReceipt.job} amount={dueReceipt.amount} method={dueReceipt.method} business={business} />}
      </PrintWrapper>
    </div>
  );
}
