import { taka, fmtDate } from '../../utils/format.js';

const BALANCE_LABELS = { cash: 'Cash', bank: 'Bank', bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket', card: 'Card' };

// Comprehensive, date-ranged business report (req 8): sales/purchase/profit/
// expense totals, per-method balances, customer + supplier due, product-wise
// sales/profit, and a stock summary. Printed via the browser (Print → Save as
// PDF gives a PDF export with no extra dependency).
export default function AdvancedReport({ data, business }) {
  if (!data) return null;
  const { range, totals, balances = {}, customerDue, supplierDue, productWise = [], stock = {} } = data;

  return (
    <div className="print-a4">
      <div className="text-center mb-4">
        <h1 className="text-xl font-bold">{business?.name}</h1>
        <p className="text-sm">{business?.address}</p>
        <h2 className="text-lg font-semibold mt-2">Advanced Business Report</h2>
        <p className="text-xs text-gray-500">{fmtDate(range?.from)} — {fmtDate(range?.to)}</p>
      </div>

      <Section title="Financial Summary">
        <table className="w-full text-sm border-collapse">
          <tbody>
            <Row l="Total Sales" r={taka(totals.sales)} />
            <Row l="Total Purchase" r={taka(totals.purchase)} />
            <Row l="Gross Profit (sales)" r={taka(totals.profit)} />
            {totals.emiCollected > 0 && (
              <>
                <Row l="EMI Collected" r={taka(totals.emiCollected)} />
                <Row l="EMI Profit (earned on payments received)" r={taka(totals.emiProfit || 0)} />
              </>
            )}
            <Row l="Total Expense" r={taka(totals.expense)} />
            <Row l="Net Profit" r={taka(totals.netProfit)} bold />
            <Row l="Number of Orders" r={totals.salesCount} />
          </tbody>
        </table>
      </Section>

      <Section title="Balances (current)">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-black">
              {Object.keys(BALANCE_LABELS).map((k) => <th key={k} className="text-right py-1">{BALANCE_LABELS[k]}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              {Object.keys(BALANCE_LABELS).map((k) => <td key={k} className="text-right py-1">{taka(balances[k] || 0)}</td>)}
            </tr>
          </tbody>
        </table>
      </Section>

      <Section title="Outstanding Dues">
        <table className="w-full text-sm border-collapse">
          <tbody>
            <Row l="Customer Due" r={taka(customerDue)} />
            <Row l="Supplier Due" r={taka(supplierDue)} />
          </tbody>
        </table>
      </Section>

      <Section title="Product-wise Sales & Profit">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-black">
              <th className="text-left py-1">Product</th>
              <th className="text-right py-1">Qty Sold</th>
              <th className="text-right py-1">Revenue</th>
              <th className="text-right py-1">Profit</th>
            </tr>
          </thead>
          <tbody>
            {productWise.length === 0 && <tr><td colSpan={4} className="text-center py-2 text-gray-400">No sales in this period</td></tr>}
            {productWise.map((p) => (
              <tr key={p._id} className="border-b border-gray-200">
                <td className="py-1">{p._id}</td>
                <td className="text-right py-1">{p.qty}</td>
                <td className="text-right py-1">{taka(p.revenue)}</td>
                <td className="text-right py-1">{taka(p.profit)}</td>
              </tr>
            ))}
          </tbody>
          {productWise.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-black font-bold">
                <td className="py-1">Total</td>
                <td className="text-right py-1">{productWise.reduce((a, p) => a + p.qty, 0)}</td>
                <td className="text-right py-1">{taka(productWise.reduce((a, p) => a + p.revenue, 0))}</td>
                <td className="text-right py-1">{taka(productWise.reduce((a, p) => a + p.profit, 0))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </Section>

      <Section title="Stock Summary (current)">
        <table className="w-full text-sm border-collapse mb-2">
          <tbody>
            <Row l="Total Products" r={stock.totalProducts} />
            <Row l="Total Stock Qty" r={stock.totalQty} />
            <Row l="Total Stock Value (at cost)" r={taka(stock.totalValue)} />
            <Row l="Low Stock Items" r={stock.lowStockCount} />
          </tbody>
        </table>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-black">
              <th className="text-left py-1">Product</th>
              <th className="text-left py-1">Category</th>
              <th className="text-right py-1">Stock</th>
              <th className="text-right py-1">Value</th>
            </tr>
          </thead>
          <tbody>
            {(stock.items || []).map((it, i) => (
              <tr key={i} className={`border-b border-gray-200 ${it.stock <= it.lowStockAlert ? 'font-semibold' : ''}`}>
                <td className="py-1">{it.name}</td>
                <td className="py-1">{it.category}</td>
                <td className="text-right py-1">{it.stock}</td>
                <td className="text-right py-1">{taka(it.stockValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <p className="text-center text-xs mt-6 text-gray-500">{business?.name}{business?.phone ? ` • ${business.phone}` : ''}</p>
    </div>
  );
}

const Section = ({ title, children }) => (
  <div className="mb-5" style={{ breakInside: 'avoid' }}>
    <h3 className="text-sm font-bold uppercase tracking-wide border-b border-black pb-1 mb-2">{title}</h3>
    {children}
  </div>
);
const Row = ({ l, r, bold }) => (
  <tr className={bold ? 'border-t-2 border-black font-bold' : ''}>
    <td className="py-1">{l}</td>
    <td className="text-right py-1">{r}</td>
  </tr>
);
