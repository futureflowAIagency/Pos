import { useEffect, useState } from 'react';
import { Plus, Pencil, Star, Power, Store } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios.js';
import DataTable from '../components/ui/DataTable.jsx';
import Modal from '../components/ui/Modal.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const empty = { name: '', address: '', phone: '' };

// Owner-only: add/edit branches, pick the main (fallback) branch, and
// deactivate one no longer in use. Creating a branch here is the literal
// feature — everything else (Products/POS/Finance/...) picks it up
// automatically once it's selected in the Topbar switcher.
export default function Branches() {
  const confirm = useConfirm();
  const { refresh } = useAuth(); // reload branches into the switcher after any change
  const [branches, setBranches] = useState([]);
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => { const { data } = await api.get('/branches'); setBranches(data.data.branches); };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditId(null); setForm(empty); setModal(true); };
  const openEdit = (b) => { setEditId(b._id); setForm({ name: b.name, address: b.address || '', phone: b.phone || '' }); setModal(true); };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    if (!form.name.trim()) return toast.error('Branch name is required');
    setSaving(true);
    try {
      if (editId) await api.put(`/branches/${editId}`, form);
      else await api.post('/branches', form);
      toast.success(editId ? 'Branch updated' : 'Branch added');
      setModal(false); load(); refresh();
    } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
    setSaving(false);
  };

  const setMain = async (b) => {
    try { await api.patch(`/branches/${b._id}/main`); toast.success(`${b.name} is now the main branch`); load(); refresh(); }
    catch (e) { toast.error(e.response?.data?.message || 'Error'); }
  };

  const toggle = async (b) => {
    if (b.isActive) {
      const ok = await confirm({
        title: 'Deactivate this branch?',
        message: `"${b.name}" will no longer appear in the branch switcher or accept new sales. Its past data stays intact and can still be viewed. Set another branch as main first if this one is currently main.`,
        confirmText: 'Deactivate', tone: 'deactivate',
      });
      if (!ok) return;
    }
    try { await api.patch(`/branches/${b._id}/toggle`); toast.success(b.isActive ? 'Branch deactivated' : 'Branch activated'); load(); refresh(); }
    catch (e) { toast.error(e.response?.data?.message || 'Error'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Store size={24} /> Branches</h1>
        <button className="btn-primary" onClick={openNew}><Plus size={18} /> Add Branch</button>
      </div>
      <p className="text-sm text-slate-500">
        Each branch keeps its own products, stock, sales and till. Customers, suppliers and staff records are shared across every branch.
        Switch which branch you're working in from the dropdown in the top bar.
      </p>

      <DataTable
        columns={[
          { key: 'name', label: 'Name', render: (r) => (
            <div className="flex items-center gap-2">
              <span className="font-medium">{r.name}</span>
              {r.isMainBranch && <span className="badge bg-brand-100 text-brand-700">Main</span>}
              {!r.isActive && <span className="badge bg-slate-100 text-slate-500">Inactive</span>}
            </div>
          )},
          { key: 'address', label: 'Address', render: (r) => r.address || '—' },
          { key: 'phone', label: 'Phone', render: (r) => r.phone || '—' },
          { key: 'actions', label: '', className: 'text-right', render: (r) => (
            <div className="flex justify-end gap-1">
              {!r.isMainBranch && r.isActive && (
                <button onClick={() => setMain(r)} className="btn-ghost p-1.5" title="Set as main branch"><Star size={15} /></button>
              )}
              <button onClick={() => openEdit(r)} className="btn-ghost p-1.5" title="Edit"><Pencil size={15} /></button>
              <button
                onClick={() => toggle(r)}
                className={`btn-ghost p-1.5 ${r.isActive ? 'text-red-500' : 'text-green-600'}`}
                title={r.isActive ? 'Deactivate' : 'Activate'}
                disabled={r.isMainBranch && r.isActive}
              ><Power size={15} /></button>
            </div>
          )},
        ]}
        rows={branches}
        empty="No branches yet"
      />

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Edit Branch' : 'Add Branch'}
        footer={<><button className="btn-ghost" onClick={() => setModal(false)}>Cancel</button><button className="btn-primary" disabled={saving} onClick={save}>Save</button></>}>
        <div className="space-y-3">
          <div><label className="label">Name</label><input className="input" autoFocus value={form.name} onChange={set('name')} placeholder="e.g. Dhanmondi Branch" /></div>
          <div><label className="label">Address</label><input className="input" value={form.address} onChange={set('address')} /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={set('phone')} /></div>
        </div>
      </Modal>
    </div>
  );
}
