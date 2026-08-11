import mongoose from 'mongoose';

const scheduleSchema = new mongoose.Schema(
  {
    no: { type: Number, required: true },
    dueDate: { type: Date, required: true },
    amount: { type: Number, required: true, default: 0 },
    paid: { type: Boolean, default: false },
    paidAt: { type: Date, default: null },
    // tender used for this instalment payment — feeds the balance engine
    method: { type: String, enum: ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card'], default: null },
  },
  { _id: false }
);

// An EMI / instalment plan for a mobile sale (or any large-ticket sale).
const installmentSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerName: { type: String, default: '' },
    sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', default: null },
    // financed item — product/unit linkage so stock is deducted correctly (req 10)
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    unit: { type: mongoose.Schema.Types.ObjectId, ref: 'PhoneUnit', default: null }, // serial-tracked device, if any
    imei1: { type: String, default: '' },
    imei2: { type: String, default: '' },
    serial: { type: String, default: '' },
    productName: { type: String, default: '' }, // free-text label of what was financed
    totalAmount: { type: Number, required: true, default: 0 }, // the EMI price the customer pays in full
    // The product's normal shelf price when the plan was made. The EMI price is
    // usually this plus a markup the shopkeeper adds for selling on credit, so
    // keeping it makes that markup (totalAmount − basePrice) visible afterwards.
    basePrice: { type: Number, default: 0 },
    // What the financed item cost the shop — snapshotted from the product at plan
    // creation (or typed in for a free-text item). This is what makes an EMI sale
    // show real profit: the difference is recognised payment by payment, as the
    // money actually arrives (see services/emiService.js).
    purchasePrice: { type: Number, default: 0 },
    downPayment: { type: Number, default: 0 },
    downPaymentMethod: { type: String, enum: ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card'], default: 'cash' },
    months: { type: Number, default: 1 }, // number of instalments
    schedule: [scheduleSchema],
    status: { type: String, enum: ['active', 'completed'], default: 'active', index: true },

    // ---- full customer KYC info (req 10) — snapshotted on this plan ----
    customerPhone: { type: String, default: '' },
    customerNid: { type: String, default: '' },
    presentAddress: { type: String, default: '' },
    permanentAddress: { type: String, default: '' },
    fatherName: { type: String, default: '' },
    fatherNid: { type: String, default: '' },
    fatherPhone: { type: String, default: '' },
    motherName: { type: String, default: '' },
    motherNid: { type: String, default: '' },
    motherPhone: { type: String, default: '' },
    guarantorName: { type: String, default: '' },
    guarantorPhone: { type: String, default: '' },
    guarantorNid: { type: String, default: '' },
    guarantorAddress: { type: String, default: '' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// outstanding balance = total - down payment - sum(paid instalments)
installmentSchema.virtual('balance').get(function () {
  const paid = (this.schedule || []).filter((s) => s.paid).reduce((a, s) => a + s.amount, 0);
  return Math.max(0, (this.totalAmount || 0) - (this.downPayment || 0) - paid);
});

// What was charged on top of the normal price for selling on EMI.
installmentSchema.virtual('emiMarkup').get(function () {
  const base = this.basePrice || 0;
  if (base <= 0) return 0;
  return Math.round(((this.totalAmount || 0) - base) * 100) / 100;
});

// Money actually received so far (down payment + every paid instalment).
installmentSchema.virtual('collected').get(function () {
  const paid = (this.schedule || []).filter((s) => s.paid).reduce((a, s) => a + s.amount, 0);
  return Math.round(((this.downPayment || 0) + paid) * 100) / 100;
});

// Whole-plan profit. 0 when no cost was recorded — never treat the full EMI
// price as profit just because the purchase price is missing.
installmentSchema.virtual('totalProfit').get(function () {
  const total = this.totalAmount || 0;
  const cost = this.purchasePrice || 0;
  if (total <= 0 || cost <= 0) return 0;
  return Math.round((total - cost) * 100) / 100;
});

// Profit already recognised = the same share of the profit as the share of the
// plan that has been paid off.
installmentSchema.virtual('profitEarned').get(function () {
  const total = this.totalAmount || 0;
  if (total <= 0 || !this.totalProfit) return 0;
  return Math.round((this.collected / total) * this.totalProfit * 100) / 100;
});
installmentSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Installment', installmentSchema);
