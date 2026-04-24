'use strict';

const {
  getDomainsToSchedule,
  normalizeManagedWorkerStatus,
  shouldStopOrchestrator,
} = require('../../deploy/remote-crawler-v2/lib/orchestrator-utils');
const {
  resolveTargetDomains,
  summarizeBoundedRun,
} = require('../../tools/crawl/lib/crawl-remote-bounded');

describe('remote crawl bounded reliability helpers', () => {
  test('scheduler starts second-wave idle domains without requiring pending URLs', () => {
    const workers = new Map([
      ['bbc.com', { state: 'stopped' }],
      ['reuters.com', { state: 'stopped' }],
      ['apnews.com', { state: 'idle', worker: { getStatus: () => ({ stats: { pending: 0 } }) } }],
      ['theguardian.com', { state: 'idle', worker: { getStatus: () => ({ stats: { pending: 0 } }) } }],
      ['cbc.ca', { state: 'idle', worker: { getStatus: () => ({ stats: { pending: 0 } }) } }],
    ]);

    expect(getDomainsToSchedule(workers, 2)).toEqual(['apnews.com', 'theguardian.com']);
  });

  test('scheduler respects remaining concurrency slots', () => {
    const workers = new Map([
      ['bbc.com', { state: 'running' }],
      ['reuters.com', { state: 'idle' }],
      ['apnews.com', { state: 'idle' }],
    ]);

    expect(getDomainsToSchedule(workers, 2)).toEqual(['reuters.com']);
  });

  test('orchestrator stops only after scoped work is fully terminal', () => {
    const workers = new Map([
      ['bbc.com', { state: 'stopped' }],
      ['reuters.com', { state: 'idle' }],
      ['apnews.com', { state: 'stopped' }],
    ]);

    expect(shouldStopOrchestrator(workers, new Set(['bbc.com', 'apnews.com']))).toBe(true);
    expect(shouldStopOrchestrator(workers, null)).toBe(false);
  });

  test('completed worker idle heartbeat is normalized to stopped', () => {
    const normalized = normalizeManagedWorkerStatus('running', {
      state: 'idle',
      isRunning: false,
      startedAt: '2026-03-08T14:28:28.966Z',
      stoppedAt: null,
      stats: { fetched: 5 },
    });

    expect(normalized.state).toBe('stopped');
    expect(normalized.isRunning).toBe(false);
  });

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
});