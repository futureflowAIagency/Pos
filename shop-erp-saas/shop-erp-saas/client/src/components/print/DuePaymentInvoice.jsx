import { taka, fmtDateTime, fmtDate } from '../../utils/format.js';
import { thermalWidthClass } from '../../utils/printWidth.js';

// Per-invoice due-payment receipt (req 11). Shows customer + product + IMEI +
// purchase date + total, and the previous-paid / current-payment / remaining-due
// breakdown with method and date.
export default function DuePaymentInvoice({ sale, duePayment, business }) {
  if (!sale || !duePayment) return null;
  const previousPaid = Math.max(0, (sale.total || 0) - (duePayment.previousDue || 0));
  const first = sale.items?.[0];
  return (
    <div className={`print-thermal ${thermalWidthClass(business)}`}>
      <div style={{ textAlign: 'center' }}>
        {business?.logoUrl ? (
          <img src={business.logoUrl} alt="Logo" style={{ maxHeight: 40, maxWidth: '60%', objectFit: 'contain', margin: '0 auto 4px' }} />
        ) : null}
        <h1 style={{ fontWeight: 700 }}>{business?.name || 'My Shop'}</h1>
        {business?.address && <div>{business.address}</div>}
        {business?.phone && <div>Tel: {business.phone}</div>}
        <div style={{ fontWeight: 700, marginTop: 2 }}>DUE PAYMENT INVOICE</div>
      </div>
      <div className="thermal-divider" />
      <div>Ref Invoice: {sale.invoiceNo}</div>
      <div>Payment Date: {fmtDateTime(duePayment.date || new Date())}</div>
      <div>Customer: {sale.customerName}</div>
      {sale.customerNid ? <div>NID: {sale.customerNid}</div> : null}
      <div className="thermal-divider" />

      {sale.items?.map((it, i) => (
        <div key={i} style={{ fontSize: 10 }}>
          <div>{it.name}{it.qty > 1 ? ` x${it.qty}` : ''}</div>
          {it.imei1 ? <div style={{ fontSize: 9 }}>IMEI: {it.imei1}{it.imei2 ? ` / ${it.imei2}` : ''}</div> : null}
          {it.serial ? <div style={{ fontSize: 9 }}>SN: {it.serial}</div> : null}
        </div>
      ))}
      <div style={{ fontSize: 9, marginTop: 2 }}>Purchase Date: {fmtDate(sale.createdAt)}</div>
      <div className="thermal-divider" />

      <Line l="Total Price" r={taka(sale.total)} />
      <Line l="Previous Paid" r={taka(previousPaid)} />
      <Line l="Current Payment" r={taka(duePayment.amount)} bold />
      <Line l="Payment Method" r={(duePayment.method || 'cash').toUpperCase()} />
      <Line l="Remaining Due" r={taka(duePayment.remainingDue)} />
      <div className="thermal-divider" />
      <div style={{ textAlign: 'center', marginTop: 4 }}>
        Thank you!<br />
        <strong>{business?.name || 'My Shop'}</strong>
        {business?.phone ? <><br />Tel: {business.phone}</> : null}
        {business?.email ? <><br />{business.email}</> : null}
      </div>
      <div style={{ height: '14mm' }} />
    </div>
  );
}

const Line = ({ l, r, bold }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: bold ? 700 : 400 }}>
    <span>{l}</span><span>{r}</span>
  </div>
);
