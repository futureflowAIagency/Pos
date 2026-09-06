export default function StatCard({ icon: Icon, label, value, sub, accent = 'brand' }) {
  const colors = {
    brand: 'bg-brand-50 text-brand-600 dark:bg-brand-600/20 dark:text-brand-100',
    green: 'bg-green-50 text-green-600 dark:bg-green-600/20 dark:text-green-300',
    red: 'bg-red-50 text-red-600 dark:bg-red-600/20 dark:text-red-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-600/20 dark:text-amber-300',
    coral: 'bg-coral-50 text-coral-600 dark:bg-coral-600/20 dark:text-coral-300',
  };
  return (
    <div className="card p-4 flex items-center gap-4">
      {Icon && (
        <div className={`p-3 rounded-xl ${colors[accent] || colors.brand}`}>
          <Icon size={22} />
        </div>
      )}
      <div>
        <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-xl font-bold">{value}</p>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}
