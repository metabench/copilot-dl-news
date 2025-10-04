'use strict';

const { IntelligentCrawlerManager } = require('../services/IntelligentCrawlerManager');
const { computeJobsSummary } = require('../services/jobs');

function createJob({ id, url, metrics = {}, stage = 'running', child = null } = {}) {
  return {
    id,
    url,
    stage,
    child,
    startedAt: new Date('2025-01-01T00:00:00Z').toISOString(),
    paused: false,
    metrics: {
      visited: 0,
      downloaded: 0,
      errors: 0,
      queueSize: 0,
      ...metrics
    }
  };
}

describe('IntelligentCrawlerManager', () => {
  test('buildJobsSummary augments achievements and lifecycle metadata', () => {
    const manager = new IntelligentCrawlerManager({ baseSummaryFn: computeJobsSummary, achievementsLimit: 4 });
    const jobs = new Map();
    jobs.set('job-1', createJob({ id: 'job-1', url: 'https://example.com/a', child: { pid: 123 }, metrics: { visited: 5 } }));

    const startedAt = '2025-01-02T10:00:00.000Z';
    manager.noteJobStart({ jobId: 'job-1', url: 'https://example.com/a', mode: 'fresh', startedAt });
    manager.recordMilestone('job-1', { kind: 'seeded', message: 'Seeded 5 hubs' });

    const summary = manager.buildJobsSummary(jobs);
    expect(summary).toBeTruthy();
    expect(summary.items).toHaveLength(1);
    const item = summary.items[0];
    expect(item.id).toBe('job-1');
    expect(Array.isArray(item.achievements)).toBe(true);
    expect(item.achievements[0]).toMatchObject({ kind: 'seeded', message: 'Seeded 5 hubs' });
    expect(item.lifecycle).toMatchObject({ mode: 'fresh', jobId: 'job-1', startedAt });
  });

  test('recordMilestone enforces achievements limit and order', () => {
    const manager = new IntelligentCrawlerManager({ achievementsLimit: 2 });
    manager.recordMilestone('job-2', { kind: 'first', message: 'one', recordedAt: '2025-01-01T00:00:00.000Z' });
    manager.recordMilestone('job-2', { kind: 'second', message: 'two', recordedAt: '2025-01-02T00:00:00.000Z' });
    manager.recordMilestone('job-2', { kind: 'third', message: 'three', recordedAt: '2025-01-03T00:00:00.000Z' });

    const achievements = manager.getRecentAchievements('job-2');
    expect(achievements).toHaveLength(2);
    expect(achievements[0].message).toBe('three');
    expect(achievements[1].message).toBe('two');
  });

  test('planResumeQueues respects capacity and domain conflicts', () => {
    const manager = new IntelligentCrawlerManager();
    const now = Date.now();
    const queues = [
      { id: 1, url: 'https://alpha.test/start', args: JSON.stringify(['--foo']), started_at: now - 1000 },
      { id: 2, url: 'https://beta.test/home', args: JSON.stringify(['--bar']), started_at: now - 2000 },
      { id: 3, url: 'https://alpha.test/other', args: JSON.stringify(['--baz']), started_at: now - 3000 }
    ];
    const plan = manager.planResumeQueues({
      queues,
      availableSlots: 1,
      runningJobIds: new Set([2]),
      runningDomains: new Set(['beta.test'])
    });
    expect(plan.selected).toHaveLength(1);
    expect(plan.selected[0].queue.id).toBe(1);
    const blocked = plan.processed.filter((entry) => entry.state === 'blocked');
    const blockedIds = blocked.map((entry) => entry.queue.id).sort();
    expect(blockedIds).toEqual([2, 3]);
    const domainBlocked = blocked.find((entry) => entry.queue.id === 3);
    expect(domainBlocked.reasons).toContain('domain-conflict');
  });

  test('buildQueueSummary produces derived queue details', () => {
    const manager = new IntelligentCrawlerManager();
    const startedAt = Date.now() - 5000;
    const plan = manager.planResumeQueues({
      queues: [
        { id: 5, url: 'https://gamma.test/page', args: JSON.stringify(['--foo']), started_at: startedAt }
      ],
      availableSlots: 2
    });
    const summary = manager.buildQueueSummary(plan, { now: startedAt + 2500 });
    expect(summary.queues).toHaveLength(1);
    const queue = summary.queues[0];
    expect(queue.id).toBe(5);
    expect(queue.ageMs).toBe(2500);
    expect(summary.recommendedIds).toEqual([5]);
  });

  test('collectRunningContext gathers running job IDs and domains', () => {
    const manager = new IntelligentCrawlerManager();
    const jobs = new Map();
    jobs.set('job-9', { url: 'https://delta.test/start' });
    jobs.set('job-10', { url: null });
    manager.setJobRegistry({
      getJobs: () => jobs
    });
    const context = manager.collectRunningContext();
    expect(context.runningJobIds.has('job-9')).toBe(true);
    expect(context.runningJobIds.has('job-10')).toBe(true);
    expect(context.runningDomains.has('delta.test')).toBe(true);
  });
});
