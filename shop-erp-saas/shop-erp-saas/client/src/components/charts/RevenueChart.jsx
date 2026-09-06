import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useTheme } from '../../context/ThemeContext.jsx';

export default function RevenueChart({ data = [] }) {
  const { theme } = useTheme();
  const grid = theme === 'dark' ? '#334155' : '#e2e8f0';
  const text = theme === 'dark' ? '#94a3b8' : '#64748b';
  const chartData = data.map((d) => ({ date: d._id?.slice(5) || d._id, revenue: d.revenue, profit: d.profit }));

  return (
    <div className="card p-4">
      <h3 className="font-semibold mb-4">Revenue (Last 7 days)</h3>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0d9488" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} />
          <XAxis dataKey="date" stroke={text} fontSize={12} />
          <YAxis stroke={text} fontSize={12} />
          <Tooltip contentStyle={{ background: theme === 'dark' ? '#1e293b' : '#fff', border: `1px solid ${grid}`, borderRadius: 8, color: text }} />
          <Area type="monotone" dataKey="revenue" stroke="#0d9488" strokeWidth={2} fill="url(#rev)" name="Revenue" />
          <Area type="monotone" dataKey="profit" stroke="#16a34a" strokeWidth={2} fillOpacity={0} name="Profit" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
