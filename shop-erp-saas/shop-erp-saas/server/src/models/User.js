import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    // superadmin = platform owner (manages all businesses/payments)
    // owner = shop owner (tenant admin), staff = limited business user
    role: { type: String, enum: ['superadmin', 'owner', 'staff'], default: 'owner' },
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', default: null },
    // which dashboard modules a 'staff' user can access (owner sets this per-employee);
    // owner/superadmin always have full access regardless of this list
    permissions: { type: [String], default: [] },
    // locks a staff login to one branch (server-enforced in resolveBranch — the
    // user can never see another branch's data even by tampering with the
    // client-sent branch header). null = free to switch branches (owner default,
    // or a staff member who legitimately works across branches).
    assignedBranch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
    preferences: {
      theme: { type: String, enum: ['light', 'dark'], default: 'light' },
    },
    // 6-digit password-change verification (stored hashed) + expiry
    resetCode: { type: String, select: false },
    resetCodeExpires: { type: Date, select: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.matchPassword = function (entered) {
  return bcrypt.compare(entered, this.password);
};

export default mongoose.model('User', userSchema);
