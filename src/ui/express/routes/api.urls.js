const express = require('express');
const path = require('path');
const fs = require('fs');
const { parseListOptions, listUrls } = require('../data/urlListing');
const { getFetchFileInfo, getUrlRecord } = require('../data/urlDetails');

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
      const details = String(req.query.details || '0') === '1';
      const options = parseListOptions(req.query);
      const handle = typeof db.getHandle === 'function' ? db.getHandle() : db.db;
      const { total, urls, rows, nextCursor, prevCursor } = listUrls(handle, options);
      db.close();
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
        return res.json({
          count: items.length,
          total,
          limit: options.limit,
          offset: options.offset,
          urls,
          items,
          nextCursor,
          prevCursor
        });
      }
      res.json({
        count: urls.length,
        total,
        limit: options.limit,
        offset: options.offset,
        urls,
        nextCursor,
        prevCursor
      });
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
  const handle = typeof db.getHandle === 'function' ? db.getHandle() : db.db;
  const row = getFetchFileInfo(handle, id);
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
      const handle = typeof db.getHandle === 'function' ? db.getHandle() : db.db;
      const urlInfo = getUrlRecord(handle, url);
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
