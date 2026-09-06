import mongoose from 'mongoose';

// Capital / fund brought into the shop from outside (owner's own money, loans, etc.),
// or later withdrawn back out (fully or partially). Neither direction is income or
// an expense — it only tops up / draws down a payment-method balance.
const fundSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    // which balance this fund lands in / is taken from
    source: { type: String, enum: ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card'], default: 'cash' },
    // optionally WHICH named bank/bKash/Nagad/Rocket/card sub-account (blank = unassigned)
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentAccount', default: null },
    // 'add' = capital brought in, 'withdraw' = (partial or full) capital taken back out
    type: { type: String, enum: ['add', 'withdraw'], default: 'add' },
    amount: { type: Number, required: true, default: 0 },
    note: { type: String, default: '' },
    date: { type: Date, default: Date.now },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

fundSchema.index({ business: 1, date: -1 });

export default mongoose.model('Fund', fundSchema);
