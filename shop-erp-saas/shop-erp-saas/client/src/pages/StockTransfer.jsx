import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Trash2, Send, ScanLine, PackageCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios.js';
import DataTable from '../components/ui/DataTable.jsx';
import Modal from '../components/ui/Modal.jsx';
import { fmtDateTime } from '../utils/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { useScanner } from '../context/ScannerContext.jsx';

// Move stock from one branch to another. Each branch keeps its own catalog, so
// the server re-homes serial-tracked devices unit by unit and shifts quantity
// stock between the two branches' own product records — creating the product in
// the destination branch if it has never stocked it before.
export default function StockTransfer() {
  const confirm = useConfirm();
  const { branches, activeBranch } = useAuth();
  const active = branches.filter((b) => b.isActive);

  const [fromBranch, setFromBranch] = useState('');
  const [toBranch, setToBranch] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [lines, setLines] = useState([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);
  const [detail, setDetail] = useState(null);
  const searchRef = useRef(null);

  // default: move OUT of the branch you're currently working in
  useEffect(() => {
    if (!active.length) return;
    setFromBranch((f) => f || activeBranch?._id || active[0]._id);
    setToBranch((t) => t || active.find((b) => b._id !== (activeBranch?._id || active[0]._id))?._id || '');
  }, [branches.length, activeBranch?._id]);

  const loadHistory = async () => {
    try { const { data } = await api.get('/stock-transfers'); setHistory(data.data.transfers); }
    catch (e) { toast.error(e.response?.data?.message || 'Could not load transfer history'); }
  };
  useEffect(() => { loadHistory(); }, []);

  // Search the SOURCE branch's shelf (not the branch you're working in).
  useEffect(() => {
    if (!fromBranch) return;
    const term = search.trim();
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get('/stock-transfers/stock', { params: { branch: fromBranch, search: term || undefined } });
        setResults(data.data.products);
      } catch { setResults([]); }
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [search, fromBranch]);

  // changing the source branch invalidates anything already picked from the old one
  useEffect(() => { setLines([]); }, [fromBranch]);

  const addProduct = (p, preselectUnitId) => {
    setLines((cur) => {
      const existing = cur.find((l) => l.product === p._id);
      if (existing) {
        // already on the list — a scan just ticks that one more device
        if (preselectUnitId && p.trackSerial && !existing.unitIds.includes(preselectUnitId)) {
          return cur.map((l) => l.product === p._id ? { ...l, unitIds: [...l.unitIds, preselectUnitId] } : l);
        }
        toast(`${p.name} is already on the list`, { icon: 'ℹ️' });
        return cur;
      }
      return [...cur, {
        product: p._id,
        name: p.name,
        trackSerial: !!p.trackSerial,
        available: p.stock || 0,
        units: p.units || [],
        unitIds: preselectUnitId ? [preselectUnitId] : [],
        qty: p.trackSerial ? 0 : 1,
      }];
    });
  };

  // A scanned code (phone scanner or a USB scanner typing into the box) picks the
  // exact device it belongs to — the same universal scan behaviour as POS.
  const resolveScan = async (code) => {
    const term = String(code || '').trim();
    if (!term || !fromBranch) return;
    try {
      const { data } = await api.get('/stock-transfers/stock', { params: { branch: fromBranch, search: term } });
      const products = data.data.products;
      if (!products.length) return toast.error(`Nothing in stock at this branch for "${term}"`);
      // prefer an exact device match so scanning an IMEI ticks that handset
      for (const p of products) {
        const unit = (p.units || []).find((u) => [u.imei1, u.imei2, u.serial].includes(term));
        if (unit) { addProduct(p, unit._id); toast.success(`${p.name} — device added`); return; }
      }
      addProduct(products[0]);
      toast.success(`${products[0].name} added`);
    } catch (e) { toast.error(e.response?.data?.message || 'Lookup failed'); }
  };

  const { subscribe: subscribeScanner } = useScanner();
  useEffect(() => subscribeScanner(resolveScan), [subscribeScanner, fromBranch]);

  const setLine = (productId, patch) =>
    setLines((cur) => cur.map((l) => (l.product === productId ? { ...l, ...patch } : l)));
  const removeLine = (productId) => setLines((cur) => cur.filter((l) => l.product !== productId));

  const toggleUnit = (productId, unitId) => setLines((cur) => cur.map((l) => {
    if (l.product !== productId) return l;
    const has = l.unitIds.includes(unitId);
    return { ...l, unitIds: has ? l.unitIds.filter((u) => u !== unitId) : [...l.unitIds, unitId] };
  }));

  const totalQty = useMemo(
    () => lines.reduce((s, l) => s + (l.trackSerial ? l.unitIds.length : Number(l.qty) || 0), 0),
    [lines]
  );

  const fromName = active.find((b) => b._id === fromBranch)?.name || '';
  const toName = active.find((b) => b._id === toBranch)?.name || '';

  const submit = async () => {
    if (!fromBranch || !toBranch) return toast.error('Pick both branches');
    if (fromBranch === toBranch) return toast.error('Pick two different branches');
    if (!lines.length) return toast.error('Add at least one product');
    for (const l of lines) {
      if (l.trackSerial && !l.unitIds.length) return toast.error(`Pick which devices to send for ${l.name}`);
      if (!l.trackSerial) {
        const q = Number(l.qty) || 0;
        if (q <= 0) return toast.error(`Enter a quantity for ${l.name}`);
        if (q > l.available) return toast.error(`Only ${l.available} of ${l.name} in stock at ${fromName}`);
      }
    }

    const okGo = await confirm({
      title: 'Transfer this stock?',
      message: `${totalQty} item(s) will move from ${fromName} to ${toName}. Stock updates at both branches straight away.`,
      confirmText: 'Transfer',
    });
    if (!okGo) return;

    setSaving(true);
    try {
      const { data } = await api.post('/stock-transfers', {
        fromBranch, toBranch, note,
        items: lines.map((l) => ({
          product: l.product,
          qty: l.trackSerial ? l.unitIds.length : Number(l.qty) || 0,
          unitIds: l.trackSerial ? l.unitIds : [],
        })),
      });
      const madeNew = data.data.createdProducts;
      toast.success(`Transferred to ${toName}${madeNew ? ` — ${madeNew} product(s) newly added there` : ''}`);
      setLines([]); setNote(''); setSearch('');
      loadHistory();
    } catch (e) { toast.error(e.response?.data?.message || 'Transfer failed'); }
    setSaving(false);
  };

  if (active.length < 2) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold flex items-center gap-2"><PackageCheck size={24} /> Stock Transfer</h1>
        <div className="card p-6 text-center text-slate-500">
          Stock transfer needs at least two active branches. Add another branch first from the Branches page.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2"><PackageCheck size={24} /> Stock Transfer</h1>
      <p className="text-sm text-slate-500">
        Move products from one branch to another. Serial-tracked devices move by IMEI, so each handset stays traceable;
        if the destination branch has never stocked an item, it's created there automatically.
      </p>

      <div className="card p-4 space-y-4">
        {/* From → To */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-end">
          <div>
            <label className="label">From branch</label>
            <select className="input" value={fromBranch} onChange={(e) => setFromBranch(e.target.value)}>
              {active.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
          </div>
          <ArrowRight className="hidden sm:block text-slate-400 mb-2.5" size={22} />
          <div>
            <label className="label">To branch</label>
            <select className="input" value={toBranch} onChange={(e) => setToBranch(e.target.value)}>
              <option value="">Select…</option>
              {active.filter((b) => b._id !== fromBranch).map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
          </div>
        </div>

        {/* Product picker */}
        <div className="relative">
          <ScanLine size={18} className="absolute left-3 top-2.5 text-brand-500" />
          <input
            ref={searchRef}
            className="input pl-10"
            placeholder="Scan IMEI / barcode, or search a product at the source branch…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && search.trim()) { resolveScan(search.trim()); setSearch(''); } }}
          />
        </div>

        {results.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-56 overflow-y-auto">
            {results.map((p) => (
              <button
                key={p._id}
                onClick={() => addProduct(p)}
                className="card p-2.5 text-left hover:ring-2 hover:ring-brand-500 transition"
              >
                <p className="font-medium text-sm truncate">{p.name}</p>
                <p className="text-xs text-slate-400">
                  Stock: {p.stock}{p.trackSerial ? ` • ${p.units.length} device(s)` : ''}
                </p>
              </button>
            ))}
          </div>
        )}
        {!searching && search.trim() && results.length === 0 && (
          <p className="text-sm text-slate-400">Nothing in stock at {fromName} matching "{search.trim()}".</p>
        )}

        {/* Picked lines */}
        <div className="border-t border-slate-200 dark:border-slate-700 pt-3 space-y-3">
          {lines.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">
              Nothing picked yet — search or scan above to add products.
            </p>
          ) : lines.map((l) => (
            <div key={l.product} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{l.name}</p>
                  <p className="text-xs text-slate-400">{l.available} in stock at {fromName}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {l.trackSerial ? (
                    <span className="badge bg-brand-100 text-brand-700">{l.unitIds.length} selected</span>
                  ) : (
                    <input
                      type="number" min="1" max={l.available}
                      className="input !w-24 text-center"
                      value={l.qty}
                      onChange={(e) => setLine(l.product, { qty: e.target.value })}
                    />
                  )}
                  <button onClick={() => removeLine(l.product)} className="btn-ghost p-1.5 text-red-500"><Trash2 size={15} /></button>
                </div>
              </div>

              {l.trackSerial && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {l.units.map((u) => {
                    const picked = l.unitIds.includes(u._id);
                    return (
                      <button
                        key={u._id}
                        onClick={() => toggleUnit(l.product, u._id)}
                        className={`px-2 py-1 rounded text-xs font-mono border transition ${
                          picked
                            ? 'bg-brand-600 text-white border-brand-600'
                            : 'border-slate-300 dark:border-slate-600 text-slate-500 hover:border-brand-400'
                        }`}
                      >{u.imei1 || u.serial}</button>
                    );
                  })}
                  {l.units.length > 1 && (
                    <button
                      className="px-2 py-1 rounded text-xs underline text-slate-500"
                      onClick={() => setLine(l.product, {
                        unitIds: l.unitIds.length === l.units.length ? [] : l.units.map((u) => u._id),
                      })}
                    >{l.unitIds.length === l.units.length ? 'Clear all' : 'Select all'}</button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div>
          <label className="label">Note (optional)</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. sent with Rahim, van delivery" />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-700 pt-3">
          <p className="text-sm">
            {totalQty > 0
              ? <>Moving <b>{totalQty}</b> item(s) {fromName && toName ? <>from <b>{fromName}</b> to <b>{toName}</b></> : null}</>
              : <span className="text-slate-400">Nothing to transfer yet</span>}
          </p>
          <button className="btn-primary" disabled={saving || !totalQty || !toBranch} onClick={submit}>
            <Send size={16} /> {saving ? 'Transferring…' : 'Transfer Stock'}
          </button>
        </div>
      </div>

      <h2 className="font-semibold pt-2">Transfer History</h2>
      <DataTable
        columns={[
          { key: 'createdAt', label: 'Date', render: (r) => fmtDateTime(r.createdAt) },
          { key: 'transferNo', label: 'Transfer No' },
          { key: 'route', label: 'Movement', render: (r) => (
            <span className="flex items-center gap-1.5 text-sm">
              {r.fromBranch?.name || '—'} <ArrowRight size={13} className="text-slate-400" /> {r.toBranch?.name || '—'}
            </span>
          )},
          { key: 'totalQty', label: 'Items', className: 'text-right' },
          { key: 'createdBy', label: 'By', render: (r) => r.createdBy?.name || '—' },
        ]}
        rows={history}
        onRowClick={(r) => setDetail(r)}
        empty="No transfers yet"
      />

      <Modal open={!!detail} onClose={() => setDetail(null)} title={`Transfer ${detail?.transferNo || ''}`} size="lg">
        {detail && (
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-2">
              <b>{detail.fromBranch?.name}</b> <ArrowRight size={14} className="text-slate-400" /> <b>{detail.toBranch?.name}</b>
              <span className="text-slate-400">• {fmtDateTime(detail.createdAt)}</span>
            </p>
            {detail.note && <p className="text-slate-500">Note: {detail.note}</p>}
            <div className="space-y-2">
              {detail.items.map((it, i) => (
                <div key={i} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{it.name}</span>
                    <span className="text-slate-500">x{it.qty}</span>
                  </div>
                  {it.units?.length > 0 && (
                    <p className="text-xs text-slate-400 font-mono mt-1 break-all">
                      {it.units.map((u) => u.imei1 || u.serial).join(', ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
