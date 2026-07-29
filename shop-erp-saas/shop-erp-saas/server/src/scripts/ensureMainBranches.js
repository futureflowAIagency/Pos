/**
 * Multi-branch migration (Phase 25): every business now needs at least one
 * Branch, and every branch-scoped document (Product, PhoneUnit, Sale, Purchase,
 * Expense, Fund, Transfer, Installment, ServiceJob, Return, DuePayment) needs a
 * `branch` value. For a business that has none yet, this creates one "Main
 * Branch" and backfills every one of those collections onto it.
 *
 * Idempotent — safe to run every time: a business that already has a branch is
 * skipped entirely, and the backfill only ever touches documents where `branch`
 * is still missing. Called automatically once at server boot (see server.js) so
 * an existing shop's data keeps working the moment this deploy goes out — this
 * project has no way to SSH into the client's VPS and run a one-off script
 * against the live Atlas DB, so a self-healing startup routine is the reliable
 * path (the equivalent standalone script also exists, `npm run migrate:branches`,
 * for manual/CLI use, matching this project's existing migration-script convention).
 */
import Business from '../models/Business.js';
import Branch from '../models/Branch.js';
import Product from '../models/Product.js';
import PhoneUnit from '../models/PhoneUnit.js';
import Sale from '../models/Sale.js';
import Purchase from '../models/Purchase.js';
import Expense from '../models/Expense.js';
import Fund from '../models/Fund.js';
import Transfer from '../models/Transfer.js';
import Installment from '../models/Installment.js';
import ServiceJob from '../models/ServiceJob.js';
import Return from '../models/Return.js';
import DuePayment from '../models/DuePayment.js';

// Every model that needs a `branch` backfilled once a business's Main Branch exists.
const BRANCH_SCOPED_MODELS = [
  Product, PhoneUnit, Sale, Purchase, Expense, Fund, Transfer,
  Installment, ServiceJob, Return, DuePayment,
];

export const ensureMainBranches = async () => {
  const businesses = await Business.find().select('_id name').lean();
  let created = 0, backfilled = 0;

  for (const business of businesses) {
    const hasBranch = await Branch.exists({ business: business._id });
    if (hasBranch) continue; // already migrated (or created post-Phase-25) — nothing to do

    const branch = await Branch.create({
      business: business._id,
      name: business.name ? `${business.name} — Main Branch` : 'Main Branch',
      isMainBranch: true,
    });
    created++;

    for (const Model of BRANCH_SCOPED_MODELS) {
      const { modifiedCount } = await Model.updateMany(
        { business: business._id, branch: { $exists: false } },
        { $set: { branch: branch._id } }
      );
      backfilled += modifiedCount;
    }
  }

  if (created || backfilled) {
    console.log(`🏬 Branch migration: created ${created} main branch(es), backfilled ${backfilled} document(s).`);
  }
  return { businesses: businesses.length, created, backfilled };
};

// Allow `node src/scripts/ensureMainBranches.js` for manual/CLI use, matching
// this project's other one-off scripts (e.g. migrateImagesToCloudinary.js).
if (process.argv[1] && process.argv[1].endsWith('ensureMainBranches.js')) {
  const { connectDB } = await import('../config/db.js');
  const mongoose = (await import('mongoose')).default;
  await connectDB();
  const result = await ensureMainBranches();
  console.log('Done:', result);
  await mongoose.disconnect();
  process.exit(0);
}
