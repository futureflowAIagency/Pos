import { taka, fmtDate } from '../../utils/format.js';

export default function SalarySlip({ employee, record, business }) {
  if (!employee || !record) return null;
  const lastPayment = record.payments?.[record.payments.length - 1];
  const due = Math.max(0, (record.amount || 0) - (record.paidAmount || 0));
  const isAdvance = lastPayment?.type === 'advance';
  const tenders = lastPayment?.tenders?.length ? lastPayment.tenders : (lastPayment ? [{ method: lastPayment.method, amount: lastPayment.amount }] : []);
  return (
    <div className="print-a4" style={{ minHeight: 'auto' }}>
      <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: 10 }}>
        <h1 style={{ margin: 0 }}>{business?.name}</h1>
        <h2 style={{ margin: '6px 0' }}>{isAdvance ? 'SALARY ADVANCE RECEIPT' : 'SALARY SLIP'}</h2>
        <p style={{ margin: 0 }}>Month: {record.month}</p>
      </div>
      <table style={{ width: '100%', marginTop: 16, borderCollapse: 'collapse' }}>
        <tbody>
          <Tr l="Employee Name" r={employee.name} />
          <Tr l="Designation" r={employee.designation} />
          <Tr l="Phone" r={employee.phone || '-'} />
          <Tr l="Salary Month" r={record.month} />
          <Tr l="Total Salary" r={taka(record.amount)} />
          {lastPayment && <Tr l="Payment Type" r={isAdvance ? 'ADVANCE' : 'Regular Salary Payment'} />}
          {lastPayment && <Tr l="This Payment" r={taka(lastPayment.amount)} />}
          {tenders.length > 1 ? (
            tenders.map((t, i) => <Tr key={i} l={`— via ${String(t.method).toUpperCase()}`} r={taka(t.amount)} />)
          ) : (
            lastPayment && <Tr l="Paid Via" r={String(tenders[0]?.method || '').toUpperCase()} />
          )}
          <Tr l="Total Paid (all payments this month)" r={taka(record.paidAmount ?? record.amount)} />
          <Tr l="Remaining Due" r={taka(due)} />
          <Tr l="Status" r={record.status.toUpperCase()} />
          <Tr l="Paid Date" r={(lastPayment?.date || record.paidAt) ? fmtDate(lastPayment?.date || record.paidAt) : '-'} />
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 60 }}>
        <div>_______________<br />Employee Signature</div>
        <div>_______________<br />Authorized Signature</div>
      </div>
      <p style={{ textAlign: 'center', marginTop: 30, fontSize: 11, color: '#555' }}>
        {business?.name}{business?.phone ? ` • ${business.phone}` : ''}
      </p>
    </div>
  );
}
const Tr = ({ l, r }) => (
  <tr><td style={{ padding: 8, border: '1px solid #ccc', fontWeight: 600, width: '40%' }}>{l}</td><td style={{ padding: 8, border: '1px solid #ccc' }}>{r}</td></tr>
);
