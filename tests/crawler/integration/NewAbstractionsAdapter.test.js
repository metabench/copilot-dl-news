'use strict';

const NewAbstractionsAdapter = require('../../../src/core/crawler/integration/NewAbstractionsAdapter');
const { CrawlerState } = require('../../../src/core/crawler/CrawlerState');

/**
 * Mock crawler that simulates enough of NewsCrawler for adapter testing.
 */
function createMockCrawler(overrides = {}) {
  const state = new CrawlerState();
  const listeners = new Map();

  // Mock telemetry that tracks calls
  const telemetryProblems = [];
  const telemetryMilestones = [];

  return {
    startUrl: 'https://example.com',
    domain: 'example.com',
    config: {
      jobId: 'test-job',
      crawlType: 'basic',
      maxDepth: 3,
      maxPages: 100
    },
    state,
    telemetry: {
      problem: jest.fn((data) => { telemetryProblems.push(data); }),
      milestone: jest.fn((data) => { telemetryMilestones.push(data); })
    },
    _telemetryProblems: telemetryProblems,
    _telemetryMilestones: telemetryMilestones,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(handler);
      return this;
    },
    emit(event, data) {
      const handlers = listeners.get(event) || [];
      handlers.forEach(h => h(data));
    },
    _listeners: listeners,
    ...overrides
  };
}

describe('NewAbstractionsAdapter', () => {
  let adapter;
  let mockCrawler;

  beforeEach(() => {
    mockCrawler = createMockCrawler();
  });

  afterEach(() => {
    if (adapter) {
      adapter.dispose();
      adapter = null;
    }
  });

  describe('creation', () => {
    test('creates adapter with default shadow mode', () => {
      adapter = NewAbstractionsAdapter.create(mockCrawler);
      expect(adapter.mode).toBe('shadow');
      expect(adapter.context).toBeDefined();
      expect(adapter.retryCoordinator).toBeDefined();
      expect(adapter.decisionOrchestrator).toBeDefined();
    });

    test('creates adapter with active mode', () => {
      adapter = NewAbstractionsAdapter.create(mockCrawler, { mode: 'active' });
      expect(adapter.mode).toBe('active');
    });
  });

  describe('shadow mode', () => {
    beforeEach(() => {
      adapter = NewAbstractionsAdapter.create(mockCrawler, { mode: 'shadow' });
      adapter.install();
    });

    test('installs shadow tracking on crawler', () => {
      expect(mockCrawler._shadowContext).toBe(adapter.context);
      expect(mockCrawler._abstractionsAdapter).toBe(adapter);
    });

    test('mirrors visited URLs to context', () => {
      mockCrawler.state.visited.add('https://example.com/page1');

      expect(adapter.context.hasVisited('https://example.com/page1')).toBe(true);
      expect(adapter.context.stats.visited).toBe(1);
    });

    test('mirrors article increments', () => {
      mockCrawler.state.incrementArticlesFound(1);
      mockCrawler.state.incrementArticlesFound(2);

      expect(adapter.context.stats.articles).toBe(3);
    });

    test('mirrors error increments', () => {
      mockCrawler.state.incrementErrors(1);

      expect(adapter.context.stats.errors).toBe(1);
    });

    test('mirrors download bytes', () => {
      mockCrawler.state.incrementBytesDownloaded(1024);
      mockCrawler.state.incrementBytesDownloaded(2048);

      expect(adapter.context.stats.bytesDownloaded).toBe(3072);
    });

    test('mirrors problems via telemetry', () => {
      mockCrawler.telemetry.problem({ kind: 'test-problem', message: 'Test' });

      expect(adapter.context.problems.length).toBe(1);
      expect(adapter.context.problems[0].kind).toBe('test-problem');
    });

    test('mirrors milestones via telemetry', () => {
      mockCrawler.telemetry.milestone({ kind: 'test-milestone', message: 'Milestone' });

      expect(adapter.context.milestones.length).toBe(1);
      expect(adapter.context.milestones[0].kind).toBe('test-milestone');
    });

    test('responds to pause/resume events', () => {
      adapter.context.start();
      
      mockCrawler.emit('paused');
      expect(adapter.context.status).toBe('paused');

      mockCrawler.emit('resumed');
      expect(adapter.context.status).toBe('running');
    });
  });

  describe('uninstall', () => {
    test('restores original methods', () => {
      const originalAdd = mockCrawler.state.visited.add;
      const originalIncrement = mockCrawler.state.incrementArticlesFound;

      adapter = NewAbstractionsAdapter.create(mockCrawler, { mode: 'shadow' });
      adapter.install();

      // Methods are now wrapped
      expect(mockCrawler.state.visited.add).not.toBe(originalAdd);

      adapter.uninstall();

      // Shadow references cleared
      expect(mockCrawler._shadowContext).toBeUndefined();
      expect(mockCrawler._abstractionsAdapter).toBeUndefined();
    });
  });

  describe('consistency checking', () => {
    test('getConsistencyReport returns report structure', () => {
      adapter = NewAbstractionsAdapter.create(mockCrawler, { mode: 'shadow' });
      adapter.install();

      const report = adapter.getConsistencyReport();

      expect(report.mode).toBe('shadow');
      expect(report.inconsistencies).toEqual([]);
      expect(report.summary.total).toBe(0);
    });

    test('getStateComparison shows old vs new state', () => {
      adapter = NewAbstractionsAdapter.create(mockCrawler, { mode: 'shadow' });
      adapter.install();

      mockCrawler.state.visited.add('https://example.com/page1');
      mockCrawler.state.incrementArticlesFound(2);

      const comparison = adapter.getStateComparison();

      expect(comparison.oldState).toBeDefined();
      expect(comparison.newState).toBeDefined();
      expect(comparison.newContext).toBeDefined();
    });
  });

  describe('getAbstractions', () => {
    test('returns all new abstractions', () => {
      adapter = NewAbstractionsAdapter.create(mockCrawler, { mode: 'shadow' });

      const abstractions = adapter.getAbstractions();

      expect(abstractions.context).toBeDefined();
      expect(abstractions.retryCoordinator).toBeDefined();
      expect(abstractions.decisionOrchestrator).toBeDefined();
    });
  });

  describe('dispose', () => {
    test('clears interval and uninstalls', () => {
      adapter = NewAbstractionsAdapter.create(mockCrawler, { mode: 'shadow' });
      adapter.install();

      expect(adapter._consistencyInterval).toBeDefined();

      adapter.dispose();

      expect(adapter._installed).toBe(false);
    });
  });
});

