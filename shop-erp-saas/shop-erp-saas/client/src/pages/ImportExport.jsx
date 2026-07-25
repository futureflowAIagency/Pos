import { useEffect, useState } from 'react';
import { Download, Upload, DatabaseBackup, History, FileText, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios.js';
import DataTable from '../components/ui/DataTable.jsx';
import { downloadBlob, readFileAsText } from '../utils/download.js';
import { fmtDateTime } from '../utils/format.js';
import { useConfirm } from '../context/ConfirmContext.jsx';

const EXPORT_ENTITIES = [
  { key: 'customers', label: 'Customers' },
  { key: 'suppliers', label: 'Suppliers' },
  { key: 'products', label: 'Products / Stock' },
  { key: 'units', label: 'IMEI / Serial' },
  { key: 'sales', label: 'Sales History', dated: true },
  { key: 'purchases', label: 'Purchase History', dated: true },
  { key: 'expenses', label: 'Expense History', dated: true },
  { key: 'installments', label: 'EMI / Installments' },
  { key: 'dues', label: 'Due List' },
];

const IMPORT_ENTITIES = [
  { key: 'customers', label: 'Customers' },
  { key: 'suppliers', label: 'Suppliers' },
  { key: 'products', label: 'Products' },
  { key: 'expenses', label: 'Expenses' },
];

export default function ImportExport() {
  const confirm = useConfirm();
  const [range, setRange] = useState({ from: '', to: '' });
  const [history, setHistory] = useState([]);

  // import panel state
  const [entity, setEntity] = useState('customers');
  const [file, setFile] = useState(null);
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState(null); // { total, validCount, errorCount, errors }
  const [committing, setCommitting] = useState(false);

  // IMEI/serial import (needs a product)
  const [products, setProducts] = useState([]);
  const [unitProduct, setUnitProduct] = useState('');
  const [unitFile, setUnitFile] = useState(null);
  const [unitResult, setUnitResult] = useState(null);
  const [unitBusy, setUnitBusy] = useState(false);

  // restore
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoring, setRestoring] = useState(false);

  // Smart Stock Import — any file shape (this shop's old-software export,
  // real .xlsx/.xls, or CSV/TXT with whatever column names)
  const [smartFile, setSmartFile] = useState(null);
  const [smartResult, setSmartResult] = useState(null);
  const [smartBusy, setSmartBusy] = useState(false);
  const [smartRowAccept, setSmartRowAccept] = useState({}); // row index -> accepted?

  const loadHistory = async () => {
    const { data } = await api.get('/export/history/list');
    setHistory(data.data.logs);
  };
  useEffect(() => { loadHistory(); api.get('/products').then(({ data }) => setProducts(data.data.products)); }, []);

  const exportEntity = async (key, dated) => {
    try {
      const params = dated && (range.from || range.to) ? { from: range.from, to: range.to } : {};
      const { data } = await api.get(`/export/${key}`, { params, responseType: 'blob' });
      downloadBlob(data, `${key}.csv`, 'text/csv');
      toast.success('Downloaded');
      loadHistory();
    } catch (e) { toast.error(e.response?.data?.message || 'Export failed'); }
  };

  const downloadBackup = async () => {
    try {
      const { data } = await api.get('/export/backup/full', { responseType: 'blob' });
      downloadBlob(data, `backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
      toast.success('Backup downloaded');
      loadHistory();
    } catch (e) { toast.error(e.response?.data?.message || 'Backup failed'); }
  };

  const downloadTemplate = async (key) => {
    try {
      const { data } = await api.get(`/import/${key}/template`, { responseType: 'blob' });
      downloadBlob(data, `${key}-template.csv`, 'text/csv');
    } catch (e) { toast.error(e.response?.data?.message || 'Template download failed'); }
  };

  const validateFile = async () => {
    if (!file) return toast.error('Choose a CSV file first');
    setValidating(true); setResult(null);
    try {
      const csv = await readFileAsText(file);
      const { data } = await api.post(`/import/${entity}/validate`, { csv });
      setResult(data.data);
    } catch (e) { toast.error(e.response?.data?.message || 'Validation failed'); }
    setValidating(false);
  };

  const commitFile = async () => {
    if (!file) return;
    setCommitting(true);
    try {
      const csv = await readFileAsText(file);
      const { data } = await api.post(`/import/${entity}/commit`, { csv });
      toast.success(`Imported: ${data.data.created} created, ${data.data.updated} updated, ${data.data.skipped} skipped`);
      setFile(null); setResult(null);
      loadHistory();
    } catch (e) { toast.error(e.response?.data?.message || 'Import failed'); }
    setCommitting(false);
  };

  const validateUnits = async () => {
    if (!unitProduct) return toast.error('Select a product first');
    if (!unitFile) return toast.error('Choose a CSV file first');
    setUnitBusy(true); setUnitResult(null);
    try {
      const csv = await readFileAsText(unitFile);
      const { data } = await api.post('/import/units/validate', { csv });
      setUnitResult(data.data);
    } catch (e) { toast.error(e.response?.data?.message || 'Validation failed'); }
    setUnitBusy(false);
  };
  const commitUnits = async () => {
    setUnitBusy(true);
    try {
      const csv = await readFileAsText(unitFile);
      const { data } = await api.post('/import/units/commit', { csv, product: unitProduct });
      toast.success(`Added ${data.data.created} device(s), ${data.data.skipped} skipped`);
      setUnitFile(null); setUnitResult(null);
      loadHistory();
    } catch (e) { toast.error(e.response?.data?.message || 'Import failed'); }
    setUnitBusy(false);
  };

  const smartPreview = async () => {
    if (!smartFile) return toast.error('Choose a file first');
    setSmartBusy(true); setSmartResult(null);
    try {
      const fd = new FormData();
      fd.append('file', smartFile);
      const { data } = await api.post('/import/smart/preview', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setSmartResult(data.data);
      const initial = {};
      data.data.rows.forEach((r, i) => { initial[i] = r.accepted; });
      setSmartRowAccept(initial);
    } catch (e) { toast.error(e.response?.data?.message || 'Could not read this file'); }
    setSmartBusy(false);
  };
  const toggleSmartRow = (i) => setSmartRowAccept((m) => ({ ...m, [i]: !m[i] }));
  const acceptedSmartCount = smartResult ? smartResult.rows.filter((_, i) => smartRowAccept[i]).length : 0;

  const smartCommit = async () => {
    if (!smartFile) return;
    setSmartBusy(true);
    try {
      const skipRows = smartResult.rows.map((_, i) => i).filter((i) => !smartRowAccept[i]);
      const fd = new FormData();
      fd.append('file', smartFile);
      fd.append('skipRows', JSON.stringify(skipRows));
      const { data } = await api.post('/import/smart/commit', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const d = data.data;
      toast.success(
        `Imported: ${d.createdProducts} new product(s), ${d.existingProductsGivenImeis} existing product(s) given new IMEIs, ${d.addedUnits} IMEI(s) added` +
        (d.skippedDuplicateImeis ? `, ${d.skippedDuplicateImeis} duplicate IMEI(s) skipped` : '')
      );
      setSmartFile(null); setSmartResult(null); setSmartRowAccept({});
      loadHistory();
    } catch (e) { toast.error(e.response?.data?.message || 'Import failed'); }
    setSmartBusy(false);
  };

  const runRestore = async () => {
    if (!restoreFile) return toast.error('Choose a backup .json file first');
    const okc = await confirm({
      title: 'Restore backup?',
      message: 'This will ADD Products, Customers, Suppliers and Expenses from the backup file into this shop. It does not delete or overwrite existing data, and does not restore Sales/Purchase/EMI history.',
      confirmText: 'Restore', tone: 'danger',
    });
    if (!okc) return;
    setRestoring(true);
    try {
      const text = await readFileAsText(restoreFile);
      const json = JSON.parse(text);
      const { data } = await api.post('/import/backup/restore', { json });
      const c = data.data.counts;
      toast.success(`Restored: ${c.products} products, ${c.customers} customers, ${c.suppliers} suppliers, ${c.expenses} expenses`);
      setRestoreFile(null);
      loadHistory();
    } catch (e) { toast.error(e.response?.data?.message || 'Invalid backup file or restore failed'); }
    setRestoring(false);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Data Import &amp; Export</h1>

      {/* Export */}
      <div className="card p-4 space-y-3">
        <h3 className="font-semibold flex items-center gap-2"><Download size={18} /> Export Data (CSV)</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div><label className="label">From (optional)</label><input type="date" className="input !w-auto" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></div>
          <div><label className="label">To (optional)</label><input type="date" className="input !w-auto" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></div>
          <p className="text-xs text-slate-400">Date range applies to Sales, Purchase &amp; Expense history only.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {EXPORT_ENTITIES.map((e) => (
            <button key={e.key} className="btn-ghost" onClick={() => exportEntity(e.key, e.dated)}>{e.label}</button>
          ))}
        </div>
      </div>

      {/* Full backup */}
      <div className="card p-4 space-y-3">
        <h3 className="font-semibold flex items-center gap-2"><DatabaseBackup size={18} /> Full Database Backup</h3>
        <p className="text-sm text-slate-500">Downloads everything in this shop as one JSON file — for safekeeping or migrating to another system.</p>
        <button className="btn-primary" onClick={downloadBackup}><Download size={16} /> Download Full Backup (JSON)</button>
      </div>

      {/* Import */}
      <div className="card p-4 space-y-3">
        <h3 className="font-semibold flex items-center gap-2"><Upload size={18} /> Import Data (CSV)</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">What to import</label>
            <select className="input" value={entity} onChange={(e) => { setEntity(e.target.value); setFile(null); setResult(null); }}>
              {IMPORT_ENTITIES.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
            </select>
          </div>
          <button className="btn-ghost" onClick={() => downloadTemplate(entity)}><FileText size={16} /> Download Template</button>
          <div>
            <label className="label">CSV File</label>
            <input type="file" accept=".csv,text/csv" className="input" onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); }} />
          </div>
          <button className="btn-ghost" disabled={validating} onClick={validateFile}>{validating ? 'Checking…' : 'Validate'}</button>
        </div>

        {result && (
          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1 text-green-600"><CheckCircle2 size={15} /> {result.validCount} valid</span>
              {result.errorCount > 0 && <span className="flex items-center gap-1 text-red-500"><AlertTriangle size={15} /> {result.errorCount} error(s)</span>}
              <span className="text-slate-400">of {result.total} row(s)</span>
            </div>
            {result.errors.length > 0 && (
              <div className="max-h-40 overflow-y-auto text-xs border border-slate-200 dark:border-slate-700 rounded-lg">
                <table className="w-full">
                  <thead className="bg-slate-100 dark:bg-slate-700 text-left"><tr><th className="px-2 py-1">Row</th><th className="px-2 py-1">Error</th></tr></thead>
                  <tbody>{result.errors.map((e, i) => <tr key={i} className="border-t border-slate-200 dark:border-slate-700"><td className="px-2 py-1">{e.row}</td><td className="px-2 py-1">{e.message}</td></tr>)}</tbody>
                </table>
              </div>
            )}
            <button className="btn-primary" disabled={committing || result.validCount === 0} onClick={commitFile}>
              {committing ? 'Importing…' : `Import ${result.validCount} valid row(s)`}
            </button>
          </div>
        )}
      </div>

      {/* Smart Stock Import — auto-detects the file shape instead of requiring a fixed template */}
      <div className="card p-4 space-y-3">
        <h3 className="font-semibold flex items-center gap-2"><Sparkles size={18} className="text-brand-600" /> Smart Stock Import</h3>
        <p className="text-sm text-slate-500">
          Upload a stock file from any system — Excel (.xlsx/.xls), CSV, or plain text — in whatever column layout it already has.
          This automatically detects supplier/dealer groupings and column names (Item/Name, Category, Stock/Qty, Supplier/Dealer, prices, IMEIs, warranty)
          instead of requiring you to reformat it into a fixed template first. If a product model already exists here, only its IMEIs are added;
          otherwise the product is created fresh from that row.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <button className="btn-ghost" onClick={() => downloadTemplate('migration')}><FileText size={16} /> Download Migration Template</button>
          <div>
            <label className="label">File</label>
            <input type="file" accept=".xlsx,.xls,.csv,.txt" className="input" onChange={(e) => { setSmartFile(e.target.files?.[0] || null); setSmartResult(null); setSmartRowAccept({}); }} />
          </div>
          <button className="btn-ghost" disabled={smartBusy} onClick={smartPreview}>{smartBusy ? 'Reading…' : 'Preview'}</button>
        </div>

        {smartResult && (
          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-4 text-sm flex-wrap">
              <span className="badge bg-brand-100 text-brand-700 capitalize">{smartResult.format.replace(/-/g, ' ')}</span>
              <span className="flex items-center gap-1 text-green-600"><CheckCircle2 size={15} /> {smartResult.validCount} product row(s) understood</span>
              {smartResult.errorCount > 0 && <span className="flex items-center gap-1 text-red-500"><AlertTriangle size={15} /> {smartResult.errorCount} skipped</span>}
              <span className="text-slate-400">of {smartResult.total} row(s)</span>
            </div>
            {smartResult.suppliers.length > 0 && (
              <p className="text-xs text-slate-500">Suppliers/dealers found: {smartResult.suppliers.join(', ')}</p>
            )}
            {!smartResult.withPrices && (
              <p className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle size={13} /> This file has no purchase/selling prices — imported products will start at ৳0 until you set prices from Edit Product.</p>
            )}
            {smartResult.defaultTrackSerial && (
              <p className="text-xs text-slate-500 flex items-center gap-1"><CheckCircle2 size={13} className="text-brand-500" /> Products will be added as IMEI/Serial-tracked (this shop's Mobile default) — the imported stock count is a starting point; add each device's real IMEI via "Manage IMEIs" on the Products page to reconcile.</p>
            )}
            {smartResult.conflictCount > 0 && (
              <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={13} /> {smartResult.conflictCount} row(s) have an IMEI that already exists elsewhere — review and tick to accept anyway, or leave unticked to skip.</p>
            )}

            {smartResult.rows.length > 0 && (
              <div className="max-h-96 overflow-y-auto text-xs border border-slate-200 dark:border-slate-700 rounded-lg">
                <table className="w-full">
                  <thead className="bg-slate-100 dark:bg-slate-700 text-left sticky top-0">
                    <tr>
                      <th className="px-2 py-1">Include</th><th className="px-2 py-1">Product</th><th className="px-2 py-1">Category</th>
                      <th className="px-2 py-1">Supplier</th><th className="px-2 py-1 text-right">Stock/IMEIs</th><th className="px-2 py-1">Status</th>
                    </tr>
                  </thead>
                  <tbody>{smartResult.rows.map((r, i) => (
                    <tr key={i} className={`border-t border-slate-200 dark:border-slate-700 ${r.status === 'conflict' ? 'bg-red-50 dark:bg-red-900/10' : ''}`}>
                      <td className="px-2 py-1"><input type="checkbox" checked={!!smartRowAccept[i]} onChange={() => toggleSmartRow(i)} /></td>
                      <td className="px-2 py-1">{r.data.name}</td>
                      <td className="px-2 py-1">{r.data.category}</td>
                      <td className="px-2 py-1">{r.data.supplierName || '—'}</td>
                      <td className="px-2 py-1 text-right">{r.data.stock}</td>
                      <td className="px-2 py-1">
                        {r.status === 'new' && <span className="badge bg-green-100 text-green-700">New Product</span>}
                        {r.status === 'existing' && <span className="badge bg-brand-100 text-brand-700">+ IMEIs → {r.matchedProductName}</span>}
                        {r.status === 'conflict' && (
                          <span className="text-red-600" title={r.conflicts.map((c) => `${c.imei} already under ${c.existingProduct}`).join('; ')}>
                            ⚠ {r.conflicts.length} IMEI(s) already used (e.g. {r.conflicts[0].imei} → {r.conflicts[0].existingProduct})
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            {smartResult.errors.length > 0 && (
              <div className="max-h-32 overflow-y-auto text-xs border border-slate-200 dark:border-slate-700 rounded-lg">
                <table className="w-full">
                  <thead className="bg-slate-100 dark:bg-slate-700 text-left"><tr><th className="px-2 py-1">Row</th><th className="px-2 py-1">Reason</th></tr></thead>
                  <tbody>{smartResult.errors.map((e, i) => <tr key={i} className="border-t border-slate-200 dark:border-slate-700"><td className="px-2 py-1">{e.row}</td><td className="px-2 py-1">{e.message}</td></tr>)}</tbody>
                </table>
              </div>
            )}
            <button className="btn-primary" disabled={smartBusy || acceptedSmartCount === 0} onClick={smartCommit}>
              {smartBusy ? 'Importing…' : `Import ${acceptedSmartCount} accepted row(s)`}
            </button>
          </div>
        )}
      </div>

      {/* IMEI / Serial import (needs a target product) */}
      <div className="card p-4 space-y-3">
        <h3 className="font-semibold">Import IMEI / Serial Numbers</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Product</label>
            <select className="input" value={unitProduct} onChange={(e) => { setUnitProduct(e.target.value); setUnitResult(null); }}>
              <option value="">Select product</option>
              {products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </div>
          <button className="btn-ghost" onClick={() => downloadTemplate('units')}><FileText size={16} /> Download Template</button>
          <div>
            <label className="label">CSV File</label>
            <input type="file" accept=".csv,text/csv" className="input" onChange={(e) => { setUnitFile(e.target.files?.[0] || null); setUnitResult(null); }} />
          </div>
          <button className="btn-ghost" disabled={unitBusy} onClick={validateUnits}>{unitBusy ? 'Checking…' : 'Validate'}</button>
        </div>
        {unitResult && (
          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1 text-green-600"><CheckCircle2 size={15} /> {unitResult.validCount} valid</span>
              {unitResult.errorCount > 0 && <span className="flex items-center gap-1 text-red-500"><AlertTriangle size={15} /> {unitResult.errorCount} error(s)</span>}
            </div>
            <button className="btn-primary" disabled={unitBusy || unitResult.validCount === 0} onClick={commitUnits}>Add {unitResult.validCount} device(s)</button>
          </div>
        )}
      </div>

      {/* Restore */}
      <div className="card p-4 space-y-3">
        <h3 className="font-semibold flex items-center gap-2"><DatabaseBackup size={18} /> Restore from Backup</h3>
        <p className="text-sm text-slate-500">Restores Products, Customers, Suppliers &amp; Expenses from a previously-downloaded backup .json file. This only adds data — it never deletes or overwrites what's already here.</p>
        <div className="flex flex-wrap items-end gap-3">
          <input type="file" accept=".json,application/json" className="input" onChange={(e) => setRestoreFile(e.target.files?.[0] || null)} />
          <button className="btn-primary" disabled={restoring} onClick={runRestore}>{restoring ? 'Restoring…' : 'Restore'}</button>
        </div>
      </div>

      {/* History */}
      <div className="card p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><History size={18} /> Import / Export History</h3>
        <DataTable
          columns={[
            { key: 'createdAt', label: 'Date', render: (r) => fmtDateTime(r.createdAt) },
            { key: 'action', label: 'Action', render: (r) => <span className="capitalize badge bg-slate-100 dark:bg-slate-700">{r.action}</span> },
            { key: 'entity', label: 'Entity' },
            { key: 'format', label: 'Format', render: (r) => r.format.toUpperCase() },
            { key: 'recordCount', label: 'Records', className: 'text-right' },
            { key: 'errorCount', label: 'Errors', className: 'text-right', render: (r) => r.errorCount > 0 ? <span className="text-red-500">{r.errorCount}</span> : '—' },
            { key: 'createdBy', label: 'By', render: (r) => r.createdBy?.name || '—' },
          ]}
          rows={history}
          empty="No import/export activity yet"
        />
      </div>
    </div>
  );
}
