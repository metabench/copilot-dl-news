const { EnhancedFeaturesManager } = require('../EnhancedFeaturesManager');

describe('EnhancedFeaturesManager', () => {
  const createManager = ({ flags = {}, dbEnabled = true } = {}) => {
    const closed = {
      config: false,
      scorer: false,
      clustering: false,
      knowledge: false,
      resolution: false
    };

    class FakeConfigManager {
      constructor() {
        this.closed = false;
      }
      getFeatureFlags() {
        return flags;
      }
      close() {
        closed.config = true;
      }
    }

    class FakeEnhancedDbAdapter {
      constructor(base) {
        this.base = base;
      }
      close() {
        // noop in tests
      }
    }

    class FakePriorityScorer {
      constructor(configManager, adapter) {
        this.configManager = configManager;
        this.adapter = adapter;
      }
      computeEnhancedPriority({ priority = 5 }) {
        return {
          priority: priority + 10,
          prioritySource: 'enhanced',
          bonusApplied: 10,
          basePriority: priority
        };
      }
      close() {
        closed.scorer = true;
      }
    }

    class FakeProblemClusteringService {
      constructor(adapter, config) {
        this.adapter = adapter;
        this.config = config;
      }
      close() {
        closed.clustering = true;
      }
    }

    class FakePlannerKnowledgeService {
      constructor(adapter, config) {
        this.adapter = adapter;
        this.config = config;
      }
      close() {
        closed.knowledge = true;
      }
    }

    class FakeProblemResolutionService {
      constructor(options) {
        this.options = options;
      }
      close() {
        closed.resolution = true;
      }
    }

    const manager = new EnhancedFeaturesManager({
      ConfigManager: FakeConfigManager,
      EnhancedDatabaseAdapter: FakeEnhancedDbAdapter,
      PriorityScorer: FakePriorityScorer,
      ProblemClusteringService: FakeProblemClusteringService,
      PlannerKnowledgeService: FakePlannerKnowledgeService,
      ProblemResolutionService: FakeProblemResolutionService,
      logger: { log: jest.fn(), warn: jest.fn() }
    });

    const dbAdapter = {
      isEnabled: () => dbEnabled
    };

    return { manager, closed, dbAdapter };
  };

  test('initializes services when feature flags request them', async () => {
    const flags = {
      gapDrivenPrioritization: true,
      problemClustering: true,
      plannerKnowledgeReuse: true,
      realTimeCoverageAnalytics: true,
      problemResolution: true
    };
    const { manager, dbAdapter } = createManager({ flags });

    await manager.initialize({ dbAdapter, jobId: 'job-123' });

    const enabled = manager.getEnabledFeatures();
    expect(enabled.gapDrivenPrioritization).toBe(true);
    expect(enabled.problemClustering).toBe(true);
    expect(enabled.plannerKnowledgeReuse).toBe(true);
    expect(enabled.realTimeCoverageAnalytics).toBe(true);
    expect(enabled.problemResolution).toBe(true);
    expect(manager.getEnhancedDbAdapter()).toBeTruthy();
    expect(manager.getProblemClusteringService()).toBeTruthy();
    expect(manager.getPlannerKnowledgeService()).toBeTruthy();
    expect(manager.getProblemResolutionService()).toBeTruthy();
  });

  test('computePriority falls back to base when features disabled', () => {
    const { manager } = createManager({ flags: {} });
    const baseFn = jest.fn(() => 42);

    const result = manager.computePriority({ type: 'article', depth: 0 }, {
      computeBasePriority: baseFn,
      jobId: 'job-x'
    });

    expect(baseFn).toHaveBeenCalled();
    expect(result).toEqual({
      priority: 42,
      prioritySource: 'base',
      bonusApplied: 0,
      basePriority: 42
    });
  });

  test('computePriority uses priority scorer when enabled', async () => {
    const { manager, dbAdapter } = createManager({
      flags: { gapDrivenPrioritization: true }
    });
    await manager.initialize({ dbAdapter, jobId: 'job-y' });

    const result = manager.computePriority({ priority: 5 }, {
      computeBasePriority: () => 5,
      jobId: 'job-y'
    });

    expect(result.prioritySource).toBe('enhanced');
    expect(result.priority).toBe(15);
  });

  test('cleanup closes services and resets state', async () => {
    const { manager, dbAdapter, closed } = createManager({
      flags: {
        gapDrivenPrioritization: true,
        problemClustering: true,
        plannerKnowledgeReuse: true,
        problemResolution: true
      }
    });
    await manager.initialize({ dbAdapter, jobId: 'job-z' });

    manager.cleanup();

    expect(closed.scorer).toBe(true);
    expect(closed.clustering).toBe(true);
    expect(closed.knowledge).toBe(true);
    expect(closed.resolution).toBe(true);
    expect(manager.getEnhancedDbAdapter()).toBeNull();
    expect(manager.getEnabledFeatures().gapDrivenPrioritization).toBe(false);
  });

  test('does not initialize problem resolution when flag disabled', async () => {
    const { manager, dbAdapter } = createManager({ flags: { problemResolution: false } });
    await manager.initialize({ dbAdapter, jobId: 'job-flag' });
    expect(manager.getProblemResolutionService()).toBeNull();
    expect(manager.getEnabledFeatures().problemResolution).toBe(false);
  });
});
