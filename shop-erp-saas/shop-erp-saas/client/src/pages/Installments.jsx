import { useEffect, useState } from 'react';
import { Plus, CalendarClock, Trash2, CheckCircle2, ScanLine, Printer, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios.js';
import DataTable from '../components/ui/DataTable.jsx';
import Modal from '../components/ui/Modal.jsx';
import StatCard from '../components/ui/StatCard.jsx';
import PrintWrapper from '../components/print/PrintWrapper.jsx';
import EmiPaymentInvoice from '../components/print/EmiPaymentInvoice.jsx';
import { taka, fmtDate } from '../utils/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';

const balance = (p) => {
  const paid = (p.schedule || []).filter((s) => s.paid).reduce((a, s) => a + s.amount, 0);
  return Math.max(0, (p.totalAmount || 0) - (p.downPayment || 0) - paid);
};
// Profit on an EMI plan, and how much of it has been earned so far. Mirrors the
// server (services/emiService.js): profit is recognised in step with the money
// collected, so a half-paid plan has earned half its profit — never all of it up
// front. No item cost recorded ⇒ no profit claimed at all.
const planProfit = (p) => {
  const total = Number(p.totalAmount) || 0;
  const cost = Number(p.purchasePrice) || 0;
  return total > 0 && cost > 0 ? Math.round((total - cost) * 100) / 100 : 0;
};
const collectedOf = (p) => {
  const paid = (p.schedule || []).filter((s) => s.paid).reduce((a, s) => a + s.amount, 0);
  return Math.round(((Number(p.downPayment) || 0) + paid) * 100) / 100;
};
const profitEarned = (p) => {
  const total = Number(p.totalAmount) || 0;
  const prof = planProfit(p);
  return total > 0 && prof ? Math.round((collectedOf(p) / total) * prof * 100) / 100 : 0;
};
const rowProfit = (p, amount) => {
  const total = Number(p.totalAmount) || 0;
  const prof = planProfit(p);
  return total > 0 && prof ? Math.round(((Number(amount) || 0) / total) * prof * 100) / 100 : 0;
};

const emptyForm = {
  customer: '', customerName: '', productName: '',
  basePrice: '', extraProfit: '', extraProfitPercent: '', totalAmount: '', purchasePrice: '',
  downPayment: 0, downPaymentMethod: 'cash', months: 3, firstDueDate: '',
  product: null, unit: null, imei1: '', imei2: '', serial: '', trackSerial: false,
  customerPhone: '', customerNid: '', presentAddress: '', permanentAddress: '',
  fatherName: '', fatherNid: '', fatherPhone: '', motherName: '', motherNid: '', motherPhone: '',
  guarantorName: '', guarantorPhone: '', guarantorNid: '', guarantorAddress: '',
};

export default function Installments() {
  const confirm = useConfirm();
  const { business } = useAuth();
  const [plans, setPlans] = useState([]);
  const [emiReceivable, setEmiReceivable] = useState(0);
  const [customers, setCustomers] = useState([]);
  const [modal, setModal] = useState(false);
  const [detail, setDetail] = useState(null);
  const [costEdit, setCostEdit] = useState(null); // null = closed, string = editing the plan's item cost
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [imeiScan, setImeiScan] = useState('');
  // product picking by name (not every product has a printed barcode — imported
  // stock has none at all — so scanning alone left the EMI item unlinked, which
  // is why EMI sales weren't deducting stock)
  const [prodSearch, setProdSearch] = useState('');
  const [prodResults, setProdResults] = useState([]);
  const [units, setUnits] = useState([]); // in-stock devices of the picked product
  const [newCustomer, setNewCustomer] = useState(false);
  // pay flow
  const [payRow, setPayRow] = useState(null); // { plan, no }
  const [payMethod, setPayMethod] = useState('cash');
  const [receipt, setReceipt] = useState(null); // { installment, row }

  const load = async () => {
    const { data } = await api.get('/installments');
    setPlans(data.data.installments);
    setEmiReceivable(data.data.emiReceivable || 0);
  };
  useEffect(() => { load(); api.get('/customers').then(({ data }) => setCustomers(data.data.customers)); }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const pickCustomer = (id) => {
    if (id === '__new') {
      setNewCustomer(true);
      return setForm({ ...form, customer: '', customerName: '', customerPhone: '', customerNid: '' });
    }
    setNewCustomer(false);
    const c = customers.find((x) => x._id === id);
    setForm({ ...form, customer: id, customerName: c?.name || '', customerPhone: c?.phone || form.customerPhone, customerNid: c?.nid || form.customerNid });
  };

  // ---- picking the financed item ----------------------------------------
  // Filling these fields is what turns an EMI plan into a real sale: the linked
  // product is what gets stocked out, and its purchase price is the cost basis
  // the profit is calculated from.
  const applyProduct = async (p, unit = null) => {
    const price = p.discountPercent > 0 ? Math.round(p.sellingPrice * (1 - p.discountPercent / 100)) : p.sellingPrice;
    setForm((f) => ({
      ...f,
      product: p._id,
      productName: [p.name, [p.brand, p.storage, p.color].filter(Boolean).join(' ')].filter(Boolean).join(' — '),
      // the product's own price comes up; any EMI markup is added on top below
      basePrice: price,
      extraProfit: '', extraProfitPercent: '',
      totalAmount: price,
      purchasePrice: p.purchasePrice || '',
      trackSerial: !!p.trackSerial,
      unit: unit?._id || null,
      imei1: unit?.imei1 || '', imei2: unit?.imei2 || '', serial: unit?.serial || '',
    }));
    setProdSearch(''); setProdResults([]);
    if (p.trackSerial) {
      try {
        const { data } = await api.get('/units', { params: { product: p._id, status: 'in_stock' } });
        setUnits(data.data.units);
      } catch { setUnits([]); }
    } else setUnits([]);
  };

  // debounce the product search so typing doesn't hammer the server
  useEffect(() => {
    const term = prodSearch.trim();
    if (term.length < 2) { setProdResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get('/products', { params: { search: term } });
        setProdResults(data.data.products.filter((p) => p.stock > 0).slice(0, 8));
      } catch { setProdResults([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [prodSearch]);

  // One scan box for everything: a device's own IMEI/serial picks the product AND
  // that exact device; a product barcode picks just the product (same rule as POS).
  const scanAny = async () => {
    const code = barcode.trim();
    if (!code) return;
    try {
      const { data } = await api.get('/units/lookup', { params: { imei: code } });
      const u = data.data.unit;
      if (!u.product?._id) throw new Error('no product');
      await applyProduct(u.product, u);
      setBarcode('');
      return toast.success(`${u.product.name} — device linked`);
    } catch { /* not a device code — try a product barcode next */ }
    try {
      const { data } = await api.get(`/products/barcode/${encodeURIComponent(code)}`);
      const p = data.data.product;
      await applyProduct(p);
      setBarcode('');
      toast.success(p.trackSerial ? `${p.name} — now pick/scan the device IMEI` : `${p.name} selected`);
    } catch (e) { toast.error(e.response?.data?.message || 'No product or device found for that code'); }
  };

  const scanImei = async () => {
    const term = imeiScan.trim();
    if (!term) return;
    try {
      const { data } = await api.get('/units/lookup', { params: { imei: term } });
      const u = data.data.unit;
      if (form.product && String(u.product?._id || u.product) !== String(form.product)) {
        return toast.error('This device does not match the selected product');
      }
      setForm((f) => ({ ...f, unit: u._id, imei1: u.imei1, imei2: u.imei2, serial: u.serial }));
      setImeiScan('');
      toast.success('Device linked');
    } catch (e) { toast.error(e.response?.data?.message || 'Device not found'); }
  };

  // ---- price + EMI markup -----------------------------------------------
  // The scanned product's own price fills "Product Price". On top of that the
  // shopkeeper can charge extra for selling on credit — either a flat amount or
  // a percentage of the product price. The three boxes stay in step: change one
  // and the others follow, and the EMI Price can still be overtyped directly.
  const r2 = (n) => Math.round(n * 100) / 100;

  const setBasePrice = (v) => {
    const base = Number(v) || 0;
    const amt = Number(form.extraProfit) || 0;
    setForm((f) => ({
      ...f,
      basePrice: v,
      extraProfitPercent: base > 0 && amt ? r2((amt / base) * 100) : f.extraProfitPercent,
      totalAmount: r2(base + amt),
    }));
  };

  const setExtraAmount = (v) => {
    const amt = Number(v) || 0;
    const base = Number(form.basePrice) || 0;
    setForm((f) => ({
      ...f,
      extraProfit: v,
      extraProfitPercent: base > 0 ? r2((amt / base) * 100) : '',
      totalAmount: r2(base + amt),
    }));
  };

  const setExtraPercent = (v) => {
    const pct = Number(v) || 0;
    const base = Number(form.basePrice) || 0;
    const amt = r2((base * pct) / 100);
    setForm((f) => ({
      ...f,
      extraProfitPercent: v,
      extraProfit: base > 0 ? amt : '',
      totalAmount: r2(base + amt),
    }));
  };

  const setTotalAmount = (v) => {
    const total = Number(v) || 0;
    const base = Number(form.basePrice) || 0;
    const amt = r2(Math.max(0, total - base));
    setForm((f) => ({
      ...f,
      totalAmount: v,
      extraProfit: base > 0 ? amt : f.extraProfit,
      extraProfitPercent: base > 0 ? r2((amt / base) * 100) : f.extraProfitPercent,
    }));
  };

  // Re-verifies the picked device against the server before locking it into the
  // plan — the dropdown's list was fetched once when the product was applied and
  // can go stale by the time it's picked (deleted/corrected in Products, or sold
  // through POS in another tab). Same reasoning as POS's pushUnit: catch it right
  // here instead of surprising the shopkeeper at "Create Plan".
  const pickUnit = async (id) => {
    if (!id) return setForm((f) => ({ ...f, unit: null, imei1: '', imei2: '', serial: '' }));
    const cached = units.find((x) => x._id === id);
    const code = cached ? (cached.imei1 || cached.serial) : id;
    try {
      const { data } = await api.get('/units/lookup', { params: { imei: code } });
      const u = data.data.unit;
      setForm((f) => ({ ...f, unit: u._id, imei1: u.imei1, imei2: u.imei2, serial: u.serial }));
    } catch {
      toast.error('This device is no longer available — it may have been removed or already sold');
      setUnits((list) => list.filter((x) => x._id !== id));
      setForm((f) => ({ ...f, unit: null, imei1: '', imei2: '', serial: '' }));
    }
  };

  const create = async () => {
    if (!form.customer && !form.customerName.trim() && !form.customerPhone.trim()) {
      return toast.error("Select a customer, or type the buyer's name and phone");
    }
    if (Number(form.totalAmount) <= 0) return toast.error('Enter a valid total amount');
    if (Number(form.months) < 1) return toast.error('Months must be at least 1');
    if (form.trackSerial && !form.unit) return toast.error('Pick or scan the device IMEI/serial');
    if (form.product && !(Number(form.purchasePrice) > 0)) {
      const go = await confirm({
        title: 'No item cost entered',
        message: 'Without the purchase price this plan can never show any profit. Create it anyway?',
        confirmText: 'Create anyway',
      });
      if (!go) return;
    }
    setSaving(true);
    try {
      await api.post('/installments', {
        ...form,
        totalAmount: Number(form.totalAmount),
        basePrice: Number(form.basePrice) || 0,
        purchasePrice: Number(form.purchasePrice) || 0,
        downPayment: Number(form.downPayment || 0),
        months: Number(form.months),
        customer: form.customer || null,
      });
      toast.success(form.product ? 'EMI plan created — item stocked out' : 'EMI plan created');
      setModal(false);
      setForm(emptyForm); setBarcode(''); setImeiScan(''); setProdSearch(''); setProdResults([]); setUnits([]); setNewCustomer(false);
      load();
      api.get('/customers').then(({ data }) => setCustomers(data.data.customers)).catch(() => {});
    } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
    setSaving(false);
  };

  // profit carried by one instalment = its share of the plan × the plan's profit
  const totalNum = Number(form.totalAmount) || 0;
  const costNum = Number(form.purchasePrice) || 0;
  const monthsNum = Math.max(1, Number(form.months) || 1);
  const financedNum = Math.max(0, totalNum - (Number(form.downPayment) || 0));
  const profitPerInstalment = totalNum > 0 && costNum > 0
    ? Math.round(((financedNum / monthsNum) / totalNum) * (totalNum - costNum) * 100) / 100
    : 0;

  // Fill in / correct the cost basis on an existing plan (plans made before the
  // cost field existed show no profit until this is set).
  const saveCost = async () => {
    const v = Number(costEdit);
    if (!Number.isFinite(v) || v < 0) return toast.error('Enter a valid cost');
    try {
      const { data } = await api.patch(`/installments/${detail._id}/cost`, { purchasePrice: v });
      setDetail(data.data.installment);
      setCostEdit(null);
      toast.success('Item cost saved');
      load();
    } catch (e) { toast.error(e.response?.data?.message || 'Could not save the cost'); }
  };

  const openPay = (plan, no) => { setPayRow({ plan, no }); setPayMethod('cash'); };
  const confirmPay = async () => {
    try {
      const { data } = await api.patch(`/installments/${payRow.plan._id}/pay`, { no: payRow.no, method: payMethod });
      setDetail(data.data.installment);
      setReceipt({ installment: data.data.installment, row: data.data.paidRow });
      setPayRow(null);
      load();
      toast.success('Instalment paid');
    } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
  };

  const del = async (plan) => {
    const ok = await confirm({ title: 'Delete EMI plan?', message: 'This will remove the instalment plan permanently.', confirmText: 'Delete', tone: 'danger' });
    if (!ok) return;
    await api.delete(`/installments/${plan._id}`); toast.success('Deleted'); load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2"><CalendarClock size={24} /> EMI / Installments</h1>
        <button className="btn-primary" onClick={() => { setForm(emptyForm); setModal(true); }}><Plus size={18} /> New EMI Plan</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={CalendarClock} label="Total EMI Receivable" value={taka(emiReceivable)} accent="red" />
        <StatCard icon={CheckCircle2} label="Active Plans" value={plans.filter((p) => p.status === 'active').length} accent="amber" />
        <StatCard icon={CheckCircle2} label="Completed Plans" value={plans.filter((p) => p.status === 'completed').length} accent="green" />
      </div>

      <DataTable
        columns={[
          { key: 'customerName', label: 'Customer', render: (r) => r.customerName || '—' },
          { key: 'productName', label: 'Item', render: (r) => (
            <div>{r.productName || '—'}{r.imei1 && <div className="text-xs text-slate-400">IMEI: {r.imei1}</div>}</div>
          )},
          { key: 'totalAmount', label: 'Total', className: 'text-right', render: (r) => (
            <div>
              <div>{taka(r.totalAmount)}</div>
              {planProfit(r) > 0
                ? <div className="text-xs text-green-600">profit {taka(profitEarned(r))} / {taka(planProfit(r))}</div>
                : <div className="text-xs text-amber-600">no cost set</div>}
            </div>
          )},
          { key: 'downPayment', label: 'Down', className: 'text-right', render: (r) => taka(r.downPayment) },
          { key: 'months', label: 'Months', className: 'text-right' },
          { key: 'balance', label: 'Balance', className: 'text-right', render: (r) => (
            <span className={balance(r) > 0 ? 'text-red-500 font-semibold' : 'text-green-600'}>{taka(balance(r))}</span>
          )},
          { key: 'status', label: 'Status', render: (r) => (
            <span className={`badge ${r.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{r.status}</span>
          )},
          { key: 'actions', label: '', className: 'text-right', render: (r) => (
            <div className="flex justify-end gap-1">
              <button className="btn-ghost text-xs" onClick={() => setDetail(r)}>View / Pay</button>
              <button className="btn-ghost p-1.5 text-red-500" onClick={() => del(r)}><Trash2 size={15} /></button>
            </div>
          )},
        ]}
        rows={plans}
        empty="No EMI plans yet"
      />

      {/* Create */}
      <Modal open={modal} onClose={() => setModal(false)} title="New EMI Plan" size="xl"
        footer={<><button className="btn-ghost" onClick={() => setModal(false)}>Cancel</button><button className="btn-primary" disabled={saving} onClick={create}>Create Plan</button></>}>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">Item — sold from stock</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Scan Barcode / IMEI</label>
                <div className="flex gap-2">
                  <ScanLine size={18} className="mt-2.5 text-brand-500 shrink-0" />
                  <input className="input" value={barcode} onChange={(e) => setBarcode(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') scanAny(); }} placeholder="Scan the box or the device..." />
                </div>
              </div>
              <div className="relative">
                <label className="label">…or search by name</label>
                <div className="flex gap-2">
                  <Search size={18} className="mt-2.5 text-brand-500 shrink-0" />
                  <input className="input" value={prodSearch} onChange={(e) => setProdSearch(e.target.value)} placeholder="Type the product name..." />
                </div>
                {prodResults.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto card p-1 shadow-lg">
                    {prodResults.map((p) => (
                      <button key={p._id} type="button" onClick={() => applyProduct(p)}
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-sm">
                        <span className="font-medium">{p.name}</span>
                        <span className="text-xs text-slate-400"> · {p.stock} in stock · {taka(p.sellingPrice)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {form.product && (
                <p className="col-span-2 text-xs text-green-600">
                  ✓ {form.productName} will be stocked out of Products when this plan is created.
                </p>
              )}

              {form.trackSerial && (
                <>
                  <div>
                    <label className="label">Device (IMEI / Serial)</label>
                    <select className="input" value={form.unit || ''} onChange={(e) => pickUnit(e.target.value)}>
                      <option value="">Select an in-stock device</option>
                      {units.map((u) => <option key={u._id} value={u._id}>{u.imei1 || u.serial}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">…or scan it</label>
                    <div className="flex gap-2">
                      <ScanLine size={18} className="mt-2.5 text-brand-500 shrink-0" />
                      <input className="input" value={imeiScan} onChange={(e) => setImeiScan(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') scanImei(); }} placeholder="Scan IMEI..." />
                    </div>
                    {form.imei1 && <p className="text-xs text-green-600 mt-1">✓ Linked: {form.imei1}</p>}
                  </div>
                </>
              )}
              <div className="col-span-2"><label className="label">Item / Description</label><input className="input" value={form.productName} onChange={set('productName')} placeholder="e.g. iPhone 15 Pro 128GB" /></div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">Customer</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">Customer</label>
                <select className="input" value={newCustomer ? '__new' : form.customer} onChange={(e) => pickCustomer(e.target.value)}>
                  <option value="">Select customer</option>
                  <option value="__new">+ New customer (enter details below)</option>
                  {customers.map((c) => <option key={c._id} value={c._id}>{c.name}{c.phone ? ` — ${c.phone}` : ''}</option>)}
                </select>
              </div>
              {newCustomer && (
                <div className="col-span-2">
                  <label className="label">Customer Name</label>
                  <input className="input" value={form.customerName} onChange={set('customerName')} placeholder="Buyer's full name" />
                </div>
              )}
              <div><label className="label">Customer Mobile</label><input className="input" value={form.customerPhone} onChange={set('customerPhone')} /></div>
              <div><label className="label">Customer NID</label><input className="input" value={form.customerNid} onChange={set('customerNid')} /></div>
              <div><label className="label">Present Address</label><input className="input" value={form.presentAddress} onChange={set('presentAddress')} /></div>
              <div><label className="label">Permanent Address</label><input className="input" value={form.permanentAddress} onChange={set('permanentAddress')} /></div>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
            <p className="text-xs font-semibold text-slate-500 mb-2">Parents' Info</p>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="label">Father's Name</label><input className="input" value={form.fatherName} onChange={set('fatherName')} /></div>
              <div><label className="label">Father's NID</label><input className="input" value={form.fatherNid} onChange={set('fatherNid')} /></div>
              <div><label className="label">Father's Mobile</label><input className="input" value={form.fatherPhone} onChange={set('fatherPhone')} /></div>
              <div><label className="label">Mother's Name</label><input className="input" value={form.motherName} onChange={set('motherName')} /></div>
              <div><label className="label">Mother's NID</label><input className="input" value={form.motherNid} onChange={set('motherNid')} /></div>
              <div><label className="label">Mother's Mobile</label><input className="input" value={form.motherPhone} onChange={set('motherPhone')} /></div>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
            <p className="text-xs font-semibold text-slate-500 mb-2">Guarantor</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Guarantor Name</label><input className="input" value={form.guarantorName} onChange={set('guarantorName')} /></div>
              <div><label className="label">Guarantor Mobile</label><input className="input" value={form.guarantorPhone} onChange={set('guarantorPhone')} /></div>
              <div><label className="label">Guarantor NID</label><input className="input" value={form.guarantorNid} onChange={set('guarantorNid')} /></div>
              <div><label className="label">Guarantor Address</label><input className="input" value={form.guarantorAddress} onChange={set('guarantorAddress')} /></div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">Payment Plan</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Product Price</label>
                <input className="input" type="number" value={form.basePrice} onChange={(e) => setBasePrice(e.target.value)} placeholder="Comes from the scanned product" />
              </div>
              <div>
                <label className="label">Item Cost (what you paid)</label>
                <input className="input" type="number" value={form.purchasePrice} onChange={set('purchasePrice')} placeholder="Auto-filled from the product" />
              </div>
              <div>
                <label className="label">Extra Profit (৳)</label>
                <input className="input" type="number" value={form.extraProfit} onChange={(e) => setExtraAmount(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="label">…or Extra Profit (%)</label>
                <input className="input" type="number" value={form.extraProfitPercent} onChange={(e) => setExtraPercent(e.target.value)} placeholder="0" />
              </div>
              <div className="col-span-2">
                <label className="label">EMI Price — total the customer pays</label>
                <input className="input font-semibold" type="number" value={form.totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
                {Number(form.basePrice) > 0 && (
                  <p className="text-xs text-slate-500 mt-1">
                    {taka(form.basePrice)} product price
                    {Number(form.extraProfit) > 0 && ` + ${taka(form.extraProfit)} extra (${Number(form.extraProfitPercent) || 0}% of the product price)`}
                    {' '}= <strong>{taka(Number(form.totalAmount) || 0)}</strong>. Either box works — fill in the amount or the percentage, whichever is easier.
                  </p>
                )}
              </div>
              <div><label className="label">Number of Months</label><input className="input" type="number" min="1" value={form.months} onChange={set('months')} /></div>
              <div><label className="label">Down Payment</label><input className="input" type="number" value={form.downPayment} onChange={set('downPayment')} /></div>
              <div><label className="label">Down Payment Method</label>
                <select className="input" value={form.downPaymentMethod} onChange={set('downPaymentMethod')}>
                  <option value="cash">Cash</option><option value="bank">Bank</option><option value="bkash">bKash</option>
                  <option value="nagad">Nagad</option><option value="rocket">Rocket</option><option value="card">Card</option>
                </select>
              </div>
              <div><label className="label">First Due Date</label><input className="input" type="date" value={form.firstDueDate} onChange={set('firstDueDate')} /></div>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Financed amount {taka(Math.max(0, Number(form.totalAmount || 0) - Number(form.downPayment || 0)))} will be split into {form.months || 0} monthly instalments.
            </p>
            {/* Profit preview — the whole point of recording the item cost. It is
                NOT booked in one go: each payment brings in its own share. */}
            {Number(form.totalAmount) > 0 && Number(form.purchasePrice) > 0 && (
              <div className="mt-2 rounded-lg bg-slate-50 dark:bg-slate-800 p-3 text-xs space-y-0.5">
                <p>Total profit on this plan: <strong className="text-green-600">{taka(Number(form.totalAmount) - Number(form.purchasePrice))}</strong> ({taka(form.totalAmount)} − {taka(form.purchasePrice)})</p>
                <p className="text-slate-500">
                  Counted as it is collected: roughly {taka(profitPerInstalment)} of profit per instalment
                  {Number(form.downPayment) > 0 && `, plus ${taka(Math.round(((Number(form.downPayment) / Number(form.totalAmount)) * (Number(form.totalAmount) - Number(form.purchasePrice))) * 100) / 100)} with the down payment`}.
                </p>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Detail / schedule */}
      {detail && (
        <Modal open onClose={() => { setDetail(null); setCostEdit(null); }} title={`EMI — ${detail.customerName || '—'}`} size="lg"
          footer={<button className="btn-ghost" onClick={() => { setDetail(null); setCostEdit(null); }}>Close</button>}>
          <div className="grid grid-cols-4 gap-3 mb-3 text-center text-sm">
            <div className="card p-2"><p className="text-xs text-slate-400">Total</p><p className="font-bold">{taka(detail.totalAmount)}</p></div>
            <div className="card p-2"><p className="text-xs text-slate-400">Down</p><p className="font-bold">{taka(detail.downPayment)}</p></div>
            <div className="card p-2"><p className="text-xs text-slate-400">Balance</p><p className="font-bold text-red-500">{taka(balance(detail))}</p></div>
            <div className="card p-2"><p className="text-xs text-slate-400">Months</p><p className="font-bold">{detail.months}</p></div>
          </div>
          {detail.basePrice > 0 && detail.totalAmount > detail.basePrice && (
            <p className="text-xs text-slate-500 mb-2">
              Product price {taka(detail.basePrice)} + EMI extra profit <strong>{taka(detail.totalAmount - detail.basePrice)}</strong>
              {' '}({Math.round(((detail.totalAmount - detail.basePrice) / detail.basePrice) * 1000) / 10}%) = {taka(detail.totalAmount)}
            </p>
          )}
          {planProfit(detail) > 0 ? (
            <p className="text-xs text-slate-500 mb-2">
              Item cost {taka(detail.purchasePrice)} · Plan profit <strong className="text-green-600">{taka(planProfit(detail))}</strong> ·
              Earned so far <strong className="text-green-600">{taka(profitEarned(detail))}</strong> (from {taka(collectedOf(detail))} collected)
              <button className="btn-ghost text-xs py-0.5 px-1.5 ml-1" onClick={() => setCostEdit(String(detail.purchasePrice || ''))}>edit cost</button>
            </p>
          ) : (
            <p className="text-xs text-amber-600 mb-2">
              No item cost recorded on this plan, so it shows no profit in your reports.
              <button className="btn-ghost text-xs py-0.5 px-1.5 ml-1" onClick={() => setCostEdit('')}>Set item cost</button>
            </p>
          )}
          {costEdit !== null && (
            <div className="flex items-end gap-2 mb-3 bg-slate-50 dark:bg-slate-800 rounded-lg p-2">
              <div className="flex-1">
                <label className="label">Item cost (what the shop paid)</label>
                <input className="input" type="number" autoFocus value={costEdit}
                  onChange={(e) => setCostEdit(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveCost(); }} />
              </div>
              <button className="btn-primary" onClick={saveCost}>Save</button>
              <button className="btn-ghost" onClick={() => setCostEdit(null)}>Cancel</button>
            </div>
          )}
          {detail.imei1 && <p className="text-xs text-slate-500 mb-2">Device IMEI: {detail.imei1}{detail.imei2 ? ` / ${detail.imei2}` : ''}</p>}
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50 text-left">
                <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Due Date</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">Profit</th><th className="px-3 py-2">Status</th><th></th></tr>
              </thead>
              <tbody>
                {detail.schedule.map((s) => (
                  <tr key={s.no} className="border-t border-brand-200 dark:border-slate-700">
                    <td className="px-3 py-2">{s.no}</td>
                    <td className="px-3 py-2">{fmtDate(s.dueDate)}</td>
                    <td className="px-3 py-2 text-right">{taka(s.amount)}</td>
                    <td className={`px-3 py-2 text-right ${s.paid ? 'text-green-600' : 'text-slate-400'}`}>
                      {planProfit(detail) > 0 ? taka(rowProfit(detail, s.amount)) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {s.paid
                        ? <span className="badge bg-green-100 text-green-700 inline-flex items-center gap-1"><CheckCircle2 size={12} /> Paid ({s.method || 'cash'})</span>
                        : <span className="badge bg-amber-100 text-amber-700">Unpaid</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {!s.paid && <button className="btn-primary text-xs py-1" onClick={() => openPay(detail, s.no)}>Mark Paid</button>}
                      {s.paid && <button className="btn-ghost p-1" title="Print receipt" onClick={() => setReceipt({ installment: detail, row: s })}><Printer size={14} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}

      {/* Pay — choose method */}
      <Modal open={!!payRow} onClose={() => setPayRow(null)} title="Collect Instalment Payment"
        footer={<><button className="btn-ghost" onClick={() => setPayRow(null)}>Cancel</button><button className="btn-primary" onClick={confirmPay}>Confirm &amp; print</button></>}>
        {payRow && (
          <div className="space-y-3">
            <p className="text-sm">Instalment #{payRow.no} — <strong>{taka(payRow.plan.schedule.find((s) => s.no === payRow.no)?.amount)}</strong></p>
            {planProfit(payRow.plan) > 0 && (
              <p className="text-xs text-slate-500">
                Books {taka(rowProfit(payRow.plan, payRow.plan.schedule.find((s) => s.no === payRow.no)?.amount))} of profit into today's figures.
              </p>
            )}
            <div>
              <label className="label">Payment Method</label>
              <select className="input" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                <option value="cash">Cash</option><option value="bank">Bank</option><option value="bkash">bKash</option>
                <option value="nagad">Nagad</option><option value="rocket">Rocket</option><option value="card">Card</option>
              </select>
            </div>
          </div>
        )}
      </Modal>

      {/* Per-instalment payment receipt */}
      <PrintWrapper open={!!receipt} onClose={() => setReceipt(null)} title="EMI Payment Receipt">
        {receipt && <EmiPaymentInvoice installment={receipt.installment} row={receipt.row} business={business} />}
      </PrintWrapper>
    </div>
  );
}
