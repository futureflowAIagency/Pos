import mongoose from 'mongoose';

// One row per purchase EVENT for one product — the historical record that lets
// stock already on the shelf keep selling at its OLD purchase/selling price
// even after the same product is bought again at a different price. Applies
// uniformly to serial-tracked and plain-qty products; only plain-qty products
// actually consume `qtyRemaining` as a live FIFO cursor (see
// server/src/utils/purchaseBatch.js) — for serial-tracked products it's written
// once and left alone, since the real "still unsold" count for a batch is
// always derived live from PhoneUnit.countDocuments({ batch, status:
// 'in_stock' }), avoiding two counters that could drift apart.
const purchaseBatchSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    // the Purchase ledger entry this batch came from — set right after that
    // document is created (createProductsWithSupplier builds Purchase.items[]
    // and every PurchaseBatch in the same loop, but the Purchase doc itself
    // doesn't exist yet until after the loop, so this starts null and gets
    // filled in immediately afterward via insertMany/updateMany).
    purchase: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase', default: null },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
    purchasePrice: { type: Number, required: true, default: 0 },
    sellingPrice: { type: Number, required: true, default: 0 },
    qtyPurchased: { type: Number, required: true, default: 0 }, // immutable historical record
    // Plain-qty products: the live, mutable FIFO cursor — decremented by
    // consumeBatchesFifo() as sales are made, and deliberately NEVER restored
    // by a return (a return already reverses profit from the sale line's own
    // snapshotted purchasePrice, so stock/profit both stay correct regardless;
    // only the batch a much-later sale gets costed against could, in a rare
    // sold-out-then-returned sequence, end up slightly off — an accepted,
    // documented MVP limitation, not a money-losing bug).
    // Serial-tracked products: written once at creation and never updated —
    // see the model-level note above for why.
    qtyRemaining: { type: Number, required: true, default: 0 },
    purchaseDate: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

purchaseBatchSchema.index({ business: 1, product: 1, purchaseDate: 1 }); // FIFO consumption order
purchaseBatchSchema.index({ business: 1, product: 1, createdAt: -1 }); // newest-first history view

export default mongoose.model('PurchaseBatch', purchaseBatchSchema);
