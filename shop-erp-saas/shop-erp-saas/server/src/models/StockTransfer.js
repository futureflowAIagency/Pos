import mongoose from 'mongoose';

// One line of a stock transfer. Because every branch keeps its OWN catalog
// (Phase 25), the same physical model is two different Product documents —
// so a line records both the source product it left and the destination
// product it landed in (created on the fly if that branch never stocked it).
const transferItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },   // in fromBranch
    toProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }, // in toBranch
    name: String,
    qty: { type: Number, default: 0 },
    // serial-tracked lines carry the exact devices that moved, snapshotted so
    // the record still reads correctly after a unit is later sold or edited
    units: [{
      _id: false,
      unit: { type: mongoose.Schema.Types.ObjectId, ref: 'PhoneUnit' },
      imei1: { type: String, default: '' },
      imei2: { type: String, default: '' },
      serial: { type: String, default: '' },
    }],
  },
  { _id: false }
);

// A completed movement of stock from one branch to another. Deliberately has
// no single `branch` field (unlike every other branch-scoped model) — a
// transfer belongs to two branches at once, which is the whole point.
const stockTransferSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    transferNo: { type: String, required: true },
    fromBranch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    toBranch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    items: [transferItemSchema],
    totalQty: { type: Number, default: 0 },
    note: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

stockTransferSchema.index({ business: 1, createdAt: -1 });

export default mongoose.model('StockTransfer', stockTransferSchema);
