'use strict';

const { InProcessCrawlJobRegistry } = require('../InProcessCrawlJobRegistry');

/**
 * Terminal-rate zeroing (owner-reported, cycle 69): a finished job's LAST
 * progress snapshot froze whatever per-second rates its final delta window
 * computed — typically a reconcile step where `saved` jumps while `downloaded`
 * doesn't, leaving docsSavedPerSec > 0 forever. The crawl-status throughput
 * strip summed rates across the whole jobs list, so completed jobs displayed
 * as a phantom "Saved docs/s" long after every crawl ended. _publicProgress
 * zeroes the rate keys at the single serialization seam (_toPublicJob) once a
 * job is terminal, while cumulative counters stay untouched (they are totals,
 * still true after completion).
 */
describe('InProcessCrawlJobRegistry terminal rate zeroing (_publicProgress via _toPublicJob)', () => {
  const frozenProgress = {
    visited: 6, downloaded: 6, saved: 6, articles: 4, errors: 0,
    bytes: 4_000_000, bytesSaved: 900_000, queued: 4,
    docsDownloadedPerSec: 0,
    docsSavedPerSec: 1.4662756598240467, // the live-observed ghost value
    networkMbPerSec: 0.31,
    savedMbPerSec: 0.12,
    updatedAt: '2026-07-21T22:00:00.000Z'
  };

  function publicJobFor(jobPatch) {
    const registry = new InProcessCrawlJobRegistry({ workerMode: false });
    const job = {
      id: 'j1', operationName: 'basicArticleCrawl', startUrl: 'https://x.test/',
      status: 'running', createdAt: 't0', startedAt: 't1', finishedAt: null,
      progress: { ...frozenProgress },
      ...jobPatch
    };
    registry._jobs.set(job.id, job);
    return registry._toPublicJob(job);
  }

  it('a RUNNING job passes its rates through untouched', () => {
    const pub = publicJobFor({ status: 'running', finishedAt: null });
    expect(pub.progress.docsSavedPerSec).toBeCloseTo(1.466, 3);
    expect(pub.progress.networkMbPerSec).toBeCloseTo(0.31, 3);
  });

  it.each(['completed', 'failed', 'stopped'])('a %s job serializes with ALL rate keys zeroed', (status) => {
    const pub = publicJobFor({ status, finishedAt: '2026-07-21T22:01:00.000Z' });
    expect(pub.progress.docsSavedPerSec).toBe(0);
    expect(pub.progress.docsDownloadedPerSec).toBe(0);
    expect(pub.progress.networkMbPerSec).toBe(0);
    expect(pub.progress.savedMbPerSec).toBe(0);
  });

  it('a job with finishedAt set is terminal regardless of status string', () => {
    const pub = publicJobFor({ status: 'running', finishedAt: '2026-07-21T22:01:00.000Z' });
    expect(pub.progress.docsSavedPerSec).toBe(0);
  });

  it('cumulative counters survive terminal zeroing untouched (they are totals, still true)', () => {
    const pub = publicJobFor({ status: 'completed', finishedAt: '2026-07-21T22:01:00.000Z' });
    expect(pub.progress.visited).toBe(6);
    expect(pub.progress.saved).toBe(6);
    expect(pub.progress.bytes).toBe(4_000_000);
    expect(pub.progress.queued).toBe(4);
    expect(pub.progress.updatedAt).toBe('2026-07-21T22:00:00.000Z');
  });

  it('a job with no progress yet serializes progress: null (unchanged behavior)', () => {
    const pub = publicJobFor({ progress: null });
    expect(pub.progress).toBeNull();
  });

  it('the internal job record is NOT mutated — only the serialized copy is zeroed', () => {
    const registry = new InProcessCrawlJobRegistry({ workerMode: false });
    const job = {
      id: 'j2', status: 'completed', finishedAt: '2026-07-21T22:01:00.000Z',
      progress: { ...frozenProgress }
    };
    registry._jobs.set(job.id, job);
    registry._toPublicJob(job);
    expect(job.progress.docsSavedPerSec).toBeCloseTo(1.466, 3); // internal untouched
  });
});
