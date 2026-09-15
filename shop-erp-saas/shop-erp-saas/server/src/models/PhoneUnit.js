import mongoose from 'mongoose';

// A single physical phone/device unit, uniquely identified by IMEI / serial.
// Many PhoneUnits belong to one Product (the model/variant). Stock for a
// serial-tracked product = number of units with status 'in_stock'.
const phoneUnitSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    // physical branch this unit's stock room belongs to. IMEI/serial uniqueness
    // still applies BUSINESS-wide (a real device can't be in two branches at
    // once) even though the document itself is branch-scoped — see phoneUnitController.
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    // This unit's OWN cost/price, snapshotted from whichever purchase batch
    // brought it in — null on every unit that predates this feature (or was
    // added without a supplier/price, e.g. plain "Manage IMEIs"), which falls
    // back to the product's current flat purchasePrice/sellingPrice, so old
    // data behaves exactly as before. Deliberately `!= null` checked wherever
    // read, never `||` — a legitimate ৳0 cost unit must not be mistaken for
    // "unset" and silently redirected to the product's current price.
    purchasePrice: { type: Number, default: null },
    sellingPrice: { type: Number, default: null },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseBatch', default: null },
    imei1: { type: String, trim: true, default: '' },
    imei2: { type: String, trim: true, default: '' },
    serial: { type: String, trim: true, default: '' },
    // 'damaged' = returned but not resellable (service/damaged stock, req 14)
    status: { type: String, enum: ['in_stock', 'sold', 'damaged'], default: 'in_stock', index: true },
    // sale linkage + warranty (filled in when sold)
    sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', default: null },
    installment: { type: mongoose.Schema.Types.ObjectId, ref: 'Installment', default: null }, // if sold via EMI instead
    soldAt: { type: Date, default: null },
    soldPrice: { type: Number, default: 0 },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerName: { type: String, default: '' },
    warrantyMonths: { type: Number, default: 0 },   // effective (max of brand/shop) — kept for legacy displays
    warrantyExpiry: { type: Date, default: null },
    // brand (manufacturer) and shop warranties tracked separately
    warrantyBrandMonths: { type: Number, default: 0 },
    warrantyShopMonths: { type: Number, default: 0 },
    warrantyBrandExpiry: { type: Date, default: null },
    warrantyShopExpiry: { type: Date, default: null },
  },
  { timestamps: true }
);

// Fast IMEI lookup within a business. Uniqueness is enforced in the controller
// (duplicate IMEI is blocked there) to avoid empty-string collisions on units
// that only carry a serial number.
phoneUnitSchema.index({ business: 1, imei1: 1 });
phoneUnitSchema.index({ business: 1, serial: 1 });

phoneUnitSchema.index({ business: 1, branch: 1, product: 1, status: 1 }); // per-product in-stock counts (hot path: every stock sync)
phoneUnitSchema.index({ business: 1, branch: 1, status: 1 }); // branch stock listings

export default mongoose.model('PhoneUnit', phoneUnitSchema);
