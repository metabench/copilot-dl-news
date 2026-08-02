#!/usr/bin/env node
'use strict';

/**
 * report-progress.js — tell the owner's status app what this cycle is doing
 * (owner directive 2026-07-30, cycle 155).
 *
 *   node tools/agi/report-progress.js <phase> "<note>" [--cycle 155]
 *
 *   node tools/agi/report-progress.js orient "21 probes green; taking up TECH-PAGESLIVE"
 *   node tools/agi/report-progress.js building "live strip + fingerprint poll" --cycle 155
 *   node tools/agi/report-progress.js verifying "28/28 page tests; browser next"
 *   node tools/agi/report-progress.js closing "ledger row + ritual"
 *
 * LOW FREQUENCY BY DESIGN (the owner's constraint: "I don't want agents' flow to
 * be disrupted"). Call it at PHASE BOUNDARIES — roughly four to six times in a
 * cycle — never per tool call. Records arriving within 20s of the previous one
 * are dropped by the store, so over-reporting degrades to a no-op rather than a
 * flood.
 *
 * FIRE AND FORGET, ALWAYS. Exit code is 0 whatever happens: a status app that is
 * down, unreachable, or slow must never fail a cycle or make an agent stop to
 * think about it. `--strict` flips that for tests only.
 *
 * Writes DIRECTLY to the same append-only log the server reads when the HTTP
 * post cannot be delivered, so progress reported while the app is stopped still
 * shows up the moment the owner starts it.
 */

const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..', '..');
const activity = require(path.join(ROOT, 'src', 'ui', 'server', 'projectStatus', 'activity.js'));

const DEFAULT_PORT = Number(process.env.PROJECT_STATUS_PORT || 3184);
const TIMEOUT_MS = 1500;

function parseArgv(argv) {
  const out = { phase: null, note: '', cycle: null, strict: false, port: DEFAULT_PORT };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--cycle') { out.cycle = Number(argv[++i]); continue; }
    if (a === '--port') { out.port = Number(argv[++i]); continue; }
    if (a === '--strict') { out.strict = true; continue; }
    if (a === '--help' || a === '-h') { out.help = true; continue; }
    rest.push(a);
  }
  out.phase = rest[0] || null;
  out.note = rest.slice(1).join(' ');
  return out;
}

function postJson(port, body) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      host: '127.0.0.1', port, path: '/api/agent-activity', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: TIMEOUT_MS
    }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => {
        try { resolve({ delivered: true, ...JSON.parse(text || '{}') }); }
        catch (_) { resolve({ delivered: true, ok: res.statusCode < 400 }); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ delivered: false, reason: 'timeout' }); });
    req.on('error', (e) => resolve({ delivered: false, reason: e.code || e.message }));
    req.end(payload);
  });
}

async function main() {
  const opts = parseArgv(process.argv.slice(2));
  if (opts.help || !opts.phase) {
    console.log('usage: node tools/agi/report-progress.js <phase> "<note>" [--cycle N]');
    console.log('  phases are free text; the house set is orient | building | verifying | closing');
    console.log('  call at PHASE BOUNDARIES only (4-6 per cycle) — records <20s apart are dropped');
    return 0;
  }

  const body = { phase: opts.phase, note: opts.note, cycle: opts.cycle };
  const viaHttp = await postJson(opts.port, body);

  if (viaHttp.delivered) {
    if (viaHttp.throttled) console.log(`progress: throttled (last report <${Math.round(activity.MIN_INTERVAL_MS / 1000)}s ago) — nothing written, by design`);
    else if (viaHttp.ok) console.log(`progress: ${opts.phase}${opts.note ? ' — ' + opts.note : ''}`);
    else console.log('progress: app rejected the record; not fatal');
    return 0;
  }

  // App not running: write the same record the server would have appended, so
  // the strip is correct as soon as the owner starts it.
  //
  // ...but "not delivered" is not the same as "not received" (cycle 167). A busy
  // app can append the record and still miss the 1.5s response deadline, and the
  // fallback then finds the app's OWN record sitting in the log, throttles on it,
  // and told the agent "nothing written, by design" — about a record that had in
  // fact just been written. That is the one failure this channel must never have:
  // it reports on whether the owner can see the work. So before claiming a drop,
  // check whether the log already contains what we tried to send.
  const landed = activity.newest();
  const alreadyLanded = landed
    && landed.phase === String(opts.phase).trim().slice(0, 40)
    && landed.note === String(opts.note || '').replace(/\s+/g, ' ').trim().slice(0, 240);
  if (alreadyLanded) {
    console.log(`progress: ${opts.phase} (app took >${TIMEOUT_MS}ms to answer, but the record landed)`);
    return 0;
  }

  const direct = activity.report(body);
  if (direct.ok) console.log(`progress: ${opts.phase} (app not running — appended to the log directly)`);
  else if (direct.throttled) console.log(`progress: throttled — a different record landed <${Math.round(activity.MIN_INTERVAL_MS / 1000)}s ago, so THIS note was dropped`);
  else console.log(`progress: not recorded (${direct.error || viaHttp.reason}); continuing anyway`);
  return 0;
}

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((err) => {
    // The whole point: reporting progress can never be the reason a cycle stops.
    const strict = process.argv.includes('--strict');
    if (strict) { console.error(err); process.exit(1); }
    console.log(`progress: reporting failed (${err.message}); continuing anyway`);
    process.exit(0);
  });
}

module.exports = { parseArgv };
