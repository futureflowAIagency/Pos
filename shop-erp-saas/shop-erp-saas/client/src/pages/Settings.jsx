import { useEffect, useState } from 'react';
import { Save, Moon, Sun, ImagePlus, Trash2, KeyRound, Landmark, Plus, Pencil, Ban } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios.js';
import { uploadImage } from '../api/upload.js';
import Spinner from '../components/ui/Spinner.jsx';
import Modal from '../components/ui/Modal.jsx';
import DataTable from '../components/ui/DataTable.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';

const ACCOUNT_METHODS = ['bank', 'bkash', 'nagad', 'rocket', 'card'];
const METHOD_LABEL = { bank: 'Bank', bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket', card: 'Card' };

export default function Settings() {
  const { business, refresh, user } = useAuth();
  // Managing the shop's payment accounts is owner-level (same reasoning as
  // Branches) — a staff login with the 'settings' module can still view this
  // page, but shouldn't get write actions the server would 403 anyway.
  const canManageAccounts = ['owner', 'superadmin'].includes(user?.role);
  const { theme, toggleTheme } = useTheme();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  // ---- Change password (current password + new password) ----
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  const changePw = async () => {
    if (!currentPw) return toast.error('Enter your current password');
    if (newPw.length < 6) return toast.error('Password must be at least 6 characters');
    if (newPw !== confirmPw) return toast.error('Passwords do not match');
    setPwBusy(true);
    try {
      await api.post('/auth/password/change', { currentPassword: currentPw, newPassword: newPw });
      toast.success('Password changed successfully');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
    setPwBusy(false);
  };

  // ---- Payment Accounts — the shop's named bank/bKash/Nagad/Rocket/card
  // sub-accounts (e.g. 5-10 real bank accounts). Referenced by id from POS
  // payments, Fund, Transfer, Expense and Collect Due wherever that method is
  // chosen, so both the invoice and the Finance balance breakdown can say
  // exactly WHICH account the money moved through. ----
  const emptyAccount = { method: 'bank', name: '', accountNumber: '', note: '' };
  const confirm = useConfirm();
  const [accounts, setAccounts] = useState([]);
  const [accountModal, setAccountModal] = useState(false);
  const [accountForm, setAccountForm] = useState(emptyAccount);
  const [editAccountId, setEditAccountId] = useState(null);
  const [accountSaving, setAccountSaving] = useState(false);

  const loadAccounts = async () => {
    const { data } = await api.get('/payment-accounts');
    setAccounts(data.data.accounts);
  };
  useEffect(() => { loadAccounts(); }, []);

  const openNewAccount = () => { setAccountForm(emptyAccount); setEditAccountId(null); setAccountModal(true); };
  const openEditAccount = (a) => {
    setAccountForm({ method: a.method, name: a.name, accountNumber: a.accountNumber || '', note: a.note || '' });
    setEditAccountId(a._id); setAccountModal(true);
  };
  const saveAccount = async () => {
    if (!accountForm.name.trim()) return toast.error('Account name is required');
    setAccountSaving(true);
    try {
      if (editAccountId) await api.put(`/payment-accounts/${editAccountId}`, accountForm);
      else await api.post('/payment-accounts', accountForm);
      toast.success('Saved'); setAccountModal(false); loadAccounts();
    } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
    setAccountSaving(false);
  };
  const toggleAccount = async (a) => {
    if (a.isActive) {
      const yes = await confirm({
        title: 'Deactivate account?',
        message: `"${a.name}" will no longer be selectable for new payments — it can be re-activated anytime, and past records that already reference it are unaffected.`,
        confirmText: 'Deactivate', tone: 'danger',
      });
      if (!yes) return;
    }
    await api.patch(`/payment-accounts/${a._id}/toggle`); toast.success(a.isActive ? 'Deactivated' : 'Activated'); loadAccounts();
  };

  useEffect(() => {
    if (business) {
      setForm({
        name: business.name || '',
        address: business.address || '',
        phone: business.phone || '',
        email: business.email || '',
        currency: business.currency || 'BDT',
        footerWebsite: business.footerWebsite || '',
        logoUrl: business.logoUrl || '',
        settings: {
          lowStockThreshold: business.settings?.lowStockThreshold ?? 5,
          printMode: business.settings?.printMode || 'a4',
          returnWindowDays: business.settings?.returnWindowDays ?? 7,
          printWidthMm: business.settings?.printWidthMm ?? 80,
        },
      });
    }
  }, [business]);

  if (!form) return <Spinner />;

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/business', { ...form, settings: { ...form.settings, lowStockThreshold: +form.settings.lowStockThreshold, returnWindowDays: +form.settings.returnWindowDays, printWidthMm: +form.settings.printWidthMm } });
      await refresh();
      toast.success('Settings saved');
    } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
    setSaving(false);
  };

  const set = (k, v) => setForm({ ...form, [k]: v });
  const setS = (k, v) => setForm({ ...form, settings: { ...form.settings, [k]: v } });

  const onLogoPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Please choose an image file');
    if (file.size > 3 * 1024 * 1024) return toast.error('Logo must be under 3 MB');
    const t = toast.loading('Uploading logo...');
    try {
      const url = await uploadImage(file, 'logo'); // stored on Cloudinary
      set('logoUrl', url);
      toast.success('Logo uploaded', { id: t });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed', { id: t });
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="card p-5 space-y-4">
        <h3 className="font-semibold">Business Profile</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="label">Business Name</label><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
          <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="shop@example.com" /></div>
          <div><label className="label">Currency</label><input className="input" value={form.currency} onChange={(e) => set('currency', e.target.value)} /></div>
          <div className="sm:col-span-2"><label className="label">Address</label><input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} /></div>
          <div className="sm:col-span-2">
            <label className="label">Shop Logo</label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-lg border border-slate-300 dark:border-slate-600 flex items-center justify-center overflow-hidden bg-slate-50 dark:bg-slate-900 shrink-0">
                {form.logoUrl
                  ? <img src={form.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                  : <ImagePlus size={24} className="text-slate-400" />}
              </div>
              <div className="flex flex-col gap-2">
                <label className="btn-ghost cursor-pointer">
                  <ImagePlus size={16} /> {form.logoUrl ? 'Change Logo' : 'Upload Logo'}
                  <input type="file" accept="image/*" className="hidden" onChange={onLogoPick} />
                </label>
                {form.logoUrl && (
                  <button type="button" className="btn-ghost text-red-500" onClick={() => set('logoUrl', '')}>
                    <Trash2 size={16} /> Remove
                  </button>
                )}
                <p className="text-xs text-slate-400">PNG/JPG, shown on invoices & receipts. Max 3 MB.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <h3 className="font-semibold">Preferences</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="label">Low Stock Threshold</label><input className="input" type="number" value={form.settings.lowStockThreshold} onChange={(e) => setS('lowStockThreshold', e.target.value)} /></div>
          <div>
            <label className="label">Return / Exchange Window</label>
            <select className="input" value={form.settings.returnWindowDays} onChange={(e) => setS('returnWindowDays', e.target.value)}>
              <option value={3}>3 days</option>
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
            </select>
            <p className="text-xs text-slate-400 mt-1">After this window, only the shop owner can process a return/exchange.</p>
          </div>
          <div>
            <label className="label">Receipt Paper Width</label>
            <select className="input" value={form.settings.printWidthMm} onChange={(e) => setS('printWidthMm', e.target.value)}>
              <option value={80}>80mm</option>
              <option value={58}>58mm</option>
            </select>
            <p className="text-xs text-slate-400 mt-1">Must match your thermal printer's actual roll — the wrong size gets cut off on the right, not resized.</p>
          </div>
        </div>
        <div className="flex items-center justify-between pt-2">
          <span className="label !mb-0">Theme</span>
          <button className="btn-ghost" onClick={toggleTheme}>
            {theme === 'dark' ? <><Sun size={18} /> Light Mode</> : <><Moon size={18} /> Dark Mode</>}
          </button>
        </div>
      </div>

      <button className="btn-primary" disabled={saving} onClick={save}><Save size={18} /> {saving ? 'Saving...' : 'Save Changes'}</button>

      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold flex items-center gap-2"><Landmark size={16} /> Payment Accounts</h3>
            <p className="text-xs text-slate-400 mt-1">Your shop's own named Bank / bKash / Nagad / Rocket / Card accounts (e.g. 5-10 real bank accounts). Pick one whenever you take a payment or move money, so invoices and Finance show exactly which account it went through.</p>
          </div>
          {canManageAccounts && <button className="btn-primary shrink-0" onClick={openNewAccount}><Plus size={16} /> Add Account</button>}
        </div>
        <DataTable
          columns={[
            { key: 'method', label: 'Method', render: (a) => <span className="badge bg-slate-100 dark:bg-slate-700">{METHOD_LABEL[a.method]}</span> },
            { key: 'name', label: 'Name' },
            { key: 'accountNumber', label: 'Account Number', render: (a) => a.accountNumber || '—' },
            { key: 'isActive', label: 'Status', render: (a) => a.isActive ? <span className="text-green-600">Active</span> : <span className="text-slate-400">Inactive</span> },
            ...(canManageAccounts ? [{ key: 'actions', label: '', className: 'text-right', render: (a) => (
              <div className="flex justify-end gap-1">
                <button className="btn-ghost p-1.5" onClick={() => openEditAccount(a)}><Pencil size={15} /></button>
                <button className={`btn-ghost p-1.5 ${a.isActive ? 'text-red-500' : 'text-green-600'}`} title={a.isActive ? 'Deactivate' : 'Activate'} onClick={() => toggleAccount(a)}><Ban size={15} /></button>
              </div>
            ) }] : []),
          ]}
          rows={accounts}
          empty="No payment accounts added yet — add your bank/bKash/Nagad accounts here."
        />
      </div>

      <Modal open={accountModal} onClose={() => setAccountModal(false)} title={editAccountId ? 'Edit Payment Account' : 'Add Payment Account'}
        footer={<><button className="btn-ghost" onClick={() => setAccountModal(false)}>Cancel</button><button className="btn-primary" disabled={accountSaving} onClick={saveAccount}>{accountSaving ? 'Saving...' : 'Save'}</button></>}>
        <div className="space-y-3">
          <div>
            <label className="label">Method</label>
            <select className="input" value={accountForm.method} onChange={(e) => setAccountForm({ ...accountForm, method: e.target.value })}>
              {ACCOUNT_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
            </select>
          </div>
          <div><label className="label">Account Name</label><input className="input" placeholder="e.g. Dutch-Bangla — Current" value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} /></div>
          <div><label className="label">Account / Agent Number</label><input className="input" value={accountForm.accountNumber} onChange={(e) => setAccountForm({ ...accountForm, accountNumber: e.target.value })} /></div>
          <div><label className="label">Note (optional)</label><input className="input" value={accountForm.note} onChange={(e) => setAccountForm({ ...accountForm, note: e.target.value })} /></div>
        </div>
      </Modal>

      <div className="card p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2"><KeyRound size={16} /> Change Password</h3>
        <p className="text-xs text-slate-400">Enter your current password, then choose a new one.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2"><label className="label">Current Password</label><input className="input" type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} /></div>
          <div><label className="label">New Password</label><input className="input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} /></div>
          <div><label className="label">Confirm Password</label><input className="input" type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} /></div>
          <div className="sm:col-span-2">
            <button className="btn-primary" disabled={pwBusy} onClick={changePw}><KeyRound size={16} /> {pwBusy ? 'Saving…' : 'Change Password'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
