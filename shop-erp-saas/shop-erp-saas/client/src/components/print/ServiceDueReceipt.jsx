import { taka, fmtDateTime } from '../../utils/format.js';
import { thermalWidthClass, thermalPageWidthMm } from '../../utils/printWidth.js';
import { useThermalPageSize } from '../../utils/printPageSize.js';

// Thermal receipt for a "Collect Due" payment on a service/repair job — same
// role as Customers' DueReceipt, sized for a job's own fields (job no, device).
export default function ServiceDueReceipt({ job, amount, method, business }) {
  useThermalPageSize(thermalPageWidthMm(business));
  if (!job) return null;
  const due = Math.max(0, (job.total || 0) - (job.paid || 0));
  return (
    <div className={`print-thermal ${thermalWidthClass(business)}`}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontWeight: 700 }}>{business?.name || 'My Shop'}</h1>
        <div>SERVICE DUE PAYMENT RECEIPT</div>
      </div>
      <div className="thermal-divider" />
      <div>Job: {job.jobNo}</div>
      <div>{fmtDateTime(new Date())}</div>
      <div>Customer: {job.customerName || 'Walk-in'}</div>
      {job.customerPhone && <div>Phone: {job.customerPhone}</div>}
      <div>Device: {job.deviceModel || '—'}</div>
      <div className="thermal-divider" />
      <Line l="Total Bill" r={taka(job.total)} />
      <Line l="Paid Now" r={taka(amount)} bold />
      <Line l="Method" r={String(method || '').toUpperCase()} />
      <Line l="Total Paid" r={taka(job.paid)} />
      <Line l="Remaining Due" r={taka(due)} />
      <div className="thermal-divider" />
      <div style={{ textAlign: 'center', marginTop: 4 }}>
        <strong>{business?.name || 'My Shop'}</strong>
        {business?.phone ? <><br />Tel: {business.phone}</> : null}
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
