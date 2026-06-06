'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildCrawlProgressPacket,
  renderCrawlProgressText,
  snapshotTotals,
  collectCrawlProgress,
  sampleWriterDb,
} = require('../../../tools/crawl/lib/crawl-progress-monitor');
const { parseArgs, runCli, loadBaselineSnapshot } = require('../../../tools/crawl/crawl-progress-monitor');

function snap(totals = {}, latestFetchedAt = null) {
  return {
    totals: {
      urls: 0, responses: 0, successResponses: 0, failedResponses: 0, content: 0, ...totals,
    },
    latestFetchedAt,
  };
}

describe('crawl-progress-monitor packet math', () => {
  test('snapshotTotals tolerates flattened, nested, and null snapshots', () => {
    expect(snapshotTotals(null)).toEqual({ urls: 0, responses: 0, successResponses: 0, failedResponses: 0, content: 0 });
    expect(snapshotTotals({ totals: { urls: 5, content: 2 } })).toMatchObject({ urls: 5, content: 2 });
    expect(snapshotTotals({ urls: 9, successResponses: 4 })).toMatchObject({ urls: 9, successResponses: 4 });
  });

  test('computes progress fraction, remaining, and cumulative throughput', () => {
    const packet = buildCrawlProgressPacket({
      writerDbPath: 'data/samples/internet-small-sample.db',
      writerDbExists: true,
      targetDownloads: 1000,
      elapsedMs: 40000,
      current: snap({ urls: 5150, responses: 16, successResponses: 16, content: 6 }, '2026-05-31T01:02:55.842Z'),
      baseline: snap({}),
      now: '2026-05-31T01:03:00.000Z',
    });
    expect(packet.downloads).toBe(16);
    expect(packet.contentDownloads).toBe(6);
    expect(packet.target.downloads).toBe(1000);
    expect(packet.progress.remaining).toBe(984);
    expect(packet.progress.percent).toBe(1.6);
    expect(packet.progress.reached).toBe(false);
    expect(packet.throughput.docsPerSec).toBe(0.4); // 16 / 40s
    expect(packet.dbGrowth).toEqual({ urls: 5150, responses: 16, successResponses: 16, content: 6 });
    expect(packet.verdict).toBe('in-progress');
    expect(packet.anomalies).toEqual([]);
  });

  test('instantaneous rate from previous sample drives projected completion', () => {
    const packet = buildCrawlProgressPacket({
      targetDownloads: 100,
      elapsedMs: 20000,
      current: snap({ successResponses: 20 }, '2026-05-31T01:00:20.000Z'),
      previous: { elapsedMs: 10000, downloads: 10, bytes: 0 },
      now: '2026-05-31T01:00:20.000Z',
    });
    // (20-10) downloads over (20s-10s) = 1 doc/s; remaining 80 => 80s ETA
    expect(packet.throughput.docsPerSec).toBe(1);
    expect(packet.projectedCompletion.etaSec).toBe(80);
    expect(packet.projectedCompletion.basis).toBe('instantaneous-rate');
  });

  test('target-reached verdict and exceeded-target anomaly', () => {
    const packet = buildCrawlProgressPacket({
      targetDownloads: 10,
      elapsedMs: 5000,
      current: snap({ successResponses: 12 }, '2026-05-31T01:00:05.000Z'),
      now: '2026-05-31T01:00:05.000Z',
    });
    expect(packet.progress.reached).toBe(true);
    expect(packet.verdict).toBe('target-reached');
    expect(packet.anomalies).toContain('exceeded-target');
    expect(packet.projectedCompletion).toEqual({ etaSec: 0, etaIso: '2026-05-31T01:00:05.000Z', basis: 'target-reached' });
  });

  test('stall detection via latestFetchedAt age', () => {
    const packet = buildCrawlProgressPacket({
      targetDownloads: 1000,
      elapsedMs: 120000,
      current: snap({ successResponses: 5 }, '2026-05-31T01:00:00.000Z'),
      stallTimeoutMs: 60000,
      now: '2026-05-31T01:02:00.000Z', // 120s since last fetch
    });
    expect(packet.msSinceLastDownload).toBe(120000);
    expect(packet.stalled).toBe(true);
    expect(packet.verdict).toBe('stalled');
  });

  test('idle verdict and no-downloads-yet anomaly after grace', () => {
    const packet = buildCrawlProgressPacket({
      targetDownloads: 1000,
      elapsedMs: 15000,
      current: snap({ urls: 30 }),
      now: '2026-05-31T01:00:15.000Z',
    });
    expect(packet.downloads).toBe(0);
    expect(packet.verdict).toBe('idle');
    expect(packet.anomalies).toContain('no-downloads-yet');
  });

  test('high-failure-ratio and db-shrank anomalies', () => {
    const packet = buildCrawlProgressPacket({
      targetDownloads: 1000,
      elapsedMs: 10000,
      current: snap({ urls: 1, responses: 10, successResponses: 3, failedResponses: 7, content: 1 }, '2026-05-31T01:00:09.000Z'),
      baseline: snap({ urls: 5, responses: 5, successResponses: 5, content: 5 }),
      now: '2026-05-31T01:00:10.000Z',
    });
    expect(packet.anomalies).toContain('high-failure-ratio');
    expect(packet.anomalies).toContain('db-shrank-vs-baseline');
  });

  test('writer-db-missing flips exists, anomaly, and verdict guard', () => {
    const packet = buildCrawlProgressPacket({
      writerDbPath: 'data/samples/does-not-exist.db',
      writerDbExists: false,
      targetDownloads: 1000,
      elapsedMs: 1000,
      current: snap({}),
      now: '2026-05-31T01:00:01.000Z',
    });
    expect(packet.writerDb.exists).toBe(false);
    expect(packet.anomalies).toContain('writer-db-missing');
  });

  test('renderCrawlProgressText emits a readable summary', () => {
    const text = renderCrawlProgressText(buildCrawlProgressPacket({
      writerDbPath: 'x.db',
      writerDbExists: true,
      targetDownloads: 1000,
      elapsedMs: 40000,
      current: snap({ successResponses: 16, content: 6 }, '2026-05-31T01:02:55.842Z'),
      now: '2026-05-31T01:03:00.000Z',
    }));
    expect(text).toContain('Crawl Progress Monitor');
    expect(text).toContain('Downloads: 16 / 1000');
    expect(text).toContain('Verdict: in-progress');
  });
});

describe('crawl-progress-monitor sampler + collect (injected DB)', () => {
  function fakeDeps(totals, latestFetchedAt, bytes = 0) {
    return {
      existsSync: () => true,
      openDb: () => ({
        prepare: () => ({ get: () => ({ bytes }) }),
        close() {},
      }),
      snapshot: () => snap(totals, latestFetchedAt),
    };
  }

  test('sampleWriterDb returns snapshot + bytes via injected deps', () => {
    const sample = sampleWriterDb('any.db', fakeDeps({ successResponses: 7, content: 3 }, '2026-05-31T01:00:00.000Z', 12345));
    expect(sample.ok).toBe(true);
    expect(sample.exists).toBe(true);
    expect(sample.bytes).toBe(12345);
    expect(snapshotTotals(sample.snapshot)).toMatchObject({ successResponses: 7, content: 3 });
  });

  test('sampleWriterDb reports missing DB', () => {
    const sample = sampleWriterDb('nope.db', { existsSync: () => false });
    expect(sample.ok).toBe(false);
    expect(sample.exists).toBe(false);
    expect(sample.reason).toContain('writer-db-missing');
  });

  test('collectCrawlProgress wires the sampler into the packet builder', () => {
    const packet = collectCrawlProgress(
      { writerDbPath: 'any.db', targetDownloads: 1000, elapsedMs: 20000, now: '2026-05-31T01:00:20.000Z' },
      {
        sampleWriterDb: () => ({ ok: true, exists: true, bytes: 2048, snapshot: snap({ successResponses: 10, content: 4 }, '2026-05-31T01:00:19.000Z') }),
      },
    );
    expect(packet.downloads).toBe(10);
    expect(packet.throughput.bytesPerSec).toBe(102.4); // 2048 / 20s
    expect(packet.verdict).toBe('in-progress');
  });

  test('collectCrawlProgress requires writerDbPath', () => {
    expect(() => collectCrawlProgress({}, {})).toThrow('writerDbPath is required');
  });
});

describe('crawl-progress-monitor CLI', () => {
  test('parseArgs defaults to progress mode and reads flags', () => {
    const args = parseArgs(['progress', '--writer-db', 'x.db', '--target-downloads', '1000', '--json']);
    expect(args.mode).toBe('progress');
    expect(args['writer-db']).toBe('x.db');
    expect(args['target-downloads']).toBe('1000');
    expect(args.json).toBe(true);
  });

  test('runCli errors without --writer-db', () => {
    const errs = [];
    const origErr = console.error;
    console.error = (m) => errs.push(m);
    try {
      const code = runCli(['progress', '--json']);
      expect(code).toBe(2);
      expect(errs.join('\n')).toContain('--writer-db');
    } finally {
      console.error = origErr;
    }
  });

  test('loadBaselineSnapshot tolerates iso-proof sample.before shape', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpm-'));
    const file = path.join(dir, 'proof.json');
    fs.writeFileSync(file, JSON.stringify({ sample: { before: { urls: 0, successResponses: 0, content: 0 } } }));
    try {
      const baseline = loadBaselineSnapshot(file);
      expect(snapshotTotals(baseline)).toMatchObject({ urls: 0, successResponses: 0, content: 0 });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('loadBaselineSnapshot adapts snapshot-both-dbs sample.totals shape', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpm-'));
    const file = path.join(dir, 'both.json');
    fs.writeFileSync(file, JSON.stringify({
      capturedAt: '2026-05-31T00:00:00.000Z',
      sample: { path: 's.db', exists: true, totals: { urls: 100, successResponses: 12, content: 5 }, latestFetchedAt: '2026-05-31T00:00:00.000Z' },
      production: { path: 'p.db', exists: true, totals: { urls: 999999 } },
    }));
    try {
      const baseline = loadBaselineSnapshot(file);
      expect(snapshotTotals(baseline)).toMatchObject({ urls: 100, successResponses: 12, content: 5 });
      expect(baseline.latestFetchedAt).toBe('2026-05-31T00:00:00.000Z');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('loadBaselineSnapshot adapts production-only totals shape', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpm-'));
    const file = path.join(dir, 'prod.json');
    fs.writeFileSync(file, JSON.stringify({
      production: { totals: { urls: 42, successResponses: 7 }, latestFetchedAt: '2026-05-31T00:00:00.000Z' },
    }));
    try {
      const baseline = loadBaselineSnapshot(file);
      expect(snapshotTotals(baseline)).toMatchObject({ urls: 42, successResponses: 7 });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('crawl-progress-monitor self-clocking elapsed', () => {
  const { deriveElapsedFromSamples } = require('../../../tools/crawl/lib/crawl-progress-monitor');

  test('deriveElapsedFromSamples returns positive delta from latestFetchedAt timestamps', () => {
    const ms = deriveElapsedFromSamples('2026-05-31T00:00:00.000Z', '2026-05-31T00:01:40.000Z');
    expect(ms).toBe(100000);
  });

  test('deriveElapsedFromSamples clamps backwards skew to 0 (never negative)', () => {
    const ms = deriveElapsedFromSamples('2026-05-31T01:00:00.000Z', '2026-05-31T00:00:00.000Z');
    expect(ms).toBe(0);
  });

  test('deriveElapsedFromSamples returns null when a timestamp is missing', () => {
    expect(deriveElapsedFromSamples(null, '2026-05-31T00:00:00.000Z')).toBeNull();
    expect(deriveElapsedFromSamples('2026-05-31T00:00:00.000Z', null)).toBeNull();
    expect(deriveElapsedFromSamples(null, null)).toBeNull();
  });

  test('packet prefers DB-derived elapsed over a skewed elapsed-ms arg', () => {
    const packet = buildCrawlProgressPacket({
      targetDownloads: 1000,
      elapsedMs: -3500000, // skewed harness wall-clock that bit us on 2026-05-31
      current: snap({ urls: 210, successResponses: 64, content: 21 }, '2026-05-31T01:06:40.000Z'),
      baseline: snap({}, '2026-05-31T01:00:00.000Z'),
      now: '2026-05-31T01:10:00.000Z',
    });
    expect(packet.elapsedSource).toBe('db-latest-fetched-delta');
    expect(packet.elapsedSec).toBe(400); // 400s between the two latestFetchedAt
    expect(packet.elapsedSec).toBeGreaterThanOrEqual(0);
  });

  test('packet falls back to elapsed-ms arg when baseline has no timestamp', () => {
    const packet = buildCrawlProgressPacket({
      targetDownloads: 1000,
      elapsedMs: 40000,
      current: snap({ successResponses: 16 }, '2026-05-31T01:00:40.000Z'),
      baseline: snap({}), // no latestFetchedAt
      now: '2026-05-31T01:00:40.000Z',
    });
    expect(packet.elapsedSource).toBe('elapsed-ms-arg');
    expect(packet.elapsedSec).toBe(40);
  });

  test('packet reports elapsedSource none when neither baseline timestamp nor arg present', () => {
    const packet = buildCrawlProgressPacket({
      targetDownloads: 1000,
      current: snap({ successResponses: 16 }),
      baseline: snap({}),
      now: '2026-05-31T01:00:40.000Z',
    });
    expect(packet.elapsedSource).toBe('none');
    expect(packet.elapsedSec).toBe(0);
  });
});
