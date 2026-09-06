import { useState } from 'react';
import { ScanLine } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios.js';
import Modal from './ui/Modal.jsx';
import PrintWrapper from './print/PrintWrapper.jsx';
import ReturnReceipt from './print/ReturnReceipt.jsx';
import { taka } from '../utils/format.js';
import { useAuth } from '../context/AuthContext.jsx';

const TENDERS = ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card'];
const emptyNewItem = { product: null, name: '', price: 0, trackSerial: false, unit: null, imei1: '', qty: 1 };

// Return or Exchange a past invoice (req 14). Lets the user pick which line
// items to return (qty + condition), then either:
//  - Return: refund the paid portion (cash/bank/... or store credit)
//  - Exchange: pick a replacement item; the system auto-computes the price
//    difference (customer pays more / gets a refund / store credit)
export default function ReturnExchangeModal({ sale, onClose, onDone }) {
  const { business } = useAuth();
  const [tab, setTab] = useState('return'); // 'return' | 'exchange'
  const [selected, setSelected] = useState({}); // { [lineIndex]: { qty, condition } }
  const [reason, setReason] = useState('');
  const [refundType, setRefundType] = useState('refund'); // 'refund' | 'store_credit'
  const [refundMethod, setRefundMethod] = useState('cash');
  const [saving, setSaving] = useState(false);
  // once a return/exchange completes, hold its receipt here and print it
  // before actually closing (onDone/onClose fire only once the receipt closes)
  const [receipt, setReceipt] = useState(null); // { returnDoc, newSale? }

  // exchange-only state
  const [barcode, setBarcode] = useState('');
  const [imeiScan, setImeiScan] = useState('');
  const [newItem, setNewItem] = useState(emptyNewItem);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [settlementType, setSettlementType] = useState('refund'); // used if diff is negative

  const lines = sale.items.map((it, index) => ({
    ...it, index, available: it.qty - (it.returnedQty || 0),
  })).filter((it) => it.available > 0);

  const toggleLine = (index, checked) => {
    setSelected((s) => {
      const next = { ...s };
      if (checked) next[index] = { qty: 1, condition: 'resellable' };
      else delete next[index];
      return next;
    });
  };
  const setLineField = (index, field, value) => {
    setSelected((s) => ({ ...s, [index]: { ...s[index], [field]: value } }));
  };

  const returnValue = Object.entries(selected).reduce((sum, [index, sel]) => {
    const line = sale.items[Number(index)];
    return sum + (line ? line.sellingPrice * Number(sel.qty || 0) : 0);
  }, 0);
  const dueReduction = Math.min(sale.due, returnValue);
  const remaining = Math.max(0, returnValue - dueReduction);

  const buildItemsPayload = () =>
    Object.entries(selected).map(([index, sel]) => ({ index: Number(index), qty: Number(sel.qty || 0), condition: sel.condition }));

  const submitReturn = async () => {
    const items = buildItemsPayload();
    if (!items.length) return toast.error('Select at least one item to return');
    setSaving(true);
    try {
      const { data } = await api.post('/returns', { sale: sale._id, items, reason, refundType, refundMethod });
      toast.success('Return processed');
      onDone?.();
      setReceipt({ returnDoc: data.data.return });
    } catch (e) { toast.error(e.response?.data?.message || 'Return failed'); }
    setSaving(false);
  };

  // ---- exchange: new item selection ----
  const scanBarcode = async () => {
    const code = barcode.trim();
    if (!code) return;
    try {
      const { data } = await api.get(`/products/barcode/${encodeURIComponent(code)}`);
      const p = data.data.product;
      const price = p.discountPercent > 0 ? Math.round(p.sellingPrice * (1 - p.discountPercent / 100)) : p.sellingPrice;
      setNewItem({ product: p._id, name: p.name, price, trackSerial: !!p.trackSerial, unit: null, imei1: '', qty: 1 });
      setBarcode('');
      toast.success(p.trackSerial ? `${p.name} — now scan the device IMEI` : `${p.name} selected`);
    } catch (e) { toast.error(e.response?.data?.message || 'Barcode not found'); }
  };
  const scanImei = async () => {
    const term = imeiScan.trim();
    if (!term) return;
    try {
      const { data } = await api.get('/units/lookup', { params: { imei: term } });
      const u = data.data.unit;
      setNewItem((n) => ({ ...n, unit: u._id, imei1: u.imei1 }));
      setImeiScan('');
      toast.success('Device linked');
    } catch (e) { toast.error(e.response?.data?.message || 'Device not found'); }
  };

  const newItemTotal = (newItem.price || 0) * (newItem.trackSerial ? 1 : Number(newItem.qty || 1));
  const priceDiff = Math.round((newItemTotal - remaining) * 100) / 100;

  const submitExchange = async () => {
    const items = buildItemsPayload();
    if (!items.length) return toast.error('Select at least one item to return');
    if (!newItem.product) return toast.error('Scan/select the replacement item');
    if (newItem.trackSerial && !newItem.unit) return toast.error('Scan the replacement device IMEI');
    setSaving(true);
    try {
      const { data } = await api.post('/returns/exchange', {
        sale: sale._id, items, reason,
        newItems: [{ product: newItem.product, unit: newItem.unit, qty: newItem.trackSerial ? 1 : Number(newItem.qty || 1) }],
        paymentMethod, settlementType,
      });
      toast.success('Exchange completed');
      onDone?.();
      setReceipt({ returnDoc: data.data.return, newSale: data.data.newSale });
    } catch (e) { toast.error(e.response?.data?.message || 'Exchange failed'); }
    setSaving(false);
  };

  // The receipt print preview replaces this whole modal once a return/exchange
  // has actually gone through — closing the receipt is what finally closes out
  // (onDone already fired above, right when the money/stock actually moved).
  if (receipt) {
    return (
      <PrintWrapper open onClose={onClose} title="Return / Exchange Receipt">
        <ReturnReceipt business={business} returnDoc={receipt.returnDoc} newSale={receipt.newSale} />
      </PrintWrapper>
    );
  }

  return (
    <Modal open onClose={onClose} title={`Return / Exchange — ${sale.invoiceNo}`} size="xl"
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        {tab === 'return'
          ? <button className="btn-primary" disabled={saving} onClick={submitReturn}>Process Return</button>
          : <button className="btn-primary" disabled={saving} onClick={submitExchange}>Complete Exchange</button>}
      </>}>
      <div className="space-y-4">
        <div className="flex gap-2">
          <button className={`btn-ghost ${tab === 'return' ? 'ring-2 ring-brand-500' : ''}`} onClick={() => setTab('return')}>Return (Refund)</button>
          <button className={`btn-ghost ${tab === 'exchange' ? 'ring-2 ring-brand-500' : ''}`} onClick={() => setTab('exchange')}>Exchange</button>
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-500 mb-2">Select items to return</p>
          {lines.length === 0 ? (
            <p className="text-sm text-slate-400">All items on this invoice have already been returned.</p>
          ) : (
            <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-700/50 text-left">
                  <tr><th className="px-3 py-2"></th><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Available</th><th className="px-3 py-2 text-center">Return Qty</th><th className="px-3 py-2">Condition</th></tr>
                </thead>
                <tbody>
                  {lines.map((it) => (
                    <tr key={it.index} className="border-t border-brand-200 dark:border-slate-700">
                      <td className="px-3 py-2"><input type="checkbox" checked={!!selected[it.index]} onChange={(e) => toggleLine(it.index, e.target.checked)} /></td>
                      <td className="px-3 py-2">{it.name}{it.imei1 && <div className="text-xs text-slate-400">IMEI: {it.imei1}</div>}</td>
                      <td className="px-3 py-2 text-right">{it.available}</td>
                      <td className="px-3 py-2 text-center">
                        {selected[it.index] && !it.unit ? (
                          <input type="number" min="1" max={it.available} className="input w-16 text-center px-1 py-1"
                            value={selected[it.index].qty} onChange={(e) => setLineField(it.index, 'qty', Math.max(1, Math.min(it.available, Number(e.target.value) || 1)))} />
                        ) : selected[it.index] ? '1' : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {selected[it.index] && (
                          <select className="input !py-1" value={selected[it.index].condition} onChange={(e) => setLineField(it.index, 'condition', e.target.value)}>
                            <option value="resellable">Resellable</option>
                            <option value="damaged">Damaged / Service Stock</option>
                          </select>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div><label className="label">Reason for Return</label><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. wrong item, defective, customer changed mind" /></div>

        <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 text-sm space-y-1">
          <div className="flex justify-between"><span>Return Value</span><span>{taka(returnValue)}</span></div>
          <div className="flex justify-between"><span>Applied to Due</span><span>{taka(dueReduction)}</span></div>
          <div className="flex justify-between font-semibold"><span>{tab === 'return' ? 'To Refund' : 'Exchange Credit'}</span><span>{taka(remaining)}</span></div>
        </div>

        {tab === 'return' ? (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Settlement</label>
              <select className="input" value={refundType} onChange={(e) => setRefundType(e.target.value)}>
                <option value="refund">Refund now</option>
                <option value="store_credit">Store Credit</option>
              </select>
            </div>
            {refundType === 'refund' && (
              <div><label className="label">Refund Method</label>
                <select className="input" value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}>
                  {TENDERS.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
                </select>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-500">Replacement Item</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Scan Barcode</label>
                <div className="flex gap-2">
                  <ScanLine size={18} className="mt-2.5 text-brand-500 shrink-0" />
                  <input className="input" value={barcode} onChange={(e) => setBarcode(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') scanBarcode(); }} placeholder="Scan or type barcode..." />
                </div>
              </div>
              {newItem.trackSerial && (
                <div>
                  <label className="label">Scan Device IMEI</label>
                  <div className="flex gap-2">
                    <ScanLine size={18} className="mt-2.5 text-brand-500 shrink-0" />
                    <input className="input" value={imeiScan} onChange={(e) => setImeiScan(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') scanImei(); }} placeholder="Scan IMEI..." />
                  </div>
                  {newItem.imei1 && <p className="text-xs text-green-600 mt-1">✓ Linked: {newItem.imei1}</p>}
                </div>
              )}
            </div>
            {newItem.product && (
              <div className="card p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium">{newItem.name}</p>
                  <p className="text-xs text-slate-400">{taka(newItem.price)}{!newItem.trackSerial ? ' / unit' : ''}</p>
                </div>
                {!newItem.trackSerial && (
                  <div className="flex items-center gap-2">
                    <label className="label !mb-0">Qty</label>
                    <input type="number" min="1" className="input w-20" value={newItem.qty} onChange={(e) => setNewItem({ ...newItem, qty: Math.max(1, Number(e.target.value) || 1) })} />
                  </div>
                )}
              </div>
            )}

            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between"><span>New Item Total</span><span>{taka(newItemTotal)}</span></div>
              <div className="flex justify-between font-semibold">
                <span>{priceDiff > 0 ? 'Customer Pays' : priceDiff < 0 ? 'Refund to Customer' : 'Price Difference'}</span>
                <span className={priceDiff > 0 ? 'text-red-500' : priceDiff < 0 ? 'text-green-600' : ''}>{taka(Math.abs(priceDiff))}</span>
              </div>
            </div>

            {priceDiff > 0 && (
              <div><label className="label">Payment Method (for the extra amount)</label>
                <select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  {TENDERS.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
                </select>
              </div>
            )}
            {priceDiff < 0 && (
              <div><label className="label">Refund the difference as</label>
                <select className="input" value={settlementType} onChange={(e) => setSettlementType(e.target.value)}>
                  <option value="refund">Cash/Bank Refund</option>
                  <option value="store_credit">Store Credit</option>
                </select>
                {settlementType === 'refund' && (
                  <select className="input mt-2" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                    {TENDERS.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
                  </select>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
