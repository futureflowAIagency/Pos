import mongoose from 'mongoose';

const saleItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    qty: { type: Number, required: true, default: 1 },
    purchasePrice: { type: Number, default: 0 },
    mrp: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0 },
    sellingPrice: { type: Number, required: true, default: 0 },
    // ---- mobile-shop specific (optional) ----
    unit: { type: mongoose.Schema.Types.ObjectId, ref: 'PhoneUnit', default: null },
    imei1: { type: String, default: '' },
    imei2: { type: String, default: '' },
    serial: { type: String, default: '' },
    warrantyMonths: { type: Number, default: 0 }, // combined/effective warranty months
    warrantyExpiry: { type: Date, default: null },
    warrantyBrandMonths: { type: Number, default: 0 },
    warrantyShopMonths: { type: Number, default: 0 },
    warrantyBrandExpiry: { type: Date, default: null },
    warrantyShopExpiry: { type: Date, default: null },
    // how much of this line has already been returned (req 14) — prevents over-return
    returnedQty: { type: Number, default: 0 },
  },
  { _id: false }
);

// One tender line of a (possibly split) payment, e.g. { method: 'bkash', amount: 2000 }.
// `account` optionally names WHICH bank/bKash/Nagad/Rocket/card sub-account
// this specific tender landed in — blank means "unassigned", which the older
// balance-by-method view has always treated as fine (the method total is
// unaffected either way; account is purely an additional tag).
const paymentLineSchema = new mongoose.Schema(
  {
    method: { type: String, enum: ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card'], default: 'cash' },
    amount: { type: Number, default: 0 },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentAccount', default: null },
  },
  { _id: false }
);

// One "money back" hand-back of an overpayment on this invoice: a ৳500 bill
// settled with ৳550 leaves ৳50 belonging to the customer, and this records giving
// it back later. Not a return — no goods move, no stock or profit changes; it
// only takes the money back out of the till it went into.
const moneyBackSchema = new mongoose.Schema(
  {
    amount: { type: Number, default: 0 },
    method: { type: String, enum: ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card'], default: 'cash' },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentAccount', default: null },
    note: { type: String, default: '' },
    date: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const saleSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    invoiceNo: { type: String, required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerName: { type: String, default: 'Walk-in' },
    customerNid: { type: String, default: '' },
    items: [saleItemSchema],
    subTotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    paid: { type: Number, default: 0 },
    due: { type: Number, default: 0 },
    profit: { type: Number, default: 0 },
    // classification / badge: becomes 'due' when any due remains (drives the DUE badge)
    // 'bank' & 'rocket' added; 'split' = multiple tenders used; 'emi' kept for back-compat
    paymentMethod: { type: String, enum: ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card', 'due', 'emi', 'split'], default: 'cash' },
    // actual tender used for the PAID portion (kept even when paymentMethod is 'due')
    // — legacy single-tender field; still set (to the first tender) when `payments` is
    // used, but the balance engine prefers `payments` when it's non-empty.
    paidVia: { type: String, enum: ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card'], default: 'cash' },
    // multi-tender breakdown of the paid portion, e.g. bKash 2000 + Card 1000 + Cash 3000.
    // Empty for older/legacy single-tender sales — those fall back to paid+paidVia.
    payments: { type: [paymentLineSchema], default: [] },
    // ---- money back: overpayment still held for the customer ----
    // Outstanding money back = paid − total − moneyBackReturned (always derived,
    // never stored, so editing the invoice's amounts can't leave it stale).
    moneyBackReturned: { type: Number, default: 0 },
    moneyBacks: { type: [moneyBackSchema], default: [] },
    soldBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // The employee who actually rang this sale up, typed at the counter — often
    // different from `soldBy` (the login account), since several employees
    // commonly share one POS login on the same till. Drives "Sell by" on the
    // printed invoice; falls back to the login's own name when left blank.
    soldByName: { type: String, trim: true, default: '' },
    // true once every line item has been fully returned (req 14)
    returned: { type: Boolean, default: false },
  },
  { timestamps: true }
);

saleSchema.index({ business: 1, createdAt: -1 });

export default mongoose.model('Sale', saleSchema);
