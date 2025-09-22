#!/usr/bin/env node

const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const { ensureDb } = require('../src/ensure_db');
  function openAppDb() {
    const envPath = process.env.NEWS_DB_PATH;
    const defaultPath = path.join(findProjectRoot(__dirname), 'data', 'news.db');
    return ensureDb(envPath || defaultPath);
  }
const { findProjectRoot } = require('../src/utils/project-root');

function buildArgs(body) {
  const args = ['src/crawl.js'];
  const url = body.startUrl || 'https://www.theguardian.com';
  args.push(url);
  if (body.depth != null) args.push(`--depth=${parseInt(body.depth, 10)}`);
  if (body.maxPages != null) args.push(`--max-pages=${parseInt(body.maxPages, 10)}`);
  // Support both maxAge and refetchIfOlderThan from UI
  if (body.maxAge) args.push(`--max-age=${String(body.maxAge)}`);
  if (body.refetchIfOlderThan) args.push(`--refetch-if-older-than=${String(body.refetchIfOlderThan)}`);
  if (body.concurrency != null) args.push(`--concurrency=${parseInt(body.concurrency, 10)}`);
  if (body.maxQueue != null) args.push(`--max-queue=${parseInt(body.maxQueue, 10)}`);
  if (body.noDb === true) args.push('--no-db');
  if (body.dbPath) args.push(`--db=${body.dbPath}`);
  // Slow mode toggle
  if (body.slow === true || body.slowMode === true) args.push('--slow');
  // Sitemap flags
  if (body.useSitemap === false) args.push('--no-sitemap');
  if (body.sitemapOnly === true) args.push('--sitemap-only');
  if (body.sitemapMaxUrls != null) args.push(`--sitemap-max=${parseInt(body.sitemapMaxUrls, 10)}`);
  // Cache preference override (default is prefer cache; allow disabling)
  if (body.preferCache === false) args.push('--no-prefer-cache');
  return args;
}

function defaultRunner() {
  return {
    start(args) {
      const node = process.execPath;
      const cp = spawn(node, args, { cwd: path.join(__dirname, '..'), env: process.env });
      return cp;
    }
  };
}

function createApp(options = {}) {
  const runner = options.runner || defaultRunner();
  const app = express();
  const sseClients = new Set();
  let child = null;
  let startedAt = null;
  let lastExit = null;
  let stdoutBuf = '';
  let stderrBuf = '';
  let paused = false;

  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  function broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of sseClients) {
      res.write(payload);
    }
  }

  app.get('/api/status', (req, res) => {
    res.json({
      running: !!child,
      pid: child?.pid || null,
      startedAt,
      lastExit
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
    lastExit = null;

    child.stdout.on('data', (chunk) => {
      stdoutBuf += chunk.toString();
      let idx;
      while ((idx = stdoutBuf.indexOf('\n')) !== -1) {
        const line = stdoutBuf.slice(0, idx);
        stdoutBuf = stdoutBuf.slice(idx + 1);
        if (!line) continue;
        broadcast('log', { stream: 'stdout', line: line + '\n' });
        if (line.startsWith('PROGRESS ')) {
          try {
            const obj = JSON.parse(line.slice('PROGRESS '.length));
            broadcast('progress', obj);
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
        const m = line.match(/Final stats: (\d+) pages visited, (\d+) pages downloaded, (\d+) articles found, (\d+) articles saved/);
        if (m) {
          broadcast('progress', {
            visited: parseInt(m[1], 10),
            downloaded: parseInt(m[2], 10),
            found: parseInt(m[3], 10),
            saved: parseInt(m[4], 10)
          });
        }
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

  // Pause/resume control via child stdin
  app.post('/api/pause', (req, res) => {
    if (!child || !child.stdin || typeof child.stdin.write !== 'function') {
      return res.status(200).json({ paused: false, error: 'not-running' });
    }
    try {
      child.stdin.write('PAUSE\n');
      paused = true;
      broadcast('progress', { paused: true });
      res.json({ paused: true });
    } catch (e) {
      res.status(500).json({ paused: false, error: e.message });
    }
  });

  app.post('/api/resume', (req, res) => {
    if (!child || !child.stdin || typeof child.stdin.write !== 'function') {
      return res.status(200).json({ paused: false, error: 'not-running' });
    }
    try {
      child.stdin.write('RESUME\n');
      paused = false;
      broadcast('progress', { paused: false });
      res.json({ paused: false });
    } catch (e) {
      res.status(500).json({ paused: true, error: e.message });
    }
  });

  app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    sseClients.add(res);
    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  // Gazetteer APIs (read-only)
  app.get('/api/gazetteer/summary', (req, res) => {
    try {
      const db = openAppDb();
      const row = {
        countries: db.prepare("SELECT COUNT(*) c FROM places WHERE kind='country'").get().c,
        regions: db.prepare("SELECT COUNT(*) c FROM places WHERE kind='region'").get().c,
        cities: db.prepare("SELECT COUNT(*) c FROM places WHERE kind='city'").get().c,
        names: db.prepare('SELECT COUNT(*) c FROM place_names').get().c,
        sources: db.prepare('SELECT COUNT(*) c FROM place_sources').get().c
      };
      db.close();
      res.json(row);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/gazetteer/places', (req, res) => {
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
    const format = String(req.query.format || 'json').toLowerCase();
    try {
      const db = openAppDb();
      const clauses = [];
      const params = [];
      if (q) { clauses.push('(LOWER(pn.name) LIKE ? OR LOWER(cn.name) LIKE ?)'); const like = `%${q.toLowerCase()}%`; params.push(like, like); }
      if (kind) { clauses.push('p.kind = ?'); params.push(kind); }
      if (cc) { clauses.push('p.country_code = ?'); params.push(cc); }
      if (adm1) { clauses.push('p.adm1_code = ?'); params.push(adm1); }
      if (minpop > 0) { clauses.push('COALESCE(p.population,0) >= ?'); params.push(minpop); }
      const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
      const sortCol = (sort === 'pop' || sort === 'population') ? 'p.population' : (sort === 'country' ? 'p.country_code' : 'name');
      const total = db.prepare(`
        SELECT COUNT(DISTINCT p.id) AS c
        FROM places p
        LEFT JOIN place_names pn ON pn.place_id = p.id
        LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
        ${where}
      `).get(...params).c;
      const rows = db.prepare(`
        SELECT p.id, p.kind, p.country_code, p.adm1_code, p.population,
               COALESCE(cn.name, pn.name) AS name
        FROM places p
        LEFT JOIN place_names pn ON pn.place_id = p.id
        LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
        ${where}
        GROUP BY p.id
        ORDER BY ${sortCol} ${dir}
        LIMIT ? OFFSET ?
      `).all(...params, pageSize, offset);
      db.close();
      if (format === 'ndjson') {
        res.setHeader('Content-Type', 'application/x-ndjson');
        for (const r of rows) res.write(JSON.stringify(r) + '\n');
        return res.end();
      }
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.write('id,name,kind,country_code,adm1_code,population\n');
        for (const r of rows) res.write([r.id, JSON.stringify(r.name||''), r.kind, r.country_code||'', r.adm1_code||'', r.population??''].join(',') + '\n');
        return res.end();
      }
      res.json({ total, page, pageSize, rows });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/gazetteer/place/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'invalid id' });
    try {
      const db = openAppDb();
      const place = db.prepare('SELECT * FROM places WHERE id = ?').get(id);
      if (!place) { db.close(); return res.status(404).json({ error: 'not found' }); }
      const names = db.prepare('SELECT * FROM place_names WHERE place_id = ? ORDER BY is_official DESC, is_preferred DESC, name').all(id);
      const ids = db.prepare('SELECT * FROM place_external_ids WHERE place_id = ?').all(id);
      const parents = db.prepare('SELECT ph.parent_id, p.kind, p.country_code, p.adm1_code, COALESCE(cn.name, pn.name) AS name FROM place_hierarchy ph JOIN places p ON p.id = ph.parent_id LEFT JOIN place_names pn ON pn.place_id = p.id LEFT JOIN place_names cn ON cn.id = p.canonical_name_id WHERE ph.child_id = ?').all(id);
      const children = db.prepare('SELECT ph.child_id, p.kind, p.country_code, p.adm1_code, COALESCE(cn.name, pn.name) AS name FROM place_hierarchy ph JOIN places p ON p.id = ph.child_id LEFT JOIN place_names pn ON pn.place_id = p.id LEFT JOIN place_names cn ON cn.id = p.canonical_name_id WHERE ph.parent_id = ? LIMIT 200').all(id);
      db.close();
      res.json({ place, names, external_ids: ids, parents, children });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Articles mentioning a place (by name or by place_id via canonical name)
  app.get('/api/gazetteer/articles', (req, res) => {
    const id = parseInt(req.query.id || '0', 10) || null;
    const nameQ = String(req.query.name || '').trim();
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit || '50', 10)));
    try {
      const db = openAppDb();
      let rows = [];
      if (id) {
        const place = db.prepare('SELECT * FROM places WHERE id = ?').get(id);
        if (!place) { db.close(); return res.json([]); }
        const cname = db.prepare('SELECT name FROM place_names WHERE id = ?').get(place.canonical_name_id || -1)?.name || null;
        if (cname) {
          rows = db.prepare(`
            SELECT a.url, a.title, a.date
            FROM article_places ap
            JOIN articles a ON a.url = ap.article_url
            WHERE ap.place = ?
            ORDER BY a.date DESC NULLS LAST
            LIMIT ?
          `).all(cname, limit);
        }
      } else if (nameQ) {
        rows = db.prepare(`
          SELECT a.url, a.title, a.date
          FROM article_places ap
          JOIN articles a ON a.url = ap.article_url
          WHERE ap.place = ?
          ORDER BY a.date DESC NULLS LAST
          LIMIT ?
        `).all(nameQ, limit);
      }
      db.close();
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Place hubs list
  app.get('/api/gazetteer/hubs', (req, res) => {
    const host = String(req.query.host || '').trim().toLowerCase();
    const slug = String(req.query.slug || '').trim();
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit || '100', 10)));
    try {
      const db = openAppDb();
      const clauses = [];
      const params = [];
      if (host) { clauses.push('host = ?'); params.push(host); }
      if (slug) { clauses.push('place_slug = ?'); params.push(slug); }
      const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
      const rows = db.prepare(`SELECT * FROM place_hubs ${where} ORDER BY last_seen_at DESC LIMIT ?`).all(...params, limit);
      db.close();
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Disambiguation resolver: return candidate list with scores for a token/phrase in context of a URL
  app.get('/api/gazetteer/resolve', (req, res) => {
    const phrase = String(req.query.q || '').trim();
    const url = String(req.query.url || '').trim();
    if (!phrase) return res.status(400).json({ error: 'q required' });
    try {
      const db = openAppDb();
      // Reuse minimal matchers: nameMap only
      const rows = db.prepare(`
        SELECT pn.name, COALESCE(pn.normalized, LOWER(pn.name)) AS norm, p.id AS place_id, p.kind, p.country_code, COALESCE(p.population,0) AS population
        FROM place_names pn
        JOIN places p ON p.id = pn.place_id
        WHERE (pn.lang IS NULL OR pn.lang='en') AND pn.name_kind IN ('common','official','alias','endonym','exonym')
      `).all();
      const { nameMap } = (() => {
        const nm = new Map();
        for (const r of rows) {
          const k = (r.norm || r.name).toLowerCase();
          const rec = { place_id: r.place_id, kind: r.kind, country_code: r.country_code || null, name: r.name, population: r.population };
          if (!nm.has(k)) nm.set(k, []);
          nm.get(k).push(rec);
        }
        return { nameMap: nm };
      })();
      const key = phrase.toLowerCase();
      const cands = nameMap.get(key) || [];
      // Simple URL-based cc inference
      let cc = null;
      try {
        const u = new URL(url);
        const tld = u.hostname.split('.').pop();
        const tmap = { uk: 'GB', gb: 'GB', ie: 'IE', fr: 'FR', de: 'DE', es: 'ES', it: 'IT', us: 'US', ca: 'CA' };
        cc = tmap[tld] || null;
      } catch (_) {}
      const scored = cands.map(c => ({
        ...c,
        score: (cc && c.country_code && cc === c.country_code ? 5 : 0) + (c.population > 0 ? Math.log10(c.population + 1) * 0.5 : 0)
      })).sort((a,b) => b.score - a.score).slice(0, 10);
      db.close();
      res.json(scored);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Catch-all for SPA
  app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  return app;
}

function startServer() {
  const PORT = process.env.PORT || 3000;
  const app = createApp();
  return app.listen(PORT, () => {
    console.log(`GUI server listening on http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { createApp, startServer };
