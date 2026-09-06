// Lightweight, fast table. columns: [{ key, label, render?, className? }]
// Optional onRowClick(row) makes rows clickable.
export default function DataTable({ columns, rows, empty = 'No data found', rowKey = '_id', onRowClick }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-brand-50 dark:bg-slate-700/50 text-left text-slate-500 dark:text-slate-300">
              {columns.map((c) => (
                <th key={c.key} className={`px-4 py-3 font-medium whitespace-nowrap ${c.className || ''}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-slate-400">{empty}</td></tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row[rowKey]}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`border-t border-brand-200 dark:border-slate-700 hover:bg-brand-50 dark:hover:bg-slate-700/40 ${onRowClick ? 'cursor-pointer' : ''}`}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={`px-4 py-3 ${c.className || ''}`}>
                      {c.render ? c.render(row) : row[c.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
