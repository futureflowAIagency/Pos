import { taka, fmtDateTime } from '../../utils/format.js';
import { thermalWidthClass, thermalPageWidthMm } from '../../utils/printWidth.js';
import { useThermalPageSize } from '../../utils/printPageSize.js';

// Thermal roll receipt for a salary/advance payment — same POS printer as every
// other receipt in this app, not a separate A4 printer most small shops don't have.
export default function SalarySlip({ employee, record, business }) {
  useThermalPageSize(thermalPageWidthMm(business));
  if (!employee || !record) return null;
  const lastPayment = record.payments?.[record.payments.length - 1];
  const due = Math.max(0, (record.amount || 0) - (record.paidAmount || 0));
  const isAdvance = lastPayment?.type === 'advance';
  const tenders = lastPayment?.tenders?.length ? lastPayment.tenders : (lastPayment ? [{ method: lastPayment.method, amount: lastPayment.amount }] : []);

  return (
    <div className={`print-thermal ${thermalWidthClass(business)}`}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontWeight: 700 }}>{business?.name || 'My Shop'}</h1>
        <div style={{ fontWeight: 700, marginTop: 2 }}>{isAdvance ? 'SALARY ADVANCE RECEIPT' : 'SALARY SLIP'}</div>
      </div>
      <div className="thermal-divider" />
      <div>Employee: {employee.name}</div>
      <div>Designation: {employee.designation || '-'}</div>
      {employee.phone && <div>Phone: {employee.phone}</div>}
      <div>Salary Month: {record.month}</div>
      <div className="thermal-divider" />

      <Line l="Total Salary" r={taka(record.amount)} />
      {lastPayment && <Line l="Payment Type" r={isAdvance ? 'ADVANCE' : 'Regular Salary'} />}
      {lastPayment && <Line l="This Payment" r={taka(lastPayment.amount)} bold />}
      {tenders.length > 1 ? (
        tenders.map((t, i) => <Line key={i} l={`— via ${String(t.method).toUpperCase()}`} r={taka(t.amount)} />)
      ) : (
        lastPayment && <Line l="Paid Via" r={String(tenders[0]?.method || '').toUpperCase()} />
      )}
      <div className="thermal-divider" />

      <Line l="Total Paid" r={taka(record.paidAmount ?? record.amount)} bold />
      <Line l="Remaining Due" r={taka(due)} />
      <Line l="Status" r={record.status.toUpperCase()} />
      <div className="thermal-divider" />
      <div style={{ textAlign: 'center', marginTop: 4 }}>
        Paid on {(lastPayment?.date || record.paidAt) ? fmtDateTime(lastPayment?.date || record.paidAt) : '-'}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, fontSize: 10 }}>
        <span>_________________<br />Employee</span>
        <span>_________________<br />Authorized</span>
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
