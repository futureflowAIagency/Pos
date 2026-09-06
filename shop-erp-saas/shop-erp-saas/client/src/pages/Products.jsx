import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Search, AlertTriangle, Barcode, ScanLine, Tag, Printer, PackagePlus } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios.js';
import DataTable from '../components/ui/DataTable.jsx';
import Modal from '../components/ui/Modal.jsx';
import LabelPrintModal from '../components/print/LabelPrintModal.jsx';
import PrintWrapper from '../components/print/PrintWrapper.jsx';
import StockReport from '../components/print/StockReport.jsx';
import StockReportByBrand from '../components/print/StockReportByBrand.jsx';
import ProductStockReport from '../components/print/ProductStockReport.jsx';
import { taka, fmtDate, expiryStatus, daysUntil } from '../utils/format.js';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useScanner } from '../context/ScannerContext.jsx';

const empty = {
  name: '', sku: '', category: 'General', unit: 'pcs', purchasePrice: 0, sellingPrice: 0,
  discountPercent: 0, stock: 0, lowStockAlert: 5, expiryDate: '', batchNo: '', returnable: true,
  // mobile-shop fields
  trackSerial: false, brand: '', color: '', storage: '', warrantyBrandMonths: 0, warrantyShopMonths: 0,
};
// one item block in the "Add Product" (create) flow — same shape as `empty`, plus a
// raw IMEI/serial textarea so a serial-tracked item's units can be entered inline.
const emptyItem = { ...empty, imeis: '' };
const emptySupplier = { name: '', phone: '' };
const emptyPurchase = { reference: '', note: '', paid: 0, source: 'cash' };

const isMedicineCat = (cat) => /medicine|medicin|drug|pharma/i.test(cat || '');
const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const discounted = (p) => Math.round((p.sellingPrice * (1 - (p.discountPercent || 0) / 100)) * 100) / 100;
// how many matches the search price panel shows before falling back to the table
const PRICE_CARDS = 6;

export default function Products() {
  const confirm = useConfirm();
  const { business, user } = useAuth();
  const isMobile = business?.type === 'mobile';
  const isPharmacy = business?.type === 'pharmacy';
  // Owner/superadmin always see the purchase/buy price; a staff login needs
  // the 'view-buy-price' permission explicitly (Employees → Login Access).
  // The server also redacts/ignores purchasePrice for a restricted staff
  // regardless of this — this just keeps the UI from showing an empty,
  // confusing field for something it already knows is hidden.
  const canViewBuyPrice = user?.role !== 'staff' || (user?.permissions || []).includes('view-buy-price');
  // Barcode / per-unit tracking is available to Mobile + General shops; Pharmacy
  // has no barcode system at all (per client request).
  const serialEnabled = !isPharmacy;
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  // every category ever seen for this business — only grows, so the filter/combobox
  // options don't shrink away just because the list is currently filtered
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty); // used for Edit only
  const [editId, setEditId] = useState(null);
  // Add Product (create) uses a repeatable item list + an optional supplier/dealer,
  // so several products from the same supplier delivery can be entered in one go.
  const [items, setItems] = useState([emptyItem]);
  const [supplier, setSupplier] = useState(emptySupplier);
  const [purchase, setPurchase] = useState(emptyPurchase);
  const [supplierList, setSupplierList] = useState([]);
  const [unitsFor, setUnitsFor] = useState(null); // product whose IMEIs are being managed
  const [stockFor, setStockFor] = useState(null); // product whose quantity is being adjusted
  const [labelFor, setLabelFor] = useState(null); // product whose barcode labels are being printed
  const [scanCode, setScanCode] = useState('');
  const [saving, setSaving] = useState(false);
  // Stock Print — one-click in-stock report grouped by supplier, respecting
  // whatever category filter is currently active on this page.
  const [stockReport, setStockReport] = useState(null); // { category, groups }
  const [stockReportOpen, setStockReportOpen] = useState(false);
  const [stockReportLoading, setStockReportLoading] = useState(false);
  // Stock Print by Brands — same idea, but grouped purely by brand (no
  // supplier at all) with a running SL# per brand group, plus a day-over-day
  // total-stock comparison at the bottom.
  const [brandReport, setBrandReport] = useState(null); // { category, groups, today, lastDay }
  const [brandReportOpen, setBrandReportOpen] = useState(false);
  const [brandReportLoading, setBrandReportLoading] = useState(false);
  // Stock Print by Model — search a specific product by name, then print just
  // that product's own history: total sold all-time, every supplier it was
  // bought from, and current stock.
  const [modelSearchOpen, setModelSearchOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [modelSuggestions, setModelSuggestions] = useState([]);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelReport, setModelReport] = useState(null);
  const [modelReportOpen, setModelReportOpen] = useState(false);

  useEffect(() => {
    if (!modelSearchOpen || !modelSearch.trim()) { setModelSuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get('/products', { params: { search: modelSearch.trim() } });
        setModelSuggestions(data.data.products.slice(0, 8));
      } catch { /* ignore — suggestions are best-effort */ }
    }, 300);
    return () => clearTimeout(t);
  }, [modelSearch, modelSearchOpen]);

  const pickModel = async (p) => {
    setModelLoading(true);
    try {
      const { data } = await api.get(`/products/${p._id}/report`);
      setModelReport(data.data);
      setModelSearchOpen(false); setModelSearch(''); setModelSuggestions([]);
      setModelReportOpen(true);
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to build report'); }
    setModelLoading(false);
  };

  const load = async () => {
    const { data } = await api.get('/products', { params: { search, category: categoryFilter || undefined } });
    setProducts(data.data.products);
    setCategoryOptions((prev) => [...new Set([...prev, ...data.data.products.map((p) => p.category).filter(Boolean)])].sort());
  };
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [search, categoryFilter]);
  useEffect(() => { api.get('/suppliers').then(({ data }) => setSupplierList(data.data.suppliers)).catch(() => {}); }, []);

  // Whenever the Topbar's phone scanner is connected, every code it scans lands
  // here — same handling as typing into the "Scan barcode" box above. Paused
  // whenever ANY product modal is open (Manage IMEIs, or the Add/Edit Product
  // form) — those take over the connection themselves below, because reading
  // an unrecognized code (a device IMEI) as a product barcode here would 404
  // and silently replace whatever form is already open with a fresh
  // "create product" prefill — exactly the confusing behavior being avoided.
  const { subscribe: subscribeScanner } = useScanner();
  useEffect(() => (
    serialEnabled && !unitsFor && !modal ? subscribeScanner((code) => onScan(code)) : undefined
  ), [subscribeScanner, serialEnabled, unitsFor, modal]);

  // While the Add/Edit Product modal is open, a scanned code is far more useful
  // filling in whatever's being entered there than looked up against the whole
  // catalog. Editing one product has no inline IMEI field (Manage IMEIs handles
  // that separately) so a scan fills its barcode instead; creating feeds the
  // IMEI/serial textarea of whichever item is tracked by serial, appended as a
  // new line — same format as pasting a bulk list there.
  useEffect(() => {
    if (!modal) return undefined;
    return subscribeScanner((code) => {
      const value = code.trim();
      if (!value) return;
      if (editId) { setForm((f) => ({ ...f, barcode: value })); return; }
      setItems((arr) => {
        const idx = arr.findIndex((it) => it.trackSerial);
        if (idx === -1) return arr.map((it, i) => (i === 0 ? { ...it, barcode: value } : it));
        return arr.map((it, i) => (i === idx ? { ...it, imeis: it.imeis ? `${it.imeis}\n${value}` : value } : it));
      });
    });
  }, [modal, editId, subscribeScanner]);

  // One click: every in-stock product (for the currently selected category, or
  // all of them), grouped by supplier/dealer so it's clear whose stock is whose.
  const openStockReport = async () => {
    setStockReportLoading(true);
    try {
      const { data } = await api.get('/products', { params: { category: categoryFilter || undefined } });
      const inStock = data.data.products.filter((p) => p.stock > 0);
      const bySupplier = {};
      for (const p of inStock) {
        const key = p.supplier?.name || '— No Supplier —';
        (bySupplier[key] ||= []).push(p);
      }
      const groups = Object.entries(bySupplier)
        .map(([supplier, items]) => ({ supplier, items, qty: items.reduce((s, i) => s + i.stock, 0) }))
        .sort((a, b) => b.qty - a.qty);
      setStockReport({ category: categoryFilter, groups });
      setStockReportOpen(true);
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to build stock report'); }
    setStockReportLoading(false);
  };

  // One click: every in-stock product (for the currently selected category, or
  // all of them), grouped purely by BRAND — no supplier at all — with a
  // running SL# per brand, plus today's total stock vs the last time this
  // report was printed on an earlier day.
  //
  // Most of this shop's catalog came in through Smart Import (Phase 14) with
  // no `Product.brand` field ever set, so grouping on that field alone put
  // almost everything into one giant "No Brand" bucket — every product's name
  // already starts with its brand ("Samsung A17 5G...", "Motorola G85...",
  // "Oppo A6x..."), so that's used as the fallback grouping key whenever the
  // dedicated field is blank. Groups are ordered alphabetically (client's own
  // "ABC serial" ask) rather than by quantity, and items within a group too,
  // so every product actually belonging to one brand lands in one place.
  const brandOf = (p) => p.brand?.trim() || p.name?.trim().split(/\s+/)[0] || '— No Brand —';
  const openBrandReport = async () => {
    setBrandReportLoading(true);
    try {
      const [{ data }, { data: snap }] = await Promise.all([
        api.get('/products', { params: { category: categoryFilter || undefined } }),
        api.get('/products/stock-snapshot', { params: { category: categoryFilter || undefined } }),
      ]);
      const inStock = data.data.products.filter((p) => p.stock > 0);
      const byBrand = {};
      for (const p of inStock) {
        (byBrand[brandOf(p)] ||= []).push(p);
      }
      const groups = Object.entries(byBrand)
        .map(([brand, items]) => ({
          brand,
          items: [...items].sort((a, b) => a.name.localeCompare(b.name)),
          qty: items.reduce((s, i) => s + i.stock, 0),
        }))
        .sort((a, b) => a.brand.localeCompare(b.brand));
      setBrandReport({ category: categoryFilter, groups, today: snap.data.today, lastDay: snap.data.lastDay });
      setBrandReportOpen(true);
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to build stock report'); }
    setBrandReportLoading(false);
  };

  // Scan/enter a barcode: if it matches an existing product, don't create a new
  // one — for IMEI-tracked products jump straight to adding a new device (req 1),
  // otherwise open the product for a stock edit. `explicitCode` lets the
  // connected phone scanner (see ScannerContext) drive this the same way typing
  // + Enter in the box above does, without going through the input's state.
  const onScan = async (explicitCode) => {
    const code = (explicitCode ?? scanCode).trim();
    if (!code) return;
    try {
      const { data } = await api.get(`/products/barcode/${encodeURIComponent(code)}`);
      const p = data.data.product;
      setScanCode('');
      if (p.trackSerial) { setUnitsFor(p); toast.success(`${p.name} — add a new ${isMobile ? 'IMEI/serial' : 'unit code'}`); }
      else { openEdit(p); toast.success(`${p.name} found`); }
    } catch (e) {
      if (e.response?.status === 404) {
        // unknown barcode → start a new product prefilled with this barcode
        setItems([{ ...emptyItem, category: isMobile ? 'Mobile' : (business?.type === 'pharmacy' ? 'Medicine' : 'General'), trackSerial: isMobile, barcode: code }]);
        setSupplier(emptySupplier); setPurchase(emptyPurchase);
        setEditId(null); setModal(true); setScanCode('');
        toast('New barcode — create the product', { icon: '🆕' });
      } else {
        toast.error(e.response?.data?.message || 'Lookup failed');
      }
    }
  };

  const openNew = () => {
    setItems([{ ...emptyItem, category: isMobile ? 'Mobile' : (business?.type === 'pharmacy' ? 'Medicine' : 'General'), trackSerial: isMobile }]);
    setSupplier(emptySupplier); setPurchase(emptyPurchase);
    setEditId(null); setModal(true);
  };
  const openEdit = (p) => { setForm({ ...empty, ...p, supplier: p.supplier?._id || '', expiryDate: toDateInput(p.expiryDate) }); setEditId(p._id); setModal(true); };

  const requiresExpiry = isMedicineCat(form.category);

  // ---- create-mode item list helpers ----
  const setItemField = (i, k, v) => setItems((arr) => arr.map((it, idx) => idx === i ? { ...it, [k]: v } : it));
  const addItemBlock = () => setItems((arr) => [...arr, { ...emptyItem, category: isMobile ? 'Mobile' : (business?.type === 'pharmacy' ? 'Medicine' : 'General'), trackSerial: isMobile }]);
  const removeItemBlock = (i) => setItems((arr) => arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr);

  const saveEdit = async () => {
    if (!form.name.trim()) return toast.error('Name is required');
    if (requiresExpiry && !form.expiryDate) return toast.error('Expiry date is required for medicines');
    if (Number(form.discountPercent) < 0 || Number(form.discountPercent) > 100) return toast.error('Discount must be between 0 and 100%');
    try {
      const payload = {
        ...form,
        purchasePrice: +form.purchasePrice,
        sellingPrice: +form.sellingPrice,
        discountPercent: +form.discountPercent || 0,
        stock: form.trackSerial ? undefined : +form.stock, // serial stock is driven by units
        lowStockAlert: +form.lowStockAlert,
        warrantyBrandMonths: +form.warrantyBrandMonths || 0,
        warrantyShopMonths: +form.warrantyShopMonths || 0,
        expiryDate: form.expiryDate || undefined,
      };
      await api.put(`/products/${editId}`, payload);
      toast.success('Saved'); setModal(false); load();
    } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
  };

  const saveNew = async () => {
    for (const it of items) {
      if (!it.name.trim()) return toast.error('Every item needs a name');
      if (isMedicineCat(it.category) && !it.expiryDate) return toast.error(`Expiry date is required for medicine: ${it.name}`);
      if (Number(it.discountPercent) < 0 || Number(it.discountPercent) > 100) return toast.error('Discount must be between 0 and 100%');
      if (it.trackSerial && !it.imeis.trim()) return toast.error(`Add at least one ${isMobile ? 'IMEI/serial' : 'unit code'} for ${it.name}`);
    }
    setSaving(true);
    try {
      const supplierName = supplier.name.trim();
      if (!supplierName && items.length === 1) {
        // no supplier + a single item → identical to the original simple Add Product flow
        const it = items[0];
        const payload = {
          ...it,
          purchasePrice: +it.purchasePrice, sellingPrice: +it.sellingPrice, discountPercent: +it.discountPercent || 0,
          stock: it.trackSerial ? undefined : +it.stock, lowStockAlert: +it.lowStockAlert,
          warrantyBrandMonths: +it.warrantyBrandMonths || 0, warrantyShopMonths: +it.warrantyShopMonths || 0,
          expiryDate: it.expiryDate || undefined,
        };
        delete payload.imeis;
        const { data } = await api.post('/products', payload);
        if (it.trackSerial) {
          const units = it.imeis.split('\n').map((l) => l.trim()).filter(Boolean).map((v) => (isMobile ? { imei1: v } : { serial: v }));
          if (units.length) await api.post('/units', { product: data.data.product._id, units });
        }
      } else {
        if (!supplierName) return toast.error('Supplier / dealer name is required when adding more than one item');
        await api.post('/products/batch-with-supplier', {
          supplierName, supplierPhone: supplier.phone, ...purchase, paid: +purchase.paid || 0,
          items: items.map((it) => ({
            ...it,
            purchasePrice: +it.purchasePrice, sellingPrice: +it.sellingPrice, discountPercent: +it.discountPercent || 0,
            stock: it.trackSerial ? undefined : +it.stock, lowStockAlert: +it.lowStockAlert,
            warrantyBrandMonths: +it.warrantyBrandMonths || 0, warrantyShopMonths: +it.warrantyShopMonths || 0,
            expiryDate: it.expiryDate || undefined,
            imeis: it.trackSerial ? it.imeis.split('\n').map((l) => l.trim()).filter(Boolean).map((v) => (isMobile ? { imei1: v } : { serial: v })) : undefined,
          })),
        });
      }
      toast.success('Saved'); setModal(false); load();
    } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
    setSaving(false);
  };

  const save = () => (editId ? saveEdit() : saveNew());

  const del = async (p) => {
    const ok = await confirm({
      title: 'Delete product?',
      message: `Are you sure you want to delete "${p.name}"? This action cannot be undone.`,
      confirmText: 'Delete', tone: 'danger',
    });
    if (!ok) return;
    await api.delete(`/products/${p._id}`); toast.success('Deleted'); load();
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setChk = (k) => (e) => setForm({ ...form, [k]: e.target.checked });

  const ExpiryCell = ({ p }) => {
    const st = expiryStatus(p.expiryDate);
    if (!p.expiryDate) return <span className="text-slate-400">—</span>;
    if (st === 'expired') return <span className="badge bg-red-100 text-red-700">Expired</span>;
    if (st === 'soon') return (
      <span className="badge bg-red-100 text-red-700 inline-flex items-center gap-1">
        <AlertTriangle size={12} /> {daysUntil(p.expiryDate)}d left
      </span>
    );
    return <span className="text-slate-500">{fmtDate(p.expiryDate)}</span>;
  };

  const variantLabel = (p) => [p.brand, p.storage, p.color].filter(Boolean).join(' – ');

  const columns = [
    { key: 'name', label: 'Name', render: (r) => (
      <div>
        <span className="font-medium">{r.name}</span>
        {isMobile && variantLabel(r) && <div className="text-xs text-slate-400">{variantLabel(r)}</div>}
        {r.supplier?.name && <div className="text-xs text-brand-500">Supplier: {r.supplier.name}</div>}
      </div>
    )},
    { key: 'category', label: 'Category' },
    ...(canViewBuyPrice ? [{ key: 'purchasePrice', label: 'Buy', className: 'text-right', render: (r) => taka(r.purchasePrice) }] : []),
    { key: 'sellingPrice', label: 'Sell', className: 'text-right', render: (r) => (
      (r.discountPercent > 0)
        ? <span><span className="line-through text-slate-400">{taka(r.sellingPrice)}</span> <span className="font-semibold">{taka(discounted(r))}</span></span>
        : taka(r.sellingPrice)
    )},
    { key: 'discountPercent', label: 'Disc %', className: 'text-right', render: (r) => (r.discountPercent > 0 ? `${r.discountPercent}%` : '—') },
    ...(!isMobile ? [{ key: 'expiry', label: 'Expiry', render: (r) => <ExpiryCell p={r} /> }] : []),
    ...(isMobile ? [{ key: 'warranty', label: 'Warranty', render: (r) => {
      const m = Math.max(r.warrantyBrandMonths || 0, r.warrantyShopMonths || 0);
      return m > 0 ? `${m} mo` : '—';
    }}] : []),
    { key: 'stock', label: 'Stock', className: 'text-right', render: (r) => (
      <span className={r.stock <= r.lowStockAlert ? 'text-red-500 font-semibold' : ''}>{r.stock} {r.unit}</span>
    )},
    { key: 'actions', label: '', className: 'text-right', render: (r) => (
      <div className="flex justify-end gap-2">
        {/* Quantity-only stock-in — no need to open the full edit form and retype
            the stock figure (serial-tracked items use the unit button instead,
            their quantity is derived from the unit codes). */}
        {!r.trackSerial && (
          <button onClick={() => setStockFor(r)} className="btn-ghost p-1.5 text-brand-600" title="Add / adjust quantity"><PackagePlus size={15} /></button>
        )}
        {serialEnabled && <button onClick={() => setLabelFor(r)} className="btn-ghost p-1.5" title="Print barcode label"><Tag size={15} /></button>}
        {serialEnabled && r.trackSerial && (
          <button onClick={() => setUnitsFor(r)} className="btn-ghost p-1.5" title={isMobile ? 'Manage IMEIs' : 'Manage unit codes'}><Barcode size={15} /></button>
        )}
        <button onClick={() => openEdit(r)} className="btn-ghost p-1.5"><Pencil size={15} /></button>
        <button onClick={() => del(r)} className="btn-ghost p-1.5 text-red-500"><Trash2 size={15} /></button>
      </div>
    )},
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Products</h1>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-ghost" onClick={() => setModelSearchOpen(true)}><Printer size={18} /> Stock Print by Model</button>
          <button className="btn-ghost" disabled={brandReportLoading} onClick={openBrandReport}><Printer size={18} /> Stock Print by Brands</button>
          <button className="btn-ghost" disabled={stockReportLoading} onClick={openStockReport}><Printer size={18} /> Stock Print</button>
          <button className="btn-primary" onClick={openNew}><Plus size={18} /> Add Product</button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={18} className="absolute left-3 top-2.5 text-slate-400" />
          <input className="input pl-10" placeholder={serialEnabled ? 'Search name / SKU / barcode / IMEI...' : 'Search name / SKU...'} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input sm:!w-52" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">All Categories</option>
          {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {serialEnabled && (
          <div className="relative flex-1 max-w-sm">
            <ScanLine size={18} className="absolute left-3 top-2.5 text-brand-500" />
            <input
              className="input pl-10"
              placeholder="Scan barcode to add stock / unit..."
              value={scanCode}
              onChange={(e) => setScanCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onScan(); }}
            />
          </div>
        )}
      </div>

      {/* Price panel — searching by name puts the buy/sell price right at the top,
          big enough to read at the counter without scanning across the table
          (and without scrolling sideways on a phone). Click a card to edit. */}
      {search.trim() && products.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400">
            Price for “{search.trim()}” — {products.length} match{products.length > 1 ? 'es' : ''}{products.length > PRICE_CARDS ? `, showing first ${PRICE_CARDS}` : ''}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {products.slice(0, PRICE_CARDS).map((p) => (
              <button key={p._id} onClick={() => openEdit(p)} className="card p-3 text-left hover:ring-2 hover:ring-brand-500 transition">
                <p className="font-medium truncate">{p.name}</p>
                <p className="text-xs text-slate-400 truncate">
                  {[isMobile && variantLabel(p), p.category, p.supplier?.name].filter(Boolean).join(' • ')}
                </p>
                <div className="flex items-end justify-between gap-2 mt-2">
                  {canViewBuyPrice && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-400">Buy</p>
                      <p className="font-semibold">{taka(p.purchasePrice)}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Sell</p>
                    <p className="text-lg font-bold text-brand-600">{taka(discounted(p))}</p>
                    {p.discountPercent > 0 && (
                      <p className="text-[11px] text-slate-400 line-through">{taka(p.sellingPrice)}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Stock</p>
                    <p className={`font-semibold ${p.stock <= p.lowStockAlert ? 'text-red-500' : ''}`}>{p.stock} {p.unit}</p>
                  </div>
                </div>
                {/* imported stock often has no price yet — say so instead of a bare ৳0.
                    A restricted staff never sees purchasePrice (always null), so their
                    "not set yet" check only looks at sellingPrice — otherwise every
                    product would wrongly look unpriced to them. */}
                {(canViewBuyPrice ? !p.purchasePrice && !p.sellingPrice : !p.sellingPrice) && (
                  <p className="text-[11px] text-amber-600 mt-1.5">Price not set yet — click to add it</p>
                )}
                {canViewBuyPrice && p.sellingPrice > 0 && p.purchasePrice > 0 && (
                  <p className="text-[11px] text-slate-400 mt-1.5">Profit {taka(discounted(p) - p.purchasePrice)} per {p.unit}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <DataTable columns={columns} rows={products} />
      {/* shared combobox options for the Category field (Edit form + create Item blocks) */}
      <datalist id="category-options">{categoryOptions.map((c) => <option key={c} value={c} />)}</datalist>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Edit Product' : 'Add Product'} size="lg"
        footer={<>
          {serialEnabled && editId && form.barcode && <button className="btn-ghost mr-auto" onClick={() => setLabelFor(form)}><Tag size={16} /> Print Label</button>}
          <button className="btn-ghost" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn-primary" disabled={saving} onClick={save}>Save</button>
        </>}>
        {editId ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="label">Name</label><input className="input" value={form.name} onChange={set('name')} placeholder={isMobile ? 'e.g. iPhone 15 Pro' : ''} /></div>
            {serialEnabled && (
              <div>
                <label className="label">Barcode</label>
                <input className="input font-mono" value={form.barcode || ''} onChange={set('barcode')} placeholder="Auto-generated on save" />
              </div>
            )}
            <div><label className="label">SKU / Product Code</label><input className="input" value={form.sku || ''} onChange={set('sku')} placeholder="Optional" /></div>
            <div>
              <label className="label">Category</label>
              <input className="input" list="category-options" value={form.category} onChange={set('category')} />
            </div>
            <div><label className="label">Unit</label><input className="input" value={form.unit} onChange={set('unit')} /></div>
            <div className="col-span-2">
              <label className="label">Supplier / Dealer</label>
              <select className="input" value={form.supplier || ''} onChange={set('supplier')}>
                <option value="">— None —</option>
                {supplierList.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>

            {isMobile && (
              <>
                <div><label className="label">Brand</label><input className="input" value={form.brand} onChange={set('brand')} placeholder="Apple, Samsung..." /></div>
                <div><label className="label">Storage (RAM/ROM)</label><input className="input" value={form.storage} onChange={set('storage')} placeholder="8GB/128GB" /></div>
                <div><label className="label">Color</label><input className="input" value={form.color} onChange={set('color')} placeholder="Black" /></div>
                <div><label className="label">Brand Warranty (months)</label><input className="input" type="number" min="0" value={form.warrantyBrandMonths} onChange={set('warrantyBrandMonths')} /></div>
                <div><label className="label">Shop Warranty (months)</label><input className="input" type="number" min="0" value={form.warrantyShopMonths} onChange={set('warrantyShopMonths')} /></div>
              </>
            )}

            {serialEnabled && (
              <div className="flex items-end">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!form.trackSerial} onChange={setChk('trackSerial')} />
                  {isMobile ? 'Track by IMEI / Serial' : 'Track each unit with a unique code'}
                </label>
              </div>
            )}

            {canViewBuyPrice && (
              <div><label className="label">Purchase Price</label><input className="input" type="number" value={form.purchasePrice} onChange={set('purchasePrice')} /></div>
            )}
            <div><label className="label">Selling Price</label><input className="input" type="number" value={form.sellingPrice} onChange={set('sellingPrice')} /></div>
            <div>
              <label className="label">Discount (%)</label>
              <input className="input" type="number" min="0" max="100" value={form.discountPercent} onChange={set('discountPercent')} />
            </div>
            <div className="flex flex-col justify-end">
              <span className="label">Discounted Price</span>
              <div className="input bg-slate-50 dark:bg-slate-800 flex items-center font-semibold">{taka(discounted({ sellingPrice: +form.sellingPrice || 0, discountPercent: +form.discountPercent || 0 }))}</div>
            </div>

            {form.trackSerial ? (
              <div className="col-span-2 text-xs text-slate-500 bg-slate-50 dark:bg-slate-800 rounded-lg p-2">
                Stock is managed automatically from the unit codes. Use the {isMobile ? 'IMEI' : 'unit'} button (▥) in the list to add {isMobile ? 'devices' : 'unit codes'}.
              </div>
            ) : (
              <div><label className="label">Stock</label><input className="input" type="number" value={form.stock} onChange={set('stock')} /></div>
            )}
            <div><label className="label">Low Stock Alert</label><input className="input" type="number" value={form.lowStockAlert} onChange={set('lowStockAlert')} /></div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.returnable !== false} onChange={setChk('returnable')} />
                Eligible for Return / Exchange
              </label>
            </div>

            {!isMobile && (
              <>
                <div>
                  <label className="label">Expiry Date {requiresExpiry && <span className="text-red-500">*</span>}</label>
                  <input className="input" type="date" value={form.expiryDate} onChange={set('expiryDate')} />
                </div>
                <div><label className="label">Batch No</label><input className="input" value={form.batchNo} onChange={set('batchNo')} /></div>
                {requiresExpiry && !form.expiryDate && (
                  <p className="col-span-2 text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={13} /> Expiry date is mandatory for medicines.</p>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((it, i) => (
              <ItemBlock key={i} item={it} index={i} onChange={setItemField} onRemove={removeItemBlock} canRemove={items.length > 1} isMobile={isMobile} serialEnabled={serialEnabled} />
            ))}
            <button type="button" className="btn-ghost" onClick={addItemBlock}><Plus size={15} /> Add Item</button>

            <div className="border-t border-slate-200 dark:border-slate-700 pt-3 space-y-3">
              <p className="text-sm font-semibold">Supplier / Dealer (optional)</p>
              <p className="text-xs text-slate-400">Record which supplier/dealer these items came from — auto-creates a purchase entry visible on the Suppliers page. Leave blank to just add the product(s) with no purchase record.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Supplier / Dealer Name</label>
                  <input className="input" list="supplier-names" value={supplier.name} onChange={(e) => setSupplier({ ...supplier, name: e.target.value })} placeholder="e.g. Anik Telecom" />
                  <datalist id="supplier-names">{supplierList.map((s) => <option key={s._id} value={s.name} />)}</datalist>
                </div>
                <div><label className="label">Phone</label><input className="input" value={supplier.phone} onChange={(e) => setSupplier({ ...supplier, phone: e.target.value })} /></div>
              </div>
              {supplier.name.trim() && (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Reference / Memo No</label><input className="input" value={purchase.reference} onChange={(e) => setPurchase({ ...purchase, reference: e.target.value })} /></div>
                  <div><label className="label">Note</label><input className="input" value={purchase.note} onChange={(e) => setPurchase({ ...purchase, note: e.target.value })} /></div>
                  <div><label className="label">Paid Now</label><input className="input" type="number" value={purchase.paid} onChange={(e) => setPurchase({ ...purchase, paid: e.target.value })} /></div>
                  <div><label className="label">Paid From</label>
                    <select className="input" value={purchase.source} onChange={(e) => setPurchase({ ...purchase, source: e.target.value })}>
                      <option value="cash">Cash</option><option value="bank">Bank</option><option value="bkash">bKash</option>
                      <option value="nagad">Nagad</option><option value="rocket">Rocket</option><option value="card">Card</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {stockFor && <StockAdjustModal product={stockFor} onClose={() => setStockFor(null)} onChanged={load} />}
      {unitsFor && <UnitsModal product={unitsFor} isMobile={isMobile} onClose={() => setUnitsFor(null)} onChanged={load} />}
      {labelFor && <LabelPrintModal product={labelFor} business={business} isMobile={isMobile} onClose={() => setLabelFor(null)} onChanged={load} />}

      <PrintWrapper open={stockReportOpen} onClose={() => setStockReportOpen(false)} title="Stock Report">
        {stockReport && <StockReport business={business} category={stockReport.category} groups={stockReport.groups} />}
      </PrintWrapper>

      <PrintWrapper open={brandReportOpen} onClose={() => setBrandReportOpen(false)} title="Stock Report by Brand">
        {brandReport && (
          <StockReportByBrand
            business={business}
            category={brandReport.category}
            groups={brandReport.groups}
            today={brandReport.today}
            lastDay={brandReport.lastDay}
          />
        )}
      </PrintWrapper>

      {/* Stock Print by Model — search a product by name, pick one, print its
          own sold/purchased/current-stock history. */}
      <Modal open={modelSearchOpen} onClose={() => { setModelSearchOpen(false); setModelSearch(''); setModelSuggestions([]); }} title="Stock Print by Model">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            autoFocus
            className="input pl-10"
            placeholder="Type a product name..."
            value={modelSearch}
            onChange={(e) => setModelSearch(e.target.value)}
          />
          {modelSuggestions.length > 0 && (
            <div className="mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700">
              {modelSuggestions.map((p) => (
                <button
                  key={p._id}
                  type="button"
                  disabled={modelLoading}
                  onClick={() => pickModel(p)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between gap-2"
                >
                  <span className="truncate">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-slate-400 ml-1">{p.category}{p.supplier?.name ? ` • ${p.supplier.name}` : ''}</span>
                  </span>
                  <span className="text-xs text-slate-400 shrink-0">{p.stock} pcs</span>
                </button>
              ))}
            </div>
          )}
          {modelSearch.trim() && modelSuggestions.length === 0 && (
            <p className="text-sm text-slate-400 mt-2">No matching product</p>
          )}
        </div>
      </Modal>

      <PrintWrapper open={modelReportOpen} onClose={() => setModelReportOpen(false)} title="Stock Report by Model">
        {modelReport && (
          <ProductStockReport
            business={business}
            product={modelReport.product}
            totalSold={modelReport.totalSold}
            totalReturned={modelReport.totalReturned}
            currentStock={modelReport.currentStock}
            suppliers={modelReport.suppliers}
            sales={modelReport.sales}
          />
        )}
      </PrintWrapper>
    </div>
  );
}

// One product's fields inside the Add Product (create) flow — a repeatable block so
// several items from the same supplier delivery can be entered in one go, each with
// its own inline IMEI/serial box instead of a separate save-then-add-units step.
function ItemBlock({ item, index, onChange, onRemove, canRemove, isMobile, serialEnabled }) {
  const set = (k) => (e) => onChange(index, k, e.target.value);
  const setChk = (k) => (e) => onChange(index, k, e.target.checked);
  const requiresExpiry = isMedicineCat(item.category);

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 relative">
      {canRemove && (
        <button type="button" className="absolute top-2 right-2 text-red-500" onClick={() => onRemove(index)} title="Remove item"><Trash2 size={15} /></button>
      )}
      <div className="grid grid-cols-2 gap-3 pr-6">
        <div className="col-span-2"><label className="label">Name</label><input className="input" value={item.name} onChange={set('name')} placeholder={isMobile ? 'e.g. iPhone 15 Pro' : ''} /></div>
        {serialEnabled && (
          <div><label className="label">Barcode</label><input className="input font-mono" value={item.barcode || ''} onChange={set('barcode')} placeholder="Auto-generated on save" /></div>
        )}
        <div><label className="label">SKU / Product Code</label><input className="input" value={item.sku || ''} onChange={set('sku')} placeholder="Optional" /></div>
        <div><label className="label">Category</label><input className="input" list="category-options" value={item.category} onChange={set('category')} /></div>
        <div><label className="label">Unit</label><input className="input" value={item.unit} onChange={set('unit')} /></div>

        {isMobile && (
          <>
            <div><label className="label">Brand</label><input className="input" value={item.brand} onChange={set('brand')} placeholder="Apple, Samsung..." /></div>
            <div><label className="label">Storage (RAM/ROM)</label><input className="input" value={item.storage} onChange={set('storage')} placeholder="8GB/128GB" /></div>
            <div><label className="label">Color</label><input className="input" value={item.color} onChange={set('color')} placeholder="Black" /></div>
            <div><label className="label">Brand Warranty (months)</label><input className="input" type="number" min="0" value={item.warrantyBrandMonths} onChange={set('warrantyBrandMonths')} /></div>
            <div><label className="label">Shop Warranty (months)</label><input className="input" type="number" min="0" value={item.warrantyShopMonths} onChange={set('warrantyShopMonths')} /></div>
          </>
        )}

        {serialEnabled && (
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!item.trackSerial} onChange={setChk('trackSerial')} />
              {isMobile ? 'Track by IMEI / Serial' : 'Track each unit with a unique code'}
            </label>
          </div>
        )}

        <div><label className="label">Purchase Price</label><input className="input" type="number" value={item.purchasePrice} onChange={set('purchasePrice')} /></div>
        <div><label className="label">Selling Price</label><input className="input" type="number" value={item.sellingPrice} onChange={set('sellingPrice')} /></div>
        <div>
          <label className="label">Discount (%)</label>
          <input className="input" type="number" min="0" max="100" value={item.discountPercent} onChange={set('discountPercent')} />
        </div>
        <div className="flex flex-col justify-end">
          <span className="label">Discounted Price</span>
          <div className="input bg-slate-50 dark:bg-slate-800 flex items-center font-semibold">{taka(discounted({ sellingPrice: +item.sellingPrice || 0, discountPercent: +item.discountPercent || 0 }))}</div>
        </div>

        {item.trackSerial ? (
          <div className="col-span-2">
            <label className="label">{isMobile ? 'IMEI / Serial (one per line)' : 'Unit Codes (one per line)'}</label>
            <textarea className="input h-20 font-mono text-xs" value={item.imeis} onChange={set('imeis')} placeholder={isMobile ? '356789...\n356790...' : 'code-001\ncode-002'} />
          </div>
        ) : (
          <div><label className="label">Stock</label><input className="input" type="number" value={item.stock} onChange={set('stock')} /></div>
        )}
        <div><label className="label">Low Stock Alert</label><input className="input" type="number" value={item.lowStockAlert} onChange={set('lowStockAlert')} /></div>
        <div className="flex items-end">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={item.returnable !== false} onChange={setChk('returnable')} />
            Eligible for Return / Exchange
          </label>
        </div>

        {!isMobile && (
          <>
            <div>
              <label className="label">Expiry Date {requiresExpiry && <span className="text-red-500">*</span>}</label>
              <input className="input" type="date" value={item.expiryDate} onChange={set('expiryDate')} />
            </div>
            <div><label className="label">Batch No</label><input className="input" value={item.batchNo} onChange={set('batchNo')} /></div>
            {requiresExpiry && !item.expiryDate && (
              <p className="col-span-2 text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={13} /> Expiry date is mandatory for medicines.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---- Quick stock quantity change (non-serial products) ----
// Restocking used to mean opening Edit Product and retyping the stock number,
// which is easy to get wrong (type 5 over 50 and 45 units vanish). Here the
// owner types only how many arrived; the new total is shown before saving.
function StockAdjustModal({ product, onClose, onChanged }) {
  const [mode, setMode] = useState('add'); // add | remove | set
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const current = Number(product.stock) || 0;
  const n = Number(qty) || 0;
  const after = mode === 'set' ? n : mode === 'remove' ? current - n : current + n;
  const invalid = !qty.toString().trim() || n < 0 || after < 0;

  const submit = async () => {
    if (invalid) return toast.error(after < 0 ? `Only ${current} in stock` : 'Enter a quantity');
    setSaving(true);
    try {
      await api.patch(`/products/${product._id}/stock`, { qty: n, mode, note });
      toast.success(`Stock updated — ${product.name} is now ${after} ${product.unit}`);
      onChanged?.(); onClose();
    } catch (e) { toast.error(e.response?.data?.message || 'Could not update stock'); }
    setSaving(false);
  };

  const modes = [
    { k: 'add', label: 'Add stock' },
    { k: 'remove', label: 'Remove' },
    { k: 'set', label: 'Set exact' },
  ];

  return (
    <Modal open onClose={onClose} title={`Stock — ${product.name}`}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={saving || invalid} onClick={submit}>Save</button></>}>
      <div className="space-y-3">
        <p className="text-sm text-slate-500">Current stock: <strong className="text-slate-700 dark:text-slate-200">{current} {product.unit}</strong></p>

        <div className="flex gap-2">
          {modes.map((m) => (
            <button key={m.k} type="button" onClick={() => setMode(m.k)}
              className={`flex-1 text-sm py-2 rounded-lg border transition ${mode === m.k
                ? 'bg-brand-600 text-white border-brand-600'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
              {m.label}
            </button>
          ))}
        </div>

        <div>
          <label className="label">{mode === 'set' ? 'New total quantity' : 'Quantity'}</label>
          <input className="input" type="number" min="0" autoFocus value={qty}
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !invalid) submit(); }}
            placeholder={mode === 'add' ? 'How many arrived?' : mode === 'remove' ? 'How many to remove?' : 'Counted quantity'} />
        </div>

        <div className="flex gap-2">
          {[1, 5, 10, 20, 50].map((v) => (
            <button key={v} type="button" className="btn-ghost text-xs px-2 py-1"
              onClick={() => setQty(String((Number(qty) || 0) + v))}>+{v}</button>
          ))}
        </div>

        <div><label className="label">Note (optional)</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. new delivery, damaged, stock count" />
        </div>

        <div className={`rounded-lg p-3 text-sm ${after < 0 ? 'bg-red-50 text-red-600 dark:bg-red-900/20' : 'bg-slate-50 dark:bg-slate-800'}`}>
          New stock: <strong>{Math.max(0, after)} {product.unit}</strong>
          {after < 0 && <span className="ml-1">— more than the {current} in stock</span>}
        </div>
      </div>
    </Modal>
  );
}

// ---- Unique per-unit code manager (Mobile: IMEI/Serial · General: unique code) ----
function UnitsModal({ product, isMobile, onClose, onChanged }) {
  const [units, setUnits] = useState([]);
  const [row, setRow] = useState({ imei1: '', imei2: '', serial: '' });
  const [bulk, setBulk] = useState('');
  const [genCount, setGenCount] = useState(10);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const { data } = await api.get('/units', { params: { product: product._id } });
    setUnits(data.data.units);
  };
  useEffect(() => { load(); }, [product._id]);

  // While this modal is open it takes over the connected phone scanner (the
  // Products page's own subscription is paused for exactly this reason — see
  // there) — a scanned device IMEI/serial adds a unit straight to THIS product,
  // the same as typing it into the box below and clicking Add.
  const { subscribe } = useScanner();
  useEffect(() => subscribe((code) => {
    const value = code.trim();
    if (value) submit([isMobile ? { imei1: value } : { serial: value }]);
  }), [subscribe, isMobile]);

  const submit = async (payloadUnits) => {
    if (!payloadUnits.length) return;
    setLoading(true);
    try {
      await api.post('/units', { product: product._id, units: payloadUnits });
      toast.success(isMobile ? 'Device(s) added' : 'Unit(s) added');
      setRow({ imei1: '', imei2: '', serial: '' }); setBulk('');
      await load(); onChanged?.();
    } catch (e) { toast.error(e.response?.data?.message || 'Error adding units'); }
    setLoading(false);
  };

  const addOne = () => {
    if (isMobile) {
      if (!row.imei1.trim() && !row.serial.trim()) return toast.error('Enter an IMEI or serial');
      submit([row]);
    } else {
      if (!row.serial.trim()) return toast.error('Enter a unique code');
      submit([{ serial: row.serial.trim() }]);
    }
  };
  const addBulk = () => {
    const raw = bulk.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!raw.length) return toast.error(isMobile ? 'Paste at least one IMEI/serial' : 'Paste at least one code');
    const unique = [...new Set(raw)]; // drop repeated lines instead of erroring
    if (unique.length < raw.length) toast(`Skipped ${raw.length - unique.length} duplicate line(s)`, { icon: '⚠️' });
    submit(unique.map((v) => (isMobile ? { imei1: v } : { serial: v })));
  };
  // For items with no real IMEI/code (accessories, general merchandise): auto-create
  // N unique serials so each unit gets its own scannable barcode label.
  const generateSerials = () => {
    const n = Math.max(1, Math.min(200, Number(genCount) || 1));
    // 9-digit time slice + 3-digit index = 12 digits, matching product-barcode
    // length so the printed Code128-C barcode stays compact and easy to scan.
    const base = String(Date.now()).slice(-9);
    const list = Array.from({ length: n }, (_, i) => ({ serial: `${base}${String(i).padStart(3, '0')}` }));
    submit(list);
  };
  const remove = async (u) => {
    try { await api.delete(`/units/${u._id}`); await load(); onChanged?.(); }
    catch (e) { toast.error(e.response?.data?.message || 'Error'); }
  };

  const inStock = units.filter((u) => u.status === 'in_stock').length;

  return (
    <Modal open onClose={onClose} title={isMobile ? `IMEIs — ${product.name}` : `Unique Codes — ${product.name}`} size="lg"
      footer={<button className="btn-ghost" onClick={onClose}>Close</button>}>
      <p className="text-sm text-slate-500 mb-3">In stock: <strong>{inStock}</strong> • Total units: {units.length}</p>

      {isMobile ? (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end mb-3">
          <div><label className="label">IMEI 1</label><input className="input" value={row.imei1} onChange={(e) => setRow({ ...row, imei1: e.target.value })} /></div>
          <div><label className="label">IMEI 2</label><input className="input" value={row.imei2} onChange={(e) => setRow({ ...row, imei2: e.target.value })} /></div>
          <div><label className="label">Serial</label><input className="input" value={row.serial} onChange={(e) => setRow({ ...row, serial: e.target.value })} /></div>
          <button className="btn-primary" disabled={loading} onClick={addOne}><Plus size={16} /> Add</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end mb-3">
          <div><label className="label">Unique Code</label><input className="input" value={row.serial} onChange={(e) => setRow({ ...row, serial: e.target.value })} /></div>
          <button className="btn-primary" disabled={loading} onClick={addOne}><Plus size={16} /> Add</button>
        </div>
      )}

      <div className="mb-4">
        <label className="label">Bulk add (one {isMobile ? 'IMEI' : 'code'} per line)</label>
        <textarea className="input h-20" value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder="356789...&#10;356790..." />
        <button className="btn-ghost mt-2" disabled={loading} onClick={addBulk}>Add All</button>
      </div>

      <div className="mb-4 bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
        <label className="label">{isMobile ? 'No IMEI? Generate unique serials' : 'Generate unique codes'}</label>
        <p className="text-xs text-slate-400 mb-2">Creates unique auto-numbers so each unit gets its own scannable barcode{isMobile ? ' (useful for accessories without an IMEI)' : ''}.</p>
        <div className="flex items-end gap-2">
          <div><label className="label">How many</label><input className="input !w-28" type="number" min="1" max="200" value={genCount} onChange={(e) => setGenCount(e.target.value)} /></div>
          <button className="btn-primary" disabled={loading} onClick={generateSerials}><Plus size={16} /> Generate &amp; Add</button>
        </div>
      </div>

      <div className="max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-700/50 text-left">
            {isMobile ? (
              <tr><th className="px-3 py-2">IMEI 1</th><th className="px-3 py-2">IMEI 2</th><th className="px-3 py-2">Serial</th><th className="px-3 py-2">Status</th><th></th></tr>
            ) : (
              <tr><th className="px-3 py-2">Code</th><th className="px-3 py-2">Status</th><th></th></tr>
            )}
          </thead>
          <tbody>
            {units.length === 0 && <tr><td colSpan={isMobile ? 5 : 3} className="px-3 py-6 text-center text-slate-400">No units yet</td></tr>}
            {isMobile ? units.map((u) => (
              <tr key={u._id} className="border-t border-slate-100 dark:border-slate-700">
                <td className="px-3 py-2">{u.imei1 || '—'}</td>
                <td className="px-3 py-2">{u.imei2 || '—'}</td>
                <td className="px-3 py-2">{u.serial || '—'}</td>
                <td className="px-3 py-2">
                  <span className={`badge ${u.status === 'in_stock' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>{u.status === 'in_stock' ? 'In-Stock' : 'Sold'}</span>
                </td>
                <td className="px-3 py-2 text-right">
                  {u.status === 'in_stock' && <button className="text-red-500" onClick={() => remove(u)}><Trash2 size={14} /></button>}
                </td>
              </tr>
            )) : units.map((u) => (
              <tr key={u._id} className="border-t border-slate-100 dark:border-slate-700">
                <td className="px-3 py-2 font-mono">{u.serial || u.imei1 || '—'}</td>
                <td className="px-3 py-2">
                  <span className={`badge ${u.status === 'in_stock' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>{u.status === 'in_stock' ? 'In-Stock' : 'Sold'}</span>
                </td>
                <td className="px-3 py-2 text-right">
                  {u.status === 'in_stock' && <button className="text-red-500" onClick={() => remove(u)}><Trash2 size={14} /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
