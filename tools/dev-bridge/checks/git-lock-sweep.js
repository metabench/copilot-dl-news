'use strict';

/**
 * git-lock-sweep.js — report (and with --fix, remove) stale .git/index.lock
 * files across the repos workspace. A lock is "stale" when older than 30
 * minutes; live git operations hold theirs briefly.
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const FIX = process.argv.includes('--fix');
const STALE_MS = 30 * 60 * 1000;

let found = 0;
for (const entry of fs.readdirSync(WORKSPACE, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const lock = path.join(WORKSPACE, entry.name, '.git', 'index.lock');
  try {
    const st = fs.statSync(lock);
    found++;
    const ageMin = (Date.now() - st.mtimeMs) / 60000;
    const stale = Date.now() - st.mtimeMs > STALE_MS;
    console.log(`[git-lock] ${entry.name}: index.lock age ${ageMin.toFixed(0)}min ${stale ? '(STALE)' : '(fresh — a git op may be running)'}`);
    if (FIX && stale) {
      try {
        fs.unlinkSync(lock);
        console.log(`[git-lock] ${entry.name}: removed`);
      } catch (err) {
        console.log(`[git-lock] ${entry.name}: remove failed → ${err.code || err.message}`);
      }
    }
  } catch (_) { /* no lock */ }
}
console.log(found === 0 ? '[git-lock] no index.lock files found' : `[git-lock] ${found} lock file(s) found${FIX ? ' (stale ones removed)' : ' (run with --fix to remove stale ones)'}`);
