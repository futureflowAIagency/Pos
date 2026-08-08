import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true, default: '' },
    address: { type: String, trim: true },
    // KYC / identity (used by mobile shops to record NID at point of sale)
    nid: { type: String, trim: true, default: '' },
    totalDue: { type: Number, default: 0 },
    // reminder date for collecting this customer's due — a notification is
    // generated once this date is reached/passed while totalDue > 0
    dueDate: { type: Date, default: null },
    // credit balance from returns/exchanges (req 14) — redeemable on a future purchase
    storeCredit: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model('Customer', customerSchema);
