'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildCrawlPacketComparison,
  buildPacketCadenceComparison,
  buildCrawlReliabilityPacket,
  normalizePacketOptions,
  renderCrawlReliabilityPacketText,
  buildPacketComparisonCard,
  renderPacketComparisonCardText,
  renderPacketComparisonCardHtml,
  summarizeTargetFreshnessRows,
} = require('../../../tools/crawl/lib/crawl-packet');
const { parseArgs, runCli } = require('../../../tools/crawl/crawl-packet');
const {
  buildLocalSmokePlan,
  buildLocalSmokeRunReport,
  buildMonitoredSmallCrawlReport,
} = require('../../../tools/crawl/lib/monitored-small-crawl');

function snapshot(overrides = {}) {
  return {
    available: true,
    capturedAt: '2026-05-29T10:00:00.000Z',
    latestFetchedAt: '2026-05-29 09:59:00',
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
    downloads: 1,
    success: 1,
    failed: 0,
    bytes: 4096,
    distinctHosts: 1,
    hosts: [{
      host: 'www.bbc.com',
      downloads: 1,
      success: 1,
      failed: 0,
      bytes: 4096,
      firstFetchedAt: '2026-05-29 10:00:30',
      lastFetchedAt: '2026-05-29 10:00:30',
    }],
    statuses: [{ status: 200, count: 1 }],
    ...overrides,
  };
}

function passingLocalSmokeReport() {
  const verification = buildMonitoredSmallCrawlReport({
    options: {
      generatedAt: '2026-05-29T10:01:00.000Z',
      since: '2026-05-29T10:00:00.000Z',
      until: '2026-05-29T10:01:00.000Z',
      hosts: 'bbc.com',
      expectedMinDownloads: 1,
    },
    baselineSnapshot: snapshot({ totals: { urls: 100, responses: 50, successResponses: 40, content: 38 } }),
    postSnapshot: snapshot({ totals: { urls: 101, responses: 51, successResponses: 41, content: 39 } }),
    recentEvidence: recentEvidence(),
    samples: [{ url: 'https://www.bbc.com/news/ok', http_status: 200, fetched_at: '2026-05-29T10:00:30.000Z' }],
  });
  return buildLocalSmokeRunReport({
    plan: buildLocalSmokePlan({ generatedAt: '2026-05-29T10:00:00.000Z' }),
    baseline: null,
    crawlResult: {
      startedAt: '2026-05-29T10:00:00.000Z',
      finishedAt: '2026-05-29T10:01:00.000Z',
      exitCode: 0,
      timedOut: false,
      stdout: '{"ok":true}',
      stderr: '',
    },
    verification,
  });
}

describe('crawl reliability packet', () => {
  test('builds a no-contact tiny local packet with launch, watch, DB proof, and safety policy', () => {
    const packet = buildCrawlReliabilityPacket({
      crawlClass: 'tiny-local',
      generatedAt: '2026-05-29T10:00:00.000Z',
      db: 'data/news.db',
    });

    expect(packet.mode).toBe('crawl-reliability-packet');
    expect(packet.intent).toMatchObject({
      crawlClass: 'tiny-local',
      profile: 'local-tiny-monitored-smoke',
      mode: 'local',
    });
    expect(packet.preflight.noContact).toBe(true);
    expect(packet.launch.startsCrawlerNow).toBe(false);
    expect(packet.launch.command.display).toContain('monitored-small-crawl.js local-smoke --execute');
    expect(packet.watch).toMatchObject({ required: true, minFetches: 1 });
    expect(packet.dbProof.verify.display).toContain('monitored-small-crawl.js verify');
    expect(packet.queueDeploy.remoteContactAllowed).toBe(false);
    expect(packet.actionPolicy).toMatchObject({
      startsCrawler: false,
      contactsRemoteCrawler: false,
      writesLocalDb: false,
      writesLocalDbWhenExecuted: true,
      prunesRemote: false,
      seedsRemote: false,
    });
    expect(packet.classification).toMatchObject({
      label: 'ready-for-tiny-local',
      primary: 'stale-proof',
    });
    expect(packet.score.categories.find(item => item.id === 'local-smoke-evidence')).toMatchObject({
      status: 'warn',
      points: 1,
    });
    expect(renderCrawlReliabilityPacketText(packet)).toContain('No-action policy');
  });

  test('marks loopback fixture packets as local-target only when executed', () => {
    const packet = buildCrawlReliabilityPacket({
      crawlClass: 'small-local',
      hosts: '127.0.0.1',
      urls: 'http://127.0.0.1:41891/news/fixture-article.html',
    });

    expect(packet.launch).toMatchObject({
      startsCrawlerNow: false,
      contactsInternetTargetsWhenExecuted: false,
      contactsRemoteCrawler: false,
    });
    expect(packet.actionPolicy).toMatchObject({
      contactsInternetTargets: false,
      contactsInternetTargetsWhenExecuted: false,
      writesLocalDbWhenExecuted: true,
    });
  });

  test('fixture presets infer loopback targets and fixture server preflight', () => {
    const packet = buildCrawlReliabilityPacket({
      fixturePreset: 'small',
      fixturePort: 41901,
      fixtureTargetToken: 'proof-001',
      generatedAt: '2026-05-29T10:02:00.000Z',
    });

    expect(packet.intent).toMatchObject({
      crawlClass: 'small-local',
      fixturePreset: 'small',
      hosts: ['127.0.0.1'],
      urls: ['http://127.0.0.1:41901/news/fixture-article-proof-001.html'],
    });
    expect(packet.preflight.fixtureServer).toMatchObject({
      preset: 'small',
      targetToken: 'proof-001',
      port: 41901,
      hosts: ['127.0.0.1'],
    });
    expect(packet.preflight.fixtureServer.startCommand.display)
      .toContain('tools/crawl/local-fixture-server.js --preset small --port 41901');
    expect(packet.preflight.fixtureServer.startCommand.display).toContain('--target-token proof-001');
    expect(packet.launch.contactsInternetTargetsWhenExecuted).toBe(false);
    expect(packet.actionPolicy).toMatchObject({
      contactsInternetTargetsWhenExecuted: false,
      contactsRemoteCrawler: false,
      writesLocalDbWhenExecuted: true,
    });
  });

  test('uses saved local smoke evidence to unlock a small local packet score', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-packet-'));
    const reportPath = path.join(tmp, 'local-smoke-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(passingLocalSmokeReport()));
    try {
      const packet = buildCrawlReliabilityPacket({
        crawlClass: 'small-local',
        generatedAt: '2026-05-29T10:05:00.000Z',
        localSmokeReport: reportPath,
      });

      expect(packet.intent.hosts).toEqual(['www.bbc.com', 'www.reuters.com']);
      expect(packet.classification.label).toBe('ready-for-small-local');
      expect(packet.classification.taxonomy).toEqual(['ready']);
      expect(packet.score.percent).toBe(100);
      expect(packet.launch.command.env).toMatchObject({
        CRAWL_RUN_SERVER_READY_TIMEOUT_MS: '240000',
      });
      expect(packet.launch.command.display).toContain('tools/crawl/run.js --local');
      expect(packet.launch.command.display).toContain('--watch-min-fetches 1');
      expect(packet.preflight.profileDryRunCommand.display).toBe('node tools/crawl/index.js local-small-reliability --dry-run');
      expect(packet.evidence.comparisonStablePass).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('medium packet enforces the 3-5 host range and records dry-run orchestration proof', () => {
    expect(() => normalizePacketOptions({
      crawlClass: 'medium-local',
      hosts: 'a.com,b.com',
    })).toThrow('medium-local requires 3-5 host');
    expect(() => normalizePacketOptions({
      crawlClass: 'medium-local',
      hosts: 'a.com,b.com,c.com,d.com,e.com,f.com',
    })).toThrow('medium-local requires 3-5 host');

    const packet = buildCrawlReliabilityPacket({
      crawlClass: 'medium-local',
      generatedAt: '2026-05-29T10:10:00.000Z',
    });
    expect(packet.intent.hosts).toEqual(['www.bbc.com', 'www.reuters.com', 'apnews.com']);
    expect(packet.intent.caps).toMatchObject({
      concurrency: 2,
      expectedMinDownloads: 2,
      expectedMinHosts: 3,
    });
    expect(packet.classification.label).toBe('needs-tiny-local-proof');
    expect(packet.preflight.profileDryRunCommand.display).toBe('node tools/crawl/index.js local-medium-reliability --dry-run');
    expect(packet.classification.nextSafestAction).toContain('tiny local monitored smoke');
  });

  test('verification reports can block a packet without blaming the local-smoke prerequisite', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-packet-'));
    const smokePath = path.join(tmp, 'local-smoke-report.json');
    const verifyPath = path.join(tmp, 'verify.json');
    fs.writeFileSync(smokePath, JSON.stringify(passingLocalSmokeReport()));
    fs.writeFileSync(verifyPath, JSON.stringify(buildMonitoredSmallCrawlReport({
      options: {
        generatedAt: '2026-05-29T10:20:00.000Z',
        since: '2026-05-29T10:10:00.000Z',
        until: '2026-05-29T10:20:00.000Z',
        hosts: 'bbc.com,reuters.com',
        expectedMinDownloads: 1,
      },
      baselineSnapshot: snapshot(),
      postSnapshot: snapshot(),
      recentEvidence: recentEvidence({ downloads: 0, success: 0, hosts: [] }),
      samples: [],
    })));
    try {
      const packet = buildCrawlReliabilityPacket({
        crawlClass: 'small-local',
        localSmokeReport: smokePath,
        verificationReport: verifyPath,
      });

      expect(packet.classification.label).toBe('blocked');
      expect(packet.classification.taxonomy).toEqual(expect.arrayContaining(['no-new-data', 'partial-persistence']));
      expect(packet.score.categories.find(item => item.id === 'local-smoke-evidence')).toMatchObject({
        status: 'pass',
      });
      expect(packet.score.categories.find(item => item.id === 'run-db-proof')).toMatchObject({
        status: 'fail',
        points: 0,
      });
      expect(packet.evidence.verificationReadiness).toBe('verification-blocked');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('partial launch reports block a packet even when DB proof is present', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-packet-'));
    const smokePath = path.join(tmp, 'local-smoke-report.json');
    const verifyPath = path.join(tmp, 'verify.json');
    const launchPath = path.join(tmp, 'launch.json');
    fs.writeFileSync(smokePath, JSON.stringify(passingLocalSmokeReport()));
    fs.writeFileSync(verifyPath, JSON.stringify(buildMonitoredSmallCrawlReport({
      options: {
        generatedAt: '2026-05-29T10:40:00.000Z',
        since: '2026-05-29T10:30:00.000Z',
        until: '2026-05-29T10:40:00.000Z',
        hosts: 'bbc.com,reuters.com',
        expectedMinDownloads: 1,
      },
      baselineSnapshot: snapshot({ totals: { urls: 100, responses: 50, successResponses: 40, content: 38 } }),
      postSnapshot: snapshot({ totals: { urls: 101, responses: 51, successResponses: 41, content: 39 } }),
      recentEvidence: recentEvidence({ downloads: 1, success: 1 }),
      samples: [{ url: 'https://www.bbc.com/news/ok', http_status: 200, fetched_at: '2026-05-29T10:35:00.000Z' }],
    })));
    fs.writeFileSync(launchPath, JSON.stringify({
      status: 'partial',
      counts: { total: 2, ok: 1, failed: 1 },
      results: [
        { startUrl: 'https://www.bbc.com/news', ok: true, jobId: 'job-bbc', attempts: 1 },
        { startUrl: 'https://www.reuters.com/world/', ok: false, error: 'request timeout after 15000ms', attempts: 4, retryable: true },
      ],
    }));
    try {
      const packet = buildCrawlReliabilityPacket({
        crawlClass: 'small-local',
        localSmokeReport: smokePath,
        verificationReport: verifyPath,
        launchReport: launchPath,
      });

      expect(packet.classification.label).toBe('blocked');
      expect(packet.classification.taxonomy).toEqual(expect.arrayContaining(['partial-launch', 'runtime-error']));
      expect(packet.classification.blockers).toContain('partial-launch');
      expect(packet.evidence.launchStatus).toBe('partial');
      expect(packet.evidence.launchAccepted).toHaveLength(1);
      expect(packet.evidence.launchFailed).toHaveLength(1);
      expect(packet.score.categories.find(item => item.id === 'run-db-proof')).toMatchObject({
        status: 'pass',
      });
      expect(packet.score.categories.find(item => item.id === 'launch-result')).toMatchObject({
        status: 'fail',
        points: 0,
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('watch logs classify timeout and missing min-fetch proof', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-packet-'));
    const smokePath = path.join(tmp, 'local-smoke-report.json');
    const watchPath = path.join(tmp, 'watch.log');
    fs.writeFileSync(smokePath, JSON.stringify(passingLocalSmokeReport()));
    fs.writeFileSync(watchPath, [
      '{"watchTick":{"totals":{"fetched":0}}}',
      JSON.stringify({
        watchFinal: {
          stoppedReason: 'timeout',
          kind: 'local',
          totals: { fetched: 0, errors: 0, pending: 0, bytes: 0 },
          minFetches: 1,
          minFetchesMet: false,
          jobs: {
            available: false,
            error: 'timeout after 1500ms',
            counts: { total: 0, running: 0, completed: 0, failed: 0, terminal: 0, statuses: {} },
          },
          launchJobs: {
            source: 'launch-report',
            available: true,
            counts: { total: 1, accepted: 1, failed: 0 },
            items: [{ id: 'job-reuters', status: 'accepted', startUrl: 'https://www.reuters.com/world/' }],
          },
          jobPollErrors: 8,
        },
      }),
      '',
    ].join('\n'));
    try {
      const packet = buildCrawlReliabilityPacket({
        crawlClass: 'small-local',
        localSmokeReport: smokePath,
        watchLog: watchPath,
      });

      expect(packet.classification.label).toBe('blocked');
      expect(packet.classification.blockers).toContain('watch-timeout');
      expect(packet.classification.blockers).toContain('job-evidence-unavailable');
      expect(packet.classification.blockers).toContain('accepted-job-unobservable');
      expect(packet.classification.taxonomy).toEqual(expect.arrayContaining(['watch-timeout', 'no-new-data', 'poll-error', 'accepted-job-unobservable']));
      expect(packet.evidence.watchFinal).toMatchObject({
        stoppedReason: 'timeout',
        minFetches: 1,
        minFetchesMet: false,
        jobPollErrors: 8,
        jobs: {
          available: false,
          error: 'timeout after 1500ms',
        },
        launchJobs: {
          counts: { accepted: 1 },
        },
      });
      expect(packet.score.categories.find(item => item.id === 'watch-result')).toMatchObject({
        status: 'fail',
        points: 0,
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('target freshness warnings reduce score and recommend fresh exact URLs', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-packet-'));
    const smokePath = path.join(tmp, 'local-smoke-report.json');
    fs.writeFileSync(smokePath, JSON.stringify(passingLocalSmokeReport()));
    try {
      const freshness = summarizeTargetFreshnessRows([
        {
          url: 'https://www.bbc.com/news',
          host: 'www.bbc.com',
          hasUrlRow: true,
          hasResponse: true,
          httpStatus: 200,
          latestFetchedAt: new Date().toISOString(),
          historyCount: 2,
        },
        {
          url: 'https://www.reuters.com/world/',
          host: 'www.reuters.com',
          hasUrlRow: false,
          hasResponse: false,
          latestFetchedAt: null,
          historyCount: 0,
        },
      ]);
      const packet = buildCrawlReliabilityPacket({
        crawlClass: 'small-local',
        localSmokeReport: smokePath,
        targetFreshnessReport: freshness,
      });

      expect(packet.classification.label).toBe('ready-for-small-local');
      expect(packet.classification.taxonomy).toContain('target-already-processed');
      expect(packet.classification.warnings.join('\n')).toContain('already have local DB response evidence');
      expect(packet.classification.nextSafestAction).toContain('fresh exact target URL');
      expect(packet.evidence.targetFreshness).toMatchObject({
        available: true,
        checkedUrls: 2,
        likelyAlreadyProcessed: 1,
      });
      expect(packet.score.categories.find(item => item.id === 'target-freshness')).toMatchObject({
        status: 'warn',
        points: 1,
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('successful run packets warn on weak content proof and intermittent job polling', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-packet-'));
    const smokePath = path.join(tmp, 'local-smoke-report.json');
    const verifyPath = path.join(tmp, 'verify.json');
    const watchPath = path.join(tmp, 'watch.log');
    fs.writeFileSync(smokePath, JSON.stringify(passingLocalSmokeReport()));
    fs.writeFileSync(verifyPath, JSON.stringify(buildMonitoredSmallCrawlReport({
      options: {
        generatedAt: '2026-05-29T11:20:00.000Z',
        since: '2026-05-29T11:10:00.000Z',
        until: '2026-05-29T11:20:00.000Z',
        hosts: 'www.reuters.com',
        expectedMinDownloads: 1,
      },
      baselineSnapshot: snapshot({ totals: { urls: 100, responses: 50, successResponses: 40, content: 38 } }),
      postSnapshot: snapshot({ totals: { urls: 100, responses: 51, successResponses: 41, content: 39 } }),
      recentEvidence: recentEvidence({
        downloads: 1,
        success: 1,
        bytes: 0,
        hosts: [{ host: 'www.reuters.com', downloads: 1, success: 1, failed: 0, bytes: 0 }],
      }),
      samples: [{ url: 'https://www.reuters.com/robots.txt', http_status: 200, bytes_downloaded: 0, fetched_at: '2026-05-29T11:15:00.000Z' }],
    })));
    fs.writeFileSync(watchPath, `${JSON.stringify({
      watchFinal: {
        stoppedReason: 'min-fetches-met',
        kind: 'local',
        totals: { fetched: 1, errors: 0, pending: 0, bytes: 0 },
        minFetches: 1,
        minFetchesMet: true,
        jobPollErrors: 3,
        jobs: {
          available: true,
          error: null,
          counts: { total: 1, running: 1, completed: 0, failed: 0, terminal: 0, statuses: { running: 1 } },
        },
        terminalWait: {
          enabled: true,
          timeoutSec: 15,
          startedAt: '2026-05-29T11:15:00.000Z',
          finishedAt: '2026-05-29T11:15:15.000Z',
          elapsedMs: 15000,
          outcome: 'timed-out',
          reason: 'accepted-local-jobs-still-non-terminal-after-db-proof',
        },
        perTarget: [{
          index: 1,
          host: 'www.reuters.com',
          launchOk: true,
          jobId: 'job-1',
          jobStatus: 'running',
          jobObserved: true,
          jobTerminal: false,
          terminalState: 'still-running',
          dbDownloads: 1,
          dbSuccess: 1,
          dbContentDelta: 1,
          dbProofMet: true,
          warnings: ['job-still-running-after-db-proof'],
        }],
      },
    })}\n`);
    try {
      const packet = buildCrawlReliabilityPacket({
        crawlClass: 'small-local',
        hosts: 'www.reuters.com',
        urls: 'https://www.reuters.com/world/',
        localSmokeReport: smokePath,
        verificationReport: verifyPath,
        watchLog: watchPath,
      });

      expect(packet.classification.label).toBe('ready-for-small-local');
      expect(packet.classification.taxonomy).toEqual(expect.arrayContaining([
        'weak-content-proof',
        'poll-error',
        'job-still-running-after-db-proof',
        'job-terminal-wait-after-db-proof-incomplete',
        'job-terminal-wait-timed-out',
      ]));
      expect(packet.classification.taxonomy).not.toContain('job-terminal-wait-endpoint-unavailable');
      expect(packet.classification.warnings.join('\n')).toContain('weak content evidence');
      expect(packet.classification.warnings.join('\n')).toContain('poll error(s)');
      expect(packet.classification.warnings.join('\n')).toContain('still non-terminal');
      expect(packet.classification.warnings.join('\n')).toContain('optional terminal wait after DB proof ended as timed-out');
      expect(packet.evidence.watchFinal.perTarget[0]).toMatchObject({
        jobStatus: 'running',
        jobTerminal: false,
        dbProofMet: true,
      });
      expect(packet.evidence.watchFinal.terminalWait).toMatchObject({
        enabled: true,
        outcome: 'timed-out',
      });
      expect(packet.score.categories.find(item => item.id === 'content-quality')).toMatchObject({
        status: 'warn',
        points: 1,
      });
      expect(packet.score.categories.find(item => item.id === 'watch-result')).toMatchObject({
        status: 'warn',
        points: 2,
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('terminal-wait endpoint-unavailable is classified distinctly and preserves poll evidence', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-packet-'));
    const smokePath = path.join(tmp, 'local-smoke-report.json');
    const verifyPath = path.join(tmp, 'verify.json');
    const watchPath = path.join(tmp, 'watch.log');
    fs.writeFileSync(smokePath, JSON.stringify(passingLocalSmokeReport()));
    fs.writeFileSync(verifyPath, JSON.stringify(buildMonitoredSmallCrawlReport({
      options: {
        generatedAt: '2026-05-29T11:20:00.000Z',
        since: '2026-05-29T11:10:00.000Z',
        until: '2026-05-29T11:20:00.000Z',
        hosts: 'www.reuters.com',
        expectedMinDownloads: 1,
      },
      baselineSnapshot: snapshot({ totals: { urls: 100, responses: 50, successResponses: 40, content: 38 } }),
      postSnapshot: snapshot({ totals: { urls: 103, responses: 53, successResponses: 43, content: 41 } }),
      recentEvidence: recentEvidence({
        downloads: 3,
        success: 3,
        bytes: 4096,
        hosts: [{ host: 'www.reuters.com', downloads: 3, success: 3, failed: 0, bytes: 4096 }],
      }),
      samples: [{ url: 'https://www.reuters.com/world/', http_status: 200, bytes_downloaded: 4096, fetched_at: '2026-05-29T11:15:00.000Z' }],
    })));
    fs.writeFileSync(watchPath, `${JSON.stringify({
      watchFinal: {
        stoppedReason: 'min-fetches-met-terminal-wait-timeout',
        kind: 'local',
        totals: { fetched: 3, errors: 0, pending: 0, bytes: 4096 },
        minFetches: 1,
        minFetchesMet: true,
        jobPollErrors: 4,
        jobs: { available: false, error: 'timeout after 5000ms', counts: null },
        terminalWait: {
          enabled: true,
          timeoutSec: 15,
          jobPollTimeoutMs: 5000,
          startedAt: '2026-05-29T11:15:00.000Z',
          finishedAt: '2026-05-29T11:15:15.000Z',
          elapsedMs: 15000,
          jobPolls: 7,
          jobPollErrors: 7,
          endpointResponded: false,
          outcome: 'endpoint-unavailable',
          reason: 'job-endpoint-unavailable-after-db-proof',
        },
      },
    })}\n`);
    try {
      const packet = buildCrawlReliabilityPacket({
        crawlClass: 'small-local',
        hosts: 'www.reuters.com',
        urls: 'https://www.reuters.com/world/',
        localSmokeReport: smokePath,
        verificationReport: verifyPath,
        watchLog: watchPath,
      });

      expect(packet.classification.taxonomy).toEqual(expect.arrayContaining([
        'job-terminal-wait-after-db-proof-incomplete',
        'job-terminal-wait-endpoint-unavailable',
      ]));
      expect(packet.classification.taxonomy).not.toContain('job-terminal-wait-timed-out');
      expect(packet.classification.warnings.join('\n')).toContain('optional terminal wait after DB proof ended as endpoint-unavailable');
      expect(packet.evidence.watchFinal.terminalWait).toMatchObject({
        enabled: true,
        outcome: 'endpoint-unavailable',
        jobPollTimeoutMs: 5000,
        jobPolls: 7,
        jobPollErrors: 7,
        endpointResponded: false,
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('composed incomplete terminal wait derives sub-taxonomy from homogeneous non-terminal counts', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-packet-'));
    const smokePath = path.join(tmp, 'local-smoke-report.json');
    const verifyPath = path.join(tmp, 'verify.json');
    const watchPath = path.join(tmp, 'watch.log');
    fs.writeFileSync(smokePath, JSON.stringify(passingLocalSmokeReport()));
    fs.writeFileSync(verifyPath, JSON.stringify(buildMonitoredSmallCrawlReport({
      options: {
        generatedAt: '2026-05-29T11:20:00.000Z',
        since: '2026-05-29T11:10:00.000Z',
        until: '2026-05-29T11:20:00.000Z',
        hosts: 'www.reuters.com',
        expectedMinDownloads: 1,
      },
      baselineSnapshot: snapshot({ totals: { urls: 100, responses: 50, successResponses: 40, content: 38 } }),
      postSnapshot: snapshot({ totals: { urls: 103, responses: 53, successResponses: 43, content: 41 } }),
      recentEvidence: recentEvidence({
        downloads: 3,
        success: 3,
        bytes: 4096,
        hosts: [{ host: 'www.reuters.com', downloads: 3, success: 3, failed: 0, bytes: 4096 }],
      }),
      samples: [{ url: 'https://www.reuters.com/world/', http_status: 200, bytes_downloaded: 4096, fetched_at: '2026-05-29T11:15:00.000Z' }],
    })));
    fs.writeFileSync(watchPath, `${JSON.stringify({
      watchFinal: {
        stoppedReason: 'min-fetches-and-hosts-met',
        kind: 'local',
        totals: { fetched: 3, errors: 0, pending: 0, bytes: 4096 },
        minFetches: 1,
        minFetchesMet: true,
        jobPollErrors: 8,
        jobs: { available: false, error: 'timeout after 5000ms', counts: null },
        terminalWait: {
          enabled: true,
          timeoutSec: 15,
          startedAt: '2026-05-29T11:15:00.000Z',
          finishedAt: '2026-05-29T11:15:42.000Z',
          elapsedMs: 42000,
          outcome: 'incomplete',
          reason: 'one-or-more-sequential-host-jobs-non-terminal-after-db-proof',
          counts: { 'endpoint-unavailable': 2, terminal: 1 },
        },
      },
    })}\n`);
    try {
      const packet = buildCrawlReliabilityPacket({
        crawlClass: 'small-local',
        hosts: 'www.reuters.com',
        urls: 'https://www.reuters.com/world/',
        localSmokeReport: smokePath,
        verificationReport: verifyPath,
        watchLog: watchPath,
      });

      expect(packet.classification.taxonomy).toEqual(expect.arrayContaining([
        'job-terminal-wait-after-db-proof-incomplete',
        'job-terminal-wait-endpoint-unavailable',
      ]));
      expect(packet.classification.taxonomy).not.toContain('job-terminal-wait-timed-out');
      expect(packet.classification.warnings.join('\n')).toContain('optional terminal wait after DB proof ended as incomplete');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('composed incomplete terminal wait with mixed non-terminal counts stays umbrella-only', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-packet-'));
    const smokePath = path.join(tmp, 'local-smoke-report.json');
    const verifyPath = path.join(tmp, 'verify.json');
    const watchPath = path.join(tmp, 'watch.log');
    fs.writeFileSync(smokePath, JSON.stringify(passingLocalSmokeReport()));
    fs.writeFileSync(verifyPath, JSON.stringify(buildMonitoredSmallCrawlReport({
      options: {
        generatedAt: '2026-05-29T11:20:00.000Z',
        since: '2026-05-29T11:10:00.000Z',
        until: '2026-05-29T11:20:00.000Z',
        hosts: 'www.reuters.com',
        expectedMinDownloads: 1,
      },
      baselineSnapshot: snapshot({ totals: { urls: 100, responses: 50, successResponses: 40, content: 38 } }),
      postSnapshot: snapshot({ totals: { urls: 103, responses: 53, successResponses: 43, content: 41 } }),
      recentEvidence: recentEvidence({
        downloads: 3,
        success: 3,
        bytes: 4096,
        hosts: [{ host: 'www.reuters.com', downloads: 3, success: 3, failed: 0, bytes: 4096 }],
      }),
      samples: [{ url: 'https://www.reuters.com/world/', http_status: 200, bytes_downloaded: 4096, fetched_at: '2026-05-29T11:15:00.000Z' }],
    })));
    fs.writeFileSync(watchPath, `${JSON.stringify({
      watchFinal: {
        stoppedReason: 'min-fetches-and-hosts-met',
        kind: 'local',
        totals: { fetched: 3, errors: 0, pending: 0, bytes: 4096 },
        minFetches: 1,
        minFetchesMet: true,
        jobPollErrors: 5,
        jobs: { available: false, error: 'timeout after 5000ms', counts: null },
        terminalWait: {
          enabled: true,
          timeoutSec: 15,
          startedAt: '2026-05-29T11:15:00.000Z',
          finishedAt: '2026-05-29T11:15:40.000Z',
          elapsedMs: 40000,
          outcome: 'incomplete',
          reason: 'one-or-more-sequential-host-jobs-non-terminal-after-db-proof',
          counts: { 'endpoint-unavailable': 1, 'timed-out': 1, terminal: 1 },
        },
      },
    })}\n`);
    try {
      const packet = buildCrawlReliabilityPacket({
        crawlClass: 'small-local',
        hosts: 'www.reuters.com',
        urls: 'https://www.reuters.com/world/',
        localSmokeReport: smokePath,
        verificationReport: verifyPath,
        watchLog: watchPath,
      });

      expect(packet.classification.taxonomy).toContain('job-terminal-wait-after-db-proof-incomplete');
      expect(packet.classification.taxonomy).not.toContain('job-terminal-wait-endpoint-unavailable');
      expect(packet.classification.taxonomy).not.toContain('job-terminal-wait-timed-out');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('medium fixture packet carries host-level proof and warns on zero content delta', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-packet-'));
    const smokePath = path.join(tmp, 'local-smoke-report.json');
    const verifyPath = path.join(tmp, 'verify.json');
    const launchPath = path.join(tmp, 'launch.json');
    const watchPath = path.join(tmp, 'watch.log');
    fs.writeFileSync(smokePath, JSON.stringify(passingLocalSmokeReport()));
    fs.writeFileSync(verifyPath, JSON.stringify(buildMonitoredSmallCrawlReport({
      options: {
        generatedAt: '2026-05-29T12:20:00.000Z',
        since: '2026-05-29T12:10:00.000Z',
        until: '2026-05-29T12:20:00.000Z',
        hosts: '127.0.0.1,127.0.0.2,127.0.0.3',
        expectedMinDownloads: 2,
      },
      baselineSnapshot: snapshot({ totals: { urls: 100, responses: 50, successResponses: 40, content: 38 } }),
      postSnapshot: snapshot({ totals: { urls: 103, responses: 53, successResponses: 43, content: 38 } }),
      recentEvidence: recentEvidence({
        downloads: 3,
        success: 3,
        failed: 0,
        bytes: 1800,
        distinctHosts: 3,
        hosts: [
          { host: '127.0.0.1', downloads: 1, success: 1, failed: 0, bytes: 600 },
          { host: '127.0.0.2', downloads: 1, success: 1, failed: 0, bytes: 600 },
          { host: '127.0.0.3', downloads: 1, success: 1, failed: 0, bytes: 600 },
        ],
      }),
      samples: [
        { url: 'http://127.0.0.1:41902/news/medium-a.html', http_status: 200, bytes_downloaded: 600, fetched_at: '2026-05-29T12:11:00.000Z' },
        { url: 'http://127.0.0.2:41902/news/medium-b.html', http_status: 200, bytes_downloaded: 600, fetched_at: '2026-05-29T12:12:00.000Z' },
        { url: 'http://127.0.0.3:41902/news/medium-c.html', http_status: 200, bytes_downloaded: 600, fetched_at: '2026-05-29T12:13:00.000Z' },
      ],
    })));
    fs.writeFileSync(launchPath, JSON.stringify({
      status: 'ok',
      counts: { total: 3, ok: 3, failed: 0 },
      results: [
        { startUrl: 'http://127.0.0.1:41902/news/medium-a.html', ok: true, jobId: 'job-a', attempts: 1 },
        { startUrl: 'http://127.0.0.2:41902/news/medium-b.html', ok: true, jobId: 'job-b', attempts: 1 },
        { startUrl: 'http://127.0.0.3:41902/news/medium-c.html', ok: true, jobId: 'job-c', attempts: 1 },
      ],
    }));
    fs.writeFileSync(watchPath, `${JSON.stringify({
      watchFinal: {
        stoppedReason: 'min-fetches-met',
        kind: 'local',
        totals: { fetched: 3, errors: 0, pending: 0, bytes: 1800 },
        minFetches: 2,
        minFetchesMet: true,
        jobPollErrors: 0,
        launchJobs: {
          source: 'launch-report',
          available: true,
          counts: { total: 3, accepted: 3, failed: 0 },
          items: [
            { id: 'job-a', status: 'accepted', startUrl: 'http://127.0.0.1:41902/news/medium-a.html' },
            { id: 'job-b', status: 'accepted', startUrl: 'http://127.0.0.2:41902/news/medium-b.html' },
            { id: 'job-c', status: 'accepted', startUrl: 'http://127.0.0.3:41902/news/medium-c.html' },
          ],
        },
      },
    })}\n`);
    try {
      const packet = buildCrawlReliabilityPacket({
        fixturePreset: 'medium',
        fixturePort: 41902,
        localSmokeReport: smokePath,
        verificationReport: verifyPath,
        launchReport: launchPath,
        watchLog: watchPath,
      });

      expect(packet.classification.label).toBe('ready-for-medium-local');
      expect(packet.classification.taxonomy).toContain('weak-content-proof');
      expect(packet.score.categories.find(item => item.id === 'content-quality')).toMatchObject({
        status: 'warn',
      });
      expect(packet.evidence.hostProof).toHaveLength(3);
      expect(packet.evidence.hostProof[0]).toMatchObject({
        host: '127.0.0.1',
        launch: { accepted: 1, failed: 0, attempts: 1 },
        watch: { launchJobs: 1 },
        db: { downloads: 1, success: 1, failed: 0, bytes: 600 },
      });
      expect(packet.evidence.hostProof[1].samples[0].url).toContain('127.0.0.2');
      expect(packet.launch.command.display).toContain('--watch-min-hosts 3');
      expect(packet.launch.command.display).toContain('--batch-retries 0');
      expect(packet.launch.command.display).toContain('--batch-request-timeout-ms 60000');
      expect(packet.watch).toMatchObject({
        minFetches: 2,
        minHosts: 3,
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('medium packets warn when DB proof is missing requested host coverage', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-packet-'));
    const smokePath = path.join(tmp, 'local-smoke-report.json');
    const verifyPath = path.join(tmp, 'verify.json');
    fs.writeFileSync(smokePath, JSON.stringify(passingLocalSmokeReport()));
    fs.writeFileSync(verifyPath, JSON.stringify(buildMonitoredSmallCrawlReport({
      options: {
        generatedAt: '2026-05-29T12:40:00.000Z',
        since: '2026-05-29T12:30:00.000Z',
        until: '2026-05-29T12:40:00.000Z',
        hosts: '127.0.0.1,127.0.0.2,127.0.0.3',
        expectedMinDownloads: 2,
      },
      baselineSnapshot: snapshot({ totals: { urls: 100, responses: 50, successResponses: 40, content: 38 } }),
      postSnapshot: snapshot({ totals: { urls: 104, responses: 53, successResponses: 43, content: 39 } }),
      recentEvidence: recentEvidence({
        downloads: 3,
        success: 3,
        failed: 0,
        bytes: 2100,
        distinctHosts: 1,
        hosts: [
          { host: '127.0.0.2', downloads: 3, success: 3, failed: 0, bytes: 2100 },
        ],
      }),
      samples: [
        { url: 'http://127.0.0.2:41902/news/medium-b.html', http_status: 200, bytes_downloaded: 700, fetched_at: '2026-05-29T12:35:00.000Z' },
      ],
    })));
    try {
      const packet = buildCrawlReliabilityPacket({
        fixturePreset: 'medium',
        fixturePort: 41902,
        localSmokeReport: smokePath,
        verificationReport: verifyPath,
      });

      expect(packet.classification.label).toBe('host-partial-medium-local');
      expect(packet.classification.taxonomy).toContain('host-mismatch');
      expect(packet.classification.warnings.join('\n')).toContain('missing recent evidence for requested host');
      expect(packet.classification.nextSafestAction).toContain('per-host watch coverage');
      expect(packet.score.categories.find(item => item.id === 'host-coverage')).toMatchObject({
        status: 'warn',
        points: 1,
      });
      expect(packet.evidence.hostProof.map(item => item.db.success)).toEqual([0, 3, 0]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('watch final host coverage failures block packets with host-mismatch taxonomy', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-packet-'));
    const smokePath = path.join(tmp, 'local-smoke-report.json');
    const verifyPath = path.join(tmp, 'verify.json');
    const watchPath = path.join(tmp, 'watch.log');
    fs.writeFileSync(smokePath, JSON.stringify(passingLocalSmokeReport()));
    fs.writeFileSync(verifyPath, JSON.stringify(buildMonitoredSmallCrawlReport({
      options: {
        generatedAt: '2026-05-29T13:20:00.000Z',
        since: '2026-05-29T13:10:00.000Z',
        until: '2026-05-29T13:20:00.000Z',
        hosts: '127.0.0.1,127.0.0.2,127.0.0.3',
        expectedMinDownloads: 2,
      },
      baselineSnapshot: snapshot({ totals: { urls: 100, responses: 50, successResponses: 40, content: 38 } }),
      postSnapshot: snapshot({ totals: { urls: 103, responses: 53, successResponses: 43, content: 39 } }),
      recentEvidence: recentEvidence({
        downloads: 3,
        success: 3,
        failed: 0,
        bytes: 1800,
        distinctHosts: 1,
        hosts: [{ host: '127.0.0.2', downloads: 3, success: 3, failed: 0, bytes: 1800 }],
      }),
      samples: [
        { url: 'http://127.0.0.2:41902/news/medium-b.html', http_status: 200, bytes_downloaded: 600, fetched_at: '2026-05-29T13:12:00.000Z' },
      ],
    })));
    fs.writeFileSync(watchPath, `${JSON.stringify({
      watchFinal: {
        stoppedReason: 'local-host-coverage-not-met',
        kind: 'local',
        totals: { fetched: 3, errors: 0, pending: 0, bytes: 1800 },
        minFetches: 2,
        minFetchesMet: true,
        minHosts: 3,
        minHostsMet: false,
        coveredHosts: ['127.0.0.2'],
        missingLocalTargets: ['127.0.0.1', '127.0.0.3'],
        jobPollErrors: 0,
      },
    })}\n`);
    try {
      const packet = buildCrawlReliabilityPacket({
        fixturePreset: 'medium',
        fixturePort: 41902,
        localSmokeReport: smokePath,
        verificationReport: verifyPath,
        watchLog: watchPath,
      });

      expect(packet.classification.label).toBe('blocked');
      expect(packet.classification.blockers).toContain('watch-host-coverage-not-met');
      expect(packet.classification.taxonomy).toContain('host-mismatch');
      expect(packet.evidence.watchFinal).toMatchObject({
        minHosts: 3,
        minHostsMet: false,
        coveredHosts: ['127.0.0.2'],
        missingLocalTargets: ['127.0.0.1', '127.0.0.3'],
      });
      expect(packet.score.categories.find(item => item.id === 'watch-result')).toMatchObject({
        status: 'fail',
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('medium fixture packet includes a sequential per-host fallback strategy', () => {
    const packet = buildCrawlReliabilityPacket({
      fixturePreset: 'medium',
      fixturePort: 41902,
      fixtureTargetToken: 'seq-proof',
      localSmokeReport: null,
      targetFreshness: false,
    });

    expect(packet.preflight.sequentialStrategy).toMatchObject({
      mode: 'sequential-per-host-medium-fixture',
      noContact: true,
      requiresFixtureServer: true,
    });
    expect(packet.preflight.sequentialStrategy.steps).toHaveLength(3);
    expect(packet.preflight.sequentialStrategy.steps[0]).toMatchObject({
      host: '127.0.0.1',
      expected: { minDownloads: 1, minHosts: 1 },
    });
    expect(packet.preflight.sequentialStrategy.steps[0].launch.display)
      .toContain('--watch-min-hosts 1');
    expect(packet.preflight.sequentialStrategy.helper.planCommand.display)
      .toContain('tools/crawl/sequential-fixture-proof.js plan');
    expect(packet.preflight.sequentialStrategy.helper.terminalWaitExecuteCommand.display)
      .toContain('--wait-for-terminal');
    expect(packet.preflight.sequentialStrategy.compose.packetCommand.display)
      .toContain('--launch-report tmp/medium-sequential-seq-proof-launch.summary.json');
  });

  test('packet comparison summarizes concurrent versus sequential host coverage', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-packet-compare-'));
    const concurrentPath = path.join(tmp, 'concurrent.json');
    const sequentialPath = path.join(tmp, 'sequential.json');
    const concurrent = buildCrawlReliabilityPacket({
      fixturePreset: 'medium',
      fixturePort: 41902,
      fixtureTargetToken: 'concurrent',
      targetFreshness: false,
      verificationReport: null,
    });
    const sequential = {
      ...buildCrawlReliabilityPacket({
        fixturePreset: 'medium',
        fixturePort: 41903,
        fixtureTargetToken: 'sequential',
        targetFreshness: false,
        verificationReport: null,
      }),
      classification: {
        label: 'ready-for-medium-local',
        primary: 'ready',
        taxonomy: ['ready'],
        blockers: [],
        warnings: [],
        nextSafestAction: 'prefer sequential proof',
      },
      score: { points: 28, maxPoints: 28, percent: 100, categories: [] },
      evidence: {
        hostProof: [
          { host: '127.0.0.1', launch: { accepted: 1, failed: 0 }, db: { downloads: 1, success: 1 } },
          { host: '127.0.0.2', launch: { accepted: 1, failed: 0 }, db: { downloads: 1, success: 1 } },
          { host: '127.0.0.3', launch: { accepted: 1, failed: 0 }, db: { downloads: 1, success: 1 } },
        ],
      },
    };
    concurrent.classification.blockers = ['partial-launch'];
    concurrent.classification.label = 'blocked';
    concurrent.evidence.hostProof = [
      { host: '127.0.0.1', launch: { accepted: 1, failed: 0 }, db: { downloads: 3, success: 3 } },
      { host: '127.0.0.2', launch: { accepted: 1, failed: 0 }, db: { downloads: 0, success: 0 } },
      { host: '127.0.0.3', launch: { accepted: 0, failed: 1 }, db: { downloads: 0, success: 0 } },
    ];

    try {
      fs.writeFileSync(concurrentPath, JSON.stringify(concurrent));
      fs.writeFileSync(sequentialPath, JSON.stringify(sequential));
      const comparison = buildCrawlPacketComparison({ packet: [concurrentPath, sequentialPath], generatedAt: '2026-05-29T12:00:00Z' });
      expect(comparison.mode).toBe('crawl-packet-comparison');
      expect(comparison.comparison).toMatchObject({
        packetCount: 2,
        passCount: 1,
        blockedCount: 1,
        latestDbHostDeltaFromFirst: 2,
        bestPacket: sequentialPath,
      });
      expect(comparison.packets[0].hostCoverage.dbMissing).toEqual(['127.0.0.2', '127.0.0.3']);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('cadence comparison contrasts a small and a medium packet on score, db delta, host coverage, and taxonomy', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-packet-cadence-'));
    const smallPath = path.join(tmp, 'small.json');
    const mediumPath = path.join(tmp, 'medium.json');
    const small = {
      mode: 'crawl-reliability-packet',
      generatedAt: '2026-05-30T10:00:00.000Z',
      intent: { crawlClass: 'small-local', fixturePreset: 'small', hosts: ['127.0.0.1'] },
      classification: { label: 'ready-for-small-local', primary: 'ready', taxonomy: ['poll-error', 'target-already-processed'], blockers: [], warnings: [] },
      score: { points: 26, maxPoints: 28, percent: 93, categories: [] },
      evidence: {
        hostProof: [
          { host: '127.0.0.1', launch: { accepted: 1, failed: 0 }, db: { downloads: 3, success: 3, content: 1 } },
        ],
      },
    };
    const medium = {
      mode: 'crawl-reliability-packet',
      generatedAt: '2026-05-30T11:00:00.000Z',
      intent: { crawlClass: 'medium-local', fixturePreset: 'medium', hosts: ['127.0.0.1', '127.0.0.2', '127.0.0.3'] },
      classification: { label: 'ready-for-medium-local', primary: 'ready', taxonomy: ['poll-error', 'target-already-processed'], blockers: [], warnings: [] },
      score: { points: 26, maxPoints: 28, percent: 93, categories: [] },
      evidence: {
        hostProof: [
          { host: '127.0.0.1', launch: { accepted: 1, failed: 0 }, db: { downloads: 3, success: 3, content: 1 } },
          { host: '127.0.0.2', launch: { accepted: 1, failed: 0 }, db: { downloads: 3, success: 3, content: 1 } },
          { host: '127.0.0.3', launch: { accepted: 1, failed: 0 }, db: { downloads: 3, success: 3, content: 1 } },
        ],
      },
    };
    try {
      fs.writeFileSync(smallPath, JSON.stringify(small));
      fs.writeFileSync(mediumPath, JSON.stringify(medium));
      const comparison = buildPacketCadenceComparison({ small: smallPath, medium: mediumPath, generatedAt: '2026-05-30T12:00:00Z' });
      expect(comparison.mode).toBe('crawl-packet-cadence-comparison');
      expect(comparison.actionPolicy).toMatchObject({
        readOnlyReport: true,
        startsCrawler: false,
        contactsRemoteCrawler: false,
        contactsInternetTargets: false,
      });
      expect(comparison.small).toMatchObject({
        crawlClass: 'small-local',
        label: 'ready-for-small-local',
        score: { percent: 93 },
        db: { downloads: 3, success: 3, content: 1 },
        hostCoverage: { requested: 1, dbCovered: 1, dbMissing: 0 },
      });
      expect(comparison.medium).toMatchObject({
        crawlClass: 'medium-local',
        score: { percent: 93 },
        db: { downloads: 9, success: 9, content: 3 },
        hostCoverage: { requested: 3, dbCovered: 3, dbMissing: 0 },
      });
      expect(comparison.deltas).toMatchObject({
        scorePercent: 0,
        dbDownloads: 6,
        dbSuccess: 6,
        dbContent: 2,
        hostsRequested: 2,
        hostsDbCovered: 2,
      });
      expect(comparison.taxonomy).toEqual({
        shared: ['poll-error', 'target-already-processed'],
        onlySmall: [],
        onlyMedium: [],
      });
      expect(comparison.cadenceConsistent).toBe(true);
      expect(comparison.diagnostics).toEqual([]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('cadence comparison flags inconsistent score and taxonomy differences', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-packet-cadence-'));
    const smallPath = path.join(tmp, 'small.json');
    const mediumPath = path.join(tmp, 'medium.json');
    const small = {
      mode: 'crawl-reliability-packet',
      intent: { crawlClass: 'small-local', hosts: ['127.0.0.1'] },
      classification: { label: 'ready-for-small-local', taxonomy: ['poll-error'], blockers: [], warnings: [] },
      score: { points: 28, maxPoints: 28, percent: 100, categories: [] },
      evidence: { hostProof: [{ host: '127.0.0.1', db: { downloads: 3, success: 3 } }] },
    };
    const medium = {
      mode: 'crawl-reliability-packet',
      intent: { crawlClass: 'medium-local', hosts: ['127.0.0.1', '127.0.0.2'] },
      classification: { label: 'blocked', taxonomy: ['host-mismatch'], blockers: ['watch-host-coverage-not-met'], warnings: [] },
      score: { points: 20, maxPoints: 28, percent: 71, categories: [] },
      evidence: { hostProof: [{ host: '127.0.0.1', db: { downloads: 3, success: 3 } }] },
    };
    try {
      fs.writeFileSync(smallPath, JSON.stringify(small));
      fs.writeFileSync(mediumPath, JSON.stringify(medium));
      const comparison = buildPacketCadenceComparison({ small: smallPath, medium: mediumPath });
      expect(comparison.deltas.scorePercent).toBe(-29);
      expect(comparison.cadenceConsistent).toBe(false);
      expect(comparison.taxonomy.onlySmall).toEqual(['poll-error']);
      expect(comparison.taxonomy.onlyMedium).toEqual(['host-mismatch']);
      expect(comparison.medium.hostCoverage.dbMissing).toBe(1);
      expect(comparison.diagnostics.some(line => line.includes('score percent differs by -29'))).toBe(true);
      expect(comparison.diagnostics.some(line => line.includes('medium blocked: watch-host-coverage-not-met'))).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('cadence comparison requires both --small and --medium packet paths', () => {
    expect(() => buildPacketCadenceComparison({ medium: 'x.json' })).toThrow(/--small/);
    expect(() => buildPacketCadenceComparison({ small: 'x.json' })).toThrow(/--medium/);
  });

  test('comparison card summarizes both rungs and stays read-only with no-contact policy', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-packet-card-'));
    const smallPath = path.join(tmp, 'small.json');
    const mediumPath = path.join(tmp, 'medium.json');
    fs.writeFileSync(smallPath, JSON.stringify({
      mode: 'crawl-reliability-packet',
      intent: { crawlClass: 'small-local', hosts: ['127.0.0.1'] },
      classification: { label: 'ready-for-small-local', taxonomy: ['target-already-processed'], blockers: [], warnings: [] },
      score: { points: 27, maxPoints: 28, percent: 96, categories: [] },
      evidence: { hostProof: [{ host: '127.0.0.1', db: { downloads: 3, success: 3, content: 0 } }] },
    }));
    fs.writeFileSync(mediumPath, JSON.stringify({
      mode: 'crawl-reliability-packet',
      intent: { crawlClass: 'medium-local', hosts: ['127.0.0.1', '127.0.0.2', '127.0.0.3'] },
      classification: { label: 'ready-for-medium-local', taxonomy: ['poll-error', 'target-already-processed'], blockers: [], warnings: [] },
      score: { points: 26, maxPoints: 28, percent: 93, categories: [] },
      evidence: {
        hostProof: [
          { host: '127.0.0.1', db: { downloads: 3, success: 3, content: 0 } },
          { host: '127.0.0.2', db: { downloads: 3, success: 3, content: 0 } },
          { host: '127.0.0.3', db: { downloads: 3, success: 3, content: 0 } },
        ],
      },
    }));
    try {
      const card = buildPacketComparisonCard({ small: smallPath, medium: mediumPath, generatedAt: '2026-05-30T12:00:00Z' });
      expect(card.mode).toBe('crawl-packet-comparison-card');
      expect(card.actionPolicy).toMatchObject({
        readOnlyReport: true,
        startsCrawler: false,
        contactsRemoteCrawler: false,
        contactsInternetTargets: false,
        writesLocalDb: false,
        mutatesRemoteQueue: false,
      });
      expect(card.rungs.map(r => r.rung)).toEqual(['small', 'medium']);
      expect(card.rungs[0]).toMatchObject({
        scorePercent: 96,
        db: { downloads: 3, success: 3, content: 0 },
        hostCoverage: { requested: 1, dbCovered: 1, dbMissing: 0 },
      });
      expect(card.rungs[1]).toMatchObject({
        scorePercent: 93,
        db: { downloads: 9, success: 9, content: 0 },
        hostCoverage: { requested: 3, dbCovered: 3, dbMissing: 0 },
      });
      expect(card.verdict.cadenceConsistent).toBe(false);
      expect(card.verdict.diagnostics.some(line => line.includes('score percent differs by -3'))).toBe(true);

      const text = renderPacketComparisonCardText(card);
      expect(text).toContain('verdict: DIVERGENT');
      expect(text).toContain('small');
      expect(text).toContain('medium');
      expect(text).toContain('No-action policy');

      const html = renderPacketComparisonCardHtml(card);
      expect(html).toContain('crawl-packet-comparison-card divergent');
      expect(html).toContain('<td class="db">9/9/0</td>');
      expect(html).not.toContain('<script');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('comparison card reads a saved cadence artifact and HTML escapes content', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-packet-card-cadence-'));
    const smallPath = path.join(tmp, 'small.json');
    const mediumPath = path.join(tmp, 'medium.json');
    const cadencePath = path.join(tmp, 'cadence.json');
    fs.writeFileSync(smallPath, JSON.stringify({
      mode: 'crawl-reliability-packet',
      intent: { crawlClass: 'small-local', hosts: ['127.0.0.1'] },
      classification: { label: 'ready-for-small-local', taxonomy: ['<ready>'], blockers: [], warnings: [] },
      score: { points: 26, maxPoints: 28, percent: 93, categories: [] },
      evidence: { hostProof: [{ host: '127.0.0.1', db: { downloads: 3, success: 3 } }] },
    }));
    fs.writeFileSync(mediumPath, JSON.stringify({
      mode: 'crawl-reliability-packet',
      intent: { crawlClass: 'medium-local', hosts: ['127.0.0.1', '127.0.0.2', '127.0.0.3'] },
      classification: { label: 'ready-for-medium-local', taxonomy: ['<ready>'], blockers: [], warnings: [] },
      score: { points: 26, maxPoints: 28, percent: 93, categories: [] },
      evidence: {
        hostProof: [
          { host: '127.0.0.1', db: { downloads: 3, success: 3 } },
          { host: '127.0.0.2', db: { downloads: 3, success: 3 } },
          { host: '127.0.0.3', db: { downloads: 3, success: 3 } },
        ],
      },
    }));
    try {
      const writes = [];
      const originalLog = console.log;
      console.log = (value) => writes.push(String(value));
      try {
        runCli(['cadence', '--small', smallPath, '--medium', mediumPath, '--json', '--out', cadencePath]);
      } finally {
        console.log = originalLog;
      }
      const card = buildPacketComparisonCard({ cadence: cadencePath });
      expect(card.mode).toBe('crawl-packet-comparison-card');
      expect(card.verdict.cadenceConsistent).toBe(true);
      const html = renderPacketComparisonCardHtml(card);
      expect(html).toContain('&lt;ready&gt;');
      expect(html).not.toContain('<td class="taxonomy"><ready></td>');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('comparison card rejects a non-cadence artifact passed via --cadence', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-packet-card-bad-'));
    const badPath = path.join(tmp, 'not-cadence.json');
    fs.writeFileSync(badPath, JSON.stringify({ mode: 'crawl-reliability-packet' }));
    try {
      expect(() => buildPacketComparisonCard({ cadence: badPath })).toThrow(/not a crawl-packet-cadence-comparison/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('CLI card mode renders text and HTML and returns 2 when cadence diverges', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-packet-card-cli-'));
    const smallPath = path.join(tmp, 'small.json');
    const mediumPath = path.join(tmp, 'medium.json');
    const htmlOut = path.join(tmp, 'card.html');
    fs.writeFileSync(smallPath, JSON.stringify({
      mode: 'crawl-reliability-packet',
      intent: { crawlClass: 'small-local', hosts: ['127.0.0.1'] },
      classification: { label: 'ready-for-small-local', taxonomy: ['ready'], blockers: [], warnings: [] },
      score: { points: 28, maxPoints: 28, percent: 100, categories: [] },
      evidence: { hostProof: [{ host: '127.0.0.1', db: { downloads: 3, success: 3 } }] },
    }));
    fs.writeFileSync(mediumPath, JSON.stringify({
      mode: 'crawl-reliability-packet',
      intent: { crawlClass: 'medium-local', hosts: ['127.0.0.1', '127.0.0.2'] },
      classification: { label: 'ready-for-medium-local', taxonomy: ['poll-error'], blockers: [], warnings: [] },
      score: { points: 20, maxPoints: 28, percent: 71, categories: [] },
      evidence: { hostProof: [{ host: '127.0.0.1', db: { downloads: 3, success: 3 } }] },
    }));
    const writes = [];
    const originalLog = console.log;
    console.log = (value) => writes.push(String(value));
    try {
      expect(runCli(['card', '--small', smallPath, '--medium', mediumPath, '--html', '--out', htmlOut])).toBe(2);
      const html = fs.readFileSync(htmlOut, 'utf8');
      expect(html).toContain('crawl-packet-comparison-card divergent');
      expect(html).not.toContain('<script');
      expect(writes.join('\n')).toContain('crawl-packet-comparison-card');
    } finally {
      console.log = originalLog;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('CLI cadence mode writes JSON and returns 0 only when cadence is consistent', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-packet-cadence-cli-'));
    const smallPath = path.join(tmp, 'small.json');
    const mediumPath = path.join(tmp, 'medium.json');
    const outPath = path.join(tmp, 'cadence.json');
    fs.writeFileSync(smallPath, JSON.stringify({
      mode: 'crawl-reliability-packet',
      intent: { crawlClass: 'small-local', hosts: ['127.0.0.1'] },
      classification: { label: 'ready-for-small-local', taxonomy: ['ready'], blockers: [], warnings: [] },
      score: { points: 26, maxPoints: 28, percent: 93, categories: [] },
      evidence: { hostProof: [{ host: '127.0.0.1', db: { downloads: 3, success: 3 } }] },
    }));
    fs.writeFileSync(mediumPath, JSON.stringify({
      mode: 'crawl-reliability-packet',
      intent: { crawlClass: 'medium-local', hosts: ['127.0.0.1', '127.0.0.2', '127.0.0.3'] },
      classification: { label: 'ready-for-medium-local', taxonomy: ['ready'], blockers: [], warnings: [] },
      score: { points: 26, maxPoints: 28, percent: 93, categories: [] },
      evidence: {
        hostProof: [
          { host: '127.0.0.1', db: { downloads: 3, success: 3 } },
          { host: '127.0.0.2', db: { downloads: 3, success: 3 } },
          { host: '127.0.0.3', db: { downloads: 3, success: 3 } },
        ],
      },
    }));
    const writes = [];
    const originalLog = console.log;
    console.log = (value) => writes.push(String(value));
    try {
      expect(runCli(['cadence', '--small', smallPath, '--medium', mediumPath, '--json', '--out', outPath])).toBe(0);
      const written = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      expect(written.mode).toBe('crawl-packet-cadence-comparison');
      expect(written.cadenceConsistent).toBe(true);
      expect(written.deltas.hostsDbCovered).toBe(2);
    } finally {
      console.log = originalLog;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    const payload = JSON.parse(writes.join('\n'));
    expect(payload.mode).toBe('crawl-packet-cadence-comparison');
  });

  test('CLI writes JSON packets and returns nonzero only for blocking evidence', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-packet-'));
    const outPath = path.join(tmp, 'packet.json');
    const writes = [];
    const originalLog = console.log;
    console.log = (value) => writes.push(String(value));
    try {
      expect(parseArgs(['plan', '--crawl-class', 'small-local', '--json']).mode).toBe('plan');
      expect(runCli([
        'plan',
        '--crawl-class', 'small-local',
        '--generated-at', '2026-05-29T10:15:00.000Z',
        '--no-target-freshness',
        '--json',
        '--out', outPath,
      ])).toBe(0);
      const written = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      expect(written.mode).toBe('crawl-reliability-packet');
      expect(written.classification.label).toBe('needs-tiny-local-proof');
    } finally {
      console.log = originalLog;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    const payload = JSON.parse(writes.join('\n'));
    expect(payload.intent.crawlClass).toBe('small-local');
  });
});
