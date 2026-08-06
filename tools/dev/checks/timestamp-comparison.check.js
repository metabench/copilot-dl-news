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
 * SCOPE. 64 columns in the live db hold ISO values, including the largest
 * tables (links.discovered_at 4.9M rows, queue_events.ts 1.7M, urls 1.8M).
 * Several are MIXED — urls.created_at sampled 164 ISO / 36 SQLite — so the
 * same query can be right for one row and wrong for the next.
 *
 * THE RULE THIS CHECKS. A column compared against datetime('now'…) must be
 * wrapped in datetime() so both sides are normalized. Wrapping is harmless
 * when the column is already in SQLite format, so the rule is safe to apply
 * everywhere and needs no per-column knowledge.
 *
 * THE COST, STATED HONESTLY. datetime(col) is not sargable — it defeats an
 * index on col. On small tables that is free; on links (4.9M rows) or
 * queue_events (1.7M) it is not. The index-preserving alternative is to bind
 * a threshold computed in the SAME format the column stores, e.g.
 * `WHERE discovered_at > ?` with an ISO string parameter. Prefer that on hot,
 * indexed paths; prefer datetime() wrapping for correctness elsewhere. Either
 * satisfies this check — a bound parameter has no datetime('now') in the SQL
 * at all.
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
      console.log('  window:');
      for (const f of windowed) console.log(`    ${f.file}:${f.line}  ${f.snippet}`);
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

module.exports = { findBareComparisons };
