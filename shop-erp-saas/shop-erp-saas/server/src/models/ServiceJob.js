import mongoose from 'mongoose';

export const SERVICE_STATUSES = ['pending', 'repairing', 'completed', 'delivered'];

// A repair / servicing job sheet for a customer's device.
const serviceJobSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    jobNo: { type: String, required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerName: { type: String, default: '' },
    customerPhone: { type: String, default: '' },
    deviceModel: { type: String, default: '' },
    imei: { type: String, default: '' },
    problem: { type: String, default: '' },
    budget: { type: Number, default: 0 }, // customer's expected budget
    technician: { type: String, default: '' }, // assigned technician (name / emp id)
    status: { type: String, enum: SERVICE_STATUSES, default: 'pending', index: true },
    // serviceFee is the FULL customer-facing bill (what the customer is charged/sees).
    // partsCost & technicianCost are internal costs only, used for profit — never
    // shown on the customer invoice.
    serviceFee: { type: Number, default: 0 },
    partsCost: { type: Number, default: 0 },
    technicianCost: { type: Number, default: 0 },
    total: { type: Number, default: 0 }, // customer bill = serviceFee
    profit: { type: Number, default: 0 }, // serviceFee - partsCost - technicianCost (internal)
    paid: { type: Number, default: 0 },
    // tender used for the `paid` amount — feeds the dashboard balance engine
    paymentMethod: { type: String, enum: ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card'], default: 'cash' },
    statusHistory: [{ status: String, at: { type: Date, default: Date.now } }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

serviceJobSchema.index({ business: 1, createdAt: -1 });

export default mongoose.model('ServiceJob', serviceJobSchema);
