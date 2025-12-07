'use strict';

const ProgressModel = require('../ProgressModel');
const CrawlPlan = require('../../plan/CrawlPlan');

describe('ProgressModel', () => {
  // Mock context factory
  function createMockContext(overrides = {}) {
    return {
      stats: {
        visited: 0,
        queued: 0,
        articles: 0,
        errors: 0,
        bytesDownloaded: 0,
        cacheHits: 0,
        cacheMisses: 0,
        ...overrides.stats
      },
      elapsedMs: overrides.elapsedMs ?? 0,
      queuedCount: overrides.queuedCount ?? overrides.stats?.queued ?? 0,
      isFinished: overrides.isFinished ?? false,
      isPageBudgetExhausted: () => overrides.isPageBudgetExhausted ?? false,
      idleMs: overrides.idleMs ?? 0,
      ...overrides
    };
  }

  // Mock plan factory
  function createMockPlan(overrides = {}) {
    const plan = new CrawlPlan();

    if (overrides.maxPages) {
      plan.setConstraint('maxPages', overrides.maxPages);
    }
    if (overrides.goals) {
      overrides.goals.forEach(g => plan.addGoal(g.type, g.target));
    }

    return plan;
  }

  describe('completion', () => {
    test('returns 0 for empty context', () => {
      const context = createMockContext();
      const plan = createMockPlan({ maxPages: 100 });
      const progress = new ProgressModel(context, plan);

      expect(progress.completion).toBe(0);
    });

    test('calculates completion from maxPages constraint', () => {
      const context = createMockContext({ stats: { visited: 50 } });
      const plan = createMockPlan({ maxPages: 100 });
      const progress = new ProgressModel(context, plan);

      expect(progress.completion).toBe(50);
    });

    test('caps completion at 100', () => {
      const context = createMockContext({ stats: { visited: 150 } });
      const plan = createMockPlan({ maxPages: 100 });
      const progress = new ProgressModel(context, plan);

      expect(progress.completion).toBe(100);
    });

    test('uses queue-based estimate without constraints', () => {
      const context = createMockContext({
        stats: { visited: 30, queued: 70 },
        queuedCount: 70
      });
      // Pass null plan to fall through to queue-based estimate
      const progress = new ProgressModel(context, null);

      expect(progress.completion).toBe(30);
    });

    test('isComplete returns true at 100%', () => {
      const context = createMockContext({ stats: { visited: 100 } });
      const plan = createMockPlan({ maxPages: 100 });
      const progress = new ProgressModel(context, plan);

      expect(progress.isComplete).toBe(true);
    });

    test('isComplete returns true when context finished', () => {
      const context = createMockContext({ isFinished: true });
      const plan = createMockPlan({});
      const progress = new ProgressModel(context, plan);

      expect(progress.isComplete).toBe(true);
    });
  });

  describe('remaining', () => {
    test('calculates remaining from maxPages', () => {
      const context = createMockContext({ stats: { visited: 30 } });
      const plan = createMockPlan({ maxPages: 100 });
      const progress = new ProgressModel(context, plan);

      expect(progress.remaining).toBe(70);
    });

    test('returns queue count without maxPages', () => {
      const context = createMockContext({
        stats: { visited: 30, queued: 50 },
        queuedCount: 50
      });
      const plan = createMockPlan({});
      const progress = new ProgressModel(context, plan);

      expect(progress.remaining).toBe(50);
    });
  });

  describe('ETA', () => {
    test('returns null with no progress', () => {
      const context = createMockContext({ elapsedMs: 1000 });
      const plan = createMockPlan({ maxPages: 100 });
      const progress = new ProgressModel(context, plan);

      expect(progress.eta).toBeNull();
    });

    test('returns 0 when complete', () => {
      const context = createMockContext({
        stats: { visited: 100 },
        elapsedMs: 10000
      });
      const plan = createMockPlan({ maxPages: 100 });
      const progress = new ProgressModel(context, plan);

      expect(progress.eta).toBe(0);
    });

    test('calculates projected ETA', () => {
      const context = createMockContext({
        stats: { visited: 50 },
        elapsedMs: 5000
      });
      const plan = createMockPlan({ maxPages: 100 });
      const progress = new ProgressModel(context, plan);

      // 50% in 5000ms => 100% in ~10000ms => 5000ms remaining
      expect(progress.eta).toBe(5000);
    });

    test('etaFormatted returns human readable string', () => {
      const context = createMockContext({
        stats: { visited: 50 },
        elapsedMs: 30000 // 30 seconds for 50%
      });
      const plan = createMockPlan({ maxPages: 100 });
      const progress = new ProgressModel(context, plan);

      // 50% in 30s => 30s remaining
      expect(progress.etaFormatted).toMatch(/30s|calculating/);
    });

    test('etaFormatted shows hours and minutes', () => {
      const context = createMockContext({
        stats: { visited: 10 },
        elapsedMs: 36000 // 36 seconds for 10%
      });
      const plan = createMockPlan({ maxPages: 100 });
      const progress = new ProgressModel(context, plan);

      // 10% in 36s => 90% in 324s => ~5m 24s
      expect(progress.etaFormatted).toMatch(/\dm|\ds/);
    });

    test('estimatedCompletionTime returns Date', () => {
      const context = createMockContext({
        stats: { visited: 50 },
        elapsedMs: 5000
      });
      const plan = createMockPlan({ maxPages: 100 });
      const progress = new ProgressModel(context, plan);

      const est = progress.estimatedCompletionTime;
      expect(est).toBeInstanceOf(Date);
      expect(est.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('rate', () => {
    test('returns zeros with no elapsed time', () => {
      const context = createMockContext();
      const plan = createMockPlan({});
      const progress = new ProgressModel(context, plan);

      expect(progress.rate.pagesPerSecond).toBe(0);
      expect(progress.rate.bytesPerSecond).toBe(0);
    });

    test('calculates pages per second', () => {
      const context = createMockContext({
        stats: { visited: 100 },
        elapsedMs: 10000 // 10 seconds
      });
      const plan = createMockPlan({});
      const progress = new ProgressModel(context, plan);

      expect(progress.rate.pagesPerSecond).toBe(10);
    });

    test('calculates bytes per second', () => {
      const context = createMockContext({
        stats: { bytesDownloaded: 1024 * 1024 }, // 1 MB
        elapsedMs: 1000 // 1 second
      });
      const plan = createMockPlan({});
      const progress = new ProgressModel(context, plan);

      expect(progress.rate.bytesPerSecond).toBe(1024 * 1024);
    });

    test('throughputFormatted shows human readable', () => {
      const context = createMockContext({
        stats: { bytesDownloaded: 1024 * 1024 * 5 }, // 5 MB
        elapsedMs: 1000
      });
      const plan = createMockPlan({});
      const progress = new ProgressModel(context, plan);

      expect(progress.throughputFormatted).toMatch(/MB\/s/);
    });
  });

  describe('goalProgress', () => {
    test('returns empty array without plan', () => {
      const context = createMockContext();
      const progress = new ProgressModel(context, null);

      expect(progress.goalProgress).toEqual([]);
    });

    test('calculates progress for each goal', () => {
      const context = createMockContext({
        stats: { articles: 25, visited: 50 }
      });
      const plan = createMockPlan({
        goals: [
          { type: 'discover-articles', target: { count: 100 } },
          { type: 'map-structure', target: { pages: 100 } }
        ]
      });
      const progress = new ProgressModel(context, plan);

      const goals = progress.goalProgress;
      expect(goals).toHaveLength(2);
      expect(goals[0].percentage).toBe(25);
      expect(goals[1].percentage).toBe(50);
    });

    test('bottleneckGoal returns lowest progress goal', () => {
      const context = createMockContext({
        stats: { articles: 10, visited: 90 }
      });
      const plan = createMockPlan({
        goals: [
          { type: 'discover-articles', target: { count: 100 } },
          { type: 'map-structure', target: { pages: 100 } }
        ]
      });
      const progress = new ProgressModel(context, plan);

      expect(progress.bottleneckGoal.type).toBe('discover-articles');
      expect(progress.bottleneckGoal.percentage).toBe(10);
    });
  });

  describe('phase detection', () => {
    test('returns INITIALIZING early in crawl', () => {
      const context = createMockContext({
        stats: { visited: 2 },
        elapsedMs: 1000
      });
      const plan = createMockPlan({ maxPages: 100 });
      const progress = new ProgressModel(context, plan);

      expect(progress.phase).toBe(ProgressModel.PHASES.INITIALIZING);
    });

    test('returns RAMPING at low completion', () => {
      const context = createMockContext({
        stats: { visited: 5 },
        elapsedMs: 10000
      });
      const plan = createMockPlan({ maxPages: 100 });
      const progress = new ProgressModel(context, plan);

      expect(progress.phase).toBe(ProgressModel.PHASES.RAMPING);
    });

    test('returns STEADY at mid completion', () => {
      const context = createMockContext({
        stats: { visited: 50 },
        elapsedMs: 30000
      });
      const plan = createMockPlan({ maxPages: 100 });
      const progress = new ProgressModel(context, plan);

      expect(progress.phase).toBe(ProgressModel.PHASES.STEADY);
    });

    test('returns COOLING at high completion', () => {
      const context = createMockContext({
        stats: { visited: 95 },
        elapsedMs: 60000
      });
      const plan = createMockPlan({ maxPages: 100 });
      const progress = new ProgressModel(context, plan);

      expect(progress.phase).toBe(ProgressModel.PHASES.COOLING);
    });

    test('returns STALLED when idle too long', () => {
      const context = createMockContext({
        stats: { visited: 50 },
        elapsedMs: 60000,
        idleMs: 60000 // 1 minute idle
      });
      const plan = createMockPlan({ maxPages: 100 });
      const progress = new ProgressModel(context, plan);

      expect(progress.phase).toBe(ProgressModel.PHASES.STALLED);
    });

    test('returns COMPLETED when done', () => {
      const context = createMockContext({
        stats: { visited: 100 },
        isFinished: true
      });
      const plan = createMockPlan({ maxPages: 100 });
      const progress = new ProgressModel(context, plan);

      expect(progress.phase).toBe(ProgressModel.PHASES.COMPLETED);
    });

    test('phaseDescription returns meaningful string', () => {
      const context = createMockContext({
        stats: { visited: 50 },
        elapsedMs: 30000
      });
      const plan = createMockPlan({ maxPages: 100 });
      const progress = new ProgressModel(context, plan);

      expect(progress.phaseDescription).toContain('steady');
    });
  });

  describe('health indicators', () => {
    test('errorRate calculates percentage', () => {
      const context = createMockContext({
        stats: { visited: 90, errors: 10 }
      });
      const progress = new ProgressModel(context, createMockPlan({}));

      expect(progress.errorRate).toBe(10);
    });

    test('cacheHitRate calculates percentage', () => {
      const context = createMockContext({
        stats: { cacheHits: 30, cacheMisses: 70 }
      });
      const progress = new ProgressModel(context, createMockPlan({}));

      expect(progress.cacheHitRate).toBe(30);
    });

    test('articleDiscoveryRate calculates percentage', () => {
      const context = createMockContext({
        stats: { visited: 100, articles: 25 }
      });
      const progress = new ProgressModel(context, createMockPlan({}));

      expect(progress.articleDiscoveryRate).toBe(25);
    });

    test('healthScore starts at 100', () => {
      const context = createMockContext({
        stats: { visited: 50 },
        elapsedMs: 30000
      });
      const plan = createMockPlan({ maxPages: 100 });
      const progress = new ProgressModel(context, plan);

      expect(progress.healthScore).toBe(100);
    });

    test('healthScore decreases with high error rate', () => {
      const context = createMockContext({
        stats: { visited: 50, errors: 50 },
        elapsedMs: 30000
      });
      const plan = createMockPlan({ maxPages: 100 });
      const progress = new ProgressModel(context, plan);

      expect(progress.healthScore).toBeLessThan(100);
    });

    test('healthScore decreases when stalled', () => {
      const context = createMockContext({
        stats: { visited: 50 },
        elapsedMs: 60000,
        idleMs: 60000
      });
      const plan = createMockPlan({ maxPages: 100 });
      const progress = new ProgressModel(context, plan);

      expect(progress.healthScore).toBeLessThan(100);
    });
  });

  describe('serialization', () => {
    test('toJSON returns comprehensive snapshot', () => {
      const context = createMockContext({
        stats: { visited: 50, articles: 10, bytesDownloaded: 1024 * 1024 },
        elapsedMs: 30000
      });
      const plan = createMockPlan({
        maxPages: 100,
        goals: [{ type: 'discover-articles', target: { count: 50 } }]
      });
      const progress = new ProgressModel(context, plan);

      const json = progress.toJSON();

      expect(json.completion).toBe(50);
      expect(json.rate.pagesPerSecond).toBeCloseTo(1.67, 1);
      expect(json.phase).toBe('steady');
      expect(json.health.score).toBe(100);
      expect(json.goals).toHaveLength(1);
    });

    test('summary returns one-line string', () => {
      const context = createMockContext({
        stats: { visited: 50, articles: 10 },
        elapsedMs: 30000
      });
      const plan = createMockPlan({ maxPages: 100 });
      const progress = new ProgressModel(context, plan);

      expect(progress.summary).toContain('50%');
      expect(progress.summary).toContain('50 pages');
      expect(progress.summary).toContain('10 articles');
    });
  });

  describe('static create', () => {
    test('creates instance with options', () => {
      const context = createMockContext();
      const plan = createMockPlan({});
      const progress = ProgressModel.create(context, plan, { etaAlpha: 0.5 });

      expect(progress).toBeInstanceOf(ProgressModel);
      expect(progress._etaAlpha).toBe(0.5);
    });
  });
});
