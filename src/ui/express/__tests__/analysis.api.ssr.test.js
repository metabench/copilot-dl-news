const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { createApp } = require('../server');
const { ensureDb } = require('../../../ensure_db');
const Database = require('better-sqlite3');
const NewsDatabase = require('../../../db');
const {
  ensureAnalysisRunSchema,
  createAnalysisRun,
  updateAnalysisRun,
  addAnalysisRunEvent
} = require('../services/analysisRuns');

jest.setTimeout(30000);

function makeFakeRunner(lines = [], exitCode = 0, delayMs = 5) {
  const { EventEmitter } = require('events');
  return {
    start() {
      const ee = new EventEmitter();
      setTimeout(() => {
        for (const l of lines) {
          ee.stdout.emit('data', Buffer.from(l + '\n'));
        }
        ee.emit('exit', exitCode, null);
      }, delayMs);
      ee.stdout = new EventEmitter();
      ee.stderr = new EventEmitter();
      ee.kill = () => ee.emit('exit', null, 'SIGTERM');
      return ee;
    }
  };
}

function makeFakeAnalysisRunner(onStart = () => {}) {
  const { EventEmitter } = require('events');
  return {
    start(args = []) {
      try {
        const arr = Array.isArray(args) ? args.slice() : [];
        onStart(arr);
      } catch (_) { /* ignore */ }
      const ee = new EventEmitter();
      ee.stdout = new EventEmitter();
      ee.stderr = new EventEmitter();
      setTimeout(() => {
        ee.emit('exit', 0, null);
      }, 5);
      return ee;
    }
  };
}

function createTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'analysis-test-'));
  return path.join(dir, 'news.db');
}

describe('Analysis API and SSR', () => {
  test('lists runs, returns detail, and serves SSR', async () => {
    const dbPath = createTempDb();
  const newsDb = new NewsDatabase(dbPath);
  const db = newsDb.db;
    ensureAnalysisRunSchema(db);
    const runId = 'analysis-test';
    const summary = {
      runId,
      startedAt: '2025-09-25T10:00:00.000Z',
      config: { pageLimit: 100, skipPages: false },
      steps: {
        pages: { analysed: 50, updated: 45 },
        milestones: { count: 1 }
      }
    };
    createAnalysisRun(db, {
      id: runId,
      startedAt: '2025-09-25T10:00:00.000Z',
      status: 'running',
      stage: 'page-analysis',
      summary,
      lastProgress: { stage: 'page-analysis' }
    });
    updateAnalysisRun(db, runId, {
      status: 'completed',
      stage: 'completed',
      endedAt: '2025-09-25T10:05:00.000Z',
      summary: Object.assign({}, summary, { endedAt: '2025-09-25T10:05:00.000Z' }),
      lastProgress: { stage: 'completed' }
    });
    addAnalysisRunEvent(db, {
      runId,
      stage: 'completed',
      message: 'Analysis finished',
      details: { awarded: 1 }
    });
    try { db.close(); } catch (_) {}

    const app = createApp({
      runner: makeFakeRunner([], 0, 1),
      analysisRunner: makeFakeAnalysisRunner(),
      dbPath
    });

    const listRes = await request(app).get('/api/analysis');
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.items)).toBe(true);
    expect(listRes.body.items.length).toBe(1);
    expect(listRes.body.items[0].id).toBe(runId);
    expect(listRes.body.items[0].status).toBe('completed');

    const detailRes = await request(app).get(`/api/analysis/${runId}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.run.id).toBe(runId);
    expect(detailRes.body.events.length).toBe(1);
    expect(detailRes.body.run.summary.steps.pages.analysed).toBe(50);

    const listHtml = await request(app).get('/analysis/ssr');
    expect(listHtml.status).toBe(200);
    expect(listHtml.text).toContain(runId);

    const detailHtml = await request(app).get(`/analysis/${runId}/ssr`);
    expect(detailHtml.status).toBe(200);
    expect(detailHtml.text).toContain('window.__ANALYSIS_RUN__');
    expect(detailHtml.text).toContain(runId);
  });

  test('starts analysis run via API', async () => {
    const dbPath = createTempDb();
    ensureDb(dbPath);
    const captured = [];
    const app = createApp({
      runner: makeFakeRunner([], 0, 1),
      analysisRunner: makeFakeAnalysisRunner((args) => captured.push(args)),
      dbPath
    });

    const res = await request(app)
      .post('/api/analysis/start')
      .send({});

    expect(res.status).toBe(202);
    expect(res.body).toHaveProperty('runId');
    expect(res.body.runId).toEqual(expect.stringMatching(/^analysis-/));
    expect(res.body.detailUrl).toBe(`/analysis/${res.body.runId}/ssr`);
    expect(res.body.apiUrl).toBe(`/api/analysis/${res.body.runId}`);
    expect(captured.length).toBe(1);
    expect(captured[0]).toEqual(expect.arrayContaining([`--run-id=${res.body.runId}`]));
    expect(captured[0]).toEqual(expect.arrayContaining([`--db=${dbPath}`]));
  });

  test('analysis start triggers real analysis run and updates article', async () => {
    const prevFast = process.env.TEST_FAST;
    process.env.TEST_FAST = '1';

    const dbPath = createTempDb();
  const newsDb = new NewsDatabase(dbPath);
  const { db } = newsDb;
    const articleUrl = 'https://example.com/article-1';
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO articles (url, title, html, text, crawled_at, fetched_at, http_status, content_type, word_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      articleUrl,
      'Sample article about Wales',
      '<html><body><article><p>Wales and Scotland news story.</p></article></body></html>',
      'Wales and Scotland news story.',
      now,
      now,
      200,
      'text/html',
      6
    );
    db.prepare(`
      INSERT INTO fetches (url, request_started_at, fetched_at, http_status, content_type, classification, word_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      articleUrl,
      now,
      now,
      200,
      'text/html',
      'article',
      6
    );
    newsDb.close();

    const app = createApp({
      runner: makeFakeRunner([], 0, 1),
      dbPath
    });

    const res = await request(app)
      .post('/api/analysis/start')
      .send({ skipDomains: true, dryRun: true, pageLimit: 5 });

    expect(res.status).toBe(202);
    const runId = res.body.runId;
    expect(runId).toMatch(/^analysis-/);

    const pollDb = new Database(dbPath, { readonly: false });
    try {
      const start = Date.now();
      let status = null;
      while (Date.now() - start < 15000) {
        const row = pollDb.prepare('SELECT status FROM analysis_runs WHERE id = ?').get(runId);
        if (row) {
          status = row.status;
          if (status === 'completed' || status === 'failed') break;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      expect(status).toBe('completed');
      const article = pollDb.prepare('SELECT analysis FROM articles WHERE url = ?').get(articleUrl);
      expect(article).toBeTruthy();
      expect(article.analysis).toBeTruthy();
    } finally {
      pollDb.close();
      if (prevFast === undefined) delete process.env.TEST_FAST;
      else process.env.TEST_FAST = prevFast;
    }
  });
});
