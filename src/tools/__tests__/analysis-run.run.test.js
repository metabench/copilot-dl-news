const fs = require('fs');
const os = require('os');
const path = require('path');
const { runAnalysis } = require('../analysis-run');
const NewsDatabase = require('../../data/db');

function createTempDbWithDepthCoverage({ host = 'example.com', depthCount = 10 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'analysis-run-run-'));
  const dbPath = path.join(dir, 'news.db');
  const db = new NewsDatabase(dbPath);
  const now = new Date().toISOString();
  const insertUrl = db.db.prepare(`
    INSERT INTO urls (url, canonical_url, created_at, last_seen_at, host)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(url) DO UPDATE SET last_seen_at = excluded.last_seen_at
    RETURNING id
  `);
  const insertResponse = db.db.prepare(`
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
  `);
  const insertContent = db.db.prepare(`
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
  `);
  const insertAnalysis = db.db.prepare(`
    INSERT INTO content_analysis (
      content_id,
      analysis_version,
      classification,
      title,
      section,
      word_count,
      analysis_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertDiscovery = db.db.prepare(`
    INSERT INTO discovery_events (
      url_id,
      discovered_at,
      referrer_url,
      crawl_depth,
      discovery_method,
      crawl_job_id
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.db.transaction((count) => {
    for (let i = 0; i < count; i++) {
      const url = `https://${host}/article-${i}`;
      const urlRow = insertUrl.get(url, url, now, now, host);
      const response = insertResponse.run(
        urlRow.id,
        now,
        now,
        200,
        'text/html; charset=UTF-8',
        null,
        `etag-${i}`,
        now,
        null,
        100,
        50,
        150,
        1024,
        256
      );
      const responseId = Number(response.lastInsertRowid);
      const content = insertContent.run(
        'inline',
        responseId,
        null,
        null,
        null,
        Buffer.from('<html></html>'),
        `sha-${i}`,
        1024,
        512,
        2
      );
      const contentId = Number(content.lastInsertRowid);
      insertAnalysis.run(
        contentId,
        6,
        'article',
        `Article ${i}`,
        'World',
        500,
        JSON.stringify({ kind: 'article', version: 6 })
      );
      insertDiscovery.run(urlRow.id, now, null, 2, 'test', null);
    }
  });
  insertMany(depthCount);
  db.upsertDomain(host);
  db.close();
  return { dir, dbPath };
}

describe('analysis-run integration', () => {
  jest.setTimeout(30000);

  test('runAnalysis awards depth milestone and persists it', async () => {
    const { dir, dbPath } = createTempDbWithDepthCoverage();
    try {
      const summary = await runAnalysis({
        db: dbPath,
        skipPages: true,
        skipDomains: true,
        progressLogging: false
      });

      expect(summary).toBeDefined();
      expect(summary.steps).toBeDefined();
      expect(summary.steps.pages).toEqual(expect.objectContaining({ skipped: true }));
      expect(summary.steps.domains).toEqual(expect.objectContaining({ skipped: true }));
      expect(summary.steps.milestones).toBeDefined();
      expect(summary.steps.milestones.dryRun).toBe(false);
      expect(summary.steps.milestones.count).toBeGreaterThanOrEqual(1);
      const awarded = summary.steps.milestones.awarded || [];
      expect(awarded).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'depth2-coverage',
            scope: 'example.com'
          })
        ])
      );

      const db = new NewsDatabase(dbPath);
      const rows = db.db.prepare('SELECT kind, scope, details FROM crawl_milestones').all();
      db.close();
      expect(rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'depth2-coverage',
            scope: 'example.com'
          })
        ])
      );
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  test('runAnalysis dry-run reports milestone without persisting', async () => {
    const { dir, dbPath } = createTempDbWithDepthCoverage();
    try {
      const summary = await runAnalysis({
        db: dbPath,
        skipPages: true,
        skipDomains: true,
        dryRun: true,
        progressLogging: false
      });

      expect(summary.steps.pages).toEqual(expect.objectContaining({ skipped: true }));
      expect(summary.steps.domains).toEqual(expect.objectContaining({ skipped: true }));
      expect(summary.steps.milestones).toBeDefined();
      expect(summary.steps.milestones.dryRun).toBe(true);
      expect(summary.steps.milestones.count).toBeGreaterThanOrEqual(1);

      const db = new NewsDatabase(dbPath);
      const rows = db.db.prepare('SELECT kind, scope FROM crawl_milestones').all();
      db.close();
      expect(rows).toHaveLength(0);
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    }
  });
});
