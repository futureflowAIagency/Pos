import { useState } from 'react';
import { ShieldQuestion, Search, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios.js';
import { fmtDate } from '../utils/format.js';

// Check Warranty — look up a device's sale/warranty status by IMEI. Its
// sibling, Claim Warranty (submitting a device for a claim), lives on its own
// page/route (client/src/pages/ClaimWarranty.jsx) — the two are reached via
// the "Warranty" sub-menu in the Sidebar, same pattern as Branches's
// "All Branches" / "Stock Transfer".
export default function Warranty() {
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
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldQuestion size={24} /> Check Warranty</h1>
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
