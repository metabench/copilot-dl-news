'use strict';

// NOTE (cycle 73, module-ecosystem extraction): this file used to also test
// orchestrator-utils.js's scheduling helpers (getDomainsToSchedule,
// normalizeManagedWorkerStatus, shouldStopOrchestrator) — that module moved to
// ../news-crawler-itself/lib/orchestrator-utils.js along with the rest of the
// remote crawler engine; its tests moved with it to
// news-crawler-itself/lib/__tests__/orchestrator-utils.test.js. This file keeps
// only the copilot-dl-news-side driver helpers (crawl-remote-bounded.js), which
// stay in the coordinator.
const {
  findMissingDomains,
  normalizeCollectOptions,
  resolveTargetDomains,
  summarizeHostVerification,
  summarizeBoundedRun,
} = require('../../tools/crawl/lib/crawl-remote-bounded');

describe('remote crawl bounded reliability helpers', () => {
  test('bounded summary treats untouched idle domains as incomplete', () => {
    const summary = summarizeBoundedRun({
      domains: [
        { domain: 'bbc.com', state: 'stopped', isRunning: false, startedAt: '2026-03-08T14:28:28.966Z', stoppedAt: '2026-03-08T14:29:10.652Z', stats: { fetched: 12 } },
        { domain: 'cbc.ca', state: 'idle', isRunning: false, startedAt: null, stoppedAt: null, stats: {} },
      ],
    }, ['bbc.com', 'cbc.ca']);

    expect(summary.completed.map(domain => domain.domain)).toEqual(['bbc.com']);
    expect(summary.notStarted.map(domain => domain.domain)).toEqual(['cbc.ca']);
    expect(summary.allDone).toBe(false);
  });

  test('bounded summary resolves all configured domains when no explicit target is provided', () => {
    const targetDomains = resolveTargetDomains({}, {
      domains: [
        { domain: 'bbc.com' },
        { domain: 'reuters.com' },
      ],
    });

    expect(targetDomains).toEqual(['bbc.com', 'reuters.com']);
  });

  test('detects explicit bounded domains missing from the remote server config', () => {
    const missing = findMissingDomains({
      domains: [
        { domain: 'bbc.com' },
        { domain: 'reuters.com' },
      ],
    }, ['bbc.com', 'apnews.com', 'bbc.com']);

    expect(missing).toEqual(['apnews.com']);
  });

  test('collect options use crawl-friendly defaults and clamp completion targets', () => {
    expect(normalizeCollectOptions({}, ['bbc.com', 'reuters.com'])).toMatchObject({
      targetPages: 100,
      maxPages: 150,
      minCompleteHosts: 2,
      intervalSec: 5,
      windowSec: 10,
      limit: 500,
      verifyEveryRounds: 1,
      drainEmptyRounds: 3,
    });

    expect(normalizeCollectOptions({
      'target-pages': '80',
      'min-complete-hosts': '99',
      'max-pages': '120',
      interval: '2',
      window: '15',
      limit: '1000',
      'verify-every': '3',
      'drain-empty-rounds': '4',
    }, ['bbc.com', 'reuters.com'])).toMatchObject({
      targetPages: 80,
      maxPages: 120,
      minCompleteHosts: 2,
      intervalSec: 2,
      windowSec: 15,
      limit: 1000,
      verifyEveryRounds: 3,
      drainEmptyRounds: 4,
    });
  });

  test('host verification summary separates complete and incomplete targets', () => {
    const summary = summarizeHostVerification([
      { host: 'bbc.com', pages: 120, lastFetched: '2026-05-12 21:00:00' },
      { host: 'reuters.com', pages: 70, lastFetched: '2026-05-12 21:01:00' },
    ], ['bbc.com', 'reuters.com', 'apnews.com'], 100);

    expect(summary.complete.map(row => row.host)).toEqual(['bbc.com']);
    expect(summary.incomplete).toMatchObject([
      { host: 'reuters.com', pages: 70, needed: 30 },
      { host: 'apnews.com', pages: 0, needed: 100 },
    ]);
    expect(summary.allComplete).toBe(false);
  });
});
