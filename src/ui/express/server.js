#!/usr/bin/env node

const express = require('express');
const compression = require('compression');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const { EventEmitter } = require('events');
const { evaluateDomainFromDb } = require('../../is_this_a_news_website');

function buildArgs(body) {
  const args = ['src/crawl.js'];
  const url = body.startUrl || 'https://www.theguardian.com';
  args.push(url);
  if (body.depth != null) args.push(`--depth=${parseInt(body.depth, 10)}`);
  if (body.maxPages != null) args.push(`--max-pages=${parseInt(body.maxPages, 10)}`);
  // Back-compat: accept either refetchIfOlderThan or legacy maxAge
  const refetch = body.refetchIfOlderThan || body.maxAge;
  if (refetch) {
    args.push(`--refetch-if-older-than=${String(refetch)}`);
  }
  if (body.concurrency != null) args.push(`--concurrency=${parseInt(body.concurrency, 10)}`);
  if (body.maxQueue != null) args.push(`--max-queue=${parseInt(body.maxQueue, 10)}`);
  if (body.noDb === true) args.push('--no-db');
  if (body.dbPath) args.push(`--db=${body.dbPath}`);
  if (body.slow === true) args.push('--slow');
  if (body.preferCache === true) args.push('--prefer-cache');
  // Fast-start: skip heavy DB size/count sampling at crawler init
  if (body.fastStart === true || String(process.env.UI_FAST_START||'').toLowerCase() === '1') {
    args.push('--fast-start');
  }
  // Sitemap controls
  // If sitemapOnly is true, it implies using sitemap regardless of useSitemap flag
  if (body.sitemapOnly === true) {
    args.push('--sitemap-only');
  } else if (body.useSitemap === false) {
    // Only disable sitemap when not in sitemap-only mode
    args.push('--no-sitemap');
  }
  // Align sitemap cap with maxPages if provided; removes need for a separate control
  if (body.maxPages != null) args.push(`--sitemap-max=${parseInt(body.maxPages, 10)}`);
  // Optional network/pacing configs
  if (body.requestTimeoutMs != null) args.push(`--request-timeout-ms=${parseInt(body.requestTimeoutMs, 10)}`);
  if (body.pacerJitterMinMs != null) args.push(`--pacer-jitter-min-ms=${parseInt(body.pacerJitterMinMs, 10)}`);
  if (body.pacerJitterMaxMs != null) args.push(`--pacer-jitter-max-ms=${parseInt(body.pacerJitterMaxMs, 10)}`);
  return args;
}

function defaultRunner() {
  // Allow switching to a lightweight fake runner for E2E via env
  if (String(process.env.UI_FORCE_SPAWN_FAIL || '').toLowerCase() === '1') {
    // Simulate a spawn error path to validate error surfacing in SSE and HTTP
    return {
      start() {
        const ee = new EventEmitter();
        // Use a small timeout to avoid races with SSE listener attachment
        setTimeout(() => {
          try { ee.emit('error', new Error('simulated spawn failure')); } catch (_) {}
        }, 30);
        return ee;
      }
    };
  }
  if (String(process.env.UI_FAKE_RUNNER || '').toLowerCase() === '1') {
    return {
      start() {
        const ee = new EventEmitter();
        // Provide stdout/stderr event emitters
        ee.stdout = new EventEmitter();
        ee.stderr = new EventEmitter();
        // Provide a stub stdin so /api/pause and /api/resume can function in tests
        ee.stdin = { write: () => true };
        ee.pid = 424242;
        ee.kill = () => { try { ee.emit('exit', null, 'SIGTERM'); } catch (_) {} };
        // Emit a quick sequence of logs and progress frames so the UI updates immediately
        setTimeout(() => {
          try { ee.stdout.emit('data', Buffer.from('Starting fake crawler\n', 'utf8')); } catch(_) {}
          // Optional: emit a very long log line to exercise truncation code path
          try {
            if (String(process.env.UI_FAKE_LONGLOG || process.env.UI_FAKE_RUNNER_LONGLOG || '').toLowerCase() === '1') {
              const longLine = 'X'.repeat(12000) + '\n';
              ee.stdout.emit('data', Buffer.from(longLine, 'utf8'));
            }
          } catch(_) {}
          // seed progress frames
          const frames = [
            { visited: 0, downloaded: 0, found: 0, saved: 0, errors: 0, queueSize: 1, robotsLoaded: true },
            { visited: 1, downloaded: 1, found: 0, saved: 0, errors: 0, queueSize: 0, robotsLoaded: true }
          ];
          for (const p of frames) {
            try { ee.stdout.emit('data', Buffer.from('PROGRESS ' + JSON.stringify(p) + '\n', 'utf8')); } catch(_) {}
          }
          try { ee.stdout.emit('data', Buffer.from('Final stats: 1 pages visited, 1 pages downloaded, 0 articles found, 0 articles saved\n', 'utf8')); } catch(_) {}
          // Give a little more time so pause/resume API broadcasts can be observed in SSE before exit
          setTimeout(() => { try { ee.emit('exit', 0, null); } catch(_) {} }, 200);
        }, 20);
        return ee;
      }
    };
  }
  return {
    start(args) {
      const node = process.execPath;
      // Ensure we run from repo root so relative 'src/crawl.js' resolves
      const repoRoot = path.join(__dirname, '..', '..', '..');
      const cp = spawn(node, args, { cwd: repoRoot, env: process.env });
      return cp;
    }
  };
}

function createApp(options = {}) {
  const runner = options.runner || defaultRunner();
  // Allow overriding DB path via options or environment for test isolation
  const envDb = process.env.DB_PATH || process.env.UI_DB_PATH || '';
  const urlsDbPath = options.dbPath || (envDb ? envDb : path.join(__dirname, '..', '..', '..', 'data', 'news.db'));
  // Verbose logging (disabled by default). Enable with options.verbose=true or UI_VERBOSE=1|true
  const verbose = options.verbose === true || String(process.env.UI_VERBOSE || '').toLowerCase() === '1' || String(process.env.UI_VERBOSE || '').toLowerCase() === 'true';
  const app = express();
  const sseClients = new Set(); // stores { res, logsEnabled }
  let child = null;
  let startedAt = null;
  let lastExit = null;
  // Track simple metadata for the currently running crawl (for jobs list)
  let currentJobMeta = null; // { id: 'active', url, args }
  let stdoutBuf = '';
  let stderrBuf = '';
  let lastProgressStr = '';
  let lastProgressSentAt = 0;
  let paused = false;
  // Track an in-flight forced-kill escalation timer for child so we don't double-escalate
  let childKillTimer = null;
  // Log flood controls
  const LOGS_MAX_PER_SEC = Math.max(50, parseInt(process.env.UI_LOGS_MAX_PER_SEC || '200', 10) || 200);
  const LOG_LINE_MAX_CHARS = Math.max(512, parseInt(process.env.UI_LOG_LINE_MAX_CHARS || '8192', 10) || 8192);
  let logRate = { windowStart: 0, count: 0, dropped: 0 };
  // Tiny in-memory TTL cache for expensive aggregates
  const summaryCache = {
    ttlMs: 60 * 1000,
    at: 0,
    data: null
  };
  // metrics snapshot populated from PROGRESS events
  let metrics = {
    visited: 0,
    downloaded: 0,
    found: 0,
    saved: 0,
    errors: 0,
    queueSize: 0,
    running: 0,
    // for rates
    _lastSampleTime: 0,
    _lastVisited: 0,
    _lastDownloaded: 0,
    requestsPerSec: 0,
    downloadsPerSec: 0,
  errorRatePerMin: 0,
  bytesPerSec: 0,
  cacheHitRatio1m: 0
  };
  // Throttle for jobs list SSE
  let jobsLastSentAt = 0;

  function summaryJobs() {
    try {
      if (!child) return { count: 0, items: [] };
      const item = {
        id: (currentJobMeta?.id || 'current'),
        pid: child?.pid || null,
        url: currentJobMeta?.url || null,
        startedAt,
        paused: !!paused,
        visited: metrics.visited || 0,
        downloaded: metrics.downloaded || 0,
        errors: metrics.errors || 0,
        queueSize: metrics.queueSize || 0,
        lastActivityAt: metrics._lastProgressWall || null,
        status: 'running'
      };
      return { count: 1, items: [item] };
    } catch (_) {
      return { count: 0, items: [] };
    }
  }

  function broadcastJobs(force = false) {
    const now = Date.now();
    if (!force && now - jobsLastSentAt < 200) return; // ~5 Hz
    jobsLastSentAt = now;
    const payload = summaryJobs();
    try { broadcast('jobs', payload); } catch (_) {}
  }

  app.use(express.json());
  // Enable gzip compression for most responses, but explicitly skip SSE (/events)
  app.use(compression({
    filter: (req, res) => {
      try {
        // Never compress Server-Sent Events; compression can break streaming
        if (req.path === '/events') return false;
        return compression.filter(req, res);
      } catch (_) {
        return false;
      }
    }
  }));
  // Static assets with cache headers
  app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1h',
    etag: true,
    lastModified: true
  }));

  // Serve shared UI assets (CSS/JS) from src/ui/public at /assets
  app.use('/assets', express.static(path.join(__dirname, '..', 'public'), {
    maxAge: '1h',
    etag: true,
    lastModified: true
  }));

  // Unified navigation header renderer
  function renderGlobalNav(active) {
    const is = (k) => String(active) === k;
    const link = (href, label, key) => {
      const a = `<a href="${href}"${is(key)?' style="font-weight:600"':''}>${label}</a>`;
      return a;
    };
    return `<nav class="meta">${[
      link('/', 'Crawler', 'crawler'),
      link('/gazetteer', 'Gazetteer', 'gazetteer'),
      link('/domains', 'Domains', 'domains'),
      link('/errors', 'Errors', 'errors'),
      link('/urls', 'URLs', 'urls')
    ].join(' · ')}</nav>`;
  }

  // Simple tracing helper for SSR pages (gated by verbose)
  function startTrace(req, tag = 'gazetteer') {
    if (!verbose) {
      // No-op tracer
      const noop = () => {};
      return { pre: () => noop, end: noop };
    }
    const start = Date.now();
    try { console.log(`[${tag}] request ${req.method} ${req.originalUrl || req.url}`); } catch (_) {}
    const pre = (name) => {
      const t = Date.now();
      try { console.log(`pre[${name}]`); } catch (_) {}
      return () => { try { console.log(`post[${name}] (+${Date.now() - t}ms)`); } catch (_) {} };
    };
    const end = () => { try { console.log(`[${tag}] done (+${Date.now() - start}ms)`); } catch (_) {} };
    return { pre, end };
  }

  function broadcast(event, data) {
    // Helper to write directly to clients without re-entering rate logic
    const writeToClients = (ev, obj) => {
      const payload = `event: ${ev}\ndata: ${JSON.stringify(obj)}\n\n`;
      for (const client of sseClients) {
        if (ev === 'log' && client.logsEnabled === false) continue;
        try {
          client.res.write(payload);
          client.res.flush?.();
        } catch (_) { /* ignore broken pipe */ }
      }
    };

  if (event === 'log') {
      // Guard against oversized lines
      try {
        if (data && typeof data.line === 'string' && data.line.length > LOG_LINE_MAX_CHARS) {
          const over = data.line.length - LOG_LINE_MAX_CHARS;
          data = { ...data, line: data.line.slice(0, LOG_LINE_MAX_CHARS) + `… [truncated ${over} chars]\n` };
        }
      } catch (_) {}
      const now = Date.now();
      // New window: emit drop notice if needed, then reset
      if (now - logRate.windowStart >= 1000) {
        if (logRate.dropped > 0) {
          writeToClients('log', { stream: 'server', line: `[server] log rate limit: dropped ${logRate.dropped} lines in last second\n` });
        }
        logRate = { windowStart: now, count: 0, dropped: 0 };
      }
      if (logRate.count >= LOGS_MAX_PER_SEC) {
        logRate.dropped++;
        // Emit an immediate one-time notice the first time we drop in this window
        if (logRate.dropped === 1) {
          writeToClients('log', { stream: 'server', line: `[server] log rate limit: dropping logs (max ${LOGS_MAX_PER_SEC}/s)\n` });
        }
        return; // drop this log event
      }
      logRate.count++;
      return writeToClients(event, data);
    }

    // Default path for non-log events
    writeToClients(event, data);
  }

  function broadcastProgress(obj) {
    try {
      const now = Date.now();
      const s = JSON.stringify(obj);
      if (s === lastProgressStr && now - lastProgressSentAt < 200) return; // dedupe & throttle
      lastProgressStr = s;
      lastProgressSentAt = now;
      // update metrics
      const prevTime = metrics._lastSampleTime || now;
      const dt = (now - prevTime) / 1000;
      if (dt > 0.2) {
        const dvVisited = (obj.visited || 0) - (metrics._lastVisited || 0);
        const dvDownloaded = (obj.downloaded || 0) - (metrics._lastDownloaded || 0);
        metrics.requestsPerSec = Math.max(0, dvVisited / dt);
        metrics.downloadsPerSec = Math.max(0, dvDownloaded / dt);
        const dErrors = (obj.errors || 0) - (metrics.errors || 0);
        metrics.errorRatePerMin = Math.max(0, dErrors) * (60 / dt);
        metrics._lastVisited = obj.visited || 0;
        metrics._lastDownloaded = obj.downloaded || 0;
        metrics._lastSampleTime = now;
      }
      metrics.visited = obj.visited || 0;
      metrics.downloaded = obj.downloaded || 0;
      metrics.found = obj.found || 0;
      metrics.saved = obj.saved || 0;
      metrics.errors = obj.errors || 0;
      metrics.queueSize = obj.queueSize || 0;
      // Optional: compute bytes/sec and cache ratio hints if present
      try {
        const last = metrics._lastProgressWall || now;
        const dt2 = Math.max(0.001, (now - last) / 1000);
        if (obj.bytes != null && typeof obj.bytes === 'number') {
          const prevBytes = metrics._lastBytes || 0;
          const db = Math.max(0, obj.bytes - prevBytes);
          metrics.bytesPerSec = db / dt2;
          metrics._lastBytes = obj.bytes;
        }
      } catch (_) {}
      if (Object.prototype.hasOwnProperty.call(obj, 'paused')) {
        paused = !!obj.paused;
      }
  metrics._lastProgressWall = now;
      broadcast('progress', obj);
    } catch (_) {
      // fallback
      broadcast('progress', obj);
    }
  }

  app.get('/api/status', (req, res) => {
    try { console.log(`[api] GET /api/status -> running=${!!child}`); } catch (_) {}
    res.json({
      running: !!child,
      pid: child?.pid || null,
      startedAt,
  lastExit,
  paused
    });
  });

  app.post('/api/crawl', (req, res) => {
    try { console.log(`[api] POST /api/crawl received (running=${!!child})`); } catch (_) {}
    if (child) {
      try { console.log(`[api] POST /api/crawl -> 409 already-running pid=${child?.pid||'n/a'}`); } catch (_) {}
      return res.status(409).json({ error: 'Crawler already running' });
    }

    const args = buildArgs(req.body || {});
    // Ensure crawler child uses the same DB as the UI server unless explicitly overridden
    if (!args.some(a => /^--db=/.test(a))) {
      args.push(`--db=${urlsDbPath}`);
    }
  child = runner.start(args);
  try {
      // Best-effort derive URL for jobs list
      const urlArg = Array.isArray(args) && args.length > 1 ? args[1] : null;
      currentJobMeta = { id: 'current', url: urlArg, args: [...args] };
    } catch (_) { currentJobMeta = { id: 'current', url: null, args: [...args] }; }
  // Track early-output watchdog to detect slow startup
  let childOutputSeen = false;
    // Normalize interface: ensure stdout/stderr are EventEmitters that emit 'data'
    if (!child.stdout) child.stdout = new EventEmitter();
    if (!child.stderr) child.stderr = new EventEmitter();

    // Prepare common exit handler up-front so we can attach listeners immediately
    let exitEmitted = false;
    const onExit = (code, signal) => {
      if (exitEmitted) return; // guard against both 'exit' and 'close'
      exitEmitted = true;
      try { if (childKillTimer) { clearTimeout(childKillTimer); childKillTimer = null; } } catch (_) {}
      lastExit = { code, signal, endedAt: new Date().toISOString() };
      try { console.log(`[child] exit code=${code} signal=${signal}`); } catch (_) {}
      broadcast('done', lastExit);
      // jobs list becomes empty
      broadcastJobs(true);
      stdoutBuf = '';
      stderrBuf = '';
      child = null;
      startedAt = null;
      metrics.running = 0;
      paused = false;
      currentJobMeta = null;
    };
    // Attach error/exit listeners immediately to avoid missing early events
    if (typeof child.on === 'function') {
      child.on('exit', onExit);
      child.on('close', (code, signal) => onExit(code, signal));
      child.on('error', (err) => {
        try { if (childKillTimer) { clearTimeout(childKillTimer); childKillTimer = null; } } catch (_) {}
        const msg = (err && err.message) ? err.message : String(err);
        try { console.log(`[child] error: ${msg}`); } catch (_) {}
        lastExit = { error: msg, endedAt: new Date().toISOString() };
        broadcast('log', { stream: 'server', line: `[server] crawler failed to start: ${msg}\n` });
        broadcast('done', lastExit);
        broadcastJobs(true);
        stdoutBuf = '';
        stderrBuf = '';
        child = null;
        startedAt = null;
        metrics.running = 0;
        paused = false;
        currentJobMeta = null;
      });
    }

  startedAt = new Date().toISOString();
  metrics.running = 1;
  metrics._lastSampleTime = Date.now();
  metrics._lastVisited = 0;
  metrics._lastDownloaded = 0;
  lastExit = null;
  paused = false;

    // Immediately surface that the crawler has started and seed a progress frame so the UI updates
    try {
      broadcast('log', { stream: 'server', line: `[server] starting crawler pid=${child?.pid || 'n/a'}\n` });
      broadcastProgress({ visited: 0, downloaded: 0, found: 0, saved: 0, errors: 0, queueSize: 0, paused: false });
      try { console.log(`[api] crawler started pid=${child?.pid||'n/a'} args=${JSON.stringify(args)}`); } catch (_) {}
    } catch (_) {}
    // Seed jobs list right away
    try { broadcastJobs(true); } catch (_) {}

    // Startup watchdog: if no child output or progress within a short window, surface hints
    try {
      const t1 = setTimeout(() => {
        try {
          if (!childOutputSeen && child) {
            const hint = '[server] waiting for crawler output… (this can be caused by large SQLite DB init or slow network)';
            console.log(hint);
            broadcast('log', { stream: 'server', line: hint + '\n' });
          }
        } catch (_) {}
      }, 3000);
      t1.unref?.();
      const t2 = setTimeout(() => {
        try {
          if (!childOutputSeen && child) {
            const hint = '[server] still waiting… check firewall/proxy and DB availability; try depth=0, maxPages=1';
            console.log(hint);
            broadcast('log', { stream: 'server', line: hint + '\n' });
          }
        } catch (_) {}
      }, 10000);
      t2.unref?.();
    } catch (_) {}

  child.stdout.on('data', (chunk) => {
      childOutputSeen = true;
      stdoutBuf += chunk.toString();
      let idx;
      while ((idx = stdoutBuf.indexOf('\n')) !== -1) {
        const line = stdoutBuf.slice(0, idx);
        stdoutBuf = stdoutBuf.slice(idx + 1);
        if (!line) continue;
        // Mirror a few key lines to server console for live diagnostics (keep noise low)
        try {
          if (/^(Loading robots\.txt|robots\.txt loaded|Fetching:|Sitemap enqueue complete|Crawling completed|Final stats)/.test(line)) {
            console.log(`[child:stdout] ${line}`);
          }
        } catch (_) {}
        // Prefer structured events over raw log echoes to reduce client work
        if (line.startsWith('ERROR ')) {
          try {
            const obj = JSON.parse(line.slice('ERROR '.length));
            broadcast('error', obj);
            continue;
          } catch (_) {}
        }
        if (line.startsWith('CACHE ')) {
          try {
            const obj = JSON.parse(line.slice('CACHE '.length));
            broadcast('cache', obj);
            continue;
          } catch (_) {}
        }
        if (line.startsWith('PROGRESS ')) {
          try {
            const obj = JSON.parse(line.slice('PROGRESS '.length));
            try { console.log(`[child:progress] v=${obj.visited||0} d=${obj.downloaded||0} q=${obj.queueSize||0}`); } catch (_) {}
            broadcastProgress(obj);
            broadcastJobs(false);
            continue;
          } catch (_) {}
        }
        const m = line.match(/Final stats: (\d+) pages visited, (\d+) pages downloaded, (\d+) articles found, (\d+) articles saved/);
        if (m) {
          broadcastProgress({
            visited: parseInt(m[1], 10),
            downloaded: parseInt(m[2], 10),
            found: parseInt(m[3], 10),
            saved: parseInt(m[4], 10)
          });
          continue;
        }
        // If not a structured line, forward as log (rate-limited in broadcast)
        broadcast('log', { stream: 'stdout', line: line + '\n' });
      }
    });

    child.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString();
      let idx;
      while ((idx = stderrBuf.indexOf('\n')) !== -1) {
        const line = stderrBuf.slice(0, idx);
        stderrBuf = stderrBuf.slice(idx + 1);
        if (!line) continue;
        // Rate-limited in broadcast
        broadcast('log', { stream: 'stderr', line: line + '\n' });
      }
    });

    // (exit/error handlers already attached above)

    res.status(202).json({ pid: child.pid || null, args });
  });

  // List ongoing crawls (single active crawl for now)
  app.get('/api/crawls', (req, res) => {
    try {
      const payload = summaryJobs();
      res.json(payload);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/stop', (req, res) => {
    if (!child) return res.status(200).json({ stopped: false });
    try {
      const target = child; // capture current
      if (typeof target.kill === 'function') target.kill('SIGTERM');
      // Escalate if the process does not exit promptly
      try { if (childKillTimer) { clearTimeout(childKillTimer); childKillTimer = null; } } catch (_) {}
      childKillTimer = setTimeout(() => {
        try {
          if (target && !target.killed) {
            // On Windows, SIGKILL may still work via Node; additionally attempt taskkill
            try { target.kill('SIGKILL'); } catch (_) {}
            if (process.platform === 'win32' && target.pid) {
              try {
                const { exec } = require('child_process');
                exec(`taskkill /PID ${target.pid} /T /F`);
              } catch (_) {}
            }
          }
        } catch (_) {}
      }, 800);
      try { childKillTimer.unref?.(); } catch (_) {}
      try { console.log(`[api] POST /api/stop -> 202 stop requested pid=${target?.pid||'n/a'}`); } catch (_) {}
      res.status(202).json({ stopped: true, escalatesInMs: 800 });
    } catch (e) {
      try { console.log(`[api] POST /api/stop -> 500 ${e?.message||e}`); } catch (_) {}
      res.status(500).json({ error: e.message });
    }
  });

  // Pause/resume endpoints: communicate via child stdin line commands
  app.post('/api/pause', (req, res) => {
    if (!child) return res.status(409).json({ error: 'Crawler not running' });
    try {
      if (child.stdin && !child.killed) {
        child.stdin.write('PAUSE\n');
        paused = true;
        broadcastProgress({ ...metrics, paused: true });
        try { console.log('[api] POST /api/pause -> paused=true'); } catch (_) {}
        return res.json({ ok: true, paused: true });
      }
      try { console.log('[api] POST /api/pause -> 500 stdin unavailable'); } catch (_) {}
      return res.status(500).json({ error: 'stdin unavailable' });
    } catch (e) {
      try { console.log(`[api] POST /api/pause -> 500 ${e?.message||e}`); } catch (_) {}
      return res.status(500).json({ error: e.message });
    }
  });
  app.post('/api/resume', (req, res) => {
    if (!child) return res.status(409).json({ error: 'Crawler not running' });
    try {
      if (child.stdin && !child.killed) {
        child.stdin.write('RESUME\n');
        paused = false;
        broadcastProgress({ ...metrics, paused: false });
        try { console.log('[api] POST /api/resume -> paused=false'); } catch (_) {}
        return res.json({ ok: true, paused: false });
      }
      try { console.log('[api] POST /api/resume -> 500 stdin unavailable'); } catch (_) {}
      return res.status(500).json({ error: 'stdin unavailable' });
    } catch (e) {
      try { console.log(`[api] POST /api/resume -> 500 ${e?.message||e}`); } catch (_) {}
      return res.status(500).json({ error: e.message });
    }
  });

  // Prometheus metrics endpoint
  app.get('/metrics', (req, res) => {
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    const lines = [];
    lines.push('# HELP crawler_running Whether the crawler is running (1) or not (0)');
    lines.push('# TYPE crawler_running gauge');
    lines.push(`crawler_running ${metrics.running}`);
  lines.push('# HELP crawler_paused Whether the crawler is paused (1) or not (0)');
  lines.push('# TYPE crawler_paused gauge');
  lines.push(`crawler_paused ${paused ? 1 : 0}`);
    lines.push('# HELP crawler_requests_total Pages visited');
    lines.push('# TYPE crawler_requests_total counter');
    lines.push(`crawler_requests_total ${metrics.visited}`);
    lines.push('# HELP crawler_downloads_total Pages downloaded');
    lines.push('# TYPE crawler_downloads_total counter');
    lines.push(`crawler_downloads_total ${metrics.downloaded}`);
    lines.push('# HELP crawler_articles_found_total Articles detected');
    lines.push('# TYPE crawler_articles_found_total counter');
    lines.push(`crawler_articles_found_total ${metrics.found}`);
    lines.push('# HELP crawler_articles_saved_total Articles saved');
    lines.push('# TYPE crawler_articles_saved_total counter');
    lines.push(`crawler_articles_saved_total ${metrics.saved}`);
    lines.push('# HELP crawler_errors_total Errors encountered');
    lines.push('# TYPE crawler_errors_total counter');
    lines.push(`crawler_errors_total ${metrics.errors}`);
    lines.push('# HELP crawler_queue_size Items currently in the queue');
    lines.push('# TYPE crawler_queue_size gauge');
    lines.push(`crawler_queue_size ${metrics.queueSize}`);
    lines.push('# HELP crawler_requests_per_second Recent request rate');
    lines.push('# TYPE crawler_requests_per_second gauge');
    lines.push(`crawler_requests_per_second ${metrics.requestsPerSec || 0}`);
    lines.push('# HELP crawler_downloads_per_second Recent download rate');
    lines.push('# TYPE crawler_downloads_per_second gauge');
    lines.push(`crawler_downloads_per_second ${metrics.downloadsPerSec || 0}`);
  lines.push('# HELP crawler_bytes_per_second Recent network bytes per second');
  lines.push('# TYPE crawler_bytes_per_second gauge');
  lines.push(`crawler_bytes_per_second ${metrics.bytesPerSec || 0}`);
  // Cache ratio is approximated in the client; server exports 0 unless set from progress in future
  lines.push('# HELP crawler_cache_hit_ratio Cache hit ratio (0..1) over recent window');
  lines.push('# TYPE crawler_cache_hit_ratio gauge');
  lines.push(`crawler_cache_hit_ratio ${metrics.cacheHitRatio1m || 0}`);
    lines.push('# HELP crawler_error_rate_per_min Errors per minute (recent)');
    lines.push('# TYPE crawler_error_rate_per_min gauge');
    lines.push(`crawler_error_rate_per_min ${metrics.errorRatePerMin || 0}`);
    res.send(lines.join('\n') + '\n');
  });

  app.get('/events', (req, res) => {
    // Strong SSE headers to avoid proxy buffering and enable streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    // Disable buffering on reverse proxies like Nginx
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const logsEnabled = String(req.query?.logs ?? '1') !== '0';
    // Keep a heartbeat to ensure intermediaries flush the stream
    const heartbeat = setInterval(() => {
      try {
        res.write(`: ping\n\n`);
        res.flush?.();
      } catch (_) { /* ignore */ }
    }, 10000);
    try { heartbeat.unref?.(); } catch (_) {}

  const client = { res, logsEnabled, heartbeat };
    sseClients.add(client);
  try { console.log(`[sse] connect logs=${logsEnabled} clients=${sseClients.size}`); } catch (_) {}
    // Seed a one-time log so users immediately see the stream is active
    try {
      if (logsEnabled) {
        // Use broadcast to apply rate-limit/truncation consistently
        broadcast('log', { stream: 'server', line: '[sse] log stream enabled\n' });
      }
    } catch (_) {}
    const cleanup = () => {
      try { clearInterval(heartbeat); } catch (_) {}
      try { client.heartbeat && client.heartbeat.unref?.(); } catch (_) {}
      sseClients.delete(client);
      try { console.log(`[sse] disconnect clients=${sseClients.size}`); } catch (_) {}
    };
    req.on('close', cleanup);
    res.on('close', cleanup);
    res.on('finish', cleanup);
  });

  // Lightweight health endpoint
  app.get('/health', (req, res) => {
    res.json({
      running: !!child,
      queueSize: metrics.queueSize || 0,
  lastProgressAt: metrics._lastProgressWall || null,
  paused
    });
  });

  // List article URLs from the DB as JSON array (paginated)
  app.get('/api/urls', (req, res) => {
    try {
      // Lazy require DB to avoid crashing if native module is unavailable
      let NewsDatabase;
      try {
        NewsDatabase = require('../../db');
      } catch (e) {
        return res.status(503).json({ error: 'Database unavailable', detail: e.message });
      }
      const db = new NewsDatabase(urlsDbPath);
  const limit = Math.max(1, Math.min(parseInt(req.query.limit || '200', 10) || 200, 5000));
  const offset = Math.max(0, parseInt(req.query.offset || '0', 10) || 0);
  const cursorRaw = String(req.query.cursor || '').trim(); // base64 json { ts, url }
      const details = String(req.query.details || '0') === '1';
      const dirRaw = String(req.query.dir || '').toLowerCase();
      const dir = dirRaw === 'asc' ? 'ASC' : 'DESC';

  const host = String(req.query.host || '').trim().toLowerCase();
      const includeSub = String(req.query.includeSubdomains || req.query.subdomains || '0') === '1';
      const from = String(req.query.from || '').trim();
      const to = String(req.query.to || '').trim();
      const minWord = parseInt(String(req.query.minWordCount || '0'), 10) || 0;
      const classification = String(req.query.classification || '').trim().toLowerCase(); // 'article'|'nav'|'other'
      const status = parseInt(String(req.query.status || ''), 10);

      const where = [];
      const params = [];
      // Base time and host filtering on articles.ts
      if (from) { where.push('COALESCE(a.fetched_at, a.crawled_at) >= ?'); params.push(from); }
      if (to) { where.push('COALESCE(a.fetched_at, a.crawled_at) <= ?'); params.push(to); }
      if (host) {
        if (includeSub) {
          where.push('(EXISTS (SELECT 1 FROM urls u WHERE u.url = a.url AND (u.host = ? OR u.host LIKE ?)))');
          params.push(host, `%.${host}`);
        } else {
          where.push('(EXISTS (SELECT 1 FROM urls u WHERE u.url = a.url AND u.host = ?))');
          params.push(host);
        }
      }
      // Join latest fetch per URL for status/classification/word_count filters
      const havingFetchFilter = (!isNaN(status) && status > 0) || minWord > 0 || (classification && ['article','nav','other'].includes(classification));
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const totalRow = db.db.prepare(`SELECT COUNT(*) AS c FROM articles a ${whereSql}`).get(...params);
      const total = totalRow?.c || 0;

      let sql = `
        SELECT a.url, a.title,
               COALESCE(lf.ts, a.fetched_at, a.crawled_at) AS order_ts,
               COALESCE(a.fetched_at, a.crawled_at) AS ts,
               lf.http_status AS http_status, lf.classification AS classification, lf.word_count AS word_count
        FROM articles a
        LEFT JOIN latest_fetch lf ON lf.url = a.url
        ${whereSql}
      `;
  const addFetchPred = [];
      const fetchParams = [];
  if (!isNaN(status) && status > 0) { addFetchPred.push('lf.http_status = ?'); fetchParams.push(status); }
  if (minWord > 0) { addFetchPred.push('(lf.word_count IS NOT NULL AND lf.word_count >= ?)'); fetchParams.push(minWord); }
  if (classification && ['article','nav','other'].includes(classification)) { addFetchPred.push('LOWER(lf.classification) = ?'); fetchParams.push(classification); }
      if (addFetchPred.length) {
        sql += (whereSql ? ' AND ' : ' WHERE ') + addFetchPred.join(' AND ');
      }

      // Keyset pagination if cursor provided
      let cursor = null;
      try { if (cursorRaw) cursor = JSON.parse(Buffer.from(cursorRaw, 'base64').toString('utf8')); } catch(_) { cursor = null; }
      const orderDir = dir;
      const keysetPred = [];
      const keysetParams = [];
      if (cursor && cursor.ts && cursor.url) {
        if (orderDir === 'DESC') {
          keysetPred.push('(order_ts < ? OR (order_ts = ? AND a.url < ?))');
          keysetParams.push(cursor.ts, cursor.ts, cursor.url);
        } else {
          keysetPred.push('(order_ts > ? OR (order_ts = ? AND a.url > ?))');
          keysetParams.push(cursor.ts, cursor.ts, cursor.url);
        }
      }
      if (keysetPred.length) {
        sql += (sql.includes(' WHERE ') ? ' AND ' : ' WHERE ') + keysetPred.join(' AND ');
      }
      sql += ` ORDER BY (order_ts IS NULL) ASC, order_ts ${orderDir}, a.url ${orderDir} LIMIT ?`;
      const rows = db.db.prepare(sql).all(...params, ...fetchParams, ...keysetParams, limit);
      const urls = rows.map(r => r.url);
      db.close();
      // Prepare cursors
      let nextCursor = null;
      let prevCursor = null;
      if (rows.length > 0) {
        const first = rows[0];
        const last = rows[rows.length - 1];
        const encode = (obj) => Buffer.from(JSON.stringify(obj), 'utf8').toString('base64');
        if (orderDir === 'DESC') {
          nextCursor = encode({ ts: last.order_ts || last.ts || null, url: last.url });
          prevCursor = encode({ ts: first.order_ts || first.ts || null, url: first.url });
        } else {
          nextCursor = encode({ ts: last.order_ts || last.ts || null, url: last.url });
          prevCursor = encode({ ts: first.order_ts || first.ts || null, url: first.url });
        }
      }
      if (details) {
        const items = rows.map(r => ({ url: r.url, title: r.title || null, ts: r.ts || null, http_status: r.http_status ?? null, classification: r.classification || null, word_count: r.word_count ?? null }));
        return res.json({ count: items.length, total, limit, offset, urls, items, nextCursor, prevCursor });
      }
      res.json({ count: urls.length, total, limit, offset, urls, nextCursor, prevCursor });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // System health: DB size and free disk (best-effort)
  app.get('/api/system-health', (req, res) => {
    try {
      const dbPath = urlsDbPath;
      let dbSizeBytes = null;
      try { dbSizeBytes = fs.statSync(dbPath).size; } catch (_) {}
      let freeDiskBytes = null;
      try {
        const os = require('os');
        // Fall back to platform-specific shell calls
        const { execSync } = require('child_process');
        if (process.platform === 'win32') {
          const drive = path.parse(dbPath).root || 'C:\\';
          const out = execSync('wmic logicaldisk get size,freespace,caption', { stdio: ['ignore','pipe','ignore'] }).toString();
          const lines = out.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
          for (const line of lines) {
            const m = line.match(/^([A-Z]:)\s+(\d+)\s+(\d+)$/i) || line.match(/^([A-Z]:)\s+(\d+)\s+(\d+)/i);
            if (m && drive.toUpperCase().startsWith(m[1].toUpperCase())) {
              freeDiskBytes = parseInt(m[2], 10);
              break;
            }
          }
        } else {
          const out = execSync('df -k .', { cwd: path.dirname(dbPath), stdio: ['ignore','pipe','ignore'] }).toString();
          const lines = out.trim().split(/\n/);
          if (lines.length >= 2) {
            const parts = lines[1].trim().split(/\s+/);
            const availK = parseInt(parts[3], 10);
            if (!isNaN(availK)) freeDiskBytes = availK * 1024;
          }
        }
        if (freeDiskBytes == null) {
          // As a last resort, expose free memory so UI can show something
          freeDiskBytes = os.freemem();
        }
      } catch (_) {}
      // Process memory and CPU (best-effort, CPU is process share of one core since last call)
      let mem = null;
      let cpu = null;
      try {
        const os = require('os');
        const mu = process.memoryUsage();
        mem = { rss: mu.rss, heapUsed: mu.heapUsed, heapTotal: mu.heapTotal, external: mu.external };
        // Keep prev sample on app locals
        app.locals._cpuPrev = app.locals._cpuPrev || { usage: process.cpuUsage(), time: process.hrtime.bigint() };
        const nowUsage = process.cpuUsage();
        const nowTime = process.hrtime.bigint();
        const prev = app.locals._cpuPrev;
        const deltaUserUs = Math.max(0, nowUsage.user - prev.usage.user);
        const deltaSysUs = Math.max(0, nowUsage.system - prev.usage.system);
        const deltaNs = Number(nowTime - prev.time);
        const elapsedMs = deltaNs / 1e6;
        const totalUs = deltaUserUs + deltaSysUs;
        const pctOfOneCore = elapsedMs > 0 ? Math.max(0, Math.min(100, (totalUs / 1000) / elapsedMs * 100)) : 0;
        const cores = Math.max(1, (os.cpus()?.length || 1));
        const pctOfAllCores = Math.max(0, Math.min(100, pctOfOneCore / cores));
        cpu = { percent: pctOfAllCores, percentOfOneCore: pctOfOneCore };
        app.locals._cpuPrev = { usage: nowUsage, time: nowTime };
      } catch (_) {}
      // SQLite WAL autocheckpoint setting (read-only open to avoid heavy init)
      let walAutocheckpoint = null;
      let journalMode = null;
      try {
        let openDbReadOnly;
        try { ({ openDbReadOnly } = require('../../ensure_db')); } catch (e) { openDbReadOnly = null; }
        if (openDbReadOnly) {
          const db = openDbReadOnly(urlsDbPath);
          try { journalMode = db.pragma('journal_mode', { simple: true }); } catch(_) {}
          try { walAutocheckpoint = db.pragma('wal_autocheckpoint', { simple: true }); } catch(_) {}
          try { db.close(); } catch(_) {}
        }
      } catch (_) {}
      res.json({ dbSizeBytes, freeDiskBytes, memory: mem, cpu, journalMode, walAutocheckpoint });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Recent errors grouped by status and host, with examples
  app.get('/api/recent-errors', (req, res) => {
    let NewsDatabase;
    try { NewsDatabase = require('../../db'); } catch (e) {
  // Graceful fallback: empty list so UI doesn't break
  return res.status(200).json({ totalGroups: 0, totalRows: 0, errors: [] });
    }
    const limitRows = Math.max(100, Math.min(parseInt(req.query.rows || '1000', 10) || 1000, 5000));
    try {
      const db = new NewsDatabase(urlsDbPath);
      // Prefer new errors table; fallback to fetches if empty
      let rows = [];
      try {
        rows = db.db.prepare(`
          SELECT url, host, kind, code AS status, at AS ts
          FROM errors
          ORDER BY at DESC
          LIMIT ?
        `).all(limitRows);
      } catch (_) { rows = []; }
      if (!rows || rows.length === 0) {
        rows = db.db.prepare(`
          SELECT url, http_status AS status, fetched_at AS ts
          FROM fetches
          WHERE http_status >= 400 AND fetched_at IS NOT NULL
          ORDER BY fetched_at DESC
          LIMIT ?
        `).all(limitRows);
      }
      db.close();
      const groups = new Map(); // key: `${status}|${host}` -> { status, host, count, examples: [] }
      for (const r of rows) {
        let host = (r.host || '').toLowerCase();
        if (!host) { try { host = new URL(r.url).hostname.toLowerCase(); } catch (_) { host = ''; } }
        const key = `${r.status}|${host}`;
        if (!groups.has(key)) groups.set(key, { status: r.status, host, count: 0, examples: [] });
        const g = groups.get(key);
        g.count += 1;
        if (g.examples.length < 3) g.examples.push({ url: r.url, ts: r.ts });
      }
      const list = Array.from(groups.values()).sort((a,b) => b.count - a.count).slice(0, 50);
  res.json({ totalGroups: list.length, totalRows: rows.length, errors: list });
    } catch (e) {
  // Graceful fallback: return empty payload
  res.status(200).json({ totalGroups: 0, totalRows: 0, errors: [] });
    }
  });

  // Errors page route
  app.get('/errors', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'errors.html'));
  });

  // Return a portion of a fetched file's body by fetch ID (text only)
  app.get('/api/fetch-body', (req, res) => {
    let NewsDatabase;
    try { NewsDatabase = require('../../db'); } catch (e) {
      return res.status(503).json({ error: 'Database unavailable', detail: e.message });
    }
    const id = parseInt(String(req.query.id || ''), 10);
    if (!id || isNaN(id)) return res.status(400).json({ error: 'Missing or invalid id' });
    try {
      const db = new NewsDatabase(urlsDbPath);
      const row = db.db.prepare('SELECT id, file_path, content_type, content_encoding FROM fetches WHERE id = ?').get(id);
      db.close();
      if (!row || !row.file_path) return res.status(404).json({ error: 'No body available for this fetch' });
      const p = row.file_path;
      try {
        const stat = fs.statSync(p);
        const max = 512 * 1024; // 512KB cap
        const fd = fs.openSync(p, 'r');
        const size = Math.min(stat.size, max);
        const buf = Buffer.alloc(size);
        fs.readSync(fd, buf, 0, size, 0);
        fs.closeSync(fd);
        const text = buf.toString('utf8');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(text);
      } catch (e) {
        res.status(500).json({ error: 'Failed to read body', detail: e.message });
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // URL details page route
  app.get('/url', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'url.html'));
  });

  // Catch-all for SPA
  app.get('/urls', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'urls.html'));
  });

  // URL details API
  app.get('/api/url-details', (req, res) => {
    const url = String(req.query.url || req.query.u || '').trim();
    if (!url) return res.status(400).json({ error: 'Missing url' });
    try {
      let NewsDatabase;
      try { NewsDatabase = require('../../db'); } catch (e) {
        return res.status(503).json({ error: 'Database unavailable', detail: e.message });
      }
      const db = new NewsDatabase(urlsDbPath);
  const urlInfo = db.db.prepare('SELECT * FROM urls WHERE url = ?').get(url) || null;
      const article = db.getArticleRowByUrl(url) || null;
      const fetches = db.getFetchesByUrl(url, 200) || [];
      db.close();
  res.json({ url, urlInfo, article, fetches });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Gazetteer APIs (read-only helpers)
  app.get('/api/gazetteer/summary', (req, res) => {
    try {
  let openDbReadOnly;
  try { ({ openDbReadOnly } = require('../../ensure_db')); } catch (e) { return res.status(503).json({ error: 'Database unavailable', detail: e.message }); }
  const now = Date.now();
      if (summaryCache.data && (now - summaryCache.at) < summaryCache.ttlMs) {
        return res.json(summaryCache.data);
      }
  const db = openDbReadOnly(urlsDbPath);
      const row = {
        countries: db.prepare("SELECT COUNT(*) c FROM places WHERE kind='country'").get().c,
        regions: db.prepare("SELECT COUNT(*) c FROM places WHERE kind='region'").get().c,
        cities: db.prepare("SELECT COUNT(*) c FROM places WHERE kind='city'").get().c,
        names: db.prepare('SELECT COUNT(*) c FROM place_names').get().c,
        sources: db.prepare('SELECT COUNT(*) c FROM place_sources').get().c
      };
      db.close();
      summaryCache.data = row; summaryCache.at = now;
      res.json(row);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Server-rendered Gazetteer list page
  app.get('/gazetteer/places', (req, res) => {
    const trace = startTrace(req, 'gazetteer');
    const q = String(req.query.q || '').trim();
    const kind = String(req.query.kind || '').trim();
    const cc = String(req.query.cc || '').trim().toUpperCase();
    const adm1 = String(req.query.adm1 || '').trim();
    const minpop = parseInt(req.query.minpop || '0', 10) || 0;
    const sort = String(req.query.sort || 'name').trim();
    const dir = (String(req.query.dir || 'asc').toLowerCase() === 'desc') ? 'DESC' : 'ASC';
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const pageSize = Math.max(1, Math.min(200, parseInt(req.query.pageSize || '50', 10)));
  const offset = (page - 1) * pageSize;
  const showStorage = String(req.query.storage || '0') === '1';

    function esc(s) {
      return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c]));
    }
    function num(n) { if (n == null) return ''; try { return Number(n).toLocaleString(); } catch { return String(n); } }
  function qs(obj) {
      const u = new URLSearchParams();
      for (const [k,v] of Object.entries(obj)) { if (v!=null && v!=='') u.set(k, String(v)); }
      return u.toString();
    }
  function fmtBytes(n) { if (n == null) return ''; const units=['B','KB','MB','GB','TB']; let i=0; let v = Number(n)||0; while (v>=1024 && i<units.length-1) { v/=1024; i++; } return (i===0? String(v|0) : v.toFixed(1)) + ' ' + units[i]; }
    try {
    let openDbReadOnly; try { ({ openDbReadOnly } = require('../../ensure_db')); } catch (e) {
        res.status(503).send('<!doctype html><title>Gazetteer</title><h1>Gazetteer</h1><p>Database unavailable.</p>'); return;
      }
  const doneOpen = trace.pre('db-open');
  const db = openDbReadOnly(urlsDbPath);
  doneOpen();
      const where = [];
      const params = [];
      if (kind) { where.push('p.kind = ?'); params.push(kind); }
      if (cc) { where.push('p.country_code = ?'); params.push(cc); }
      if (adm1) { where.push('p.adm1_code = ?'); params.push(adm1); }
      if (minpop > 0) { where.push('COALESCE(p.population,0) >= ?'); params.push(minpop); }
      if (q) {
        const like = `%${q.toLowerCase()}%`;
        where.push(`EXISTS (SELECT 1 FROM place_names nx WHERE nx.place_id = p.id AND (LOWER(nx.normalized) LIKE ? OR LOWER(nx.name) LIKE ?))`);
        params.push(like, like);
      }
      const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const sortCol = (sort === 'pop' || sort === 'population') ? 'p.population' : (sort === 'country' ? 'p.country_code' : 'cn.name');
      // Filter out nameless places (no canonical name and no name rows)
  const doneCount = trace.pre('count-total');
  const total = db.prepare(`
        SELECT COUNT(*) AS c
        FROM places p
        WHERE (p.canonical_name_id IS NOT NULL AND p.canonical_name_id IN (SELECT id FROM place_names))
          OR EXISTS(SELECT 1 FROM place_names pn WHERE pn.place_id = p.id)
          ${where.length ? ' AND ' + where.join(' AND ') : ''}
      `).get(...params).c;
  doneCount();
  const doneList = trace.pre('list-query');
  let rows = db.prepare(`
        SELECT p.id, p.kind, p.country_code, p.adm1_code, p.population,
               cn.name AS name
        FROM places p
        LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
        WHERE ((p.canonical_name_id IS NOT NULL AND p.canonical_name_id IN (SELECT id FROM place_names))
               OR EXISTS(SELECT 1 FROM place_names pn WHERE pn.place_id = p.id))
          ${where.length ? ' AND ' + where.join(' AND ') : ''}
        ORDER BY ${sortCol} ${dir}
        LIMIT ? OFFSET ?
      `).all(...params, pageSize, offset);
  if (showStorage) {
    const memo = new Map();
    const sizeFor = (id) => {
      if (memo.has(id)) return memo.get(id);
      let val = 0;
      try {
        const a = db.prepare(`SELECT COALESCE(LENGTH(kind),0)+COALESCE(LENGTH(country_code),0)+COALESCE(LENGTH(adm1_code),0)+COALESCE(LENGTH(adm2_code),0)+COALESCE(LENGTH(timezone),0)+COALESCE(LENGTH(bbox),0)+COALESCE(LENGTH(source),0)+COALESCE(LENGTH(extra),0) AS b FROM places WHERE id=?`).get(id)?.b || 0;
        const b = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(name),0)+COALESCE(LENGTH(normalized),0)+COALESCE(LENGTH(lang),0)+COALESCE(LENGTH(script),0)+COALESCE(LENGTH(name_kind),0)+COALESCE(LENGTH(source),0)),0) AS b FROM place_names WHERE place_id=?`).get(id)?.b || 0;
        const c = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(source),0)+COALESCE(LENGTH(ext_id),0)),0) AS b FROM place_external_ids WHERE place_id=?`).get(id)?.b || 0;
        const d = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(relation),0)),0) AS b FROM place_hierarchy WHERE parent_id=? OR child_id=?`).get(id, id)?.b || 0;
        val = (a + b + c + d) | 0;
      } catch (_) { val = 0; }
      memo.set(id, val);
      return val;
    };
    rows = rows.map(r => ({ ...r, size_bytes: sizeFor(r.id) }));
    // Optional in-memory sort by storage for current page
    if (sort === 'storage') {
      const asc = String(dir).toUpperCase() !== 'DESC';
      rows.sort((a,b) => (a.size_bytes||0) - (b.size_bytes||0));
      if (!asc) rows.reverse();
    }
  }
  doneList();
  const doneClose = trace.pre('db-close');
  db.close();
  doneClose();

      const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
      const start = total ? ((page - 1) * pageSize + 1) : 0;
      const end = Math.min(page * pageSize, total || 0);
  const prevLink = page > 1 ? ('?' + qs({ q, kind, cc, adm1, minpop, sort, dir, page: page-1, pageSize, storage: showStorage ? '1' : '' })) : '';
  const nextLink = page < totalPages ? ('?' + qs({ q, kind, cc, adm1, minpop, sort, dir, page: page+1, pageSize, storage: showStorage ? '1' : '' })) : '';

    const htmlRows = rows.map(r => `
        <tr>
          <td><a href="/gazetteer/place/${r.id}">${esc(r.name||'')}</a></td>
          <td>${esc(r.kind||'')}</td>
          <td>${esc(r.country_code||'')}</td>
          <td>${esc(r.adm1_code||'')}</td>
      ${showStorage?`<td style="text-align:right"><span title="Approximate">~ ${fmtBytes(r.size_bytes||0)}</span></td>`:''}
          <td style="text-align:right">${num(r.population)}</td>
        </tr>
      `).join('');
      const totalShownStorage = showStorage ? rows.reduce((a,b)=>a+(b.size_bytes||0),0) : 0;

  const sortOptions = ['name','country','population'];
  if (showStorage) sortOptions.push('storage');
  const sortOpts = sortOptions.map(s => `<option value="${s}" ${sort===s?'selected':''}>${s}</option>`).join('');
      const dirOpts = ['asc','desc'].map(d => `<option value="${d}" ${dir.toLowerCase()===d?'selected':''}>${d.toUpperCase()}</option>`).join('');

  const pageHtml = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Gazetteer</title>
<style>
  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff;--bg-soft:#f8fafc;--accent:#0ea5e9}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
  .container{max-width:1100px;margin:18px auto;padding:0 16px}
  header{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 12px}
  header h1{margin:0;font-size:20px}
  header nav a{color:var(--muted);text-decoration:none;margin-left:10px}
  header nav a:hover{color:var(--fg);text-decoration:underline}
  .card{background:var(--bg-soft);border:1px solid var(--border);border-radius:10px;padding:10px}
  .form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px}
  label{font-size:12px;color:var(--muted)}
  input,select,button{padding:7px 8px;font-size:14px}
  button{border:1px solid var(--border);border-radius:8px;background:#fff;cursor:pointer}
  button.primary{background:var(--accent);color:#fff;border-color:var(--accent)}
  .meta{color:var(--muted);font-size:12px}
  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden}
  th,td{border-bottom:1px solid var(--border);padding:8px 10px;font-size:14px}
  th{color:var(--muted);text-align:left;background:#fcfcfd}
  tr:nth-child(even){background:#fafafa}
  tr:hover{background:#f6f8fa}
  .pager a{margin-right:10px}
  .downloads{margin:8px 2px}
  .help{margin-top:4px}
</style>
</head><body>
  <div class="container">
    <header>
      <h1>Places</h1>
      ${renderGlobalNav('gazetteer')}
    </header>
    <form method="GET" class="card" style="margin-bottom:10px">
      <div class="form-grid">
        <label>Search<br/><input name="q" value="${esc(q)}" placeholder="name"/></label>
        <label>Kind<br/>
          <select name="kind">
            <option value="" ${kind?'':'selected'}>Any</option>
            ${['country','region','city','poi','supranational'].map(k=>`<option ${kind===k?'selected':''}>${k}</option>`).join('')}
          </select>
        </label>
        <label>Country (CC)<br/><input name="cc" value="${esc(cc)}" placeholder="US"/></label>
        <label>ADM1<br/><input name="adm1" value="${esc(adm1)}" placeholder="CA-ON"/></label>
        <label>Min pop<br/><input name="minpop" type="number" value="${minpop||''}"/></label>
        <label>Sort<br/>
          <div style="display:flex;gap:6px"><select name="sort">${sortOpts}</select><select name="dir">${dirOpts}</select></div>
        </label>
        <label>Page size<br/><input name="pageSize" type="number" value="${pageSize}"/></label>
        <div style="align-self:end; display:flex; gap:8px; align-items:center">
          <label><input type="checkbox" name="storage" value="1" ${showStorage?'checked':''}/> Storage</label>
          <button type="submit" class="primary">Search</button>
        </div>
      </div>
      <div class="meta help">Tip: use cc=US or adm1=CA-ON to narrow results.</div>
    </form>
    <div class="meta" style="margin:6px 2px 8px">${rows.length} of ${total} — page ${page}/${totalPages} — showing ${start}-${end}</div>
    <div class="pager" style="margin:0 0 6px 2px;">
      ${prevLink?`<a href="${prevLink}">← Prev</a>`:''}
      ${nextLink?`<a href="${nextLink}">Next →</a>`:''}
    </div>
  ${showStorage?`<div class="meta" style="margin:4px 2px 6px">Total shown storage: ~ ${fmtBytes(totalShownStorage)}</div>`:''}
    <table>
      <thead><tr><th>Name</th><th>Kind</th><th>CC</th><th>ADM1</th>${showStorage?'<th style="text-align:right">Storage</th>':''}<th style="text-align:right">Population</th></tr></thead>
      <tbody>${htmlRows || '<tr><td colspan="5" class="meta">No results</td></tr>'}</tbody>
    </table>
    <div class="pager" style="margin:6px 2px;">
      ${prevLink?`<a href="${prevLink}">← Prev</a>`:''}
      ${nextLink?`<a href="${nextLink}">Next →</a>`:''}
    </div>
  <div class="meta downloads">Download: <a href="/api/gazetteer/places?${qs({ q, kind, cc, adm1, minpop, sort, dir, page, pageSize, format:'csv' })}">CSV</a> · <a href="/api/gazetteer/places?${qs({ q, kind, cc, adm1, minpop, sort, dir, page, pageSize, format:'ndjson' })}">NDJSON</a></div>
  </div>
</body></html>`;

  const doneRender = trace.pre('render');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(pageHtml);
  doneRender();
  trace.end();
    } catch (e) {
  try { trace.end(); } catch (_) {}
      res.status(500).send('<!doctype html><title>Error</title><pre>' + esc(e.message||String(e)) + '</pre>');
    }
  });

  // Gazetteer landing page with quick links and summary
  app.get('/gazetteer', (req, res) => {
    const trace = startTrace(req, 'gazetteer');
    function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c])); }
    try {
      let openDbReadOnly; try { ({ openDbReadOnly } = require('../../ensure_db')); } catch (e) {
        res.status(503).send('<!doctype html><title>Gazetteer</title><h1>Gazetteer</h1><p>Database unavailable.</p>'); return;
      }
      const doneOpen = trace.pre('db-open');
      const db = openDbReadOnly(urlsDbPath);
      doneOpen();
      const doneCounts = trace.pre('counts');
      const countries = db.prepare("SELECT COUNT(*) c FROM places WHERE kind='country'").get().c;
      const regions = db.prepare("SELECT COUNT(*) c FROM places WHERE kind='region'").get().c;
      const cities = db.prepare("SELECT COUNT(*) c FROM places WHERE kind='city'").get().c;
      const names = db.prepare('SELECT COUNT(*) c FROM place_names').get().c;
      const sources = db.prepare('SELECT COUNT(*) c FROM place_sources').get().c;
      doneCounts();
      const doneClose = trace.pre('db-close');
      db.close();
      doneClose();
      const html = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Gazetteer</title>
<style>
  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff;--bg-soft:#f8fafc}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
  .container{max-width:900px;margin:18px auto;padding:0 16px}
  header{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 12px}
  header h1{margin:0;font-size:22px}
  header nav a{color:var(--muted);text-decoration:none;margin-left:10px}
  header nav a:hover{color:var(--fg);text-decoration:underline}
  .card{background:var(--bg-soft);border:1px solid var(--border);border-radius:10px;padding:12px}
  .meta{color:var(--muted);font-size:13px}
  ul{margin:6px 0 0 16px}
</style>
</head><body>
  <div class="container">
    <header>
      <h1>Gazetteer</h1>
      ${renderGlobalNav('gazetteer')}
    </header>
    <section class="card">
      <div class="meta">Summary</div>
      <div style="margin-top:6px">Countries: <strong>${countries}</strong> · Regions: <strong>${regions}</strong> · Cities: <strong>${cities}</strong></div>
      <div class="meta" style="margin-top:6px">Names: ${names} · Sources: ${sources}</div>
      <div style="margin-top:10px">
        <a href="/gazetteer/countries">Countries</a> ·
        <a href="/gazetteer/places">All places</a>
      </div>
    </section>
  </div>
</body></html>`;
      const doneRender = trace.pre('render');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
      doneRender();
      trace.end();
    } catch (e) {
      try { trace.end(); } catch (_) {}
      res.status(500).send('<!doctype html><title>Error</title><pre>' + esc(e.message||String(e)) + '</pre>');
    }
  });

  // Country page with optional storage UI
  app.get('/gazetteer/country/:cc', (req, res) => {
    const trace = startTrace(req, 'gazetteer');
    function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c])); }
    function num(n) { if (n == null) return ''; try { return Number(n).toLocaleString(); } catch { return String(n); } }
    function fmtBytes(n) { if (n == null) return ''; const units=['B','KB','MB','GB','TB']; let i=0; let v = Number(n)||0; while (v>=1024 && i<units.length-1) { v/=1024; i++; } return (i===0? String(v|0) : v.toFixed(1)) + ' ' + units[i]; }
    const cc = String(req.params.cc || '').trim().toUpperCase();
    const showStorage = String(req.query.storage || '0') === '1';
    try {
      let openDbReadOnly; try { ({ openDbReadOnly } = require('../../ensure_db')); } catch (e) {
        res.status(503).send('<!doctype html><title>Country</title><h1>Country</h1><p>Database unavailable.</p>'); return;
      }
      const doneOpen = trace.pre('db-open');
      const db = openDbReadOnly(urlsDbPath);
      doneOpen();
      const doneCountry = trace.pre('get-country');
      const country = db.prepare(`
        SELECT p.id, p.country_code, p.population, COALESCE(cn.name, pn.name) AS name
        FROM places p
        LEFT JOIN place_names pn ON pn.place_id = p.id
        LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
        WHERE p.kind='country' AND UPPER(p.country_code) = ?
        GROUP BY p.id
      `).get(cc);
      doneCountry();
      if (!country) { db.close(); res.status(404).send('<!doctype html><title>Not found</title><p>Country not found</p>'); return; }
      // Regions and Cities in this country
      const doneRegions = trace.pre('list-regions');
      const regions = db.prepare(`
        SELECT p.id, p.kind, p.country_code, p.adm1_code, p.population, COALESCE(cn.name, pn.name) AS name
        FROM places p
        LEFT JOIN place_names pn ON pn.place_id = p.id
        LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
        WHERE p.kind = 'region' AND UPPER(p.country_code) = ?
        GROUP BY p.id
        ORDER BY name ASC
      `).all(cc);
      doneRegions();
      // Cities in this country
      const doneCities = trace.pre('list-cities');
      let cities = db.prepare(`
        SELECT p.id, p.kind, p.country_code, p.adm1_code, p.population, COALESCE(cn.name, pn.name) AS name
        FROM places p
        LEFT JOIN place_names pn ON pn.place_id = p.id
        LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
        WHERE p.kind = 'city' AND UPPER(p.country_code) = ?
        GROUP BY p.id
        ORDER BY p.population DESC, name ASC
      `).all(cc);
      if (showStorage) {
        const memo = new Map();
        const sizeFor = (id) => {
          if (memo.has(id)) return memo.get(id);
          let val = 0;
          try {
            const a = db.prepare(`SELECT COALESCE(LENGTH(kind),0)+COALESCE(LENGTH(country_code),0)+COALESCE(LENGTH(adm1_code),0)+COALESCE(LENGTH(adm2_code),0)+COALESCE(LENGTH(timezone),0)+COALESCE(LENGTH(bbox),0)+COALESCE(LENGTH(source),0)+COALESCE(LENGTH(extra),0) AS b FROM places WHERE id=?`).get(id)?.b || 0;
            const b = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(name),0)+COALESCE(LENGTH(normalized),0)+COALESCE(LENGTH(lang),0)+COALESCE(LENGTH(script),0)+COALESCE(LENGTH(name_kind),0)+COALESCE(LENGTH(source),0)),0) AS b FROM place_names WHERE place_id=?`).get(id)?.b || 0;
            const c = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(source),0)+COALESCE(LENGTH(ext_id),0)),0) AS b FROM place_external_ids WHERE place_id=?`).get(id)?.b || 0;
            const d = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(relation),0)),0) AS b FROM place_hierarchy WHERE parent_id=? OR child_id=?`).get(id, id)?.b || 0;
            val = (a + b + c + d) | 0;
          } catch (_) { val = 0; }
          memo.set(id, val);
          return val;
        };
        cities = cities.map(r => ({ ...r, size_bytes: sizeFor(r.id) }));
      }
      doneCities();
      // Optional country storage (approximate)
      let countryStorage = 0;
      if (showStorage) {
        try {
          const a = db.prepare(`SELECT COALESCE(LENGTH(kind),0)+COALESCE(LENGTH(country_code),0)+COALESCE(LENGTH(adm1_code),0)+COALESCE(LENGTH(adm2_code),0)+COALESCE(LENGTH(timezone),0)+COALESCE(LENGTH(bbox),0)+COALESCE(LENGTH(source),0)+COALESCE(LENGTH(extra),0) AS b FROM places WHERE id=?`).get(country.id)?.b || 0;
          const b = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(name),0)+COALESCE(LENGTH(normalized),0)+COALESCE(LENGTH(lang),0)+COALESCE(LENGTH(script),0)+COALESCE(LENGTH(name_kind),0)+COALESCE(LENGTH(source),0)),0) AS b FROM place_names WHERE place_id=?`).get(country.id)?.b || 0;
          const c = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(source),0)+COALESCE(LENGTH(ext_id),0)),0) AS b FROM place_external_ids WHERE place_id=?`).get(country.id)?.b || 0;
          const d = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(relation),0)),0) AS b FROM place_hierarchy WHERE parent_id=? OR child_id=?`).get(country.id, country.id)?.b || 0;
          countryStorage = (a + b + c + d) | 0;
        } catch (_) { countryStorage = 0; }
      }
      const doneClose = trace.pre('db-close');
      db.close();
      doneClose();

      const toggleHtml = showStorage
        ? `<span>Storage: On · <a href="?">storage=0</a></span>`
        : `<span>Storage: Off · <a href="?storage=1">storage=1</a></span>`;
      const regionsHtml = regions.map(r => `
        <li><a href="/gazetteer/place/${r.id}">${esc(r.name||'')}</a> <span class="meta">${esc(r.adm1_code||'')}</span></li>
      `).join('');
      const rowsHtml = cities.map(r => `
        <tr>
          <td><a href="/gazetteer/place/${r.id}">${esc(r.name||'')}</a></td>
          <td>${esc(r.adm1_code||'')}</td>
          ${showStorage?`<td style="text-align:right"><span title="Approximate">~ ${fmtBytes(r.size_bytes||0)}</span></td>`:''}
          <td style="text-align:right">${num(r.population)}</td>
        </tr>
      `).join('');
      const html = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(country.name||country.country_code)} — Country</title>
<style>
  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
  .container{max-width:900px;margin:18px auto;padding:0 16px}
  header{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 12px}
  header h1{margin:0;font-size:20px}
  header nav a{color:var(--muted);text-decoration:none;margin-left:10px}
  header nav a:hover{color:var(--fg);text-decoration:underline}
  .meta{color:var(--muted);font-size:13px}
  .card{background:#f8fafc;border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:10px}
  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden}
  th,td{border-bottom:1px solid var(--border);padding:8px 10px;font-size:14px}
  th{color:var(--muted);text-align:left;background:#fcfcfd}
  tr:nth-child(even){background:#fafafa}
  tr:hover{background:#f6f8fa}
  .bad{color:#dc2626}
  .muted{color:var(--muted)}
  .row{display:flex;justify-content:space-between;align-items:center}
  .pill{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:2px 8px;background:#fff}
  a.tiny{font-size:12px}
  .right{float:right}
  .infobox div{margin:2px 0}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  @media (max-width: 800px){ .grid{grid-template-columns:1fr} }
  .infobox{padding:10px}
  .switch{font-size:12px}
  .switch a{margin-left:6px}
  .switch strong{font-weight:600}
  .storage-val{font-weight:600}
  .toggle{margin-top:6px}
  .hdr{margin:0 0 6px}
  .w100{width:100%}
  .tr{ text-align:right }
  .name{ font-weight:600 }
  .table-wrap{margin-top:8px}
  .tbl-meta{margin:4px 2px}
  .tbl-meta strong{font-weight:600}
  .tbl-meta .muted{margin-left:8px}
  .tbl-meta .right{float:right}
  .tbl-meta::after{content:"";display:block;clear:both}
  .pill strong{font-weight:600}
  .breadcrumbs{margin-bottom:4px}
  .breadcrumbs a{color:var(--muted);text-decoration:none}
  .breadcrumbs a:hover{color:var(--fg);text-decoration:underline}
  .hdr-cc{margin-left:8px}
  .hdr-pop{margin-left:8px}
  .hdr-id{margin-left:8px}
  .hdr-line{margin-top:2px}
  .hdr-line .meta{margin-right:8px}
  .hdr-line .meta:last-child{margin-right:0}
  .hdr-line .meta strong{font-weight:600}
  .toggle a{ text-decoration:none }
  .toggle a:hover{ text-decoration:underline }
  .section-title{margin:8px 0 6px}
  .section-title strong{font-weight:600}
  .hdr-links a{margin-left:8px}
  .hdr-links a:first-child{margin-left:0}
  .hdr-links{margin-top:6px}
  .center{display:flex;justify-content:center}
  .center .muted{margin-top:2px}
  .spaced{letter-spacing:0.2px}
  .mono{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace}
  .mono .muted{letter-spacing:0}
  .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  @media (max-width:900px){ .grid-2{grid-template-columns:1fr} }
</style>
</head><body>
  <div class="container">
    <header>
      <h1 class="spaced">${esc(country.name||country.country_code)} <span class="pill mono">${esc(country.country_code||'')}</span></h1>
      ${renderGlobalNav('gazetteer')}
    </header>
    <section class="card infobox">
      <div class="row"><div class="name">Infobox</div><div class="switch toggle">${toggleHtml}</div></div>
      <div class="hdr-line">
        ${country.population?`<span class="meta">Population: <strong>${num(country.population)}</strong></span>`:''}
        ${showStorage?`<span class="meta">Storage: <span class="storage-val">${fmtBytes(countryStorage||0)}</span></span>`:''}
      </div>
      <div class="hdr-links"><a href="/gazetteer">Gazetteer</a> · <a href="/gazetteer/countries">Countries</a></div>
    </section>

    <section class="card">
      <h2 class="section-title"><strong>Regions</strong></h2>
      <div class="tbl-meta">
        <span class="muted">${regions.length} regions</span>
      </div>
      <ul>${regionsHtml || '<li class="meta">No regions</li>'}</ul>
    </section>

    <section class="table-wrap">
      <h2 class="section-title"><strong>Cities</strong></h2>
      <div class="tbl-meta">
        <span class="muted">${cities.length} cities</span>
      </div>
      <table>
        <thead><tr><th>Name</th><th>ADM1</th>${showStorage?'<th class="tr">Storage</th>':''}<th class="tr">Population</th></tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan="4" class="meta">No cities</td></tr>'}</tbody>
      </table>
    </section>
  </div>
</body></html>`;
      const doneRender = trace.pre('render');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
      doneRender();
      trace.end();
    } catch (e) {
      try { trace.end(); } catch (_) {}
      res.status(500).send('<!doctype html><title>Error</title><pre>' + esc(e.message||String(e)) + '</pre>');
    }
  });

  // Server-rendered Gazetteer page by kind (e.g., city/region), with optional storage column
  app.get('/gazetteer/kind/:kind', (req, res) => {
    const trace = startTrace(req, 'gazetteer');
    function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c])); }
    function num(n) { if (n == null) return ''; try { return Number(n).toLocaleString(); } catch { return String(n); } }
    function fmtBytes(n) { if (n == null) return ''; const u=['B','KB','MB','GB','TB']; let i=0; let v=Number(n)||0; while (v>=1024&&i<u.length-1){v/=1024;i++;} return (i===0? String(v|0) : v.toFixed(1)) + ' ' + u[i]; }
    const kind = String(req.params.kind || '').trim().toLowerCase();
    const showStorage = String(req.query.storage || '0') === '1';
    const q = String(req.query.q || '').trim();
    const cc = String(req.query.cc || '').trim().toUpperCase();
    const minpop = parseInt(req.query.minpop || '0', 10) || 0;
    const sort = String(req.query.sort || 'name').trim();
    const dir = (String(req.query.dir || 'asc').toLowerCase() === 'desc') ? 'DESC' : 'ASC';
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.max(1, Math.min(200, parseInt(req.query.pageSize || '50', 10)));
    const offset = (page - 1) * pageSize;
    try {
      let openDbReadOnly; try { ({ openDbReadOnly } = require('../../ensure_db')); } catch (e) { res.status(503).send('<!doctype html><title>Gazetteer</title><h1>Gazetteer</h1><p>Database unavailable.</p>'); return; }
      const doneOpen = trace.pre('db-open');
      const db = openDbReadOnly(urlsDbPath);
      doneOpen();
      const where = ['p.kind = ?'];
      const params = [kind];
      if (cc) { where.push('UPPER(p.country_code) = ?'); params.push(cc); }
      if (minpop > 0) { where.push('COALESCE(p.population,0) >= ?'); params.push(minpop); }
      if (q) {
        const like = `%${q.toLowerCase()}%`;
        where.push(`EXISTS (SELECT 1 FROM place_names nx WHERE nx.place_id = p.id AND (LOWER(nx.normalized) LIKE ? OR LOWER(nx.name) LIKE ?))`);
        params.push(like, like);
      }
      const sortCol = (sort === 'pop' || sort === 'population') ? 'p.population' : (sort === 'country' ? 'p.country_code' : 'cn.name');
      const total = db.prepare(`
        SELECT COUNT(*) AS c
        FROM places p
        WHERE ((p.canonical_name_id IS NOT NULL AND p.canonical_name_id IN (SELECT id FROM place_names))
               OR EXISTS(SELECT 1 FROM place_names pn WHERE pn.place_id = p.id))
          AND ${where.join(' AND ')}
      `).get(...params).c;
      let rows = db.prepare(`
        SELECT p.id, p.kind, p.country_code, p.adm1_code, p.population,
               cn.name AS name
        FROM places p
        LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
        WHERE ((p.canonical_name_id IS NOT NULL AND p.canonical_name_id IN (SELECT id FROM place_names))
               OR EXISTS(SELECT 1 FROM place_names pn WHERE pn.place_id = p.id))
          AND ${where.join(' AND ')}
        ORDER BY ${sortCol} ${dir}
        LIMIT ? OFFSET ?
      `).all(...params, pageSize, offset);
      if (showStorage) {
        const memo = new Map();
        const sizeFor = (id) => {
          if (memo.has(id)) return memo.get(id);
          let val = 0;
          try {
            const a = db.prepare(`SELECT COALESCE(LENGTH(kind),0)+COALESCE(LENGTH(country_code),0)+COALESCE(LENGTH(adm1_code),0)+COALESCE(LENGTH(adm2_code),0)+COALESCE(LENGTH(timezone),0)+COALESCE(LENGTH(bbox),0)+COALESCE(LENGTH(source),0)+COALESCE(LENGTH(extra),0) AS b FROM places WHERE id=?`).get(id)?.b || 0;
            const b = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(name),0)+COALESCE(LENGTH(normalized),0)+COALESCE(LENGTH(lang),0)+COALESCE(LENGTH(script),0)+COALESCE(LENGTH(name_kind),0)+COALESCE(LENGTH(source),0)),0) AS b FROM place_names WHERE place_id=?`).get(id)?.b || 0;
            const c = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(source),0)+COALESCE(LENGTH(ext_id),0)),0) AS b FROM place_external_ids WHERE place_id=?`).get(id)?.b || 0;
            const d = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(relation),0)),0) AS b FROM place_hierarchy WHERE parent_id=? OR child_id=?`).get(id, id)?.b || 0;
            val = (a + b + c + d) | 0;
          } catch (_) { val = 0; }
          memo.set(id, val); return val;
        };
        rows = rows.map(r => ({ ...r, size_bytes: sizeFor(r.id) }));
        if (sort === 'storage') {
          const asc = String(dir).toUpperCase() !== 'DESC';
          rows.sort((a,b) => (a.size_bytes||0) - (b.size_bytes||0));
          if (!asc) rows.reverse();
        }
      }
      const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
      const start = total ? ((page - 1) * pageSize + 1) : 0;
      const end = Math.min(page * pageSize, total || 0);
      const buildQS = (obj) => {
        const u = new URLSearchParams();
        for (const [k,v] of Object.entries(obj)) { if (v!=null && v!=='') u.set(k, String(v)); }
        return u.toString();
      };
      const prevLink = page > 1 ? ('?' + buildQS({ q, cc, minpop, sort, dir, page: page-1, pageSize, storage: showStorage ? '1' : '' })) : '';
      const nextLink = page < totalPages ? ('?' + buildQS({ q, cc, minpop, sort, dir, page: page+1, pageSize, storage: showStorage ? '1' : '' })) : '';
      const sortOptions = ['name','country','population'];
      if (showStorage) sortOptions.push('storage');
      const sortOpts = sortOptions.map(s => `<option value="${s}" ${sort===s?'selected':''}>${s}</option>`).join('');
      const dirOpts = ['asc','desc'].map(d => `<option value="${d}" ${dir.toLowerCase()===d?'selected':''}>${d.toUpperCase()}</option>`).join('');
      const htmlRows = rows.map(r => `
        <tr>
          <td><a href="/gazetteer/place/${r.id}">${esc(r.name||'')}</a></td>
          <td>${esc(r.country_code||'')}</td>
          <td>${esc(r.adm1_code||'')}</td>
          ${showStorage?`<td style="text-align:right"><span title="Approximate">~ ${fmtBytes(r.size_bytes||0)}</span></td>`:''}
          <td style="text-align:right">${num(r.population)}</td>
        </tr>
      `).join('');
      const pageHtml = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${kind.charAt(0).toUpperCase()+kind.slice(1)} — Gazetteer</title>
<style>
  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff;--bg-soft:#f8fafc;--accent:#0ea5e9}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
  .container{max-width:1100px;margin:18px auto;padding:0 16px}
  header{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 12px}
  header h1{margin:0;font-size:20px}
  header nav a{color:var(--muted);text-decoration:none;margin-left:10px}
  header nav a:hover{color:var(--fg);text-decoration:underline}
  .card{background:var(--bg-soft);border:1px solid var(--border);border-radius:10px;padding:10px}
  .form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px}
  label{font-size:12px;color:var(--muted)}
  input,select,button{padding:7px 8px;font-size:14px}
  button{border:1px solid var(--border);border-radius:8px;background:#fff;cursor:pointer}
  button.primary{background:var(--accent);color:#fff;border-color:var(--accent)}
  .meta{color:var(--muted);font-size:12px}
  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden}
  th,td{border-bottom:1px solid var(--border);padding:8px 10px;font-size:14px}
  th{color:var(--muted);text-align:left;background:#fcfcfd}
  tr:nth-child(even){background:#fafafa}
  tr:hover{background:#f6f8fa}
  .pager a{margin-right:10px}
  .downloads{margin:8px 2px}
  .toggle{margin-left:8px}
  .hdr{margin:0 0 6px}
  .tr{ text-align:right }
</style>
</head><body>
  <div class="container">
    <header>
      <h1 class="hdr">${(kind.charAt(0).toUpperCase()+kind.slice(1))}s</h1>
      ${renderGlobalNav('gazetteer')}
    </header>
    <form method="GET" class="card" style="margin-bottom:10px">
      <div class="form-grid">
        <label>Search<br/><input name="q" value="${esc(q)}" placeholder="name"/></label>
        <label>Country (CC)<br/><input name="cc" value="${esc(cc)}" placeholder="US"/></label>
        <label>Min pop<br/><input name="minpop" type="number" value="${minpop||''}"/></label>
        <label>Sort<br/>
          <div style="display:flex;gap:6px"><select name="sort">${sortOpts}</select><select name="dir">${dirOpts}</select></div>
        </label>
        <label>Page size<br/><input name="pageSize" type="number" value="${pageSize}"/></label>
        <div style="align-self:end; display:flex; gap:8px; align-items:center">
          <label><input type="checkbox" name="storage" value="1" ${showStorage?'checked':''}/> Storage</label>
          <button type="submit" class="primary">Search</button>
        </div>
      </div>
    </form>
    <div class="meta" style="margin:6px 2px 8px">${rows.length} of ${total} — page ${page}/${totalPages} — showing ${start}-${end} <span class="toggle">${showStorage?`Storage: On · <a href="?${buildQS({ q, cc, minpop, sort, dir, page, pageSize })}">storage=0</a>`:`Storage: Off · <a href="?${buildQS({ q, cc, minpop, sort, dir, page, pageSize, storage:'1' })}">storage=1</a>`}</span></div>
    <div class="pager" style="margin:0 0 6px 2px;">
      ${prevLink?`<a href="${prevLink}">← Prev</a>`:''}
      ${nextLink?`<a href="${nextLink}">Next →</a>`:''}
    </div>
    ${showStorage?`<div class="meta" style="margin:4px 2px 6px">Total shown storage: ~ ${fmtBytes(rows.reduce((a,b)=>a+(b.size_bytes||0),0))}</div>`:''}
    <table>
      <thead><tr><th>Name</th><th>CC</th><th>ADM1</th>${showStorage?'<th class="tr">Storage</th>':''}<th class="tr">Population</th></tr></thead>
      <tbody>${htmlRows || '<tr><td colspan="5" class="meta">No results</td></tr>'}</tbody>
    </table>
    <div class="pager" style="margin:6px 2px;">
      ${prevLink?`<a href="${prevLink}">← Prev</a>`:''}
      ${nextLink?`<a href="${nextLink}">Next →</a>`:''}
    </div>
  </div>
</body></html>`;
      const doneRender = trace.pre('render');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(pageHtml);
      doneRender();
      trace.end();
    } catch (e) {
      try { trace.end(); } catch (_) {}
      res.status(500).send('<!doctype html><title>Error</title><pre>' + (e?.message || String(e)) + '</pre>');
    }
  });

  // JSON: Gazetteer places search (with pagination)
  app.get('/api/gazetteer/places', (req, res) => {
    try {
      let openDbReadOnly; try { ({ openDbReadOnly } = require('../../ensure_db')); } catch (e) { return res.status(503).json({ error: 'Database unavailable', detail: e.message }); }
      const db = openDbReadOnly(urlsDbPath);
      const q = String(req.query.q || '').trim();
      const kind = String(req.query.kind || '').trim();
      const cc = String(req.query.cc || '').trim().toUpperCase();
      const adm1 = String(req.query.adm1 || '').trim();
      const minpop = parseInt(req.query.minpop || '0', 10) || 0;
      const sort = String(req.query.sort || 'name').trim();
      const dir = (String(req.query.dir || 'asc').toLowerCase() === 'desc') ? 'DESC' : 'ASC';
      const page = Math.max(1, parseInt(req.query.page || '1', 10));
      const pageSize = Math.max(1, Math.min(200, parseInt(req.query.pageSize || '50', 10)));
      const offset = (page - 1) * pageSize;
      const where = [];
      const params = [];
      if (kind) { where.push('p.kind = ?'); params.push(kind); }
      if (cc) { where.push('UPPER(p.country_code) = ?'); params.push(cc); }
      if (adm1) { where.push('p.adm1_code = ?'); params.push(adm1); }
      if (minpop > 0) { where.push('COALESCE(p.population,0) >= ?'); params.push(minpop); }
      if (q) {
        const like = `%${q.toLowerCase()}%`;
        where.push(`EXISTS (SELECT 1 FROM place_names nx WHERE nx.place_id = p.id AND (LOWER(nx.normalized) LIKE ? OR LOWER(nx.name) LIKE ?))`);
        params.push(like, like);
      }
      const sortCol = (sort === 'pop' || sort === 'population') ? 'p.population' : (sort === 'country' ? 'p.country_code' : 'cn.name');
      const total = db.prepare(`
        SELECT COUNT(*) AS c
        FROM places p
        WHERE ((p.canonical_name_id IS NOT NULL AND p.canonical_name_id IN (SELECT id FROM place_names))
               OR EXISTS(SELECT 1 FROM place_names pn WHERE pn.place_id = p.id))
          ${where.length ? ' AND ' + where.join(' AND ') : ''}
      `).get(...params).c;
      const rows = db.prepare(`
        SELECT p.id, p.kind, p.country_code, p.adm1_code, p.population,
               COALESCE(cn.name, pn.name) AS name
        FROM places p
        LEFT JOIN place_names pn ON pn.place_id = p.id
        LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
        WHERE ((p.canonical_name_id IS NOT NULL AND p.canonical_name_id IN (SELECT id FROM place_names))
               OR EXISTS(SELECT 1 FROM place_names pn WHERE pn.place_id = p.id))
          ${where.length ? ' AND ' + where.join(' AND ') : ''}
        ORDER BY ${sortCol} ${dir}
        LIMIT ? OFFSET ?
      `).all(...params, pageSize, offset);
      db.close();
      res.json({ total, page, pageSize, rows });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // JSON: Gazetteer place details
  app.get('/api/gazetteer/place/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ error: 'Invalid id' });
      let openDbReadOnly; try { ({ openDbReadOnly } = require('../../ensure_db')); } catch (e) { return res.status(503).json({ error: 'Database unavailable', detail: e.message }); }
      const db = openDbReadOnly(urlsDbPath);
      const place = db.prepare('SELECT * FROM places WHERE id = ?').get(id);
      if (!place) { db.close(); return res.status(404).json({ error: 'Not found' }); }
      const names = db.prepare('SELECT * FROM place_names WHERE place_id = ? ORDER BY is_official DESC, is_preferred DESC, name').all(id);
      const parents = db.prepare('SELECT ph.parent_id, p.kind, p.country_code, p.adm1_code, COALESCE(cn.name, pn.name) AS name FROM place_hierarchy ph JOIN places p ON p.id = ph.parent_id LEFT JOIN place_names pn ON pn.place_id = p.id LEFT JOIN place_names cn ON cn.id = p.canonical_name_id WHERE ph.child_id = ?').all(id);
      const children = db.prepare('SELECT ph.child_id, p.kind, p.country_code, p.adm1_code, COALESCE(cn.name, pn.name) AS name FROM place_hierarchy ph JOIN places p ON p.id = ph.child_id LEFT JOIN place_names pn ON pn.place_id = p.id LEFT JOIN place_names cn ON cn.id = p.canonical_name_id WHERE ph.parent_id = ? LIMIT 200').all(id);
      // Compute size metrics similar to SSR page
      let size_bytes = 0; let size_method = 'approx';
      try {
        const row = db.prepare(`WITH
  t_places(rowid) AS (SELECT id FROM places WHERE id = ?),
  t_names(rowid) AS (SELECT rowid FROM place_names WHERE place_id = ?),
  t_ext(rowid) AS (SELECT rowid FROM place_external_ids WHERE place_id = ?),
  t_hier(rowid) AS (SELECT rowid FROM place_hierarchy WHERE parent_id = ? OR child_id = ?),
  idx_places AS (SELECT name FROM pragma_index_list('places')),
  idx_names AS (SELECT name FROM pragma_index_list('place_names')),
  idx_ext AS (SELECT name FROM pragma_index_list('place_external_ids')),
  idx_hier AS (SELECT name FROM pragma_index_list('place_hierarchy'))
SELECT (
  COALESCE((SELECT SUM(payload) FROM dbstat WHERE (name='places' AND rowid IN (SELECT rowid FROM t_places)) OR (name IN (SELECT name FROM idx_places) AND rowid IN (SELECT rowid FROM t_places))),0)
  + COALESCE((SELECT SUM(payload) FROM dbstat WHERE (name='place_names' AND rowid IN (SELECT rowid FROM t_names)) OR (name IN (SELECT name FROM idx_names) AND rowid IN (SELECT rowid FROM t_names))),0)
  + COALESCE((SELECT SUM(payload) FROM dbstat WHERE (name='place_external_ids' AND rowid IN (SELECT rowid FROM t_ext)) OR (name IN (SELECT name FROM idx_ext) AND rowid IN (SELECT rowid FROM t_ext))),0)
  + COALESCE((SELECT SUM(payload) FROM dbstat WHERE (name='place_hierarchy' AND rowid IN (SELECT rowid FROM t_hier)) OR (name IN (SELECT name FROM idx_hier) AND rowid IN (SELECT rowid FROM t_hier))),0)
) AS bytes`).get(id, id, id, id, id);
        if (row && typeof row.bytes === 'number') { size_bytes = row.bytes|0; size_method = 'dbstat'; }
      } catch (_) {
        try {
          const a = db.prepare(`SELECT COALESCE(LENGTH(kind),0)+COALESCE(LENGTH(country_code),0)+COALESCE(LENGTH(adm1_code),0)+COALESCE(LENGTH(adm2_code),0)+COALESCE(LENGTH(timezone),0)+COALESCE(LENGTH(bbox),0)+COALESCE(LENGTH(source),0)+COALESCE(LENGTH(extra),0) AS b FROM places WHERE id=?`).get(id)?.b || 0;
          const b = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(name),0)+COALESCE(LENGTH(normalized),0)+COALESCE(LENGTH(lang),0)+COALESCE(LENGTH(script),0)+COALESCE(LENGTH(name_kind),0)+COALESCE(LENGTH(source),0)),0) AS b FROM place_names WHERE place_id=?`).get(id)?.b || 0;
          const c = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(source),0)+COALESCE(LENGTH(ext_id),0)),0) AS b FROM place_external_ids WHERE place_id=?`).get(id)?.b || 0;
          const d = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(relation),0)),0) AS b FROM place_hierarchy WHERE parent_id=? OR child_id=?`).get(id, id)?.b || 0;
          size_bytes = (a + b + c + d) | 0;
          size_method = 'approx';
        } catch (_) { size_bytes = 0; size_method = 'approx'; }
      }
      db.close();
      res.json({ place, names, parents, children, size_bytes, size_method });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // JSON: Gazetteer recent articles mentioning a place (by id)
  app.get('/api/gazetteer/articles', (req, res) => {
    try {
      const id = parseInt(String(req.query.id || ''), 10);
      if (!id) return res.status(400).json({ error: 'Missing id' });
      let openDbReadOnly; try { ({ openDbReadOnly } = require('../../ensure_db')); } catch (e) { return res.status(503).json({ error: 'Database unavailable', detail: e.message }); }
      const db = openDbReadOnly(urlsDbPath);
      const cname = db.prepare('SELECT name FROM place_names WHERE id = (SELECT canonical_name_id FROM places WHERE id = ?)').get(id)?.name || null;
      let rows = [];
      if (cname) {
        rows = db.prepare(`
          SELECT a.url, a.title, a.date
          FROM article_places ap JOIN articles a ON a.url = ap.article_url
          WHERE ap.place = ?
          ORDER BY (a.date IS NULL) ASC, a.date DESC
          LIMIT 20
        `).all(cname);
      }
      db.close();
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // JSON: Gazetteer hubs for a host
  app.get('/api/gazetteer/hubs', (req, res) => {
    try {
      const host = String(req.query.host || '').trim().toLowerCase();
      let openDbReadOnly; try { ({ openDbReadOnly } = require('../../ensure_db')); } catch (e) { return res.status(200).json([]); }
      const db = openDbReadOnly(urlsDbPath);
      let rows = [];
      try {
        if (host) rows = db.prepare('SELECT * FROM place_hubs WHERE LOWER(host) = ? ORDER BY last_seen_at DESC LIMIT 50').all(host);
        else rows = db.prepare('SELECT * FROM place_hubs ORDER BY last_seen_at DESC LIMIT 50').all();
      } catch (_) { rows = []; }
      db.close();
      res.json(rows);
    } catch (_) {
      res.status(200).json([]);
    }
  });

  // JSON: Gazetteer resolve helper
  app.get('/api/gazetteer/resolve', (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      if (!q) return res.status(200).json([]);
      let openDbReadOnly; try { ({ openDbReadOnly } = require('../../ensure_db')); } catch (e) { return res.status(200).json([]); }
      const db = openDbReadOnly(urlsDbPath);
      const like = `%${q.toLowerCase()}%`;
      const rows = db.prepare(`
        SELECT p.id, p.kind, p.country_code, p.adm1_code,
               COALESCE(cn.name, pn.name) AS name
        FROM places p
        LEFT JOIN place_names pn ON pn.place_id = p.id
        LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
        WHERE EXISTS (SELECT 1 FROM place_names nx WHERE nx.place_id = p.id AND (LOWER(nx.normalized) LIKE ? OR LOWER(nx.name) LIKE ?))
        ORDER BY (p.kind!='city') ASC, (p.kind!='region') ASC, (p.population IS NULL) ASC, p.population DESC
        LIMIT 10
      `).all(like, like);
      db.close();
      res.json(rows);
    } catch (e) {
      res.status(200).json([]);
    }
  });

  // Domain summary API
  app.get('/api/domain-summary', (req, res) => {
    try {
      const host = String(req.query.host || '').trim().toLowerCase();
      if (!host) return res.status(400).json({ error: 'Missing host' });
      let NewsDatabase; try { NewsDatabase = require('../../db'); } catch (e) { return res.status(503).json({ error: 'Database unavailable', detail: e.message }); }
      const db = new NewsDatabase(urlsDbPath);
      // Articles by host
      const art = db.db.prepare(`
        SELECT COUNT(*) AS c FROM articles a
        JOIN urls u ON u.url = a.url
        WHERE LOWER(u.host) = ?
      `).get(host)?.c || 0;
      // Fetches by host
      let fetches = 0;
      try {
        fetches = db.db.prepare(`SELECT COUNT(*) AS c FROM fetches WHERE LOWER(host) = ?`).get(host)?.c || 0;
      } catch (_) {
        // fallback via urls join
        try {
          fetches = db.db.prepare(`SELECT COUNT(*) AS c FROM fetches f JOIN urls u ON u.url=f.url WHERE LOWER(u.host) = ?`).get(host)?.c || 0;
        } catch (_) { fetches = 0; }
      }
      db.close();
      res.json({ host, articles: art, fetches });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Server-rendered Gazetteer detail page (wiki-like)
  app.get('/gazetteer/place/:id', (req, res) => {
  const trace = startTrace(req, 'gazetteer');
    const id = parseInt(req.params.id, 10);
    function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c])); }
    function num(n) { if (n == null) return ''; try { return Number(n).toLocaleString(); } catch { return String(n); } }
  function fmtBytes(n) { if (n == null) return ''; const units=['B','KB','MB','GB','TB']; let i=0; let v = Number(n)||0; while (v>=1024 && i<units.length-1) { v/=1024; i++; } return (i===0? String(v|0) : v.toFixed(1)) + ' ' + units[i]; }
    if (!id) { res.status(400).send('<!doctype html><title>Bad id</title><p>Invalid id</p>'); return; }
    try {
      let openDbReadOnly; try { ({ openDbReadOnly } = require('../../ensure_db')); } catch (e) { res.status(503).send('<!doctype html><title>Gazetteer</title><h1>Gazetteer</h1><p>Database unavailable.</p>'); return; }
      const doneOpen = trace.pre('db-open');
      const db = openDbReadOnly(urlsDbPath);
      doneOpen();
      const doneGetPlace = trace.pre('get-place');
      const place = db.prepare('SELECT * FROM places WHERE id = ?').get(id);
      doneGetPlace();
      if (!place) { db.close(); res.status(404).send('<!doctype html><title>Not found</title><p>Place not found</p>'); return; }
      const doneNames = trace.pre('get-names');
      const names = db.prepare('SELECT * FROM place_names WHERE place_id = ? ORDER BY is_official DESC, is_preferred DESC, name').all(id);
      doneNames();
      const doneIds = trace.pre('get-external-ids');
      const ids = db.prepare('SELECT * FROM place_external_ids WHERE place_id = ?').all(id);
      doneIds();
      const doneParents = trace.pre('get-parents');
      const parents = db.prepare('SELECT ph.parent_id, p.kind, p.country_code, p.adm1_code, COALESCE(cn.name, pn.name) AS name FROM place_hierarchy ph JOIN places p ON p.id = ph.parent_id LEFT JOIN place_names pn ON pn.place_id = p.id LEFT JOIN place_names cn ON cn.id = p.canonical_name_id WHERE ph.child_id = ?').all(id);
      doneParents();
      const doneChildren = trace.pre('get-children');
      const children = db.prepare('SELECT ph.child_id, p.kind, p.country_code, p.adm1_code, COALESCE(cn.name, pn.name) AS name FROM place_hierarchy ph JOIN places p ON p.id = ph.child_id LEFT JOIN place_names pn ON pn.place_id = p.id LEFT JOIN place_names cn ON cn.id = p.canonical_name_id WHERE ph.parent_id = ? LIMIT 200').all(id);
      doneChildren();
      // Related articles by canonical name if present
      let articles = [];
      try {
        const doneArticleName = trace.pre('get-article-name');
        const cname = place.canonical_name_id ? (db.prepare('SELECT name FROM place_names WHERE id = ?').get(place.canonical_name_id)?.name || null) : null;
        doneArticleName();
        if (cname) {
          const doneArticles = trace.pre('get-articles');
          articles = db.prepare(`
            SELECT a.url, a.title, a.date
            FROM article_places ap JOIN articles a ON a.url = ap.article_url
            WHERE ap.place = ?
            ORDER BY (a.date IS NULL) ASC, a.date DESC
            LIMIT 20
          `).all(cname);
          doneArticles();
        }
      } catch (_) {}
      // Place hubs by slug derived from canonical name
      let hubs = [];
      try {
        const doneHubName = trace.pre('get-hub-name');
        const cname = place.canonical_name_id ? (db.prepare('SELECT name FROM place_names WHERE id = ?').get(place.canonical_name_id)?.name || null) : null;
        const slug = cname ? String(cname).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') : '';
        doneHubName();
        const doneHubs = trace.pre('get-hubs');
        if (slug) hubs = db.prepare('SELECT * FROM place_hubs WHERE place_slug = ? ORDER BY last_seen_at DESC LIMIT 20').all(slug);
        doneHubs();
      } catch (_) {}
      // Resolve breadcrumb links
      let bcCountry = null; let bcRegion = null;
      try {
        const doneBreadcrumbs = trace.pre('breadcrumbs');
        if (place.country_code) {
          bcCountry = { cc: place.country_code, name: (place.country_code) };
          try {
            const crow = db.prepare(`SELECT COALESCE(cn.name, pn.name) AS name FROM places p LEFT JOIN place_names pn ON pn.place_id=p.id LEFT JOIN place_names cn ON cn.id=p.canonical_name_id WHERE p.kind='country' AND p.country_code = ? GROUP BY p.id`).get(place.country_code);
            if (crow && crow.name) bcCountry.name = crow.name;
          } catch (_) {}
        }
        if (place.country_code && place.adm1_code) {
          bcRegion = db.prepare(`SELECT id, COALESCE(cn.name, pn.name) AS name FROM places p LEFT JOIN place_names pn ON pn.place_id=p.id LEFT JOIN place_names cn ON cn.id=p.canonical_name_id WHERE p.kind='region' AND p.country_code = ? AND p.adm1_code = ? GROUP BY p.id LIMIT 1`).get(place.country_code, place.adm1_code) || null;
        }
        doneBreadcrumbs();
      } catch (_) {}
      const doneClose = trace.pre('db-close');
      // Compute storage size for this place (best-effort)
      let size_bytes = 0;
      try {
        const row = db.prepare(`WITH
  t_places(rowid) AS (SELECT id FROM places WHERE id = ?),
  t_names(rowid) AS (SELECT rowid FROM place_names WHERE place_id = ?),
  t_ext(rowid) AS (SELECT rowid FROM place_external_ids WHERE place_id = ?),
  t_hier(rowid) AS (SELECT rowid FROM place_hierarchy WHERE parent_id = ? OR child_id = ?),
  idx_places AS (SELECT name FROM pragma_index_list('places')),
  idx_names AS (SELECT name FROM pragma_index_list('place_names')),
  idx_ext AS (SELECT name FROM pragma_index_list('place_external_ids')),
  idx_hier AS (SELECT name FROM pragma_index_list('place_hierarchy'))
SELECT (
  COALESCE((SELECT SUM(payload) FROM dbstat WHERE (name='places' AND rowid IN (SELECT rowid FROM t_places)) OR (name IN (SELECT name FROM idx_places) AND rowid IN (SELECT rowid FROM t_places))),0)
  + COALESCE((SELECT SUM(payload) FROM dbstat WHERE (name='place_names' AND rowid IN (SELECT rowid FROM t_names)) OR (name IN (SELECT name FROM idx_names) AND rowid IN (SELECT rowid FROM t_names))),0)
  + COALESCE((SELECT SUM(payload) FROM dbstat WHERE (name='place_external_ids' AND rowid IN (SELECT rowid FROM t_ext)) OR (name IN (SELECT name FROM idx_ext) AND rowid IN (SELECT rowid FROM t_ext))),0)
  + COALESCE((SELECT SUM(payload) FROM dbstat WHERE (name='place_hierarchy' AND rowid IN (SELECT rowid FROM t_hier)) OR (name IN (SELECT name FROM idx_hier) AND rowid IN (SELECT rowid FROM t_hier))),0)
) AS bytes`).get(id, id, id, id, id);
        if (row && typeof row.bytes === 'number') size_bytes = row.bytes|0;
      } catch (_) {
        try {
          const a = db.prepare(`SELECT COALESCE(LENGTH(kind),0)+COALESCE(LENGTH(country_code),0)+COALESCE(LENGTH(adm1_code),0)+COALESCE(LENGTH(adm2_code),0)+COALESCE(LENGTH(timezone),0)+COALESCE(LENGTH(bbox),0)+COALESCE(LENGTH(source),0)+COALESCE(LENGTH(extra),0) AS b FROM places WHERE id=?`).get(id)?.b || 0;
          const b = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(name),0)+COALESCE(LENGTH(normalized),0)+COALESCE(LENGTH(lang),0)+COALESCE(LENGTH(script),0)+COALESCE(LENGTH(name_kind),0)+COALESCE(LENGTH(source),0)),0) AS b FROM place_names WHERE place_id=?`).get(id)?.b || 0;
          const c = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(source),0)+COALESCE(LENGTH(ext_id),0)),0) AS b FROM place_external_ids WHERE place_id=?`).get(id)?.b || 0;
          const d = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(relation),0)),0) AS b FROM place_hierarchy WHERE parent_id=? OR child_id=?`).get(id, id)?.b || 0;
          size_bytes = (a + b + c + d) | 0;
        } catch (_) { size_bytes = 0; }
      }
      db.close();
      doneClose();

      const title = names.find(n => n.id === place.canonical_name_id)?.name || names[0]?.name || '(unnamed)';
      // Build external ID links
      const idLink = (src, val) => {
        const s = String(src || '').toLowerCase();
        const v = String(val || '').trim();
        if (!v) return null;
        if (s === 'wikidata' || s === 'wd' || s === 'wdid') return { href: `https://www.wikidata.org/wiki/${encodeURIComponent(v)}`, label: 'Wikidata' };
        if (s === 'geonames' || s === 'geoname' || s === 'gn') return { href: `https://www.geonames.org/${encodeURIComponent(v)}`, label: 'GeoNames' };
        if (s === 'osm' || s === 'openstreetmap') {
          // support relation:123, way:456, node:789 or raw id (assume relation)
          const m = v.match(/^(node|way|relation)\s*[:#-]?\s*(\d+)$/i);
          if (m) {
            return { href: `https://www.openstreetmap.org/${m[1].toLowerCase()}/${m[2]}`, label: 'OpenStreetMap' };
          }
          if (/^\d+$/.test(v)) return { href: `https://www.openstreetmap.org/relation/${v}`, label: 'OpenStreetMap' };
        }
        return null;
      };
      const idLinksHtml = ids
        .map(r => { const L = idLink(r.source, r.ext_id); if (!L) return null; return `<li><a href="${L.href}" target="_blank" rel="noopener">${esc(L.label)}</a> <span class="meta">${esc(String(r.ext_id))}</span></li>`; })
        .filter(Boolean)
        .join('');
      const html = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)} — Gazetteer</title>
<style>
  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff;--bg-soft:#f8fafc}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
  .container{max-width:1000px;margin:18px auto;padding:0 16px}
  header{display:flex;align-items:center;justify-content:space-between;margin:6px 0 12px}
  header h1{margin:6px 0 0}
  .meta{color:var(--muted);font-size:13px}
  .grid{display:grid;grid-template-columns:2fr 1fr;gap:12px}
  @media (max-width: 900px){ .grid{grid-template-columns:1fr} }
  .card{background:var(--bg-soft);border:1px solid var(--border);border-radius:10px;padding:10px}
  h2{margin:0 0 8px}
  ul{margin:6px 0 0 16px}
  li{margin:2px 0}
  a.back{ text-decoration:none }
  a.back:hover{ text-decoration:underline }
  .badge{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:2px 8px;margin-left:6px;font-size:12px;color:#334155;background:#fff}
  .section{margin-top:10px}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  @media (max-width: 700px){ .cols{grid-template-columns:1fr} }
  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden}
  th,td{border-bottom:1px solid var(--border);padding:8px 10px;font-size:14px}
  th{color:var(--muted);text-align:left;background:#fcfcfd}
</style>
</head><body>
  <div class="container">
    <header>
      <div>
        <div class="meta" style="margin-bottom:4px">🏠 <a href="/gazetteer">Gazetteer</a>${bcCountry?` › <a href="/gazetteer/country/${esc(bcCountry.cc)}">${esc(bcCountry.name||bcCountry.cc)}</a>`:''}${bcRegion?` › <a href="/gazetteer/place/${bcRegion.id}">${esc(bcRegion.name||'')}</a>`:''}</div>
        <h1>${esc(title)} <span class="badge">${esc(place.kind)}</span></h1>
        <div class="meta">${place.country_code?('· '+esc(place.country_code)) : ''} ${place.adm1_code?('· '+esc(place.adm1_code)) : ''} ${place.population?('· pop '+num(place.population)) : ''} · id ${place.id}</div>
      </div>
      ${renderGlobalNav('gazetteer')}
    </header>

    <div class="grid">
      <section class="card">
        <h2>Names</h2>
        <ul>${names.map(n => `<li>${esc(n.name)} <span class="meta">${esc(n.lang||'')} ${esc(n.name_kind||'')}</span></li>`).join('')}</ul>
      </section>
      <aside class="card">
        <h3>Infobox</h3>
  <div class="meta">Kind: ${esc(place.kind)}</div>
  <div class="meta">Storage: ${fmtBytes(size_bytes)}</div>
        ${place.country_code?`<div class="meta">Country: <a href="/gazetteer/country/${esc(place.country_code)}">${esc(place.country_code)}</a></div>`:''}
        ${place.adm1_code?`<div class="meta">ADM1: ${esc(place.adm1_code)}</div>`:''}
        ${place.population?`<div class="meta">Population: ${num(place.population)}</div>`:''}
        ${(place.lat!=null && place.lng!=null)?`<div class="meta">Coords: ${place.lat.toFixed?.(3)??place.lat}, ${place.lng.toFixed?.(3)??place.lng}</div>`:''}
  <div class="meta">IDs: ${ids.length}</div>
  ${idLinksHtml?`<ul>${idLinksHtml}</ul>`:''}
      </aside>
    </div>

    <section class="card section">
      <h2>Hierarchy</h2>
      <div class="cols">
        <div><strong>Parents</strong><ul>${parents.map(p => `<li>${esc(p.name||'')} <span class="meta">${esc(p.kind||'')}</span></li>`).join('')}</ul></div>
        <div><strong>Children</strong><ul>${children.map(c => `<li>${esc(c.name||'')} <span class="meta">${esc(c.kind||'')}</span></li>`).join('')}</ul></div>
      </div>
    </section>

    <div class="grid section">
      <section class="card">
        <h2>Articles</h2>
        <ul>${articles.map(a => `<li><a href="${a.url}" target="_blank">${esc(a.title||a.url)}</a> <span class="meta">${esc(a.date||'')}</span></li>`).join('') || '<li class="meta">None</li>'}</ul>
      </section>
      <section class="card">
        <h2>Hubs</h2>
        <ul>${hubs.map(h => `<li><a href="${h.url}" target="_blank">${esc(h.title||h.url)}</a> <span class="meta">${esc(h.host||'')}</span></li>`).join('') || '<li class="meta">None</li>'}</ul>
      </section>
    </div>
  </div>
</body></html>`;

  const doneRender = trace.pre('render');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
  doneRender();
  trace.end();
    } catch (e) {
  try { trace.end(); } catch (_) {}
      res.status(500).send('<!doctype html><title>Error</title><pre>' + esc(e.message||String(e)) + '</pre>');
    }
  });

  // Server-rendered list of all countries
  app.get('/gazetteer/countries', (req, res) => {
    const trace = startTrace(req, 'gazetteer');
    function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c])); }
    function num(n) { if (n == null) return ''; try { return Number(n).toLocaleString(); } catch { return String(n); } }
    try {
  let openDbReadOnly; try { ({ openDbReadOnly } = require('../../ensure_db')); } catch (e) {
        res.status(503).send('<!doctype html><title>Countries</title><h1>Countries</h1><p>Database unavailable.</p>'); return;
      }
      const doneOpen = trace.pre('db-open');
  const db = openDbReadOnly(urlsDbPath);
      doneOpen();
      const doneList = trace.pre('list-countries');
  const rows = db.prepare(`
        SELECT p.id, p.country_code, p.population, COALESCE(cn.name, pn.name) AS name
        FROM places p
        LEFT JOIN place_names pn ON pn.place_id = p.id
        LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
        WHERE p.kind = 'country'
        GROUP BY p.id
        ORDER BY name ASC
      `).all();
      doneList();
      const doneClose = trace.pre('db-close');
      db.close();
      doneClose();
      const htmlRows = rows.map(r => `
        <tr>
          <td><a href="/gazetteer/place/${r.id}">${esc(r.name||'')}</a></td>
          <td>${esc(r.country_code||'')}</td>
          <td style="text-align:right">${num(r.population)}</td>
        </tr>
      `).join('') || '<tr><td colspan="3" class="meta">No countries</td></tr>';
      const page = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Countries — Gazetteer</title>
<style>
  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
  .container{max-width:900px;margin:18px auto;padding:0 16px}
  header{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 12px}
  header h1{margin:0;font-size:20px}
  header nav a{color:var(--muted);text-decoration:none;margin-left:10px}
  header nav a:hover{color:var(--fg);text-decoration:underline}
  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden}
  th,td{border-bottom:1px solid var(--border);padding:8px 10px;font-size:14px}
  th{color:var(--muted);text-align:left;background:#fcfcfd}
  tr:nth-child(even){background:#fafafa}
  tr:hover{background:#f6f8fa}
  .meta{color:var(--muted);font-size:12px}
</style>
</head><body>
  <div class="container">
    <header>
      <h1>Countries</h1>
      ${renderGlobalNav('gazetteer')}
    </header>
    <table>
      <thead><tr><th>Name</th><th>CC</th><th style="text-align:right">Population</th></tr></thead>
      <tbody>${htmlRows || '<tr><td colspan="3" class="meta">No countries</td></tr>'}</tbody>
    </table>
  </div>
</body></html>`;
  const doneRender = trace.pre('render');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(page);
  doneRender();
  trace.end();
    } catch (e) {
  try { trace.end(); } catch (_) {}
      res.status(500).send('<!doctype html><title>Error</title><pre>' + esc(e.message||String(e)) + '</pre>');
    }
  });

  // Recent domains API (from saved articles)
  app.get('/api/recent-domains', (req, res) => {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit || '20', 10) || 20, 100));
    let NewsDatabase;
    try { NewsDatabase = require('../../db'); } catch (e) {
      // Graceful fallback: return empty list so UI shows 'No recent domains' instead of failing
      return res.status(200).json({ count: 0, totalSeen: 0, limit, domains: [] });
    }
    try {
      const db = new NewsDatabase(urlsDbPath);
      const rows = db.db.prepare(`
        SELECT url, COALESCE(fetched_at, crawled_at) AS ts
        FROM articles
        WHERE COALESCE(fetched_at, crawled_at) IS NOT NULL
        ORDER BY ts DESC
        LIMIT 500
      `).all();
      db.close();
      const map = new Map();
      for (const r of rows) {
        try {
          const host = new URL(r.url).hostname.toLowerCase();
          const ts = r.ts || null;
          if (!map.has(host)) map.set(host, { host, article_count: 0, last_saved_at: ts });
          const entry = map.get(host);
          entry.article_count += 1;
          if (!entry.last_saved_at || (ts && ts > entry.last_saved_at)) entry.last_saved_at = ts;
        } catch (_) { /* ignore bad urls */ }
      }
      const list = Array.from(map.values()).sort((a,b) => (b.last_saved_at || '').localeCompare(a.last_saved_at || '')).slice(0, limit);
  res.json({ count: list.length, totalSeen: map.size, limit, domains: list });
    } catch (e) {
  // Graceful fallback: empty domains list
  res.status(200).json({ count: 0, totalSeen: 0, limit, domains: [] });
    }
  });

  app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // Expose a shutdown helper so the outer server can close cleanly on Ctrl-C
  app.locals._attachSignalHandlers = (httpServer) => {
    const sockets = new Set();
    try {
      httpServer.on('connection', (socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
      });
    } catch (_) {}
    const shutdown = (signal) => {
      // Stop child crawler if running
      try { if (child && typeof child.kill === 'function') child.kill('SIGTERM'); } catch (_) {}
      // End SSE clients to unblock server.close
      try {
        for (const client of sseClients) {
          try { client.res.end(); } catch (_) {}
        }
      } catch (_) {}
      // Attempt graceful close, then force-destroy lingering sockets
      try {
        httpServer.close(() => process.exit(0));
        const t = setTimeout(() => {
          try { for (const s of sockets) { try { s.destroy(); } catch (_) {} } } catch (_) {}
          try { process.exit(0); } catch (_) { /* noop */ }
        }, 500);
        try { t.unref?.(); } catch (_) {}
      } catch (_) {
        process.exit(0);
      }
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  };

  return app;
}

function startServer() {
  const PORT = process.env.PORT || 3000;
  const app = createApp();
  const server = app.listen(PORT, () => {
    try {
      const addr = server.address();
      const port = (addr && typeof addr === 'object') ? addr.port : PORT;
      console.log(`GUI server listening on http://localhost:${port}`);
    } catch (_) {
      console.log(`GUI server listening on http://localhost:${PORT}`);
    }
  });
  // Install foreground signal handlers (Ctrl-C will close server and child)
  app.locals._attachSignalHandlers?.(server);
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { createApp, startServer };
