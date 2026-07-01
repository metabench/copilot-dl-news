'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildInternetThroughputApprovalPacket,
  buildThroughputAnalysis,
  renderThroughputAnalysisText,
  summarizeFetchSamples,
  summarizeLimiterSnapshots
} = require('../../../tools/crawl/lib/throughput-analyzer');
const { parseArgs, runCli } = require('../../../tools/crawl/throughput-analyzer');

describe('throughput analyzer', () => {
  test('decomposes politeness floor, freshness, latency, and DB growth', () => {
    const report = buildThroughputAnalysis({
      generatedAt: '2026-06-14T00:00:00.000Z',
      progressPackets: [{
        downloads: 10,
        elapsedSec: 20,
        elapsedSource: 'db-latest-fetched-delta',
        verdict: 'in-progress',
        throughput: { docsPerSec: 0.5, bytesPerSec: 2048 },
        dbGrowth: { responses: 10, successResponses: 10, content: 4 }
      }],
      fetchSamples: [{
        fetchMeta: {
          httpStatus: 200,
          totalMs: 750,
          ttfbMs: 250,
          downloadMs: 100,
          bytesDownloaded: 4096,
          freshness: { status: 'updated', conditional: true, avoidedDownload: false }
        }
      }, {
        fetchMeta: {
          httpStatus: 304,
          totalMs: 120,
          ttfbMs: 120,
          bytesDownloaded: 0,
          freshness: { status: 'unchanged', conditional: true, avoidedDownload: true }
        }
      }],
      limiterSnapshots: [{ politenessFloorMs: 2000, crawlDelaySeconds: 2 }],
      cadenceComparison: { cadenceConsistent: true, diagnostics: [] }
    });

    expect(report.mode).toBe('crawl-throughput-analysis');
    expect(report.actionPolicy.startsCrawler).toBe(false);
    expect(report.evidence.fetches.freshness).toMatchObject({
      updated: 1,
      unchanged: 1,
      conditional: 2,
      avoidedDownloads: 1
    });
    expect(report.classification.factors.find((f) => f.id === 'robots-politeness-floor')).toMatchObject({
      status: 'likely-limiting'
    });
    expect(report.classification.factors.find((f) => f.id === 'db-write-growth')).toMatchObject({
      status: 'proven'
    });
    expect(renderThroughputAnalysisText(report)).toContain('No-action policy');
  });

  test('classifies stalled progress as blocked primary', () => {
    const report = buildThroughputAnalysis({
      progressPackets: [{
        downloads: 5,
        stalled: true,
        verdict: 'stalled',
        throughput: { docsPerSec: 0, bytesPerSec: 0 }
      }]
    });

    expect(report.classification.label).toBe('throughput-blocked');
    expect(report.classification.primary).toBe('stall');
  });

  test('summarizes limiter backoff status', () => {
    expect(summarizeLimiterSnapshots([
      { politenessFloorMs: 1000, lastHttpStatus: 429, isLimited: true },
      { politenessFloorMs: 2000, crawlDelaySeconds: 2 }
    ])).toMatchObject({
      politenessFloorMs: 2000,
      crawlDelaySeconds: 2,
      backoffCount: 1,
      statuses: { '429': 1 }
    });
  });

  test('summarizes freshness samples from page event shape', () => {
    const summary = summarizeFetchSamples([
      { httpStatus: 200, totalMs: 10, bytesDownloaded: 100, freshness: { status: 'new' } },
      { httpStatus: 304, totalMs: 5, bytesDownloaded: 0, freshness: { status: 'unchanged', avoidedDownload: true, conditional: true } }
    ]);

    expect(summary.http).toMatchObject({ success: 1, notModified: 1 });
    expect(summary.freshness).toMatchObject({ new: 1, unchanged: 1, avoidedDownloads: 1, conditional: 1 });
    expect(summary.timing.avgTotalMs).toBe(7.5);
  });

  test('CLI parses artifact flags and writes a no-contact report', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'throughput-analyzer-'));
    const progress = path.join(dir, 'progress.json');
    const fetches = path.join(dir, 'fetches.jsonl');
    const out = path.join(dir, 'report.json');
    fs.writeFileSync(progress, JSON.stringify({
      downloads: 1,
      throughput: { docsPerSec: 0.1, bytesPerSec: 10 },
      dbGrowth: { responses: 1, content: 1 },
      elapsedSource: 'db-latest-fetched-delta'
    }));
    fs.writeFileSync(fetches, `${JSON.stringify({ httpStatus: 200, totalMs: 100, freshness: { status: 'new' } })}\n`);
    try {
      const args = parseArgs(['analyze', '--progress', progress, '--fetch-samples', fetches, '--out', out, '--json']);
      expect(args.progress).toBe(progress);
      const logs = [];
      const origLog = console.log;
      console.log = (line) => logs.push(line);
      try {
        expect(runCli(['analyze', '--progress', progress, '--fetch-samples', fetches, '--out', out, '--json'])).toBe(0);
      } finally {
        console.log = origLog;
      }
      expect(fs.existsSync(out)).toBe(true);
      expect(JSON.parse(fs.readFileSync(out, 'utf8')).mode).toBe('crawl-throughput-analysis');
      expect(JSON.parse(logs.join('\n')).mode).toBe('crawl-throughput-analysis');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('approval packet blocks internet sample crawl without explicit approval', () => {
    const packet = buildInternetThroughputApprovalPacket({
      generatedAt: '2026-06-14T00:00:00.000Z',
      sampleDbPath: 'data/samples/internet-throughput-sample.db',
      productionDbPath: 'data/news.db'
    });

    expect(packet.mode).toBe('internet-throughput-measurement-approval');
    expect(packet.actionPolicy.startsCrawler).toBe(false);
    expect(packet.actionPolicy.contactsInternetTargets).toBe(false);
    expect(packet.actionPolicy.writesSampleDb).toBe(false);
    expect(packet.classification).toMatchObject({
      label: 'blocked',
      primary: 'missing-explicit-internet-sample-approval',
      blockers: ['missing-explicit-internet-sample-approval']
    });
    expect(packet.proposedRun.command).toContain('--crawl-db data/samples/internet-throughput-sample.db');
    expect(renderThroughputAnalysisText(packet)).toContain('No-action policy');
  });

  test('approval packet records approval-ready state without executing crawler work', () => {
    const packet = buildInternetThroughputApprovalPacket({
      explicitApprovalPresent: true,
      targetUrl: 'https://example.com/news'
    });

    expect(packet.classification).toMatchObject({
      label: 'approval-ready',
      blockers: []
    });
    expect(packet.actionPolicy.startsCrawler).toBe(false);
    expect(packet.actionPolicy.whenApproved).toMatchObject({
      contactsInternetTargets: true,
      writesSampleDb: true,
      writesProductionDb: false
    });
  });

  test('CLI writes blocked approval packet by default', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'throughput-approval-'));
    const out = path.join(dir, 'approval.json');
    try {
      const logs = [];
      const origLog = console.log;
      console.log = (line) => logs.push(line);
      try {
        expect(runCli(['approval', '--out', out, '--json'])).toBe(3);
      } finally {
        console.log = origLog;
      }
      const packet = JSON.parse(fs.readFileSync(out, 'utf8'));
      expect(packet.classification.primary).toBe('missing-explicit-internet-sample-approval');
      expect(JSON.parse(logs.join('\n')).mode).toBe('internet-throughput-measurement-approval');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
