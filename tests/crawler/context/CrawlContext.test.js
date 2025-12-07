'use strict';

const { CrawlContext } = require('../../../src/crawler/context');

describe('CrawlContext', () => {
  let context;

  beforeEach(() => {
    context = CrawlContext.create({
      jobId: 'test-job-1',
      startUrl: 'https://example.com',
      crawlType: 'basic',
      maxDepth: 2,
      maxPages: 100
    });
  });

  describe('lifecycle', () => {
    test('starts in pending state', () => {
      expect(context.status).toBe('pending');
      expect(context.isRunning).toBe(false);
      expect(context.isFinished).toBe(false);
    });

    test('can start and transition to running', () => {
      context.start();
      expect(context.status).toBe('running');
      expect(context.isRunning).toBe(true);
      expect(context.startedAt).not.toBeNull();
    });

    test('can pause and resume', () => {
      context.start();

      expect(context.pause()).toBe(true);
      expect(context.status).toBe('paused');
      expect(context.isPaused).toBe(true);

      expect(context.resume()).toBe(true);
      expect(context.status).toBe('running');
      expect(context.isPaused).toBe(false);
    });

    test('can finish with different statuses', () => {
      context.start();
      context.finish('completed');

      expect(context.status).toBe('completed');
      expect(context.isFinished).toBe(true);
      expect(context.finishedAt).not.toBeNull();
    });

    test('emits lifecycle events', () => {
      const events = [];
      context.on('started', (data) => events.push({ type: 'started', data }));
      context.on('paused', (data) => events.push({ type: 'paused', data }));
      context.on('resumed', (data) => events.push({ type: 'resumed', data }));
      context.on('finished', (data) => events.push({ type: 'finished', data }));

      context.start();
      context.pause();
      context.resume();
      context.finish('completed');

      expect(events).toHaveLength(4);
      expect(events.map(e => e.type)).toEqual(['started', 'paused', 'resumed', 'finished']);
    });
  });

  describe('URL tracking', () => {
    test('tracks visited URLs', () => {
      expect(context.hasVisited('https://example.com/page1')).toBe(false);

      context.markVisited('https://example.com/page1');

      expect(context.hasVisited('https://example.com/page1')).toBe(true);
      expect(context.visitedCount).toBe(1);
      expect(context.stats.visited).toBe(1);
    });

    test('tracks queued URLs', () => {
      expect(context.isQueued('https://example.com/page1')).toBe(false);

      context.markQueued('https://example.com/page1');

      expect(context.isQueued('https://example.com/page1')).toBe(true);
      expect(context.queuedCount).toBe(1);
      expect(context.stats.queued).toBe(1);
    });

    test('prevents duplicate visits', () => {
      expect(context.markVisited('https://example.com/page1')).toBe(true);
      expect(context.markVisited('https://example.com/page1')).toBe(false);
      expect(context.visitedCount).toBe(1);
    });

    test('prevents queuing already visited URLs', () => {
      context.markVisited('https://example.com/page1');
      expect(context.markQueued('https://example.com/page1')).toBe(false);
    });

    test('tracks URL decisions', () => {
      context.setUrlDecision('https://example.com/page1', 'skip', 'off-domain');

      const decision = context.getUrlDecision('https://example.com/page1');
      expect(decision.action).toBe('skip');
      expect(decision.reason).toBe('off-domain');
      expect(decision.timestamp).toBeDefined();
    });

    test('tracks URL analyses', () => {
      context.setUrlAnalysis('https://example.com/page1', {
        classification: 'article',
        signals: { hasDate: true }
      });

      const analysis = context.getUrlAnalysis('https://example.com/page1');
      expect(analysis.classification).toBe('article');
      expect(analysis.signals.hasDate).toBe(true);
      expect(analysis.timestamp).toBeDefined();
    });
  });

  describe('domain tracking', () => {
    test('tracks domain requests', () => {
      context.recordDomainRequest('example.com');
      context.recordDomainRequest('example.com');

      expect(context.getDomainRequestCount('example.com')).toBe(2);
      expect(context.seenDomains).toContain('example.com');
    });

    test('tracks domain errors', () => {
      context.recordDomainError('example.com', 'timeout');
      context.recordDomainError('example.com', 'server-error');

      expect(context.getDomainErrorCount('example.com')).toBe(2);
    });

    test('handles domain throttling', () => {
      expect(context.isDomainThrottled('example.com')).toBe(false);

      context.throttleDomain('example.com', 1000);

      expect(context.isDomainThrottled('example.com')).toBe(true);
      expect(context.getDomainThrottleRemaining('example.com')).toBeGreaterThan(0);
    });

    test('handles domain blocking', () => {
      expect(context.isDomainBlocked('example.com')).toBe(false);

      context.blockDomain('example.com', 'too-many-errors');

      expect(context.isDomainBlocked('example.com')).toBe(true);
    });
  });

  describe('content tracking', () => {
    test('tracks articles', () => {
      context.recordArticle('https://example.com/article/1');

      expect(context.isArticle('https://example.com/article/1')).toBe(true);
      expect(context.stats.articles).toBe(1);
    });

    test('tracks hubs', () => {
      context.recordHub('https://example.com/section/news');

      expect(context.isHub('https://example.com/section/news')).toBe(true);
      expect(context.stats.navigation).toBe(1);
    });

    test('tracks downloads', () => {
      context.recordDownload(10000, 150);
      context.recordDownload(5000, 100);

      expect(context.stats.bytesDownloaded).toBe(15000);
      expect(context.averageFetchMs).toBe(125);
    });

    test('tracks cache hits/misses', () => {
      context.recordCacheHit();
      context.recordCacheHit();
      context.recordCacheMiss();

      expect(context.stats.cacheHits).toBe(2);
      expect(context.stats.cacheMisses).toBe(1);
    });

    test('tracks errors', () => {
      context.recordError('https://example.com/page1', new Error('Network timeout'));

      expect(context.stats.errors).toBe(1);
    });
  });

  describe('diagnostics', () => {
    test('tracks problems', () => {
      const problem = context.addProblem({
        kind: 'missing-hub',
        message: 'Expected hub not found',
        scope: 'example.com'
      });

      expect(problem.id).toBeDefined();
      expect(problem.timestamp).toBeDefined();
      expect(context.problems).toHaveLength(1);
      expect(context.getProblemCount('missing-hub')).toBe(1);
    });

    test('tracks milestones', () => {
      const milestone = context.addMilestone({
        kind: 'first-article',
        message: 'First article discovered'
      });

      expect(milestone.id).toBeDefined();
      expect(milestone.timestamp).toBeDefined();
      expect(context.milestones).toHaveLength(1);
      expect(context.getMilestoneCount('first-article')).toBe(1);
    });

    test('addMilestoneOnce prevents duplicates', () => {
      context.addMilestoneOnce('first-article', { message: 'First' });
      context.addMilestoneOnce('first-article', { message: 'Second' });

      expect(context.milestones).toHaveLength(1);
      expect(context.milestones[0].message).toBe('First');
    });

    test('emits problem and milestone events', () => {
      const events = [];
      context.on('problem', (data) => events.push({ type: 'problem', data }));
      context.on('milestone', (data) => events.push({ type: 'milestone', data }));

      context.addProblem({ kind: 'test-problem' });
      context.addMilestone({ kind: 'test-milestone' });

      expect(events).toHaveLength(2);
    });
  });

  describe('budget checks', () => {
    test('checks page budget', () => {
      expect(context.isPageBudgetExhausted()).toBe(false);
      expect(context.remainingPages).toBe(100);

      // Simulate visiting pages
      for (let i = 0; i < 100; i++) {
        context.markVisited(`https://example.com/page${i}`);
      }

      expect(context.isPageBudgetExhausted()).toBe(true);
      expect(context.remainingPages).toBe(0);
    });

    test('calculates completion percentage', () => {
      expect(context.completionPercent).toBe(0);

      for (let i = 0; i < 50; i++) {
        context.markVisited(`https://example.com/page${i}`);
      }

      expect(context.completionPercent).toBe(50);
    });
  });

  describe('serialization', () => {
    test('toJSON produces serializable output', () => {
      context.start();
      context.markVisited('https://example.com/page1');
      context.recordArticle('https://example.com/article1');
      context.recordDomainRequest('example.com');
      context.addProblem({ kind: 'test' });
      context.addMilestone({ kind: 'test' });

      const json = context.toJSON();

      expect(json.jobId).toBe('test-job-1');
      expect(json.status).toBe('running');
      expect(json.stats.visited).toBe(1);
      expect(json.stats.articles).toBe(1);
      expect(json.urls.visited).toBe(1);
      expect(json.domains.seen).toBe(1);
      expect(json.diagnostics.problems).toBe(1);
      expect(json.diagnostics.milestones).toBe(1);

      // Verify it's serializable
      expect(() => JSON.stringify(json)).not.toThrow();
    });

    test('toDetailedJSON includes recent diagnostics', () => {
      for (let i = 0; i < 15; i++) {
        context.addProblem({ kind: `problem-${i}` });
      }

      const detailed = context.toDetailedJSON();

      expect(detailed.recentProblems).toHaveLength(10);
    });
  });

  describe('legacy compatibility', () => {
    test('toLegacyState provides backwards-compatible interface', () => {
      context.markVisited('https://example.com/page1');
      context.recordArticle('https://example.com/article1');

      const legacy = context.toLegacyState();

      expect(legacy.visited).toBe(1);
      expect(legacy.articles).toBe(1);
      expect(legacy.visitedUrls).toBeInstanceOf(Set);
      expect(legacy.visitedUrls.has('https://example.com/page1')).toBe(true);
    });
  });

  describe('factory methods', () => {
    test('create() works', () => {
      const ctx = CrawlContext.create({ jobId: 'test' });
      expect(ctx).toBeInstanceOf(CrawlContext);
      expect(ctx.jobId).toBe('test');
    });

    test('fromConfig() works', () => {
      const ctx = CrawlContext.fromConfig({
        jobId: 'config-job',
        startUrl: 'https://test.com',
        crawlType: 'intelligent',
        maxDepth: 3,
        maxPages: 500
      });

      expect(ctx.jobId).toBe('config-job');
      expect(ctx.startUrl).toBe('https://test.com');
      expect(ctx.crawlType).toBe('intelligent');
      expect(ctx.maxDepth).toBe(3);
      expect(ctx.maxPages).toBe(500);
    });
  });
});
