#!/usr/bin/env node
'use strict';

/**
 * placeholder-arity.check.js — catch a prepared statement whose `?` count does
 * not match what its caller binds.
 *
 *   node tools/dev/checks/placeholder-arity.check.js
 *   node tools/dev/checks/placeholder-arity.check.js --json
 *   node tools/dev/checks/placeholder-arity.check.js --max 0    # ratchet
 *
 * WHY THIS EXISTS. In cycle 225 a mechanical edit converted four statements in
 * ncdb's legacy-crawlObserverUiQueries from a literal SQLite modifier
 * (`datetime('now','-24 hours')`) to a bound `?`. Their callers were `.get()`
 * and `.all()` with NO arguments, because there had never been an argument to
 * pass. tsc was clean. All 963 ncdb tests passed. Those queries would have
 * bound NULL, compared every row against NULL, and returned ZERO ROWS FOREVER
 * on a live dashboard — silently.
 *
 * Neither a typechecker nor a test suite can see inside a SQL string. This can.
 *
 * WHAT IT DOES NOT DO, deliberately. It reports only where BOTH sides are
 * statically knowable, so a finding is a finding rather than a guess. It stays
 * silent when:
 *   - the SQL is interpolated (`${...}`) — placeholder count is not fixed
 *   - the caller spreads (`...params`) — arity is not fixed
 *   - named parameters (`@name`, `:name`, `$name`) are used — a single object
 *     is bound, so counting positional args proves nothing
 *   - the statement is prepared and returned/stored rather than called inline
 *     — its arguments arrive somewhere this check cannot see
 *
 * That last exclusion is real coverage lost: legacy-ui-errors prepares a
 * statement and hands it to a caller, and one of the c225 sites was exactly
 * that shape. A static check catches the inline majority; the discipline of
 * reading call sites after a SQL edit still carries the rest.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');

const SEARCH_ROOTS = [
  path.join(ROOT, 'src'),
  path.join(ROOT, 'tools'),
  path.resolve(ROOT, '..', 'news-crawler-db', 'src')
];

// --- pure core ---------------------------------------------------------------

/** Count top-level comma-separated arguments in an argument list body. */
function countArgs(body) {
  const text = String(body || '').trim();
  if (!text) return 0;
  let depth = 0;
  let count = 1;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) count++;
  }
  return count;
}

/** Count `?` placeholders in SQL, ignoring any inside quoted literals. */
function countPlaceholders(sql) {
  const text = String(sql || '');
  let quote = null;
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === '?') n++;
  }
  return n;
}

/**
 * Find prepare(...).get|all|run(...) chains whose placeholder count and
 * argument count are BOTH statically known and disagree.
 *
 * Returns [{ line, placeholders, args, method, snippet }].
 */
function findArityMismatches(text) {
  const src = String(text || '')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));

  const hits = [];
  // prepare( <sql> ) . method ( <args> )
  //
  // The string body must be ESCAPE-AWARE. A naive non-greedy match ends the
  // SQL at the first matching quote character, so
  // `db.prepare('… VALUES (?, datetime(\'now\'))')` terminates early and the
  // pattern then runs on across real code into a later quote — which produced
  // 40 confident, entirely bogus findings on this check's first run.
  const re = new RegExp(
    '\\.prepare\\s*\\(\\s*(?:'
      + '`((?:[^`\\\\]|\\\\.)*)`'      // backtick body -> group 1
      + "|'((?:[^'\\\\]|\\\\.)*)'"     // single body   -> group 2
      + '|"((?:[^"\\\\]|\\\\.)*)"'     // double body   -> group 3
    + ')\\s*\\)\\s*\\.\\s*(get|all|run|pluck|iterate)\\s*\\(',
    'g'
  );
  let m;
  while ((m = re.exec(src))) {
    const isTemplate = m[1] !== undefined;
    const sql = m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]);
    // Interpolated SQL: the placeholder count is not fixed.
    if (isTemplate && /\$\{/.test(sql)) continue;
    // Named parameters bind an object; positional counting proves nothing.
    if (/[@:$][A-Za-z_]\w*/.test(sql)) continue;

    const placeholders = countPlaceholders(sql);

    // Read the argument list that follows, balancing parens.
    const start = re.lastIndex;
    let depth = 1;
    let i = start;
    let quote = null;
    for (; i < src.length && depth > 0; i++) {
      const ch = src[i];
      if (quote) {
        if (ch === '\\') { i++; continue; }
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
    }
    const argBody = src.slice(start, i - 1);
    // A spread makes arity unknowable.
    if (/\.\.\./.test(argBody)) continue;

    const args = countArgs(argBody);
    if (placeholders === args) continue;

    hits.push({
      line: src.slice(0, m.index).split(/\r?\n/).length,
      placeholders,
      args,
      method: m[4],
      snippet: sql.replace(/\s+/g, ' ').trim().slice(0, 90)
    });
  }
  return hits;
}

// --- I/O ---------------------------------------------------------------------

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir); } catch (_) { return out; }
  for (const name of entries) {
    if (['node_modules', '.git', 'dist', 'tmp'].includes(name)) continue;
    const full = path.join(dir, name);
    let st;
    try { st = fs.statSync(full); } catch (_) { continue; }
    // Test files are excluded, as in the sibling checks — and here it is not
    // merely convention: this check's OWN tests embed deliberately-broken
    // statements as string fixtures, and it dutifully reported them.
    if (st.isDirectory()) { if (name === '__tests__') continue; walk(full, out); }
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
      if (file.endsWith(path.join('checks', 'placeholder-arity.check.js'))) continue;
      for (const h of findArityMismatches(fs.readFileSync(file, 'utf8'))) {
        findings.push({ file: path.relative(ROOT, file).replace(/\\/g, '/'), ...h });
      }
    }
  }

  if (asJson) {
    console.log(JSON.stringify({ total: findings.length, max, findings }, null, 2));
  } else {
    console.log('\n== placeholder-arity check (the c225 near-miss class) ==');
    console.log(`${findings.length} statement(s) where the ? count and the bound argument count disagree.\n`);
    for (const f of findings) {
      console.log(`  ${f.file}:${f.line}  ${f.placeholders} placeholder(s) vs ${f.args} arg(s) to .${f.method}()`);
      console.log(`      ${f.snippet}`);
    }
    if (!findings.length) {
      console.log('  none — every statically-checkable statement binds what it asks for.');
    }
    console.log('\nA statement with more ? than arguments binds NULL and matches nothing,');
    console.log('silently. Interpolated SQL, spread args and named parameters are skipped');
    console.log('on purpose — see the header for what this check cannot see.');
  }

  if (max != null && findings.length > max) {
    console.error(`\nCHECK FAILED: ${findings.length} arity mismatches > ceiling ${max}.`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { findArityMismatches, countArgs, countPlaceholders };
