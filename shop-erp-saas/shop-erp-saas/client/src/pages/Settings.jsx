import { useEffect, useState } from 'react';
import { Save, Moon, Sun, ImagePlus, Trash2, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios.js';
import { uploadImage } from '../api/upload.js';
import Spinner from '../components/ui/Spinner.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';

export default function Settings() {
  const { business, refresh } = useAuth();
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
