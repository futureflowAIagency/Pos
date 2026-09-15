import { useEffect, useState } from 'react';
import { ShieldQuestion, Search, CheckCircle2, ClipboardList, Printer, PackageOpen, Trash2, Package, Send, PackageCheck, Hash, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios.js';
import DataTable from '../components/ui/DataTable.jsx';
import StatCard from '../components/ui/StatCard.jsx';
import PrintWrapper from '../components/print/PrintWrapper.jsx';
import WarrantyClaimReceipt from '../components/print/WarrantyClaimReceipt.jsx';
import WarrantyDeliveryReceipt from '../components/print/WarrantyDeliveryReceipt.jsx';
import { fmtDateTime } from '../utils/format.js';
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

// Claim Warranty — submit a device for a warranty claim (found by IMEI or
// entered manually), print an acknowledgement receipt, then track it through
// shop -> company -> back to the customer. Sibling page to Check Warranty
// (client/src/pages/Warranty.jsx); reached via the "Warranty" sub-menu.
const emptyForm = {
  unit: null, product: null, customer: null,
  productName: '', imei1: '', imei2: '', serial: '',
  customerName: '', customerPhone: '', customerNid: '', customerAddress: '', problem: '',
  // what the customer handed in along with the device (Box / Charger / ...)
  receivedItems: [],
};

// The three common things handed in with a device, offered as one-click
// presets; anything else is typed into the box next to them, so a claim can
// list as many items as it actually came with.
const CONDITION_PRESETS = ['Box', 'Charger', 'Only Mobile'];

export default function ClaimWarranty() {
  const confirm = useConfirm();
  const { business } = useAuth();
  const [lookupImei, setLookupImei] = useState('');
  const [looking, setLooking] = useState(false);
  const [lookupHint, setLookupHint] = useState('');
  // If the phone number typed above matches more than one device this shop
  // sold (a customer who bought several things over time), the lookup holds
  // off filling the form and shows these instead — picking one fills it.
  const [lookupMatches, setLookupMatches] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [printClaim, setPrintClaim] = useState(null);
  // delivery confirmation receipt — auto-opens the moment a claim is marked
  // Delivered to Customer, and stays reprintable from the list forever after
  // (both receipts for a claim live on for later rechecking)
  const [printDelivery, setPrintDelivery] = useState(null);

  // "Product / Item Condition" — preset dropdown + free-text box feeding one list
  const [itemPreset, setItemPreset] = useState('');
  const [itemText, setItemText] = useState('');

  // Warranty Search by Number — pull a claim back up from the number printed on
  // the customer's slip, OR (more realistically) from whatever the counter
  // actually has on hand: the customer's phone, their name, or the device's
  // IMEI/serial. Can match more than one claim (e.g. two visits on the same
  // phone number), so this holds an array; `numberSelected` is which one is
  // currently shown in full, or null while still on the pick-list.
  const [numberQuery, setNumberQuery] = useState('');
  const [numberBusy, setNumberBusy] = useState(false);
  const [numberSearched, setNumberSearched] = useState(false); // a search has actually run
  const [numberResults, setNumberResults] = useState([]); // [{ claim, warranty }]
  const [numberSelected, setNumberSelected] = useState(null); // index into numberResults
  const [numberError, setNumberError] = useState('');

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

  // Add one item to the claim's received-items list, from either the preset
  // dropdown or the free-text box. De-duped case-insensitively so the same
  // thing can't be listed twice.
  const addReceivedItem = (raw) => {
    const v = String(raw || '').trim();
    if (!v) return;
    setForm((f) => (
      f.receivedItems.some((x) => x.toLowerCase() === v.toLowerCase())
        ? f
        : { ...f, receivedItems: [...f.receivedItems, v] }
    ));
  };
  const removeReceivedItem = (v) => setForm((f) => ({ ...f, receivedItems: f.receivedItems.filter((x) => x !== v) }));

  const searchByNumber = async () => {
    if (!numberQuery.trim()) return;
    setNumberBusy(true); setNumberError(''); setNumberResults([]); setNumberSelected(null); setNumberSearched(true);
    try {
      const { data } = await api.get('/warranty-claims/by-number', { params: { number: numberQuery.trim() } });
      const results = data.data.results || [];
      setNumberResults(results);
      // Exactly one match → skip the pick-list and show it directly, matching
      // the old single-result feel for the common case (a real claim number).
      if (results.length === 1) setNumberSelected(0);
    } catch (e) {
      setNumberError(e.response?.data?.message || 'Error');
    }
    setNumberBusy(false);
  };
  const clearNumberSearch = () => {
    setNumberQuery(''); setNumberResults([]); setNumberSelected(null); setNumberError(''); setNumberSearched(false);
  };

  // Fills the claim form from one matched device — used both when the lookup
  // returns exactly one match, and when the counter picks one off a longer list.
  const fillFromMatch = (r) => {
    setForm({
      unit: r.unit, product: r.product, customer: r.customer,
      productName: r.productName || '', imei1: r.imei1 || '', imei2: r.imei2 || '', serial: r.serial || '',
      customerName: r.customerName || '', customerPhone: r.customerPhone || '',
      customerNid: r.customerNid || '', customerAddress: r.customerAddress || '',
      problem: '',
      // keep whatever the counter has already ticked off — the lookup fills in
      // device/customer details, it doesn't know what was physically handed in
      receivedItems: form.receivedItems,
    });
    const wLabel = r.warrantyStatus === 'active' ? 'warranty is active' : r.warrantyStatus === 'expired' ? 'warranty has expired' : 'not marked sold yet';
    setLookupHint(`Found: ${r.productName}${r.productVariant ? ` (${r.productVariant})` : ''} — ${wLabel}. Details filled in below.`);
    setLookupMatches([]);
  };

  const lookup = async () => {
    if (!lookupImei.trim()) return;
    setLooking(true); setLookupHint(''); setLookupMatches([]);
    try {
      const { data } = await api.get('/warranty-claims/lookup', { params: { imei: lookupImei.trim() } });
      const results = data.data.results || [];
      if (results.length === 1) {
        // the common case — a scanned/typed IMEI can only ever match one
        // device, so skip straight to filling the form as before
        fillFromMatch(results[0]);
      } else if (results.length > 1) {
        // a phone number that bought more than one device — let the counter
        // say which product's warranty is actually being claimed
        setLookupMatches(results);
        setLookupHint(`${results.length} purchases found for that number — pick which product's warranty you're claiming:`);
      }
    } catch (e) {
      if (e.response?.status === 404) {
        setForm({ ...emptyForm, imei1: lookupImei.trim(), receivedItems: form.receivedItems });
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
      setItemPreset(''); setItemText('');
      load(); loadSummary();
    } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
    setSaving(false);
  };

  const changeStatus = async (c, status) => {
    try {
      const { data } = await api.patch(`/warranty-claims/${c._id}/status`, { status });
      load(); loadSummary();
      // moving to Delivered means the product physically left the shop for
      // the customer — print a confirmation right away, on file alongside the
      // original claim receipt for a later recheck.
      if (status === 'delivered_to_customer') setPrintDelivery(data.data.claim);
    } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
  };

  const del = async (c) => {
    const yes = await confirm({ title: 'Delete claim?', message: `Delete claim ${c.claimNo}?`, confirmText: 'Delete', tone: 'danger' });
    if (!yes) return;
    await api.delete(`/warranty-claims/${c._id}`); toast.success('Deleted'); load(); loadSummary();
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldQuestion size={24} /> Claim Warranty</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {CLAIM_STATUSES.map((s) => (
          <button key={s} type="button" className="text-left" onClick={() => setStatusFilter(statusFilter === s ? '' : s)}>
            <StatCard icon={STATUS_ICON[s]} label={STATUS_LABEL[s]} value={summary.counts[s] ?? 0} accent={STATUS_ACCENT[s]} />
          </button>
        ))}
      </div>

      {/* Warranty Search by Number — the customer brings back the slip they were
          given, and the counter pulls the whole claim up. In practice the slip's
          own claim number is often the one thing NOT on hand, so this also
          matches on the customer's phone, their name, or the device's IMEI/serial. */}
      <div className="card p-4 space-y-3">
        <h3 className="font-semibold flex items-center gap-2"><Hash size={16} /> Warranty Search by Number</h3>
        <p className="text-sm text-slate-500">Enter the Warranty (claim) number, the customer's phone/name, or the device's IMEI/serial to pull up that claim's full details.</p>
        <div className="flex items-center gap-2">
          <Search size={18} className="text-slate-400 shrink-0" />
          <input className="input font-mono" placeholder="e.g. WC-12345678-42, a phone number, or an IMEI" value={numberQuery}
            onChange={(e) => setNumberQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') searchByNumber(); }} />
          <button className="btn-primary shrink-0" disabled={numberBusy} onClick={searchByNumber}>{numberBusy ? 'Searching...' : 'Search'}</button>
          {(numberSearched || numberError) && (
            <button className="btn-ghost shrink-0" onClick={clearNumberSearch}>Clear</button>
          )}
        </div>
        {numberError && <p className="text-sm text-red-500">{numberError}</p>}
        {numberSearched && !numberError && numberResults.length === 0 && (
          <p className="text-sm text-slate-500">No warranty claim found for that — try the customer's phone number, name, or the device's IMEI/serial.</p>
        )}
        {/* Several matches (e.g. one phone number, two different visits) → pick which one */}
        {numberResults.length > 1 && numberSelected === null && (
          <div className="space-y-1.5">
            <p className="text-xs text-slate-400">{numberResults.length} matching claims — pick one:</p>
            {numberResults.map(({ claim }, i) => (
              <button
                key={claim._id}
                type="button"
                onClick={() => setNumberSelected(i)}
                className="w-full text-left rounded-lg border border-brand-200 dark:border-slate-700 hover:bg-brand-50 dark:hover:bg-slate-700/40 p-2.5 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <span className="font-mono font-medium">{claim.claimNo}</span>
                  <span className={`badge ${STATUS_BADGE[claim.status]} ml-2`}>{STATUS_LABEL[claim.status] || claim.status}</span>
                  <p className="text-xs text-slate-400 truncate">{claim.productName} — {claim.customerName} {claim.customerPhone ? `(${claim.customerPhone})` : ''}</p>
                </div>
                <span className="text-xs text-slate-400 shrink-0">{fmtDateTime(claim.createdAt)}</span>
              </button>
            ))}
          </div>
        )}
        {numberSelected !== null && numberResults[numberSelected] && (
          <>
            {numberResults.length > 1 && (
              <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => setNumberSelected(null)}>← Back to the {numberResults.length} matches</button>
            )}
            <WarrantyNumberResult
              data={numberResults[numberSelected]}
              onPrint={() => setPrintClaim(numberResults[numberSelected].claim)}
              onPrintDelivery={() => setPrintDelivery(numberResults[numberSelected].claim)}
            />
          </>
        )}
      </div>

      <div className="card p-4 space-y-3">
        <p className="text-sm text-slate-500">Search by the device's IMEI/serial <strong>or the customer's phone number</strong> to auto-fill product &amp; customer details — or skip the search and fill the form in by hand (e.g. a device bought elsewhere). If the same number bought more than one product, you'll be asked which one's warranty you're claiming.</p>
        <div className="flex items-center gap-2">
          <Search size={18} className="text-slate-400 shrink-0" />
          <input className="input" placeholder="Enter IMEI / Serial or a phone number..." value={lookupImei}
            onChange={(e) => setLookupImei(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') lookup(); }} />
          <button className="btn-ghost shrink-0" disabled={looking} onClick={lookup}>{looking ? 'Searching...' : 'Search'}</button>
        </div>
        {lookupHint && <p className="text-xs text-brand-600">{lookupHint}</p>}

        {/* More than one device bought under this phone number — pick which
            product's warranty is actually being claimed before the form fills in. */}
        {lookupMatches.length > 0 && (
          <div className="space-y-1.5">
            {lookupMatches.map((r) => (
              <button
                key={r.unit}
                type="button"
                onClick={() => fillFromMatch(r)}
                className="w-full text-left rounded-lg border border-brand-200 dark:border-slate-700 hover:bg-brand-50 dark:hover:bg-slate-700/40 p-2.5 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <span className="font-medium">{r.productName}</span>
                  {r.productVariant && <span className="text-xs text-slate-400 ml-1">({r.productVariant})</span>}
                  <p className="text-xs text-slate-400 truncate">
                    {r.imei1 || r.serial || '—'} • {r.customerName}{r.customerPhone ? ` (${r.customerPhone})` : ''}
                    {r.soldAt ? ` • bought ${fmtDateTime(r.soldAt)}` : ''}
                  </p>
                </div>
                <span className={`badge shrink-0 ${
                  r.warrantyStatus === 'active' ? 'bg-green-100 text-green-700'
                    : r.warrantyStatus === 'expired' ? 'bg-red-100 text-red-700'
                    : 'bg-slate-200 text-slate-700'
                }`}>
                  {r.warrantyStatus === 'active' ? 'Warranty active' : r.warrantyStatus === 'expired' ? 'Warranty expired' : 'Not sold'}
                </span>
              </button>
            ))}
          </div>
        )}

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

        {/* Product / Item Condition — what physically came in with the device.
            Pick a common one from the dropdown or type anything else; both add
            to the same list, so a claim can carry several items at once. */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
          <label className="label mb-0 flex items-center gap-1.5"><PackageOpen size={14} /> Product / Item Condition</label>
          <p className="text-xs text-slate-400">What did the customer hand in with the device? Add as many items as needed — they're printed on the claim receipt.</p>
          <div className="flex flex-wrap gap-2 items-center">
            <select
              className="input !w-auto min-w-[150px]"
              value={itemPreset}
              onChange={(e) => { addReceivedItem(e.target.value); setItemPreset(''); }}
            >
              <option value="">Select item...</option>
              {CONDITION_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input
              className="input !w-auto flex-1 min-w-[160px]"
              placeholder="Or type another item (e.g. Earphone, SIM tray)"
              value={itemText}
              onChange={(e) => setItemText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addReceivedItem(itemText); setItemText(''); } }}
            />
            <button type="button" className="btn-ghost shrink-0" onClick={() => { addReceivedItem(itemText); setItemText(''); }}>
              <Plus size={15} /> Add
            </button>
          </div>
          {form.receivedItems.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {form.receivedItems.map((it) => (
                <span key={it} className="badge bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200 flex items-center gap-1">
                  {it}
                  <button type="button" className="text-brand-700/70 hover:text-red-500" onClick={() => removeReceivedItem(it)} title={`Remove ${it}`}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">No items added yet.</p>
          )}
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
            <div>
              {r.productName}
              {(r.imei1 || r.serial) && <div className="text-xs text-slate-400">{r.imei1 || r.serial}</div>}
              {r.receivedItems?.length > 0 && (
                <div className="text-xs text-brand-500">With: {r.receivedItems.join(', ')}</div>
              )}
            </div>
          ) },
          { key: 'createdAt', label: 'Date', render: (r) => fmtDateTime(r.createdAt) },
          { key: 'status', label: 'Status', render: (r) => (
            <select className={`badge border-0 ${STATUS_BADGE[r.status]} cursor-pointer`} value={r.status} onChange={(e) => changeStatus(r, e.target.value)}>
              {CLAIM_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          ) },
          { key: 'actions', label: '', className: 'text-right', render: (r) => (
            <div className="flex justify-end gap-1">
              <button className="btn-ghost p-1.5" title="Print claim receipt" onClick={() => setPrintClaim(r)}><Printer size={15} /></button>
              {r.status === 'delivered_to_customer' && (
                <button className="btn-ghost p-1.5 text-green-600" title="Print delivery confirmation" onClick={() => setPrintDelivery(r)}><PackageOpen size={15} /></button>
              )}
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

      <PrintWrapper open={!!printDelivery} onClose={() => setPrintDelivery(null)} title="Delivery Confirmation">
        {printDelivery && <WarrantyDeliveryReceipt claim={printDelivery} business={business} />}
      </PrintWrapper>
    </div>
  );
}

// Result panel for "Warranty Search by Number" — everything the counter needs
// about that one claim, including the underlying device's warranty standing
// when the claim was raised against a device this shop actually sold.
function WarrantyNumberResult({ data, onPrint, onPrintDelivery }) {
  const { claim, warranty } = data;
  const Row = ({ label, value }) => (
    value ? <div className="flex gap-2"><span className="text-slate-400 shrink-0 w-32">{label}</span><span className="font-medium break-words">{value}</span></div> : null
  );
  const W_LABEL = { active: 'Active', expired: 'Expired', not_sold: 'Not marked sold' };
  const W_CLASS = { active: 'bg-green-100 text-green-700', expired: 'bg-red-100 text-red-700', not_sold: 'bg-slate-200 text-slate-700' };

  return (
    <div className="rounded-lg border border-brand-200 dark:border-slate-700 bg-brand-50/60 dark:bg-slate-800/60 p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold font-mono">{claim.claimNo}</span>
          <span className={`badge ${STATUS_BADGE[claim.status]}`}>{STATUS_LABEL[claim.status] || claim.status}</span>
          {warranty && <span className={`badge ${W_CLASS[warranty.status]}`}>Warranty: {W_LABEL[warranty.status]}</span>}
        </div>
        <div className="flex gap-1">
          <button className="btn-ghost p-1.5" title="Print claim receipt" onClick={onPrint}><Printer size={15} /></button>
          {claim.status === 'delivered_to_customer' && (
            <button className="btn-ghost p-1.5 text-green-600" title="Print delivery confirmation" onClick={onPrintDelivery}><PackageOpen size={15} /></button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <Row label="Submitted" value={fmtDateTime(claim.createdAt)} />
        <Row label="Branch" value={claim.branch?.name} />
        <Row label="Product" value={claim.productName} />
        <Row label="IMEI 1" value={claim.imei1} />
        <Row label="IMEI 2" value={claim.imei2} />
        <Row label="Serial" value={claim.serial} />
        <Row label="Problem" value={claim.problem} />
        <Row label="Items received" value={claim.receivedItems?.join(', ')} />
        <Row label="Customer" value={claim.customerName} />
        <Row label="Phone" value={claim.customerPhone} />
        <Row label="NID" value={claim.customerNid} />
        <Row label="Address" value={claim.customerAddress} />
        {warranty && <Row label="Sold on" value={warranty.soldAt ? fmtDateTime(warranty.soldAt) : ''} />}
        {warranty?.brandExpiry && <Row label="Brand warranty till" value={fmtDateTime(warranty.brandExpiry)} />}
        {warranty?.shopExpiry && <Row label="Shop warranty till" value={fmtDateTime(warranty.shopExpiry)} />}
      </div>

      {claim.statusHistory?.length > 0 && (
        <div className="text-xs text-slate-500 border-t border-brand-200 dark:border-slate-700 pt-2">
          <span className="font-medium">History: </span>
          {claim.statusHistory.map((h, i) => (
            <span key={i}>{i > 0 && ' → '}{STATUS_LABEL[h.status] || h.status} ({fmtDateTime(h.at)})</span>
          ))}
        </div>
      )}
    </div>
  );
}
