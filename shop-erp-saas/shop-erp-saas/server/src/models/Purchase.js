import mongoose from 'mongoose';

// A stock-purchase entry from a supplier. Records how much was bought and how
// much was paid up-front; the remaining balance becomes the supplier's due.
const purchaseItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    name: String,
    qty: { type: Number, default: 1 },
    unitCost: { type: Number, default: 0 },
  },
  { _id: false }
);

const purchaseSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    // which branch received the goods / made the payment — Supplier itself stays business-wide
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
    reference: { type: String, default: '' }, // invoice / memo no from supplier
    items: [purchaseItemSchema],
    note: { type: String, default: '' },
    total: { type: Number, default: 0 },
    paid: { type: Number, default: 0 },
    due: { type: Number, default: 0 },
    // which balance the `paid` amount came from — feeds the dashboard balance engine (outflow)
    source: { type: String, enum: ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card'], default: 'cash' },
    // 'purchase' = goods received, 'payment' = a standalone payment against due,
    // 'adjustment' = the owner corrected the due directly (no goods, no money —
    // `total`/`due` hold the signed correction and `paid` stays 0, so reports
    // (which filter kind:'purchase') and the balance engine are unaffected)
    kind: { type: String, enum: ['purchase', 'payment', 'adjustment'], default: 'purchase' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

purchaseSchema.index({ business: 1, createdAt: -1 });

export default mongoose.model('Purchase', purchaseSchema);
