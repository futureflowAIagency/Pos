import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The deployed short git commit hash + when it was committed — this is the
// simplest reliable "app version" for a project with no CI/version-bump
// discipline: it changes exactly when the deployed code actually changes,
// with zero manual bookkeeping. Git auto-discovers the repo root by walking
// up from `cwd`, so this works regardless of how deep this file sits inside
// the checkout. Computed once per process — a fresh value appears automatically
// after every `pm2 restart` that follows a `git pull` (see deploy/post-receive).
let cached = null;

export function getAppVersion() {
  if (cached) return cached;
  try {
    const opts = { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] };
    const version = execSync('git rev-parse --short HEAD', opts).toString().trim();
    const deployedAt = execSync('git log -1 --format=%cI', opts).toString().trim();
    cached = { version, deployedAt };
  } catch {
    // not a git checkout (e.g. local dev via a zip/copy) — degrade gracefully
    cached = { version: 'dev', deployedAt: null };
  }
  return cached;
}
