'use strict';
/**
 * tools/crawl/lib/throughput-meter.js
 *
 * Lightweight throughput sampler for live "docs/s + bytes/s" output during
 * crawl runs. Two backends:
 *
 *   - local  : polls SQLite `fetches` table in data/news.db
 *              SELECT COUNT(*), COALESCE(SUM(bytes_downloaded),0)
 *              FROM fetches WHERE fetched_at >= ?
 *
 *   - remote : polls a remote multi-domain server's /api/status endpoint
 *              and reads its precomputed `throughput.fetchesPerSec` /
 *              `throughput.writesPerSec` plus aggregate row counts.
 *
 * The meter samples at a fixed interval, computes deltas vs the previous
 * sample (so the very first interval is "warming up"), and emits a single
 * line per tick to stderr by default — keeping stdout clean for any JSON
 * the underlying tool already prints.
 *
 * Usage:
 *   const meter = startLocalMeter({ dbPath, sinceIso, intervalMs: 2000 });
 *   // ... run crawl ...
 *   meter.stop();
 *   const summary = meter.summary(); // { totalDocs, totalBytes, peakDocsPerSec, ... }
 *
 * Output format (human):
 *   ⏱  +12.0s  docs:  47 (+12)  4.0/s   bytes: 2.3 MB (+612 KB)  204 KB/s
 *
 * Output format (json):
 *   {"meter":"local","tElapsedMs":12000,"docs":47,"deltaDocs":12,"docsPerSec":4.0, ... }
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// ── Formatting helpers ──────────────────────────────────────────

function fmtBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

function fmtRate(perSec, unit) {
  if (!Number.isFinite(perSec) || perSec < 0) perSec = 0;
  if (unit === 'bytes') return `${fmtBytes(perSec)}/s`;
  return `${perSec >= 100 ? perSec.toFixed(0) : perSec.toFixed(1)}/s`;
}

function fmtDelta(n) {
  if (n > 0) return `+${n}`;
  if (n < 0) return String(n);
  return '+0';
}

function fmtSecs(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── Local backend ───────────────────────────────────────────────

function openLocalDb(dbPath) {
  const Database = require('better-sqlite3');
  return new Database(dbPath, { readonly: true, fileMustExist: true });
}

function makeLocalSampler(dbPath, sinceIso) {
  let db = null;
  let stmt = null;
  return {
    sample() {
      if (!db) {
        if (!fs.existsSync(dbPath)) {
          return { ok: false, reason: `db-missing:${dbPath}` };
        }
        try { db = openLocalDb(dbPath); }
        catch (err) { return { ok: false, reason: `db-open-failed:${err.message}` }; }
        try {
          stmt = db.prepare(
            'SELECT COUNT(*) AS docs, COALESCE(SUM(bytes_downloaded), 0) AS bytes ' +
            'FROM fetches WHERE fetched_at >= ?'
          );
        } catch (err) {
          return { ok: false, reason: `prepare-failed:${err.message}` };
        }
      }
      try {
        const row = stmt.get(sinceIso);
        return {
          ok: true,
          docs: Number(row.docs || 0),
          bytes: Number(row.bytes || 0)
        };
      } catch (err) {
        return { ok: false, reason: `query-failed:${err.message}` };
      }
    },
    close() {
      if (db) { try { db.close(); } catch (_e) { /* ignore */ } db = null; }
    }
  };
}

// ── Remote backend ──────────────────────────────────────────────

function fetchJson(host, port, urlPath, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host, port, path: urlPath, method: 'GET',
      headers: { Accept: 'application/json' }
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); }
          catch (err) { reject(new Error(`bad-json:${err.message}`)); }
        } else {
          reject(new Error(`http-${res.statusCode}`));
        }
      });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
    req.end();
  });
}

function makeRemoteSampler(host, port) {
  return {
    async sample() {
      try {
        const data = await fetchJson(host, port, '/api/status');
        // Real shape (deploy/remote-crawler-v2/multi-domain-server.js):
        //   { throughput:{fetchesPerSec,writesPerSec,windowSec},
        //     domains:[ { domain, state, stats:{fetched,done,errors,pending}, ... } ] }
        // Older builds may also expose `aggregate.totalFetched/totalBytes`.
        const aggregate = data.aggregate || {};
        const throughput = data.throughput || {};
        let docs = Number(aggregate.totalFetched || aggregate.fetched || 0);
        let bytes = Number(aggregate.totalBytes || aggregate.bytesDownloaded || 0);
        const domains = Array.isArray(data.domains) ? data.domains : [];
        if (!docs && domains.length) {
          docs = domains.reduce((acc, d) => acc + Number((d && d.stats && d.stats.fetched) || 0), 0);
        }
        if (!bytes && domains.length) {
          bytes = domains.reduce((acc, d) => acc + Number(
            (d && d.stats && (d.stats.bytes || d.stats.bytesDownloaded || d.stats.totalBytes)) || 0
          ), 0);
        }
        const activeDomains = domains.filter(d => d && (d.state === 'running' || d.isRunning)).length;
        return {
          ok: true,
          docs,
          bytes,
          activeDomains,
          totalDomains: domains.length,
          remoteFetchesPerSec: Number(throughput.fetchesPerSec || 0),
          remoteWritesPerSec: Number(throughput.writesPerSec || 0)
        };
      } catch (err) {
        return { ok: false, reason: err.message };
      }
    },
    close() { /* no-op */ }
  };
}

// ── Generic meter loop ──────────────────────────────────────────

function startMeter(opts) {
  const {
    sampler,
    intervalMs = 2000,
    label = 'meter',
    json = false,
    out = process.stderr,
    onSample = null
  } = opts;

  const startedAt = Date.now();
  let prev = null;        // { docs, bytes, t }
  let totalDocs = 0;
  let totalBytes = 0;
  let peakDocsPerSec = 0;
  let peakBytesPerSec = 0;
  let stopped = false;
  let timer = null;

  function tick() {
    if (stopped) return;
    Promise.resolve(sampler.sample()).then((s) => {
      if (stopped) return;
      const now = Date.now();
      const elapsedMs = now - startedAt;
      if (!s.ok) {
        if (!json) {
          out.write(`⏱  ${fmtSecs(elapsedMs).padStart(7)}  meter:${label} (waiting: ${s.reason})\n`);
        } else {
          out.write(JSON.stringify({ meter: label, tElapsedMs: elapsedMs, status: 'waiting', reason: s.reason }) + '\n');
        }
        return;
      }
      let deltaDocs = 0, deltaBytes = 0, deltaSec = 0, docsPerSec = 0, bytesPerSec = 0;
      if (prev) {
        deltaDocs = s.docs - prev.docs;
        deltaBytes = s.bytes - prev.bytes;
        deltaSec = (now - prev.t) / 1000;
        if (deltaSec > 0) {
          docsPerSec = Math.max(0, deltaDocs / deltaSec);
          bytesPerSec = Math.max(0, deltaBytes / deltaSec);
        }
      }
      totalDocs = s.docs;
      totalBytes = s.bytes;
      if (docsPerSec > peakDocsPerSec) peakDocsPerSec = docsPerSec;
      if (bytesPerSec > peakBytesPerSec) peakBytesPerSec = bytesPerSec;
      prev = { docs: s.docs, bytes: s.bytes, t: now };

      const sample = {
        meter: label,
        tElapsedMs: elapsedMs,
        docs: s.docs,
        deltaDocs,
        docsPerSec: Number(docsPerSec.toFixed(2)),
        bytes: s.bytes,
        deltaBytes,
        bytesPerSec: Number(bytesPerSec.toFixed(0))
      };
      if (s.remoteFetchesPerSec !== undefined) sample.remoteFetchesPerSec = s.remoteFetchesPerSec;
      if (s.remoteWritesPerSec !== undefined) sample.remoteWritesPerSec = s.remoteWritesPerSec;

      if (onSample) {
        try { onSample(sample); } catch (_e) { /* swallow */ }
      }

      if (json) {
        out.write(JSON.stringify(sample) + '\n');
      } else {
        const line =
          `⏱  ${fmtSecs(elapsedMs).padStart(7)}  ` +
          `docs: ${String(s.docs).padStart(5)} (${fmtDelta(deltaDocs).padStart(4)})  ` +
          `${fmtRate(docsPerSec).padStart(8)}   ` +
          `bytes: ${fmtBytes(s.bytes).padStart(8)} (${fmtDelta(deltaBytes).padStart(6)})  ` +
          `${fmtRate(bytesPerSec, 'bytes').padStart(10)}`;
        out.write(line + '\n');
      }
    }).catch((err) => {
      if (!json) out.write(`⏱  meter:${label} sample error: ${err && err.message || err}\n`);
    });
  }

  timer = setInterval(tick, intervalMs);
  if (timer && typeof timer.unref === 'function') timer.unref();
  // first tick after a short warm-up
  setTimeout(tick, Math.min(intervalMs, 500)).unref?.();

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      if (timer) { clearInterval(timer); timer = null; }
      try { sampler.close(); } catch (_e) { /* ignore */ }
    },
    summary() {
      return {
        totalDocs,
        totalBytes,
        elapsedMs: Date.now() - startedAt,
        peakDocsPerSec: Number(peakDocsPerSec.toFixed(2)),
        peakBytesPerSec: Number(peakBytesPerSec.toFixed(0)),
        avgDocsPerSec: totalDocs > 0
          ? Number((totalDocs / Math.max(1, (Date.now() - startedAt) / 1000)).toFixed(2))
          : 0,
        avgBytesPerSec: totalBytes > 0
          ? Number((totalBytes / Math.max(1, (Date.now() - startedAt) / 1000)).toFixed(0))
          : 0
      };
    },
    renderSummary() {
      const s = this.summary();
      return `Crawl throughput: elapsed=${fmtSecs(s.elapsedMs)} docs=${s.totalDocs} avg=${fmtRate(s.avgDocsPerSec)} peak=${fmtRate(s.peakDocsPerSec)} bytes=${fmtBytes(s.totalBytes)} avgBytes=${fmtRate(s.avgBytesPerSec, 'bytes')} peakBytes=${fmtRate(s.peakBytesPerSec, 'bytes')}\n`;
    }
  };
}

function startLocalMeter({
  dbPath,
  sinceIso = new Date().toISOString(),
  intervalMs = 2000,
  json = false,
  out = process.stderr,
  onSample = null
}) {
  const sampler = makeLocalSampler(dbPath, sinceIso);
  return startMeter({ sampler, intervalMs, label: 'local', json, out, onSample });
}

function startRemoteMeter({
  host,
  port,
  intervalMs = 2000,
  json = false,
  out = process.stderr,
  onSample = null
}) {
  // Accept host as either "host" or "host:port"; explicit `port` arg wins.
  let resolvedHost = host;
  let resolvedPort = port;
  if (typeof host === 'string' && host.includes(':') && resolvedPort == null) {
    const idx = host.lastIndexOf(':');
    resolvedHost = host.slice(0, idx);
    resolvedPort = Number(host.slice(idx + 1));
  }
  if (!resolvedPort) resolvedPort = 3200;
  const sampler = makeRemoteSampler(resolvedHost, resolvedPort);
  return startMeter({ sampler, intervalMs, label: 'remote', json, out, onSample });
}

module.exports = {
  startLocalMeter,
  startRemoteMeter,
  startMeter,
  // exported for unit tests
  makeLocalSampler,
  makeRemoteSampler,
  fmtBytes,
  fmtRate,
  fmtSecs
};
