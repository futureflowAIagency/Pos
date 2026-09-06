import { useEffect, useState } from 'react';
import { DollarSign, TrendingUp, TrendingDown, Package, AlertTriangle, ShoppingBag, Users, Trophy, Receipt, Activity, Sparkles, Banknote, Landmark, Smartphone, Wallet, CreditCard, Wrench, CalendarClock, PackageX, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios.js';
import StatCard from '../components/ui/StatCard.jsx';
import RevenueChart from '../components/charts/RevenueChart.jsx';
import PaymentPie from '../components/charts/PaymentPie.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import DataTable from '../components/ui/DataTable.jsx';
import OrderDetailsModal from '../components/OrderDetailsModal.jsx';
import { taka, fmtDateTime } from '../utils/format.js';
import { useLang } from '../context/LanguageContext.jsx';

const niceAction = (s = '') => s.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const LOW_STOCK_PAGE_SIZE = 8;

export default function Dashboard() {
  const { lang } = useLang();
  const [data, setData] = useState(null);
  const [chart, setChart] = useState([]);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  // dashboard date filter
  const [period, setPeriod] = useState('monthly');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [openOrder, setOpenOrder] = useState(null); // saleId for the details modal
  const [lowStockPage, setLowStockPage] = useState(1);

  const loadSummary = async () => {
    const params = { period };
    if (period === 'custom') { params.from = custom.from; params.to = custom.to; }
    const s = await api.get('/dashboard/summary', { params });
    setData(s.data.data);
  };

  useEffect(() => {
    if (period === 'custom' && (!custom.from || !custom.to)) return; // wait for both dates
    loadSummary();
    setLowStockPage(1);
  }, [period, custom.from, custom.to]);

  useEffect(() => {
    (async () => {
      const c = await api.get('/dashboard/revenue-chart');
      setChart(c.data.data.chart);
    })();
  }, []);

  if (!data) return <Spinner />;
  const s = data.summary;
  const bal = s.balances || {};
  const svc = s.service || {};
  const emi = s.emi || {};
  const periodLabels = { daily: 'Today', weekly: 'This Week', monthly: 'This Month', half_yearly: 'Last 6 Months', yearly: 'This Year', custom: 'Custom Range' };

  const genAiSummary = async () => {
    setAiLoading(true);
    try {
      const { data: res } = await api.post('/dashboard/ai-summary', { summary: s, topProducts: data.topProducts, slowMoving: data.slowMoving, lang });
      setAiText(res.data.summary);
    } catch (e) { toast.error(e.response?.data?.message || 'AI error'); }
    setAiLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <select className="input !w-auto !py-1.5" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="half_yearly">Half-Yearly</option>
            <option value="yearly">Yearly</option>
            <option value="custom">Custom Range</option>
          </select>
          {period === 'custom' && (
            <>
              <input type="date" className="input !w-auto !py-1.5" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
              <span className="text-slate-400">→</span>
              <input type="date" className="input !w-auto !py-1.5" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
            </>
          )}
        </div>
      </div>

      {/* Financial summary — respects the date filter */}
      <div>
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2">Financial Summary · {periodLabels[period]}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          <StatCard icon={DollarSign} label="Total Income" value={taka(s.periodRevenue ?? s.monthRevenue)} sub={`${s.periodSalesCount ?? s.monthSalesCount} orders`} accent="brand" />
          <StatCard icon={TrendingDown} label="Total Expense" value={taka(s.periodExpense ?? s.monthExpense)} accent="red" />
          {/* Total Profit now includes EMI margin earned on instalments collected
              in this period — the sub-line says how much of it came from EMI. */}
          <StatCard icon={TrendingUp} label="Total Profit" value={taka(s.periodNetProfit ?? s.netProfit)}
            sub={s.periodEmiProfit > 0 ? `incl. ${taka(s.periodEmiProfit)} from EMI` : undefined}
            accent={(s.periodNetProfit ?? s.netProfit) >= 0 ? 'green' : 'red'} />
          <StatCard icon={AlertTriangle} label="Total Due" value={taka(s.totalDue)} accent="red" />
          <StatCard icon={CalendarClock} label="EMI Receivable" value={taka(s.emiReceivable || 0)} sub={`${s.activeEmiCount || 0} active plan(s)`} accent="amber" />
        </div>
      </div>

      {/* Balances — cumulative money on hand per method */}
      <div>
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2">Balances</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard icon={Banknote} label="Cash" value={taka(bal.cash || 0)} accent="green" />
          <StatCard icon={Landmark} label="Bank" value={taka(bal.bank || 0)} accent="brand" />
          <StatCard icon={Smartphone} label="bKash" value={taka(bal.bkash || 0)} accent="coral" />
          <StatCard icon={Smartphone} label="Nagad" value={taka(bal.nagad || 0)} accent="amber" />
          <StatCard icon={Wallet} label="Rocket" value={taka(bal.rocket || 0)} accent="brand" />
          <StatCard icon={CreditCard} label="Card Collection" value={taka(bal.card || 0)} accent="brand" />
        </div>
      </div>

      {/* EMI / Installments — money and profit recognised in this period.
          Profit arrives with each instalment, not all at once at plan creation. */}
      {(emi.collected > 0 || emi.plansWithoutCost > 0) && (
        <div>
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2">EMI / Installments · {periodLabels[period]}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <StatCard icon={CalendarClock} label="EMI Collected" value={taka(emi.collected)} sub={`${emi.payments || 0} payment(s)`} accent="brand" />
            <StatCard icon={TrendingUp} label="EMI Profit Earned" value={taka(emi.profit)} accent={emi.profit >= 0 ? 'green' : 'red'} />
            <StatCard icon={CalendarClock} label="EMI Receivable" value={taka(s.emiReceivable || 0)} sub={`${s.activeEmiCount || 0} active plan(s)`} accent="amber" />
          </div>
          {emi.plansWithoutCost > 0 && (
            <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
              <AlertTriangle size={13} /> {emi.plansWithoutCost} EMI plan(s) took payments but have no item cost recorded, so no profit could be counted for them. Set the item's purchase price when creating the plan.
            </p>
          )}
        </div>
      )}

      {/* Service & Repair — internal profit breakdown, respects the date filter */}
      {svc.count > 0 && (
        <div>
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2">Service &amp; Repair · {periodLabels[period]}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard icon={Wrench} label="Service Revenue" value={taka(svc.revenue)} sub={`${svc.count} job(s)`} accent="brand" />
            <StatCard icon={TrendingDown} label="Parts Cost" value={taka(svc.partsCost)} accent="red" />
            <StatCard icon={TrendingDown} label="Technician Cost" value={taka(svc.technicianCost)} accent="red" />
            <StatCard icon={TrendingUp} label="Net Profit" value={taka(svc.netProfit)} accent={svc.netProfit >= 0 ? 'green' : 'red'} />
          </div>
        </div>
      )}

      {/* Operational stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={ShoppingBag} label="Today's Sales" value={taka(s.todayRevenue)} sub={`${s.todaySalesCount} orders`} accent="brand" />
        <StatCard icon={Package} label="Products" value={s.totalProducts} accent="brand" />
        <StatCard icon={AlertTriangle} label="Low Stock" value={s.lowStockCount} accent="amber" />
        <StatCard icon={Users} label="Employees" value={s.employeesCount} accent="brand" />
      </div>

      {/* AI Summary + Suggestions */}
      <div className="card p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-semibold flex items-center gap-2"><Sparkles size={18} className="text-brand-600" /> AI Business Summary &amp; Suggestions</h3>
          <button className="btn-ghost" disabled={aiLoading} onClick={genAiSummary}>
            <Sparkles size={15} /> {aiLoading ? 'Analyzing…' : aiText ? 'Regenerate' : 'Generate summary'}
          </button>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-3 leading-relaxed whitespace-pre-line">
          {aiText || 'Click "Generate summary" for an AI insight on this month\'s performance plus concrete suggestions to boost sales, based on your top sellers and slow-moving stock (uses your own AI key from Marketing → Integrations).'}
        </p>
      </div>

      {/* Revenue + Payment pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2"><RevenueChart data={chart} /></div>
        <PaymentPie data={data.paymentBreakdown} />
      </div>

      {/* Top sellers vs slow-moving / dead stock */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Trophy size={18} className="text-amber-500" /> Top Selling Products <span className="text-xs font-normal text-slate-400">(this month)</span></h3>
          <DataTable
            columns={[
              { key: '_id', label: 'Product' },
              { key: 'qty', label: 'Sold', className: 'text-right', render: (r) => <span className="font-semibold">{r.qty}</span> },
              { key: 'revenue', label: 'Revenue', className: 'text-right', render: (r) => taka(r.revenue) },
            ]}
            rows={data.topProducts}
            empty="No sales this month"
          />
        </div>

        <div className="card p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><PackageX size={18} className="text-red-500" /> Slow-Moving / Dead Stock <span className="text-xs font-normal text-slate-400">(last 90 days)</span></h3>
          <DataTable
            columns={[
              { key: 'name', label: 'Product' },
              { key: 'qtySold', label: 'Sold', className: 'text-right', render: (r) => <span className={r.qtySold === 0 ? 'text-red-500 font-semibold' : ''}>{r.qtySold}</span> },
              { key: 'stock', label: 'Stock', className: 'text-right' },
              { key: 'lastSoldAt', label: 'Last Sold', render: (r) => r.daysSinceLastSale != null ? `${r.daysSinceLastSale}d ago` : <span className="text-red-500">Never</span> },
            ]}
            rows={data.slowMoving}
            empty="No slow-moving stock 🎉"
          />
        </div>
      </div>

      {/* Recent orders + Low stock */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Receipt size={18} className="text-brand-600" /> Recent Orders <span className="text-xs font-normal text-slate-400">(click a row for details)</span></h3>
          <DataTable
            columns={[
              { key: 'invoiceNo', label: 'Invoice' },
              { key: 'customerName', label: 'Customer' },
              { key: 'paymentMethod', label: 'Pay', render: (r) => (
                <span className={`text-xs uppercase font-semibold ${r.paymentMethod === 'due' ? 'text-red-500' : 'text-slate-500'}`}>{r.paymentMethod}</span>
              ) },
              { key: 'total', label: 'Total', className: 'text-right', render: (r) => taka(r.total) },
            ]}
            rows={data.recentOrders}
            onRowClick={(r) => setOpenOrder(r._id)}
            empty="No orders yet"
          />
        </div>

        <div className="card p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-500" /> Low Stock Alert
            {data.lowStockProducts.length > 0 && <span className="text-xs font-normal text-slate-400">({data.lowStockProducts.length})</span>}
          </h3>
          <DataTable
            columns={[
              { key: 'name', label: 'Product' },
              { key: 'stock', label: 'Stock', className: 'text-right', render: (r) => <span className="text-red-500 font-semibold">{r.stock}</span> },
            ]}
            rows={data.lowStockProducts.slice((lowStockPage - 1) * LOW_STOCK_PAGE_SIZE, lowStockPage * LOW_STOCK_PAGE_SIZE)}
            empty="All stocked up ✅"
          />
          {data.lowStockProducts.length > LOW_STOCK_PAGE_SIZE && (
            <div className="flex items-center justify-between text-sm mt-2">
              <span className="text-slate-400">
                {(lowStockPage - 1) * LOW_STOCK_PAGE_SIZE + 1}–{Math.min(lowStockPage * LOW_STOCK_PAGE_SIZE, data.lowStockProducts.length)} of {data.lowStockProducts.length}
              </span>
              <div className="flex items-center gap-2">
                <button className="btn-ghost p-1.5" disabled={lowStockPage <= 1} onClick={() => setLowStockPage((p) => Math.max(1, p - 1))}><ChevronLeft size={16} /></button>
                <span>{lowStockPage} / {Math.max(1, Math.ceil(data.lowStockProducts.length / LOW_STOCK_PAGE_SIZE))}</span>
                <button className="btn-ghost p-1.5" disabled={lowStockPage >= Math.ceil(data.lowStockProducts.length / LOW_STOCK_PAGE_SIZE)} onClick={() => setLowStockPage((p) => p + 1)}><ChevronRight size={16} /></button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent activities */}
      <div className="card p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><Activity size={18} className="text-brand-600" /> Recent Activities</h3>
        {data.recentActivities?.length ? (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {data.recentActivities.map((a, i) => (
              <li key={i} className="py-2 flex items-center justify-between text-sm">
                <span><span className="font-medium">{niceAction(a.action)}</span>{a.entity ? <span className="text-slate-400"> · {a.entity}</span> : null}</span>
                <span className="text-slate-400 text-xs">{a.user} · {fmtDateTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-slate-400">No recent activity</p>}
      </div>

      {openOrder && (
        <OrderDetailsModal
          saleId={openOrder}
          onClose={() => setOpenOrder(null)}
          onChanged={loadSummary}
        />
      )}
    </div>
  );
}
