#!/usr/bin/env node
'use strict';

/**
 * ncdb-debt-scan.js — measure progress toward the mission's north star,
 * "all DB-shaped logic in ncdb," by surveying raw-SQL usage in copilot's
 * core/service layers (where `sql:check-ui` does NOT look — it guards only
 * src/ui).
 *
 *   node tools/dev/ncdb-debt-scan.js                 # ranked report
 *   node tools/dev/ncdb-debt-scan.js --json
 *   node tools/dev/ncdb-debt-scan.js --max 250       # exit 1 if total > 250 (ratchet)
 *
 * "Debt" here = raw better-sqlite3 signatures (`.prepare(`, `.exec(`,
 * `require('better-sqlite3')`) in files that hold DB-SHAPED QUERY LOGIC but
 * are NOT ncdb's home (src/db), the guarded UI (src/ui), or tooling/tests.
 * NOT every hit is wrong — bootstrap/migration code legitimately owns a
 * connection — so the report frames files as delegation CANDIDATES, and the
 * --max ratchet's real job is to make NEW leakage a detectable regression
 * (the sql:check-ui pattern, widened past src/ui).
 *
 * Detection core (countSqlSignatures / rankFiles) is pure and unit-tested;
 * the CLI just walks the tree and prints.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

// Excluded roots: src/db is ncdb's own compat/adapter home; src/ui is
// covered by sql:check-ui; tools/tests/scripts are dev surface, not product.
const DEFAULT_EXCLUDE = [
  /^src[/\\]db[/\\]/,        // ncdb's own compat/adapter home
  /^src[/\\]ui[/\\]/,        // guarded by sql:check-ui
  /^src[/\\]test-utils[/\\]/, // test infrastructure (parallel to __tests__)
  /[/\\]__tests__[/\\]/,
  /\.test\.js$/
];

const SIG = {
  prepare: /\.prepare\s*\(/g,
  // .exec( is ambiguous: db.exec('CREATE TABLE…') is SQL, but
  // regexPattern.exec(text) is regex matching. Precision fix (2026-07-20,
  // found delegating FactExtractor whose 8 "exec" hits were ALL regex):
  // count .exec( ONLY when its first argument is a string/template literal —
  // db.exec is always called with SQL text; regex.exec always with a
  // variable. This removes the regex-exec false positives. Known residual:
  // a `db.exec(variableHoldingSql)` (seen once, in a migration file) is
  // missed — accepted, as perfect static SQL-vs-regex disambiguation isn't
  // possible and this is a debt PROXY, not an exact count.
  exec: /\.exec\s*\(\s*[`'"]/g,
  betterSqlite3: /require\(['"]better-sqlite3['"]\)|from ['"]better-sqlite3['"]/g
};

// --- pure core ---------------------------------------------------------------

// Count raw-SQL signatures in one file's text. Comment-stripping is
// intentionally light (line comments only) — matches sql-boundary-check's
// pragmatism; a `.prepare(` inside a block comment is rare and erring toward
// over-reporting is safe for a debt proxy.
function countSqlSignatures(text) {
  const noLineComments = String(text || '').replace(/^\s*\/\/.*$/gm, '');
  const counts = {};
  let total = 0;
  for (const [name, re] of Object.entries(SIG)) {
    const m = noLineComments.match(re);
    const n = m ? m.length : 0;
    counts[name] = n;
    total += n;
  }
  counts.total = total;
  counts.ownsConnection = counts.betterSqlite3 > 0; // requires the driver directly
  return counts;
}

// Rank {file, counts} entries by total desc, then file asc for stability.
function rankFiles(entries) {
  return entries
    .filter((e) => e.counts.total > 0)
    .sort((a, b) => (b.counts.total - a.counts.total) || (a.file < b.file ? -1 : 1));
}

// --- I/O ---------------------------------------------------------------------

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (name === 'node_modules' || name === '.git') continue;
      walk(full, out);
    } else if (name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const maxIdx = argv.indexOf('--max');
  const max = maxIdx >= 0 ? Number(argv[maxIdx + 1]) : null;

  const srcDir = path.join(ROOT, 'src');
  const files = fs.existsSync(srcDir) ? walk(srcDir) : [];
  const entries = [];
  for (const full of files) {
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    if (DEFAULT_EXCLUDE.some((re) => re.test(rel))) continue;
    const counts = countSqlSignatures(fs.readFileSync(full, 'utf8'));
    if (counts.total > 0) entries.push({ file: rel, counts });
  }
  const ranked = rankFiles(entries);
  const total = ranked.reduce((s, e) => s + e.counts.total, 0);
  const connOwners = ranked.filter((e) => e.counts.ownsConnection).length;

  if (asJson) {
    console.log(JSON.stringify({ total, files: ranked.length, connectionOwners: connOwners, max, top: ranked.slice(0, 40) }, null, 2));
  } else {
    console.log(`\n== ncdb coordination-debt scan (raw SQL outside src/db, src/ui, tests) ==`);
    console.log(`${ranked.length} files, ${total} raw-SQL signatures, ${connOwners} own a better-sqlite3 connection.\n`);
    console.log('  total  prep  exec  bs3  file');
    for (const e of ranked.slice(0, 25)) {
      const c = e.counts;
      console.log(`  ${String(c.total).padStart(5)}  ${String(c.prepare).padStart(4)}  ${String(c.exec).padStart(4)}  ${String(c.betterSqlite3).padStart(3)}  ${e.file}`);
    }
    if (ranked.length > 25) console.log(`  … and ${ranked.length - 25} more`);
    console.log('\nDelegation candidates: highest-signature files with query logic that could become ncdb exports (differential-e2e recipe).');
  }

  if (max != null && total > max) {
    console.error(`\nRATCHET FAILED: ${total} raw-SQL signatures > ceiling ${max}. New DB-shaped logic leaked into core layers — delegate it to ncdb or raise the ceiling deliberately.`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { countSqlSignatures, rankFiles };
