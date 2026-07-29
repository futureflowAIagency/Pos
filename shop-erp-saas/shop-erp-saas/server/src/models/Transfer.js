import mongoose from 'mongoose';

// Internal balance transfer between two of the shop's own payment methods,
// e.g. "move 5000 from bKash to Cash" after cashing out. Not income, not an
// expense — one method's balance goes down, another's goes up by the same amount.
const transferSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    fromMethod: { type: String, enum: ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card'], required: true },
    toMethod: { type: String, enum: ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card'], required: true },
    amount: { type: Number, required: true, default: 0 },
    note: { type: String, default: '' },
    date: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

transferSchema.index({ business: 1, date: -1 });

export default mongoose.model('Transfer', transferSchema);
