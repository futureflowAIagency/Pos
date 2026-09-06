import { fmtDateTime } from '../../utils/format.js';
import { thermalWidthClass, thermalPageWidthMm } from '../../utils/printWidth.js';
import { useThermalPageSize } from '../../utils/printPageSize.js';

// Thermal confirmation slip printed when a warranty claim's status moves to
// "Delivered to Customer" — proof the device was actually handed back, kept
// alongside the original WarrantyClaimReceipt for the same claim so both ends
// of the claim (received / returned) are on file for a later recheck.
export default function WarrantyDeliveryReceipt({ claim, business }) {
  useThermalPageSize(thermalPageWidthMm(business));
  if (!claim) return null;
  const deliveredAt = [...(claim.statusHistory || [])].reverse().find((h) => h.status === 'delivered_to_customer')?.at;
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
      <div style={{ textAlign: 'center', fontWeight: 700 }}>WARRANTY CLAIM — DELIVERY CONFIRMATION</div>
      <div>Claim No: {claim.claimNo}</div>
      <div>Submitted: {fmtDateTime(claim.createdAt)}</div>
      <div>Delivered: {fmtDateTime(deliveredAt || new Date())}</div>
      <div>Customer: {claim.customerName || '—'}</div>
      {claim.customerPhone ? <div>Phone: {claim.customerPhone}</div> : null}
      <div className="thermal-divider" />
      <div>Product: {claim.productName || '—'}</div>
      {claim.imei1 ? <div>IMEI 1: {claim.imei1}</div> : null}
      {claim.imei2 ? <div>IMEI 2: {claim.imei2}</div> : null}
      {claim.serial ? <div>Serial: {claim.serial}</div> : null}
      {claim.problem ? <div>Problem: {claim.problem}</div> : null}
      <div className="thermal-divider" />
      <div style={{ textAlign: 'center', marginTop: 4 }}>
        The above device has been returned to the customer<br />
        after their warranty claim was resolved.<br />
        <strong>{business?.name || 'My Shop'}</strong>
        {business?.phone ? <><br />Tel: {business.phone}</> : null}
      </div>
      {/* spacer for auto-cut */}
      <div style={{ height: '14mm' }} />
    </div>
  );
}
