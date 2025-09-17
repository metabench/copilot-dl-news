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
  const app = express();
  const sseClients = new Set(); // stores { res, logsEnabled }
  let child = null;
  let startedAt = null;
  let lastExit = null;
  let stdoutBuf = '';
  let stderrBuf = '';
  let lastProgressStr = '';
  let lastProgressSentAt = 0;
  let paused = false;
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
    etag: true,
    lastModified: true,
    maxAge: '7d',
    immutable: true
  }));

  function broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
      if (event === 'log' && client.logsEnabled === false) continue;
  client.res.write(payload);
  try { client.res.flush?.(); } catch (_) {}
    }
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
    res.json({
      running: !!child,
      pid: child?.pid || null,
      startedAt,
  lastExit,
  paused
    });
  });

  app.post('/api/crawl', (req, res) => {
    if (child) return res.status(409).json({ error: 'Crawler already running' });

    const args = buildArgs(req.body || {});
    // Ensure crawler child uses the same DB as the UI server unless explicitly overridden
    if (!args.some(a => /^--db=/.test(a))) {
      args.push(`--db=${urlsDbPath}`);
    }
    child = runner.start(args);
    // Normalize interface: ensure stdout/stderr are EventEmitters that emit 'data'
    if (!child.stdout) child.stdout = new EventEmitter();
    if (!child.stderr) child.stderr = new EventEmitter();

    startedAt = new Date().toISOString();
  metrics.running = 1;
  metrics._lastSampleTime = Date.now();
  metrics._lastVisited = 0;
  metrics._lastDownloaded = 0;
  lastExit = null;
  paused = false;

    child.stdout.on('data', (chunk) => {
      stdoutBuf += chunk.toString();
      let idx;
      while ((idx = stdoutBuf.indexOf('\n')) !== -1) {
        const line = stdoutBuf.slice(0, idx);
        stdoutBuf = stdoutBuf.slice(idx + 1);
        if (!line) continue;
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
            broadcastProgress(obj);
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
        // If not a structured line, forward as log
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
        broadcast('log', { stream: 'stderr', line: line + '\n' });
      }
    });

    let exitEmitted = false;
    const onExit = (code, signal) => {
      if (exitEmitted) return; // guard against both 'exit' and 'close'
      exitEmitted = true;
      lastExit = { code, signal, endedAt: new Date().toISOString() };
      broadcast('done', lastExit);
      stdoutBuf = '';
      stderrBuf = '';
      child = null;
      startedAt = null;
  metrics.running = 0;
  paused = false;
    };

    if (typeof child.on === 'function') {
      child.on('exit', onExit);
      // Some fake runners might emit 'close' instead
      child.on('close', (code, signal) => onExit(code, signal));
    }

    res.status(202).json({ pid: child.pid || null, args });
  });

  app.post('/api/stop', (req, res) => {
    if (!child) return res.status(200).json({ stopped: false });
    try {
      if (typeof child.kill === 'function') child.kill('SIGTERM');
      res.status(202).json({ stopped: true });
    } catch (e) {
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
        return res.json({ ok: true, paused: true });
      }
      return res.status(500).json({ error: 'stdin unavailable' });
    } catch (e) {
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
        return res.json({ ok: true, paused: false });
      }
      return res.status(500).json({ error: 'stdin unavailable' });
    } catch (e) {
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
    }, 15000);

    const client = { res, logsEnabled, heartbeat };
    sseClients.add(client);
    // Seed a one-time log so users immediately see the stream is active
    try {
      if (logsEnabled) {
        const payload = `event: log\ndata: ${JSON.stringify({ stream: 'server', line: '[sse] log stream enabled\n' })}\n\n`;
        res.write(payload);
        res.flush?.();
      }
    } catch (_) {}
    req.on('close', () => {
      try { clearInterval(heartbeat); } catch (_) {}
      sseClients.delete(client);
    });
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

  // Filters
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
      // SQLite WAL autocheckpoint setting
      let walAutocheckpoint = null;
      let journalMode = null;
      try {
        let NewsDatabase;
        try { NewsDatabase = require('../../db'); } catch (e) { NewsDatabase = null; }
        if (NewsDatabase) {
          const db = new NewsDatabase(urlsDbPath);
          try { journalMode = db.db.pragma('journal_mode', { simple: true }); } catch(_) {}
          try { walAutocheckpoint = db.db.pragma('wal_autocheckpoint', { simple: true }); } catch(_) {}
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

  // List all news website domains (alphabetical). Falls back to distinct article hosts if categories unavailable.
  app.get('/api/news-domains', (req, res) => {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit || '2000', 10) || 2000, 10000));
    let NewsDatabase;
    try { NewsDatabase = require('../../db'); } catch (e) {
      // No DB available
      return res.status(200).json({ count: 0, total: 0, domains: [] });
    }
    try {
      const db = new NewsDatabase(urlsDbPath);
      let rows = [];
      try {
        rows = db.db.prepare(`
          SELECT d.host AS host
          FROM domains d
          JOIN domain_category_map m ON m.domain_id = d.id
          JOIN domain_categories c ON c.id = m.category_id
          WHERE LOWER(c.name) = 'news'
          GROUP BY d.host
          ORDER BY d.host ASC
          LIMIT ?
        `).all(limit);
      } catch (_) { rows = []; }
      // Fallback: derive from article URLs when domain categories are unavailable/empty
      if (!rows || rows.length === 0) {
        try {
          const fallback = db.db.prepare(`
            SELECT LOWER(substr(a.url, instr(substr(a.url, instr(a.url, '//')+2), '/') + instr(a.url, '//'))) AS host
            FROM articles a
            WHERE a.url LIKE 'http%://%'
            GROUP BY host
            ORDER BY host ASC
            LIMIT ?
          `).all(limit);
          rows = (fallback || []).filter(r => r && r.host).map(r => ({ host: r.host }));
        } catch (_) { rows = []; }
      }
      db.close();
      const domains = (rows || []).map(r => ({ host: String(r.host).toLowerCase() }));
      return res.json({ count: domains.length, total: domains.length, domains });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Domain summary API
  app.get('/api/domain-summary', (req, res) => {
    const host = String(req.query.host || req.query.domain || '').trim().toLowerCase();
    const includeSub = String(req.query.subdomains || req.query.includeSubdomains || '0') === '1';
    if (!host) return res.status(400).json({ error: 'Missing host' });
    let NewsDatabase;
    try { NewsDatabase = require('../../db'); } catch (e) {
      return res.status(503).json({ error: 'Database unavailable', detail: e.message });
    }
    try {
      const db = new NewsDatabase(urlsDbPath);
      const pats = [
        `http://${host}/%`,
        `https://${host}/%`
      ];
      if (includeSub) {
        pats.push(`http://%.${host}/%`, `https://%.${host}/%`);
      }
      const whereUrl = `(${pats.map(() => 'url LIKE ?').join(' OR ')})`;
      const whereArtUrl = whereUrl; // articles.url
      // Articles summary
      const artRow = db.db.prepare(
        `SELECT COUNT(*) AS total_articles, MAX(COALESCE(fetched_at, crawled_at)) AS last_saved_at
         FROM articles WHERE ${whereArtUrl}`
      ).get(...pats);
      const recentArticles = db.db.prepare(
        `SELECT url, title, section, date, COALESCE(fetched_at, crawled_at) AS ts
         FROM articles WHERE ${whereArtUrl}
         ORDER BY (ts IS NULL) ASC, ts DESC LIMIT 50`
      ).all(...pats);
      // Fetches summary
      const fetchRow = db.db.prepare(
        `SELECT COUNT(*) AS total_fetches,
                SUM(CASE WHEN http_status BETWEEN 200 AND 299 THEN 1 ELSE 0 END) AS ok_count,
                SUM(CASE WHEN http_status >= 400 THEN 1 ELSE 0 END) AS err_count,
                SUM(bytes_downloaded) AS total_bytes,
                AVG(total_ms) AS avg_total_ms,
                MAX(fetched_at) AS last_fetch_at
         FROM fetches WHERE ${whereUrl}`
      ).get(...pats);
      const topContentTypes = db.db.prepare(
        `SELECT content_type AS type, COUNT(*) AS c
         FROM fetches WHERE ${whereUrl}
         GROUP BY content_type ORDER BY c DESC LIMIT 5`
      ).all(...pats);
      const classBreakdown = db.db.prepare(
        `SELECT classification, COUNT(*) AS c
         FROM fetches WHERE ${whereUrl}
         GROUP BY classification ORDER BY c DESC`
      ).all(...pats);
      // Domain info and categories
      const domainInfo = db.db.prepare('SELECT * FROM domains WHERE host = ?').get(host) || null;
      let domainCategories = [];
      if (domainInfo) {
        domainCategories = db.db.prepare(`
          SELECT dc.name AS name
          FROM domain_category_map m
          JOIN domain_categories dc ON dc.id = m.category_id
          WHERE m.domain_id = ?
          ORDER BY dc.name ASC
        `).all(domainInfo.id).map(r => r.name);
      }
      // Compute heuristic analysis (not persisted here)
      let analysis = null;
      let analysisMetrics = null;
      try {
        const r = evaluateDomainFromDb(db, host);
        analysis = r.analysis || null;
        analysisMetrics = r.metrics || null;
      } catch (_) {}

      // 429-trigger analysis: estimate request/download rates around 429s
      let rate429 = null;
      try {
        // Gather recent 429 events from errors table; fallback to fetches
        const err429 = db.db.prepare(`
          SELECT at AS ts
          FROM errors
          WHERE host = ? AND kind IN ('http','network','timeout','other') AND code = 429
          ORDER BY at DESC
          LIMIT 50
        `).all(host);
        const events = (err429 && err429.length) ? err429 : db.db.prepare(`
          SELECT fetched_at AS ts
          FROM fetches
          WHERE (${whereUrl}) AND http_status = 429 AND fetched_at IS NOT NULL
          ORDER BY fetched_at DESC
          LIMIT 50
        `).all(...pats);
        const samples = [];
        for (const e of (events || [])) {
          const ts = e.ts;
          if (!ts) continue;
          // Define windows around event
          const beforeStart = db.db.prepare(`SELECT datetime(?, '-2 minutes') AS t`).get(ts).t;
          const afterEnd = db.db.prepare(`SELECT datetime(?, '+2 minutes') AS t`).get(ts).t;
          const aroundStart = db.db.prepare(`SELECT datetime(?, '-30 seconds') AS t`).get(ts).t;
          const aroundEnd = db.db.prepare(`SELECT datetime(?, '+30 seconds') AS t`).get(ts).t;
          // Count fetches and sum bytes in windows on same host
          const q = `SELECT COUNT(*) AS c, COALESCE(SUM(bytes_downloaded),0) AS b FROM fetches WHERE (${whereUrl}) AND fetched_at BETWEEN ? AND ?`;
          const before = db.db.prepare(q).get(...pats, beforeStart, ts);
          const after = db.db.prepare(q).get(...pats, ts, afterEnd);
          const around = db.db.prepare(q).get(...pats, aroundStart, aroundEnd);
          const rateReqPerMin = (around.c || 0) * (60 / 60); // 60s window
          const rateKBps = 60 > 0 ? ((around.b || 0) / 1024) / 60 : 0;
          samples.push({ ts, reqPerMin: rateReqPerMin, kbps: rateKBps, before: before.c||0, after: after.c||0 });
        }
        if (samples.length) {
          const avgReq = samples.reduce((a,s)=>a+s.reqPerMin,0)/samples.length;
          const p95Req = samples.map(s=>s.reqPerMin).sort((a,b)=>a-b)[Math.max(0, Math.floor(samples.length*0.95)-1)];
          const avgKbps = samples.reduce((a,s)=>a+s.kbps,0)/samples.length;
          const p95Kbps = samples.map(s=>s.kbps).sort((a,b)=>a-b)[Math.max(0, Math.floor(samples.length*0.95)-1)];
          rate429 = { samples: samples.length, avgReqPerMin: avgReq, p95ReqPerMin: p95Req, avgKBps: avgKbps, p95KBps: p95Kbps };
        }
      } catch (_) { rate429 = null; }

      // Place hub heuristic: pages with many nav links that share path patterns (e.g., /uk/wales/)
      let placeHub = null;
      try {
        // Candidate fetches classified as 'nav' with many nav links
        const cand = db.db.prepare(`
          SELECT url, nav_links_count, article_links_count
          FROM fetches
          WHERE (${whereUrl}) AND COALESCE(nav_links_count,0) >= 20
          ORDER BY nav_links_count DESC
          LIMIT 100
        `).all(...pats);
        const byPrefix = new Map();
        const placeRe = /\/(world|uk|us|europe|asia|africa|australia|business|sport|culture|technology|politics|wales|scotland|northern-ireland|england|city|region|state|country)\/(?:[a-z0-9-]+)(?:\/|$)/i;
        for (const r of cand) {
          try {
            const u = new URL(r.url);
            const path = u.pathname.toLowerCase();
            const m = path.match(placeRe);
            if (!m) continue;
            // Use the matched prefix up to the second segment after the category as a key
            const parts = path.split('/').filter(Boolean);
            let key = '/' + parts.slice(0, Math.min(3, parts.length)).join('/') + '/';
            if (!byPrefix.has(key)) byPrefix.set(key, { key, urls: 0, maxNav: 0, examples: [] });
            const g = byPrefix.get(key);
            g.urls += 1;
            g.maxNav = Math.max(g.maxNav, r.nav_links_count || 0);
            if (g.examples.length < 5) g.examples.push(r.url);
          } catch (_) {}
        }
        const list = Array.from(byPrefix.values()).sort((a,b)=> (b.urls - a.urls) || (b.maxNav - a.maxNav)).slice(0, 10);
        const totalCandidates = cand.length;
        placeHub = { totalCandidates, topPatterns: list };
      } catch (_) { placeHub = null; }

      db.close();
      res.json({
        host,
        includeSubdomains: includeSub,
        articles: artRow || { total_articles: 0, last_saved_at: null },
        fetches: fetchRow || { total_fetches: 0, ok_count: 0, err_count: 0, total_bytes: 0, avg_total_ms: null, last_fetch_at: null },
        topContentTypes,
        classification: classBreakdown,
        recentArticles,
        domain: domainInfo,
        domainCategories,
  analysis,
  analysisMetrics,
  rate429,
  placeHub
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/domain', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'domain.html'));
  });

  // Analyze a domain now and persist results
  app.post('/api/analyze-domain', (req, res) => {
    const host = String((req.body?.host || req.query.host || '').toLowerCase()).trim();
    if (!host) return res.status(400).json({ error: 'Missing host' });
    let NewsDatabase;
    try { NewsDatabase = require('../../db'); } catch (e) {
      return res.status(503).json({ error: 'Database unavailable', detail: e.message });
    }
    try {
      const db = new NewsDatabase(urlsDbPath);
      const { analysis } = evaluateDomainFromDb(db, host);
      db.upsertDomain(host, JSON.stringify(analysis));
      if (analysis.kind === 'news') {
        db.tagDomainWithCategory(host, 'news');
      }
      const domainInfo = db.db.prepare('SELECT * FROM domains WHERE host = ?').get(host) || null;
      let domainCategories = [];
      if (domainInfo) {
        domainCategories = db.db.prepare(`
          SELECT dc.name AS name
          FROM domain_category_map m
          JOIN domain_categories dc ON dc.id = m.category_id
          WHERE m.domain_id = ?
          ORDER BY dc.name ASC
        `).all(domainInfo.id).map(r => r.name);
      }
      db.close();
      res.json({ host, analysis, domain: domainInfo, domainCategories });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/url', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'url.html'));
  });

  app.get('/domains', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'domains.html'));
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
        setTimeout(() => {
          try { for (const s of sockets) { try { s.destroy(); } catch (_) {} } } catch (_) {}
          try { process.exit(0); } catch (_) { /* noop */ }
        }, 1500);
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
