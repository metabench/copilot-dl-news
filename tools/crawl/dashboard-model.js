#!/usr/bin/env node
'use strict';

/**
 * dashboard-model.js — print the UNIFIED crawl-dashboard model (throughput,
 * host health, recent headlines) from the local unifiedApp and/or the remote
 * Oracle node, both routed through the SAME shared core
 * (src/ui/shared/crawl-dash-core). This is the D4 "unify some code" goal made
 * concrete + a live-verification harness: one normalized model shape, two very
 * different sources, honest per-source capability flags.
 *
 * Usage:
 *   node tools/crawl/dashboard-model.js                 # both (local :3170 + remote :3200)
 *   node tools/crawl/dashboard-model.js --local-only
 *   node tools/crawl/dashboard-model.js --remote-only
 *   node tools/crawl/dashboard-model.js --local http://127.0.0.1:3170 --remote http://141.144.193.218:3200
 *   node tools/crawl/dashboard-model.js --json          # raw normalized model as JSON
 */

const http = require('http');
const { URL } = require('url');
const {
  LocalDataAdapter, RemoteDataAdapter, makeHttpSource, makeRemoteHttpSource,
} = require('../../src/ui/shared/crawl-dash-core/DashboardDataAdapter');

function parseArgs(argv) {
  const opts = { local: 'http://127.0.0.1:3170', remote: 'http://141.144.193.218:3200', both: true, remoteOnly: false, localOnly: false, json: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--local') opts.local = argv[++i];
    else if (a === '--remote') opts.remote = argv[++i];
    else if (a === '--local-only') opts.localOnly = true;
    else if (a === '--remote-only') opts.remoteOnly = true;
    else if (a === '--json') opts.json = true;
  }
  return opts;
}

function fetchJsonFrom(base) {
  return (path) => new Promise((resolve, reject) => {
    const u = new URL(path, base);
    const req = http.get({ host: u.hostname, port: u.port, path: u.pathname + u.search, timeout: 12000 }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error('HTTP ' + res.statusCode + ' for ' + path));
        try { resolve(JSON.parse(b)); } catch (e) { reject(new Error('bad JSON from ' + path + ': ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout for ' + path)); });
  });
}

function printModel(title, model) {
  const cap = model.capabilities || {};
  console.log('\n== ' + title + ' ==');
  console.log('  capabilities: throughput=' + cap.throughput + ' hostHealth=' + cap.hostHealth + ' headlines=' + cap.headlines);

  const tp = model.throughput || {};
  if (tp.error) console.log('  throughput: ERROR ' + tp.error);
  else if (tp.supported === false) console.log('  throughput: unsupported');
  else {
    const f = tp.formatted || {};
    console.log('  throughput (active=' + tp.activeCount + '): dl=' + f.downloaded + '/s saved=' + f.saved + '/s net=' + f.network + 'MB/s stored=' + f.stored + 'MB/s queue=' + f.queue + (tp.note ? '  [' + tp.note + ']' : ''));
  }

  const hh = model.hostHealth || {};
  if (hh.error) console.log('  host-health: ERROR ' + hh.error);
  else if (hh.supported === false) console.log('  host-health: unsupported');
  else {
    const badges = hh.badges || [];
    console.log('  host-health (' + badges.length + (hh.kind ? ', ' + hh.kind : '') + '): ' + (badges.length ? badges.slice(0, 8).map((b) => b.host + '[' + b.cls + ']').join(', ') : hh.emptyText));
  }

  const hl = model.headlines || {};
  if (hl.error) console.log('  headlines: ERROR ' + hl.error);
  else if (hl.supported === false) console.log('  headlines: unsupported (' + (hl.note || 'source cannot provide') + ')');
  else {
    const items = hl.items || [];
    console.log('  headlines (' + items.length + '):');
    items.slice(0, 6).forEach((h, i) => console.log('    ' + (i + 1) + '. [' + (h.host || '?') + '] ' + h.title));
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  const doLocal = !opts.remoteOnly;
  const doRemote = !opts.localOnly;
  const out = {};

  if (doLocal) {
    const adapter = new LocalDataAdapter({ source: makeHttpSource(fetchJsonFrom(opts.local)) });
    try { out.local = await adapter.getModel(); } catch (e) { out.local = { source: 'local', error: e.message }; }
  }
  if (doRemote) {
    const adapter = new RemoteDataAdapter({ source: makeRemoteHttpSource(fetchJsonFrom(opts.remote)) });
    try { out.remote = await adapter.getModel(); } catch (e) { out.remote = { source: 'remote', error: e.message }; }
  }

  if (opts.json) { console.log(JSON.stringify(out, null, 2)); return; }
  console.log('Unified crawl-dashboard model (one core, two sources):');
  if (out.local) { if (out.local.error) console.log('\n== LOCAL (' + opts.local + ') ERROR ' + out.local.error); else printModel('LOCAL (' + opts.local + ')', out.local); }
  if (out.remote) { if (out.remote.error) console.log('\n== REMOTE (' + opts.remote + ') ERROR ' + out.remote.error); else printModel('REMOTE (' + opts.remote + ')', out.remote); }
}

if (require.main === module) {
  main().catch((e) => { console.error('dashboard-model failed:', e.message); process.exit(1); });
}

module.exports = { fetchJsonFrom, printModel };
