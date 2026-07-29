import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    // physical branch this product's catalog entry/stock belongs to — separate
    // catalog per branch, so the same model at two branches is two documents
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    name: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: '' }, // legacy product photo (UI removed; kept for back-compat)
    sku: { type: String, trim: true },
    // unique (per business) product barcode — auto-generated if blank. Used for
    // scan-to-add (dedupes products, only adds a new IMEI) and label printing.
    barcode: { type: String, trim: true, default: '', index: true },
    category: { type: String, trim: true, default: 'General' },
    unit: { type: String, default: 'pcs' },
    // which supplier/dealer this product came from — so the shop can see whose
    // stock is whose. Optional: set automatically by the Add-Product-with-supplier
    // flow, or editable directly on any product afterwards.
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
    purchasePrice: { type: Number, required: true, default: 0 },
    sellingPrice: { type: Number, required: true, default: 0 },
    // discount as a percentage (%) of selling price
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    stock: { type: Number, default: 0 },
    lowStockAlert: { type: Number, default: 5 },
    // pharmacy-specific (optional)
    expiryDate: { type: Date },
    batchNo: { type: String },
    // ---- mobile-shop specific (optional; only used when business.type === 'mobile') ----
    // when true, stock is driven by individual IMEI/serial units (see PhoneUnit model)
    trackSerial: { type: Boolean, default: false },
    // variant attributes, e.g. "iPhone 15 Pro – 128GB – Black"
    brand: { type: String, trim: true, default: '' },
    color: { type: String, trim: true, default: '' },
    storage: { type: String, trim: true, default: '' }, // RAM/ROM e.g. "8GB/128GB"
    // warranty in months — brand warranty and the shop's own service warranty
    warrantyBrandMonths: { type: Number, default: 0 },
    warrantyShopMonths: { type: Number, default: 0 },
    // admin can mark specific products ineligible for return/exchange (req 14)
    returnable: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

productSchema.virtual('isLowStock').get(function () {
  return this.stock <= this.lowStockAlert;
});
// Auto-calculated selling price after applying the percentage discount
productSchema.virtual('discountedPrice').get(function () {
  const pct = Math.min(Math.max(this.discountPercent || 0, 0), 100);
  return Math.round((this.sellingPrice * (1 - pct / 100)) * 100) / 100;
});
productSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Product', productSchema);
