const fs = require('fs');
const os = require('os');
const path = require('path');
const { runAnalysis } = require('../analysis-run');
const NewsDatabase = require('../../db');

function createTempDbWithDepthCoverage({ host = 'example.com', depthCount = 10 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'analysis-run-run-'));
  const dbPath = path.join(dir, 'news.db');
  const db = new NewsDatabase(dbPath);
  const now = new Date().toISOString();
  const insertUrl = db.db.prepare('INSERT INTO urls (url, host, created_at, last_seen_at) VALUES (?, ?, ?, ?)');
  const insertArticle = db.db.prepare('INSERT INTO articles (url, title, crawled_at, crawl_depth, analysis) VALUES (?, ?, ?, ?, ?)');
  const insertMany = db.db.transaction((count) => {
    for (let i = 0; i < count; i++) {
      const url = `https://${host}/article-${i}`;
      insertUrl.run(url, host, now, now);
      insertArticle.run(url, `Article ${i}`, now, 2, JSON.stringify({ kind: 'article' }));
    }
  });
  insertMany(depthCount);
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
