'use strict';

/**
 * tools/crawl/lib/crawl-backend.js
 * ---------------------------------
 * CLI-layer abstraction that lets `run.js`, `crawl-remote.js`, and any other
 * crawl CLI invoke either a **local** unified UI v1 backend or a **remote**
 * multi-domain fleet backend behind one interface.
 *
 * NOT an engine change. Both backends only speak HTTP/SQL surfaces that
 * already exist; this module just normalises shapes so the rest of the CLI
 * stack can be backend-agnostic.
 *
 * Public API
 * ----------
 *   const { LocalBackend, RemoteBackend, getBackend } = require('./crawl-backend');
 *
 *   const backend = getBackend('remote', { host: 'h:3200' });
 *   await backend.health();           // -> { ok, message?, raw? }
 *   await backend.status();           // -> NormalizedStatus
 *   await backend.launch({ urls, hosts, options }); // -> { ok, launched:[...], raw }
 *   await backend.stop({ hosts });    // -> { ok, stopped:[...], raw }
 *   const meter = backend.startMeter({ intervalMs, json, out, sinceIso });
 *
 * NormalizedStatus shape:
 *   {
 *     ok: true,
 *     kind: 'local' | 'remote',
 *     label: 'host:port',
 *     totals: { fetched, errors, pending, stored?, bytes? },
 *     throughput: { fetchesPerSec, writesPerSec, windowSec? },
 *     domains: [
 *       { domain, state, isRunning, fetched, errors, pending, stored?, bytes? }
 *     ],
 *     raw: <original payload>          // for debugging / power users
 *   }
 *
 * Domain `state` values: 'idle' | 'running' | 'stopped' | 'done' | 'unknown'
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

const meterLib = require('./throughput-meter');

// ── Shared helpers ───────────────────────────────────────────────────────────

function parseHostPort(input, defaultPort) {
  if (!input) return { host: '127.0.0.1', port: defaultPort };
  const s = String(input);
  const idx = s.lastIndexOf(':');
  if (idx === -1) return { host: s, port: defaultPort };
  const host = s.slice(0, idx);
  const port = Number(s.slice(idx + 1)) || defaultPort;
  return { host, port };
}

function httpRequest(method, host, port, urlPath, body, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const headers = { Accept: 'application/json' };
    let payload = null;
    if (body != null) {
      payload = typeof body === 'string' ? body : JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    let req;
    let settled = false;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      if (req && typeof req.setTimeout === 'function') req.setTimeout(0);
      fn(value);
    };
    const rejectOnce = (err) => settle(reject, err);
    req = http.request({ host, port, path: urlPath, method, headers }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { buf += c; });
      res.once('error', rejectOnce);
      res.on('end', () => {
        if (settled) return;
        const status = res.statusCode || 0;
        let parsed = null;
        try { parsed = buf ? JSON.parse(buf) : null; } catch (_e) { parsed = buf; }
        if (status >= 200 && status < 300) settle(resolve, { status, body: parsed });
        else rejectOnce(new Error(`http-${status}: ${typeof parsed === 'string' ? parsed.slice(0, 200) : JSON.stringify(parsed).slice(0, 200)}`));
      });
    });
    req.setTimeout(timeoutMs, () => {
      if (settled) return;
      if (!req.destroyed) req.destroy();
      rejectOnce(new Error(`timeout after ${timeoutMs}ms`));
    });
    req.once('error', rejectOnce);
    if (payload) req.write(payload);
    req.end();
  });
}

function uniqueHostnamesFromUrls(urls) {
  const out = new Set();
  for (const u of urls || []) {
    try { out.add(new URL(u).hostname.toLowerCase()); } catch (_e) { /* skip */ }
  }
  return Array.from(out);
}

// ── Base class ───────────────────────────────────────────────────────────────

class CrawlBackend {
  constructor(label) { this._label = label; }
  get kind() { return 'abstract'; }
  get label() { return this._label; }

  async health() { throw new Error('not implemented'); }
  async status() { throw new Error('not implemented'); }
  async launch(_input) { throw new Error('not implemented'); }
  async stop(_input) { return { ok: false, reason: 'not-supported', stopped: [], raw: null }; }
  startMeter(_opts) { throw new Error('not implemented'); }

  /** Returns requested hosts absent from a status payload. */
  static missingHosts(status, hosts) {
    const wanted = [...new Set((hosts || []).map(h => String(h).trim()).filter(Boolean))];
    if (wanted.length === 0) return [];
    if (!status || !Array.isArray(status.domains)) return wanted;
    const present = new Set(status.domains
      .filter(d => d && d.domain)
      .map(d => String(d.domain).toLowerCase()));
    return wanted.filter(host => !present.has(String(host).toLowerCase()));
  }

  /** Returns true when every requested host is in a terminal state. */
  static allTerminal(status, hosts) {
    if (!status || !Array.isArray(status.domains)) return false;
    const terminal = new Set(['stopped', 'done', 'completed', 'idle']);
    const wanted = new Set((hosts || []).map(h => String(h).toLowerCase()));
    if (wanted.size === 0) return false;
    let seen = 0;
    for (const d of status.domains) {
      if (!d || !d.domain) continue;
      const k = String(d.domain).toLowerCase();
      if (!wanted.has(k)) continue;
      seen++;
      if (d.isRunning) return false;
      if (!terminal.has(String(d.state || '').toLowerCase())) return false;
    }
    return seen === wanted.size;
  }
}

// ── Local backend (unified UI v1) ────────────────────────────────────────────

class LocalBackend extends CrawlBackend {
  constructor({ host = '127.0.0.1', port = 3001, dbPath, uiBase = '/api/v1/crawl', operation = 'basicArticleCrawl' } = {}) {
    super(`${host}:${port}`);
    this.host = host;
    this.port = port;
    this.dbPath = dbPath || path.resolve(__dirname, '../../../data/news.db');
    this.uiBase = uiBase;
    this.operation = operation;
    this._db = null;
  }

  get kind() { return 'local'; }

  async health() {
    try {
      const { body } = await httpRequest('GET', this.host, this.port, `${this.uiBase}/availability?operations=true`, null, 5000);
      const ops = (body && body.availability && Array.isArray(body.availability.operations))
        ? body.availability.operations.map(o => o.name) : [];
      return { ok: true, operations: ops, raw: body };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  }

  /**
   * Local status is computed from the SQLite `fetches` table since the unified
   * UI v1 API has no per-host aggregate endpoint. This keeps local + remote
   * surfaces aligned for the meter and for `--watch`.
   */
  async status({ sinceIso = null, hosts = null } = {}) {
    const db = this._openDb();
    if (!db) {
      return {
        ok: false, kind: 'local', label: this.label,
        totals: { fetched: 0, errors: 0, pending: 0, bytes: 0 },
        throughput: { fetchesPerSec: 0, writesPerSec: 0 },
        domains: [],
        raw: { reason: `db-missing:${this.dbPath}` }
      };
    }
    try {
      const sinceClause = sinceIso ? 'WHERE fetched_at >= ?' : '';
      const params = sinceIso ? [sinceIso] : [];
      const rows = db.prepare(`
        SELECT host AS domain, COUNT(*) AS fetched, COALESCE(SUM(bytes_downloaded),0) AS bytes
        FROM fetches
        ${sinceClause}
        GROUP BY host
        ORDER BY fetched DESC
      `).all(...params);
      const wanted = hosts ? new Set(hosts.map(h => String(h).toLowerCase())) : null;
      const domains = rows
        .filter(r => !wanted || wanted.has(String(r.domain || '').toLowerCase()))
        .map(r => ({
          domain: r.domain || '(unknown)',
          state: 'unknown', // local DB doesn't track running/stopped
          isRunning: false,
          fetched: Number(r.fetched || 0),
          errors: 0,
          pending: 0,
          bytes: Number(r.bytes || 0)
        }));
      const totalFetched = domains.reduce((a, d) => a + d.fetched, 0);
      const totalBytes = domains.reduce((a, d) => a + d.bytes, 0);
      return {
        ok: true,
        kind: 'local',
        label: this.label,
        totals: { fetched: totalFetched, errors: 0, pending: 0, bytes: totalBytes },
        throughput: { fetchesPerSec: 0, writesPerSec: 0 }, // not surfaced locally
        domains,
        raw: { sinceIso, dbPath: this.dbPath }
      };
    } catch (err) {
      return { ok: false, kind: 'local', label: this.label, error: err.message,
        totals: { fetched: 0, errors: 0, pending: 0, bytes: 0 },
        throughput: { fetchesPerSec: 0, writesPerSec: 0 }, domains: [], raw: null };
    }
  }

  async launch({ urls = [], options = {}, operation = null } = {}) {
    if (!urls.length) return { ok: false, reason: 'no-urls', launched: [], raw: null };
    const op = operation || this.operation;
    const launched = [];
    let lastErr = null;
    for (const url of urls) {
      const body = { url, ...options };
      try {
        const { body: resp } = await httpRequest(
          'POST', this.host, this.port,
          `${this.uiBase}/operations/${encodeURIComponent(op)}/start`,
          body, 30000
        );
        launched.push({ target: url, status: 'started', raw: resp });
      } catch (err) {
        lastErr = err;
        launched.push({ target: url, status: 'error', error: err.message });
      }
    }
    return { ok: launched.some(l => l.status === 'started'), launched, raw: { operation: op, errors: lastErr ? [lastErr.message] : [] } };
  }

  async stop(_input) {
    // Local v1 has no general stop endpoint exposed here; CLI-layer no-op.
    return { ok: false, reason: 'not-supported-locally', stopped: [], raw: null };
  }

  startMeter({ intervalMs = 2000, json = false, out = process.stderr, sinceIso = new Date().toISOString() } = {}) {
    return meterLib.startLocalMeter({ dbPath: this.dbPath, sinceIso, intervalMs, json, out });
  }

  _openDb() {
    if (this._db) return this._db;
    try {
      const Database = require('better-sqlite3');
      if (!fs.existsSync(this.dbPath)) return null;
      this._db = new Database(this.dbPath, { readonly: true, fileMustExist: true });
      return this._db;
    } catch (_e) {
      return null;
    }
  }

  close() {
    if (this._db) { try { this._db.close(); } catch (_e) {} this._db = null; }
  }
}

// ── Remote backend (deploy/remote-crawler-v2/multi-domain-server.js) ─────────

class RemoteBackend extends CrawlBackend {
  constructor({ host = '127.0.0.1', port = 3200 } = {}) {
    super(`${host}:${port}`);
    this.host = host;
    this.port = port;
  }

  get kind() { return 'remote'; }

  async health() {
    const _httpRequest = this._httpRequest || httpRequest;
    try {
      const { body } = await _httpRequest('GET', this.host, this.port, '/api/health', null, 10000);
      return { ok: true, mode: body && body.mode, domains: body && body.domains, running: body && body.running, raw: body };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  }

  async status({ hosts = null } = {}) {
    const _httpRequest = this._httpRequest || httpRequest;
    try {
      const { body } = await _httpRequest('GET', this.host, this.port, '/api/status', null, 30000);
      const data = body || {};
      const wanted = hosts ? new Set(hosts.map(h => String(h).toLowerCase())) : null;
      const domains = (Array.isArray(data.domains) ? data.domains : [])
        .filter(d => !wanted || wanted.has(String(d.domain || '').toLowerCase()))
        .map(d => ({
          domain: d.domain,
          state: d.state || 'unknown',
          isRunning: !!d.isRunning,
          fetched: Number((d.stats && d.stats.fetched) || 0),
          errors: Number((d.stats && d.stats.errors) || 0),
          pending: Number((d.stats && d.stats.pending) || 0),
          stored: Number((d.contentPipeline && d.contentPipeline.totalStored) || 0),
          bytes: Number((d.stats && (d.stats.bytes || d.stats.bytesDownloaded)) || 0),
          startedAt: d.startedAt || null,
          stoppedAt: d.stoppedAt || null,
          fatalState: d.fatalState || null
        }));
      const totals = {
        fetched: domains.reduce((a, d) => a + d.fetched, 0),
        errors: domains.reduce((a, d) => a + d.errors, 0),
        pending: domains.reduce((a, d) => a + d.pending, 0),
        stored: domains.reduce((a, d) => a + (d.stored || 0), 0),
        bytes: domains.reduce((a, d) => a + (d.bytes || 0), 0)
      };
      // Newer fleet builds may surface aggregate fields; honour them when present.
      if (data.totals) {
        if (data.totals.fetched != null) totals.fetched = Number(data.totals.fetched);
        if (data.totals.stored != null) totals.stored = Number(data.totals.stored);
        if (data.totals.errors != null) totals.errors = Number(data.totals.errors);
        if (data.totals.pending != null) totals.pending = Number(data.totals.pending);
      }
      const tp = data.throughput || {};
      return {
        ok: true,
        kind: 'remote',
        label: this.label,
        totals,
        throughput: {
          fetchesPerSec: Number(tp.fetchesPerSec || 0),
          writesPerSec: Number(tp.writesPerSec || 0),
          windowSec: Number(tp.windowSec || 0)
        },
        domains,
        raw: data
      };
    } catch (err) {
      return { ok: false, kind: 'remote', label: this.label, error: err.message,
        totals: { fetched: 0, errors: 0, pending: 0, bytes: 0 },
        throughput: { fetchesPerSec: 0, writesPerSec: 0 }, domains: [], raw: null };
    }
  }

  async launch({ hosts = [], urls = [], options = {} } = {}) {
    const targetDomains = hosts && hosts.length ? hosts : uniqueHostnamesFromUrls(urls);
    if (!targetDomains.length) return { ok: false, reason: 'no-hosts', launched: [], raw: null };
    const body = { domains: targetDomains, ...options };
    const _httpRequest = this._httpRequest || httpRequest;
    try {
      const { body: resp } = await _httpRequest('POST', this.host, this.port, '/api/start', body, 15000);
      const rawResults = resp && Array.isArray(resp.results) ? resp.results : (resp && resp.domain ? [resp] : []);
      const launched = rawResults
        .map(r => ({ target: r.domain, status: r.status, raw: r }));
      return { ok: launched.some(l => l.status === 'started'), launched, raw: resp };
    } catch (err) {
      return { ok: false, reason: err.message, launched: targetDomains.map(t => ({ target: t, status: 'error', error: err.message })), raw: null };
    }
  }

  async stop({ hosts = null } = {}) {
    const targetHosts = Array.isArray(hosts) ? hosts.map(h => String(h).trim()).filter(Boolean) : [];
    const body = {};
    if (targetHosts.length === 1) body.domain = targetHosts[0];
    else if (targetHosts.length > 1) body.domains = targetHosts;
    // No hosts means stop all (empty body).
    const _httpRequest = this._httpRequest || httpRequest;
    try {
      const { body: resp } = await _httpRequest('POST', this.host, this.port, '/api/stop', body, 15000);
      const rawResults = resp && Array.isArray(resp.results) ? resp.results : (resp && resp.domain ? [resp] : []);
      const stopped = rawResults
        .map(r => ({ target: r.domain, status: r.status }));
      const failed = stopped.filter(r => /error|fail/i.test(String(r.status || '')));
      return { ok: failed.length === 0, stopped, raw: resp };
    } catch (err) {
      return { ok: false, reason: err.message, stopped: [], raw: null };
    }
  }

  startMeter({ intervalMs = 2000, json = false, out = process.stderr } = {}) {
    return meterLib.startRemoteMeter({ host: this.host, port: this.port, intervalMs, json, out });
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * @param {'local'|'remote'} kind
 * @param {object} opts
 *   - For local: { host?, port?, dbPath?, uiBase?, operation? }
 *   - For remote: { host? } where host can be 'h' or 'h:port'
 */
function getBackend(kind, opts = {}) {
  if (kind === 'local') {
    return new LocalBackend(opts);
  }
  if (kind === 'remote') {
    let host = opts.host;
    let port = opts.port;
    if (typeof host === 'string' && host.includes(':') && port == null) {
      const hp = parseHostPort(host, 3200);
      host = hp.host; port = hp.port;
    }
    return new RemoteBackend({ host: host || '127.0.0.1', port: port || 3200 });
  }
  throw new Error(`unknown backend kind: ${kind}`);
}

module.exports = {
  CrawlBackend,
  LocalBackend,
  RemoteBackend,
  getBackend,
  // helpers exported for tests
  parseHostPort,
  uniqueHostnamesFromUrls,
  httpRequest
};
