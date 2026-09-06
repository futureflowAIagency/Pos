import mongoose from 'mongoose';

// A named sub-account under a payment method — e.g. the shop's 5-10 real bank
// accounts, or several bKash/Nagad numbers. Business-wide on purpose (unlike
// most money-movement models, which are per-branch since Phase 25): a real
// bank account isn't tied to one physical shop location, and an owner with
// several branches still has one shared set of bank accounts. `method` says
// which balance this account is a sub-division of; `cash` has no sub-accounts
// (there's only one till), so it's excluded from the enum.
const paymentAccountSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    method: { type: String, enum: ['bank', 'bkash', 'nagad', 'rocket', 'card'], required: true },
    name: { type: String, required: true, trim: true }, // e.g. "Dutch-Bangla — Current", "bKash Agent 1"
    accountNumber: { type: String, default: '', trim: true },
    note: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

paymentAccountSchema.index({ business: 1, method: 1 });

export default mongoose.model('PaymentAccount', paymentAccountSchema);
