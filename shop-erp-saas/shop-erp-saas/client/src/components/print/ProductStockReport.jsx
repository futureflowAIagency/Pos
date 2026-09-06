import { taka, fmtDate, fmtDateTime } from '../../utils/format.js';

// "Stock Print by Model" — the full picture of one specific product: how much
// has been sold in total, which supplier(s) it came from and how much each
// time, exactly which date each sale happened, and how many are on the shelf
// right now. Sibling to StockReport.jsx and StockReportByBrand.jsx (both list
// many products); this one drills into exactly one, reached from a name
// search on the Products page.
export default function ProductStockReport({ business, product, totalSold, totalReturned, currentStock, suppliers, sales = [] }) {
  if (!product) return null;
  const totalPurchased = suppliers.reduce((s, r) => s + r.qty, 0);

  return (
    <div className="print-a4">
      <div className="text-center mb-4">
        <h1 className="text-xl font-bold">{business?.name}</h1>
        <p className="text-sm">{business?.address}</p>
        <h2 className="text-lg font-semibold mt-2">Stock Report by Model</h2>
        <p className="text-xs text-gray-500">Generated {new Date().toLocaleString()}</p>
      </div>

      <div className="border border-black rounded p-3 mb-4">
        <h3 className="text-base font-bold">{product.name}</h3>
        <p className="text-sm text-gray-600">
          {[product.category, product.brand, product.storage, product.color].filter(Boolean).join(' • ')}
          {product.sku ? ` • SKU: ${product.sku}` : ''}
          {product.barcode ? ` • Barcode: ${product.barcode}` : ''}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5 text-center">
        <div className="border border-black rounded p-2">
          <div className="text-xs text-gray-500">Total Sold (all time)</div>
          <div className="text-lg font-bold">{totalSold} pcs</div>
          {totalReturned > 0 && <div className="text-xs text-gray-500">{totalReturned} returned, excluded</div>}
        </div>
        <div className="border border-black rounded p-2">
          <div className="text-xs text-gray-500">Total Purchased (all time)</div>
          <div className="text-lg font-bold">{totalPurchased} pcs</div>
        </div>
        <div className="border border-black rounded p-2">
          <div className="text-xs text-gray-500">Current Stock</div>
          <div className="text-lg font-bold">{currentStock} pcs</div>
        </div>
      </div>

      <h3 className="text-sm font-bold uppercase tracking-wide border-b border-black pb-1 mb-2">
        Bought From <span className="font-normal normal-case">— {suppliers.length} supplier(s)</span>
      </h3>
      {suppliers.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">No purchase record for this product — likely from an initial stock import.</p>
      ) : (
        <table className="w-full text-sm border-collapse mb-5">
          <thead>
            <tr className="border-b-2 border-black">
              <th className="text-left py-1">Supplier</th>
              <th className="text-left py-1">Phone</th>
              <th className="text-right py-1">Qty Bought</th>
              <th className="text-right py-1">Last Purchase</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s, i) => (
              <tr key={i} className="border-b border-gray-200">
                <td className="py-1">{s.supplier}</td>
                <td className="py-1">{s.phone || '—'}</td>
                <td className="text-right py-1">{s.qty} pcs</td>
                <td className="text-right py-1">{s.lastDate ? fmtDate(s.lastDate) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 className="text-sm font-bold uppercase tracking-wide border-b border-black pb-1 mb-2">
        Sold On <span className="font-normal normal-case">— {sales.length} sale(s)</span>
      </h3>
      {sales.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 mb-3">This product has never been sold yet.</p>
      ) : (
        <table className="w-full text-sm border-collapse mb-5" style={{ breakInside: 'auto' }}>
          <thead>
            <tr className="border-b-2 border-black">
              <th className="text-left py-1">Date</th>
              <th className="text-left py-1">Invoice</th>
              <th className="text-left py-1">Customer</th>
              <th className="text-left py-1">IMEI / Serial</th>
              <th className="text-right py-1">Qty</th>
              <th className="text-right py-1">Price</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((s, i) => (
              <tr key={i} className="border-b border-gray-200">
                <td className="py-1">{fmtDateTime(s.createdAt)}</td>
                <td className="py-1">{s.invoiceNo}</td>
                <td className="py-1">{s.customerName || 'Walk-in'}</td>
                <td className="py-1">{s.imei1 || s.serial || '—'}</td>
                <td className="text-right py-1">
                  {s.qty}{s.returnedQty > 0 ? <span className="text-gray-500"> ({s.returnedQty} returned)</span> : ''}
                </td>
                <td className="text-right py-1">{taka(s.sellingPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(product.purchasePrice || product.sellingPrice) ? (
        <div className="flex justify-between text-sm border-t-2 border-black pt-2">
          <span>Buy Price: {taka(product.purchasePrice || 0)}</span>
          <span>Sell Price: {taka(product.sellingPrice || 0)}</span>
        </div>
      ) : null}

      <p className="text-center text-xs mt-6 text-gray-500">{business?.name}{business?.phone ? ` • ${business.phone}` : ''}</p>
    </div>
  );
}
