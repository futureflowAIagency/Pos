import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', index: true },
    // set only for branch-specific notices (e.g. low stock); null = visible from
    // any branch (e.g. a customer due-date reminder — Customer is business-wide)
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    type: { type: String, default: 'info' }, // info | warning | success | error
    title: { type: String, required: true },
    message: { type: String },
    isRead: { type: Boolean, default: false },
    // identifies "the same underlying condition" (e.g. `stock-<productId>` or
    // `due-<customerId>-<dueDateISODate>`) so the generator never creates
    // duplicate notices for something already raised
    dedupeKey: { type: String, index: true, default: null },
  },
  { timestamps: true }
);

export default mongoose.model('Notification', notificationSchema);
