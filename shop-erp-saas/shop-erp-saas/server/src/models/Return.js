import mongoose from 'mongoose';

const returnItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    name: String,
    qty: { type: Number, default: 1 },
    unitPrice: { type: Number, default: 0 }, // sellingPrice at time of the original sale
    purchasePrice: { type: Number, default: 0 },
    unit: { type: mongoose.Schema.Types.ObjectId, ref: 'PhoneUnit', default: null },
    imei1: { type: String, default: '' },
    imei2: { type: String, default: '' },
    serial: { type: String, default: '' },
    // 'resellable' → back to in-stock; 'damaged' → damaged/service stock, not resold
    condition: { type: String, enum: ['resellable', 'damaged'], default: 'resellable' },
  },
  { _id: false }
);

const TENDERS = ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card'];

// A return or an exchange against a past Sale (req 14). Full audit trail: what
// was returned, why, how much was credited against due vs refunded/store-credited,
// and — for exchanges — the newly created linked Sale.
const returnSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true, index: true },
    invoiceNo: { type: String, default: '' },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerName: { type: String, default: '' },
    type: { type: String, enum: ['return', 'exchange'], default: 'return' },
    items: [returnItemSchema], // items being returned/exchanged out
    reason: { type: String, default: '' },
    returnValue: { type: Number, default: 0 },   // total value of the returned items
    dueReduction: { type: Number, default: 0 },  // portion applied against the original sale's due
    cashRefund: { type: Number, default: 0 },    // portion actually refunded in cash/bank/etc
    storeCreditIssued: { type: Number, default: 0 }, // portion issued as store credit instead
    refundMethod: { type: String, enum: TENDERS, default: 'cash' },
    // ---- exchange-only ----
    exchangeSale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', default: null }, // newly created linked sale
    priceDiff: { type: Number, default: 0 }, // new item total - returnValue (positive = customer paid more)
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

returnSchema.index({ business: 1, createdAt: -1 });

export default mongoose.model('Return', returnSchema);
