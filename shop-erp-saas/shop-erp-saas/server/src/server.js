import app from './app.js';
import { connectDB } from './config/db.js';
import { config } from './config/env.js';
import { ensureMainBranches } from './scripts/ensureMainBranches.js';

const start = async () => {
  await connectDB();
  // Idempotent — creates a Main Branch for any pre-Phase-25 business and
  // backfills its data; a no-op on every boot after the first successful run.
  await ensureMainBranches();
  app.listen(config.port, () => {
    console.log(`🚀 Server running in ${config.nodeEnv} mode on port ${config.port}`);
    console.log(`   API base: http://localhost:${config.port}/api`);
  });
};

start();
