'use strict';

const CrawlOrchestrator = require('../../../src/crawler/orchestration/CrawlOrchestrator');
const { CrawlContext } = require('../../../src/crawler/context');
const { CrawlPlan, GOALS } = require('../../../src/crawler/plan');
const { ResourceBudget } = require('../../../src/crawler/budget');
const { PHASES } = require('../../../src/crawler/progress');

describe('CrawlOrchestrator', () => {
  let mockCrawler;

  beforeEach(() => {
    mockCrawler = {
      jobId: 'test-job-123',
      startUrl: 'https://example.com',
      crawlType: 'intelligent',
      maxDepth: 3,
      maxDownloads: 100,
      maxAgeMs: 60000,
      isPaused: () => false,
      events: {
        on: jest.fn(),
        emit: jest.fn()
      },
      telemetry: {
        progress: jest.fn()
      }
    };
  });

  describe('constructor', () => {
    it('creates orchestrator from crawler', () => {
      const orchestrator = CrawlOrchestrator.fromCrawler(mockCrawler);

      expect(orchestrator).toBeInstanceOf(CrawlOrchestrator);
      expect(orchestrator.crawler).toBe(mockCrawler);
      expect(orchestrator.context).toBeInstanceOf(CrawlContext);
      expect(orchestrator.plan).toBeDefined();
      expect(orchestrator.budget).toBeDefined();
      expect(orchestrator.progress).toBeDefined();
    });

    it('creates orchestrator with explicit dependencies', () => {
      const context = CrawlContext.create({ jobId: 'custom' });
      const plan = CrawlPlan.builder()
        .addGoal(GOALS.DISCOVER_ARTICLES)
        .setConstraint('maxPages', 50)
        .build();
      const budget = new ResourceBudget({ limits: { pages: 100 } });

      const orchestrator = new CrawlOrchestrator({
        context,
        plan,
        budget
      });

      expect(orchestrator.context).toBe(context);
      expect(orchestrator.plan).toBe(plan);
      expect(orchestrator.budget).toBe(budget);
    });

    it('creates plan from crawler config', () => {
      const orchestrator = CrawlOrchestrator.fromCrawler(mockCrawler);

      expect(orchestrator.plan.goals).toHaveLength(2); // DISCOVER_ARTICLES + MAP_STRUCTURE
      expect(orchestrator.plan.getConstraint('maxPages')).toBe(100);
      expect(orchestrator.plan.getConstraint('maxDepth')).toBe(3);
    });

    it('creates budget from crawler config', () => {
      const orchestrator = CrawlOrchestrator.fromCrawler(mockCrawler);

      expect(orchestrator.budget.getLimit('pages')).toBe(100);
      expect(orchestrator.budget.getLimit('time')).toBe(60000);
    });
  });

  describe('lifecycle', () => {
    let orchestrator;

    beforeEach(() => {
      orchestrator = CrawlOrchestrator.fromCrawler(mockCrawler);
    });

    it('starts and emits event', () => {
      const startedHandler = jest.fn();
      orchestrator.on('started', startedHandler);

      orchestrator.start();

      expect(startedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: mockCrawler.jobId
        })
      );
    });

    it('freezes plan on start', () => {
      orchestrator.start();

      expect(orchestrator.plan.isFrozen).toBe(true);
    });

    it('stops and emits event', () => {
      const stoppedHandler = jest.fn();
      orchestrator.on('stopped', stoppedHandler);

      orchestrator.start();
      orchestrator.stop('test-reason');

      expect(stoppedHandler).toHaveBeenCalledWith({
        reason: 'test-reason',
        details: {}
      });
    });

    it('pauses and resumes', () => {
      const pausedHandler = jest.fn();
      const resumedHandler = jest.fn();
      orchestrator.on('paused', pausedHandler);
      orchestrator.on('resumed', resumedHandler);

      orchestrator.start();
      orchestrator.pause();
      orchestrator.resume();

      expect(pausedHandler).toHaveBeenCalled();
      expect(resumedHandler).toHaveBeenCalled();
    });
  });

  describe('structured concurrency', () => {
    let orchestrator;

    beforeEach(() => {
      orchestrator = CrawlOrchestrator.fromCrawler(mockCrawler);
      orchestrator.start();
    });

    afterEach(() => {
      orchestrator.stop();
    });

    it('spawns workers', () => {
      const workerFn = jest.fn().mockResolvedValue('done');

      const workerId = orchestrator.spawnWorker(workerFn, { name: 'test-worker' });

      expect(workerId).toBe(0);
      expect(orchestrator.activeWorkerCount).toBeGreaterThanOrEqual(0);
    });

    it('tracks worker lifecycle', async () => {
      const startedHandler = jest.fn();
      const completedHandler = jest.fn();
      orchestrator.on('worker:started', startedHandler);
      orchestrator.on('worker:completed', completedHandler);

      const workerFn = jest.fn().mockResolvedValue('done');
      orchestrator.spawnWorker(workerFn, { name: 'test-worker' });

      await orchestrator.awaitWorkers();

      expect(startedHandler).toHaveBeenCalled();
      expect(completedHandler).toHaveBeenCalled();
    });

    it('provides worker context', async () => {
      let capturedContext = null;

      const workerFn = async (ctx) => {
        capturedContext = ctx;
        return 'done';
      };

      orchestrator.spawnWorker(workerFn);
      await orchestrator.awaitWorkers();

      expect(capturedContext).toHaveProperty('signal');
      expect(capturedContext).toHaveProperty('workerId');
      expect(capturedContext).toHaveProperty('budget');
      expect(capturedContext).toHaveProperty('context');
      expect(capturedContext).toHaveProperty('shouldContinue');
    });

    it('shouldContinue respects goals satisfied', async () => {
      let shouldContinueResult = null;

      orchestrator._allGoalsSatisfied = true;

      const workerFn = async (ctx) => {
        shouldContinueResult = ctx.shouldContinue();
        return 'done';
      };

      orchestrator.spawnWorker(workerFn);
      await orchestrator.awaitWorkers();

      expect(shouldContinueResult).toBe(false);
    });

    it('awaits all workers and returns statuses', async () => {
      const workerFn = jest.fn().mockResolvedValue('done');

      orchestrator.spawnWorker(workerFn, { name: 'worker-a' });
      orchestrator.spawnWorker(workerFn, { name: 'worker-b' });

      const statuses = await orchestrator.awaitWorkers();

      expect(statuses).toHaveLength(2);
      expect(statuses[0]).toHaveProperty('status', 'completed');
      expect(statuses[1]).toHaveProperty('status', 'completed');
    });

    it('handles worker errors', async () => {
      const errorHandler = jest.fn();
      orchestrator.on('worker:error', errorHandler);

      const workerFn = jest.fn().mockRejectedValue(new Error('Worker failed'));
      orchestrator.spawnWorker(workerFn);

      await orchestrator.awaitWorkers();

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Error)
        })
      );
    });
  });

  describe('goal-driven stopping', () => {
    let orchestrator;

    beforeEach(() => {
      orchestrator = new CrawlOrchestrator({
        context: CrawlContext.create({ jobId: 'test' }),
        plan: CrawlPlan.builder()
          .addGoal(GOALS.DISCOVER_ARTICLES, { count: 5 })
          .build(),
        config: { goalCheckFrequencyMs: 100 }
      });
    });

    afterEach(() => {
      orchestrator.stop();
    });

    it('checks goals when URL visited', () => {
      orchestrator.start();

      // Simulate articles found via recordArticle method
      for (let i = 0; i < 5; i++) {
        orchestrator.context.recordArticle(`https://example.com/article${i}`);
      }

      // Force goal check
      orchestrator._checkGoals();

      expect(orchestrator.plan.goals[0].status).toBe('satisfied');
    });

    it('emits goals:allSatisfied when all goals met', () => {
      const allSatisfiedHandler = jest.fn();
      orchestrator.on('goals:allSatisfied', allSatisfiedHandler);

      orchestrator.start();

      // Satisfy the goal
      for (let i = 0; i < 5; i++) {
        orchestrator.context.recordArticle(`https://example.com/article${i}`);
      }
      orchestrator._checkGoals();

      expect(allSatisfiedHandler).toHaveBeenCalled();
    });

    it('stops when all goals satisfied if configured', () => {
      const stoppedHandler = jest.fn();
      orchestrator.on('stopped', stoppedHandler);

      orchestrator.start();

      // Satisfy the goal
      for (let i = 0; i < 5; i++) {
        orchestrator.context.recordArticle(`https://example.com/article${i}`);
      }
      orchestrator._checkGoals();

      expect(stoppedHandler).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'goals-satisfied' })
      );
    });

    it('does not stop when stopOnGoalsSatisfied is false', () => {
      orchestrator._config.stopOnGoalsSatisfied = false;
      const stoppedHandler = jest.fn();
      orchestrator.on('stopped', stoppedHandler);

      orchestrator.start();

      // Satisfy the goal
      for (let i = 0; i < 5; i++) {
        orchestrator.context.recordArticle(`https://example.com/article${i}`);
      }
      orchestrator._checkGoals();

      expect(stoppedHandler).not.toHaveBeenCalled();
    });
  });

  describe('budget integration', () => {
    let orchestrator;

    beforeEach(() => {
      orchestrator = new CrawlOrchestrator({
        context: CrawlContext.create({ jobId: 'test' }),
        budget: new ResourceBudget({
          limits: { pages: 5 },
          enforcement: 'warn'
        }),
        config: { stopOnBudgetExhausted: true }
      });
    });

    afterEach(() => {
      orchestrator.stop();
    });

    it('spends budget when URL visited', () => {
      orchestrator.start();

      orchestrator.context.markVisited('https://example.com/page1', {});

      expect(orchestrator.budget.getSpent('pages')).toBe(1);
    });

    it('emits budget:exhausted when limit reached', () => {
      const exhaustedHandler = jest.fn();
      orchestrator.on('budget:exhausted', exhaustedHandler);

      orchestrator.start();

      // Spend the entire budget
      for (let i = 0; i < 5; i++) {
        orchestrator.context.markVisited(`https://example.com/page${i}`, {});
      }

      expect(exhaustedHandler).toHaveBeenCalledWith({ resource: 'pages' });
    });
  });

  describe('progress tracking', () => {
    let orchestrator;

    beforeEach(() => {
      orchestrator = CrawlOrchestrator.fromCrawler(mockCrawler);
      orchestrator.start();
    });

    afterEach(() => {
      orchestrator.stop();
    });

    it('emits progress events', () => {
      const progressHandler = jest.fn();
      orchestrator.on('progress', progressHandler);

      orchestrator.context.markVisited('https://example.com/page1', {});

      expect(progressHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          completion: expect.any(Number),
          phase: expect.any(String)
        })
      );
    });

    it('returns progress summary', () => {
      const summary = orchestrator.getProgressSummary();

      expect(summary).toHaveProperty('completion');
      expect(summary).toHaveProperty('phase');
      expect(summary).toHaveProperty('rate');
    });
  });

  describe('checkpointing', () => {
    let orchestrator;

    beforeEach(() => {
      orchestrator = new CrawlOrchestrator({
        context: CrawlContext.create({ jobId: 'checkpoint-test' }),
        plan: CrawlPlan.builder()
          .addGoal(GOALS.DISCOVER_ARTICLES)
          .setConstraint('maxPages', 100)
          .build(),
        budget: new ResourceBudget({ limits: { pages: 100 } }),
        config: {
          checkpointPath: 'test-checkpoint.json',
          checkpointFrequencyMs: 1000
        }
      });
    });

    afterEach(() => {
      orchestrator.stop();
    });

    it('creates checkpoint on demand', () => {
      orchestrator.start();
      orchestrator.context.markVisited('https://example.com/page1', {});

      const checkpoint = orchestrator.toCheckpoint();

      expect(checkpoint).toHaveProperty('version', '1.0');
      expect(checkpoint).toHaveProperty('timestamp');
      expect(checkpoint).toHaveProperty('jobId', 'checkpoint-test');
      expect(checkpoint).toHaveProperty('context');
      expect(checkpoint).toHaveProperty('plan');
      expect(checkpoint).toHaveProperty('budget');
      expect(checkpoint).toHaveProperty('progress');
    });

    it('emits checkpoint event', () => {
      const checkpointHandler = jest.fn();
      orchestrator.on('checkpoint', checkpointHandler);

      orchestrator.start();
      orchestrator._saveCheckpoint();

      expect(checkpointHandler).toHaveBeenCalled();
    });

    it('restores from checkpoint', () => {
      orchestrator.start();
      // markVisited triggers automatic budget.spend('pages', 1) via event wiring
      orchestrator.context.markVisited('https://example.com/page1', {});
      orchestrator.context.markVisited('https://example.com/page2', {});
      // No manual budget.spend() - the event wiring handles it

      const checkpoint = orchestrator.toCheckpoint();

      // Create new orchestrator from checkpoint
      const restored = CrawlOrchestrator.fromCheckpoint(checkpoint);

      expect(restored.context.jobId).toBe('checkpoint-test');
      expect(restored.budget.getSpent('pages')).toBe(2);

      // Clean up restored orchestrator to avoid interval leaks
      restored.stop();
    });
  });

  describe('crawler installation', () => {
    it('installs on crawler and wires events', () => {
      const orchestrator = CrawlOrchestrator.fromCrawler(mockCrawler);

      orchestrator.installOnCrawler();

      expect(mockCrawler.orchestrator).toBe(orchestrator);
      expect(mockCrawler.events.on).toHaveBeenCalled();

      orchestrator.stop();
    });

    it('overrides isPaused to check goals', () => {
      const orchestrator = CrawlOrchestrator.fromCrawler(mockCrawler);
      orchestrator.installOnCrawler();

      orchestrator._allGoalsSatisfied = true;

      expect(mockCrawler.isPaused()).toBe(true);

      orchestrator.stop();
    });
  });
});
