import { taka, fmtDateTime } from '../../utils/format.js';
import { thermalWidthClass, thermalPageWidthMm } from '../../utils/printWidth.js';
import { useThermalPageSize } from '../../utils/printPageSize.js';

// Thermal roll receipt — service / repair job sheet. Width (58mm/80mm)
// follows the shop's Settings → Receipt Paper Width.
export default function ServiceThermal({ job, business }) {
  useThermalPageSize(thermalPageWidthMm(business));
  if (!job) return null;
  const total = job.total ?? (job.serviceFee || 0); // customer bill = service charge only
  const due = Math.max(0, total - (job.paid || 0));
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
      <div style={{ textAlign: 'center', fontWeight: 700 }}>SERVICE INVOICE</div>
      <div>Job: {job.jobNo}</div>
      <div>{fmtDateTime(job.createdAt)}</div>
      <div>Customer: {job.customerName || 'Walk-in'}</div>
      {job.customerPhone ? <div>Phone: {job.customerPhone}</div> : null}
      <div className="thermal-divider" />
      <div>Device: {job.deviceModel || '—'}</div>
      {job.imei ? <div>IMEI/SN: {job.imei}</div> : null}
      {job.technician ? <div>Technician: {job.technician}</div> : null}
      {job.problem ? <div>Problem: {job.problem}</div> : null}
      <div>Status: <span style={{ textTransform: 'capitalize' }}>{job.status}</span></div>
      <div className="thermal-divider" />

      <Line l="Service Charge" r={taka(total)} bold />
      <Line l="Paid" r={taka(job.paid || 0)} />
      <Line l="Due" r={taka(due)} />
      <div className="thermal-divider" />
      <div style={{ textAlign: 'center', marginTop: 4 }}>
        Thank you for choosing us!<br />
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
