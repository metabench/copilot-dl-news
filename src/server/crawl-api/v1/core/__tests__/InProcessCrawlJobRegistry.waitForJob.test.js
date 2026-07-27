'use strict';

const { InProcessCrawlJobRegistry } = require('../InProcessCrawlJobRegistry');

/**
 * P4 blocker fix (2026-07-20, adversarial review): startOperation()/get()
 * return the SANITIZED _toPublicJob() snapshot, which has no `promise` field
 * — a caller that awaits `job.promise` awaits `undefined` and resolves
 * immediately, reconciling a still-running job as if it had already settled.
 * waitForJob(jobId) exposes the real internal promise (stored only on the
 * private _jobs-Map entry) without changing the public snapshot shape.
 */
describe('InProcessCrawlJobRegistry.waitForJob', () => {
  it('resolves only when the internal job promise resolves, not immediately', async () => {
    const registry = new InProcessCrawlJobRegistry({ workerMode: false });
    let resolveInternal;
    const internalPromise = new Promise((resolve) => { resolveInternal = resolve; });
    registry._jobs.set('job-1', { id: 'job-1', promise: internalPromise });

    let settled = false;
    const p = registry.waitForJob('job-1').then(() => { settled = true; });

    // Give pending microtasks a chance to run — must NOT have settled yet.
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    resolveInternal({ jobId: 'job-1', status: 'completed' });
    await p;
    expect(settled).toBe(true);
  });

  it('rejects when the internal job promise rejects', async () => {
    const registry = new InProcessCrawlJobRegistry({ workerMode: false });
    const err = new Error('worker crashed');
    registry._jobs.set('job-2', { id: 'job-2', promise: Promise.reject(err) });

    await expect(registry.waitForJob('job-2')).rejects.toThrow('worker crashed');
  });

  it('rejects immediately for an unknown jobId (no throw, no hang)', async () => {
    const registry = new InProcessCrawlJobRegistry({ workerMode: false });
    await expect(registry.waitForJob('does-not-exist')).rejects.toThrow(/Unknown job/);
  });

  it('the public job snapshot from get() never exposes the promise field', () => {
    const registry = new InProcessCrawlJobRegistry({ workerMode: false });
    registry._jobs.set('job-3', {
      id: 'job-3', status: 'running', createdAt: 'x', startedAt: 'x',
      promise: Promise.resolve()
    });
    const snapshot = registry.get('job-3');
    expect(snapshot).not.toHaveProperty('promise');
  });
});
