import mongoose from 'mongoose';

// A device submitted at the counter for a warranty claim (not a paid repair —
// see ServiceJob for that). Tracks it from "sitting at the shop" through being
// sent off to the brand/company and back to the customer.
export const WARRANTY_CLAIM_STATUSES = ['pending', 'sent_to_company', 'received_from_company', 'delivered_to_customer'];

const warrantyClaimSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    claimNo: { type: String, required: true },
    // filled in automatically when the IMEI matches a device this shop actually
    // sold; left null for a manually-entered claim (device bought elsewhere, or
    // an old sale not tracked in this system)
    unit: { type: mongoose.Schema.Types.ObjectId, ref: 'PhoneUnit', default: null },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    productName: { type: String, default: '' },
    imei1: { type: String, default: '' },
    imei2: { type: String, default: '' },
    serial: { type: String, default: '' },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerName: { type: String, default: '' },
    customerPhone: { type: String, default: '' },
    customerNid: { type: String, default: '' },
    customerAddress: { type: String, default: '' },
    problem: { type: String, default: '' }, // fault reported by the customer
    // What the customer physically handed over with the device — the three
    // common cases (Box / Charger / Only Mobile) are offered as presets at the
    // counter, but any number of extra items can be typed in, so this is a free
    // list rather than a fixed enum (a claim often comes in with 2-3 things).
    // Printed on the claim receipt, which is the customer's proof of exactly
    // what they left at the shop.
    receivedItems: { type: [String], default: [] },
    status: { type: String, enum: WARRANTY_CLAIM_STATUSES, default: 'pending', index: true },
    statusHistory: [{ status: String, at: { type: Date, default: Date.now } }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

warrantyClaimSchema.index({ business: 1, createdAt: -1 });

warrantyClaimSchema.index({ business: 1, branch: 1, createdAt: -1 }); // claims list

export default mongoose.model('WarrantyClaim', warrantyClaimSchema);
