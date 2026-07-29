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
    totalAmount: { type: Number, required: true, default: 0 },
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
installmentSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Installment', installmentSchema);
