jest.mock('../intelligence/planner/CompletionReporter', () => {
  const emit = jest.fn();
  const updateDependencies = jest.fn();

  const CompletionReporter = jest.fn(() => ({
    emit,
    updateDependencies
  }));

  CompletionReporter.__emit = emit;
  CompletionReporter.__updateDependencies = updateDependencies;

  return {
    CompletionReporter
  };
});

const { MilestoneTracker } = require('../MilestoneTracker');
const { CompletionReporter } = require('../planner/CompletionReporter');
const { createRepeatedCrawlsMilestone, createIdentifiedCountryHubsMilestone } = require('../milestones');

const createTelemetry = () => ({
  milestoneOnce: jest.fn(),
  problem: jest.fn()
});

const createState = () => ({
  note: jest.fn()
});

const createHubState = ({ seeded = [], visited = [] } = {}) => {
  const seededSet = new Set(seeded);
  const visitedSet = new Set(visited);
  const getStatsSnapshot = () => ({
    perKind: {
      country: {
        seeded: seededSet.size,
        visited: visitedSet.size
      }
    }
  });
  return {
    seededSet,
    visitedSet,
    getHubVisitStats: jest.fn(() => getStatsSnapshot()),
    getSeededHubSet: jest.fn(() => seededSet),
    getSeededHubMeta: jest.fn(() => ({ kind: 'country' })),
    hasVisitedHub: jest.fn((url) => visitedSet.has(url)),
    markVisited(url) {
      visitedSet.add(url);
    }
  };
};

describe('MilestoneTracker', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('emits milestones and schedules history check when thresholds met', () => {
    const telemetry = createTelemetry();
    const scheduleWideHistoryCheck = jest.fn();
    const tracker = new MilestoneTracker({
      telemetry,
      state: createState(),
      domain: 'example.com',
      getStats: () => ({
        depth2PagesProcessed: 12,
        pagesDownloaded: 1500,
        articlesFound: 1200
      }),
      plannerEnabled: true,
      scheduleWideHistoryCheck
    });

    tracker.checkAnalysisMilestones({
      depth: 2,
      isArticle: true
    });

    expect(telemetry.milestoneOnce).toHaveBeenCalledWith('depth2-coverage-10', expect.objectContaining({
      kind: 'coverage-depth2'
    }));
    expect(telemetry.milestoneOnce).toHaveBeenCalledWith('downloads-1k', expect.objectContaining({
      kind: 'downloads'
    }));
    expect(telemetry.milestoneOnce).toHaveBeenCalledWith('articles-found-1k', expect.objectContaining({
      kind: 'articles-found'
    }));
    expect(scheduleWideHistoryCheck).toHaveBeenCalledWith({
      depth: 2,
      articlesFound: 1200
    });
  });

  test('delegates completion emission to CompletionReporter', () => {
    const telemetry = createTelemetry();
    const tracker = new MilestoneTracker({
      telemetry,
      state: createState(),
      domain: 'example.com',
      getStats: () => ({ pagesDownloaded: 0 }),
      getPlanSummary: () => ({ step: 'done' }),
      plannerEnabled: true
    });

    tracker.emitCompletionMilestone({ outcomeErr: null });

    expect(CompletionReporter).toHaveBeenCalledTimes(1);
    expect(CompletionReporter).toHaveBeenCalledWith({
      state: expect.any(Object),
      telemetry,
      domain: 'example.com',
      getPlanSummary: expect.any(Function),
      getStats: expect.any(Function)
    });
    expect(CompletionReporter.__emit).toHaveBeenCalledWith({ outcomeErr: null });

    tracker.emitCompletionMilestone({ outcomeErr: new Error('boom') });

    expect(CompletionReporter).toHaveBeenCalledTimes(1);
    expect(CompletionReporter.__updateDependencies).toHaveBeenCalledWith({
      state: expect.any(Object),
      telemetry,
      domain: 'example.com',
      getPlanSummary: expect.any(Function),
      getStats: expect.any(Function)
    });
    expect(CompletionReporter.__emit).toHaveBeenCalledWith({ outcomeErr: expect.any(Error) });
  });

  test('repeated depth crawl milestone can be enabled via options', () => {
    const telemetry = createTelemetry();
    const tracker = new MilestoneTracker({
      telemetry,
      state: createState(),
      getStats: () => ({ depth2PagesProcessed: 15 }),
      milestones: [
        createRepeatedCrawlsMilestone({ enabled: true, countThreshold: 10 })
      ]
    });

    tracker.checkAnalysisMilestones({ depth: 2, isArticle: true });

    expect(telemetry.milestoneOnce).toHaveBeenCalledWith('repeated-depth-crawls', expect.objectContaining({
      kind: 'repeated-depth-crawls',
      message: 'Completed 15 depth-2 page visits (threshold 10)',
      details: {
        depthThreshold: 2,
        countThreshold: 10,
        processed: 15
      }
    }));

    tracker.checkAnalysisMilestones({ depth: 2, isArticle: true });
    expect(telemetry.milestoneOnce).toHaveBeenCalledTimes(1);
  });

  test('tracks country hub goal progress and plans follow-up actions', () => {
    const telemetry = createTelemetry();
    const goalExecutor = jest.fn();
    const seeded = [
      'https://news.example/world/france',
      'https://news.example/world/germany',
      'https://news.example/world/italy',
      'https://news.example/world/spain'
    ];
    const visited = [
      'https://news.example/world/france',
      'https://news.example/world/germany',
      'https://news.example/world/italy'
    ];
    const hubState = createHubState({ seeded, visited });

    const tracker = new MilestoneTracker({
      telemetry,
      state: hubState,
      getStats: () => ({}),
      milestones: [
        createIdentifiedCountryHubsMilestone({
          enabled: true,
          minSeeded: 4,
          visitRatioThreshold: 0.95,
          maxMissingSample: 10
        })
      ],
      goalPlanExecutor: goalExecutor
    });

    tracker.checkAnalysisMilestones();

    expect(goalExecutor).toHaveBeenCalledTimes(1);
    const [{ goalId, plan }] = goalExecutor.mock.calls[0];
    expect(goalId).toBe('goal-identify-country-hubs');
    expect(plan.actions).toEqual([
      {
        type: 'enqueue-hub-fetch',
        url: 'https://news.example/world/spain',
        depth: 1
      }
    ]);

    const goals = tracker.getGoalsSummary();
    expect(goals).toHaveLength(1);
    expect(goals[0]).toMatchObject({
      id: 'goal-identify-country-hubs',
      completed: false,
      progress: expect.any(Number),
      nextSteps: [
        {
          type: 'fetch-country-hub',
          url: 'https://news.example/world/spain',
          depth: 1
        }
      ]
    });

    hubState.markVisited('https://news.example/world/spain');

    tracker.checkAnalysisMilestones();

    expect(telemetry.milestoneOnce).toHaveBeenCalledWith('identified-country-hubs', expect.any(Object));
    const updatedGoals = tracker.getGoalsSummary();
    expect(updatedGoals[0].completed).toBe(true);
    expect(updatedGoals[0].progress).toBe(1);
  });
});
