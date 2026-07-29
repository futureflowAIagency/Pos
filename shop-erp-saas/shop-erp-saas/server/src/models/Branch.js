import mongoose from 'mongoose';

// A physical shop location under one business account. Products/stock/sales/
// money are scoped per branch (each branch has its own catalog and till);
// Customers/Suppliers/Employees stay business-wide (shared across branches).
const branchSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    name: { type: String, required: true, trim: true },
    address: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    // exactly one branch per business should be true (enforced in the controller,
    // not a DB constraint) — the fallback branch when no X-Branch-Id is sent/valid,
    // and the one branch that can never be deactivated
    isMainBranch: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

branchSchema.index({ business: 1, isActive: 1 });

export default mongoose.model('Branch', branchSchema);
