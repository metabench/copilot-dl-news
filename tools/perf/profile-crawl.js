#!/usr/bin/env node
'use strict';

/**
 * profile-crawl.js — attribute the per-page CPU cost of a crawl to named functions.
 *
 * WHY: cycle 21 established that ~20 ms/page of FIXED work (parse + link-extract +
 * overhead) dominates per-page cost and is why concurrency plateaus at 81% of ideal.
 * Knowing the total is not actionable; knowing WHICH functions spend it is.
 *
 * THE STARTUP PROBLEM: a fixture crawl spends several seconds loading modules, which in
 * a raw profile swamps the per-page work we actually care about. So this profiles at TWO
 * page counts and DIFFS the per-function self time. Startup is identical in both runs and
 * cancels out; what remains is attributable to the extra pages. (Same differencing trick
 * that isolated the DB share in cycle 21.)
 *
 *   node tools/perf/profile-crawl.js [--low 100] [--high 400] [--latency 2] [--top 18]
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const { startFixture } = require('./fixture-server');

const ROOT = path.resolve(__dirname, '..', '..');
const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`) || a === `--${n}`);
  if (!hit) return d;
  if (hit.includes('=')) return hit.split('=')[1];
  return process.argv[process.argv.indexOf(hit) + 1] ?? d;
};
const LOW = Number(arg('low', 100));
const HIGH = Number(arg('high', 400));
const LATENCY = Number(arg('latency', 2));
const TOP = Number(arg('top', 18));

// Roll a raw .cpuprofile into { "fn @ file": selfMs }.
function aggregate(profilePath) {
  const prof = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  const byId = new Map(prof.nodes.map((n) => [n.id, n]));
  const selfTicks = new Map();
  // timeDeltas[i] is the time *before* samples[i]; attribute it to that sample's node.
  for (let i = 0; i < prof.samples.length; i++) {
    const node = byId.get(prof.samples[i]);
    if (!node) continue;
    const dt = (prof.timeDeltas[i] || 0) / 1000; // us -> ms
    const cf = node.callFrame || {};
    const fn = cf.functionName || '(anonymous)';
    const url = (cf.url || '').replace(/^file:\/\/\//, '').replace(/\\/g, '/');
    const short = url.replace(/^.*\/(node_modules\/)?/, (m, nm) => (nm ? 'node_modules/' : ''));
    const key = `${fn} @ ${short || '(native)'}`;
    selfTicks.set(key, (selfTicks.get(key) || 0) + dt);
  }
  return selfTicks;
}

// Coarse buckets so the answer is actionable rather than a wall of frames.
function bucketOf(key) {
  const k = key.toLowerCase();
  if (/cheerio|parse5|htmlparser|domhandler|domutils|css-select|nth-check|boolbase/.test(k)) return 'HTML parse (cheerio/parse5)';
  if (/jsdom|nwsapi|cssstyle|saxes/.test(k)) return 'jsdom';
  if (/better-sqlite3|sqlite|statement|database/.test(k)) return 'DB (better-sqlite3)';
  if (/url|normali[sz]|punycode|whatwg/.test(k)) return 'URL handling';
  if (/regexp|match|replace|test @/.test(k)) return 'regex/string';
  if (/zlib|gzip|deflate|brotli/.test(k)) return 'compression';
  if (/json|stringify|parse @ /.test(k)) return 'JSON';
  if (/log|telemetry|console|emit/.test(k)) return 'logging/telemetry';
  if (/\(native\)|\(program\)|\(garbage collector\)|\(idle\)/.test(k)) return 'runtime (GC/native/idle)';
  return 'other app code';
}

function runProfiled(pages, tmpDir, tag) {
  return new Promise(async (resolve) => {
    const fx = await startFixture({ latencyMs: LATENCY, pageBytes: 15000, pages: Math.max(pages * 4, 400) });
    const profDir = path.join(tmpDir, `prof-${tag}`);
    fs.mkdirSync(profDir, { recursive: true });
    const dbPath = path.join(tmpDir, `prof-${tag}.db`);
    // async spawn — the fixture server is in THIS process; spawnSync would deadlock it.
    const child = spawn(process.execPath, [
      '--cpu-prof', '--cpu-prof-dir', profDir,
      path.join(ROOT, 'tools', 'perf', 'fixture-crawl-runner.js'),
      fx.url, '1', String(pages), dbPath, '1'
    ], { cwd: ROOT });
    child.stdout.on('data', () => {}); child.stderr.on('data', () => {});
    const kill = setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} }, 300000);
    child.on('close', async () => {
      clearTimeout(kill);
      const reqs = fx.stats().requests;
      await fx.close();
      const files = fs.existsSync(profDir) ? fs.readdirSync(profDir).filter((f) => f.endsWith('.cpuprofile')) : [];
      if (!files.length) return resolve({ pages, reqs, agg: null });
      const agg = aggregate(path.join(profDir, files[0]));
      resolve({ pages, reqs, agg });
    });
    child.on('error', () => { clearTimeout(kill); resolve({ pages, reqs: 0, agg: null }); });
  });
}

(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawlprof-'));
  console.log(`CPU profile diff: ${LOW} pages vs ${HIGH} pages, latency ${LATENCY}ms`);
  console.log('Startup cost is identical in both runs and cancels in the diff.\n');

  const lo = await runProfiled(LOW, tmpDir, 'lo');
  const hi = await runProfiled(HIGH, tmpDir, 'hi');
  console.log(`  low : ${lo.reqs} reqs, profile ${lo.agg ? 'captured' : 'MISSING'}`);
  console.log(`  high: ${hi.reqs} reqs, profile ${hi.agg ? 'captured' : 'MISSING'}`);
  if (!lo.agg || !hi.agg) { console.log('\nABORT: profile not captured.'); return; }

  const extraPages = hi.reqs - lo.reqs;
  if (extraPages < 50) { console.log(`\nABORT: only ${extraPages} extra pages — too few to attribute.`); return; }

  const keys = new Set([...lo.agg.keys(), ...hi.agg.keys()]);
  const diffs = [];
  for (const k of keys) {
    const d = (hi.agg.get(k) || 0) - (lo.agg.get(k) || 0);
    if (d > 0) diffs.push({ key: k, ms: d, perPage: d / extraPages });
  }
  diffs.sort((a, b) => b.ms - a.ms);
  const totalMs = diffs.reduce((a, b) => a + b.ms, 0);
  const totalPerPage = totalMs / extraPages;

  console.log(`\nAttributed to the extra ${extraPages} pages: ${totalMs.toFixed(0)} ms total = ${totalPerPage.toFixed(1)} ms/page\n`);
  console.log('=== BY BUCKET ===');
  const buckets = new Map();
  for (const d of diffs) {
    const b = bucketOf(d.key);
    buckets.set(b, (buckets.get(b) || 0) + d.ms);
  }
  for (const [b, ms] of [...buckets.entries()].sort((a, b2) => b2[1] - a[1])) {
    console.log(`  ${b.padEnd(30)} ${(ms / extraPages).toFixed(2).padStart(6)} ms/page  ${((ms / totalMs) * 100).toFixed(1).padStart(5)}%`);
  }

  // BY SOURCE FILE — cycle 22's keyword bucketer left 42.5% as "other app code", which
  // named nothing actionable. Rolling up by the owning file names the module directly
  // instead of guessing from function names.
  console.log(`\n=== BY SOURCE FILE (top ${TOP}) ===`);
  const byFile = new Map();
  for (const d of diffs) {
    const file = d.key.includes(' @ ') ? d.key.split(' @ ').slice(1).join(' @ ') : '(unknown)';
    byFile.set(file, (byFile.get(file) || 0) + d.ms);
  }
  const fileRows = [...byFile.entries()].sort((a, b) => b[1] - a[1]);
  for (const [file, ms] of fileRows.slice(0, TOP)) {
    console.log(`  ${(ms / extraPages).toFixed(2).padStart(6)} ms/page  ${((ms / totalMs) * 100).toFixed(1).padStart(5)}%  ${file.slice(0, 88)}`);
  }
  const namedFileMs = fileRows.filter(([f]) => f !== '(native)' && f !== '(unknown)').reduce((a, b) => a + b[1], 0);
  console.log(`  --- attributed to a named source file: ${((namedFileMs / totalMs) * 100).toFixed(1)}% ` +
    `(${(namedFileMs / extraPages).toFixed(2)} ms/page); the remainder is native/runtime frames.`);

  // Roll app code up by top-level area so the owning subsystem is obvious.
  console.log('\n=== BY AREA ===');
  const areaOf = (f) => {
    if (/^node_modules\//.test(f)) {
      const m = /^node_modules\/([^/]+)/.exec(f);
      return `dep: ${m ? m[1] : '?'}`;
    }
    if (f === '(native)' || f === '(unknown)') return 'native/runtime';
    const m = /(src\/[^/]+(?:\/[^/]+)?)\//.exec(f);
    return m ? m[1] : f;
  };
  const areas = new Map();
  for (const [file, ms] of fileRows) areas.set(areaOf(file), (areas.get(areaOf(file)) || 0) + ms);
  for (const [a, ms] of [...areas.entries()].sort((x, y) => y[1] - x[1]).slice(0, 14)) {
    console.log(`  ${(ms / extraPages).toFixed(2).padStart(6)} ms/page  ${((ms / totalMs) * 100).toFixed(1).padStart(5)}%  ${a}`);
  }

  console.log(`\n=== TOP ${TOP} FUNCTIONS (self time) ===`);
  for (const d of diffs.slice(0, TOP)) {
    console.log(`  ${d.perPage.toFixed(2).padStart(6)} ms/page  ${((d.ms / totalMs) * 100).toFixed(1).padStart(5)}%  ${d.key.slice(0, 92)}`);
  }

  console.log(`\nMACHINE ${JSON.stringify({
    low: LOW, high: HIGH, extraPages, totalPerPageMs: Number(totalPerPage.toFixed(2)),
    buckets: Object.fromEntries([...buckets.entries()].map(([b, ms]) => [b, Number((ms / extraPages).toFixed(2))]))
  })}`);

  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
})();
