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
 * Detection core (countSqlSignatures / rankFiles / classifyReachability) is
 * pure and unit-tested; the CLI just walks the tree and prints.
 *
 * REACHABILITY (added 2026-08-05, cycle 217). The ranked list is a debt
 * PROXY, and for two cycles running it put DEAD CODE at the top:
 *   c216 — normalize-article-places (15 sites) migrates a column the schema
 *          no longer has; three of the five normalize-* tools are spent.
 *   c217 — bootstrapDbLoader (13 sites, 408 lines) has zero callers; ncdb's
 *          ensureSqliteNewsDatabase took over bootstrap seeding at B10c.
 * Both cost a cycle to rediscover, and the second rediscovery was avoidable:
 * a 2026-07-20 ledger row already recorded "all normalize-* and populate-*
 * are self-described MIGRATION one-offs (skip)". That knowledge lived in
 * prose 190 cycles back and was lost. It lives in the tool now.
 *
 * Deleting an unreachable file lowers the number without delegating
 * anything, so the report SEPARATES the two rather than blending them: only
 * reachable files are delegation candidates, and the ratchet ceiling should
 * be earned by delegation, not by deletion.
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

// Files that are NOT delegation candidates for a reason that was MEASURED
// once and must not be re-derived every cycle. Each entry carries the
// evidence, so a future reader can re-check it rather than trust it.
const NOT_A_CANDIDATE = [
  {
    // c218: the three SPENT migrations here (article-places, place-hubs,
    // place-hub-unknown-terms) were RETIRED by owner ruling, so they no
    // longer appear in the scan at all. The two below are different: they
    // have never run. Measured on 2026-08-05 against a fresh ensureDb schema
    // AND the live news.db, which agree — fetches has 54,485 rows and no
    // url_id column, place_hub_candidates 673 rows and no candidate_url_id.
    // Delegating a migration's SQL buys nothing: it runs once and is done.
    match: /^src[/\\]tools[/\\]normalize-urls[/\\]normalize-(fetches|place-hub-candidates)\.js$/,
    reason: 'one-off migration, NOT yet applied (c218 measured it against the live db: the legacy column is still present and the target column absent). Delegating a migration buys nothing — it runs once.'
  },
  {
    match: /^src[/\\]intelligence[/\\]matching[/\\]populate-place-names\.js$/,
    reason: 'one-off populate script (the 2026-07-20 "normalize-*/populate-* are migration one-offs" ruling)'
  }
];

function exclusionReason(file) {
  const hit = NOT_A_CANDIDATE.find((e) => e.match.test(file));
  return hit ? hit.reason : null;
}

// An exclusion whose file has since been deleted is dead weight, and a table
// of dead weight is how the previous "these are migration one-offs, skip"
// ruling rotted into uselessness. Report entries that match nothing so the
// table is pruned by the tool's own output rather than by memory.
function staleExclusions(files) {
  const list = Array.isArray(files) ? files : [];
  return NOT_A_CANDIDATE
    .filter((e) => !list.some((f) => e.match.test(String(f))))
    .map((e) => e.reason);
}

// Classify how a file can be ENTERED. `refs` is the number of other files
// that require() it; `hasEntryGuard` is whether it has `require.main ===
// module`.
//
// src/tools is deliberately special-cased: those files are a CLI surface
// invoked BY PATH, and c213 proved the entry guard is not a reliable tell
// there — gazetteer-cleanup.js called main() unconditionally at module
// scope with no guard at all. Calling an unguarded tool "orphan" would have
// condemned a live script, so tools are 'entry' either way.
function classifyReachability({ file, refs = 0, hasEntryGuard = false }) {
  const rel = String(file || '').replace(/\\/g, '/');
  if (/^src\/tools\//.test(rel)) return 'entry';
  if (refs > 0) return 'imported';
  if (hasEntryGuard) return 'entry';
  return 'orphan';
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

// Count, for every file in the tree, how many OTHER files require() it.
// Relative specifiers only — a bare specifier is a package, not a local
// edge. Each specifier is resolved three ways (exact, +.js, /index.js)
// because we are indexing by path, not running node's resolver.
const RELATIVE_REQUIRE = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;

function buildRefIndex(rootDirs) {
  const files = [];
  for (const dir of rootDirs) {
    if (fs.existsSync(dir)) walk(dir, files);
  }
  const refs = new Map();
  for (const from of files) {
    const text = fs.readFileSync(from, 'utf8');
    let m;
    RELATIVE_REQUIRE.lastIndex = 0;
    while ((m = RELATIVE_REQUIRE.exec(text))) {
      const base = path.resolve(path.dirname(from), m[1]);
      for (const cand of [base, base + '.js', path.join(base, 'index.js')]) {
        const key = path.resolve(cand);
        if (key === path.resolve(from)) continue; // self-reference is not a caller
        if (!refs.has(key)) refs.set(key, new Set());
        refs.get(key).add(path.resolve(from));
      }
    }
  }
  return refs;
}

function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const maxIdx = argv.indexOf('--max');
  const max = maxIdx >= 0 ? Number(argv[maxIdx + 1]) : null;

  const srcDir = path.join(ROOT, 'src');
  const files = fs.existsSync(srcDir) ? walk(srcDir) : [];
  // Callers can live anywhere in the repo, not just under src.
  const refIndex = buildRefIndex(['src', 'tools', 'tests', 'bin', 'scripts'].map((d) => path.join(ROOT, d)));
  const entries = [];
  for (const full of files) {
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    if (DEFAULT_EXCLUDE.some((re) => re.test(rel))) continue;
    const text = fs.readFileSync(full, 'utf8');
    const counts = countSqlSignatures(text);
    if (counts.total === 0) continue;
    const refs = (refIndex.get(path.resolve(full)) || new Set()).size;
    const reachability = classifyReachability({
      file: rel,
      refs,
      hasEntryGuard: /require\.main\s*===\s*module/.test(text)
    });
    entries.push({ file: rel, counts, refs, reachability, excluded: exclusionReason(rel) });
  }
  const ranked = rankFiles(entries);
  const total = ranked.reduce((s, e) => s + e.counts.total, 0);
  const connOwners = ranked.filter((e) => e.counts.ownsConnection).length;
  const orphans = ranked.filter((e) => e.reachability === 'orphan');
  const orphanSigs = orphans.reduce((s, e) => s + e.counts.total, 0);
  const candidates = ranked.filter((e) => e.reachability !== 'orphan' && !e.excluded);

  if (asJson) {
    console.log(JSON.stringify({
      total,
      files: ranked.length,
      connectionOwners: connOwners,
      max,
      orphanSignatures: orphanSigs,
      candidateSignatures: candidates.reduce((s, e) => s + e.counts.total, 0),
      top: ranked.slice(0, 40),
      orphans: orphans.map((e) => ({ file: e.file, total: e.counts.total })),
      excluded: ranked.filter((e) => e.excluded).map((e) => ({ file: e.file, total: e.counts.total, reason: e.excluded }))
    }, null, 2));
  } else {
    console.log(`\n== ncdb coordination-debt scan (raw SQL outside src/db, src/ui, tests) ==`);
    console.log(`${ranked.length} files, ${total} raw-SQL signatures, ${connOwners} own a better-sqlite3 connection.`);
    console.log(`${candidates.reduce((s, e) => s + e.counts.total, 0)} of those are DELEGATABLE; ${orphanSigs} sit in unreachable files.\n`);
    console.log('  total  refs  prep  exec  bs3  file');
    for (const e of candidates.slice(0, 20)) {
      const c = e.counts;
      console.log(`  ${String(c.total).padStart(5)}  ${String(e.refs).padStart(4)}  ${String(c.prepare).padStart(4)}  ${String(c.exec).padStart(4)}  ${String(c.betterSqlite3).padStart(3)}  ${e.file}`);
    }
    if (candidates.length > 20) console.log(`  … and ${candidates.length - 20} more candidates`);

    if (orphans.length) {
      console.log(`\n  ORPHANS — nothing requires them and they are not a CLI entry point.`);
      console.log(`  Deleting these lowers the number WITHOUT delegating anything; do not`);
      console.log(`  bank a ratchet drop for it. Check each one before acting.`);
      for (const e of orphans) console.log(`    ${String(e.counts.total).padStart(4)}  ${e.file}`);
    }

    const excluded = ranked.filter((e) => e.excluded);
    if (excluded.length) {
      console.log(`\n  NOT CANDIDATES — measured once, recorded here so it stays measured.`);
      for (const e of excluded) console.log(`    ${String(e.counts.total).padStart(4)}  ${e.file}\n          ${e.excluded}`);
    }

    const stale = staleExclusions(ranked.map((e) => e.file));
    if (stale.length) {
      console.log(`\n  STALE EXCLUSIONS — these entries match no file any more; prune them:`);
      for (const r of stale) console.log(`    ${r}`);
    }

    console.log('\nDelegation candidates: highest-signature REACHABLE files with query logic that could become ncdb exports (differential-e2e recipe).');
  }

  // The ratchet guards DELEGATABLE signatures, not the raw total.
  //
  // Changed 2026-08-05 (cycle 218), deliberately. Against the raw total the
  // guard could be satisfied by DELETING things: c217 retired one unreachable
  // file and the total fell 195 -> 182 without a single query moving into
  // ncdb, and c218's owner-directed retirement of three spent migrations took
  // another 30. Both are fine changes, neither is progress toward "all
  // DB-shaped logic in ncdb", and a ratchet that rewards them measures
  // tidiness. Delegatable = reachable, non-excluded files — the SQL that
  // could actually move. It is the number a real delegation lowers, and the
  // number new leakage raises.
  const guarded = candidates.reduce((s, e) => s + e.counts.total, 0);
  if (max != null && guarded > max) {
    console.error(`\nRATCHET FAILED: ${guarded} DELEGATABLE raw-SQL signatures > ceiling ${max} (raw total ${total}). New DB-shaped logic leaked into core layers — delegate it to ncdb or raise the ceiling deliberately.`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { countSqlSignatures, rankFiles, classifyReachability, exclusionReason, staleExclusions };
