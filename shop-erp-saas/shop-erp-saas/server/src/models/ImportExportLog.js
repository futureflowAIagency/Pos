import mongoose from 'mongoose';

// Audit trail for every import/export/backup/restore action (req 13).
const importExportLogSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    // which branch an import/export targeted — optional, since some actions
    // (full backup, business-wide export) aren't tied to one branch
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
    action: { type: String, enum: ['import', 'export', 'backup', 'restore'], required: true },
    entity: { type: String, required: true }, // 'customers' | 'suppliers' | 'products' | 'units' | 'expenses' | 'sales' | 'purchases' | 'installments' | 'dues' | 'full'
    format: { type: String, enum: ['csv', 'json'], default: 'csv' },
    recordCount: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

importExportLogSchema.index({ business: 1, createdAt: -1 });

export default mongoose.model('ImportExportLog', importExportLogSchema);
