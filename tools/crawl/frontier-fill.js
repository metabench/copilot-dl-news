#!/usr/bin/env node
'use strict';

/**
 * frontier-fill.js — sustain ~1.8 MB/s onto THIS machine by draining the DB
 * frontier from MANY hosts CONCURRENTLY, continuously.
 *
 * Why (2026-07-20, owner: "see 1.8 MB/s from the start"): a single-host
 * frontier drain is politeness-throttled to ~0.25 MB/s and leaves the pipe
 * idle between legs (bursty: 4 MB/s spikes, 0.27 MB/s sustained). run-multi
 * fetches N hosts at once (each its own forked job); looping it — hydrate all
 * hosts, run-multi concurrently, repeat — keeps the pipe full so the
 * aggregate approaches the cap. Politeness is preserved per host (own rate
 * limit) AND globally (the 1.8 MB/s cap).
 *
 *   node tools/crawl/frontier-fill.js \
 *     --hosts www.theguardian.com,www.bbc.com,apnews.com,www.aljazeera.com,www.npr.org,www.dw.com \
 *     --per-host 25 --duration-ms 3600000 [--port 3170]
 *
 * Managed via the bridge (start-managed) so it survives / is stoppable.
 * Writes progress to state/frontier-fill-status.json each round.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const STATE = path.join(ROOT, 'tools', 'dev-bridge', 'state');
const STATUS = path.join(STATE, 'frontier-fill-status.json');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
let HOSTS = String(arg('--hosts', '')).split(/[,|]/).map((s) => s.trim()).filter(Boolean);
const AUTO_HOSTS = Math.max(1, Math.min(30, Number(arg('--auto-hosts', 12)))); // when --hosts is omitted, drain this many top proven-crawlable hosts
const PER_HOST = Math.max(1, Math.min(100, Number(arg('--per-host', 25))));
const DURATION = Number(arg('--duration-ms', 3600000));
const PORT = Number(arg('--port', 3170));
// Safety pacing (see the busy-loop post-mortem below):
const MIN_ROUND_MS = Math.max(1000, Number(arg('--min-round-ms', 5000))); // never start rounds faster than this
const RUN_TIMEOUT_MS = Math.max(30000, Number(arg('--run-timeout-ms', 300000))); // bound run-multi so a hung server can't starve the stop-file check
const MAX_EMPTY = Math.max(2, Number(arg('--max-empty', 6))); // consecutive no-work rounds before we give up (frontier drained or server sick)

// --hosts omitted → discover the top proven-crawlable frontier hosts (read-only
// DB, in THIS process — the ~2s GROUP BY must never touch the server loop). This
// drains a BROAD publisher set so throttled hosts' polite idle is overlapped.

function req(method, p, body, timeoutMs) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
      timeout: timeoutMs || 1500000 }, (res) => {
      let s = ''; res.on('data', (c) => { s += c; });
      res.on('end', () => { try { resolve(JSON.parse(s)); } catch { resolve(null); } });
    });
    r.on('timeout', () => { r.destroy(); resolve(null); });
    r.on('error', () => resolve(null));
    if (payload) r.write(payload); r.end();
  });
}

const log = (...a) => console.log(`[frontier-fill ${new Date().toISOString()}]`, ...a);
const status = { startedAt: new Date().toISOString(), hosts: HOSTS, perHost: PER_HOST, rounds: [], state: 'running', totalFetched: 0, totalCompleted: 0 };
const save = () => { try { fs.writeFileSync(STATUS, JSON.stringify(status, null, 1)); } catch (_) {} };
const STOP = path.join(STATE, 'frontier-fill-stop');
const stopRequested = () => fs.existsSync(STOP);
// A sleep that wakes early on the stop-file so a paced/backing-off loop stays
// promptly stoppable (poll every 500ms).
const pacedSleep = async (ms) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (stopRequested()) return;
    await new Promise((r) => setTimeout(r, Math.min(500, until - Date.now())));
  }
};

/*
 * POST-MORTEM (2026-07-20): the first version of this loop had NO pacing and NO
 * bounded run-multi timeout. When the server got saturated and run-multi began
 * returning null (error), the loop spun — 5382 rounds in ~4min, ~150 req/s —
 * and crashed electron's HTTP listener. Draining the frontier does NOT require
 * spamming the orchestration endpoint. So:
 *   - every round is paced to >= MIN_ROUND_MS from the previous round's START;
 *   - run-multi is bounded (RUN_TIMEOUT_MS) so a hung server can't starve the
 *     stop-file check for 25 min;
 *   - a round that does no work (null response or fetched:0) counts toward
 *     MAX_EMPTY consecutive empties, after which we stop — the frontier is
 *     drained or the server is unhealthy, and either way hammering it is wrong.
 */
(async () => {
  if (!HOSTS.length) {
    try {
      const { discover } = require('./frontier-hosts');
      const found = await discover({ limit: AUTO_HOSTS });
      HOSTS = found.map((h) => h.host);
      status.hosts = HOSTS;
      log(`auto-discovered ${HOSTS.length} proven-crawlable frontier hosts: ${HOSTS.join(', ')}`);
    } catch (e) { log('host auto-discovery failed:', e.message); }
  }
  if (!HOSTS.length) { log('no hosts (pass --hosts or ensure the frontier has proven-crawlable hosts)'); status.state = 'crashed'; save(); process.exit(1); }
  const deadline = Date.now() + DURATION;
  log(`start: ${HOSTS.length} hosts concurrently, ${PER_HOST}/host/round, ${Math.round(DURATION / 60000)}min; pace>=${MIN_ROUND_MS}ms, run-timeout ${RUN_TIMEOUT_MS}ms, max-empty ${MAX_EMPTY}`);
  save();
  let round = 0;
  let empties = 0;
  let stopReason = 'completed';
  while (Date.now() < deadline) {
    if (stopRequested()) { stopReason = 'stopped'; break; }
    const roundStart = Date.now();
    round++;
    // Hydrate every host's frontier (never-downloaded first) so run-multi has
    // work for all of them, then drain them all CONCURRENTLY in one call.
    for (const h of HOSTS) {
      if (stopRequested()) { stopReason = 'stopped'; break; }
      await req('POST', '/api/v1/crawl/frontier/hydrate', { host: h, limit: PER_HOST }, 60000);
    }
    if (stopReason === 'stopped') break;
    // run-multi is now DISPATCH-AND-RETURN (2026-07-20): the POST returns a
    // batchId immediately; poll GET .../run-multi/:batchId until it's done.
    // This is why the client no longer needs a giant timeout on the POST.
    const kick = await req('POST', '/api/v1/crawl/frontier/run-multi', { hosts: HOSTS, maxHosts: HOSTS.length, perHostLimit: PER_HOST }, 30000);
    let t = {};
    let r = kick;
    if (kick && kick.batchId) {
      const pollDeadline = Date.now() + RUN_TIMEOUT_MS;
      while (Date.now() < pollDeadline) {
        if (stopRequested()) { stopReason = 'stopped'; break; }
        await pacedSleep(3000);
        const st = await req('GET', `/api/v1/crawl/frontier/run-multi/${kick.batchId}`, null, 15000);
        if (st && st.status && st.status !== 'running') { t = st.totals || {}; r = st; break; }
      }
    } else if (kick && kick.totals) {
      t = kick.totals; // tolerate an older synchronous server
    }
    if (stopReason === 'stopped') break;
    const did = Number(t.fetched || 0) + Number(t.completed || 0);
    status.totalFetched += Number(t.fetched || 0);
    status.totalCompleted += Number(t.completed || 0);
    // FIX 15: a "0 pages" round is ambiguous — distinguish "0 URLs were DUE"
    // (timing/politeness, NORMAL) from "N dequeued but 0 completed" (a real fault).
    // Everything needed is already in the run-multi poll response: t (=r.totals)
    // plus per-host r.results[] (dequeued / preSkippedFresh / error / aborted).
    const results = Array.isArray(r && r.results) ? r.results : [];
    const sumR = (f) => results.reduce((a, x) => a + Number((x && x[f]) || 0), 0);
    const dequeued = sumR('dequeued');
    const preFresh = sumR('preSkippedFresh');
    const viaRedirect = Number(t.completedViaRedirect || 0);
    const returned = Number(t.returnedToPending || 0);
    const erroredHosts = results.filter((x) => x && x.error);
    const abortedHosts = results.filter((x) => x && x.aborted).length;
    const completedAll = Number(t.completed || 0) + viaRedirect;
    let why = null;
    if (!r) why = 'NO-RESPONSE (run-multi kick/poll failed or timed out — server may be wedged)';
    else if (r.status === 'error') why = `BATCH-ERROR: ${r.error || 'unknown'}`;
    else if (completedAll > 0) why = null;
    else if (dequeued === 0) why = `idle: 0 hosts had a URL DUE (nothing pending/due — timing/politeness, NORMAL)`;
    else if (erroredHosts.length) why = `FAULT: ${dequeued} dequeued but ${erroredHosts.length}/${results.length} hosts errored (e.g. "${erroredHosts[0].error}")`;
    else if (returned > 0 || abortedHosts) why = `THROTTLED: ${dequeued} dequeued, 0 completed, ${returned} returned-to-pending (${abortedHosts} slow/aborted host(s))`;
    else if (Number(t.failed || 0) > 0) why = `FAULT: ${dequeued} dequeued but ${t.failed} FAILED (no successful http_responses observed)`;
    else if (preFresh > 0) why = `idle: all ${preFresh} leased URLs pre-skipped as fresh (<10min old)`;
    else why = `0 completed with ${dequeued} dequeued (unclassified — inspect r.results)`;
    const rec = { n: round, at: new Date().toISOString(), dequeued, fetched: t.fetched || 0, completed: completedAll, failed: t.failed || 0, returnedToPending: returned, preSkippedFresh: preFresh, erroredHosts: erroredHosts.length, status: r ? (r.status || 'done') : 'no-response', why, ok: !!r };
    status.rounds.push(rec);
    if (status.rounds.length > 50) status.rounds = status.rounds.slice(-50);
    if (completedAll > 0) {
      log(`round ${round}: fetched ${rec.fetched} completed ${completedAll}${viaRedirect ? ` (${viaRedirect} via redirect)` : ''} from ${dequeued} dequeued${returned ? `, ${returned} returned-to-pending` : ''}${Number(t.failed || 0) ? `, ${t.failed} failed` : ''} (total ${status.totalFetched}/${status.totalCompleted})`);
    } else {
      log(`round ${round}: 0 pages — ${why} (total ${status.totalFetched}/${status.totalCompleted})`);
    }
    save();

    if (did > 0) { empties = 0; }
    else {
      empties++;
      if (empties >= MAX_EMPTY) {
        // FIX 15 (run-level): classify the same 0-page ambiguity one level up.
        const recent = status.rounds.slice(-empties);
        const faulted = recent.filter((x) => x && (x.status === 'no-response' || x.status === 'error' || x.erroredHosts > 0 || x.failed > 0)).length;
        const allNothingDue = recent.length > 0 && recent.every((x) => x && x.dequeued === 0 && x.status !== 'no-response' && x.status !== 'error');
        stopReason = 'drained';
        log(`giving up after ${empties} empty rounds — ${allNothingDue ? 'frontier DRAINED for these hosts (every empty round had 0 URLs due; hydrate more hosts or wait for politeness windows)' : faulted ? `server likely UNHEALTHY (${faulted}/${empties} empty rounds had no-response/errors/failures)` : 'URLs were due but 0 completed (throttle/pre-fresh, not a hard fault)'}`);
        break;
      }
      // Back off harder the longer we go without work, so a sick server gets
      // room to recover instead of being hammered.
      await pacedSleep(Math.min(60000, MIN_ROUND_MS * empties));
      if (stopRequested()) { stopReason = 'stopped'; break; }
    }
    // Pace: never open a new round faster than MIN_ROUND_MS from this one's start.
    const elapsed = Date.now() - roundStart;
    if (elapsed < MIN_ROUND_MS) await pacedSleep(MIN_ROUND_MS - elapsed);
  }
  status.state = stopReason;
  try { if (fs.existsSync(STOP)) fs.unlinkSync(STOP); } catch (_) {}
  status.finishedAt = new Date().toISOString(); save();
  const lastWhy = status.rounds.length ? status.rounds[status.rounds.length - 1].why : null;
  log(`${status.state}: ${round} rounds, ${status.totalCompleted} pages completed (${status.totalFetched} fetched)` +
      (status.totalCompleted === 0 && lastWhy ? ` — last round: ${lastWhy}` : ''));
})().catch((e) => { status.state = 'crashed'; status.error = e.message; save(); process.exit(1); });
