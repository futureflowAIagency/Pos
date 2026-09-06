import { useEffect, useState } from 'react';
import { ShieldQuestion, Search, CheckCircle2, XCircle, AlertCircle, ClipboardList, Printer, Trash2, Package, Send, PackageCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios.js';
import DataTable from '../components/ui/DataTable.jsx';
import StatCard from '../components/ui/StatCard.jsx';
import PrintWrapper from '../components/print/PrintWrapper.jsx';
import WarrantyClaimReceipt from '../components/print/WarrantyClaimReceipt.jsx';
import { fmtDate, fmtDateTime } from '../utils/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';

const CLAIM_STATUSES = ['pending', 'sent_to_company', 'received_from_company', 'delivered_to_customer'];
const STATUS_LABEL = {
  pending: 'At Shop',
  sent_to_company: 'Sent to Company',
  received_from_company: 'Received from Company',
  delivered_to_customer: 'Delivered to Customer',
};
const STATUS_ICON = {
  pending: Package,
  sent_to_company: Send,
  received_from_company: PackageCheck,
  delivered_to_customer: CheckCircle2,
};
const STATUS_ACCENT = {
  pending: 'brand',
  sent_to_company: 'amber',
  received_from_company: 'brand',
  delivered_to_customer: 'green',
};
const STATUS_BADGE = {
  pending: 'bg-slate-200 text-slate-700',
  sent_to_company: 'bg-amber-100 text-amber-700',
  received_from_company: 'bg-blue-100 text-blue-700',
  delivered_to_customer: 'bg-green-100 text-green-700',
};

export default function Warranty() {
  const [tab, setTab] = useState('check'); // 'check' | 'claim'
  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldQuestion size={24} /> Warranty</h1>
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
        <TabButton active={tab === 'check'} onClick={() => setTab('check')}>Check Warranty</TabButton>
        <TabButton active={tab === 'claim'} onClick={() => setTab('claim')}>Claim Warranty</TabButton>
      </div>
      {tab === 'check' ? <CheckWarranty /> : <ClaimWarranty />}
    </div>
  );
}

const TabButton = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
      active ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
    }`}
  >
    {children}
  </button>
);

// ---------------------------------------------------------------------------
// Tab 1: Check Warranty — look up a device's sale/warranty status by IMEI.
// ---------------------------------------------------------------------------
function CheckWarranty() {
  const [imei, setImei] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const check = async () => {
    if (!imei.trim()) return;
    setLoading(true); setResult(null); setNotFound(false);
    try {
      const { data } = await api.get('/units/warranty', { params: { imei: imei.trim() } });
      setResult(data.data.result);
    } catch (e) {
      if (e.response?.status === 404) setNotFound(true);
      else toast.error(e.response?.data?.message || 'Error');
    }
    setLoading(false);
  };

  const badge = (status) => {
    if (status === 'active') return <span className="badge bg-green-100 text-green-700 inline-flex items-center gap-1"><CheckCircle2 size={14} /> Active</span>;
    if (status === 'expired') return <span className="badge bg-red-100 text-red-700 inline-flex items-center gap-1"><XCircle size={14} /> Expired</span>;
    return <span className="badge bg-amber-100 text-amber-700 inline-flex items-center gap-1"><AlertCircle size={14} /> Not sold yet</span>;
  };

  return (
    <div className="space-y-4 pt-4">
      <p className="text-sm text-slate-500">Enter a device IMEI or serial number to look up its sale &amp; warranty status.</p>

      <div className="card p-4 flex items-center gap-2">
        <Search size={18} className="text-slate-400 shrink-0" />
        <input className="input" placeholder="Enter IMEI / Serial..." value={imei}
          onChange={(e) => setImei(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') check(); }} />
        <button className="btn-primary shrink-0" disabled={loading} onClick={check}>{loading ? 'Checking...' : 'Check'}</button>
      </div>

      {notFound && (
        <div className="card p-6 text-center text-slate-500">No device found for this IMEI / serial in your shop.</div>
      )}

      {result && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">{result.product?.name}</h3>
            {badge(result.warrantyStatus)}
          </div>
          {(result.product?.brand || result.product?.storage || result.product?.color) && (
            <p className="text-sm text-slate-400">{[result.product.brand, result.product.storage, result.product.color].filter(Boolean).join(' – ')}</p>
          )}
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <Field label="IMEI 1" value={result.imei1} />
            <Field label="IMEI 2" value={result.imei2} />
            <Field label="Serial" value={result.serial} />
            <Field label="Status" value={result.status === 'sold' ? 'Sold' : 'In stock'} />
            <Field label="Sold On" value={result.soldAt ? fmtDate(result.soldAt) : '—'} />
            <Field label="Sold To" value={result.customerName || '—'} />
            {(result.warrantyBrandMonths || result.warrantyShopMonths) ? (
              <>
                <Field label="Brand Warranty" value={result.warrantyBrandMonths ? `${result.warrantyBrandMonths} months` : '—'} />
                <Field label="Brand Warranty Until" value={result.warrantyBrandExpiry ? fmtDate(result.warrantyBrandExpiry) : '—'} />
                <Field label="Shop Warranty" value={result.warrantyShopMonths ? `${result.warrantyShopMonths} months` : '—'} />
                <Field label="Shop Warranty Until" value={result.warrantyShopExpiry ? fmtDate(result.warrantyShopExpiry) : '—'} />
              </>
            ) : (
              <>
                <Field label="Warranty" value={result.warrantyMonths ? `${result.warrantyMonths} months` : '—'} />
                <Field label="Warranty Until" value={result.warrantyExpiry ? fmtDate(result.warrantyExpiry) : '—'} />
              </>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}

const Field = ({ label, value }) => (
  <div>
    <dt className="text-slate-400">{label}</dt>
    <dd className="font-medium">{value || '—'}</dd>
  </div>
);

// ---------------------------------------------------------------------------
// Tab 2: Claim Warranty — submit a device for a warranty claim (found by IMEI
// or entered manually), print an acknowledgement receipt, then track it
// through shop -> company -> back to the customer.
// ---------------------------------------------------------------------------
const emptyForm = {
  unit: null, product: null, customer: null,
  productName: '', imei1: '', imei2: '', serial: '',
  customerName: '', customerPhone: '', customerNid: '', customerAddress: '', problem: '',
};

function ClaimWarranty() {
  const confirm = useConfirm();
  const { business } = useAuth();
  const [lookupImei, setLookupImei] = useState('');
  const [looking, setLooking] = useState(false);
  const [lookupHint, setLookupHint] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [printClaim, setPrintClaim] = useState(null);

  const [claims, setClaims] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  // counts by status — independent of the search/status filter above, so the
  // dashboard always shows the true total in each stage, not just the filtered view
  const [summary, setSummary] = useState({ counts: {}, total: 0 });

  const loadSummary = async () => {
    const { data } = await api.get('/warranty-claims/summary');
    setSummary(data.data);
  };
  const load = async () => {
    const { data } = await api.get('/warranty-claims', { params: { search, status: statusFilter || undefined } });
    setClaims(data.data.claims);
  };
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [search, statusFilter]);
  useEffect(() => { loadSummary(); }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const lookup = async () => {
    if (!lookupImei.trim()) return;
    setLooking(true); setLookupHint('');
    try {
      const { data } = await api.get('/warranty-claims/lookup', { params: { imei: lookupImei.trim() } });
      const r = data.data.result;
      setForm({
        unit: r.unit, product: r.product, customer: r.customer,
        productName: r.productName || '', imei1: r.imei1 || '', imei2: r.imei2 || '', serial: r.serial || '',
        customerName: r.customerName || '', customerPhone: r.customerPhone || '',
        customerNid: r.customerNid || '', customerAddress: r.customerAddress || '',
        problem: '',
      });
      const wLabel = r.warrantyStatus === 'active' ? 'warranty is active' : r.warrantyStatus === 'expired' ? 'warranty has expired' : 'not marked sold yet';
      setLookupHint(`Found: ${r.productName}${r.productVariant ? ` (${r.productVariant})` : ''} — ${wLabel}. Details filled in below.`);
    } catch (e) {
      if (e.response?.status === 404) {
        setForm({ ...emptyForm, imei1: lookupImei.trim() });
        setLookupHint('Not found in your shop\'s records — enter the details manually below.');
      } else toast.error(e.response?.data?.message || 'Error');
    }
    setLooking(false);
  };

  const submit = async () => {
    if (!form.productName.trim()) return toast.error('Product name is required');
    if (!form.customerName.trim()) return toast.error('Customer name is required');
    setSaving(true);
    try {
      const { data } = await api.post('/warranty-claims', form);
      toast.success(`Claim ${data.data.claim.claimNo} created`);
      setPrintClaim(data.data.claim);
      setForm(emptyForm); setLookupImei(''); setLookupHint('');
      load(); loadSummary();
    } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
    setSaving(false);
  };

  const changeStatus = async (c, status) => {
    try { await api.patch(`/warranty-claims/${c._id}/status`, { status }); load(); loadSummary(); }
    catch (e) { toast.error(e.response?.data?.message || 'Error'); }
  };

  const del = async (c) => {
    const yes = await confirm({ title: 'Delete claim?', message: `Delete claim ${c.claimNo}?`, confirmText: 'Delete', tone: 'danger' });
    if (!yes) return;
    await api.delete(`/warranty-claims/${c._id}`); toast.success('Deleted'); load(); loadSummary();
  };

  return (
    <div className="space-y-4 pt-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {CLAIM_STATUSES.map((s) => (
          <button key={s} type="button" className="text-left" onClick={() => setStatusFilter(statusFilter === s ? '' : s)}>
            <StatCard icon={STATUS_ICON[s]} label={STATUS_LABEL[s]} value={summary.counts[s] ?? 0} accent={STATUS_ACCENT[s]} />
          </button>
        ))}
      </div>

      <div className="card p-4 space-y-3">
        <p className="text-sm text-slate-500">Search by the device's IMEI/serial to auto-fill its product &amp; customer details — or skip the search and fill the form in by hand (e.g. a device bought elsewhere).</p>
        <div className="flex items-center gap-2">
          <Search size={18} className="text-slate-400 shrink-0" />
          <input className="input" placeholder="Enter IMEI / Serial..." value={lookupImei}
            onChange={(e) => setLookupImei(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') lookup(); }} />
          <button className="btn-ghost shrink-0" disabled={looking} onClick={lookup}>{looking ? 'Searching...' : 'Search'}</button>
        </div>
        {lookupHint && <p className="text-xs text-brand-600">{lookupHint}</p>}

        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
          <div><label className="label">Product Name</label><input className="input" value={form.productName} onChange={set('productName')} /></div>
          <div><label className="label">Problem / Fault</label><input className="input" value={form.problem} onChange={set('problem')} /></div>
          <div><label className="label">IMEI 1</label><input className="input" value={form.imei1} onChange={set('imei1')} /></div>
          <div><label className="label">IMEI 2</label><input className="input" value={form.imei2} onChange={set('imei2')} /></div>
          <div><label className="label">Serial Number</label><input className="input" value={form.serial} onChange={set('serial')} /></div>
          <div><label className="label">Customer Name</label><input className="input" value={form.customerName} onChange={set('customerName')} /></div>
          <div><label className="label">Customer Phone</label><input className="input" value={form.customerPhone} onChange={set('customerPhone')} /></div>
          <div><label className="label">Customer NID</label><input className="input" value={form.customerNid} onChange={set('customerNid')} /></div>
          <div><label className="label">Customer Address</label><input className="input" value={form.customerAddress} onChange={set('customerAddress')} /></div>
        </div>
        <div className="flex justify-end">
          <button className="btn-primary" disabled={saving} onClick={submit}>{saving ? 'Submitting...' : 'Submit Claim & Print Receipt'}</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <h3 className="font-semibold flex items-center gap-2"><ClipboardList size={18} /> Claims</h3>
        <div className="flex gap-2">
          <input className="input max-w-[220px]" placeholder="Search claim no, customer..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input max-w-[180px]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {CLAIM_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
      </div>

      <DataTable
        columns={[
          { key: 'claimNo', label: 'Claim No' },
          { key: 'customerName', label: 'Customer', render: (r) => (
            <div>
              <span className="font-medium">{r.customerName}</span>
              {r.customerPhone && <div className="text-xs text-slate-400">{r.customerPhone}</div>}
              {r.customerNid && <div className="text-xs text-slate-400">NID: <span className="font-mono">{r.customerNid}</span></div>}
              {r.customerAddress && <div className="text-xs text-slate-400 truncate max-w-[180px]" title={r.customerAddress}>{r.customerAddress}</div>}
            </div>
          ) },
          { key: 'productName', label: 'Product', render: (r) => (
            <div>{r.productName}{(r.imei1 || r.serial) && <div className="text-xs text-slate-400">{r.imei1 || r.serial}</div>}</div>
          ) },
          { key: 'createdAt', label: 'Date', render: (r) => fmtDateTime(r.createdAt) },
          { key: 'status', label: 'Status', render: (r) => (
            <select className={`badge border-0 ${STATUS_BADGE[r.status]} cursor-pointer`} value={r.status} onChange={(e) => changeStatus(r, e.target.value)}>
              {CLAIM_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          ) },
          { key: 'actions', label: '', className: 'text-right', render: (r) => (
            <div className="flex justify-end gap-1">
              <button className="btn-ghost p-1.5" title="Print receipt" onClick={() => setPrintClaim(r)}><Printer size={15} /></button>
              <button className="btn-ghost p-1.5 text-red-500" onClick={() => del(r)}><Trash2 size={15} /></button>
            </div>
          ) },
        ]}
        rows={claims}
        empty="No warranty claims yet"
      />

      <PrintWrapper open={!!printClaim} onClose={() => setPrintClaim(null)} title="Warranty Claim Receipt">
        {printClaim && <WarrantyClaimReceipt claim={printClaim} business={business} />}
      </PrintWrapper>
    </div>
  );
}
