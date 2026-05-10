'use strict';

const { openNewsCrawlerDb } = require('../../../src/db/openNewsCrawlerDb');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  normalizeValidationOptions,
  buildRemoteRunArgs,
  buildDrainArgs,
  computeDeltas,
  summarizeLedgerState,
  parseRunLogMetrics,
  validateEvidence,
  createPlan,
} = require('../../../tools/crawl/lib/cloud-crawl-e2e-validation');
const { getRecentEvidence } = require('../../../tools/crawl/cloud-crawl-e2e');

describe('cloud-crawl-e2e-validation', () => {
  test('createPlan budgets a strict 15-minute run with crawl, drain, and validation phases', () => {
    const plan = createPlan({ 'duration-min': 15 });
    expect(plan.durationMs).toBe(900000);
    expect(plan.crawlBudgetMs).toBe(805000);
    expect(plan.drainMs).toBe(60000);
    expect(plan.validationMs).toBe(20000);
    expect(plan.stopGraceMs).toBe(15000);
    expect(plan.remoteRunArgs).toContain('run');
    expect(plan.remoteRunArgs).toContain('--prune-after-ingest');
    expect(plan.remoteRunArgs).toContain('--remote-storage-budget-mb');
    expect(plan.remoteRunArgs).toContain('--perf-summary-every');
  });

  test('normalizeValidationOptions rejects budgets that leave no useful crawl window', () => {
    expect(() => normalizeValidationOptions({ 'duration-min': 1 })).toThrow(/duration-min/);
  });

  test('buildDrainArgs clamps drain rounds to remaining time', () => {
    const args = buildDrainArgs({ 'duration-min': 15, 'drain-rounds': 12, interval: 5 }, 2500);
    expect(args).toContain('--rounds');
    expect(args[args.indexOf('--rounds') + 1]).toBe('1');
  });

  test('computeDeltas never reports negative growth', () => {
    const deltas = computeDeltas(
      { totals: { urls: 10, responses: 20, successResponses: 8, failedResponses: 12, content: 5 } },
      { totals: { urls: 9, responses: 25, successResponses: 10, failedResponses: 10, content: 7 } }
    );
    expect(deltas).toEqual({ urls: 0, responses: 5, successResponses: 2, failedResponses: 0, content: 2 });
  });

  test('summarizeLedgerState exposes confirmed, unconfirmed, and unpruned counts', () => {
    const summary = summarizeLedgerState({
      lastWatermark: 'wm-3',
      totalPulled: 9,
      entries: [
        { batchId: 'a', confirmedAt: null, prunedAt: null },
        { batchId: 'b', confirmedAt: 't', prunedAt: null },
        { batchId: 'c', confirmedAt: 't', prunedAt: 't' },
      ],
    });
    expect(summary.entries).toBe(3);
    expect(summary.unconfirmed).toBe(1);
    expect(summary.unpruned).toBe(1);
    expect(summary.completed).toBe(1);
    expect(summary.lastWatermark).toBe('wm-3');
  });

  test('summarizeLedgerState excludes unconfirmed entries superseded by confirmed pruned batches', () => {
    const summary = summarizeLedgerState({
      lastWatermark: 'wm-4',
      totalPulled: 10,
      entries: [
        { batchId: 'stale', urlIds: [1, 2], confirmedAt: null, prunedAt: null },
        { batchId: 'recovered', urlIds: [1, 2, 3], confirmedAt: 't', prunedAt: 't' },
      ],
    });
    expect(summary.rawUnconfirmed).toBe(1);
    expect(summary.supersededUnconfirmed).toBe(1);
    expect(summary.unconfirmed).toBe(0);
  });

  test('parseRunLogMetrics extracts round samples, perf lines, and diagnostics', () => {
    const text = [
      '  [1] 12:00:00 - 10 URLs, 8 content -> 10 new URLs (fetch: 100ms, ingest: 40ms, round: 160ms, next limit: 5)',
      '  perf p50/p95 fetch=100/100 ingest=40/40 rows/s=50',
      '  [2] Error: timeout while exporting',
    ].join('\n');
    const metrics = parseRunLogMetrics(text);
    expect(metrics.roundSamples).toHaveLength(1);
    expect(metrics.roundSamples[0].urls).toBe(10);
    expect(metrics.perfLines).toHaveLength(1);
    expect(metrics.errorLines[0]).toMatch(/timeout/);
  });

  test('validateEvidence passes when crawl output, ledger, and remote contracts are healthy', () => {
    const result = validateEvidence({
      options: { 'duration-min': 15 },
      before: { totals: { urls: 100, responses: 100, successResponses: 80, failedResponses: 20, content: 50 } },
      after: { totals: { urls: 140, responses: 135, successResponses: 112, failedResponses: 23, content: 62 } },
      recent: { downloads: 35, success: 32, failed: 3, bytes: 1024, distinctHosts: 4 },
      ledger: { entries: 10, unconfirmed: 0, unpruned: 1, completed: 9, lastWatermark: 'wm' },
      remote: { healthOk: true, healthStatus: 200, throttleOk: true, throttleStatus: 200 },
      timing: { startedAt: '2026-05-09T10:00:00.000Z', finishedAt: '2026-05-09T10:15:00.000Z', elapsedMs: 900000 },
      child: { exitCode: 0 },
      runLog: { errorLines: [], roundSamples: [{ fetchMs: 100, ingestMs: 40, roundMs: 160 }] },
    });
    expect(result.ok).toBe(true);
    expect(result.deltas.responses).toBe(35);
    expect(result.benchmark.downloadsPerMinute).toBeCloseTo(2.333, 2);
  });

  test('validateEvidence summarizes full ledger objects before checking unresolved entries', () => {
    const result = validateEvidence({
      options: { 'duration-min': 15 },
      before: { totals: { urls: 100, responses: 100, successResponses: 80, failedResponses: 20, content: 50 } },
      after: { totals: { urls: 130, responses: 130, successResponses: 108, failedResponses: 22, content: 60 } },
      recent: { downloads: 30, success: 28, failed: 2, bytes: 1024, distinctHosts: 3 },
      ledger: {
        lastWatermark: 'wm',
        entries: [
          { batchId: 'stale', urlIds: [1], confirmedAt: null, prunedAt: null },
          { batchId: 'recovered', urlIds: [1], confirmedAt: 't', prunedAt: 't' },
        ],
      },
      remote: { healthOk: true, healthStatus: 200, throttleOk: true, throttleStatus: 200 },
      timing: { startedAt: '2026-05-09T10:00:00.000Z', finishedAt: '2026-05-09T10:15:00.000Z', elapsedMs: 900000 },
      child: { exitCode: 0 },
      runLog: { errorLines: [], roundSamples: [] },
    });

    expect(result.ok).toBe(true);
    expect(result.ledger.unconfirmed).toBe(0);
    expect(result.ledger.supersededUnconfirmed).toBe(1);
  });

  test('validateEvidence fails with actionable diagnostics for stale remote throttle and no crawl growth', () => {
    const result = validateEvidence({
      options: { 'duration-min': 15 },
      before: { totals: { urls: 100, responses: 100, successResponses: 80, failedResponses: 20, content: 50 } },
      after: { totals: { urls: 100, responses: 100, successResponses: 80, failedResponses: 20, content: 50 } },
      recent: { downloads: 0, success: 0, failed: 0, bytes: 0, distinctHosts: 0 },
      ledger: { entries: 10, unconfirmed: 2, unpruned: 4, completed: 4, lastWatermark: 'wm' },
      remote: { healthOk: true, healthStatus: 200, throttleOk: false, throttleStatus: 404 },
      timing: { startedAt: '2026-05-09T10:00:00.000Z', finishedAt: '2026-05-09T10:15:01.000Z', elapsedMs: 901000 },
      child: { exitCode: 1 },
      runLog: { errorLines: ['Error: throttle 404'], roundSamples: [] },
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.join('\n')).toMatch(/remote-throttle-endpoint/);
    expect(result.diagnostics.join('\n')).toMatch(/new-responses/);
    expect(result.diagnostics.join('\n')).toMatch(/ledger-unconfirmed/);
  });

  test('getRecentEvidence matches SQLite timestamps with ISO run windows', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-crawl-e2e-'));
    const dbPath = path.join(dir, 'news.db');
    const db = openNewsCrawlerDb(dbPath);
    try {
      db.exec(`
        CREATE TABLE urls (id INTEGER PRIMARY KEY, host TEXT NOT NULL);
        CREATE TABLE http_responses (
          id INTEGER PRIMARY KEY,
          url_id INTEGER NOT NULL,
          http_status INTEGER,
          bytes_downloaded INTEGER,
          fetched_at TEXT NOT NULL
        );
      `);
      db.prepare('INSERT INTO urls (id, host) VALUES (?, ?)').run(1, 'bbc.com');
      db.prepare(`
        INSERT INTO http_responses (id, url_id, http_status, bytes_downloaded, fetched_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(1, 1, 200, 2048, '2026-05-09 16:58:00');
    } finally {
      db.close();
    }

    try {
      const evidence = getRecentEvidence(
        dbPath,
        '2026-05-09T16:57:03.756Z',
        '2026-05-09T17:11:42.779Z',
        ['bbc.com']
      );

      expect(evidence.downloads).toBe(1);
      expect(evidence.success).toBe(1);
      expect(evidence.failed).toBe(0);
      expect(evidence.bytes).toBe(2048);
      expect(evidence.distinctHosts).toBe(1);
      expect(evidence.hosts[0].host).toBe('bbc.com');
      expect(evidence.queryWindow).toEqual({
        startedAt: '2026-05-09 16:57:03',
        finishedAt: '2026-05-09 17:11:43',
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('crawl-remote run loop is wired to append-only sync ledger', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../../tools/crawl/crawl-remote.js'), 'utf8');
    const start = source.indexOf('async function cmdRun()');
    const end = source.indexOf('function formatBoundedSummary', start);
    const cmdRun = source.slice(start, end);
    expect(cmdRun).toContain("require('./lib/sync-ledger')");
    expect(cmdRun).toContain('getLastWatermark(ledger)');
    expect(cmdRun).toContain('ledgerAppendBatch');
    expect(cmdRun).toContain('ledgerMarkConfirmed');
    expect(cmdRun).toContain('ledgerMarkPruned');
  });
});
