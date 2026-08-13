import { useEffect, useState } from 'react';
import { Building2, Users, Clock, BadgeCheck, Check, X, UserPlus, KeyRound, Copy, Trash2, AlertTriangle, Store } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios.js';
import StatCard from '../../components/ui/StatCard.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { taka, fmtDate, fmtDateTime } from '../../utils/format.js';
import { useConfirm } from '../../context/ConfirmContext.jsx';

const PLAN_LABELS = { monthly: 'Monthly', half_yearly: 'Half-Yearly', yearly: 'Yearly', custom: 'Custom' };
const planLabel = (p) => PLAN_LABELS[p] || p;
const emptyOwner = { name: '', email: '', phone: '', password: '', businessName: '', businessType: 'general' };
const emptyPlan = { enabled: false, label: 'Custom Plan', price: '', days: 30 };

export default function AdminPanel() {
  const confirm = useConfirm();
  const [overview, setOverview] = useState(null);
  const [payments, setPayments] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [tab, setTab] = useState('payments');
  const [ownerModal, setOwnerModal] = useState(false);
  const [ownerForm, setOwnerForm] = useState(emptyOwner);
  const [saving, setSaving] = useState(false);
  const [planBiz, setPlanBiz] = useState(null);
  const [planForm, setPlanForm] = useState(emptyPlan);
  const [savingPlan, setSavingPlan] = useState(false);
  const [resetResult, setResetResult] = useState(null); // { ownerName, tempPassword } — shown once
  const [resetting, setResetting] = useState(false);
  // permanent user/shop deletion — the name must be typed to arm the button
  const [deleteBiz, setDeleteBiz] = useState(null);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    const [o, p, b] = await Promise.all([
      api.get('/admin/overview'),
      api.get('/admin/payments?status=pending'),
      api.get('/admin/businesses'),
    ]);
    setOverview(o.data.data.overview);
    setPayments(p.data.data.payments);
    setBusinesses(b.data.data.businesses);
  };
  useEffect(() => { load(); }, []);

  const review = async (r, action) => {
    const ok = await confirm({
      title: action === 'approve' ? 'Approve this payment?' : 'Reject this payment?',
      message: action === 'approve'
        ? `Approve the ${planLabel(r.plan)} payment of ${taka(r.amount)} for ${r.business?.name || 'this business'}? The subscription will be extended.`
        : `Reject the payment of ${taka(r.amount)} for ${r.business?.name || 'this business'}?`,
      confirmText: action === 'approve' ? 'Approve' : 'Reject',
      tone: action === 'approve' ? 'success' : 'danger',
    });
    if (!ok) return;
    let note = '';
    if (action === 'reject') { note = prompt('Reject reason (optional):') || ''; }
    try {
      await api.patch(`/admin/payments/${r._id}`, { action, note });
      toast.success(`Payment ${action}d`);
      load();
    } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
  };

  const toggleOwner = async (r) => {
    const isActive = r.owner?.isActive !== false;
    const ok = await confirm({
      title: isActive ? 'Deactivate this owner account?' : 'Activate this owner account?',
      message: isActive
        ? `Do you want to deactivate ${r.owner?.name || 'this owner'}? They will not be able to log in until reactivated.`
        : `Do you want to activate ${r.owner?.name || 'this owner'}? They will be able to log in again.`,
      confirmText: isActive ? 'Deactivate' : 'Activate',
      tone: isActive ? 'deactivate' : 'success',
    });
    if (!ok) return;
    try { await api.patch(`/admin/businesses/${r._id}/toggle`); toast.success('Owner status updated'); load(); }
    catch (e) { toast.error(e.response?.data?.message || 'Error'); }
  };

  // Passwords are one-way hashed and never stored/viewable — the only way to help a
  // locked-out owner is to issue a brand-new temporary password, shown here exactly once.
  const resetPassword = async (r) => {
    const ok = await confirm({
      title: 'Reset this owner\'s password?',
      message: `This generates a brand-new temporary password for ${r.owner?.name || 'this owner'} and immediately invalidates their old one. You'll need to share the new password with them yourself.`,
      confirmText: 'Reset Password',
      tone: 'danger',
    });
    if (!ok) return;
    setResetting(true);
    try {
      const { data } = await api.post(`/admin/businesses/${r._id}/reset-password`);
      setResetResult({ ownerName: r.owner?.name || 'Owner', tempPassword: data.data.tempPassword });
    } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
    setResetting(false);
  };

  // Deletion is irreversible and takes the shop's whole dataset with it, so the
  // superadmin has to type the business name — a plain confirm is too easy to
  // click through. Deactivate stays the reversible option.
  const runDelete = async () => {
    if (!deleteBiz) return;
    if (deleteText.trim() !== deleteBiz.name) return toast.error('Type the business name exactly to confirm');
    setDeleting(true);
    try {
      await api.delete(`/admin/businesses/${deleteBiz._id}`);
      toast.success(`${deleteBiz.name} deleted`);
      setDeleteBiz(null); setDeleteText(''); load();
    } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
    setDeleting(false);
  };

  const createOwner = async () => {
    if (!ownerForm.name || !ownerForm.email || !ownerForm.password || !ownerForm.businessName)
      return toast.error('Name, email, password and shop name are required');
    setSaving(true);
    try {
      await api.post('/admin/owners', ownerForm);
      toast.success('Owner account created');
      setOwnerModal(false); setOwnerForm(emptyOwner); load();
    } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
    setSaving(false);
  };

  const openPlan = (r) => {
    const cp = r.customPlan || {};
    setPlanBiz(r);
    setPlanForm({
      enabled: !!cp.enabled,
      label: cp.label || 'Custom Plan',
      price: cp.enabled ? cp.price ?? '' : '',
      days: cp.enabled ? cp.days ?? 30 : 30,
    });
  };

  const savePlan = async () => {
    if (planForm.enabled) {
      if (planForm.price === '' || Number(planForm.price) < 0) return toast.error('Valid price required');
      if (!(Number(planForm.days) > 0)) return toast.error('Valid duration (days) required');
    }
    setSavingPlan(true);
    try {
      await api.patch(`/admin/businesses/${planBiz._id}/plan`, {
        enabled: planForm.enabled,
        label: planForm.label,
        price: Number(planForm.price) || 0,
        days: Number(planForm.days) || 30,
      });
      toast.success('Custom price updated');
      setPlanBiz(null); load();
    } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
    setSavingPlan(false);
  };

  const setO = (k) => (e) => setOwnerForm({ ...ownerForm, [k]: e.target.value });
  const setP = (k) => (e) => setPlanForm({ ...planForm, [k]: e.target.value });

  if (!overview) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2"><BadgeCheck size={24} /> Admin Panel</h1>
        <button className="btn-primary" onClick={() => { setOwnerForm(emptyOwner); setOwnerModal(true); }}><UserPlus size={18} /> Create Owner</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <StatCard icon={Building2} label="Businesses" value={overview.businesses} accent="brand" />
        <StatCard icon={Users} label="Owners" value={overview.owners} accent="green" />
        <StatCard icon={Clock} label="Pending Payments" value={overview.pendingPayments} accent="amber" />
        <StatCard icon={BadgeCheck} label="Active Subscriptions" value={overview.activeSubs} accent="green" />
        <StatCard icon={Store} label="Shops With Branches" value={overview.shopsWithBranches} accent="brand" />
      </div>

      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
        <button className={`px-4 py-2 -mb-px border-b-2 ${tab === 'payments' ? 'border-brand-500 text-brand-600 font-medium' : 'border-transparent text-slate-500'}`} onClick={() => setTab('payments')}>Pending Payments</button>
        <button className={`px-4 py-2 -mb-px border-b-2 ${tab === 'businesses' ? 'border-brand-500 text-brand-600 font-medium' : 'border-transparent text-slate-500'}`} onClick={() => setTab('businesses')}>Businesses</button>
      </div>

      {tab === 'payments' ? (
        <div className="card p-4">
          <DataTable
            columns={[
              { key: 'createdAt', label: 'Date', render: (r) => fmtDateTime(r.createdAt) },
              { key: 'business', label: 'Business', render: (r) => r.business?.name || '—' },
              { key: 'submittedBy', label: 'By', render: (r) => r.submittedBy?.name || '—' },
              { key: 'plan', label: 'Plan', render: (r) => planLabel(r.plan) },
              { key: 'amount', label: 'Amount', className: 'text-right', render: (r) => taka(r.amount) },
              { key: 'method', label: 'Method', className: 'capitalize' },
              { key: 'trxId', label: 'TRX ID' },
              { key: 'actions', label: '', className: 'text-right', render: (r) => (
                <div className="flex justify-end gap-1">
                  <button onClick={() => review(r, 'approve')} className="btn-ghost p-1.5 text-green-600" title="Approve"><Check size={16} /></button>
                  <button onClick={() => review(r, 'reject')} className="btn-ghost p-1.5 text-red-500" title="Reject"><X size={16} /></button>
                </div>
              )},
            ]}
            rows={payments}
            empty="No pending payments 🎉"
          />
        </div>
      ) : (
        <div className="card p-4">
          <DataTable
            columns={[
              { key: 'name', label: 'Business' },
              { key: 'type', label: 'Type', className: 'capitalize' },
              { key: 'owner', label: 'Owner', render: (r) => r.owner?.name || '—' },
              { key: 'owner_email', label: 'Email', render: (r) => r.owner?.email || '—' },
              { key: 'owner_status', label: 'Owner', render: (r) => (
                <span className={`badge ${r.owner?.isActive !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{r.owner?.isActive !== false ? 'active' : 'inactive'}</span>
              )},
              { key: 'subscriptionStatus', label: 'Subscription', render: (r) => (
                <span className={`badge ${r.subscriptionStatus === 'active' ? 'bg-green-100 text-green-700' : r.subscriptionStatus === 'expired' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{r.subscriptionStatus}</span>
              )},
              { key: 'subscriptionExpiry', label: 'Expiry', render: (r) => fmtDate(r.subscriptionExpiry) },
              { key: 'branches', label: 'Branches', render: (r) => (
                r.hasExtraBranches
                  ? <span className="badge bg-brand-100 text-brand-700" title={(r.branches || []).map((b) => b.name).join(', ')}>{r.branchCount} branches</span>
                  : <span className="text-slate-400 text-xs">Main only</span>
              )},
              { key: 'price', label: 'Price', render: (r) => (
                r.customPlan?.enabled
                  ? <span title={`${r.customPlan.label} • ${r.customPlan.days} days`}>{taka(r.customPlan.price)} <span className="text-slate-400">/ {r.customPlan.days}d</span></span>
                  : <span className="text-slate-400">Default</span>
              )},
              { key: 'actions', label: '', className: 'text-right', render: (r) => (
                <div className="flex justify-end gap-1">
                  <button onClick={() => openPlan(r)} className="btn-ghost text-xs">Set Price</button>
                  <button onClick={() => toggleOwner(r)} className="btn-ghost text-xs">{r.owner?.isActive !== false ? 'Deactivate' : 'Activate'}</button>
                  <button onClick={() => resetPassword(r)} disabled={resetting} className="btn-ghost text-xs" title="Issue a new temporary password"><KeyRound size={13} className="inline mr-1" />Reset Password</button>
                  <button onClick={() => { setDeleteBiz(r); setDeleteText(''); }} className="btn-ghost text-xs text-red-500" title="Delete this user and shop permanently"><Trash2 size={13} className="inline mr-1" />Delete</button>
                </div>
              )},
            ]}
            rows={businesses}
            empty="No businesses yet"
          />
        </div>
      )}

      {/* Create Owner */}
      <Modal open={ownerModal} onClose={() => setOwnerModal(false)} title="Create Owner Account"
        footer={<><button className="btn-ghost" onClick={() => setOwnerModal(false)}>Cancel</button><button className="btn-primary" disabled={saving} onClick={createOwner}>{saving ? 'Creating...' : 'Create Owner'}</button></>}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className="label">Owner Name</label><input className="input" value={ownerForm.name} onChange={setO('name')} /></div>
          <div><label className="label">Email</label><input className="input" type="email" value={ownerForm.email} onChange={setO('email')} /></div>
          <div><label className="label">Phone</label><input className="input" value={ownerForm.phone} onChange={setO('phone')} /></div>
          <div><label className="label">Password</label><input className="input" type="password" value={ownerForm.password} onChange={setO('password')} /></div>
          <div><label className="label">Shop / Business Name</label><input className="input" value={ownerForm.businessName} onChange={setO('businessName')} /></div>
          <div className="col-span-2">
            <label className="label">Business Type</label>
            <select className="input" value={ownerForm.businessType} onChange={setO('businessType')}>
              <option value="general">General Shop</option>
              <option value="pharmacy">Pharmacy</option>
              <option value="mobile">Technology Management System</option>
            </select>
          </div>
        </div>
      </Modal>

      {/* Delete user + shop (permanent) */}
      <Modal open={!!deleteBiz} onClose={() => { setDeleteBiz(null); setDeleteText(''); }} title="Delete user & shop"
        footer={<>
          <button className="btn-ghost" onClick={() => { setDeleteBiz(null); setDeleteText(''); }}>Cancel</button>
          <button
            className="btn-primary !bg-red-600 hover:!bg-red-700 disabled:opacity-50"
            disabled={deleting || deleteText.trim() !== (deleteBiz?.name || '')}
            onClick={runDelete}
          >{deleting ? 'Deleting...' : 'Delete permanently'}</button>
        </>}>
        <div className="space-y-3 text-sm">
          <p className="flex items-start gap-2 text-red-600">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <span>
              This permanently deletes <b>{deleteBiz?.owner?.name || 'the owner'}</b> ({deleteBiz?.owner?.email || 'no email'}),
              any staff logins under this shop, and <b>{deleteBiz?.name}</b> with all of its data — products, sales, customers,
              suppliers, dues and reports. It cannot be undone.
            </span>
          </p>
          <p className="text-slate-500">
            To block the login without losing anything, use <b>Deactivate</b> instead.
          </p>
          <div>
            <label className="label">Type <b>{deleteBiz?.name}</b> to confirm</label>
            <input className="input" value={deleteText} autoFocus
              onChange={(e) => setDeleteText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && deleteText.trim() === deleteBiz?.name) runDelete(); }}
              placeholder={deleteBiz?.name} />
          </div>
        </div>
      </Modal>

      {/* Set Custom Price */}
      <Modal open={!!planBiz} onClose={() => setPlanBiz(null)} title={`Custom Price — ${planBiz?.name || ''}`}
        footer={<><button className="btn-ghost" onClick={() => setPlanBiz(null)}>Cancel</button><button className="btn-primary" disabled={savingPlan} onClick={savePlan}>{savingPlan ? 'Saving...' : 'Save'}</button></>}>
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={planForm.enabled} onChange={(e) => setPlanForm({ ...planForm, enabled: e.target.checked })} />
            <span className="text-sm">Enable custom price for this shop</span>
          </label>
          {planForm.enabled ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="label">Plan Name</label><input className="input" value={planForm.label} onChange={setP('label')} placeholder="e.g. Yearly" /></div>
              <div><label className="label">Price (৳)</label><input className="input" type="number" min="0" value={planForm.price} onChange={setP('price')} placeholder="e.g. 3000" /></div>
              <div><label className="label">Duration (days)</label><input className="input" type="number" min="1" value={planForm.days} onChange={setP('days')} placeholder="e.g. 365" /></div>
              <p className="col-span-2 text-xs text-slate-500">This shop will see only this plan on its Subscription page.</p>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Custom price off — this shop sees the default plans (৳500 / ৳2,500 / ৳4,500).</p>
          )}
        </div>
      </Modal>
      {/* One-time temp password reveal — closing this loses it forever, by design */}
      <Modal open={!!resetResult} onClose={() => setResetResult(null)} title="Temporary Password Generated"
        footer={<button className="btn-primary" onClick={() => setResetResult(null)}>Done</button>}>
        {resetResult && (
          <div className="space-y-3">
            <p className="text-sm">New password for <strong>{resetResult.ownerName}</strong>:</p>
            <div className="flex items-center gap-2">
              <code className="input font-mono text-lg tracking-wider flex-1 select-all">{resetResult.tempPassword}</code>
              <button
                className="btn-ghost p-2"
                title="Copy"
                onClick={() => { navigator.clipboard.writeText(resetResult.tempPassword); toast.success('Copied'); }}
              ><Copy size={16} /></button>
            </div>
            <p className="text-xs text-red-500">This is shown only once and cannot be retrieved again — share it with the owner now (they can change it afterwards from Settings).</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
