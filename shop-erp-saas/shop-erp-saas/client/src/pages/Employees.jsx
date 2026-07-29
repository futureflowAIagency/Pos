import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Wallet, Pencil, Eye, Search, ChevronLeft, ChevronRight, Power, X, Upload, KeyRound, Copy, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios.js';
import { uploadImage } from '../api/upload.js';
import DataTable from '../components/ui/DataTable.jsx';
import Modal from '../components/ui/Modal.jsx';
import PrintWrapper from '../components/print/PrintWrapper.jsx';
import SalarySlip from '../components/print/SalarySlip.jsx';
import { taka, fmtDate } from '../utils/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { MODULES } from '../constants/modules.js';

const thisMonth = new Date().toISOString().slice(0, 7);
const PAGE_SIZE = 8;
const emptyLogin = { grantLogin: false, permissions: [], assignedBranch: '' };

const emptyForm = {
  photo: '', name: '', phone: '', email: '', gender: '', dob: '', designation: 'Staff',
  department: '', address: '', emergencyContact: '', monthlySalary: 0,
  joinDate: new Date().toISOString().slice(0, 10),
};

const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

// Avatar: photo if present, else initials
function Avatar({ name, photo, size = 36 }) {
  const initials = (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
  if (photo) return <img src={photo} alt={name} style={{ width: size, height: size }} className="rounded-full object-cover" />;
  return (
    <div style={{ width: size, height: size }} className="rounded-full bg-brand-100 text-brand-700 dark:bg-brand-600/30 dark:text-brand-200 flex items-center justify-center font-semibold text-xs">
      {initials}
    </div>
  );
}

export default function Employees() {
  const { business, branches } = useAuth();
  const isMobile = business?.type === 'mobile';
  const confirm = useConfirm();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [desigFilter, setDesigFilter] = useState('all');
  const [page, setPage] = useState(1);

  // modals
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [viewEmp, setViewEmp] = useState(null);
  const [salaryModal, setSalaryModal] = useState(null);
  const [salaryForm, setSalaryForm] = useState({ month: thisMonth, totalAmount: 0, amount: '', source: 'cash' });
  const [slip, setSlip] = useState(null);
  // login access (staff dashboard account) + one-time password reveal
  const [login, setLogin] = useState(emptyLogin);
  const [resetResult, setResetResult] = useState(null); // { tempPassword }
  const [resetting, setResetting] = useState(false);
  const visibleModules = MODULES.filter((m) => isMobile || !['warranty', 'installments', 'services'].includes(m.key));

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get('/employees'); setEmployees(data.data.employees); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const designations = useMemo(
    () => Array.from(new Set(employees.map((e) => e.designation).filter(Boolean))).sort(),
    [employees]
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (statusFilter === 'active' && !e.isActive) return false;
      if (statusFilter === 'inactive' && e.isActive) return false;
      if (desigFilter !== 'all' && e.designation !== desigFilter) return false;
      if (!s) return true;
      return [e.name, e.phone, e.employeeId, e.designation].some((v) => (v || '').toLowerCase().includes(s));
    });
  }, [employees, search, statusFilter, desigFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search, statusFilter, desigFilter]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Please choose an image file');
    if (file.size > 3 * 1024 * 1024) return toast.error('Image too large (max 3MB)');
    const t = toast.loading('Uploading photo...');
    try {
      const url = await uploadImage(file, 'employee'); // stored on Cloudinary
      setForm((f) => ({ ...f, photo: url }));
      toast.success('Photo uploaded', { id: t });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed', { id: t });
    }
  };

  const openNew = () => { setForm(emptyForm); setLogin(emptyLogin); setEditId(null); setModal(true); };
  const openEdit = (emp) => {
    setForm({ ...emptyForm, ...emp, dob: toDateInput(emp.dob), joinDate: toDateInput(emp.joinDate) });
    setLogin({ grantLogin: !!emp.user, permissions: emp.user?.permissions || [], assignedBranch: emp.user?.assignedBranch || '' });
    setEditId(emp._id); setModal(true);
  };

  const togglePerm = (key) => setLogin((l) => ({
    ...l, permissions: l.permissions.includes(key) ? l.permissions.filter((p) => p !== key) : [...l.permissions, key],
  }));

  const save = async () => {
    if (!form.name.trim()) return toast.error('Full name is required');
    if (!form.phone.trim()) return toast.error('Mobile number is required');
    if (login.grantLogin && !form.user && !form.email?.trim()) return toast.error('Email is required to grant login access');
    try {
      const payload = {
        ...form,
        monthlySalary: +form.monthlySalary || 0,
        dob: form.dob || undefined,
        joinDate: form.joinDate || undefined,
        grantLogin: login.grantLogin,
        permissions: login.permissions,
        assignedBranch: login.assignedBranch || null,
      };
      delete payload._id; delete payload.salaryHistory; delete payload.createdAt; delete payload.updatedAt; delete payload.user;
      const { data } = editId ? await api.put(`/employees/${editId}`, payload) : await api.post('/employees', payload);
      toast.success(editId ? 'Employee updated' : 'Employee added');
      setModal(false); load();
      if (data.data.tempPassword) setResetResult({ name: form.name, tempPassword: data.data.tempPassword });
    } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
  };

  const resetPassword = async (emp) => {
    const ok = await confirm({
      title: 'Reset this employee\'s password?',
      message: `This generates a brand-new temporary password for ${emp.name} and immediately invalidates their old one.`,
      confirmText: 'Reset Password', tone: 'danger',
    });
    if (!ok) return;
    setResetting(true);
    try {
      const { data } = await api.post(`/employees/${emp._id}/reset-password`);
      setResetResult({ name: emp.name, tempPassword: data.data.tempPassword });
    } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
    setResetting(false);
  };

  const del = async (emp) => {
    const ok = await confirm({
      title: 'Delete this employee?',
      message: `Are you sure you want to delete ${emp.name}? This action cannot be undone.`,
      confirmText: 'Delete', tone: 'danger',
    });
    if (!ok) return;
    try { await api.delete(`/employees/${emp._id}`); toast.success('Employee deleted'); load(); }
    catch (e) { toast.error(e.response?.data?.message || 'Error'); }
  };

  const toggleStatus = async (emp) => {
    const next = !emp.isActive;
    const ok = await confirm({
      title: next ? 'Activate this employee account?' : 'Deactivate this employee account?',
      message: next
        ? `Do you want to activate ${emp.name}'s account?`
        : `Do you want to deactivate ${emp.name}'s account?`,
      confirmText: next ? 'Activate' : 'Deactivate',
      tone: next ? 'success' : 'deactivate',
    });
    if (!ok) return;
    try { await api.patch(`/employees/${emp._id}/status`, { isActive: next }); toast.success(`Employee ${next ? 'activated' : 'deactivated'}`); load(); }
    catch (e) { toast.error(e.response?.data?.message || 'Error'); }
  };

  const openSalary = (emp) => {
    setSalaryModal(emp);
    const existing = emp.salaryHistory?.find((s) => s.month === thisMonth);
    setSalaryForm({ month: thisMonth, totalAmount: existing?.amount ?? emp.monthlySalary, amount: '', source: 'cash' });
  };
  // Switching the month should reflect that month's existing record (if any), not
  // carry over the previous month's total/paid figures.
  const changeSalaryMonth = (month) => {
    const existing = salaryModal.salaryHistory?.find((s) => s.month === month);
    setSalaryForm({ ...salaryForm, month, totalAmount: existing?.amount ?? salaryModal.monthlySalary, amount: '' });
  };
  const salaryEntry = salaryModal?.salaryHistory?.find((s) => s.month === salaryForm.month);
  const salaryPaidSoFar = salaryEntry?.paidAmount || 0;
  const salaryDue = Math.max(0, Number(salaryForm.totalAmount || 0) - salaryPaidSoFar);

  const paySalary = async () => {
    if (!(Number(salaryForm.amount) > 0)) return toast.error('Enter a valid payment amount');
    try {
      const { data } = await api.post(`/employees/${salaryModal._id}/salary`, {
        month: salaryForm.month, totalAmount: +salaryForm.totalAmount || 0, amount: +salaryForm.amount, source: salaryForm.source,
      });
      toast.success('Salary payment recorded');
      const rec = data.data.employee.salaryHistory.find((s) => s.month === salaryForm.month);
      setSlip({ employee: data.data.employee, record: rec });
      setSalaryModal(null); load();
    } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Employees</h1>
        <button className="btn-primary" onClick={openNew}><Plus size={18} /> Add Employee</button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={18} className="absolute left-3 top-2.5 text-slate-400" />
          <input className="input pl-10" placeholder="Search name, ID, phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input max-w-[180px]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select className="input max-w-[200px]" value={desigFilter} onChange={(e) => setDesigFilter(e.target.value)}>
          <option value="all">All Designations</option>
          {designations.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <DataTable
        columns={[
          { key: 'photo', label: '', render: (r) => <Avatar name={r.name} photo={r.photo} /> },
          { key: 'name', label: 'Name', render: (r) => (
            <div>
              <p className="font-medium flex items-center gap-1">{r.name}{r.user && <ShieldCheck size={13} className="text-brand-500" title="Has dashboard login" />}</p>
              <p className="text-xs text-slate-400">{r.email || ''}</p>
            </div>
          )},
          { key: 'employeeId', label: 'Emp ID', render: (r) => <span className="font-mono text-xs">{r.employeeId || '—'}</span> },
          { key: 'designation', label: 'Designation' },
          { key: 'phone', label: 'Phone' },
          { key: 'isActive', label: 'Status', render: (r) => (
            <span className={`badge ${r.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{r.isActive ? 'active' : 'inactive'}</span>
          )},
          { key: 'actions', label: '', className: 'text-right', render: (r) => (
            <div className="flex justify-end gap-1">
              <button onClick={() => setViewEmp(r)} className="btn-ghost p-1.5" title="View profile"><Eye size={15} /></button>
              <button onClick={() => openEdit(r)} className="btn-ghost p-1.5" title="Edit"><Pencil size={15} /></button>
              <button onClick={() => toggleStatus(r)} className={`btn-ghost p-1.5 ${r.isActive ? 'text-amber-600' : 'text-green-600'}`} title={r.isActive ? 'Deactivate' : 'Activate'}><Power size={15} /></button>
              <button onClick={() => openSalary(r)} className="btn-ghost p-1.5 text-green-600" title="Pay salary"><Wallet size={15} /></button>
              <button onClick={() => del(r)} className="btn-ghost p-1.5 text-red-500" title="Delete"><Trash2 size={15} /></button>
            </div>
          )},
        ]}
        rows={pageRows}
        empty={loading ? 'Loading...' : 'No employees found'}
      />

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
          <div className="flex items-center gap-2">
            <button className="btn-ghost p-1.5" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft size={16} /></button>
            <span>Page {page} / {totalPages}</span>
            <button className="btn-ghost p-1.5" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}><ChevronRight size={16} /></button>
          </div>
        </div>
      )}

      {/* Add / Edit */}
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Edit Employee' : 'Add Employee'} size="lg"
        footer={<><button className="btn-ghost" onClick={() => setModal(false)}>Cancel</button><button className="btn-primary" onClick={save}>Save</button></>}>
        <div className="space-y-4">
          {/* Photo */}
          <div className="flex items-center gap-4">
            <Avatar name={form.name} photo={form.photo} size={64} />
            <div className="flex gap-2">
              <label className="btn-ghost cursor-pointer">
                <Upload size={16} /> Upload Photo
                <input type="file" accept="image/*" className="hidden" onChange={onPhoto} />
              </label>
              {form.photo && <button className="btn-ghost text-red-500" onClick={() => setForm({ ...form, photo: '' })}><X size={16} /> Remove</button>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="label">Full Name *</label><input className="input" value={form.name} onChange={set('name')} /></div>
            {editId && <div className="col-span-2"><label className="label">Employee ID</label><input className="input bg-slate-50 dark:bg-slate-800 font-mono" value={form.employeeId || ''} disabled /></div>}
            <div><label className="label">Mobile Number *</label><input className="input" value={form.phone} onChange={set('phone')} /></div>
            <div><label className="label">Email (optional)</label><input className="input" type="email" value={form.email} onChange={set('email')} /></div>
            <div><label className="label">Gender</label>
              <select className="input" value={form.gender} onChange={set('gender')}>
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div><label className="label">Date of Birth</label><input className="input" type="date" value={form.dob} onChange={set('dob')} /></div>
            <div><label className="label">Joining Date</label><input className="input" type="date" value={form.joinDate} onChange={set('joinDate')} /></div>
            <div><label className="label">Designation</label><input className="input" value={form.designation} onChange={set('designation')} /></div>
            <div><label className="label">Department (optional)</label><input className="input" value={form.department} onChange={set('department')} /></div>
            <div><label className="label">Monthly Salary</label><input className="input" type="number" value={form.monthlySalary} onChange={set('monthlySalary')} /></div>
            <div><label className="label">Emergency Contact</label><input className="input" value={form.emergencyContact} onChange={set('emergencyContact')} /></div>
            <div className="col-span-2"><label className="label">Address</label><input className="input" value={form.address} onChange={set('address')} /></div>
          </div>

          {/* Login Access — controls whether this employee has a dashboard login,
              and exactly which sections they can see. Not every employee needs one. */}
          <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
            <h4 className="font-semibold text-sm text-slate-500 uppercase tracking-wide mb-2">Login Access</h4>
            {login.grantLogin && form.user ? (
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="text-sm">Login: <strong>{form.user.email}</strong> <span className={`badge ml-1 ${form.user.isActive !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{form.user.isActive !== false ? 'active' : 'inactive'}</span></p>
                <button type="button" className="btn-ghost text-xs" disabled={resetting} onClick={() => resetPassword(form)}><KeyRound size={13} className="inline mr-1" /> Reset Password</button>
              </div>
            ) : (
              <label className="flex items-center gap-2 mb-3 cursor-pointer">
                <input type="checkbox" checked={login.grantLogin} onChange={(e) => setLogin({ ...login, grantLogin: e.target.checked })} />
                <span className="text-sm">Give this employee a dashboard login (uses the email above)</span>
              </label>
            )}
            {(login.grantLogin || form.user) && (
              <div className="space-y-3">
                <p className="text-xs text-slate-400 mb-2">Tick the sections this employee is allowed to see. You can change this anytime.</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {visibleModules.map((m) => (
                    <label key={m.key} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={login.permissions.includes(m.key)} onChange={() => togglePerm(m.key)} />
                      {m.label}
                    </label>
                  ))}
                </div>
                {branches.length > 1 && (
                  <div>
                    <label className="label">Restrict to branch (optional)</label>
                    <select className="input" value={login.assignedBranch} onChange={(e) => setLogin({ ...login, assignedBranch: e.target.value })}>
                      <option value="">— Any branch (can switch) —</option>
                      {branches.filter((b) => b.isActive).map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
                    </select>
                    <p className="text-xs text-slate-400 mt-1">Locks this login to one branch — they won't see or be able to switch to any other branch's data.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Profile View */}
      <Modal open={!!viewEmp} onClose={() => setViewEmp(null)} title="Employee Profile" size="lg">
        {viewEmp && (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <Avatar name={viewEmp.name} photo={viewEmp.photo} size={72} />
              <div>
                <h3 className="text-lg font-bold">{viewEmp.name}</h3>
                <p className="text-slate-500">{viewEmp.designation}{viewEmp.department ? ` · ${viewEmp.department}` : ''}</p>
                <span className={`badge mt-1 ${viewEmp.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{viewEmp.isActive ? 'active' : 'inactive'}</span>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-sm text-slate-500 uppercase tracking-wide mb-2">Personal Information</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <Info label="Employee ID" value={viewEmp.employeeId} mono />
                <Info label="Mobile" value={viewEmp.phone} />
                <Info label="Email" value={viewEmp.email} />
                <Info label="Gender" value={viewEmp.gender} cap />
                <Info label="Date of Birth" value={viewEmp.dob ? fmtDate(viewEmp.dob) : ''} />
                <Info label="Emergency Contact" value={viewEmp.emergencyContact} />
                <Info label="Address" value={viewEmp.address} full />
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-sm text-slate-500 uppercase tracking-wide mb-2">Employment Information</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <Info label="Designation" value={viewEmp.designation} />
                <Info label="Department" value={viewEmp.department} />
                <Info label="Monthly Salary" value={taka(viewEmp.monthlySalary)} />
                <Info label="Status" value={viewEmp.isActive ? 'Active' : 'Inactive'} />
                <Info label="Joining Date" value={fmtDate(viewEmp.joinDate)} />
                <Info label="Account Created" value={fmtDate(viewEmp.createdAt)} />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-ghost" onClick={() => { const e = viewEmp; setViewEmp(null); openEdit(e); }}><Pencil size={16} /> Edit</button>
              <button className="btn-ghost text-green-600" onClick={() => { const e = viewEmp; setViewEmp(null); openSalary(e); }}><Wallet size={16} /> Pay Salary</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Pay salary — supports partial payment (e.g. salary 20,000, pay 10,000 now,
          settle the rest later by opening this again for the same month) */}
      <Modal open={!!salaryModal} onClose={() => setSalaryModal(null)} title={`Pay Salary — ${salaryModal?.name}`}
        footer={<><button className="btn-ghost" onClick={() => setSalaryModal(null)}>Cancel</button><button className="btn-primary" onClick={paySalary}>Record Payment</button></>}>
        <div className="space-y-3">
          <div><label className="label">Month</label><input className="input" type="month" value={salaryForm.month} onChange={(e) => changeSalaryMonth(e.target.value)} /></div>
          <div><label className="label">Total Salary for this Month</label><input className="input" type="number" value={salaryForm.totalAmount} onChange={(e) => setSalaryForm({ ...salaryForm, totalAmount: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-2"><p className="text-xs text-slate-400">Paid so far</p><p className="font-semibold text-green-600">{taka(salaryPaidSoFar)}</p></div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-2"><p className="text-xs text-slate-400">Due</p><p className="font-semibold text-red-500">{taka(salaryDue)}</p></div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="label mb-0">Amount to Pay Now</label>
              <button type="button" className="text-xs text-brand-600" onClick={() => setSalaryForm({ ...salaryForm, amount: String(salaryDue) })}>Pay full due</button>
            </div>
            <input className="input" type="number" value={salaryForm.amount} onChange={(e) => setSalaryForm({ ...salaryForm, amount: e.target.value })} placeholder={String(salaryDue)} />
          </div>
          <div><label className="label">Paid From</label>
            <select className="input" value={salaryForm.source} onChange={(e) => setSalaryForm({ ...salaryForm, source: e.target.value })}>
              <option value="cash">Cash</option><option value="bank">Bank</option><option value="bkash">bKash</option>
              <option value="nagad">Nagad</option><option value="rocket">Rocket</option><option value="card">Card</option>
            </select>
          </div>
          <p className="text-xs text-slate-400">Each payment is booked as its own expense (category "Salary") — pay in parts and settle the rest anytime later.</p>
        </div>
      </Modal>

      <PrintWrapper open={!!slip} onClose={() => setSlip(null)} title="Salary Slip">
        {slip && <SalarySlip employee={slip.employee} record={slip.record} business={business} />}
      </PrintWrapper>

      {/* One-time login/reset password reveal — closing this loses it forever, by design */}
      <Modal open={!!resetResult} onClose={() => setResetResult(null)} title="Temporary Password Generated"
        footer={<button className="btn-primary" onClick={() => setResetResult(null)}>Done</button>}>
        {resetResult && (
          <div className="space-y-3">
            <p className="text-sm">Login password for <strong>{resetResult.name}</strong>:</p>
            <div className="flex items-center gap-2">
              <code className="input font-mono text-lg tracking-wider flex-1 select-all">{resetResult.tempPassword}</code>
              <button className="btn-ghost p-2" title="Copy" onClick={() => { navigator.clipboard.writeText(resetResult.tempPassword); toast.success('Copied'); }}><Copy size={16} /></button>
            </div>
            <p className="text-xs text-red-500">This is shown only once and cannot be retrieved again — share it with the employee now.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Info({ label, value, full, mono, cap }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`${mono ? 'font-mono' : ''} ${cap ? 'capitalize' : ''}`}>{value || '—'}</p>
    </div>
  );
}
