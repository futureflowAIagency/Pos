import mongoose from 'mongoose';

// One record per due-collection event (customer pays back owed money).
// Gives: due history, printable due-payment invoice (req 11), and a money-in
// source for the dashboard balance engine (by method).
const duePaymentSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    // the specific invoice this payment settles (optional — customer-level
    // collections spread across invoices leave this null)
    sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', default: null },
    amount: { type: Number, required: true, default: 0 },
    method: { type: String, enum: ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card'], default: 'cash' },
    // optionally WHICH named bank/bKash/Nagad/Rocket/card sub-account (blank = unassigned)
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentAccount', default: null },
    previousDue: { type: Number, default: 0 },   // due before this payment
    remainingDue: { type: Number, default: 0 },  // due after this payment
    note: { type: String, default: '' },
    date: { type: Date, default: Date.now },
    collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

duePaymentSchema.index({ business: 1, date: -1 });

export default mongoose.model('DuePayment', duePaymentSchema);
