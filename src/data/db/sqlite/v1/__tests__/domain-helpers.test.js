'use strict';

const fs = require('fs');
const { ensureDatabase, NewsDatabase } = require('..');
const { createTempDb } = require('../test-utils');

const silentLogger = {
  log: () => {},
  warn: () => {},
  error: () => {}
};

describe('SQLiteNewsDatabase domain helpers', () => {
  let dbPath;
  let db;
  let newsDb;

  beforeEach(() => {
    dbPath = createTempDb('domain-helpers');
    db = ensureDatabase(dbPath, { logger: silentLogger });
    newsDb = new NewsDatabase(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
    if (dbPath && fs.existsSync(dbPath)) {
      try {
        fs.unlinkSync(dbPath);
      } catch (_) {
        // ignore cleanup errors in CI
      }
    }
  });

  function insertArticle({ url, section, crawlDepth = null, analysisJson = JSON.stringify({}), analysisVersion = 1 }) {
    const now = new Date().toISOString();
    const host = new URL(url).host;

    const urlRow = db.prepare(`
      INSERT INTO urls (url, canonical_url, created_at, last_seen_at, host)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(url) DO UPDATE SET last_seen_at = excluded.last_seen_at
      RETURNING id
    `).get(url, url, now, now, host);

    const response = db.prepare(`
      INSERT INTO http_responses (
        url_id,
        request_started_at,
        fetched_at,
        http_status,
        content_type,
        content_encoding,
        etag,
        last_modified,
        redirect_chain,
        ttfb_ms,
        download_ms,
        total_ms,
        bytes_downloaded,
        transfer_kbps
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      urlRow.id,
      now,
      now,
      200,
      'text/html; charset=UTF-8',
      null,
      'etag-test',
      now,
      null,
      100,
      50,
      150,
      1024,
      256
    );

    const responseId = Number(response.lastInsertRowid);

    const content = db.prepare(`
      INSERT INTO content_storage (
        storage_type,
        http_response_id,
        compression_type_id,
        compression_bucket_id,
        bucket_entry_key,
        content_blob,
        content_sha256,
        uncompressed_size,
        compressed_size,
        compression_ratio
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'inline',
      responseId,
      null,
      null,
      null,
      Buffer.from('<html></html>'),
      'sha',
      1024,
      512,
      2
    );

    const contentId = Number(content.lastInsertRowid);

    db.prepare(`
      INSERT INTO content_analysis (
        content_id,
        analysis_version,
        classification,
        title,
        section,
        word_count,
        analysis_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      contentId,
      analysisVersion,
      'article',
      'Example article',
      section,
      500,
      analysisJson
    );

    db.prepare(`
      INSERT INTO discovery_events (
        url_id,
        discovered_at,
        referrer_url,
        crawl_depth,
        discovery_method,
        crawl_job_id
      ) VALUES (?, ?, NULL, ?, 'test', NULL)
    `).run(urlRow.id, now, crawlDepth);

    return { urlId: urlRow.id, host };
  }

  function insertError({ host, urlId, code, at }) {
    db.prepare(`
      INSERT INTO errors (url_id, host, kind, code, message, at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(urlId, host, 'http', code, `code-${code}`, at);
  }

  test('getDomainArticleMetrics aggregates normalized article data', () => {
    const { host } = insertArticle({ url: 'https://example.com/2025/10/21/story-one', section: 'World' });
    insertArticle({ url: 'https://www.example.com/news/story-two', section: 'Politics' });

    const metrics = newsDb.getDomainArticleMetrics(host);

    expect(metrics.articleFetches).toBe(2);
    expect(metrics.distinctSections).toBe(2);
    expect(metrics.datedUrlRatio).toBeGreaterThan(0);
    expect(metrics.datedUrlRatio).toBeLessThanOrEqual(1);
  });

  test('getDomainArticleMetrics returns zeros for unknown hosts', () => {
    const metrics = newsDb.getDomainArticleMetrics('missing.test');
    expect(metrics).toEqual({ articleFetches: 0, distinctSections: 0, datedUrlRatio: 0 });
  });

  test('getHttp429Stats reports counts within the requested window', () => {
    const { host, urlId } = insertArticle({ url: 'https://example.net/2025/10/21/story', section: 'World' });
    newsDb.upsertDomain(host);

    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

    insertError({ host, urlId, code: 429, at: tenMinutesAgo });
    insertError({ host, urlId, code: 500, at: tenMinutesAgo });
    insertError({ host, urlId, code: 429, at: twoHoursAgo });

    const stats = newsDb.getHttp429Stats(host, 15);

    expect(stats.count429).toBe(1);
    expect(stats.attempts).toBeGreaterThanOrEqual(2);
    expect(stats.rpm).toBeCloseTo(1 / 15, 5);
    expect(stats.ratio).toBeGreaterThan(0);
    expect(stats.last429At).toBeTruthy();
  });

  test('listDomainHosts returns hosts respecting limits', () => {
    newsDb.upsertDomain('a.test');
    newsDb.upsertDomain('b.test');
    newsDb.upsertDomain('c.test');

    const hostsLimited = newsDb.listDomainHosts({ limit: 2 });
    expect(hostsLimited).toHaveLength(2);

    const hostsAll = newsDb.listDomainHosts();
    expect(hostsAll.length).toBeGreaterThanOrEqual(3);
  });

  test('getMilestoneHostStats aggregates download, depth, and article counts', () => {
    const { host } = insertArticle({ url: 'https://milestone.test/front', section: 'World', crawlDepth: 2 });
    insertArticle({ url: 'https://milestone.test/second', section: 'Business', crawlDepth: 1 });
    newsDb.upsertDomain(host);

    const stats = newsDb.getMilestoneHostStats({ hosts: [host] });
    expect(stats).toHaveLength(1);

    const entry = stats[0];
    expect(entry.host).toBe(host);
    expect(entry.downloads).toBe(2);
    expect(entry.depth2Analysed).toBe(1);
    expect(entry.articlesIdentified).toBe(2);
  });

  test('countArticlesNeedingAnalysis reports totals and respects limits', () => {
    insertArticle({ url: 'https://analysis.test/a', section: 'World', crawlDepth: 0, analysisVersion: 1, analysisJson: JSON.stringify({ version: 1 }) });
    insertArticle({ url: 'https://analysis.test/b', section: 'World', crawlDepth: 0, analysisVersion: 6, analysisJson: JSON.stringify({ version: 6 }) });
    insertArticle({ url: 'https://analysis.test/c', section: 'Business', crawlDepth: 1, analysisVersion: 6, analysisJson: null });

    const result = newsDb.countArticlesNeedingAnalysis({ analysisVersion: 6 });
    expect(result.total).toBe(3);
    expect(result.needingAnalysisRaw).toBe(2);
    expect(result.needingAnalysis).toBe(2);
    expect(result.analyzed).toBe(1);

    const limited = newsDb.countArticlesNeedingAnalysis({ analysisVersion: 6, limit: 1 });
    expect(limited.needingAnalysis).toBe(1);
    expect(limited.needingAnalysisRaw).toBe(2);
    expect(limited.limit).toBe(1);
  });

  test('getArticlesNeedingAnalysis returns pending article details', () => {
    insertArticle({ url: 'https://analysis.list/a', section: 'World', crawlDepth: 0, analysisVersion: 1, analysisJson: JSON.stringify({ version: 1 }) });
    insertArticle({ url: 'https://analysis.list/b', section: 'World', crawlDepth: 0, analysisVersion: 6, analysisJson: JSON.stringify({ version: 6 }) });
    insertArticle({ url: 'https://analysis.list/c', section: 'Business', crawlDepth: 1, analysisVersion: 6, analysisJson: null });

    const rows = newsDb.getArticlesNeedingAnalysis({ analysisVersion: 6, limit: 10 });
    const urls = rows.map((row) => row.url).sort();
    expect(urls).toEqual(['https://analysis.list/a', 'https://analysis.list/c']);

    const first = rows.find((row) => row.url === 'https://analysis.list/a');
    expect(first).toMatchObject({ analysis_version: 1, section: 'World' });
    expect(first.analysis_json).toEqual(JSON.stringify({ version: 1 }));
    expect(first.http_status).toBe(200);
    expect(first.last_ts).toBeTruthy();
  });

  test('getAnalysisStatusCounts summarizes analyzed versus pending articles', () => {
    insertArticle({ url: 'https://analysis.status/analyzed', section: 'World', crawlDepth: 0, analysisVersion: 6, analysisJson: JSON.stringify({ version: 6 }) });
    insertArticle({ url: 'https://analysis.status/pending', section: 'World', crawlDepth: 0, analysisVersion: 6, analysisJson: null });

    const counts = newsDb.getAnalysisStatusCounts();
    expect(counts.total).toBe(2);
    expect(counts.analyzed).toBe(1);
    expect(counts.pending).toBe(1);
  });
});
