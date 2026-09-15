import { taka, fmtDate } from '../../utils/format.js';

// The two dates arrive as plain 'YYYY-MM-DD' calendar days. `new Date('...')`
// would read those as UTC midnight, which prints as the PREVIOUS day anywhere
// behind UTC — so pin them to local midnight before formatting.
const day = (d) => (d ? fmtDate(new Date(`${d}T00:00:00`)) : '-');

// Stock Print by Date — the shop's stock on two chosen days side by side, then
// each day's own sales in full (which customer bought what, and which employee
// sold it). Sibling of StockReport / StockReportByBrand / ProductStockReport;
// same A4 + PrintWrapper pattern as every other report in this app.
//
// The two dates are whatever the owner picked — yesterday vs today, or any two
// days at all — so the headings always print the real dates rather than
// "yesterday"/"today" wording that could be wrong.

// One day's sales, printed as its own table. Kept as a local component so the
// two days render identically without the markup being written out twice.
function SalesTable({ title, rows }) {
  const totalQty = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
  const totalValue = rows.reduce((s, r) => s + (Number(r.lineTotal) || 0), 0);
  return (
    <div className="mb-5" style={{ breakInside: 'avoid' }}>
      <h3 className="text-sm font-bold uppercase tracking-wide border-b border-black pb-1 mb-2">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-500 py-2">Nothing was sold on this date.</p>
      ) : (
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b-2 border-black">
              <th className="text-left py-1">#</th>
              <th className="text-left py-1">Product</th>
              <th className="text-left py-1">Customer</th>
              <th className="text-left py-1">Sold By</th>
              <th className="text-left py-1">Invoice</th>
              <th className="text-right py-1">Qty</th>
              <th className="text-right py-1">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.invoiceNo}-${i}`} className="border-b border-gray-200">
                <td className="py-1">{i + 1}</td>
                <td className="py-1">
                  {r.productName}
                  {r.imei && <div className="text-[10px] text-gray-500">{r.imei}</div>}
                  {r.returnedQty > 0 && <div className="text-[10px] text-gray-500">({r.returnedQty} returned)</div>}
                </td>
                <td className="py-1">{r.customerName}</td>
                <td className="py-1">{r.soldByName}</td>
                <td className="py-1">
                  {r.invoiceNo}
                  {r.isEmi && <span className="ml-1 text-[10px] font-semibold">[EMI]</span>}
                </td>
                <td className="text-right py-1">{r.qty}</td>
                <td className="text-right py-1">{taka(r.lineTotal)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-black font-bold">
              <td className="py-1" colSpan={5}>Total sold</td>
              <td className="text-right py-1">{totalQty}</td>
              <td className="text-right py-1">{taka(totalValue)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function StockByDateReport({ business, report }) {
  if (!report) return null;
  const { date1, date2, rows, totals, sales1, sales2, soldOut, category } = report;

  return (
    <div className="print-a4">
      <div className="text-center mb-4">
        <h1 className="text-xl font-bold">{business?.name}</h1>
        <p className="text-sm">{business?.address}</p>
        <h2 className="text-lg font-semibold mt-2">Stock Comparison Report — {category || 'All Categories'}</h2>
        <p className="text-sm font-medium">{day(date1)} &nbsp;vs&nbsp; {day(date2)}</p>
        <p className="text-xs text-gray-500">Generated {new Date().toLocaleString()}</p>
      </div>

      {/* Headline numbers for each day, so the difference is readable at a glance */}
      <table className="w-full text-sm border-collapse mb-5" style={{ breakInside: 'avoid' }}>
        <thead>
          <tr className="border-b-2 border-black">
            <th className="text-left py-1">Summary</th>
            <th className="text-right py-1">{day(date1)}</th>
            <th className="text-right py-1">{day(date2)}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-gray-200">
            <td className="py-1">Products in stock</td>
            <td className="text-right py-1">{totals.date1.products}</td>
            <td className="text-right py-1">{totals.date2.products}</td>
          </tr>
          <tr className="border-b border-gray-200">
            <td className="py-1">Total quantity in stock</td>
            <td className="text-right py-1">{totals.date1.qty}</td>
            <td className="text-right py-1">{totals.date2.qty}</td>
          </tr>
          <tr className="border-b border-gray-200">
            <td className="py-1">Items sold that day</td>
            <td className="text-right py-1">{totals.date1.soldQty}</td>
            <td className="text-right py-1">{totals.date2.soldQty}</td>
          </tr>
          <tr className="border-b border-gray-200">
            <td className="py-1">Sales value that day</td>
            <td className="text-right py-1">{taka(totals.date1.soldValue)}</td>
            <td className="text-right py-1">{taka(totals.date2.soldValue)}</td>
          </tr>
        </tbody>
      </table>

      {/* Product-by-product stock on each date, with the movement between them */}
      <div className="mb-5">
        <h3 className="text-sm font-bold uppercase tracking-wide border-b border-black pb-1 mb-2">
          Stock comparison <span className="font-normal normal-case">— {rows.length} product(s)</span>
        </h3>
        {rows.length === 0 ? (
          <p className="text-xs text-gray-500 py-2">No stock on either date for this selection.</p>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-black">
                <th className="text-left py-1">#</th>
                <th className="text-left py-1">Product</th>
                <th className="text-left py-1">Category</th>
                <th className="text-right py-1">{day(date1)}</th>
                <th className="text-right py-1">{day(date2)}</th>
                <th className="text-right py-1">Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.product} className="border-b border-gray-200">
                  <td className="py-1">{i + 1}</td>
                  <td className="py-1">
                    {r.name}
                    {r.variant && <div className="text-[10px] text-gray-500">{r.variant}</div>}
                    {r.supplier && <div className="text-[10px] text-gray-500">Supplier: {r.supplier}</div>}
                  </td>
                  <td className="py-1">{r.category}</td>
                  <td className="text-right py-1">{r.qty1} {r.unit}</td>
                  <td className="text-right py-1">
                    {r.qty2} {r.unit}
                    {r.qty1 > 0 && r.qty2 === 0 && <div className="text-[10px] font-semibold">OUT OF STOCK</div>}
                  </td>
                  <td className="text-right py-1 font-semibold">
                    {r.change === 0 ? '—' : (r.change > 0 ? `+${r.change}` : r.change)}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-black font-bold">
                <td className="py-1" colSpan={3}>Total</td>
                <td className="text-right py-1">{totals.date1.qty}</td>
                <td className="text-right py-1">{totals.date2.qty}</td>
                <td className="text-right py-1">
                  {Math.round((totals.date2.qty - totals.date1.qty) * 1000) / 1000}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {soldOut?.length > 0 && (
        <div className="mb-5" style={{ breakInside: 'avoid' }}>
          <h3 className="text-sm font-bold uppercase tracking-wide border-b border-black pb-1 mb-2">
            Ran out between these dates <span className="font-normal normal-case">— {soldOut.length} product(s)</span>
          </h3>
          <p className="text-xs">{soldOut.join(', ')}</p>
        </div>
      )}

      <SalesTable title={`Sales on ${day(date1)}`} rows={sales1} />
      <SalesTable title={`Sales on ${day(date2)}`} rows={sales2} />

      {/* Stated plainly rather than left to quietly skew a number the owner acts on */}
      <p className="text-[10px] text-gray-500 mt-4 border-t border-gray-300 pt-2">
        Stock for past dates is reconstructed from recorded movements (sales, purchases, returns,
        EMI plans and manual stock adjustments). Devices tracked by IMEI/serial are exact.
        Branch-to-branch stock transfers, and unit codes deleted outright, are not reflected.
      </p>
      <p className="text-center text-xs mt-4 text-gray-500">
        {business?.name}{business?.phone ? ` • ${business.phone}` : ''}
      </p>
    </div>
  );
}
