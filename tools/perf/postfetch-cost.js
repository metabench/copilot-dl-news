#!/usr/bin/env node
'use strict';

/**
 * postfetch-cost.js — decompose the per-page POST-FETCH cost of a crawl.
 *
 * WHY: cycle 18 measured ~61 ms of per-page work that is neither network latency nor
 * download, and showed it caps concurrency scaling at 81% of ideal (3.23x instead of 4x).
 * That makes it the next real throughput lever — but only if we know WHICH part dominates.
 *
 * METHOD — differences between arms, run against the deterministic fixture:
 *   latency is set LOW (default 5 ms) so per-page PROCESSING dominates the measurement
 *   instead of being swamped by simulated network time.
 *
 *     per-page(DB on,  normal) = latency + parse + linkExtract + persist
 *     per-page(DB off, normal) = latency + parse + linkExtract
 *     per-page(DB on,  large)  = latency + parse(large) + linkExtract + persist
 *
 *   => persist      = (DB on, normal) - (DB off, normal)
 *   => parse-growth = (DB on, large)  - (DB on, normal)     [attributable to page size]
 *
 * Each arm is replicated and its own spread reported, so no difference is claimed that
 * is smaller than the instrument's noise — the failure mode that wasted cycles 13-17.
 *
 *   node tools/perf/postfetch-cost.js [--reps 3] [--pages 40] [--latency 5]
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
const REPS = Number(arg('reps', 3));
const PAGES = Number(arg('pages', 40));
const LATENCY = Number(arg('latency', 5));
// Discard the first replicate of each arm. Measured 2026-07-26: rep0 of the first arm
// runs ~60% slow (81.3 ms vs a stable 49-51 ms across reps 1-3) — cold OS file cache,
// cold V8, cold SQLite page cache. Including it inflated the arm spread to 55.6% while
// reps 1-3 alone spread 4.8%, and that artifact was misread in cycle 25 as "the machine
// slowed 2.5x", voiding a measurement that was actually fine. Warm-up runs are executed
// and thrown away, never averaged.
const WARMUP = Number(arg('warmup', 1));
const NORMAL_BYTES = 15000;
const LARGE_BYTES = 120000;

function runOnce({ fx, enableDb, tmpDir, tag, idx }) {
  return new Promise((resolve) => {
    fx.reset();
    const dbPath = path.join(tmpDir, `pf-${tag}-${idx}.db`);
    // async spawn only — the fixture server lives in THIS process, so spawnSync would
    // block the event loop and the child's requests could never be served.
    const child = spawn(process.execPath, [
      path.join(ROOT, 'tools', 'perf', 'fixture-crawl-runner.js'),
      fx.url, '1', String(PAGES), dbPath, enableDb ? '1' : '0'
    ], { cwd: ROOT });
    child.stdout.on('data', () => {}); child.stderr.on('data', () => {});
    const kill = setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) { /* timeout child kill best-effort — reviewed c206 */ } }, 180000);
    child.on('close', () => {
      clearTimeout(kill);
      const s = fx.stats();
      try { for (const suf of ['', '-wal', '-shm']) fs.rmSync(dbPath + suf, { force: true }); } catch (_) { /* bench tmp db cleanup — files may be locked on Windows — reviewed c206 */ }
      resolve({
        tag, idx, requests: s.requests,
        perPageMs: s.requests > 1 ? s.spanMs / (s.requests - 1) : null
      });
    });
    child.on('error', () => { clearTimeout(kill); resolve({ tag, idx, requests: 0, perPageMs: null }); });
  });
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const spreadPct = (xs) => (xs.length < 2 ? null : ((Math.max(...xs) - Math.min(...xs)) / mean(xs)) * 100);
// Sample standard deviation and standard error of the mean.
const sd = (xs) => {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};
const sem = (xs) => (xs.length < 2 ? null : sd(xs) / Math.sqrt(xs.length));

/**
 * Compare two arms properly instead of eyeballing a difference against the worst arm's
 * spread. Cycle 20 used that crude heuristic and it declared a 9.2 ms difference
 * "RESOLVABLE" at a 1.06x margin — too permissive, and I had to overrule my own tool.
 * A difference is claimed only when it exceeds 2x the combined standard error
 * (~95% confidence), and the band is always printed next to the number.
 */
function compare(label, aXs, bXs) {
  const diff = mean(bXs) - mean(aXs);
  const seA = sem(aXs), seB = sem(bXs);
  if (seA == null || seB == null) return { label, diff, band: null, resolvable: false };
  const band = 2 * Math.sqrt(seA * seA + seB * seB);
  return { label, diff, band, resolvable: Math.abs(diff) > band };
}

(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfcost-'));
  const arms = [
    { tag: 'db-on-normal', enableDb: true, bytes: NORMAL_BYTES },
    { tag: 'db-off-normal', enableDb: false, bytes: NORMAL_BYTES },
    { tag: 'db-on-large', enableDb: true, bytes: LARGE_BYTES }
  ];
  console.log(`post-fetch cost decomposition — latency=${LATENCY}ms, pages=${PAGES}, reps=${REPS}`);
  console.log(`normal page ${NORMAL_BYTES}B vs large page ${LARGE_BYTES}B, concurrency 1\n`);

  const results = new Map();
  for (const a of arms) results.set(a.tag, []);

  // Interleave arms so any machine-level drift hits all of them equally.
  // WARMUP reps run first and are DISCARDED (see the WARMUP comment above).
  for (let r = -WARMUP; r < REPS; r++) {
    const isWarmup = r < 0;
    for (const a of arms) {
      const fx = await startFixture({ latencyMs: LATENCY, pageBytes: a.bytes, pages: Math.max(PAGES * 4, 200) });
      const res = await runOnce({ fx, enableDb: a.enableDb, tmpDir, tag: a.tag, idx: r });
      await fx.close();
      if (!isWarmup) results.get(a.tag).push(res);
      console.log(`  ${isWarmup ? 'warm ' : 'rep' + r + ' '}${a.tag.padEnd(14)}: ${String(res.requests).padStart(4)} reqs  ` +
        `${res.perPageMs != null ? res.perPageMs.toFixed(1) + ' ms/page' : 'FAILED'}` +
        `${isWarmup ? '   (discarded)' : ''}`);
    }
  }

  console.log('\n=== PER-PAGE WALL COST (includes the ' + LATENCY + 'ms fixture latency) ===');
  const summary = {};
  for (const a of arms) {
    const ok = results.get(a.tag).filter((x) => x.perPageMs != null);
    if (!ok.length) { console.log(`${a.tag}: NO USABLE RUNS`); summary[a.tag] = null; continue; }
    const v = ok.map((x) => x.perPageMs);
    summary[a.tag] = { mean: mean(v), spreadPct: spreadPct(v), n: ok.length };
    console.log(`${a.tag.padEnd(14)}: ${mean(v).toFixed(1)} ms/page  (spread ${spreadPct(v) != null ? spreadPct(v).toFixed(1) + '%' : 'n/a'}, n=${ok.length})`);
  }

  const raw = (tag) => results.get(tag).filter((x) => x.perPageMs != null).map((x) => x.perPageMs);
  const onXs = raw('db-on-normal'), offXs = raw('db-off-normal'), bigXs = raw('db-on-large');

  // Differences are judged against 2x the combined standard error, printed inline, so a
  // claim can never be read without its uncertainty. (Cycle 20's worst-arm-spread
  // heuristic was too permissive and had to be overruled by hand.)
  const persist = compare('PERSISTENCE (DB write) share', offXs, onXs);
  const parseGrowth = compare(`PARSE growth ${NORMAL_BYTES}B -> ${LARGE_BYTES}B (8x)`, onXs, bigXs);

  for (const c of [persist, parseGrowth]) {
    if (c.band == null) { console.log(`\n${c.label}: insufficient reps`); continue; }
    const pct = onXs.length ? (c.diff / mean(onXs)) * 100 : NaN;
    console.log(`\n${c.label}: ${c.diff.toFixed(1)} ms/page` + (isNaN(pct) ? '' : ` (${pct.toFixed(0)}% of per-page cost)`));
    console.log(`  95% band: +/-${c.band.toFixed(1)} ms  =>  ${c.resolvable ? 'RESOLVABLE' : 'NOT RESOLVABLE — do not conclude'}` +
      `  [margin ${(Math.abs(c.diff) / c.band).toFixed(2)}x]`);
  }
  if (offXs.length) {
    console.log(`\nNON-PERSIST processing (parse + link-extract + overhead): ~${(mean(offXs) - LATENCY).toFixed(1)} ms/page`);
  }
  console.log(`\nMACHINE ${JSON.stringify({
    latency: LATENCY, pages: PAGES, reps: REPS, summary,
    persist: { diff: Number(persist.diff.toFixed(2)), band: persist.band != null ? Number(persist.band.toFixed(2)) : null, resolvable: persist.resolvable },
    parseGrowth: { diff: Number(parseGrowth.diff.toFixed(2)), band: parseGrowth.band != null ? Number(parseGrowth.band.toFixed(2)) : null, resolvable: parseGrowth.resolvable }
  })}`);

  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* bench tmp dir cleanup — reviewed c206 */ }
})();
