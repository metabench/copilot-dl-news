#!/usr/bin/env node
'use strict';

/**
 * timestamp-comparison.check.js — catch the c220 defect class.
 *
 *   node tools/dev/checks/timestamp-comparison.check.js
 *   node tools/dev/checks/timestamp-comparison.check.js --json
 *   node tools/dev/checks/timestamp-comparison.check.js --max 12   # ratchet
 *
 * THE DEFECT. This database stores most timestamps as JavaScript ISO-8601
 * ("2026-08-06T02:03:57.807Z"). SQLite's datetime('now') produces a different
 * format ("2026-08-06 02:04:57"). Comparing them with <, >, <= or >= is a
 * STRING comparison between two formats, and "T" (0x54) sorts above " "
 * (0x20).
 *
 * The consequence is narrow but real: the comparison is correct whenever the
 * two dates differ, and WRONG whenever the value falls on the same calendar
 * date as the threshold — the ISO value always compares as the later one.
 * Measured 2026-08-05:
 *
 *   threshold datetime('now')            -> a row that expired 1 minute ago
 *                                           reads as FRESH (this is what made
 *                                           the response cache never expire
 *                                           anything until the date rolled
 *                                           over)
 *   threshold datetime('now','-7 day')   -> only rows landing ON the boundary
 *                                           date are misclassified
 *
 * So severity depends on the threshold: a TTL against 'now' can be a full
 * extra day of staleness; an age-window is a one-day boundary error.
 *
 * SCOPE. Timestamp columns in the live db hold ISO values on the largest
 * tables (links.discovered_at 4.9M rows, queue_events.ts 1.7M) and BOTH
 * formats on fifteen others — so the same query can be right for one row and
 * wrong for the next. Exact numbers below.
 *
 * THE RULE THIS CHECKS. A column compared against datetime('now'…) must have
 * both sides in the same format. What that means per column is NOT uniform,
 * which is why this file carries a measured census rather than a blanket
 * rule — see the next section.
 *
 * WHICH FIX, AND WHY IT DEPENDS ON THE COLUMN (measured 2026-08-06, c222).
 * There are two candidate fixes and they are NOT interchangeable:
 *
 *   datetime(col) > datetime(threshold)   correct for BOTH formats, but not
 *                                         sargable — defeats an index on col
 *   col > ?  (bound, column's own format) keeps the index, but is correct
 *                                         ONLY if the column is 100% one
 *                                         format
 *
 * Proved rather than assumed. Two rows at 15:00, threshold 12:00 same day,
 * both genuinely newer:
 *
 *   bound ISO threshold          ISO=1  SQLITE=0   <- wrong for the sqlite row
 *   datetime(col) vs datetime()  ISO=1  SQLITE=1   <- correct for both
 *
 * That matters because an EXACT census of the live db (counting every
 * non-null value, not sampling) found FIFTEEN columns holding BOTH formats:
 *
 *   urls.created_at              870,754 ISO + 925,136 sqlite
 *   urls.last_seen_at            849,939 ISO + 927,181 sqlite
 *   http_responses.fetched_at    221,731 ISO +  93,278 sqlite
 *   fetches.fetched_at             4,640 ISO +  49,812 sqlite
 *   errors.at                      4,028 ISO +   2,775 sqlite
 *   … and ten more
 *
 * (c221 sampled these with LIMIT 200 and called several of them "all ISO".
 * LIMIT without ORDER BY reads the oldest rowids, so the sample was biased;
 * fetches.fetched_at sampled as 100% ISO and is actually 8.5%.)
 *
 * So: bind a threshold on a UNIFORM column — including the two biggest,
 * links.discovered_at (4.9M, all ISO) and queue_events.ts (1.7M, all ISO),
 * where the index matters most. Use datetime() on a MIXED column and accept
 * the scan, until the stored data is normalised.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');

const SEARCH_ROOTS = [
  path.join(ROOT, 'src'),
  path.join(ROOT, 'tools'),
  path.resolve(ROOT, '..', 'news-crawler-db', 'src')
];

// A comparison operator, then datetime('now' ... ). We capture what sits
// immediately left of the operator to decide whether it is already wrapped.
const COMPARISON = /([A-Za-z_][\w.]*(?:\s*\)\s*)?)\s*(<=|>=|<|>)\s*datetime\(\s*'now'(\s*\))?/g;

/**
 * Stored format per column, from an EXACT census of the live db (every
 * non-null value counted) on 2026-08-06. Keyed by bare column name because
 * that is all a SQL snippet reliably gives us — where one name spans tables
 * with different verdicts, MIXED wins, since it is the conservative fix.
 *
 * Re-measure with a full COUNT/CASE query, never LIMIT-and-eyeball: the c221
 * sample called fetches.fetched_at "all ISO" when it is 8.5%.
 */
const COLUMN_FORMAT = {
  // uniform ISO — safe to fix by binding an ISO threshold, keeps the index
  discovered_at: 'iso',
  last_seen: 'iso',
  checked_at: 'iso',
  // MIXED — only datetime() on both sides is correct
  created_at: 'mixed',
  last_seen_at: 'mixed',
  fetched_at: 'mixed',
  request_started_at: 'mixed',
  started_at: 'mixed',
  ended_at: 'mixed',
  at: 'mixed',
  verified_at: 'mixed',
  added_at: 'mixed',
  // `ts` is all-ISO on the big event tables but has one stray sqlite value in
  // crawl_milestones, so it is treated as mixed.
  ts: 'mixed',
  // uniformly SQLITE format — these comparisons are ALREADY CORRECT and are
  // not defects. content_analysis.analyzed_at: 89,532 rows, 0 ISO. Recording
  // it stops the check reporting working code forever.
  analyzed_at: 'sqlite',
  // tables that exist but hold no rows: nothing can be misjudged today, and
  // wrapping costs nothing, so these are cheap latent fixes.
  snapshot_time: 'empty',
  computed_at: 'empty',
  last_crawl_at: 'empty',
  timestamp: 'empty'
};

/** Recommended fix for a site, given the column it compares. */
function recommendedFix(snippet) {
  const col = /([A-Za-z_]\w*)\s*(?:\)|\s)*(?:<=|>=|<|>)/.exec(String(snippet || ''));
  const name = col ? col[1] : null;
  const fmt = name ? COLUMN_FORMAT[name] : undefined;
  if (fmt === 'sqlite') return 'NOT A DEFECT — column is uniformly sqlite format, the comparison is already correct';
  if (fmt === 'iso') return 'bind an ISO threshold (keeps the index)';
  if (fmt === 'mixed') return 'wrap in datetime() — column holds BOTH formats, binding would be wrong';
  if (fmt === 'empty') return 'wrap in datetime() — table is empty, so this is a free latent fix';
  return 'unmeasured column — census it before choosing';
}

// --- pure core ---------------------------------------------------------------

/**
 * Find unwrapped column-vs-datetime('now') comparisons in one file's text.
 * Returns [{ line, snippet }].
 *
 * A left side of `datetime(x)` — i.e. text ending in `)` preceded by a
 * datetime( call — is already correct and is not reported.
 */
/**
 * If the identifier at `start` sits inside a function call, return that
 * function's name; otherwise null.
 *
 * Walks backwards counting paren depth, so it works for a call with
 * arguments in front of the column — strftime('%Y', ts) — which a fixed-width
 * look-back cannot see. The rule this serves is simple: a left-hand side that
 * is a FUNCTION CALL is not the c220 defect, because the defect is
 * specifically an unwrapped raw column meeting a formatted threshold.
 */
function enclosingFunction(src, start) {
  let depth = 0;
  for (let i = start - 1; i >= 0 && start - i < 200; i--) {
    const ch = src[i];
    if (ch === ')') depth++;
    else if (ch === '(') {
      if (depth === 0) {
        const name = /([A-Za-z_]\w*)\s*$/.exec(src.slice(Math.max(0, i - 40), i));
        return name ? name[1] : null;
      }
      depth--;
    }
  }
  return null;
}

function findBareComparisons(text) {
  // Strip comments first. Without this the check reports its own
  // documentation: the c220 write-up in ncdb's legacy-httpResponseCache
  // header quotes the broken comparison verbatim to explain it, and a tool
  // that flags the explanation of a bug as the bug is a tool nobody trusts.
  // Line and block comments are blanked rather than removed so line numbers
  // stay accurate.
  const src = String(text || '')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));
  const hits = [];
  let m;
  COMPARISON.lastIndex = 0;
  while ((m = COMPARISON.exec(src))) {
    const start = m.index;
    const lhs = m[1];

    // Is THIS left-hand side already wrapped? The regex starts matching at the
    // identifier, so a wrapped `datetime(expires_at) > …` yields lhs
    // "expires_at)" — the wrapper is the text immediately BEFORE the match.
    //
    // Checked strictly against what precedes this match, never a window of
    // surrounding lines: an earlier fix on the line above must not suppress a
    // real finding on the line below. (It did, until a test caught it.)
    if (/\)\s*$/.test(lhs) && enclosingFunction(src, start)) continue;

    const line = src.slice(0, start).split(/\r?\n/).length;
    const snippet = src.slice(start, start + m[0].length).replace(/\s+/g, ' ').trim();

    // Severity follows the THRESHOLD, not the column. `datetime('now')` with
    // no modifier is expiry semantics: everything expiring TODAY reads as
    // still-valid, which is up to a full extra day of staleness (the c220
    // response cache). With a modifier — datetime('now','-7 day') — only rows
    // landing on the boundary date are misclassified.
    const closedImmediately = Boolean(m[3]);
    hits.push({ line, snippet, severity: closedImmediately ? 'expiry' : 'window' });
  }
  return hits;
}

// --- I/O ---------------------------------------------------------------------

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir); } catch (_) { return out; }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.git' || name === 'dist') continue;
    const full = path.join(dir, name);
    let st;
    try { st = fs.statSync(full); } catch (_) { continue; }
    if (st.isDirectory()) walk(full, out);
    else if (/\.(js|ts)$/.test(name) && !/\.test\.(js|ts)$/.test(name)) out.push(full);
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const maxIdx = argv.indexOf('--max');
  const max = maxIdx >= 0 ? Number(argv[maxIdx + 1]) : null;

  const findings = [];
  for (const root of SEARCH_ROOTS) {
    for (const file of walk(root)) {
      if (file.includes('__tests__')) continue;
      if (file.endsWith(path.join('checks', 'timestamp-comparison.check.js'))) continue;
      const hits = findBareComparisons(fs.readFileSync(file, 'utf8'));
      for (const h of hits) {
        findings.push({ file: path.relative(ROOT, file).replace(/\\/g, '/'), ...h });
      }
    }
  }

  const expiry = findings.filter((f) => f.severity === 'expiry');
  const windowed = findings.filter((f) => f.severity !== 'expiry');

  if (asJson) {
    console.log(JSON.stringify({
      total: findings.length, expiry: expiry.length, window: windowed.length, max, findings
    }, null, 2));
  } else {
    console.log(`\n== timestamp-comparison check (the c220 defect class) ==`);
    console.log(`${findings.length} bare column-vs-datetime('now') comparisons:`);
    console.log(`  ${expiry.length} EXPIRY  — threshold is 'now' exactly; anything expiring today reads as still-valid`);
    console.log(`  ${windowed.length} window  — threshold has a modifier; only the boundary date is misclassified\n`);
    if (expiry.length) {
      console.log('  EXPIRY (fix these first):');
      for (const f of expiry) console.log(`    ${f.file}:${f.line}\n        ${f.snippet}`);
      console.log('');
    }
    if (windowed.length) {
      console.log('  window (grouped by the fix the measured column actually needs):');
      const byFix = new Map();
      for (const f of windowed) {
        const fix = recommendedFix(f.snippet);
        if (!byFix.has(fix)) byFix.set(fix, []);
        byFix.get(fix).push(f);
      }
      for (const [fix, group] of byFix) {
        console.log(`\n    ${group.length} site(s) -> ${fix}`);
        for (const f of group) console.log(`      ${f.file}:${f.line}  ${f.snippet}`);
      }
    }
    if (!findings.length) console.log('  none — every comparison normalizes both sides or binds a formatted threshold.');
    console.log(`\nFix: wrap the column in datetime(), or bind a threshold in the column's own`);
    console.log(`format. Prefer the bound parameter on large indexed tables — datetime(col)`);
    console.log(`is not sargable and will defeat an index.`);
  }

  if (max != null && findings.length > max) {
    console.error(`\nCHECK FAILED: ${findings.length} bare timestamp comparisons > ceiling ${max}. A new one leaked in — see the header of this file for why it is wrong.`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { findBareComparisons, recommendedFix };
