import { useEffect, useState } from 'react';
import { Plus, Trash2, TrendingUp, TrendingDown, Wallet, Printer, PiggyBank, FileBarChart, ArrowLeftRight } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios.js';
import StatCard from '../components/ui/StatCard.jsx';
import DataTable from '../components/ui/DataTable.jsx';
import Modal from '../components/ui/Modal.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import AccountSelect from '../components/ui/AccountSelect.jsx';
import PrintWrapper from '../components/print/PrintWrapper.jsx';
import AdvancedReport from '../components/print/AdvancedReport.jsx';
import { taka, fmtDate } from '../utils/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../context/LanguageContext.jsx';

export default function Finance() {
  const { business } = useAuth();
  const { t } = useLang();
  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [report, setReport] = useState([]);
  const [period, setPeriod] = useState('daily');
  const [modal, setModal] = useState(false);
  const [printReport, setPrintReport] = useState(false);
  const [form, setForm] = useState({ title: '', category: 'General', amount: 0, source: 'cash', account: null, note: '' });
  // fund (capital) state
  const [funds, setFunds] = useState([]);
  const [fundModal, setFundModal] = useState(false);
  const [fundForm, setFundForm] = useState({ source: 'cash', account: null, type: 'add', amount: 0, note: '' });
  // balance transfer state (move money between the shop's own payment methods,
  // optionally between two specific named accounts under the same method)
  const [transfers, setTransfers] = useState([]);
  const [transferModal, setTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState({ fromMethod: 'bkash', toMethod: 'cash', fromAccount: null, toAccount: null, amount: 0, note: '' });
  // named bank/bKash/Nagad/etc account balances ("kon bank a koto taka ache")
  const [accountBalances, setAccountBalances] = useState(null);
  // advanced report (req 8)
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const [reportRange, setReportRange] = useState({ from: monthStart, to: now.toISOString().slice(0, 10) });
  const [advReport, setAdvReport] = useState(null);
  const [advOpen, setAdvOpen] = useState(false);
  const [advLoading, setAdvLoading] = useState(false);

  const load = async () => {
    const [s, e, r, f, tr, ab] = await Promise.all([
      api.get('/dashboard/summary'),
      api.get('/expenses'),
      api.get(`/sales/report?period=${period}`),
      api.get('/funds'),
      api.get('/transfers'),
      api.get('/payment-accounts/balances'),
    ]);
    setSummary(s.data.data.summary);
    setExpenses(e.data.data.expenses);
    setReport(r.data.data.report);
    setFunds(f.data.data.funds);
    setTransfers(tr.data.data.transfers);
    setAccountBalances(ab.data.data);
  };
  useEffect(() => { load(); }, [period]);

  const save = async () => {
    try {
      await api.post('/expenses', { ...form, amount: +form.amount });
      toast.success(t('Expense added'));
      setModal(false);
      setForm({ title: '', category: 'General', amount: 0, source: 'cash', account: null, note: '' });
      load();
    } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
  };
  const del = async (id) => { if (!confirm('Delete?')) return; await api.delete(`/expenses/${id}`); load(); };

  const saveFund = async () => {
    try {
      if (!(+fundForm.amount > 0)) return toast.error('Enter an amount');
      await api.post('/funds', { ...fundForm, amount: +fundForm.amount });
      toast.success(fundForm.type === 'withdraw' ? t('Fund withdrawn') : t('Fund added'));
      setFundModal(false);
      setFundForm({ source: 'cash', account: null, type: 'add', amount: 0, note: '' });
      load();
    } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
  };
  const delFund = async (id) => { if (!confirm('Delete?')) return; await api.delete(`/funds/${id}`); load(); };

  const openFund = (type) => { setFundForm({ source: 'cash', account: null, type, amount: 0, note: '' }); setFundModal(true); };

  const saveTransfer = async () => {
    try {
      if (!(+transferForm.amount > 0)) return toast.error('Enter an amount');
      const sameAccount = transferForm.fromAccount && transferForm.toAccount
        ? transferForm.fromAccount === transferForm.toAccount
        : !transferForm.fromAccount && !transferForm.toAccount;
      if (transferForm.fromMethod === transferForm.toMethod && sameAccount) return toast.error('Choose two different methods or accounts');
      await api.post('/transfers', { ...transferForm, amount: +transferForm.amount });
      toast.success(t('Balance transferred'));
      setTransferModal(false);
      setTransferForm({ fromMethod: 'bkash', toMethod: 'cash', fromAccount: null, toAccount: null, amount: 0, note: '' });
      load();
    } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
  };
  const delTransfer = async (id) => { if (!confirm('Delete?')) return; await api.delete(`/transfers/${id}`); load(); };

  const runAdvancedReport = async () => {
    setAdvLoading(true);
    try {
      const { data } = await api.get('/reports/advanced', { params: reportRange });
      setAdvReport(data.data);
      setAdvOpen(true);
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to build report'); }
    setAdvLoading(false);
  };

  if (!summary) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Finance</h1>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-ghost" onClick={() => setPrintReport(true)}><Printer size={18} /> Print Report</button>
          <button className="btn-ghost" onClick={() => openFund('add')}><PiggyBank size={18} /> Add Fund</button>
          <button className="btn-ghost" onClick={() => openFund('withdraw')}><PiggyBank size={18} /> Withdraw Fund</button>
          <button className="btn-ghost" onClick={() => setTransferModal(true)}><ArrowLeftRight size={18} /> Transfer Balance</button>
          <button className="btn-primary" onClick={() => setModal(true)}><Plus size={18} /> Add Expense</button>
        </div>
      </div>

      {/* Current balances — pick from/to at a glance when transferring or withdrawing */}
      {summary.balances && (
        <div className="card p-4">
          <h3 className="font-semibold mb-3">Balances</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 text-center">
            {Object.entries(summary.balances).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-slate-50 dark:bg-slate-800 p-2">
                <p className="text-xs text-slate-400 capitalize">{k}</p>
                <p className="font-semibold">{taka(v)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Named account balances — "kon bank a koto taka ache". Only accounts
          that actually exist (Settings → Payment Accounts) show up here; the
          per-method card above already covers shops with none set up. */}
      {accountBalances?.accounts?.length > 0 && (
        <div className="card p-4">
          <h3 className="font-semibold mb-3">Bank / Mobile Banking Accounts</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {accountBalances.accounts.map((a) => (
              <div key={a._id} className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3">
                <p className="text-xs text-slate-400 capitalize">{a.method}{a.accountNumber ? ` • ${a.accountNumber}` : ''}</p>
                <p className="font-medium text-sm truncate" title={a.name}>{a.name}</p>
                <p className={`font-semibold ${a.balance < 0 ? 'text-red-500' : ''}`}>{taka(a.balance)}</p>
              </div>
            ))}
            {Object.entries(accountBalances.unassigned || {}).filter(([, v]) => Math.abs(v) > 0.001).map(([m, v]) => (
              <div key={`unassigned-${m}`} className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3 border border-dashed border-slate-300 dark:border-slate-600">
                <p className="text-xs text-slate-400 capitalize">{m}</p>
                <p className="font-medium text-sm text-slate-400">General / Unassigned</p>
                <p className="font-semibold">{taka(v)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Advanced Report — full metric report, date-ranged, print/PDF (req 8) */}
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">From</label>
          <input type="date" className="input !w-auto" value={reportRange.from} onChange={(e) => setReportRange({ ...reportRange, from: e.target.value })} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input !w-auto" value={reportRange.to} onChange={(e) => setReportRange({ ...reportRange, to: e.target.value })} />
        </div>
        <button className="btn-primary" disabled={advLoading} onClick={runAdvancedReport}>
          <FileBarChart size={18} /> {advLoading ? 'Building…' : 'Advanced Report'}
        </button>
        <p className="text-xs text-slate-400 w-full sm:w-auto">Sales, purchase, profit, expense, balances, dues, product-wise sales/profit &amp; stock summary — for the selected range. Print → Save as PDF to export.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={Wallet} label="Month Revenue" value={taka(summary.monthRevenue)} accent="brand" />
        <StatCard icon={TrendingUp} label="Gross Profit" value={taka(summary.monthProfit)} accent="green" />
        <StatCard icon={TrendingDown} label="Total Expense" value={taka(summary.monthExpense)} accent="red" />
        <StatCard icon={TrendingUp} label="Net Profit" value={taka(summary.netProfit)} accent={summary.netProfit >= 0 ? 'green' : 'red'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Sales Report</h3>
            <select className="input !w-auto !py-1" value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="daily">Daily</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <DataTable
            columns={[
              { key: '_id', label: 'Period' },
              { key: 'count', label: 'Orders', className: 'text-right' },
              { key: 'totalSales', label: 'Sales', className: 'text-right', render: (r) => taka(r.totalSales) },
              { key: 'totalProfit', label: 'Profit', className: 'text-right', render: (r) => <span className="text-green-600">{taka(r.totalProfit)}</span> },
            ]}
            rows={report}
            empty="No sales yet"
          />
        </div>

        <div className="card p-4">
          <h3 className="font-semibold mb-3">Expenses</h3>
          <DataTable
            columns={[
              { key: 'title', label: 'Title' },
              { key: 'category', label: 'Category' },
              { key: 'source', label: 'From', render: (r) => (
                <div><span className="capitalize">{r.source || 'cash'}</span>{r.account?.name && <div className="text-xs text-slate-400">{r.account.name}</div>}</div>
              ) },
              { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
              { key: 'amount', label: 'Amount', className: 'text-right', render: (r) => <span className="text-red-500">{taka(r.amount)}</span> },
              { key: 'actions', label: '', className: 'text-right', render: (r) => (
                <button onClick={() => del(r._id)} className="btn-ghost p-1.5 text-red-500"><Trash2 size={15} /></button>
              )},
            ]}
            rows={expenses}
            empty="No expenses recorded"
          />
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2"><PiggyBank size={18} /> Fund History (capital added / withdrawn)</h3>
          <span className="text-sm text-slate-400">Net: {taka(funds.reduce((a, f) => a + (f.type === 'withdraw' ? -f.amount : f.amount), 0))}</span>
        </div>
        <DataTable
          columns={[
            { key: 'type', label: 'Type', render: (r) => (
              <span className={`badge ${r.type === 'withdraw' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{r.type === 'withdraw' ? 'Withdraw' : 'Add'}</span>
            )},
            { key: 'source', label: 'Method', render: (r) => (
              <div><span className="capitalize">{r.source}</span>{r.account?.name && <div className="text-xs text-slate-400">{r.account.name}</div>}</div>
            ) },
            { key: 'note', label: 'Note', render: (r) => r.note || '—' },
            { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
            { key: 'amount', label: 'Amount', className: 'text-right', render: (r) => (
              <span className={r.type === 'withdraw' ? 'text-red-500' : 'text-green-600'}>{r.type === 'withdraw' ? '-' : '+'}{taka(r.amount)}</span>
            )},
            { key: 'actions', label: '', className: 'text-right', render: (r) => (
              <button onClick={() => delFund(r._id)} className="btn-ghost p-1.5 text-red-500"><Trash2 size={15} /></button>
            )},
          ]}
          rows={funds}
          empty="No funds added yet"
        />
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2"><ArrowLeftRight size={18} /> Balance Transfer History</h3>
        </div>
        <DataTable
          columns={[
            { key: 'fromMethod', label: 'From', render: (r) => (
              <div><span className="capitalize">{r.fromMethod}</span>{r.fromAccount?.name && <div className="text-xs text-slate-400">{r.fromAccount.name}</div>}</div>
            ) },
            { key: 'toMethod', label: 'To', render: (r) => (
              <div><span className="capitalize">{r.toMethod}</span>{r.toAccount?.name && <div className="text-xs text-slate-400">{r.toAccount.name}</div>}</div>
            ) },
            { key: 'note', label: 'Note', render: (r) => r.note || '—' },
            { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
            { key: 'amount', label: 'Amount', className: 'text-right', render: (r) => taka(r.amount) },
            { key: 'actions', label: '', className: 'text-right', render: (r) => (
              <button onClick={() => delTransfer(r._id)} className="btn-ghost p-1.5 text-red-500"><Trash2 size={15} /></button>
            )},
          ]}
          rows={transfers}
          empty="No transfers yet"
        />
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Add Expense"
        footer={<><button className="btn-ghost" onClick={() => setModal(false)}>Cancel</button><button className="btn-primary" onClick={save}>Save</button></>}>
        <div className="space-y-3">
          <div><label className="label">Title</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div><label className="label">Category</label>
            <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option>General</option><option>Rent</option><option>Utility</option><option>Salary</option><option>Purchase</option><option>Marketing</option><option>Other</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Amount</label><input className="input" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div><label className="label">Paid From</label>
              <select className="input" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value, account: null })}>
                <option value="cash">Cash</option><option value="bank">Bank</option><option value="bkash">bKash</option>
                <option value="nagad">Nagad</option><option value="rocket">Rocket</option><option value="card">Card</option>
              </select>
            </div>
          </div>
          <AccountSelect method={form.source} value={form.account} onChange={(v) => setForm({ ...form, account: v })} />
          <div><label className="label">Note</label><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
        </div>
      </Modal>

      <Modal open={fundModal} onClose={() => setFundModal(false)} title={fundForm.type === 'withdraw' ? 'Withdraw Fund (Capital)' : 'Add Fund (Capital)'}
        footer={<><button className="btn-ghost" onClick={() => setFundModal(false)}>Cancel</button><button className="btn-primary" onClick={saveFund}>Save</button></>}>
        <div className="space-y-3">
          <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 text-sm">
            <button type="button" className={`flex-1 py-1.5 ${fundForm.type === 'add' ? 'bg-brand-600 text-white' : ''}`} onClick={() => setFundForm({ ...fundForm, type: 'add' })}>Add Capital</button>
            <button type="button" className={`flex-1 py-1.5 ${fundForm.type === 'withdraw' ? 'bg-brand-600 text-white' : ''}`} onClick={() => setFundForm({ ...fundForm, type: 'withdraw' })}>Withdraw Capital</button>
          </div>
          <p className="text-xs text-slate-400">
            {fundForm.type === 'withdraw'
              ? <>Take back part (or all) of capital previously brought in — e.g. you added ৳20,000 and now want ৳10,000 back, rest later. This reduces the selected balance and is <b>not</b> an expense.</>
              : <>Capital brought in from outside the shop. This tops up the selected balance and is <b>not</b> counted as income or expense.</>}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Amount</label><input className="input" type="number" value={fundForm.amount} onChange={(e) => setFundForm({ ...fundForm, amount: e.target.value })} /></div>
            <div><label className="label">{fundForm.type === 'withdraw' ? 'Withdraw From' : 'Add To'}</label>
              <select className="input" value={fundForm.source} onChange={(e) => setFundForm({ ...fundForm, source: e.target.value, account: null })}>
                <option value="cash">Cash</option><option value="bank">Bank</option><option value="bkash">bKash</option>
                <option value="nagad">Nagad</option><option value="rocket">Rocket</option><option value="card">Card</option>
              </select>
            </div>
          </div>
          <AccountSelect method={fundForm.source} value={fundForm.account} onChange={(v) => setFundForm({ ...fundForm, account: v })} />
          <div><label className="label">Note</label><input className="input" value={fundForm.note} onChange={(e) => setFundForm({ ...fundForm, note: e.target.value })} placeholder="e.g. owner capital, loan" /></div>
        </div>
      </Modal>

      <Modal open={transferModal} onClose={() => setTransferModal(false)} title="Transfer Balance"
        footer={<><button className="btn-ghost" onClick={() => setTransferModal(false)}>Cancel</button><button className="btn-primary" onClick={saveTransfer}>Transfer</button></>}>
        <div className="space-y-3">
          <p className="text-xs text-slate-400">Move money between your own balances in one step — e.g. bKash ৳5,000 cashed out to Cash. Not income or expense; one balance goes down, the other goes up.</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="label">From</label>
              <select className="input" value={transferForm.fromMethod} onChange={(e) => setTransferForm({ ...transferForm, fromMethod: e.target.value, fromAccount: null })}>
                <option value="cash">Cash ({taka(summary.balances?.cash || 0)})</option>
                <option value="bank">Bank ({taka(summary.balances?.bank || 0)})</option>
                <option value="bkash">bKash ({taka(summary.balances?.bkash || 0)})</option>
                <option value="nagad">Nagad ({taka(summary.balances?.nagad || 0)})</option>
                <option value="rocket">Rocket ({taka(summary.balances?.rocket || 0)})</option>
                <option value="card">Card ({taka(summary.balances?.card || 0)})</option>
              </select>
              <AccountSelect method={transferForm.fromMethod} value={transferForm.fromAccount} onChange={(v) => setTransferForm({ ...transferForm, fromAccount: v })} />
            </div>
            <div className="space-y-1.5">
              <label className="label">To</label>
              <select className="input" value={transferForm.toMethod} onChange={(e) => setTransferForm({ ...transferForm, toMethod: e.target.value, toAccount: null })}>
                <option value="cash">Cash</option><option value="bank">Bank</option><option value="bkash">bKash</option>
                <option value="nagad">Nagad</option><option value="rocket">Rocket</option><option value="card">Card</option>
              </select>
              <AccountSelect method={transferForm.toMethod} value={transferForm.toAccount} onChange={(v) => setTransferForm({ ...transferForm, toAccount: v })} />
            </div>
          </div>
          <p className="text-xs text-slate-400">Both sides can be the same method (e.g. Bank → Bank) as long as you pick two different named accounts.</p>
          <div><label className="label">Amount</label><input className="input" type="number" value={transferForm.amount} onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })} /></div>
          <div><label className="label">Note</label><input className="input" value={transferForm.note} onChange={(e) => setTransferForm({ ...transferForm, note: e.target.value })} placeholder="e.g. cashed out at the counter" /></div>
        </div>
      </Modal>

      <PrintWrapper open={printReport} onClose={() => setPrintReport(false)} title="Sales Report">
        <div className="print-a4">
          <div className="text-center mb-4">
            <h1 className="text-xl font-bold">{business?.name}</h1>
            <p className="text-sm">{business?.address}</p>
            <h2 className="text-lg font-semibold mt-2">Sales Report ({period})</h2>
          </div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-black">
                <th className="text-left py-1">Period</th>
                <th className="text-right py-1">Orders</th>
                <th className="text-right py-1">Sales</th>
                <th className="text-right py-1">Profit</th>
              </tr>
            </thead>
            <tbody>
              {report.map((r) => (
                <tr key={r._id} className="border-b border-gray-300">
                  <td className="py-1">{r._id}</td>
                  <td className="text-right py-1">{r.count}</td>
                  <td className="text-right py-1">{taka(r.totalSales)}</td>
                  <td className="text-right py-1">{taka(r.totalProfit)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black font-bold">
                <td className="py-1">Total</td>
                <td className="text-right py-1">{report.reduce((a, r) => a + r.count, 0)}</td>
                <td className="text-right py-1">{taka(report.reduce((a, r) => a + r.totalSales, 0))}</td>
                <td className="text-right py-1">{taka(report.reduce((a, r) => a + r.totalProfit, 0))}</td>
              </tr>
            </tfoot>
          </table>
          <p className="text-center text-xs mt-6 text-gray-500">{business?.name}{business?.phone ? ` • ${business.phone}` : ''}</p>
        </div>
      </PrintWrapper>

      <PrintWrapper open={advOpen} onClose={() => setAdvOpen(false)} title="Advanced Business Report">
        <AdvancedReport data={advReport} business={business} />
      </PrintWrapper>
    </div>
  );
}
