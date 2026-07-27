#!/usr/bin/env node
'use strict';

/**
 * remote-endpoints.check.js — Phase D1 probe (cycle 65).
 *
 * HARD assertions (exit 1): the fleet resolver resolves a host, exposes the full
 * endpoint map, and the port inventory is coherent (v2=3200 deployed, worker
 * default 8081, legacy 3120 orphaned). This guards against the config sprawl that
 * let three modules hand-assemble three different host:port combos.
 *
 * INFORMATIONAL (never fails the suite): reachability of the deployed v2 server's
 * /status.json with a short timeout — the Oracle VM being down/unreachable from
 * this network is an operational fact to SURFACE at orient, not a repo defect.
 */

const http = require('http');
const { getFleetHostSync, getFleetEndpoints, FLEET_PORTS } = require('../../crawl/lib/fleet-host-resolver');

let failures = 0;
const assert = (cond, label) => {
  console.log(`  ${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures += 1;
  return cond ? 0 : 1;
};

console.log('== fleet resolver + endpoint map (hard assertions) ==');
const host = getFleetHostSync();
assert(typeof host === 'string' && host.length > 0, `resolver yields a host (${host})`);

const { services } = getFleetEndpoints();
assert(services.v2Server && services.v2Server.port === 3200 && services.v2Server.status === 'deployed',
  'v2Server: port 3200, status deployed');
assert(services.remoteFetchWorker && services.remoteFetchWorker.status === 'off-by-default',
  `remoteFetchWorker: port ${services.remoteFetchWorker && services.remoteFetchWorker.port}, off-by-default`);
assert(services.legacyLab && services.legacyLab.port === 3120 && services.legacyLab.status === 'orphaned',
  'legacyLab: port 3120, status orphaned (deprecated)');
assert(services.v2Server && services.v2Server.healthUrl === `http://${host}:3200/api/health`,
  'v2Server healthUrl assembled from the resolver (no hand-built host:port)');

console.log('== deployed v2 server reachability (informational, 4s timeout) ==');
const healthUrl = services.v2Server.healthUrl;
const req = http.get(healthUrl, { timeout: 4000 }, (res) => {
  console.log(`  ℹ️ ${healthUrl} -> HTTP ${res.statusCode} (Oracle v2 server UP)`);
  res.resume();
  finish();
});
req.on('timeout', () => { req.destroy(); console.log(`  ℹ️ ${healthUrl} -> timeout (Oracle v2 server unreachable from here — informational)`); finish(); });
req.on('error', (e) => { console.log(`  ℹ️ ${healthUrl} -> ${e.code || e.message} (unreachable — informational)`); finish(); });

let finished = false;
function finish() {
  if (finished) return;
  finished = true;
  console.log(failures ? `\n${failures} hard check(s) failing.` : '\nAll remote-endpoint hard checks pass.');
  process.exit(failures ? 1 : 0);
}
