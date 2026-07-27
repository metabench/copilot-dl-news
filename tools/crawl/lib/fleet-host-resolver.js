'use strict';

/**
 * fleet-host-resolver.js
 * ----------------------
 * THE single source of truth for the distributed crawl fleet's addressing
 * (host + service-port inventory). Extended cycle 65 (Phase D1 of
 * docs/plans/2026-07-distributed-crawl-unification.md) from a host-only
 * resolver, because remote addressing had sprawled across three modules with
 * three different hardcoded ports and no one place that named them.
 *
 * Host resolution order:
 *   1. process.env.FLEET_HOST                    (explicit override)
 *   2. tools/crawl/.fleet-host                   (1-line file override, gitignored by convention)
 *   3. DEFAULT_FLEET_HOST = '141.144.193.218'    (Oracle Cloud worker VM)
 *
 * PORT INVENTORY (the fleet's service map — see getFleetEndpoints()):
 *   3200  v2 multi-domain crawl server (deploy/remote-crawler-v2, PM2
 *         `crawl-server-v4`) — DEPLOYED + ACTIVE. The remote queue + watermark
 *         batch-export server that crawl-remote.js drives. This is the port
 *         the UNIFIED remote server keeps.
 *   8081  remote-fetch worker (wip/labs/distributed-crawl/worker-server.js,
 *         POST /batch) — the stateless "remote hands" fetcher; OFF by default,
 *         env REMOTE_FETCH_WORKER_PORT overrides.
 *   3120  Gen-1 legacy remote-crawler-lab — ORPHANED (its /api/jobs endpoint
 *         is not served by anything deployed). Do not build against it; the
 *         Gen-1 drivers (tools/remote-crawl/*) are deprecated.
 *
 * @module tools/crawl/lib/fleet-host-resolver
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_FLEET_HOST = '141.144.193.218';
const HOST_FILE = path.join(__dirname, '..', '.fleet-host');

let cached = null;

/**
 * Synchronously resolve the fleet host (no port).
 * Result is cached for the lifetime of the process.
 * @returns {string} hostname or IP, e.g. '141.144.193.218'
 */
function getFleetHostSync() {
  if (cached) return cached;

  if (process.env.FLEET_HOST && String(process.env.FLEET_HOST).trim()) {
    cached = String(process.env.FLEET_HOST).trim();
    return cached;
  }

  try {
    if (fs.existsSync(HOST_FILE)) {
      const raw = fs.readFileSync(HOST_FILE, 'utf8').trim();
      if (raw) {
        cached = raw.split(/\s+/)[0];
        return cached;
      }
    }
  } catch (_) {
    // ignore — fall back to default
  }

  cached = DEFAULT_FLEET_HOST;
  return cached;
}

/**
 * Reset the cache (test hook).
 */
function _resetCache() {
  cached = null;
}

// The fleet's service-port map (see the PORT INVENTORY in the header).
// `status: 'deployed' | 'off-by-default' | 'orphaned'` is the D1 inventory verdict.
const FLEET_PORTS = Object.freeze({
  v2Server: Object.freeze({
    port: 3200,
    status: 'deployed',
    // Live-verified 2026-07-21: GET /api/health -> {"healthy":true,"version":"4.0.0",...}
    // (/status.json 404s on the deployed build — that path was a docs error).
    healthPath: '/api/health',
    description: 'v2 multi-domain crawl server (remote queue + watermark batch export; PM2 crawl-server-v4)'
  }),
  remoteFetchWorker: Object.freeze({
    port: Number(process.env.REMOTE_FETCH_WORKER_PORT) || 8081,
    status: 'off-by-default',
    healthPath: '/health',
    description: 'stateless remote-fetch worker (POST /batch, N bodies per response)'
  }),
  legacyLab: Object.freeze({
    port: 3120,
    status: 'orphaned',
    healthPath: null,
    description: 'Gen-1 remote-crawler-lab — DEPRECATED, not served by anything deployed'
  })
});

/**
 * The full fleet endpoint map: resolved host + named service URLs.
 * The one call new code should use instead of hand-assembling host:port.
 * @returns {{host: string, services: Object<string, {port:number,status:string,url:string,healthUrl:(string|null),description:string}>}}
 */
function getFleetEndpoints() {
  const host = getFleetHostSync();
  const services = {};
  for (const [name, svc] of Object.entries(FLEET_PORTS)) {
    services[name] = {
      port: svc.port,
      status: svc.status,
      url: `http://${host}:${svc.port}`,
      healthUrl: svc.healthPath ? `http://${host}:${svc.port}${svc.healthPath}` : null,
      description: svc.description
    };
  }
  return { host, services };
}

// ── Fleet partition (plan v2 Phase D1: the static host-ownership guard) ──────
// EXCLUSIVE HOST OWNERSHIP: each target host is owned by exactly one node, so the
// cross-node sum of requests to a host is structurally one node's paced output
// (a second node adds zero throughput under crawl-delay — see plan v2 §2).
// tools/crawl/fleet-partition.json lists the hosts the REMOTE node owns
// ({ "remoteHosts": [...] }, www-insensitive). Empty/missing = remote owns
// nothing: local crawls everything and remote seeding is refused (fail-closed).
const PARTITION_FILE = path.join(__dirname, '..', 'fleet-partition.json');
const normalizePartitionHost = (h) => String(h || '').toLowerCase().replace(/^www\./, '');

let partitionCache = null;
function getFleetPartition() {
  if (partitionCache) return partitionCache;
  let remoteHosts = [];
  try {
    if (fs.existsSync(PARTITION_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(PARTITION_FILE, 'utf8'));
      if (Array.isArray(parsed.remoteHosts)) {
        remoteHosts = parsed.remoteHosts.map(normalizePartitionHost).filter(Boolean);
      }
    }
  } catch (_) {
    // Unreadable/corrupt partition file → treat as empty (fail-closed: remote
    // owns nothing, so nothing is excluded locally and remote seeding refuses).
    remoteHosts = [];
  }
  partitionCache = { remoteHosts, remoteSet: new Set(remoteHosts) };
  return partitionCache;
}

function isRemoteAssignedHost(host) {
  return getFleetPartition().remoteSet.has(normalizePartitionHost(host));
}

function _resetPartitionCache() {
  partitionCache = null;
}

module.exports = {
  getFleetHostSync,
  getFleetEndpoints,
  getFleetPartition,
  isRemoteAssignedHost,
  FLEET_PORTS,
  DEFAULT_FLEET_HOST,
  _resetCache,
  _resetPartitionCache,
};
