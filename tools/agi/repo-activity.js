#!/usr/bin/env node
'use strict';

/**
 * repo-activity.js — snapshot per-repo commit activity into a committed JSON
 * (docs/agi/progress/repo-activity.json) for the progress SVG's repo lanes.
 *
 * WHY A SNAPSHOT FILE: progress.svg is a pure function of COMMITTED inputs
 * (ledger stanzas + annotations + this file) — that is what makes the
 * progress-svg-staleness probe an exact byte-compare. Reading live git history
 * at render time would make the picture depend on uncommitted machine state,
 * so the git read happens HERE, once, and its result is committed like any
 * other data.
 *
 * Window: [earliest stanza date, latest stanza date] — the recorded loop era.
 * Repo list: config/repo-scope.json (same source the repo-scope probe checks),
 * statuses "in" + "consume-only". A repo without .git gets a `note` instead of
 * counts — rendered as an explicit warning lane, because the unversioned repo
 * is the case that most needs to stay visible (see repo-scope.json history).
 *
 * Known lag, by design: the ritual runs this BEFORE the cycle's closing commit,
 * so a cycle's own commit appears in the NEXT cycle's snapshot.
 *
 *   node tools/agi/repo-activity.js          # write the snapshot
 *   node tools/agi/repo-activity.js --print  # print without writing
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_ACTIVITY = path.join(ROOT, 'docs', 'agi', 'progress', 'repo-activity.json');
const SCOPE_PATH = path.join(ROOT, 'config', 'repo-scope.json');
const { parseCycleStanzas, DEFAULT_LEDGER } = require('./progress-svg');

/** [minDate, maxDate] over stanza `date` fields (YYYY-MM-DD strings sort lexically). */
function windowFromCycles(cycles) {
  const dates = cycles.map((c) => c.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''))).sort();
  return dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null;
}

/** Bucket YYYY-MM-DD strings -> sorted [[date, count], ...] (deterministic order). */
function bucketDates(dateStrings) {
  const m = new Map();
  for (const d of dateStrings) if (/^\d{4}-\d{2}-\d{2}$/.test(d)) m.set(d, (m.get(d) || 0) + 1);
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

function gitDatesInWindow(repoDir, from, to) {
  const out = execFileSync('git', [
    '-C', repoDir, 'log', `--since=${from}T00:00:00`, `--until=${to}T23:59:59`,
    '--pretty=%cd', '--date=short'
  ], { encoding: 'utf8', windowsHide: true });
  return out.split('\n').filter(Boolean);
}

function buildActivity() {
  const scope = JSON.parse(fs.readFileSync(SCOPE_PATH, 'utf8'));
  const { cycles } = parseCycleStanzas(fs.readFileSync(DEFAULT_LEDGER, 'utf8'));
  const window = windowFromCycles(cycles);
  if (!window) return { window: null, repos: [] };
  const repoRoot = path.resolve(ROOT, scope.root || '..'); // scope.root is relative to the REPO root (same as check-repo-scope.js)

  const repos = [];
  for (const e of scope.entries) {
    if (e.status !== 'in' && e.status !== 'consume-only') continue; // excluded/out repos are not lanes
    const dir = path.join(repoRoot, e.name);
    if (!fs.existsSync(path.join(dir, '.git'))) {
      repos.push({ name: e.name, status: e.status, note: 'no .git', days: [], total: 0 });
      continue;
    }
    let days, note;
    try {
      days = bucketDates(gitDatesInWindow(dir, window.from, window.to));
    } catch (err) {
      days = []; note = `git log failed: ${String(err.message || err).slice(0, 80)}`;
    }
    const total = days.reduce((a, [, n]) => a + n, 0);
    const row = { name: e.name, status: e.status, days, total };
    if (note) row.note = note;
    repos.push(row);
  }
  // Lanes render "in" repos always (an idle lane is information); consume-only only when active.
  const kept = repos.filter((r) => r.status === 'in' || r.total > 0);
  const hidden = repos.filter((r) => !(r.status === 'in' || r.total > 0)).map((r) => r.name);
  return { window, repos: kept, hiddenZeroConsumeOnly: hidden };
}

function main() {
  const activity = buildActivity();
  const json = JSON.stringify(activity, null, 2) + '\n';
  if (process.argv.includes('--print')) { process.stdout.write(json); return; }
  fs.mkdirSync(path.dirname(DEFAULT_ACTIVITY), { recursive: true });
  fs.writeFileSync(DEFAULT_ACTIVITY, json);
  const t = activity.repos.reduce((a, r) => a + r.total, 0);
  console.log(`wrote ${path.relative(ROOT, DEFAULT_ACTIVITY)} — ${activity.repos.length} lanes, ${t} commits in ${activity.window ? `${activity.window.from}..${activity.window.to}` : 'n/a'}${activity.hiddenZeroConsumeOnly.length ? ` (+${activity.hiddenZeroConsumeOnly.length} zero-activity consume-only repos hidden)` : ''}`);
}

module.exports = { windowFromCycles, bucketDates, buildActivity, DEFAULT_ACTIVITY };
if (require.main === module) main();
