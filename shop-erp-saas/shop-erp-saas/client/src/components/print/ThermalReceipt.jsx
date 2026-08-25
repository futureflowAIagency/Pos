import { taka, fmtDateTime } from '../../utils/format.js';
import { thermalWidthClass, thermalPageWidthMm } from '../../utils/printWidth.js';
import { useThermalPageSize } from '../../utils/printPageSize.js';

// Thermal roll receipt — pharmacy / POS fast print. Width (58mm/80mm) follows
// the shop's Settings → Receipt Paper Width.
export default function ThermalReceipt({ sale, business }) {
  useThermalPageSize(thermalPageWidthMm(business));
  if (!sale) return null;
  return (
    <div className={`print-thermal ${thermalWidthClass(business)}`}>
      <div style={{ textAlign: 'center' }}>
        {business?.logoUrl ? (
          <img src={business.logoUrl} alt="Logo" style={{ maxHeight: 40, maxWidth: '60%', objectFit: 'contain', margin: '0 auto 4px' }} />
        ) : null}
        <h1 style={{ fontWeight: 700 }}>{business?.name || 'My Shop'}</h1>
        {business?.address && <div>{business.address}</div>}
        {business?.phone && <div>Tel: {business.phone}</div>}
      </div>
      <div className="thermal-divider" />
      <div>Inv: {sale.invoiceNo}</div>
      <div>{fmtDateTime(sale.createdAt)}</div>
      <div>Customer: {sale.customerName}</div>
      {sale.customerNid ? <div>NID: {sale.customerNid}</div> : null}
      <div className="thermal-divider" />

      <table>
        <tbody>
          {sale.items.map((it, i) => (
            <tr key={i}>
              <td style={{ width: '55%' }}>
                {it.name}
                {it.imei1 ? <div style={{ fontSize: 9 }}>IMEI: {it.imei1}</div> : null}
                {it.serial ? <div style={{ fontSize: 9 }}>SN: {it.serial}</div> : null}
                {it.warrantyMonths > 0 ? <div style={{ fontSize: 9 }}>Warranty: {it.warrantyMonths}mo</div> : null}
              </td>
              <td style={{ width: '15%', textAlign: 'center' }}>x{it.qty}</td>
              <td style={{ width: '30%', textAlign: 'right' }}>{taka(it.sellingPrice * it.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="thermal-divider" />
      <Line l="Subtotal" r={taka(sale.subTotal)} />
      <Line l="Discount" r={taka(sale.discount)} />
      <Line l="TOTAL" r={taka(sale.total)} bold />
      {sale.payments?.length > 1 ? (
        sale.payments.map((p, i) => <Line key={i} l={`Paid (${p.method})`} r={taka(p.amount)} />)
      ) : (
        <Line l="Paid" r={taka(sale.total - sale.due)} />
      )}
      <Line l="Due" r={taka(sale.due)} />
      <div className="thermal-divider" />
      <div style={{ textAlign: 'center', marginTop: 4 }}>
        Thank you! Get well soon.<br />
        <strong>{business?.name || 'My Shop'}</strong>
        {business?.phone ? <><br />Tel: {business.phone}</> : null}
        {business?.email ? <><br />{business.email}</> : null}
      </div>
      {/* spacer for auto-cut */}
      <div style={{ height: '14mm' }} />
    </div>
  );
}

const Line = ({ l, r, bold }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: bold ? 700 : 400 }}>
    <span>{l}</span><span>{r}</span>
  </div>
);
