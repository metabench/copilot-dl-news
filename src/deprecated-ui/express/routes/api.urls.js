const express = require('express');
const path = require('path');
const fs = require('fs');
const { parseListOptions, listUrls } = require('../../../data/urlListing');
const { getFetchFileInfo, getUrlRecord } = require('../../../data/urlDetails');
const { withNewsDb } = require('../../../data/db/dbAccess');
const { BadRequestError, NotFoundError, InternalServerError } = require('../errors/HttpError');

// Router for URL listing and details-related APIs
function createUrlsApiRouter({ urlsDbPath }) {
  const router = express.Router();

  // List article URLs from the DB as JSON array (paginated)
  router.get('/api/urls', (req, res, next) => {
    try {
      withNewsDb(urlsDbPath, (db) => {
        const details = String(req.query.details || '0') === '1';
        const options = parseListOptions(req.query);
        const handle = typeof db.getHandle === 'function' ? db.getHandle() : db.db;
        const { total, urls, rows, nextCursor, prevCursor } = listUrls(handle, options);
        
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
      });
    } catch (e) {
      next(new InternalServerError(e.message));
    }
  });

  // Return a portion of a fetched file's body by fetch ID (text only)
  router.get('/api/fetch-body', (req, res, next) => {
    const id = parseInt(String(req.query.id || ''), 10);
    if (!id || isNaN(id)) {
      return next(new BadRequestError('Missing or invalid id'));
    }
    
    try {
      withNewsDb(urlsDbPath, (db) => {
        const handle = typeof db.getHandle === 'function' ? db.getHandle() : db.db;
        const row = getFetchFileInfo(handle, id);
        
        if (!row || !row.file_path) {
          return next(new NotFoundError('No body available for this fetch', 'fetch'));
        }
        
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
          return next(new InternalServerError('Failed to read body', { detail: e.message }));
        }
      });
    } catch (e) {
      next(new InternalServerError(e.message));
    }
  });

  // URL details API
  router.get('/api/url-details', (req, res, next) => {
    const url = String(req.query.url || req.query.u || '').trim();
    if (!url) {
      return next(new BadRequestError('Missing url'));
    }
    
    try {
      withNewsDb(urlsDbPath, (db) => {
        const handle = typeof db.getHandle === 'function' ? db.getHandle() : db.db;
        
        // Record access for API usage
        const accessContext = {
          source: 'api',
          userAgent: req.get('User-Agent') || null,
          ip: req.ip || req.connection?.remoteAddress || null
        };
        
        const urlInfo = getUrlRecord(handle, url);
        const article = db.getArticleByUrl(url, accessContext) || null;
        const fetches = db.getFetchesByUrl(url, 200) || [];
        
        res.json({ url, urlInfo, article, fetches });
      });
    } catch (e) {
      next(new InternalServerError(e.message));
    }
  });

  return router;
}

module.exports = { createUrlsApiRouter };
