import { taka, fmtDateTime } from '../../utils/format.js';
import { thermalWidthClass, thermalPageWidthMm } from '../../utils/printWidth.js';
import { useThermalPageSize } from '../../utils/printPageSize.js';

// Customer-facing slip printed right after a return or exchange completes —
// what was handed back, why, and exactly how it was settled (due cleared /
// cash refund / store credit), plus — for an exchange — the replacement item
// and whether the customer paid more or got money back.
export default function ReturnReceipt({ business, returnDoc, newSale }) {
  useThermalPageSize(thermalPageWidthMm(business));
  if (!returnDoc) return null;
  const isExchange = returnDoc.type === 'exchange';

  return (
    <div className={`print-thermal ${thermalWidthClass(business)}`}>
      <div style={{ textAlign: 'center' }}>
        {business?.logoUrl ? (
          <img src={business.logoUrl} alt="Logo" style={{ maxHeight: 40, maxWidth: '60%', objectFit: 'contain', margin: '0 auto 4px' }} />
        ) : null}
        <h1 style={{ fontWeight: 700 }}>{business?.name || 'My Shop'}</h1>
        {business?.address && <div>{business.address}</div>}
        {business?.phone && <div>Tel: {business.phone}</div>}
        <div style={{ fontWeight: 700, marginTop: 2 }}>{isExchange ? 'EXCHANGE RECEIPT' : 'RETURN RECEIPT'}</div>
      </div>
      <div className="thermal-divider" />
      <div>Ref Invoice: {returnDoc.invoiceNo}</div>
      <div>Date: {fmtDateTime(returnDoc.createdAt)}</div>
      <div>Customer: {returnDoc.customerName || 'Walk-in'}</div>
      {returnDoc.reason ? <div>Reason: {returnDoc.reason}</div> : null}
      <div className="thermal-divider" />

      <div style={{ fontWeight: 700 }}>Item(s) Returned</div>
      <table>
        <tbody>
          {returnDoc.items.map((it, i) => (
            <tr key={i}>
              <td style={{ width: '60%' }}>
                {it.name}
                {it.imei1 ? <div style={{ fontSize: 9 }}>IMEI: {it.imei1}</div> : null}
                <div style={{ fontSize: 9 }}>{it.condition === 'damaged' ? 'Damaged / service stock' : 'Resellable — back to stock'}</div>
              </td>
              <td style={{ width: '15%', textAlign: 'center' }}>x{it.qty}</td>
              <td style={{ width: '25%', textAlign: 'right' }}>{taka(it.unitPrice * it.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="thermal-divider" />

      <Line l="Return Value" r={taka(returnDoc.returnValue)} bold />
      {returnDoc.dueReduction > 0 && <Line l="Applied to Due" r={taka(returnDoc.dueReduction)} />}
      {!isExchange && returnDoc.cashRefund > 0 && <Line l={`Refunded (${returnDoc.refundMethod})`} r={taka(returnDoc.cashRefund)} />}
      {!isExchange && returnDoc.storeCreditIssued > 0 && <Line l="Store Credit Issued" r={taka(returnDoc.storeCreditIssued)} />}

      {isExchange && newSale && (
        <>
          <div className="thermal-divider" />
          <div style={{ fontWeight: 700 }}>Replacement Item — New Invoice {newSale.invoiceNo}</div>
          <table>
            <tbody>
              {newSale.items.map((it, i) => (
                <tr key={i}>
                  <td style={{ width: '60%' }}>
                    {it.name}
                    {it.imei1 ? <div style={{ fontSize: 9 }}>IMEI: {it.imei1}</div> : null}
                  </td>
                  <td style={{ width: '15%', textAlign: 'center' }}>x{it.qty}</td>
                  <td style={{ width: '25%', textAlign: 'right' }}>{taka(it.sellingPrice * it.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="thermal-divider" />
          {returnDoc.priceDiff > 0 ? (
            <>
              <Line l="Customer Paid (extra)" r={taka(newSale.paid)} bold />
              {newSale.due > 0 && <Line l="Due Remaining" r={taka(newSale.due)} />}
            </>
          ) : returnDoc.priceDiff < 0 ? (
            <Line
              l={returnDoc.storeCreditIssued > 0 ? 'Store Credit Issued (diff)' : 'Refunded to Customer (diff)'}
              r={taka(Math.abs(returnDoc.priceDiff))}
              bold
            />
          ) : (
            <Line l="Price Difference" r="Even exchange" bold />
          )}
        </>
      )}

      <div className="thermal-divider" />
      <div style={{ textAlign: 'center', marginTop: 4 }}>
        Thank you!<br />
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
