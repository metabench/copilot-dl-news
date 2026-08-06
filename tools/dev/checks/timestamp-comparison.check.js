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
 * Stored format per TABLE.COLUMN, from an EXACT census of the live db (every
 * non-null value counted), 2026-08-06 / 2026-08-07.
 *
 * KEYED BY TABLE, not by bare column name, and that is not fussiness. c222
 * keyed this by column alone and recorded `discovered_at: 'iso'` from
 * links (4,874,880 rows, all ISO). The only site comparing a `discovered_at`
 * is hubGapAnalysis, which reads **site_url_patterns** — 72 rows, 100% SQLITE
 * format, i.e. already correct. The tool therefore recommended binding an ISO
 * threshold on a query where that would have BROKEN it. One name, two tables,
 * opposite answers.
 *
 * Re-measure with a full COUNT/CASE query, never LIMIT-and-eyeball: the c221
 * sample called fetches.fetched_at "all ISO" when it is 8.5%.
 */
const COLUMN_FORMAT = {
  // uniform ISO — binding an ISO threshold is correct AND keeps the index
  'links.discovered_at': 'iso',
  'queue_events.ts': 'iso',
  'queue_events_enhanced.ts': 'iso',
  'discovery_events.discovered_at': 'iso',
  'task_events.ts': 'iso',
  'url_aliases.checked_at': 'iso',
  'problem_clusters.last_seen': 'iso',
  'hub_validations.expires_at': 'iso',

  // NORMALISED in cycle 224 (owner-approved live-db write). These fifteen
  // held BOTH formats; they hold ISO only now — 2,117,429 rows converted,
  // instant-preserving, confirmed by an exact re-census reporting zero mixed
  // columns. They are bindable.
  //
  // Direction was ISO, not SQLite's space form, and that is not the obvious
  // choice: converting the other way would have made every existing
  // `col > datetime('now')` correct with no code change, but JavaScript
  // parses "YYYY-MM-DD HH:MM:SS" as LOCAL time, so every value would have
  // silently shifted by the timezone offset when read back.
  'urls.created_at': 'iso',
  'urls.last_seen_at': 'iso',
  'http_responses.fetched_at': 'iso',
  'http_responses.request_started_at': 'iso',
  'fetches.fetched_at': 'iso',
  'fetches.request_started_at': 'iso',
  'crawl_jobs.started_at': 'iso',
  'crawl_jobs.ended_at': 'iso',
  'errors.at': 'iso',
  'crawl_milestones.ts': 'iso',
  'place_page_mappings.last_seen_at': 'iso',
  'place_page_mappings.verified_at': 'iso',
  'crawl_runs.ended_at': 'iso',
  'news_websites.added_at': 'iso',
  'place_hub_audit.created_at': 'iso',

  'latest_fetch.ts': 'iso',              // a VIEW over fetches — followed automatically

  // uniformly SQLITE format — ALREADY CORRECT, not defects. Recording these
  // stops the check reporting working code forever.
  'content_analysis.analyzed_at': 'sqlite',   // 89,532 rows, 0 ISO
  'site_url_patterns.discovered_at': 'sqlite', // 72 rows, 0 ISO
  'url_classification_patterns.updated_at': 'sqlite', // 1,811 rows, 0 ISO
  'urls.fetched_at': 'sqlite',                // 165,990 rows, 0 ISO
  'content_storage.created_at': 'sqlite',     // 205,942 rows, 0 ISO

  // exist but hold no rows: nothing can be misjudged today and wrapping is
  // free, so these are cheap latent fixes
  'coverage_snapshots.snapshot_time': 'empty',
  'user_events.timestamp': 'empty',
  'rate_limits.updated_at': 'empty',
  'recommendations.computed_at': 'empty',
  'crawl_schedules.last_crawl_at': 'empty',
  'user_sessions.expires_at': 'empty',
  'audit_log.created_at': 'empty',

  // table does not exist in the live schema at all — the code path is dead.
  // These are NOT timestamp debt; they are a separate finding about how much
  // of the ncdb adapter surface targets tables this deployment never created.
  'alert_history.sent_at': 'absent',
  'breaking_news.expires_at': 'absent',
  'test_results.timestamp': 'absent',
  'crawl_jobs.created_at': 'absent',
  'content_analysis.created_at': 'absent',
  'billing_events.created_at': 'absent',
  'healing_events.created_at': 'absent',
  'workspace_activity.created_at': 'absent',
  'user_push_subscriptions.created_at': 'absent',
  'user_notifications.created_at': 'absent'
};

/**
 * Is this finding actually actionable? A comparison on a uniformly-sqlite
 * column is already correct, and one against a table the live schema does not
 * have cannot misjudge anything. Counting those as debt inflates the number
 * exactly the way the raw ncdb-debt total did before c217 split it.
 */
function isActionable(finding) {
  const fix = recommendedFix(finding.snippet, finding.table);
  return !/NOT A DEFECT|DEAD PATH/.test(fix);
}

/**
 * Recommended fix for a site. `table` comes from resolveTable() and may be
 * null when the SQL could not be attributed — in which case the tool says so
 * rather than guessing from the column name, which is exactly the mistake
 * that produced a wrong recommendation in c222.
 */
function recommendedFix(snippet, table) {
  const col = /([A-Za-z_]\w*)\s*(?:\)|\s)*(?:<=|>=|<|>)/.exec(String(snippet || ''));
  const name = col ? col[1] : null;
  if (!name) return 'could not parse the column — inspect by hand';
  if (!table) return `unattributed table for "${name}" — find the table, then census it`;

  const fmt = COLUMN_FORMAT[`${table}.${name}`];
  if (fmt === 'sqlite') return 'NOT A DEFECT — column is uniformly sqlite format, the comparison is already correct';
  if (fmt === 'absent') return 'DEAD PATH — the table does not exist in the live schema';
  if (fmt === 'iso') return 'bind an ISO threshold (keeps the index)';
  if (fmt === 'mixed') return 'wrap in datetime() — column holds BOTH formats, binding would be wrong';
  if (fmt === 'empty') return 'wrap in datetime() — table is empty, so this is a free latent fix';
  return `unmeasured: ${table}.${name} — census it exactly before choosing`;
}

/**
 * Resolve which table a comparison at `start` reads, by scanning backwards for
 * the nearest FROM / JOIN / UPDATE / DELETE FROM and honouring table aliases
 * (`FROM http_responses hr` … `hr.fetched_at`).
 *
 * Returns null when it cannot tell. Null is a useful answer — see
 * recommendedFix, which refuses to guess rather than repeating the c222 error.
 */
function resolveTable(src, start, snippet) {
  const text = String(src || '').slice(Math.max(0, start - 2000), start);
  const aliases = new Map();
  let order = [];
  const re = /\b(?:FROM|JOIN|UPDATE|INTO)\s+([A-Za-z_]\w*)(?:\s+(?:AS\s+)?([A-Za-z_]\w*))?/gi;
  let m;
  while ((m = re.exec(text))) {
    const table = m[1];
    const alias = m[2];
    // Skip SQL keywords that can follow FROM-like words in these queries.
    if (/^(SELECT|WHERE|SET|VALUES|ON|AND|OR)$/i.test(table)) continue;
    order.push(table);
    if (alias && !/^(WHERE|SET|ON|GROUP|ORDER|LIMIT|HAVING|AND|OR|VALUES|AS)$/i.test(alias)) {
      aliases.set(alias.toLowerCase(), table);
    }
  }
  if (!order.length) return null;

  // Alias-qualified column: `hv.expires_at` -> whatever hv was bound to.
  const qualified = /([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*(?:\)|\s)*(?:<=|>=|<|>)/.exec(String(snippet || ''));
  if (qualified) {
    const prefix = qualified[1].toLowerCase();
    if (aliases.has(prefix)) return aliases.get(prefix);
    // The prefix may itself be a table name rather than an alias.
    const direct = order.find((t) => t.toLowerCase() === prefix);
    if (direct) return direct;
    return null; // qualified by something we cannot resolve — do not guess
  }
  return order[order.length - 1];
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
    hits.push({
      line,
      snippet,
      severity: closedImmediately ? 'expiry' : 'window',
      table: resolveTable(src, start, snippet)
    });
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
    const act = findings.filter(isActionable);
    console.log(`\n== timestamp-comparison check (the c220 defect class) ==`);
    console.log(`${findings.length} bare column-vs-datetime('now') comparisons, of which ${act.length} are ACTIONABLE.`);
    console.log(`(${findings.length - act.length} are already correct — uniformly sqlite columns — or target tables this schema does not have.)`);
    console.log(`${findings.length} raw hits by threshold severity:`);
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
        const fix = recommendedFix(f.snippet, f.table);
        if (!byFix.has(fix)) byFix.set(fix, []);
        byFix.get(fix).push(f);
      }
      for (const [fix, group] of byFix) {
        console.log(`\n    ${group.length} site(s) -> ${fix}`);
        for (const f of group) console.log(`      ${f.file}:${f.line}  [${f.table || '?'}]  ${f.snippet}`);
      }
    }
    if (!findings.length) console.log('  none — every comparison normalizes both sides or binds a formatted threshold.');
    console.log(`\nFix: wrap the column in datetime(), or bind a threshold in the column's own`);
    console.log(`format. Prefer the bound parameter on large indexed tables — datetime(col)`);
    console.log(`is not sargable and will defeat an index.`);
  }

  // The ratchet guards ACTIONABLE findings, not the raw count.
  //
  // Changed 2026-08-07 (cycle 223), deliberately, for the reason c218 re-aimed
  // the ncdb ratchet: of 62 raw hits, 17 were on columns that are uniformly
  // sqlite format (already correct) and 17 targeted tables the live schema
  // does not have. Guarding the raw total would have counted 34 non-problems
  // as debt and made "fixing" working code look like progress.
  const actionable = findings.filter(isActionable);
  if (max != null && actionable.length > max) {
    console.error(`\nCHECK FAILED: ${actionable.length} ACTIONABLE bare timestamp comparisons > ceiling ${max} (raw hits ${findings.length}). A new one leaked in — see the header of this file for why it is wrong.`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { findBareComparisons, recommendedFix, resolveTable, COLUMN_FORMAT };
