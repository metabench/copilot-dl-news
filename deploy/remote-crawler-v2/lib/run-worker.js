#!/usr/bin/env node
'use strict';

const { openNewsCrawlerDb } = require('../../../src/db/openNewsCrawlerDb');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
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

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
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
  const maxDepth = parsePositiveInteger(args['max-depth'], 2);
  const dbPath = args.db || path.join(__dirname, '..', 'data', 'news.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = openNewsCrawlerDb(dbPath);
  initSchema(db);

  const statusDir = ensureStatusDir();
  const remoteCrawlerDb = db.remoteCrawler;
  if (!remoteCrawlerDb) {
    throw new Error('news-crawler-db remoteCrawler access is not available');
  }
  remoteCrawlerDb.configureRemoteCrawlerSqliteRuntime({ journalMode: 'WAL', busyTimeoutMs: 5000 });
  const seedUrls = String(args['seed-urls'] || '')
    .split(',')
    .map(url => url.trim())
    .filter(Boolean);
  if (seedUrls.length === 0) {
    seedUrls.push(`https://${domain}/`, `https://www.${domain}/`);
  }

  const runId = remoteCrawlerDb.createRemoteCrawlerRun(domain);
  const startedAt = new Date().toISOString();
  const stats = {
    fetched: 0,
    done: 0,
    errors: 0,
    pending: 0,
    maxDepth,
    seedQueued: 0,
    seedAlreadyKnown: 0,
    seedRefreshed: 0,
    discoveredQueued: 0,
    discoveredAlreadyKnown: 0,
    discoveredInvalid: 0,
    discoveredOutsideDomain: 0,
    depthLimitSkipped: 0,
    refreshed: 0,
  };
  const frontier = {
    lastPromotion: null,
    lastNoPendingReason: null,
    exhaustedAt: null,
  };
  let stopping = false;

  process.on('SIGINT', () => { stopping = true; });
  process.on('SIGTERM', () => { stopping = true; });

  const refreshedSeedUrls = new Set();
  for (const seed of seedUrls) {
    const normalized = normalizeUrl(seed);
    if (!normalized || !isCrawlableUrl(normalized, domain)) continue;
    const parsed = new URL(normalized);
    const seedRecord = {
      url: normalized,
      host: parsed.hostname,
      path: parsed.pathname,
      depth: 0,
      discoveredFrom: null,
    };
    const seedResult = typeof remoteCrawlerDb.queueRemoteCrawlerSeedUrl === 'function'
      ? remoteCrawlerDb.queueRemoteCrawlerSeedUrl(seedRecord, { refreshKnownWhenNoLinks: true })
      : remoteCrawlerDb.insertPendingRemoteCrawlerUrl(seedRecord);
    if (seedResult?.inserted) stats.seedQueued += 1;
    else if (seedResult?.refreshed) {
      stats.seedRefreshed += 1;
      refreshedSeedUrls.add(normalized);
    }
    else stats.seedAlreadyKnown += 1;
  }

  const promoteDiscoveredFrontier = (reason) => {
    if (typeof remoteCrawlerDb.enqueueRemoteCrawlerDiscoveredLinksForDomain !== 'function') {
      frontier.lastPromotion = { reason, unsupported: true, inserted: 0 };
      return frontier.lastPromotion;
    }

    const result = remoteCrawlerDb.enqueueRemoteCrawlerDiscoveredLinksForDomain({
      domain,
      maxDepth,
      limit: 5000,
    });
    stats.discoveredQueued += Number(result.inserted || 0);
    stats.discoveredAlreadyKnown += Number(result.alreadyKnown || 0);
    stats.discoveredInvalid += Number(result.invalid || 0);
    stats.discoveredOutsideDomain += Number(result.outsideDomain || 0);
    frontier.lastPromotion = {
      reason,
      at: new Date().toISOString(),
      ...result,
    };
    if (Number(result.inserted || 0) === 0) {
      frontier.lastNoPendingReason = Number(result.candidates || 0) > 0
        ? 'known-discovered-links-exhausted'
        : 'no-known-discovered-links';
    } else {
      frontier.lastNoPendingReason = null;
    }
    return result;
  };

  promoteDiscoveredFrontier('startup');

  const publishStatus = (state) => {
    const pending = remoteCrawlerDb.countPendingRemoteCrawlerUrlsForDomain(domain);
    const content = remoteCrawlerDb.getRemoteCrawlerContentStorageSummaryForDomain(domain);
    stats.pending = pending;
    writeStatus(statusDir, domain, {
      domain,
      state,
      isRunning: state === 'running',
      startedAt,
      stoppedAt: state === 'running' ? null : new Date().toISOString(),
      stats,
      frontier,
      contentPipeline: {
        totalStored: content.c || 0,
        totalCompressedMB: Number(((content.bytes || 0) / 1024 / 1024).toFixed(2)),
      },
      fatalState: null,
    });
  };

  publishStatus('running');

  while (!stopping && stats.fetched < maxPages) {
    let row = remoteCrawlerDb.selectNextPendingRemoteCrawlerUrlForDomain(domain);
    if (!row) {
      const promotion = promoteDiscoveredFrontier('no-pending');
      publishStatus('running');
      if (Number(promotion.inserted || 0) > 0) {
        row = remoteCrawlerDb.selectNextPendingRemoteCrawlerUrlForDomain(domain);
      }
      if (!row) {
        frontier.exhaustedAt = new Date().toISOString();
        break;
      }
    }

    remoteCrawlerDb.markRemoteCrawlerUrlFetching(row.id);
    const refreshedSeed = refreshedSeedUrls.has(row.url);
    try {
      const result = await fetchWithTimeout(row.url);
      const html = /^text\/html|application\/xhtml\+xml/i.test(result.contentType) ? result.text : '';
      const links = html ? extractLinks(html, result.finalUrl, domain) : [];
      const title = html ? extractTitle(html) : null;
      const plainText = html ? stripTags(html) : '';
      const wordCount = plainText ? plainText.split(/\s+/).filter(Boolean).length : 0;

      for (const link of links) {
        const parsed = new URL(link.url);
        remoteCrawlerDb.insertRemoteCrawlerDiscoveredLink({ sourceUrlId: row.id, targetUrl: link.url, linkText: link.text });
        if ((row.depth || 0) < maxDepth) {
          const queueResult = remoteCrawlerDb.insertPendingRemoteCrawlerUrl({
            url: link.url,
            host: parsed.hostname,
            path: parsed.pathname,
            depth: (row.depth || 0) + 1,
            discoveredFrom: row.url,
          });
          if (queueResult?.inserted) stats.discoveredQueued += 1;
          else stats.discoveredAlreadyKnown += 1;
        } else {
          stats.depthLimitSkipped += 1;
        }
      }

      remoteCrawlerDb.markRemoteCrawlerUrlDone(row.id, {
        httpStatus: result.status,
        contentType: result.contentType,
        contentLength: result.buffer.length,
        title,
        wordCount,
        linksFound: links.length,
        classification: classifyUrl(result.finalUrl),
      });

      const responseId = remoteCrawlerDb.insertRemoteCrawlerHttpResponse({
        urlId: row.id,
        requestStartedAt: result.startedAt,
        httpStatus: result.status,
        contentType: result.contentType,
        contentEncoding: result.contentEncoding,
        totalMs: result.elapsedMs,
        bytesDownloaded: result.buffer.length,
      });

      if (html) {
        const compressed = zlib.gzipSync(result.buffer, { level: 6 });
        const sha = crypto.createHash('sha256').update(result.buffer).digest('hex');
        remoteCrawlerDb.insertRemoteCrawlerCompressedContent({
          httpResponseId: responseId,
          contentBlob: compressed,
          contentSha256: sha,
          uncompressedSize: result.buffer.length,
          compressedSize: compressed.length,
          compressionRatio: result.buffer.length > 0 ? compressed.length / result.buffer.length : 0,
          contentCategory: 'html',
          contentSubtype: classifyUrl(result.finalUrl),
        });
      }

      if (refreshedSeed) {
        stats.refreshed += 1;
        refreshedSeedUrls.delete(row.url);
      }
      stats.fetched += 1;
      stats.done += 1;
    } catch (error) {
      if (refreshedSeed) refreshedSeedUrls.delete(row.url);
      stats.errors += 1;
      remoteCrawlerDb.markRemoteCrawlerUrlError(row.id, error.message);
      remoteCrawlerDb.insertRemoteCrawlerError({
        urlId: row.id,
        host: domain,
        kind: error.name || 'ERROR',
        code: error.code || '',
        message: error.message,
      });
    }

    publishStatus('running');
  }

  remoteCrawlerDb.finishRemoteCrawlerRun(runId, {
    totalFetched: stats.done,
    totalErrors: stats.errors,
    status: stopping ? 'stopped' : 'complete',
  });
  publishStatus('stopped');
  db.close();
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
