import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Database } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios.js';
import DataTable from '../../components/ui/DataTable.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { taka, fmtDate, fmtDateTime } from '../../utils/format.js';

// Friendlier labels for the raw mongoose model names.
const LABELS = {
  Product: 'Products', Sale: 'Sales', Customer: 'Customers', Employee: 'Employees',
  Supplier: 'Suppliers', Branch: 'Branches', Purchase: 'Purchases', Expense: 'Expenses',
  User: 'Staff Logins', PhoneUnit: 'IMEI / Serial Units', Installment: 'EMI Installments',
  ServiceJob: 'Service Jobs', Return: 'Returns', Transfer: 'Balance Transfers', Fund: 'Funds',
  DuePayment: 'Due Payments', ImportExportLog: 'Import/Export Logs', ActivityLog: 'Activity Logs',
  Notification: 'Notifications', Payment: 'Subscription Payments', Subscription: 'Subscriptions',
  Lead: 'CRM Leads', Deal: 'CRM Deals', Contact: 'CRM Contacts', Company: 'CRM Companies',
  Campaign: 'Marketing Campaigns', CrmNote: 'CRM Notes', CrmTask: 'CRM Tasks',
  MarketingSettings: 'Marketing Settings',
};
const label = (m) => LABELS[m] || m;

// Curated, readable columns for the collections shops actually care about.
// Anything not listed here falls back to an auto-generated column set.
const yn = (v) => (v ? 'Yes' : 'No');
const CURATED_COLUMNS = {
  Product: [
    { key: 'name', label: 'Name' },
    { key: 'category', label: 'Category' },
    { key: 'sku', label: 'SKU' },
    { key: 'stock', label: 'Stock', className: 'text-right' },
    { key: 'sellingPrice', label: 'Price', className: 'text-right', render: (r) => taka(r.sellingPrice) },
    { key: 'branch', label: 'Branch', render: (r) => r.branch?.name || '—' },
    { key: 'isActive', label: 'Active', render: (r) => yn(r.isActive) },
    { key: 'createdAt', label: 'Created', render: (r) => fmtDate(r.createdAt) },
  ],
  Sale: [
    { key: 'invoiceNo', label: 'Invoice' },
    { key: 'customerName', label: 'Customer' },
    { key: 'total', label: 'Total', className: 'text-right', render: (r) => taka(r.total) },
    { key: 'due', label: 'Due', className: 'text-right', render: (r) => taka(r.due) },
    { key: 'paymentMethod', label: 'Method', className: 'capitalize' },
    { key: 'branch', label: 'Branch', render: (r) => r.branch?.name || '—' },
    { key: 'createdAt', label: 'Date', render: (r) => fmtDateTime(r.createdAt) },
  ],
  Customer: [
    { key: 'name', label: 'Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'totalDue', label: 'Due', className: 'text-right', render: (r) => taka(r.totalDue) },
    { key: 'isActive', label: 'Active', render: (r) => yn(r.isActive) },
    { key: 'createdAt', label: 'Created', render: (r) => fmtDate(r.createdAt) },
  ],
  Employee: [
    { key: 'name', label: 'Name' },
    { key: 'employeeId', label: 'ID' },
    { key: 'designation', label: 'Designation' },
    { key: 'phone', label: 'Phone' },
    { key: 'monthlySalary', label: 'Salary', className: 'text-right', render: (r) => taka(r.monthlySalary) },
    { key: 'isActive', label: 'Active', render: (r) => yn(r.isActive) },
  ],
  Supplier: [
    { key: 'name', label: 'Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'totalPurchase', label: 'Purchased', className: 'text-right', render: (r) => taka(r.totalPurchase) },
    { key: 'totalPaid', label: 'Paid', className: 'text-right', render: (r) => taka(r.totalPaid) },
    { key: 'due', label: 'Due', className: 'text-right', render: (r) => taka((r.totalPurchase || 0) - (r.totalPaid || 0)) },
  ],
  Branch: [
    { key: 'name', label: 'Name' },
    { key: 'address', label: 'Address' },
    { key: 'phone', label: 'Phone' },
    { key: 'isMainBranch', label: 'Main', render: (r) => (r.isMainBranch ? 'Yes' : '') },
    { key: 'isActive', label: 'Active', render: (r) => yn(r.isActive) },
  ],
  User: [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'role', label: 'Role', className: 'capitalize' },
    { key: 'isActive', label: 'Active', render: (r) => yn(r.isActive) },
  ],
  Purchase: [
    { key: 'reference', label: 'Reference' },
    { key: 'supplier', label: 'Supplier', render: (r) => r.supplier?.name || '—' },
    { key: 'total', label: 'Total', className: 'text-right', render: (r) => taka(r.total) },
    { key: 'due', label: 'Due', className: 'text-right', render: (r) => taka(r.due) },
    { key: 'kind', label: 'Kind' },
    { key: 'createdAt', label: 'Date', render: (r) => fmtDate(r.createdAt) },
  ],
  Expense: [
    { key: 'title', label: 'Title' },
    { key: 'category', label: 'Category' },
    { key: 'amount', label: 'Amount', className: 'text-right', render: (r) => taka(r.amount) },
    { key: 'source', label: 'Source', className: 'capitalize' },
    { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
  ],
};

// Anything without curated columns above: auto-pick a handful of simple
// (non-object, non-array) fields from the first row so it's still browsable.
const genericColumns = (rows) => {
  if (!rows.length) return [];
  const skip = new Set(['_id', '__v', 'business', 'password']);
  const keys = Object.keys(rows[0]).filter((k) => {
    if (skip.has(k)) return false;
    const v = rows[0][k];
    return !(v !== null && typeof v === 'object');
  }).slice(0, 6);
  return keys.map((k) => ({
    key: k,
    label: k.charAt(0).toUpperCase() + k.slice(1),
    render: (r) => {
      const v = r[k];
      if (v === null || v === undefined || v === '') return '—';
      if (typeof v === 'boolean') return yn(v);
      return String(v);
    },
  }));
};

export default function BusinessData() {
  const { id } = useParams();
  const [business, setBusiness] = useState(null);
  const [counts, setCounts] = useState({});
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [model, setModel] = useState(null);
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const limit = 50;

  useEffect(() => {
    (async () => {
      setLoadingSummary(true);
      try {
        const { data } = await api.get(`/admin/businesses/${id}/summary`);
        setBusiness(data.data.business);
        setCounts(data.data.counts);
        const first = Object.keys(data.data.counts).sort((a, b) => data.data.counts[b] - data.data.counts[a])[0];
        setModel(first || null);
      } catch (e) { toast.error(e.response?.data?.message || 'Failed to load shop data'); }
      setLoadingSummary(false);
    })();
  }, [id]);

  useEffect(() => {
    if (!model) return;
    (async () => {
      setLoadingRecords(true);
      try {
        const { data } = await api.get(`/admin/businesses/${id}/records`, { params: { model, page, limit } });
        setRecords(data.data.records);
        setTotal(data.data.total);
      } catch (e) { toast.error(e.response?.data?.message || 'Failed to load records'); }
      setLoadingRecords(false);
    })();
  }, [id, model, page]);

  if (loadingSummary) return <Spinner />;
  if (!business) return <p className="text-slate-500">Business not found.</p>;

  const columns = (CURATED_COLUMNS[model] || genericColumns(records));
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const sortedModels = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link to="/admin" className="text-sm text-slate-500 hover:text-brand-600 flex items-center gap-1 mb-1"><ArrowLeft size={14} /> Back to Admin Panel</Link>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Database size={22} /> {business.name}</h1>
          <p className="text-sm text-slate-500">
            {business.owner?.name || 'No owner'} • {business.owner?.email || '—'} • <span className="capitalize">{business.type}</span> shop
          </p>
        </div>
      </div>

      {sortedModels.length === 0 ? (
        <div className="card p-6 text-center text-slate-400">This shop has no data yet.</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {sortedModels.map((m) => (
              <button
                key={m}
                onClick={() => { setModel(m); setPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-sm border transition ${
                  model === m
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-brand-400'
                }`}
              >
                {label(m)} <span className="opacity-70">({counts[m]})</span>
              </button>
            ))}
          </div>

          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{label(model)}</h2>
              {totalPages > 1 && (
                <div className="flex items-center gap-2 text-sm">
                  <button className="btn-ghost text-xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
                  <span className="text-slate-500">Page {page} / {totalPages}</span>
                  <button className="btn-ghost text-xs" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
                </div>
              )}
            </div>
            {loadingRecords ? <Spinner /> : (
              <DataTable columns={columns} rows={records} empty="No records" />
            )}
          </div>
        </>
      )}
    </div>
  );
}
