// Stock-on-hand report, grouped by supplier/dealer — one click from Products
// shows every product currently in stock, who it came from, and how many of
// each. Respects whatever category filter is active on the Products page.
export default function StockReport({ business, category, groups }) {
  const grandQty = groups.reduce((s, g) => s + g.qty, 0);
  const grandCount = groups.reduce((s, g) => s + g.items.length, 0);

  return (
    <div className="print-a4">
      <div className="text-center mb-4">
        <h1 className="text-xl font-bold">{business?.name}</h1>
        <p className="text-sm">{business?.address}</p>
        <h2 className="text-lg font-semibold mt-2">Stock Report — {category || 'All Categories'}</h2>
        <p className="text-xs text-gray-500">Generated {new Date().toLocaleString()}</p>
      </div>

      {groups.length === 0 && <p className="text-center text-sm text-gray-400 py-8">No in-stock products for this selection</p>}

      {groups.map((g) => (
        <div key={g.supplier} className="mb-5" style={{ breakInside: 'avoid' }}>
          <h3 className="text-sm font-bold uppercase tracking-wide border-b border-black pb-1 mb-2">
            {g.supplier} <span className="font-normal normal-case">— {g.items.length} product(s), {g.qty} pcs</span>
          </h3>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-black">
                <th className="text-left py-1">Product</th>
                <th className="text-left py-1">Category</th>
                <th className="text-right py-1">Stock</th>
              </tr>
            </thead>
            <tbody>
              {g.items.map((it) => (
                <tr key={it._id} className="border-b border-gray-200">
                  <td className="py-1">
                    {it.name}
                    {[it.brand, it.storage, it.color].filter(Boolean).join(' • ') && (
                      <div className="text-xs text-gray-500">{[it.brand, it.storage, it.color].filter(Boolean).join(' • ')}</div>
                    )}
                  </td>
                  <td className="py-1">{it.category}</td>
                  <td className="text-right py-1">{it.stock} {it.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {groups.length > 0 && (
        <div className="border-t-2 border-black pt-2 flex justify-between font-bold text-sm">
          <span>Grand Total</span>
          <span>{grandCount} product(s) • {grandQty} pcs</span>
        </div>
      )}
      <p className="text-center text-xs mt-6 text-gray-500">{business?.name}{business?.phone ? ` • ${business.phone}` : ''}</p>
    </div>
  );
}
