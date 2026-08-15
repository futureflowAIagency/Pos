import mongoose from 'mongoose';

// One scanned barcode/QR value, submitted by the phone page.
const scanSchema = new mongoose.Schema(
  {
    value: { type: String, required: true, trim: true },
    format: { type: String, default: '' },
    scannedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

// A short-lived "remote scan" session: the POS shows its QR code, a phone with
// no login scans that QR (a normal HTTPS link) and can submit barcode values to
// this one session for a few minutes — nothing else. Access is gated entirely by
// the random `token`, not a user login, since the phone never signs in.
const scanSessionSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    token: { type: String, required: true, unique: true, index: true },
    scans: { type: [scanSchema], default: [] },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// MongoDB removes the document itself once expiresAt passes — no cleanup job needed.
scanSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('ScanSession', scanSessionSchema);
