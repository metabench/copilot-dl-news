'use strict';
// Build news-crawler-db (tsc → dist) and run a vitest file, from the bridge.
// Usage args: [testPathRelativeToNcdb]  (omit to skip tests)
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const NCDB = path.join(WORKSPACE, 'news-crawler-db');

const run = (label, args, opts = {}) => {
  console.log(`[${label}] node ${args.join(' ')}`);
  try {
    const out = execFileSync(process.execPath, args, {
      cwd: NCDB, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024, timeout: 10 * 60 * 1000, ...opts
    });
    console.log(out.slice(-3000));
    return true;
  } catch (err) {
    console.log(`[${label}] EXIT ${err.status}\n${(err.stdout || '').slice(-2500)}\n${(err.stderr || '').slice(-1500)}`);
    return false;
  }
};

const tscBin = path.join(NCDB, 'node_modules', 'typescript', 'bin', 'tsc');
if (!fs.existsSync(tscBin)) { console.log('tsc not found:', tscBin); process.exit(1); }
if (!run('tsc', [tscBin, '-p', NCDB])) process.exit(1);

const testArg = process.argv[2];
if (testArg) {
  const vitestBin = path.join(NCDB, 'node_modules', 'vitest', 'vitest.mjs');
  if (!fs.existsSync(vitestBin)) { console.log('vitest bin not found:', vitestBin); process.exit(1); }
  if (!run('vitest', [vitestBin, 'run', testArg])) process.exit(1);
}
console.log('[ncdb-build-and-test] OK');
