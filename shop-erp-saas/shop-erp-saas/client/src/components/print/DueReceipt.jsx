import { taka, fmtDateTime } from '../../utils/format.js';
import { thermalWidthClass, thermalPageWidthMm } from '../../utils/printWidth.js';
import { useThermalPageSize } from '../../utils/printPageSize.js';

export default function DueReceipt({ customer, amount, method, business }) {
  useThermalPageSize(thermalPageWidthMm(business));
  if (!customer) return null;
  return (
    <div className={`print-thermal ${thermalWidthClass(business)}`}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontWeight: 700 }}>{business?.name}</h1>
        <div>DUE PAYMENT RECEIPT</div>
      </div>
      <div className="thermal-divider" />
      <div>{fmtDateTime(new Date())}</div>
      <div>Customer: {customer.name}</div>
      <div>Phone: {customer.phone || '-'}</div>
      <div className="thermal-divider" />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
        <span>Paid Now</span><span>{taka(amount)}</span>
      </div>
      {method ? (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Method</span><span>{String(method).toUpperCase()}</span>
        </div>
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Remaining Due</span><span>{taka(customer.totalDue)}</span>
      </div>
      <div className="thermal-divider" />
      <div style={{ textAlign: 'center' }}>
        <strong>{business?.name || 'My Shop'}</strong>
        {business?.phone ? <><br />Tel: {business.phone}</> : null}
        {business?.email ? <><br />{business.email}</> : null}
      </div>
      <div style={{ height: '14mm' }} />
    </div>
  );
}
