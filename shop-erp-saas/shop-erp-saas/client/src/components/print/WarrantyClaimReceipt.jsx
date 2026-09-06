import { fmtDateTime } from '../../utils/format.js';
import { thermalWidthClass, thermalPageWidthMm } from '../../utils/printWidth.js';
import { useThermalPageSize } from '../../utils/printPageSize.js';

const STATUS_LABEL = {
  pending: 'At Shop',
  sent_to_company: 'Sent to Company',
  received_from_company: 'Received from Company',
  delivered_to_customer: 'Delivered to Customer',
};

// Thermal acknowledgement slip handed to the customer when their device is
// submitted for a warranty claim — proof of what was received and when.
export default function WarrantyClaimReceipt({ claim, business }) {
  useThermalPageSize(thermalPageWidthMm(business));
  if (!claim) return null;
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
      <div style={{ textAlign: 'center', fontWeight: 700 }}>WARRANTY CLAIM RECEIPT</div>
      <div>Claim No: {claim.claimNo}</div>
      <div>{fmtDateTime(claim.createdAt)}</div>
      <div>Customer: {claim.customerName || '—'}</div>
      {claim.customerPhone ? <div>Phone: {claim.customerPhone}</div> : null}
      {claim.customerAddress ? <div>Address: {claim.customerAddress}</div> : null}
      <div className="thermal-divider" />
      <div>Product: {claim.productName || '—'}</div>
      {claim.imei1 ? <div>IMEI 1: {claim.imei1}</div> : null}
      {claim.imei2 ? <div>IMEI 2: {claim.imei2}</div> : null}
      {claim.serial ? <div>Serial: {claim.serial}</div> : null}
      {claim.problem ? <div>Problem: {claim.problem}</div> : null}
      <div>Status: {STATUS_LABEL[claim.status] || claim.status}</div>
      <div className="thermal-divider" />
      <div style={{ textAlign: 'center', marginTop: 4 }}>
        Please keep this receipt — it is proof your device was<br />
        submitted here for a warranty claim.<br />
        <strong>{business?.name || 'My Shop'}</strong>
        {business?.phone ? <><br />Tel: {business.phone}</> : null}
      </div>
      {/* spacer for auto-cut */}
      <div style={{ height: '14mm' }} />
    </div>
  );
}
