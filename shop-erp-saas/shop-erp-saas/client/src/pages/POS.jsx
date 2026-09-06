import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Minus, Trash2, Search, Printer, Receipt, PauseCircle, ListChecks, ScanLine } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios.js';
import { taka, fmtDate, fmtDateTime, expiryStatus, daysUntil } from '../utils/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useScanner } from '../context/ScannerContext.jsx';
import Modal from '../components/ui/Modal.jsx';
import PrintWrapper from '../components/print/PrintWrapper.jsx';
import ThermalReceipt from '../components/print/ThermalReceipt.jsx';

// effective unit price after the product's percentage discount
const unitPrice = (p) => Math.round((p.sellingPrice * (1 - (p.discountPercent || 0) / 100)) * 100) / 100;
// keep a typed quantity within [0, stock]; supports decimals (e.g. kg)
const clampQty = (q, stock) => {
  let n = Number(q);
  if (Number.isNaN(n) || n < 0) n = 0;
  if (stock != null && n > stock) n = stock;
  return n;
};
// Expired stock is never sellable. Returns the warning message for an expired
// product, or null when it's fine (the server enforces the same rule — this is
// the counter-facing warning). A product expiring TODAY is still sellable.
const expiryBlock = (p) => (p?.expiryDate && expiryStatus(p.expiryDate) === 'expired')
  ? `${p.name} expired on ${fmtDate(p.expiryDate)} — it cannot be sold`
  : null;
// stable per-line key: serial-tracked units are unique, products stack by id.
// NOTE: `unitId` is the phone-unit (IMEI) id — kept separate from the product's
// measurement `unit` field ('pcs'/'kg') so normal products never look serial-tracked.
const lineKey = (i) => (i.unitId ? `u:${i.unitId}` : `p:${i._id}`);

export default function POS() {
  const { business } = useAuth();
  const isMobile = business?.type === 'mobile';
  // Unique per-unit codes (IMEI/serial) work for Mobile + General shops; Pharmacy
  // has no barcode/unit-tracking system.
  const supportsUnits = business?.type !== 'pharmacy';
  const heldKey = `pos_holds_${business?._id || business?.id || 'default'}`;
  const soldByKey = `pos_soldby_${business?._id || business?.id || 'default'}`;

  const [products, setProducts] = useState([]);
  const [unitResults, setUnitResults] = useState([]); // unique-unit code matches
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  // Who's actually running the register right now — often several employees
  // share one POS login on the same till, so this is typed separately from
  // whoever is logged in. Persisted per business (like held carts) and
  // deliberately NOT cleared by resetSale — one employee rings up many sales
  // in a row without retyping their name each time; only changes when someone
  // else takes over the counter.
  const [soldByName, setSoldByName] = useState('');
  useEffect(() => { setSoldByName(localStorage.getItem(soldByKey) || ''); }, [soldByKey]);
  const setSoldBy = (v) => { setSoldByName(v); try { localStorage.setItem(soldByKey, v); } catch { /* ignore quota */ } };
  // customer (walk-in removed — phone + name are required, matched to a record)
  const [custPhone, setCustPhone] = useState('');
  const [custName, setCustName] = useState('');
  const [custAddress, setCustAddress] = useState('');
  const [matchedCustomer, setMatchedCustomer] = useState(null);
  const [customerNid, setCustomerNid] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  // keyboard-highlighted customer suggestion (-1 = none picked yet; Enter alone
  // never auto-attaches a customer, it just moves on to the name field)
  const [custIndex, setCustIndex] = useState(-1);
  // product-name suggestion dropdown (keyboard-first: type → ↑↓ → Enter → cart)
  const [prodOpen, setProdOpen] = useState(false);
  const [prodIndex, setProdIndex] = useState(0);
  // cart line whose quantity box should receive focus next (set right after a
  // product is picked by keyboard, so the qty can be typed immediately)
  const [focusQtyKey, setFocusQtyKey] = useState(null);
  // past-invoice lookup / reprint
  const [pastOpen, setPastOpen] = useState(false);
  const [findTerm, setFindTerm] = useState('');
  const [foundCustomers, setFoundCustomers] = useState([]);
  const [pastCustomer, setPastCustomer] = useState(null);
  const [pastSales, setPastSales] = useState([]);
  const [discount, setDiscount] = useState(0);
  // Split/multi-tender payment: one or more { method, amount } rows (req: pay
  // part bKash, part card, part cash, etc. in a single sale).
  const [payments, setPayments] = useState([{ method: 'cash', amount: '' }]);
  const [lastSale, setLastSale] = useState(null);
  const [showPrint, setShowPrint] = useState(false);
  // hold-cart state
  const [holds, setHolds] = useState([]);
  const [holdsOpen, setHoldsOpen] = useState(false);
  // mobile IMEI scan
  const [imei, setImei] = useState('');
  // Connected phone scanner (Topbar) — subscribed below once resolveAndAddCode exists.
  const { subscribe: subscribeScanner } = useScanner();

  // Mouse-free checkout chain: search → customer phone → name → address → (NID) →
  // discount → first payment amount → Complete Sale. Each field's Enter key
  // hands focus to the next ref.
  const searchRef = useRef(null);
  const qtyRefs = useRef({}); // lineKey → cart quantity input
  const custPhoneRef = useRef(null);
  const custNameRef = useRef(null);
  const custAddressRef = useRef(null);
  const nidRef = useRef(null);
  const discountRef = useRef(null);
  const payAmountRef = useRef(null);
  const checkoutRef = useRef(null);

  const load = async () => {
    const { data } = await api.get('/products', { params: { search } });
    setProducts(data.data.products);
    // For Mobile + General shops, also match in-stock units by their unique code.
    if (supportsUnits && search.trim()) {
      try {
        const u = await api.get('/units', { params: { status: 'in_stock', search: search.trim() } });
        setUnitResults(u.data.data.units);
      } catch { setUnitResults([]); }
    } else {
      setUnitResults([]);
    }
  };
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => { setHolds(readHolds(heldKey)); }, [heldKey]);

  // As the phone is typed, suggest matching customers (so dues attach to a real
  // record). Clicking a suggestion fills both phone + name.
  useEffect(() => {
    const term = custPhone.trim();
    if (term.length < 2) { setMatchedCustomer(null); setSuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get('/customers', { params: { search: term } });
        const list = data.data.customers || [];
        setSuggestions(list);
        const norm = (s) => (s || '').replace(/\s/g, '');
        const exact = list.find((c) => norm(c.phone) === norm(term)) || null;
        setMatchedCustomer(exact);
        if (exact) {
          setCustName((n) => n || exact.name);
          setCustAddress((a) => a || exact.address || '');
        }
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [custPhone]);

  const pickCustomer = (c) => {
    setCustPhone(c.phone || '');
    setCustName(c.name || '');
    setCustAddress(c.address || '');
    setMatchedCustomer(c);
    setSuggestOpen(false);
    setSuggestions([]);
    setCustIndex(-1);
  };

  // Arrow/Enter navigation for the customer-phone suggestions (mouse-free).
  const custKeyDown = (e) => {
    if (e.key === 'ArrowDown' && suggestions.length) {
      e.preventDefault(); setSuggestOpen(true);
      setCustIndex((i) => (i + 1 >= suggestions.length ? 0 : i + 1));
    } else if (e.key === 'ArrowUp' && suggestions.length) {
      e.preventDefault(); setSuggestOpen(true);
      setCustIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Escape') {
      setSuggestOpen(false); setCustIndex(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const picked = suggestOpen && custIndex >= 0 ? suggestions[custIndex] : null;
      if (picked) pickCustomer(picked);
      custNameRef.current?.focus();
    }
  };

  // ---------- cart ops ----------
  // `blankQty` = the keyboard flow: the line is added with an EMPTY quantity box
  // that is focused straight away, so the cashier just types the number. An item
  // already in the cart isn't bumped — its existing quantity is typed over.
  const addToCart = (p, blankQty = false) => {
    // single choke point for expiry — covers card clicks, barcode scans and the
    // keyboard suggestion flow alike
    const expired = expiryBlock(p);
    if (expired) { toast.error(expired); return; }
    if (p.trackSerial) { toast.error(isMobile ? 'Scan the IMEI / serial to add this device' : 'Scan the unit code to add this item'); return; }
    setCart((c) => {
      const ex = c.find((i) => !i.unitId && i._id === p._id);
      if (ex) {
        if (blankQty) return c;
        if (ex.qty >= p.stock) { toast.error('Not enough stock'); return c; }
        return c.map((i) => (!i.unitId && i._id === p._id) ? { ...i, qty: i.qty + 1 } : i);
      }
      if (p.stock < 1) { toast.error('Out of stock'); return c; }
      return [...c, { ...p, qty: blankQty ? '' : 1 }];
    });
  };

  // Add one specific serial-tracked device (by IMEI/serial) to the cart.
  // By default this re-verifies the unit against the server first: `u` usually
  // comes from a debounced search result (unitResults / suggestList) that can
  // go stale — the device may have been deleted, corrected, or sold in another
  // tab/session since it was fetched. Clicking a stale card used to add it to
  // the cart anyway (only caught, confusingly, at final checkout); now it's
  // caught immediately, right where the mistake would happen. `addByImei`
  // already just fetched a fresh unit itself, so it passes `fresh: true` to
  // skip the redundant round-trip.
  const pushUnit = async (u, { fresh = false } = {}) => {
    let unit = u;
    if (!fresh) {
      const code = u.imei1 || u.imei2 || u.serial;
      try {
        const { data } = await api.get('/units/lookup', { params: { imei: code } });
        unit = data.data.unit;
      } catch {
        toast.error('This device is no longer in stock — it may have been removed or already sold');
        setUnitResults((list) => list.filter((x) => x._id !== u._id));
        return;
      }
    }
    const p = unit.product;
    const expired = expiryBlock(p);
    if (expired) { toast.error(expired); return; }
    setCart((c) => {
      if (c.some((i) => i.unitId === unit._id)) { toast.error('Device already in cart'); return c; }
      return [...c, {
        _id: p._id, name: p.name, sellingPrice: p.sellingPrice, discountPercent: p.discountPercent || 0,
        qty: 1, unitId: unit._id, imei1: unit.imei1, imei2: unit.imei2, serial: unit.serial,
      }];
    });
  };

  // ---------- keyboard product search (type name → ↑↓ → Enter → cart) ----------
  // Only in-stock items are suggested; for unit-tracking shops the matching
  // unique-code units come first (they add one exact device).
  const suggestList = useMemo(() => {
    const units = supportsUnits ? unitResults.map((u) => ({ kind: 'unit', key: `u:${u._id}`, u })) : [];
    const prods = products.filter((p) => p.stock > 0).map((p) => ({ kind: 'product', key: `p:${p._id}`, p }));
    // The product fetch is debounced, so the loaded list can lag one keystroke
    // behind. Re-check each entry against what is typed right now (same fields
    // the server matches on) so Enter can never add a stale, non-matching item.
    const term = search.trim().toLowerCase();
    const matches = (s) => {
      if (!term) return true;
      const hay = s.kind === 'unit'
        ? `${s.u.imei1 || ''} ${s.u.imei2 || ''} ${s.u.serial || ''} ${s.u.product?.name || ''}`
        : `${s.p.name || ''} ${s.p.sku || ''} ${s.p.barcode || ''}`;
      return hay.toLowerCase().includes(term);
    };
    return [...units, ...prods].filter(matches).slice(0, 40);
  }, [products, unitResults, supportsUnits, search]);

  // keep the highlight on the first match whenever the result set changes
  useEffect(() => { setProdIndex(0); }, [search]);

  const pickSuggestion = (entry) => {
    if (!entry) return;
    if (entry.kind === 'unit') {
      // one exact device — quantity is always 1, so there is nothing to type
      pushUnit(entry.u);
      searchRef.current?.focus();
    } else {
      // serial-tracked items must be added by their unique code, not by name —
      // leave the typed text alone so the code can be scanned instead.
      if (entry.p.trackSerial) {
        toast.error(isMobile ? 'Scan the IMEI / serial to add this device' : 'Scan the unit code to add this item');
        return;
      }
      // expired / out-of-stock: warn but keep the typed text so it's obvious
      // which item was refused, and don't clear the search box
      const expired = expiryBlock(entry.p);
      if (expired) { toast.error(expired); return; }
      if (entry.p.stock < 1) { toast.error('Out of stock'); return; }
      addToCart(entry.p, true);
      setFocusQtyKey(`p:${entry.p._id}`); // → empty qty box, focused (see effect below)
    }
    setSearch('');
    setProdOpen(false);
    setProdIndex(0);
  };

  // Move the caret into the just-added line's quantity box once it has rendered.
  useEffect(() => {
    if (!focusQtyKey) return;
    const el = qtyRefs.current[focusQtyKey];
    if (!el) return; // line not painted yet — retry on the next cart render
    el.focus(); el.select();
    setFocusQtyKey(null);
  }, [focusQtyKey, cart]);

  // Quantity typed → Enter goes back to the search box for the next product.
  // Shift+Enter (from anywhere in the entry flow) jumps to the customer fields.
  const qtyKeyDown = (e, key) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (e.target.value === '' || Number(e.target.value) <= 0) setQty(key, '1'); // blank = 1
    if (e.shiftKey) custPhoneRef.current?.focus();
    else searchRef.current?.focus();
  };

  // Enter with a highlighted suggestion adds it to the cart; Shift+Enter (or
  // Enter with nothing left to add) jumps straight to the customer section.
  const searchKeyDown = (e) => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault(); setProdOpen(false); custPhoneRef.current?.focus(); return;
    }
    if (e.key === 'ArrowDown' && suggestList.length) {
      e.preventDefault(); setProdOpen(true);
      setProdIndex((i) => (i + 1 >= suggestList.length ? 0 : i + 1));
    } else if (e.key === 'ArrowUp' && suggestList.length) {
      e.preventDefault(); setProdOpen(true);
      setProdIndex((i) => (i <= 0 ? suggestList.length - 1 : i - 1));
    } else if (e.key === 'Escape') {
      setProdOpen(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const entry = prodOpen && search.trim() ? suggestList[prodIndex] : null;
      if (entry) pickSuggestion(entry);
      else custPhoneRef.current?.focus();
    }
  };

  // Universal scan-to-cart: works for a device IMEI/serial AND a plain product
  // barcode. Shared by the manual scan box (typed/hardware scanner + Enter) and
  // the "Scan with Phone" remote camera session — both just hand a raw code here.
  const resolveAndAddCode = async (term) => {
    if (!term) return;
    // 1) a serial-tracked device by IMEI / serial (e.g. a phone, or a generated serial)
    try {
      const { data } = await api.get('/units/lookup', { params: { imei: term } });
      await pushUnit(data.data.unit, { fresh: true });
      return;
    } catch { /* not a device — fall through to product-barcode lookup */ }
    // 2) a plain product by its barcode
    try {
      const { data } = await api.get(`/products/barcode/${encodeURIComponent(term)}`);
      const p = data.data.product;
      if (p.trackSerial) { toast.error(isMobile ? 'This product is IMEI-tracked — scan the device IMEI/serial' : 'This product is unit-tracked — scan its unique code'); return; }
      if (p.stock < 1) { toast.error('Out of stock'); return; }
      addToCart(p);
    } catch {
      toast.error(`No product or device found for "${term}"`);
    }
  };

  const addByImei = async () => {
    const term = imei.trim();
    if (!term) return;
    await resolveAndAddCode(term);
    setImei('');
  };

  // Whenever the Topbar's phone scanner is connected, every code it scans comes
  // through here — same handling as a typed/hardware-scanner code.
  useEffect(() => subscribeScanner(resolveAndAddCode), [subscribeScanner]);

  const changeQty = (key, d) => setCart((c) => c.map((i) => (lineKey(i) === key && !i.unitId) ? { ...i, qty: clampQty(i.qty + d, i.stock) } : i));
  // direct quantity entry (supports decimals, e.g. 1.5 kg); empty string allowed while typing
  const setQty = (key, val) => setCart((c) => c.map((i) => {
    if (lineKey(i) !== key || i.unitId) return i;
    if (val === '') return { ...i, qty: '' };
    const q = clampQty(Number(val), i.stock);
    if (i.stock != null && Number(val) > i.stock) toast.error('Not enough stock');
    return { ...i, qty: q };
  }));
  const removeItem = (key) => setCart((c) => c.filter((i) => lineKey(i) !== key));
  const resetSale = () => { setCart([]); setDiscount(0); setPayments([{ method: 'cash', amount: '' }]); setCustPhone(''); setCustName(''); setCustAddress(''); setMatchedCustomer(null); setCustomerNid(''); };

  const subTotal = cart.reduce((s, i) => s + unitPrice(i) * Number(i.qty || 0), 0);
  const total = Math.max(0, subTotal - Number(discount || 0));
  const paidSum = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const due = Math.max(0, total - paidSum);

  // ---------- split-payment rows ----------
  const setPaymentRow = (i, k, v) => setPayments((rows) => rows.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  const addPaymentRow = () => setPayments((rows) => [...rows, { method: 'cash', amount: '' }]);
  const removePaymentRow = (i) => setPayments((rows) => rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows);
  const fillRemaining = (i) => setPaymentRow(i, 'amount', String(Math.max(0, total - (paidSum - (Number(payments[i]?.amount) || 0)))));

  // ---------- hold / resume ----------
  const holdCart = () => {
    if (!cart.length) return toast.error('Cart is empty');
    const entry = {
      id: Date.now().toString(),
      heldAt: new Date().toISOString(),
      customerName: custName || custPhone || 'No customer',
      custPhone, custName, custAddress, customerNid, discount, payments,
      itemCount: cart.reduce((s, i) => s + i.qty, 0),
      cart,
    };
    const next = [entry, ...holds];
    setHolds(next); writeHolds(heldKey, next);
    resetSale();
    toast.success('Cart held');
  };

  const resumeHold = (h) => {
    if (cart.length && !confirm('Resuming will replace the current cart. Continue?')) return;
    setCart(h.cart); setCustPhone(h.custPhone || ''); setCustName(h.custName || ''); setCustAddress(h.custAddress || ''); setCustomerNid(h.customerNid || '');
    setDiscount(h.discount || 0);
    // back-compat: older held bills stored a single paid+method instead of payments[]
    setPayments(h.payments?.length ? h.payments : [{ method: h.method || 'cash', amount: h.paid || '' }]);
    const next = holds.filter((x) => x.id !== h.id);
    setHolds(next); writeHolds(heldKey, next);
    setHoldsOpen(false);
    toast.success('Cart resumed');
  };

  // ---------- past invoices (search by phone/name, reprint) ----------
  const findCustomers = async () => {
    if (!findTerm.trim()) return;
    const { data } = await api.get('/customers', { params: { search: findTerm.trim() } });
    setFoundCustomers(data.data.customers);
    setPastCustomer(null); setPastSales([]);
  };
  const openHistory = async (c) => {
    const { data } = await api.get(`/customers/${c._id}/history`);
    setPastCustomer(data.data.customer);
    setPastSales(data.data.sales);
  };
  const reprint = (sale) => { setLastSale(sale); setPastOpen(false); setShowPrint(true); };

  const deleteHold = (id) => {
    const next = holds.filter((x) => x.id !== id);
    setHolds(next); writeHolds(heldKey, next);
  };

  // ---------- checkout ----------
  const checkout = async () => {
    if (!cart.length) return toast.error('Cart is empty');
    if (cart.some((i) => !i.unitId && Number(i.qty) <= 0)) return toast.error('Enter a valid quantity');
    // Catches an item that expired after it was added (e.g. a held bill resumed
    // the next day) — the server rejects it too, this just says so plainly.
    const expiredLine = cart.map(expiryBlock).find(Boolean);
    if (expiredLine) return toast.error(expiredLine);
    const cleanPayments = payments.map((p) => ({ method: p.method, amount: Number(p.amount) || 0 })).filter((p) => p.amount > 0);
    // Nothing typed in any row → default to paying the full total via the first selected method.
    const sendPayments = cleanPayments.length ? cleanPayments : [{ method: payments[0]?.method || 'cash', amount: total }];
    // Customer phone/name are optional for every shop type (walk-in counter
    // sales). Only a sale that actually leaves a due needs someone to attach it
    // to — otherwise the money owed could never be collected. Uses the payments
    // being sent, so a blank amount (= paid in full) is not treated as a due.
    const dueNow = Math.max(0, total - sendPayments.reduce((s, p) => s + p.amount, 0));
    if (dueNow > 0 && !matchedCustomer && !custPhone.trim() && !custName.trim()) {
      custPhoneRef.current?.focus();
      return toast.error('This sale has a due — enter the customer phone or name');
    }
    try {
      const { data } = await api.post('/sales', {
        items: cart.map((i) => i.unitId ? { product: i._id, qty: 1, unit: i.unitId } : { product: i._id, qty: Number(i.qty) }),
        discount: Number(discount || 0),
        payments: sendPayments,
        customer: matchedCustomer?._id || null,
        customerName: custName.trim(),
        customerPhone: custPhone.trim(),
        customerAddress: custAddress.trim(),
        soldByName: soldByName.trim(),
        customerNid: isMobile ? customerNid : '',
      });
      setLastSale(data.data.sale);
      toast.success('Sale completed!');
      resetSale();
      load();
      setShowPrint(true);
    } catch (e) { toast.error(e.response?.data?.message || 'Checkout failed'); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Product picker */}
      <div className="lg:col-span-2 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">POS / New Sale</h1>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => setPastOpen(true)}>
              <Printer size={16} /> Past Invoices
            </button>
            <button className="btn-ghost" onClick={() => setHoldsOpen(true)}>
              <ListChecks size={16} /> Held Bills {holds.length > 0 && <span className="badge bg-amber-100 text-amber-700">{holds.length}</span>}
            </button>
          </div>
        </div>

        {/* Barcode / IMEI scanning — Pharmacy has no barcode or unit-code system,
            so the scan box is hidden there and the name search is the only entry. */}
        {supportsUnits && (
          <div className="card p-3 flex items-center gap-2">
            <ScanLine size={18} className="text-brand-500 shrink-0" />
            <input
              className="input"
              autoFocus
              placeholder="Scan barcode / IMEI / serial to add to cart..."
              value={imei}
              onChange={(e) => setImei(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addByImei(); }}
            />
            <button className="btn-primary shrink-0" onClick={addByImei}>Add</button>
          </div>
        )}

        <div className="relative">
          <Search size={18} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            ref={searchRef}
            className="input pl-10"
            autoFocus={!supportsUnits}
            placeholder={supportsUnits ? 'Search products or unit code...' : 'Type product name — ↑ ↓ to select, Enter to add to cart'}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setProdOpen(true); }}
            onFocus={() => setProdOpen(true)}
            onBlur={() => setTimeout(() => setProdOpen(false), 150)}
            onKeyDown={searchKeyDown}
          />
          {prodOpen && search.trim() && suggestList.length > 0 && (
            <div className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg">
              {suggestList.map((s, idx) => {
                const p = s.kind === 'unit' ? (s.u.product || {}) : s.p;
                return (
                  <button
                    key={s.key}
                    type="button"
                    ref={(el) => { if (idx === prodIndex && el) el.scrollIntoView({ block: 'nearest' }); }}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setProdIndex(idx)}
                    onClick={() => pickSuggestion(s)}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 ${idx === prodIndex ? 'bg-slate-100 dark:bg-slate-700' : ''}`}
                  >
                    <span className="truncate">
                      <span className={`font-medium ${expiryBlock(p) ? 'text-red-500 line-through' : ''}`}>{p.name || 'Item'}</span>
                      {s.kind === 'unit' && <span className="text-brand-500 ml-1 text-xs">{s.u.imei1 || s.u.serial}</span>}
                      {s.kind === 'product' && s.p.trackSerial && <span className="text-slate-400 ml-1 text-xs">{isMobile ? '(scan IMEI)' : '(scan code)'}</span>}
                      {expiryBlock(p) && <span className="badge bg-red-100 text-red-700 ml-1">Expired — cannot sell</span>}
                      {!expiryBlock(p) && expiryStatus(p.expiryDate) === 'soon' && (
                        <span className="badge bg-amber-100 text-amber-700 ml-1">{daysUntil(p.expiryDate)}d left</span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {s.kind === 'product' && <span className="mr-2">Stock: {s.p.stock}</span>}
                      <span className="text-brand-600 font-semibold">{taka(unitPrice({ sellingPrice: p.sellingPrice || 0, discountPercent: p.discountPercent || 0 }))}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {!supportsUnits && (
          <p className="text-xs text-slate-400">
            Keyboard only: type a name, ↑ ↓ to choose, Enter → the quantity box (type the number, Enter comes straight back here for the next item).
            <b> Shift + Enter</b> jumps to the customer fields, then Enter walks through name → discount → payment → Complete Sale.
          </p>
        )}

        {supportsUnits && unitResults.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-400">Matching units (unique code)</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {unitResults.map((u) => (
                <button key={u._id} onClick={() => pushUnit(u)} className="card p-3 text-left hover:ring-2 hover:ring-brand-500 transition">
                  <p className="font-medium text-sm truncate">{u.product?.name || 'Item'}</p>
                  <p className="text-brand-600 font-bold">{taka(unitPrice({ sellingPrice: u.product?.sellingPrice || 0, discountPercent: u.product?.discountPercent || 0 }))}</p>
                  <p className="text-xs text-brand-500 truncate">Code: {u.imei1 || u.serial}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto pr-1">
          {products.map((p) => (
            <button
              key={p._id}
              onClick={() => addToCart(p)}
              className={`card p-3 text-left transition ${expiryBlock(p) ? 'opacity-60 ring-1 ring-red-400 cursor-not-allowed' : 'hover:ring-2 hover:ring-brand-500'}`}
            >
              <p className={`font-medium text-sm truncate ${expiryBlock(p) ? 'text-red-500' : ''}`}>{p.name}</p>
              {expiryBlock(p) ? (
                <p className="badge bg-red-100 text-red-700 my-0.5">Expired {fmtDate(p.expiryDate)} — cannot sell</p>
              ) : expiryStatus(p.expiryDate) === 'soon' ? (
                <p className="badge bg-amber-100 text-amber-700 my-0.5">Expires in {daysUntil(p.expiryDate)}d</p>
              ) : null}
              {p.discountPercent > 0 ? (
                <p className="font-bold">
                  <span className="text-xs line-through text-slate-400 mr-1">{taka(p.sellingPrice)}</span>
                  <span className="text-brand-600">{taka(unitPrice(p))}</span>
                  <span className="badge bg-green-100 text-green-700 ml-1">-{p.discountPercent}%</span>
                </p>
              ) : (
                <p className="text-brand-600 font-bold">{taka(p.sellingPrice)}</p>
              )}
              <p className="text-xs text-slate-400">Stock: {p.stock}{p.trackSerial ? (isMobile ? ' (scan IMEI)' : ' (scan code)') : ''}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Cart */}
      <div className="card p-4 flex flex-col h-fit lg:sticky lg:top-20">
        <h2 className="font-semibold flex items-center gap-2 mb-3"><Receipt size={18} /> Cart</h2>
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {cart.length === 0 && <p className="text-slate-400 text-sm py-6 text-center">No items added</p>}
          {cart.map((i) => (
            <div key={lineKey(i)} className="flex items-center gap-2 text-sm">
              <div className="flex-1">
                <p className="font-medium">{i.name}</p>
                <p className="text-xs text-slate-400">
                  {taka(unitPrice(i))} × {i.qty}{i.discountPercent > 0 ? ` (-${i.discountPercent}%)` : ''}
                </p>
                {i.unitId && <p className="text-xs text-brand-500">IMEI: {i.imei1 || i.serial}</p>}
                {/* a resumed held bill can contain an item that expired since it was held */}
                {expiryBlock(i) && <p className="text-xs text-red-500 font-medium">Expired {fmtDate(i.expiryDate)} — remove to continue</p>}
              </div>
              {!i.unitId && <button onClick={() => changeQty(lineKey(i), -1)} className="btn-ghost p-1"><Minus size={14} /></button>}
              {!i.unitId && (
                <input
                  ref={(el) => { if (el) qtyRefs.current[lineKey(i)] = el; else delete qtyRefs.current[lineKey(i)]; }}
                  type="number" min="0" step="any"
                  className="input w-16 text-center px-1 py-1"
                  value={i.qty}
                  onChange={(e) => setQty(lineKey(i), e.target.value)}
                  onKeyDown={(e) => qtyKeyDown(e, lineKey(i))}
                  onBlur={(e) => { if (e.target.value === '' || Number(e.target.value) <= 0) setQty(lineKey(i), '1'); }}
                />
              )}
              {!i.unitId && <button onClick={() => changeQty(lineKey(i), 1)} className="btn-ghost p-1"><Plus size={14} /></button>}
              <button onClick={() => removeItem(lineKey(i))} className="text-red-500 p-1"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 dark:border-slate-700 mt-3 pt-3 space-y-2 text-sm">
          <div>
            <label className="label">Sold By (Employee)</label>
            <input
              className="input"
              value={soldByName}
              onChange={(e) => setSoldBy(e.target.value)}
              placeholder="Type your name — stays filled in until changed"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <label className="label">Customer Phone (optional)</label>
              <input
                ref={custPhoneRef}
                className="input"
                value={custPhone}
                onChange={(e) => { setCustPhone(e.target.value); setSuggestOpen(true); setCustIndex(-1); }}
                onFocus={() => setSuggestOpen(true)}
                onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
                onKeyDown={custKeyDown}
                placeholder="01XXXXXXXXX"
              />
              {suggestOpen && suggestions.length > 0 && (
                <div className="absolute z-30 mt-1 w-[200%] max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg">
                  {suggestions.map((c, idx) => (
                    <button
                      key={c._id}
                      type="button"
                      ref={(el) => { if (idx === custIndex && el) el.scrollIntoView({ block: 'nearest' }); }}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setCustIndex(idx)}
                      onClick={() => pickCustomer(c)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between gap-2 ${idx === custIndex ? 'bg-slate-100 dark:bg-slate-700' : ''}`}
                    >
                      <span className="truncate">
                        <span className="font-medium">{c.name}</span>
                        <span className="text-slate-400 ml-1">{c.phone}</span>
                      </span>
                      {c.totalDue > 0 && <span className="text-xs text-red-500 shrink-0">Due {taka(c.totalDue)}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="label">Customer Name (optional)</label>
              <input
                ref={custNameRef}
                className="input"
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); custAddressRef.current?.focus(); } }}
                placeholder="Customer name"
              />
            </div>
          </div>
          {matchedCustomer && (
            <p className="text-xs text-green-600">
              ✓ Existing customer{matchedCustomer.totalDue > 0 ? ` • current due ${taka(matchedCustomer.totalDue)}` : ''}
            </p>
          )}
          <div>
            <label className="label">Customer Address (optional)</label>
            <input
              ref={custAddressRef}
              className="input"
              value={custAddress}
              onChange={(e) => setCustAddress(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (isMobile ? nidRef : discountRef).current?.focus(); } }}
              placeholder="Customer address"
            />
          </div>
          {isMobile && (
            <div>
              <label className="label">Customer NID / Identity</label>
              <input
                ref={nidRef}
                className="input"
                value={customerNid}
                onChange={(e) => setCustomerNid(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); discountRef.current?.focus(); } }}
                placeholder="NID number (for warranty / records)"
              />
            </div>
          )}
          <div>
            <label className="label">Discount</label>
            <input
              ref={discountRef}
              className="input"
              type="number"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); payAmountRef.current?.focus(); } }}
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="label mb-0">Payment (split across multiple methods if needed)</label>
            </div>
            <div className="space-y-2">
              {payments.map((p, i) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <select className="input !w-28 shrink-0" value={p.method} onChange={(e) => setPaymentRow(i, 'method', e.target.value)}>
                    <option value="cash">Cash</option><option value="bank">Bank</option>
                    <option value="bkash">bKash</option><option value="nagad">Nagad</option>
                    <option value="rocket">Rocket</option><option value="card">Card</option>
                  </select>
                  <input
                    ref={i === 0 ? payAmountRef : null}
                    className="input"
                    type="number"
                    placeholder={i === 0 ? String(total) : '0'}
                    value={p.amount}
                    onChange={(e) => setPaymentRow(i, 'amount', e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); checkoutRef.current?.focus(); } }}
                  />
                  <button type="button" className="btn-ghost p-1.5 shrink-0" title="Fill remaining" onClick={() => fillRemaining(i)}>=</button>
                  {payments.length > 1 && <button type="button" className="text-red-500 p-1 shrink-0" onClick={() => removePaymentRow(i)}><Trash2 size={14} /></button>}
                </div>
              ))}
            </div>
            <button type="button" className="btn-ghost mt-1.5 !py-1 text-xs" onClick={addPaymentRow}><Plus size={13} /> Add payment method</button>
          </div>

          <div className="flex justify-between"><span>Subtotal</span><span>{taka(subTotal)}</span></div>
          <div className="flex justify-between"><span>Discount (flat)</span><span>-{taka(Number(discount || 0))}</span></div>
          <div className="flex justify-between font-bold text-base"><span>Total</span><span>{taka(total)}</span></div>
          <div className="flex justify-between"><span>Paid</span><span>{taka(paidSum)}</span></div>
          <div className="flex justify-between text-red-500"><span>Due</span><span>{taka(due)}</span></div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button className="btn-ghost" onClick={holdCart}><PauseCircle size={16} /> Hold</button>
            <button ref={checkoutRef} className="btn-primary focus:ring-2 focus:ring-brand-500" onClick={checkout}>Complete Sale</button>
          </div>
          {lastSale && (
            <button className="btn-ghost w-full" onClick={() => setShowPrint(true)}><Printer size={16} /> Reprint last invoice</button>
          )}
        </div>
      </div>

      {/* Held bills */}
      <Modal open={holdsOpen} onClose={() => setHoldsOpen(false)} title="Held Bills" size="lg">
        {holds.length === 0 ? (
          <p className="text-slate-400 text-center py-6">No held bills</p>
        ) : (
          <div className="space-y-2">
            {holds.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                <div>
                  <p className="font-medium">{h.customerName}</p>
                  <p className="text-xs text-slate-400">{fmtDateTime(h.heldAt)} • {h.itemCount} item(s)</p>
                </div>
                <div className="flex gap-2">
                  <button className="btn-primary" onClick={() => resumeHold(h)}>Resume</button>
                  <button className="btn-ghost text-red-500" onClick={() => deleteHold(h.id)}><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Past invoices — search by phone/name and reprint */}
      <Modal open={pastOpen} onClose={() => setPastOpen(false)} title="Past Invoices" size="lg">
        <div className="flex gap-2 mb-3">
          <input
            className="input"
            placeholder="Search by phone or name…"
            value={findTerm}
            onChange={(e) => setFindTerm(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') findCustomers(); }}
          />
          <button className="btn-primary shrink-0" onClick={findCustomers}><Search size={16} /> Search</button>
        </div>

        {!pastCustomer ? (
          foundCustomers.length === 0 ? (
            <p className="text-slate-400 text-center py-6 text-sm">Search a customer by phone number or name.</p>
          ) : (
            <div className="space-y-2">
              {foundCustomers.map((c) => (
                <button key={c._id} onClick={() => openHistory(c)}
                  className="w-full flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:ring-2 hover:ring-brand-500 text-left">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-slate-400">{c.phone || 'No phone'}</p>
                  </div>
                  {c.totalDue > 0 && <span className="text-xs text-red-500">Due {taka(c.totalDue)}</span>}
                </button>
              ))}
            </div>
          )
        ) : (
          <div>
            <button className="btn-ghost mb-2" onClick={() => setPastCustomer(null)}>← Back</button>
            <div className="mb-2">
              <p className="font-semibold">{pastCustomer.name}</p>
              <p className="text-xs text-slate-400">{pastCustomer.phone}{pastCustomer.totalDue > 0 ? ` • Due ${taka(pastCustomer.totalDue)}` : ''}</p>
            </div>
            {pastSales.length === 0 ? (
              <p className="text-slate-400 text-center py-6 text-sm">No invoices yet</p>
            ) : (
              <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                {pastSales.map((s) => (
                  <div key={s._id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div>
                      <p className="font-medium text-sm">{s.invoiceNo}</p>
                      <p className="text-xs text-slate-400">{fmtDateTime(s.createdAt)} • {taka(s.total)}{s.due > 0 ? ` • due ${taka(s.due)}` : ''}</p>
                    </div>
                    <button className="btn-ghost" onClick={() => reprint(s)}><Printer size={15} /> Reprint</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Print preview — closing it returns focus to the search box so the next
          sale can start straight from the keyboard. */}
      <PrintWrapper open={showPrint} onClose={() => { setShowPrint(false); setTimeout(() => searchRef.current?.focus(), 0); }} title="Invoice">
        <ThermalReceipt sale={lastSale} business={business} />
      </PrintWrapper>
    </div>
  );
}

// localStorage helpers for held carts (scoped per business)
function readHolds(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}
function writeHolds(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* ignore quota */ }
}
