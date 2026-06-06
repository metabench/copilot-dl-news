'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildBaselineArtifact,
  buildLocalSmokePlan,
  buildLocalSmokeRunReport,
  buildMonitoredSmallCrawlCadence,
  buildMonitoredSmallCrawlComparison,
  buildMonitoredSmallCrawlReport,
  collectRecentCrawlOverview,
  hostMatches,
  normalizeLocalSmokeOptions,
  normalizeOptions,
  normalizeSampleRows,
  readBoundedJson,
  renderMonitoredSmallCrawlCadenceText,
  renderMonitoredSmallCrawlComparisonText,
  renderMonitoredSmallCrawlText,
} = require('../../../tools/crawl/lib/monitored-small-crawl');
const { getPayloadExitCode, parseArgs, runCli, runLocalSmoke } = require('../../../tools/crawl/monitored-small-crawl');
const { resolveToolSpec } = require('../../../tools/crawl/index');

function snapshot(overrides = {}) {
  return {
    available: true,
    capturedAt: '2026-05-28T10:00:00.000Z',
    latestFetchedAt: '2026-05-28 09:59:00',
    totals: {
      urls: 100,
      responses: 50,
      successResponses: 40,
      failedResponses: 10,
      content: 38,
      ...(overrides.totals || {}),
    },
    ...overrides,
  };
}

function recentEvidence(overrides = {}) {
  return {
    available: true,
    downloads: 3,
    success: 3,
    failed: 0,
    bytes: 12345,
    distinctHosts: 1,
    hosts: [{
      host: 'www.bbc.com',
      downloads: 3,
      success: 3,
      failed: 0,
      bytes: 12345,
      firstFetchedAt: '2026-05-28 09:55:00',
      lastFetchedAt: '2026-05-28 09:59:00',
    }],
    statuses: [{ status: 200, count: 3 }],
    ...overrides,
  };
}

describe('monitored small crawl evidence', () => {
  test('normalizes bounded options and exact host matching', () => {
    const options = normalizeOptions({
      generatedAt: '2026-05-28T10:00:00.000Z',
      hosts: 'BBC.com,www.bbc.com',
      windowMinutes: '30',
      limit: '999',
    });

    expect(options.hosts).toEqual(['bbc.com', 'www.bbc.com']);
    expect(options.sampleLimit).toBe(50);
    expect(hostMatches('www.bbc.com', 'bbc.com')).toBe(true);
    expect(hostMatches('notbbc.com', 'bbc.com')).toBe(false);
  });

  test('builds verified report from DB-owned evidence without URL dumps beyond samples', () => {
    const report = buildMonitoredSmallCrawlReport({
      options: {
        generatedAt: '2026-05-28T10:00:00.000Z',
        since: '2026-05-28T09:50:00.000Z',
        until: '2026-05-28T10:00:00.000Z',
        hosts: 'bbc.com',
        expectedMinDownloads: 3,
      },
      baselineSnapshot: snapshot({ totals: { responses: 47, successResponses: 37, content: 35 } }),
      postSnapshot: snapshot(),
      recentEvidence: recentEvidence(),
      queryTimings: [
        { name: 'snapshot', ms: 12 },
        { name: 'recent-evidence', ms: 20 },
      ],
      samples: [
        {
          url: 'https://www.bbc.com/news/a',
          http_status: 200,
          bytes_downloaded: 4096,
          fetched_at: '2026-05-28T09:59:00.000Z',
          content_type: 'text/html',
        },
      ],
    });

    expect(report.readinessLabel).toBe('verified-new-data');
    expect(report.database.delta).toMatchObject({ responses: 3, successResponses: 3, content: 3 });
    expect(report.evidence.queryTimings).toEqual([
      { name: 'snapshot', ms: 12 },
      { name: 'recent-evidence', ms: 20 },
    ]);
    expect(report.recent.samples).toHaveLength(1);
    expect(report.actionPolicy).toMatchObject({
      startsCrawler: false,
      contactsRemote: false,
      writesLocalDb: false,
      changesCollectBehavior: false,
    });
    expect(renderMonitoredSmallCrawlText(report)).toContain('No-action policy');
    expect(renderMonitoredSmallCrawlText(report)).toContain('DB evidence timings: snapshot=12ms recent-evidence=20ms');
  });

  test('warns on no-new-data and blocks unmet expected download count', () => {
    const report = buildMonitoredSmallCrawlReport({
      options: {
        generatedAt: '2026-05-28T10:00:00.000Z',
        since: '2026-05-28T09:50:00.000Z',
        until: '2026-05-28T10:00:00.000Z',
        hosts: 'bbc.com',
        expectedMinDownloads: 1,
      },
      postSnapshot: snapshot(),
      recentEvidence: recentEvidence({ downloads: 0, success: 0, hosts: [] }),
      samples: [],
    });

    expect(report.readinessLabel).toBe('verification-blocked');
    expect(report.blockers).toContain('expected-download-count-not-met');
    expect(report.warnings).toEqual(expect.arrayContaining([
      'no downloads were found in the monitored time window',
      'no recent downloads matched requested host(s): bbc.com',
    ]));
  });

  test('normalizes and bounds recent download samples by host and time', () => {
    const samples = normalizeSampleRows([
      { url: 'https://www.bbc.com/news/a', http_status: 200, fetched_at: '2026-05-28T09:55:00.000Z' },
      { url: 'https://example.com/other', http_status: 200, fetched_at: '2026-05-28T09:56:00.000Z' },
      { url: 'https://www.bbc.com/old', http_status: 200, fetched_at: '2026-05-28T08:00:00.000Z' },
      { url: 'https://www.bbc.com/news/db-timestamp', http_status: 200, fetched_at: '2026-05-28 09:57:00' },
    ], {
      hosts: ['bbc.com'],
      since: '2026-05-28T09:00:00.000Z',
      until: '2026-05-28T10:00:00.000Z',
      sampleLimit: 5,
    });

    expect(samples.map(row => row.url)).toEqual([
      'https://www.bbc.com/news/a',
      'https://www.bbc.com/news/db-timestamp',
    ]);
  });

  test('collects recent overview through injected DB-owned query functions and closes DB', () => {
    const close = jest.fn();
    const calls = [];
    const report = collectRecentCrawlOverview({
      generatedAt: '2026-05-28T10:00:00.000Z',
      since: '2026-05-28T09:50:00.000Z',
      until: '2026-05-28T10:00:00.000Z',
      hosts: 'bbc.com',
      sampleLimit: 2,
    }, {
      openDb: () => ({ close }),
      downloadEvidence: {
        getCloudCrawlDatabaseSnapshot: () => {
          calls.push('snapshot');
          return snapshot();
        },
        getCloudCrawlRecentEvidence: () => {
          calls.push('recent-evidence');
          return recentEvidence();
        },
        getDownloadEvidence: () => {
          calls.push('window-samples');
          return [
            { url: 'https://www.bbc.com/news/a', http_status: 200, bytes_downloaded: 1, fetched_at: '2026-05-28T09:59:00.000Z' },
          ];
        },
        listRecentDownloads: () => {
          calls.push('recent-samples');
          return [];
        },
      },
    });

    expect(report.recent.success).toBe(3);
    expect(calls).toEqual(['snapshot', 'recent-evidence', 'window-samples', 'recent-samples']);
    expect(report.evidence.queryTimings.map(row => row.name)).toEqual([
      'snapshot',
      'recent-evidence',
      'window-samples',
      'recent-samples',
    ]);
    expect(close).toHaveBeenCalledTimes(1);
  });

  test('warns when a DB evidence step is slow', () => {
    const report = buildMonitoredSmallCrawlReport({
      options: {
        generatedAt: '2026-05-28T10:00:00.000Z',
        since: '2026-05-28T09:50:00.000Z',
        until: '2026-05-28T10:00:00.000Z',
        hosts: 'bbc.com',
      },
      postSnapshot: snapshot(),
      recentEvidence: recentEvidence(),
      queryTimings: [
        { name: 'recent-evidence', ms: 5001 },
      ],
    });

    expect(report.warnings).toContain('slow DB evidence step recent-evidence: 5001ms');
  });

  test('builds bounded local smoke plan without mutating state', () => {
    const plan = buildLocalSmokePlan({
      generatedAt: '2026-05-28T10:00:00.000Z',
      db: 'data/news.db',
    });

    expect(plan.mode).toBe('monitored-small-crawl-local-smoke-plan');
    expect(plan.target).toEqual({
      host: 'www.bbc.com',
      url: 'https://www.bbc.com/news',
    });
    expect(plan.caps).toMatchObject({
      maxPages: 1,
      maxDepth: 0,
      concurrency: 1,
      uiHost: '127.0.0.1',
      uiPort: 3171,
    });
    expect(plan.command.args).toEqual(expect.arrayContaining([
      'tools/crawl/run.js',
      '--local',
      '--max-pages',
      '1',
      '--max-depth',
      '0',
      '--batch-retries',
      '0',
      '--batch-request-timeout-ms',
      '60000',
      '--watch',
      '--watch-min-fetches',
      '1',
      '--auto-stop',
      '--json',
      '--override',
      'preferCache=false',
      '--override',
      'maxAgeMs=0',
      '--override',
      'useSitemap=false',
      '--override',
      'skipQueryUrls=false',
    ]));
    expect(plan.actionPolicy).toMatchObject({
      startsCrawler: false,
      contactsRemote: false,
      writesLocalDb: false,
      writesLocalDbWhenExecuted: true,
      changesCollectBehavior: false,
    });
  });

  test('local smoke options enforce tiny caps and exact host match', () => {
    expect(() => normalizeLocalSmokeOptions({
      url: 'https://www.bbc.com/news',
      host: 'bbc.com',
      maxPages: 4,
    })).toThrow('local smoke max pages must be between 1 and 3');

    expect(() => normalizeLocalSmokeOptions({
      url: 'https://example.com/news',
      host: 'bbc.com',
    })).toThrow('does not match requested host');
  });

  test('local smoke execute path is injectable and records DB verification evidence', () => {
    const baseline = buildBaselineArtifact(snapshot(), {
      generatedAt: '2026-05-28T10:00:00.000Z',
      hosts: 'bbc.com',
    });
    const verification = buildMonitoredSmallCrawlReport({
      options: {
        generatedAt: '2026-05-28T10:01:00.000Z',
        since: '2026-05-28T10:00:00.000Z',
        until: '2026-05-28T10:01:00.000Z',
        hosts: 'bbc.com',
        expectedMinDownloads: 1,
      },
      baselineSnapshot: baseline.database.snapshot,
      postSnapshot: snapshot({ totals: { responses: 51, successResponses: 41, content: 39 } }),
      recentEvidence: recentEvidence({ downloads: 1, success: 1 }),
      samples: [{ url: 'https://www.bbc.com/news/a', http_status: 200, fetched_at: '2026-05-28T10:00:30.000Z' }],
    });
    const deps = {
      collectBaseline: jest.fn(() => baseline),
      runBoundedLocalSmoke: jest.fn(() => ({
        startedAt: '2026-05-28T10:00:00.000Z',
        finishedAt: '2026-05-28T10:01:00.000Z',
        exitCode: 0,
        signal: null,
        timedOut: false,
        stdout: '{"ok":true}',
        stderr: '',
      })),
      collectVerification: jest.fn(() => verification),
    };

    const report = runLocalSmoke({
      execute: true,
      generatedAt: '2026-05-28T10:00:00.000Z',
      host: 'bbc.com',
      db: 'data/news.db',
    }, deps);

    expect(deps.collectBaseline).toHaveBeenCalledWith(expect.objectContaining({
      dbPath: 'data/news.db',
      hosts: 'bbc.com',
    }));
    expect(deps.runBoundedLocalSmoke).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'monitored-small-crawl-local-smoke-plan',
    }));
    expect(deps.collectVerification).toHaveBeenCalledWith(expect.objectContaining({
      baselineArtifact: baseline,
      expectedMinDownloads: 1,
      hosts: 'bbc.com',
    }));
    expect(report.readinessLabel).toBe('verified-new-data');
    expect(report.actionPolicy).toMatchObject({
      startsLocalCrawler: true,
      contactsRemote: false,
      writesLocalDbExpected: true,
      changesCollectBehavior: false,
    });
    expect(report.crawl.stdoutJson).toEqual({ ok: true });
  });

  test('local smoke run report blocks failed or timed-out crawl commands', () => {
    const plan = buildLocalSmokePlan({
      generatedAt: '2026-05-28T10:00:00.000Z',
    });
    const report = buildLocalSmokeRunReport({
      plan,
      baseline: null,
      crawlResult: {
        startedAt: '2026-05-28T10:00:00.000Z',
        finishedAt: '2026-05-28T10:01:00.000Z',
        exitCode: null,
        timedOut: true,
        error: 'spawn timed out',
        stdout: '',
        stderr: 'slow\n{"watchFinal":{"stoppedReason":"timeout","minFetches":1,"minFetchesMet":false}}\n',
      },
      verification: buildMonitoredSmallCrawlReport({
        options: {
          generatedAt: '2026-05-28T10:01:00.000Z',
          since: '2026-05-28T10:00:00.000Z',
          until: '2026-05-28T10:01:00.000Z',
          hosts: 'bbc.com',
        },
        postSnapshot: snapshot(),
        recentEvidence: recentEvidence(),
      }),
    });

    expect(report.readinessLabel).toBe('verification-blocked');
    expect(report.blockers).toContain('crawl-command-failed');
    expect(report.crawl.exitCode).toBeNull();
    expect(report.crawl.timedOut).toBe(true);
    expect(report.crawl.watchFinal).toEqual({
      stoppedReason: 'timeout',
      minFetches: 1,
      minFetchesMet: false,
    });
    expect(report.crawl.stderrTail).toContain('"watchFinal"');
    expect(getPayloadExitCode(report)).toBe(2);
  });

  test('local smoke run report records launch and watch job evidence', () => {
    const report = buildLocalSmokeRunReport({
      plan: buildLocalSmokePlan({ generatedAt: '2026-05-28T10:00:00.000Z' }),
      baseline: null,
      crawlResult: {
        startedAt: '2026-05-28T10:00:00.000Z',
        finishedAt: '2026-05-28T10:02:00.000Z',
        exitCode: 2,
        timedOut: false,
        stdout: JSON.stringify({
          results: [{
            jobId: 'job-1',
            body: {
              job: {
                id: 'job-1',
                operationName: 'basicArticleCrawl',
                startUrl: 'https://www.bbc.com/news',
                status: 'running',
                startedAt: '2026-05-28T10:00:10.000Z',
                finishedAt: null,
              },
            },
          }],
        }),
        stderr: '{"watchFinal":{"stoppedReason":"local-job-terminal-without-min-fetches","minFetches":1,"minFetchesMet":false,"jobs":{"counts":{"total":1,"running":0,"completed":1,"failed":0,"terminal":1,"statuses":{"completed":1}},"items":[{"id":"job-1","operationName":"basicArticleCrawl","status":"completed"}]}}}',
      },
      verification: buildMonitoredSmallCrawlReport({
        options: {
          generatedAt: '2026-05-28T10:02:00.000Z',
          since: '2026-05-28T10:00:00.000Z',
          until: '2026-05-28T10:02:00.000Z',
          hosts: 'bbc.com',
          expectedMinDownloads: 1,
        },
        postSnapshot: snapshot(),
        recentEvidence: recentEvidence({ downloads: 0, success: 0, hosts: [] }),
      }),
    });

    expect(report.crawl.launchJobs[0]).toMatchObject({ id: 'job-1', status: 'running' });
    expect(report.crawl.watchJobs.counts).toMatchObject({ completed: 1, terminal: 1 });
    expect(report.crawl.watchFinal.stoppedReason).toBe('local-job-terminal-without-min-fetches');
  });

  test('compares saved local-smoke reports with stable pass evidence', () => {
    const plan = buildLocalSmokePlan({
      generatedAt: '2026-05-28T10:00:00.000Z',
    });
    const verification = buildMonitoredSmallCrawlReport({
      options: {
        generatedAt: '2026-05-28T10:01:00.000Z',
        since: '2026-05-28T10:00:00.000Z',
        until: '2026-05-28T10:01:00.000Z',
        hosts: 'bbc.com',
        expectedMinDownloads: 1,
      },
      baselineSnapshot: snapshot({ totals: { responses: 50, successResponses: 40, content: 38 } }),
      postSnapshot: snapshot({ totals: { responses: 51, successResponses: 41, content: 39 } }),
      recentEvidence: recentEvidence({ downloads: 1, success: 1 }),
      queryTimings: [{ name: 'recent-evidence', ms: 17 }],
      samples: [{ url: 'https://www.bbc.com/news/ok', http_status: 200, fetched_at: '2026-05-28T10:00:30.000Z' }],
    });
    const localSmokeReport = buildLocalSmokeRunReport({
      plan,
      baseline: null,
      crawlResult: {
        startedAt: '2026-05-28T10:00:00.000Z',
        finishedAt: '2026-05-28T10:01:00.000Z',
        exitCode: 0,
        timedOut: false,
        stdout: '{"ok":true}',
        stderr: '',
      },
      verification,
    });

    const comparison = buildMonitoredSmallCrawlComparison({
      reports: [localSmokeReport],
      sourcePaths: ['tmp/local-smoke-report.json'],
    });

    expect(comparison.mode).toBe('monitored-small-crawl-comparison');
    expect(comparison.stablePassEvidence.passed).toBe(true);
    expect(comparison.latest.dbDelta).toMatchObject({ successResponses: 1, content: 1 });
    expect(comparison.latest.recent).toMatchObject({ downloads: 1, success: 1, sampleCount: 1 });
    expect(comparison.actionPolicy).toMatchObject({
      startsCrawler: false,
      contactsRemote: false,
      writesLocalDb: false,
      changesCollectBehavior: false,
    });
    expect(renderMonitoredSmallCrawlComparisonText(comparison)).toContain('Stable pass: yes');
  });

  test('cadence summarizes pass/fail trend and treats stale running job as nonblocking when DB proof passed', () => {
    const priorBlocked = buildMonitoredSmallCrawlReport({
      options: {
        generatedAt: '2026-05-28T09:50:00.000Z',
        since: '2026-05-28T09:49:00.000Z',
        until: '2026-05-28T09:50:00.000Z',
        hosts: 'bbc.com',
        expectedMinDownloads: 1,
      },
      postSnapshot: snapshot(),
      recentEvidence: recentEvidence({ downloads: 0, success: 0, hosts: [] }),
      samples: [],
    });
    const latestPassed = buildLocalSmokeRunReport({
      plan: buildLocalSmokePlan({ generatedAt: '2026-05-28T10:00:00.000Z' }),
      baseline: null,
      crawlResult: {
        startedAt: '2026-05-28T10:00:00.000Z',
        finishedAt: '2026-05-28T10:02:00.000Z',
        exitCode: 0,
        timedOut: false,
        stdout: '{"ok":true}',
        stderr: '{"watchFinal":{"stoppedReason":"min-fetches-met","minFetches":1,"minFetchesMet":true,"jobs":{"counts":{"total":1,"running":1,"completed":0,"failed":0,"terminal":0,"statuses":{"running":1}},"items":[{"id":"job-1","operationName":"basicArticleCrawl","status":"running"}]}}}',
      },
      verification: buildMonitoredSmallCrawlReport({
        options: {
          generatedAt: '2026-05-28T10:02:00.000Z',
          since: '2026-05-28T10:00:00.000Z',
          until: '2026-05-28T10:02:00.000Z',
          hosts: 'bbc.com',
          expectedMinDownloads: 1,
        },
        baselineSnapshot: snapshot({ totals: { urls: 100, responses: 50, successResponses: 40, content: 38 } }),
        postSnapshot: snapshot({ totals: { urls: 101, responses: 53, successResponses: 43, content: 39 } }),
        recentEvidence: recentEvidence({ downloads: 3, success: 3 }),
        samples: [{ url: 'https://www.bbc.com/news/ok', http_status: 200, fetched_at: '2026-05-28T10:01:30.000Z' }],
      }),
    });

    const cadence = buildMonitoredSmallCrawlCadence({ reports: [priorBlocked, latestPassed] });

    expect(cadence.mode).toBe('monitored-small-crawl-cadence');
    expect(cadence.cadence).toMatchObject({
      reportCount: 2,
      latestPassed: true,
      passCount: 1,
      failCount: 1,
      blockedCount: 1,
      consecutivePasses: 1,
      consecutiveFailures: 0,
    });
    expect(cadence.cadence.totalDbDelta).toMatchObject({ successResponses: 3, content: 1 });
    expect(cadence.cadence.jobCaveats).toContain('stale-running-job-nonblocking-db-proof-present');
    expect(cadence.timeline[1].jobEvidence.caveat).toBe('stale-running-job-nonblocking-db-proof-present');
    expect(cadence.actionPolicy).toMatchObject({
      startsCrawler: false,
      contactsRemote: false,
      writesLocalDb: false,
      prunesRemote: false,
      forceDeploys: false,
    });
    expect(renderMonitoredSmallCrawlCadenceText(cadence)).toContain('Latest pass: yes');
  });

  test('comparison blocks no-new-data and slow DB evidence regressions', () => {
    const prior = buildMonitoredSmallCrawlReport({
      options: {
        generatedAt: '2026-05-28T10:00:00.000Z',
        since: '2026-05-28T09:59:00.000Z',
        until: '2026-05-28T10:00:00.000Z',
        hosts: 'bbc.com',
      },
      postSnapshot: snapshot({ totals: { responses: 51, successResponses: 41, content: 39 } }),
      recentEvidence: recentEvidence({ downloads: 1, success: 1 }),
      queryTimings: [{ name: 'recent-evidence', ms: 25 }],
    });
    const latest = buildMonitoredSmallCrawlReport({
      options: {
        generatedAt: '2026-05-28T10:10:00.000Z',
        since: '2026-05-28T10:09:00.000Z',
        until: '2026-05-28T10:10:00.000Z',
        hosts: 'bbc.com',
        expectedMinDownloads: 1,
      },
      postSnapshot: snapshot(),
      recentEvidence: recentEvidence({ downloads: 0, success: 0, hosts: [] }),
      queryTimings: [{ name: 'recent-evidence', ms: 5001 }],
      samples: [],
    });

    const comparison = buildMonitoredSmallCrawlComparison({ reports: [prior, latest] });

    expect(comparison.stablePassEvidence.passed).toBe(false);
    expect(comparison.blockers).toEqual(expect.arrayContaining([
      'expected-download-count-not-met',
      'missing-stable-evidence:db-persistence-or-recent-download-evidence',
      'missing-stable-evidence:db-evidence-under-slow-threshold',
    ]));
    expect(comparison.diagnostics).toEqual(expect.arrayContaining([
      'latest-report-verification-blocked',
      'latest-report-has-no-new-data-evidence',
      'latest-report-has-slow-db-evidence',
    ]));
    expect(comparison.warnings).toEqual(expect.arrayContaining([
      'slow DB evidence step recent-evidence: 5001ms',
    ]));
  });

  test('comparison flags partial persistence when latest report only adds URL rows', () => {
    const prior = buildMonitoredSmallCrawlReport({
      options: {
        generatedAt: '2026-05-28T10:00:00.000Z',
        since: '2026-05-28T09:59:00.000Z',
        until: '2026-05-28T10:00:00.000Z',
        hosts: 'bbc.com',
      },
      baselineSnapshot: snapshot({ totals: { urls: 99, responses: 49, successResponses: 39, content: 37 } }),
      postSnapshot: snapshot({ totals: { urls: 100, responses: 50, successResponses: 40, content: 38 } }),
      recentEvidence: recentEvidence({ downloads: 1, success: 1 }),
      samples: [{ url: 'https://www.bbc.com/news/ok', http_status: 200, fetched_at: '2026-05-28T09:59:30.000Z' }],
    });
    const latest = buildLocalSmokeRunReport({
      plan: buildLocalSmokePlan({ generatedAt: '2026-05-28T10:10:00.000Z' }),
      baseline: null,
      crawlResult: {
        startedAt: '2026-05-28T10:10:00.000Z',
        finishedAt: '2026-05-28T10:13:00.000Z',
        exitCode: 0,
        timedOut: false,
        stdout: '{"status":"ok"}',
        stderr: '{"watchFinal":{"stoppedReason":"timeout","totals":{"fetched":0},"minFetches":1,"minFetchesMet":false,"jobs":{"counts":{"total":1,"running":1,"completed":0,"failed":0,"terminal":0,"statuses":{"running":1}},"items":[{"id":"job-1","operationName":"basicArticleCrawl","status":"running"}]}}}',
      },
      verification: buildMonitoredSmallCrawlReport({
        options: {
          generatedAt: '2026-05-28T10:13:00.000Z',
          since: '2026-05-28T10:10:00.000Z',
          until: '2026-05-28T10:13:00.000Z',
          hosts: 'bbc.com',
          expectedMinDownloads: 1,
        },
        baselineSnapshot: snapshot({
          latestFetchedAt: '2026-05-28T09:59:30.000Z',
          totals: { urls: 100, responses: 50, successResponses: 40, content: 38 },
        }),
        postSnapshot: snapshot({
          latestFetchedAt: '2026-05-28T09:59:30.000Z',
          totals: { urls: 101, responses: 50, successResponses: 40, content: 38 },
        }),
        recentEvidence: recentEvidence({ downloads: 0, success: 0, hosts: [] }),
        samples: [],
      }),
    });

    const comparison = buildMonitoredSmallCrawlComparison({ reports: [prior, latest] });

    expect(comparison.stablePassEvidence.passed).toBe(false);
    expect(comparison.diagnostics).toEqual(expect.arrayContaining([
      'latest-report-url-only-db-delta',
      'latest-crawl-started-but-no-fetch-evidence',
      'latest-report-has-no-recent-samples',
      'latest-fetched-at-before-crawl-window',
      'latest-watch-loop-timed-out',
      'latest-local-job-still-running-at-watch-end',
      'latest-watch-min-fetches-not-met',
    ]));
    expect(comparison.latest.jobEvidence.watchJobs.counts.running).toBe(1);
    expect(comparison.latest.dbDelta).toMatchObject({
      urls: 1,
      responses: 0,
      successResponses: 0,
      content: 0,
    });
  });

  test('cadence keeps running job blocking when DB proof is absent', () => {
    const latest = buildLocalSmokeRunReport({
      plan: buildLocalSmokePlan({ generatedAt: '2026-05-28T10:10:00.000Z' }),
      baseline: null,
      crawlResult: {
        startedAt: '2026-05-28T10:10:00.000Z',
        finishedAt: '2026-05-28T10:13:00.000Z',
        exitCode: 0,
        timedOut: false,
        stdout: '{"status":"ok"}',
        stderr: '{"watchFinal":{"stoppedReason":"timeout","minFetches":1,"minFetchesMet":false,"jobs":{"counts":{"total":1,"running":1,"completed":0,"failed":0,"terminal":0,"statuses":{"running":1}},"items":[{"id":"job-1","operationName":"basicArticleCrawl","status":"running"}]}}}',
      },
      verification: buildMonitoredSmallCrawlReport({
        options: {
          generatedAt: '2026-05-28T10:13:00.000Z',
          since: '2026-05-28T10:10:00.000Z',
          until: '2026-05-28T10:13:00.000Z',
          hosts: 'bbc.com',
          expectedMinDownloads: 1,
        },
        baselineSnapshot: snapshot({ totals: { urls: 100, responses: 50, successResponses: 40, content: 38 } }),
        postSnapshot: snapshot({ totals: { urls: 101, responses: 50, successResponses: 40, content: 38 } }),
        recentEvidence: recentEvidence({ downloads: 0, success: 0, hosts: [] }),
        samples: [],
      }),
    });

    const cadence = buildMonitoredSmallCrawlCadence({ reports: [latest] });

    expect(cadence.cadence.latestPassed).toBe(false);
    expect(cadence.cadence.jobCaveats).toContain('running-job-blocking-without-db-proof');
    expect(cadence.diagnostics).toEqual(expect.arrayContaining([
      'latest-local-job-still-running-at-watch-end',
      'latest-watch-min-fetches-not-met',
    ]));
    expect(cadence.blockers).toEqual(expect.arrayContaining([
      'expected-download-count-not-met',
      'missing-stable-evidence:db-persistence-or-recent-download-evidence',
    ]));
  });

  test('CLI compare accepts repeated report paths and writes bounded JSON', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'monitored-small-crawl-'));
    const reportPath = path.join(tmp, 'report.json');
    const outPath = path.join(tmp, 'comparison.json');
    const report = buildMonitoredSmallCrawlReport({
      options: {
        generatedAt: '2026-05-28T10:00:00.000Z',
        since: '2026-05-28T09:59:00.000Z',
        until: '2026-05-28T10:00:00.000Z',
        hosts: 'bbc.com',
      },
      postSnapshot: snapshot(),
      recentEvidence: recentEvidence({ downloads: 1, success: 1 }),
      samples: [{ url: 'https://www.bbc.com/news/ok', http_status: 200, fetched_at: '2026-05-28T09:59:30.000Z' }],
    });
    fs.writeFileSync(reportPath, JSON.stringify(report));
    const writes = [];
    const originalLog = console.log;
    console.log = (value) => writes.push(String(value));
    try {
      expect(parseArgs(['compare', '--report', reportPath, '--report', reportPath]).report).toEqual([reportPath, reportPath]);
      expect(runCli(['compare', '--report', reportPath, '--report', reportPath, '--out', outPath, '--json'])).toBe(0);
    } finally {
      console.log = originalLog;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    const payload = JSON.parse(writes.join('\n'));
    expect(payload.mode).toBe('monitored-small-crawl-comparison');
    expect(payload.reportCount).toBe(2);
    expect(JSON.stringify(payload)).not.toContain('stdoutPreview');
  });

  test('CLI cadence accepts saved reports and writes bounded JSON', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'monitored-small-crawl-'));
    const reportPath = path.join(tmp, 'report.json');
    const outPath = path.join(tmp, 'cadence.json');
    const report = buildMonitoredSmallCrawlReport({
      options: {
        generatedAt: '2026-05-28T10:00:00.000Z',
        since: '2026-05-28T09:59:00.000Z',
        until: '2026-05-28T10:00:00.000Z',
        hosts: 'bbc.com',
      },
      postSnapshot: snapshot(),
      recentEvidence: recentEvidence({ downloads: 1, success: 1 }),
      samples: [{ url: 'https://www.bbc.com/news/ok', http_status: 200, fetched_at: '2026-05-28T09:59:30.000Z' }],
    });
    fs.writeFileSync(reportPath, JSON.stringify(report));
    const writes = [];
    const originalLog = console.log;
    console.log = (value) => writes.push(String(value));
    try {
      expect(runCli(['cadence', '--report', reportPath, '--out', outPath, '--json'])).toBe(0);
      expect(JSON.parse(fs.readFileSync(outPath, 'utf8')).mode).toBe('monitored-small-crawl-cadence');
    } finally {
      console.log = originalLog;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    const payload = JSON.parse(writes.join('\n'));
    expect(payload.mode).toBe('monitored-small-crawl-cadence');
    expect(payload.cadence.latestPassed).toBe(true);
    expect(JSON.stringify(payload)).not.toContain('stdoutPreview');
  });

  test('baseline artifact and bounded JSON reader reject oversized evidence', () => {
    const baseline = buildBaselineArtifact(snapshot(), {
      generatedAt: '2026-05-28T10:00:00.000Z',
      hosts: 'bbc.com',
    });
    expect(baseline.mode).toBe('monitored-small-crawl-baseline');
    expect(baseline.actionPolicy.writesLocalDb).toBe(false);

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'monitored-small-crawl-'));
    const tooLarge = path.join(tmp, 'large.json');
    fs.writeFileSync(tooLarge, `${' '.repeat(70 * 1024)}{}`);
    try {
      expect(() => readBoundedJson(tooLarge, 'test evidence')).toThrow('max is');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('CLI policy and launcher registry stay non-mutating', () => {
    expect(resolveToolSpec('monitored').key).toBe('monitored-small-crawl');

    const writes = [];
    const originalLog = console.log;
    console.log = (value) => writes.push(String(value));
    try {
      expect(runCli(['policy', '--json'])).toBe(0);
    } finally {
      console.log = originalLog;
    }
    const payload = JSON.parse(writes.join('\n'));
    expect(payload.mode).toBe('monitored-small-crawl-policy');
    expect(payload.sequence.join(' ')).toContain('verify');
  });

  test('CLI local-smoke defaults to plan-only JSON', () => {
    const writes = [];
    const originalLog = console.log;
    console.log = (value) => writes.push(String(value));
    try {
      expect(runCli(['local-smoke', '--json', '--generated-at', '2026-05-28T10:00:00.000Z'])).toBe(0);
    } finally {
      console.log = originalLog;
    }
    const payload = JSON.parse(writes.join('\n'));
    expect(payload.mode).toBe('monitored-small-crawl-local-smoke-plan');
    expect(payload.actionPolicy.startsCrawler).toBe(false);
    expect(payload.actionPolicy.writesLocalDbWhenExecuted).toBe(true);
  });
});
