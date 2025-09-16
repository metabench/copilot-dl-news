#!/usr/bin/env node

const express = require('express');
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
  if (body.saveJson === true) args.push('--save-json');
  if (body.slow === true) args.push('--slow');
  if (body.preferCache === true) args.push('--prefer-cache');
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
  const urlsDbPath = options.dbPath || path.join(__dirname, '..', '..', '..', 'data', 'news.db');
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
    errorRatePerMin: 0
  };

  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  function broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
      if (event === 'log' && client.logsEnabled === false) continue;
      client.res.write(payload);
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

    const onExit = (code, signal) => {
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
    lines.push('# HELP crawler_error_rate_per_min Errors per minute (recent)');
    lines.push('# TYPE crawler_error_rate_per_min gauge');
    lines.push(`crawler_error_rate_per_min ${metrics.errorRatePerMin || 0}`);
    res.send(lines.join('\n') + '\n');
  });

  app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const logsEnabled = String(req.query?.logs ?? '1') !== '0';
    const client = { res, logsEnabled };
    sseClients.add(client);
    req.on('close', () => {
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
      const details = String(req.query.details || '0') === '1';
      const dirRaw = String(req.query.dir || '').toLowerCase();
      const dir = dirRaw === 'asc' ? 'ASC' : 'DESC';
      const total = db.countStmt.get().count;
      // Prefer most recent first when possible
      const rows = db.db
        .prepare(
          `SELECT url, title, COALESCE(fetched_at, crawled_at) AS ts
           FROM articles
           ORDER BY (ts IS NULL) ASC, ts ${dir}
           LIMIT ? OFFSET ?`
        )
        .all(limit, offset);
      const urls = rows.map(r => r.url);
      db.close();
      if (details) {
        const items = rows.map(r => ({ url: r.url, title: r.title || null, ts: r.ts || null }));
        return res.json({ count: items.length, total, limit, offset, urls, items });
      }
      res.json({ count: urls.length, total, limit, offset, urls });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Recent errors grouped by status and host, with examples
  app.get('/api/recent-errors', (req, res) => {
    let NewsDatabase;
    try { NewsDatabase = require('../../db'); } catch (e) {
      return res.status(503).json({ error: 'Database unavailable', detail: e.message });
    }
    const limitRows = Math.max(100, Math.min(parseInt(req.query.rows || '1000', 10) || 1000, 5000));
    try {
      const db = new NewsDatabase(urlsDbPath);
      const rows = db.db.prepare(`
        SELECT url, http_status AS status, fetched_at AS ts
        FROM fetches
        WHERE http_status >= 400 AND fetched_at IS NOT NULL
        ORDER BY fetched_at DESC
        LIMIT ?
      `).all(limitRows);
      db.close();
      const groups = new Map(); // key: `${status}|${host}` -> { status, host, count, examples: [] }
      for (const r of rows) {
        let host = '';
        try { host = new URL(r.url).hostname.toLowerCase(); } catch (_) { host = ''; }
        const key = `${r.status}|${host}`;
        if (!groups.has(key)) groups.set(key, { status: r.status, host, count: 0, examples: [] });
        const g = groups.get(key);
        g.count += 1;
        if (g.examples.length < 3) g.examples.push({ url: r.url, ts: r.ts });
      }
      const list = Array.from(groups.values()).sort((a,b) => b.count - a.count).slice(0, 50);
      res.json({ totalGroups: list.length, totalRows: rows.length, errors: list });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
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
         ORDER BY ts DESC NULLS LAST LIMIT 50`
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
        domainCategories
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

  // Recent domains API (from saved articles)
  app.get('/api/recent-domains', (req, res) => {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit || '20', 10) || 20, 100));
    let NewsDatabase;
    try { NewsDatabase = require('../../db'); } catch (e) {
      return res.status(503).json({ error: 'Database unavailable', detail: e.message });
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
      res.status(500).json({ error: e.message });
    }
  });

  app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // Expose a shutdown helper so the outer server can close cleanly on Ctrl-C
  app.locals._attachSignalHandlers = (httpServer) => {
    const shutdown = (signal) => {
      try {
        if (child && typeof child.kill === 'function') child.kill('SIGTERM');
      } catch (_) {}
      try {
        httpServer.close(() => process.exit(0));
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
    console.log(`GUI server listening on http://localhost:${PORT}`);
  });
  // Install foreground signal handlers (Ctrl-C will close server and child)
  app.locals._attachSignalHandlers?.(server);
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { createApp, startServer };
