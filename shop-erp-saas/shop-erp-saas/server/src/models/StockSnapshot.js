import mongoose from 'mongoose';

// One reading of "how much stock is on hand" per day — written whenever the
// Products page's "Stock Print by Brands" report is generated, so that report
// can show a day-over-day comparison ("Today's Total Products: 180, Last Day:
// 210") without needing a full stock-movement history to compute it from.
// Scoped the same way the report itself is (business + branch + whichever
// category filter was active) so the comparison is always apples-to-apples.
const stockSnapshotSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    category: { type: String, default: '' }, // '' = All Categories
    date: { type: String, required: true }, // local calendar day, 'YYYY-MM-DD'
    totalProducts: { type: Number, default: 0 }, // distinct in-stock product listings
    totalQty: { type: Number, default: 0 }, // total pieces across those
  },
  { timestamps: true }
);

// One reading per business+branch+category+day — re-generating the report the
// same day just updates that day's own snapshot instead of creating another.
stockSnapshotSchema.index({ business: 1, branch: 1, category: 1, date: 1 }, { unique: true });

export default mongoose.model('StockSnapshot', stockSnapshotSchema);
