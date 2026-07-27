#!/usr/bin/env node
'use strict';

/**
 * churn-scan.js — code-hotspot churn metrics from git history, no SaaS
 * (RB-004's residue: js-scan --ripple-analysis/--call-graph already cover
 * fan-in/out; churn was the unaddressed half).
 *
 * A hotspot is a file that is BOTH heavily coupled (js-scan fan-in) AND
 * heavily changed (this tool). This tool answers the second axis: over a
 * window, which files churn most — by commit count, lines touched, author
 * spread, and recency — so the pair identifies "changes a lot AND everything
 * depends on it" = where bugs and review effort concentrate.
 *
 *   node tools/dev/churn-scan.js [--since "90 days ago"] [--top 20]
 *        [--path src] [--ext .js,.ts] [--json]
 *
 * Parsing (parseNumstatLog) is a PURE function over `git log --numstat`
 * text, unit-tested without git. The CLI just shells out and formats.
 */

const { execSync } = require('child_process');
const path = require('path');

// --- pure core ---------------------------------------------------------------

// Parse `git log --numstat --format=%x01%H%x01%an%x01%aI` output into per-file
// aggregates. The %x01 (SOH) delimiter can't appear in names/emails, so commit
// header lines are unambiguous vs numstat rows ("<add>\t<del>\t<path>").
// Binary files show "-\t-\t<path>" — counted as a commit-touch, 0 lines.
function parseNumstatLog(text, options = {}) {
  const extSet = options.exts && options.exts.length ? new Set(options.exts) : null;
  const pathPrefix = options.pathPrefix || null;
  const files = new Map();
  let cur = null;

  const ensure = (file) => {
    let e = files.get(file);
    if (!e) {
      e = { file, commits: 0, insertions: 0, deletions: 0, authors: new Set(), firstAt: null, lastAt: null };
      files.set(file, e);
    }
    return e;
  };

  for (const rawLine of String(text || '').split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (!line) continue;
    if (line[0] === '') {
      const [, hash, author, iso] = line.split('');
      cur = { hash, author, iso };
      continue;
    }
    // numstat row
    const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (!m || !cur) continue;
    let file = m[3];
    // Rename form "old => new" or "dir/{old => new}/x": keep the new path.
    if (file.includes(' => ')) {
      file = file
        .replace(/\{[^}]*=>\s*([^}]*)\}/g, '$1')
        .replace(/^.*\s=>\s/, '')
        .replace(/\/\//g, '/');
    }
    if (pathPrefix && !file.startsWith(pathPrefix)) continue;
    if (extSet && !extSet.has(path.extname(file))) continue;
    const e = ensure(file);
    e.commits += 1;
    e.insertions += m[1] === '-' ? 0 : Number(m[1]);
    e.deletions += m[2] === '-' ? 0 : Number(m[2]);
    if (cur.author) e.authors.add(cur.author);
    if (cur.iso) {
      if (!e.firstAt || cur.iso < e.firstAt) e.firstAt = cur.iso;
      if (!e.lastAt || cur.iso > e.lastAt) e.lastAt = cur.iso;
    }
  }

  return Array.from(files.values()).map((e) => ({
    file: e.file,
    commits: e.commits,
    linesChanged: e.insertions + e.deletions,
    insertions: e.insertions,
    deletions: e.deletions,
    authors: e.authors.size,
    firstAt: e.firstAt,
    lastAt: e.lastAt,
    // Composite churn score: commits are the primary risk signal (each is a
    // chance to regress); lines dampened by log to stop one huge reformat
    // dominating; author spread is a coordination-risk multiplier.
    score: Number((e.commits * (1 + Math.log10(1 + e.insertions + e.deletions)) * (1 + 0.1 * (e.authors.size - 1))).toFixed(2))
  })).sort((a, b) => b.score - a.score);
}

// --- CLI ---------------------------------------------------------------------

function getArg(argv, name, dflt) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
}

function main() {
  const argv = process.argv.slice(2);
  const since = getArg(argv, '--since', '90 days ago');
  const top = Number(getArg(argv, '--top', 20));
  const pathPrefix = getArg(argv, '--path', null);
  const extArg = getArg(argv, '--ext', null);
  const exts = extArg ? extArg.split(',').map((s) => (s.startsWith('.') ? s : '.' + s)) : null;
  const asJson = argv.includes('--json');

  let log;
  try {
    log = execSync(
      `git log --since="${since}" --numstat --format=%x01%H%x01%an%x01%aI --no-merges`,
      { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, cwd: path.resolve(__dirname, '..', '..') }
    );
  } catch (err) {
    console.error('git log failed:', err.message);
    process.exit(2);
  }

  const ranked = parseNumstatLog(log, { exts, pathPrefix });
  const shown = ranked.slice(0, top);

  if (asJson) {
    console.log(JSON.stringify({
      since, pathPrefix, exts, totalFilesTouched: ranked.length, top: shown
    }, null, 2));
    return;
  }

  console.log(`\n== Code churn hotspots (since ${since}${pathPrefix ? ', path=' + pathPrefix : ''}${exts ? ', ext=' + exts.join(',') : ''}) ==`);
  console.log(`${ranked.length} files touched; top ${shown.length} by churn score:\n`);
  console.log('  score  commits  lines  auth  file');
  for (const r of shown) {
    console.log(
      `  ${String(r.score).padStart(6)}  ${String(r.commits).padStart(7)}  ${String(r.linesChanged).padStart(5)}  ${String(r.authors).padStart(4)}  ${r.file}`
    );
  }
  console.log('\nHotspot = high churn here AND high fan-in from js-scan --ripple-analysis <file>.');
}

if (require.main === module) main();

module.exports = { parseNumstatLog };
