import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    note: { type: String, trim: true, default: '' },
    // running totals, kept in sync by purchase / payment entries
    totalPurchase: { type: Number, default: 0 }, // total value of goods bought
    totalPaid: { type: Number, default: 0 },     // total amount paid to supplier
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// amount still owed to the supplier
supplierSchema.virtual('due').get(function () {
  return Math.max(0, (this.totalPurchase || 0) - (this.totalPaid || 0));
});
supplierSchema.set('toJSON', { virtuals: true });

supplierSchema.index({ business: 1, createdAt: -1 }); // supplier list's default sort

export default mongoose.model('Supplier', supplierSchema);
