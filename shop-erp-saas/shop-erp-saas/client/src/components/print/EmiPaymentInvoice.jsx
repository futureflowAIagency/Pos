import { taka, fmtDateTime } from '../../utils/format.js';
import { thermalWidthClass } from '../../utils/printWidth.js';

// Per-instalment payment receipt (req 10): customer, product/IMEI, this
// payment's amount/no, previous paid, remaining balance, method, date.
export default function EmiPaymentInvoice({ installment, row, business }) {
  if (!installment || !row) return null;
  const paidBefore = (installment.schedule || [])
    .filter((s) => s.paid && s.no !== row.no)
    .reduce((a, s) => a + s.amount, 0) + (installment.downPayment || 0);
  const totalPaid = paidBefore + row.amount;
  const remaining = Math.max(0, (installment.totalAmount || 0) - totalPaid);

  return (
    <div className={`print-thermal ${thermalWidthClass(business)}`}>
      <div style={{ textAlign: 'center' }}>
        {business?.logoUrl ? (
          <img src={business.logoUrl} alt="Logo" style={{ maxHeight: 40, maxWidth: '60%', objectFit: 'contain', margin: '0 auto 4px' }} />
        ) : null}
        <h1 style={{ fontWeight: 700 }}>{business?.name || 'My Shop'}</h1>
        {business?.address && <div>{business.address}</div>}
        {business?.phone && <div>Tel: {business.phone}</div>}
        <div style={{ fontWeight: 700, marginTop: 2 }}>EMI PAYMENT RECEIPT</div>
      </div>
      <div className="thermal-divider" />
      <div>Instalment No: {row.no} / {installment.months}</div>
      <div>Payment Date: {fmtDateTime(row.paidAt || new Date())}</div>
      <div>Customer: {installment.customerName}</div>
      {installment.customerPhone ? <div>Phone: {installment.customerPhone}</div> : null}
      <div className="thermal-divider" />

      <div style={{ fontSize: 10 }}>
        <div>{installment.productName || 'Item'}</div>
        {installment.imei1 ? <div style={{ fontSize: 9 }}>IMEI: {installment.imei1}{installment.imei2 ? ` / ${installment.imei2}` : ''}</div> : null}
        {installment.serial ? <div style={{ fontSize: 9 }}>SN: {installment.serial}</div> : null}
      </div>
      <div className="thermal-divider" />

      <Line l="Total Price" r={taka(installment.totalAmount)} />
      <Line l="Previously Paid" r={taka(paidBefore)} />
      <Line l="This Payment" r={taka(row.amount)} bold />
      <Line l="Payment Method" r={(row.method || 'cash').toUpperCase()} />
      <Line l="Remaining Balance" r={taka(remaining)} />
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
