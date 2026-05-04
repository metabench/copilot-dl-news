#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const Database = require('better-sqlite3');
const { initSchema } = require('./schema');

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.href;
  } catch (_) {
    return null;
  }
}

function hostMatches(host, domain) {
  const normalizedHost = String(host || '').replace(/^www\./, '');
  const normalizedDomain = String(domain || '').replace(/^www\./, '');
  return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`);
}

function isCrawlableUrl(url, domain) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    if (!hostMatches(parsed.hostname, domain)) return false;
    return !/\.(css|js|png|jpe?g|gif|svg|ico|webp|woff2?|ttf|pdf|zip|mp4|mp3)$/i.test(parsed.pathname);
  } catch (_) {
    return false;
  }
}

function extractLinks(html, baseUrl, domain) {
  const links = [];
  const regex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis;
  let match;
  while ((match = regex.exec(html)) !== null && links.length < 500) {
    const resolved = normalizeUrl(new URL(match[1], baseUrl).href);
    if (!resolved || !isCrawlableUrl(resolved, domain)) continue;
    links.push({ url: resolved, text: stripTags(match[2]).slice(0, 200) });
  }
  const seen = new Set();
  return links.filter((link) => {
    if (seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
}

function stripTags(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractTitle(html) {
  const match = String(html || '').match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? stripTags(match[1]).slice(0, 500) : null;
}

function classifyUrl(url) {
  try {
    const { pathname } = new URL(url);
    if (/\/\d{4}\/\d{2}|\/article\/|\/story\/|\/news\//i.test(pathname)) return 'article';
    return pathname.split('/').filter(Boolean).length <= 1 ? 'hub' : 'other';
  } catch (_) {
    return 'other';
  }
}

function ensureStatusDir() {
  const statusDir = path.join(__dirname, '..', 'data', 'status');
  fs.mkdirSync(statusDir, { recursive: true });
  return statusDir;
}

function writeStatus(statusDir, domain, payload) {
  const filePath = path.join(statusDir, `${domain}.json`);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function createStatements(db) {
  return {
    insertUrl: db.prepare(`
      INSERT OR IGNORE INTO urls (url, host, path, status, depth, discovered_from, created_at, updated_at)
      VALUES (?, ?, ?, 'pending', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `),
    nextPending: db.prepare(`
      SELECT id, url, depth FROM urls
      WHERE status = 'pending' AND (host = ? OR host = ? OR host LIKE ?)
      ORDER BY depth ASC, id ASC LIMIT 1
    `),
    markFetching: db.prepare("UPDATE urls SET status = 'fetching', updated_at = CURRENT_TIMESTAMP WHERE id = ?"),
    markDone: db.prepare(`
      UPDATE urls SET status = 'done', http_status = ?, content_type = ?, content_length = ?, title = ?,
        word_count = ?, links_found = ?, classification = ?, fetched_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP, error_msg = NULL
      WHERE id = ?
    `),
    markError: db.prepare("UPDATE urls SET status = 'error', error_msg = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"),
    insertLink: db.prepare('INSERT INTO discovered_links (source_url_id, target_url, link_text, is_nav_link) VALUES (?, ?, ?, 0)'),
    insertResponse: db.prepare(`
      INSERT INTO http_responses (url_id, request_started_at, fetched_at, http_status, content_type,
        content_encoding, total_ms, bytes_downloaded, request_method)
      VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, 'GET')
    `),
    insertContent: db.prepare(`
      INSERT INTO content_storage (http_response_id, storage_type, content_blob, content_sha256,
        uncompressed_size, compressed_size, compression_ratio, content_category, content_subtype)
      VALUES (?, 'gzip', ?, ?, ?, ?, ?, ?, ?)
    `),
    insertRun: db.prepare('INSERT INTO crawl_runs (target_domain) VALUES (?)'),
    finishRun: db.prepare('UPDATE crawl_runs SET ended_at = CURRENT_TIMESTAMP, total_fetched = ?, total_errors = ?, status = ? WHERE id = ?'),
    insertError: db.prepare('INSERT INTO errors (url_id, host, kind, code, message) VALUES (?, ?, ?, ?, ?)'),
    countPending: db.prepare("SELECT COUNT(*) AS c FROM urls WHERE status = 'pending' AND (host = ? OR host = ? OR host LIKE ?)"),
    countContent: db.prepare(`
      SELECT COUNT(*) AS c, COALESCE(SUM(compressed_size), 0) AS bytes FROM content_storage cs
      JOIN http_responses hr ON cs.http_response_id = hr.id
      JOIN urls u ON hr.url_id = u.id
      WHERE u.host = ? OR u.host = ? OR u.host LIKE ?
    `),
  };
}

async function fetchWithTimeout(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = new Date().toISOString();
  const start = Date.now();
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'NewsCrawler/4.0 SimpleDistributedSmoke',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return {
      startedAt,
      elapsedMs: Date.now() - start,
      status: response.status,
      contentType: response.headers.get('content-type') || '',
      contentEncoding: response.headers.get('content-encoding') || '',
      finalUrl: response.url || url,
      buffer,
      text: buffer.toString('utf8'),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const args = parseArgs();
  const domain = String(args.domain || '').trim();
  if (!domain) throw new Error('--domain is required');

  const maxPages = Math.max(1, Number.parseInt(args['max-pages'], 10) || 5);
  const dbPath = args.db || path.join(__dirname, '..', 'data', 'news.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  initSchema(db);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

  const statusDir = ensureStatusDir();
  const stmts = createStatements(db);
  const seedUrls = String(args['seed-urls'] || '')
    .split(',')
    .map(url => url.trim())
    .filter(Boolean);
  if (seedUrls.length === 0) {
    seedUrls.push(`https://${domain}/`, `https://www.${domain}/`);
  }

  const run = stmts.insertRun.run(domain);
  const runId = run.lastInsertRowid;
  const startedAt = new Date().toISOString();
  const stats = { fetched: 0, done: 0, errors: 0, pending: 0 };
  let stopping = false;

  process.on('SIGINT', () => { stopping = true; });
  process.on('SIGTERM', () => { stopping = true; });

  for (const seed of seedUrls) {
    const normalized = normalizeUrl(seed);
    if (!normalized || !isCrawlableUrl(normalized, domain)) continue;
    const parsed = new URL(normalized);
    stmts.insertUrl.run(normalized, parsed.hostname, parsed.pathname, 0, null);
  }

  const publishStatus = (state) => {
    const pending = stmts.countPending.get(domain, `www.${domain}`, `%.${domain}`)?.c || 0;
    const content = stmts.countContent.get(domain, `www.${domain}`, `%.${domain}`) || { c: 0, bytes: 0 };
    stats.pending = pending;
    writeStatus(statusDir, domain, {
      domain,
      state,
      isRunning: state === 'running',
      startedAt,
      stoppedAt: state === 'running' ? null : new Date().toISOString(),
      stats,
      contentPipeline: {
        totalStored: content.c || 0,
        totalCompressedMB: Number(((content.bytes || 0) / 1024 / 1024).toFixed(2)),
      },
      fatalState: null,
    });
  };

  publishStatus('running');

  while (!stopping && stats.fetched < maxPages) {
    const row = stmts.nextPending.get(domain, `www.${domain}`, `%.${domain}`);
    if (!row) break;

    stmts.markFetching.run(row.id);
    try {
      const result = await fetchWithTimeout(row.url);
      const html = /^text\/html|application\/xhtml\+xml/i.test(result.contentType) ? result.text : '';
      const links = html ? extractLinks(html, result.finalUrl, domain) : [];
      const title = html ? extractTitle(html) : null;
      const plainText = html ? stripTags(html) : '';
      const wordCount = plainText ? plainText.split(/\s+/).filter(Boolean).length : 0;

      for (const link of links) {
        const parsed = new URL(link.url);
        stmts.insertLink.run(row.id, link.url, link.text);
        if ((row.depth || 0) < 2) {
          stmts.insertUrl.run(link.url, parsed.hostname, parsed.pathname, (row.depth || 0) + 1, row.url);
        }
      }

      stmts.markDone.run(
        result.status,
        result.contentType,
        result.buffer.length,
        title,
        wordCount,
        links.length,
        classifyUrl(result.finalUrl),
        row.id
      );

      const responseInfo = stmts.insertResponse.run(
        row.id,
        result.startedAt,
        result.status,
        result.contentType,
        result.contentEncoding,
        result.elapsedMs,
        result.buffer.length
      );

      if (html) {
        const compressed = zlib.gzipSync(result.buffer, { level: 6 });
        const sha = crypto.createHash('sha256').update(result.buffer).digest('hex');
        stmts.insertContent.run(
          responseInfo.lastInsertRowid,
          compressed,
          sha,
          result.buffer.length,
          compressed.length,
          result.buffer.length > 0 ? compressed.length / result.buffer.length : 0,
          'html',
          classifyUrl(result.finalUrl)
        );
      }

      stats.fetched += 1;
      stats.done += 1;
    } catch (error) {
      stats.errors += 1;
      stmts.markError.run(error.message, row.id);
      stmts.insertError.run(row.id, domain, error.name || 'ERROR', error.code || '', error.message);
    }

    publishStatus('running');
  }

  stmts.finishRun.run(stats.done, stats.errors, stopping ? 'stopped' : 'complete', runId);
  publishStatus('stopped');
  db.close();
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
