import mongoose from 'mongoose';

const businessSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // 'general' | 'pharmacy' | 'mobile' -> controls print format & feature modules
    type: { type: String, enum: ['general', 'pharmacy', 'mobile'], default: 'general' },
    address: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, default: '' },
    logoUrl: { type: String, default: '' },
    currency: { type: String, default: 'BDT' },
    footerWebsite: { type: String, default: 'https://futureflow.ai' },
    settings: {
      lowStockThreshold: { type: Number, default: 5 },
      printMode: { type: String, enum: ['a4', 'thermal'], default: 'a4' },
      // Return & Exchange window in days (req 14) — past this, only owner/superadmin may process
      returnWindowDays: { type: Number, enum: [3, 7, 30], default: 7 },
      // Physical width of the shop's thermal roll, in mm. Printing an 80mm-wide
      // receipt layout on a 58mm printer doesn't wrap or shrink — the printer
      // hardware just cuts off whatever falls past the physical paper edge, on
      // every line. Defaults to 80 (the layout's original fixed size) so no
      // existing shop's printing changes until they explicitly pick 58mm here.
      printWidthMm: { type: Number, enum: [58, 80], default: 80 },
    },
    // per-shop custom subscription price set by super admin.
    // when enabled, this single plan replaces the default plans on the subscription page.
    customPlan: {
      enabled: { type: Boolean, default: false },
      label: { type: String, default: 'Custom Plan', trim: true },
      price: { type: Number, default: 0 },
      days: { type: Number, default: 30 },
    },
    // subscription snapshot for quick access checks
    subscriptionStatus: { type: String, enum: ['trial', 'active', 'expired'], default: 'trial' },
    subscriptionExpiry: { type: Date, default: () => Date.now() + 14 * 24 * 60 * 60 * 1000 },
  },
  { timestamps: true }
);

export default mongoose.model('Business', businessSchema);
