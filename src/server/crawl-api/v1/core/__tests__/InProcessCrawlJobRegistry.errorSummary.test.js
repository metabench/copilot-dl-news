'use strict';

const { EventEmitter } = require('events');
const { InProcessCrawlJobRegistry } = require('../InProcessCrawlJobRegistry');

/**
 * Regression: failed crawls must leave diagnosable evidence on the job
 * record. LeMonde (2026-07-15, job 143fc616) finished with 5,146 errors and
 * ZERO persisted detail — worker stdio was 'inherit' and url:error events
 * were only counted, never sampled. _attachErrorSummary now keeps bounded
 * per-kind counts plus the first 25 samples, exposed via the jobs API.
 */

describe('InProcessCrawlJobRegistry error summary', () => {
  const makeJob = () => ({ id: 'job-test-1' });

  it('collects per-kind counts and bounded samples from url:error events', () => {
    const registry = new InProcessCrawlJobRegistry({ workerMode: false });
    const job = makeJob();
    const emitter = new EventEmitter();
    registry._attachErrorSummary(job, emitter);

    for (let i = 0; i < 30; i++) {
      emitter.emit('url:error', {
        url: `https://www.lemonde.fr/page-${i}`,
        error: 'request failed: ECONNRESET',
        timestamp: Date.now()
      });
    }
    emitter.emit('url:error', { url: 'https://www.lemonde.fr/x', error: 'HTTP 403 Forbidden' });

    expect(job.errorSummary.total).toBe(31);
    expect(job.errorSummary.byKind.ECONNRESET).toBe(30);
    expect(job.errorSummary.byKind['HTTP 403']).toBe(1);
    // Bounded: 25 samples max, no matter how many errors arrive.
    expect(job.errorSummary.samples).toHaveLength(25);
    expect(job.errorSummary.samples[0].url).toBe('https://www.lemonde.fr/page-0');
    expect(job.errorSummary.samples[0].error).toContain('ECONNRESET');
  });

  it('classifies unrecognized messages by truncated text and never throws on junk', () => {
    const registry = new InProcessCrawlJobRegistry({ workerMode: false });
    const job = makeJob();
    const emitter = new EventEmitter();
    registry._attachErrorSummary(job, emitter);

    emitter.emit('url:error', { url: 'https://a.example', error: 'weird bespoke failure with no code' });
    emitter.emit('url:error', null);
    emitter.emit('url:error', {});

    expect(job.errorSummary.total).toBe(3);
    expect(job.errorSummary.byKind['weird bespoke failure with no code']).toBe(1);
    expect(job.errorSummary.byKind.unknown).toBe(2);
  });

  it('attaches only once per job', () => {
    const registry = new InProcessCrawlJobRegistry({ workerMode: false });
    const job = makeJob();
    const emitter = new EventEmitter();
    registry._attachErrorSummary(job, emitter);
    registry._attachErrorSummary(job, emitter); // second attach is a no-op
    emitter.emit('url:error', { url: 'https://a.example', error: 'ETIMEDOUT' });
    expect(job.errorSummary.total).toBe(1);
  });

  it('exposes errorSummary and logPath through the public job shape', () => {
    const registry = new InProcessCrawlJobRegistry({ workerMode: false });
    const job = {
      id: 'job-test-2',
      status: 'failed',
      errorSummary: { total: 2, byKind: { ECONNRESET: 2 }, samples: [] },
      logPath: 'data/logs/jobs/job-test-2.log'
    };
    registry._jobs.set(job.id, job);
    const pub = registry.get(job.id);
    expect(pub.errorSummary.byKind.ECONNRESET).toBe(2);
    expect(pub.logPath).toBe('data/logs/jobs/job-test-2.log');
  });
});
