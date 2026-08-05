'use strict';

/**
 * HTML snapshot cache for dashboard pages whose page builds are synchronous
 * and too slow to run on the server's event loop.
 *
 * Latency census 2026-08-05 (cycle 205 chip): /quality spends 14-39s in
 * better-sqlite3 aggregates and /place-hubs ~6-9s in a jsgui3 render of an
 * 8.5MB matrix page. Both are fully synchronous, so a single request froze
 * EVERY route on the unified server until it finished.
 *
 * This is the same idiom as the countryStats / hostHealth caches in
 * unifiedApp/server.js (tasks #39/#40): the expensive build runs in a CHILD
 * process; the route serves the last snapshot instantly and kicks a
 * background re-build when the snapshot is stale (serve-stale +
 * refresh-when-stale). Until the first snapshot lands, routes serve the
 * small auto-refreshing page from renderComputingPage() with HTTP 200.
 *
 * Child contract: spawned as
 *   node <childModulePath> --out <tmpFile> ...childArgs(context)
 * and must write the complete HTML document to --out, exiting 0 on success.
 * stdout is ignored (require-time logging cannot corrupt the snapshot);
 * stderr is captured for diagnostics.
 *
 * At most ONE child runs per cache instance. Concurrent misses for other
 * keys simply keep serving their placeholder; the placeholder's refresh (or
 * the next request) re-kicks maybeRefresh() once the slot frees up.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * @param {Object} options
 * @param {string} options.childModulePath - Absolute path of the child script.
 * @param {Function} [options.childArgs] - (context) => extra argv for the child.
 * @param {string} [options.label] - Log prefix and tmp-file prefix.
 * @param {number} [options.ttlMs=45000] - Snapshot freshness window.
 * @param {number} [options.maxEntries=4] - Cache size cap (mind large pages:
 *   the place-hubs matrix snapshot is ~8.5MB per entry).
 * @param {number} [options.timeoutMs=180000] - Kill a child after this long.
 * @param {Object} [options.log=console]
 */
function createHtmlSnapshotCache(options = {}) {
  const {
    label = 'snapshot',
    ttlMs = 45000,
    maxEntries = 4,
    childModulePath,
    childArgs = () => [],
    timeoutMs = 180000,
    log = console
  } = options;

  if (!childModulePath) {
    throw new Error('createHtmlSnapshotCache requires childModulePath');
  }

  /** @type {Map<string, {html: string, at: number}>} */
  const entries = new Map();
  let inFlight = null; // { key, child, timer }
  let idleWaiters = [];

  function settleIdle() {
    const waiters = idleWaiters;
    idleWaiters = [];
    for (const resolve of waiters) resolve();
  }

  /** Last stored snapshot for key (any age — serve-stale), or null. */
  function get(key) {
    return entries.get(key) || null;
  }

  /**
   * Kick a background child build if the snapshot for key is missing or
   * stale and no child is already running. Never blocks.
   * @returns {'fresh'|'busy'|'refreshing'|'error'}
   */
  function maybeRefresh(key, context) {
    const entry = entries.get(key);
    if (entry && Date.now() - entry.at < ttlMs) return 'fresh';
    if (inFlight) return 'busy';

    const outFile = path.join(
      os.tmpdir(),
      `${label}-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.html`
    );
    const args = [childModulePath, '--out', outFile, ...childArgs(context)];

    let child;
    try {
      child = spawn(process.execPath, args, {
        cwd: process.cwd(),
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe']
      });
    } catch (err) {
      log.warn(`[${label}] failed to spawn snapshot child: ${err.message}`);
      return 'error';
    }

    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      if (stderr.length < 4000) stderr += chunk.toString();
    });
    child.stderr?.on('error', () => { /* diagnostics only — never crash the server */ });

    const timer = setTimeout(() => {
      try { child.kill(); } catch (_) { /* best effort */ }
    }, timeoutMs);
    inFlight = { key, child, timer };

    child.on('error', (err) => {
      clearTimeout(timer);
      inFlight = null;
      log.warn(`[${label}] snapshot child error: ${err.message}`);
      settleIdle();
    });

    child.on('exit', (code) => {
      clearTimeout(timer);
      inFlight = null;
      try {
        if (code === 0) {
          const html = fs.readFileSync(outFile, 'utf8');
          if (html) {
            entries.set(key, { html, at: Date.now() });
            evictOldest();
          }
        } else {
          log.warn(`[${label}] snapshot child exited ${code}${stderr ? `: ${stderr.slice(0, 400)}` : ''}`);
        }
      } catch (err) {
        log.warn(`[${label}] failed to read snapshot: ${err.message}`);
      } finally {
        fs.unlink(outFile, () => { });
        settleIdle();
      }
    });

    return 'refreshing';
  }

  function evictOldest() {
    while (entries.size > maxEntries) {
      let oldestKey = null;
      let oldestAt = Infinity;
      for (const [key, value] of entries) {
        if (value.at < oldestAt) {
          oldestAt = value.at;
          oldestKey = key;
        }
      }
      entries.delete(oldestKey);
    }
  }

  /** Resolves once no child build is in flight (immediately if idle). */
  function whenIdle() {
    if (!inFlight) return Promise.resolve();
    return new Promise((resolve) => idleWaiters.push(resolve));
  }

  function dispose() {
    if (inFlight) {
      clearTimeout(inFlight.timer);
      try { inFlight.child.kill(); } catch (_) { /* best effort */ }
      inFlight = null;
    }
    entries.clear();
    settleIdle();
  }

  return { get, maybeRefresh, whenIdle, dispose };
}

/**
 * Minimal HTTP-200 page served while the first snapshot is still building.
 * Auto-reloads until the real page is available (same UX as
 * /country-downloads' "Computing first snapshot…" state).
 */
function renderComputingPage(options = {}) {
  const {
    title = 'Computing…',
    message = 'Computing the latest snapshot.',
    refreshSeconds = 2
  } = options;
  const esc = (s) => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="${Number(refreshSeconds) || 2}">
<title>${esc(title)}</title>
<style>
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 90vh; margin: 0; }
  .snapshot-computing__card { text-align: center; max-width: 32rem; padding: 2rem; }
  .snapshot-computing__spinner { font-size: 2rem; animation: snapshot-spin 1.2s linear infinite; display: inline-block; }
  @keyframes snapshot-spin { to { transform: rotate(360deg); } }
  .snapshot-computing__card p { color: #94a3b8; }
</style>
</head>
<body class="snapshot-computing" data-snapshot-state="computing">
<div class="snapshot-computing__card">
  <span class="snapshot-computing__spinner">⏳</span>
  <h1>${esc(title)}</h1>
  <p>${esc(message)} This page refreshes automatically.</p>
</div>
</body>
</html>`;
}

module.exports = { createHtmlSnapshotCache, renderComputingPage };
