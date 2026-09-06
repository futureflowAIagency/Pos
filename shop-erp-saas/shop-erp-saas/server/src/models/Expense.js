import mongoose from 'mongoose';

const expenseSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    title: { type: String, required: true, trim: true },
    category: { type: String, default: 'General' },
    amount: { type: Number, required: true, default: 0 },
    // which balance the expense is paid from (drives dashboard balance engine)
    source: { type: String, enum: ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card'], default: 'cash' },
    // optionally WHICH named bank/bKash/Nagad/Rocket/card sub-account (blank = unassigned)
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentAccount', default: null },
    note: { type: String },
    date: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model('Expense', expenseSchema);
