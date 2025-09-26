const express = require('express');
const path = require('path');
const fs = require('fs');

// Router for URL listing and details-related APIs
function createUrlsApiRouter({ urlsDbPath }) {
  const router = express.Router();

  // List article URLs from the DB as JSON array (paginated)
  router.get('/api/urls', (req, res) => {
    try {
      // Lazy require DB to avoid crashing if native module is unavailable
      let NewsDatabase;
      try {
        NewsDatabase = require('../../../db');
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
      // Combined analysis filters (from latest fetch.analysis)
      const combinedHint = String(req.query.combinedHint || '').trim().toLowerCase(); // 'article'|'nav'|'other'
      let minCombinedConfidence = null;
      try {
        const raw = req.query.minCombinedConfidence ?? req.query.minConfidence;
        if (raw != null) {
          const n = Number(raw);
          if (!isNaN(n)) {
            // Accept either 0..1 or 0..100; normalize to 0..1
            minCombinedConfidence = n > 1 ? (n / 100) : n;
            if (minCombinedConfidence < 0) minCombinedConfidence = 0;
            if (minCombinedConfidence > 1) minCombinedConfidence = 1;
          }
        }
      } catch (_) { minCombinedConfidence = null; }

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
               lf.http_status AS http_status,
               lf.classification AS classification,
               lf.word_count AS word_count,
               -- Combined analysis (from latest fetch JSON)
               json_extract(f.analysis, '$.combined.hint') AS combined_hint,
               CAST(json_extract(f.analysis, '$.combined.confidence') AS REAL) AS combined_confidence
        FROM articles a
        LEFT JOIN latest_fetch lf ON lf.url = a.url
        LEFT JOIN fetches f ON f.url = a.url AND COALESCE(f.fetched_at, f.request_started_at) = lf.ts
        ${whereSql}
      `;
      const addFetchPred = [];
      const fetchParams = [];
      if (!isNaN(status) && status > 0) { addFetchPred.push('lf.http_status = ?'); fetchParams.push(status); }
      if (minWord > 0) { addFetchPred.push('(lf.word_count IS NOT NULL AND lf.word_count >= ?)'); fetchParams.push(minWord); }
      if (classification && ['article','nav','other'].includes(classification)) { addFetchPred.push('LOWER(lf.classification) = ?'); fetchParams.push(classification); }
      if (combinedHint && ['article','nav','other'].includes(combinedHint)) {
        addFetchPred.push("LOWER(json_extract(f.analysis, '$.combined.hint')) = ?");
        fetchParams.push(combinedHint);
      }
      if (minCombinedConfidence != null) {
        addFetchPred.push("CAST(json_extract(f.analysis, '$.combined.confidence') AS REAL) >= ?");
        fetchParams.push(minCombinedConfidence);
      }
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
        const items = rows.map(r => ({
          url: r.url,
          title: r.title || null,
          ts: r.ts || null,
          http_status: r.http_status ?? null,
          classification: r.classification || null,
          word_count: r.word_count ?? null,
          combined_hint: r.combined_hint || null,
          combined_confidence: (typeof r.combined_confidence === 'number') ? r.combined_confidence : (r.combined_confidence != null ? Number(r.combined_confidence) : null)
        }));
        return res.json({ count: items.length, total, limit, offset, urls, items, nextCursor, prevCursor });
      }
      res.json({ count: urls.length, total, limit, offset, urls, nextCursor, prevCursor });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Return a portion of a fetched file's body by fetch ID (text only)
  router.get('/api/fetch-body', (req, res) => {
  let NewsDatabase;
  try { NewsDatabase = require('../../../db'); } catch (e) {
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

  // URL details API
  router.get('/api/url-details', (req, res) => {
    const url = String(req.query.url || req.query.u || '').trim();
    if (!url) return res.status(400).json({ error: 'Missing url' });
    try {
      let NewsDatabase;
      try { NewsDatabase = require('../../../db'); } catch (e) {
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

  return router;
}

module.exports = { createUrlsApiRouter };
