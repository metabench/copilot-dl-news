jest.mock('../planner/CompletionReporter', () => {
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

const createTelemetry = () => ({
  milestoneOnce: jest.fn(),
  problem: jest.fn()
});

const createState = () => ({
  note: jest.fn()
});

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

    expect(telemetry.milestoneOnce).toHaveBeenCalledWith('depth2-coverage-10', expect.any(Object));
    expect(telemetry.milestoneOnce).toHaveBeenCalledWith('downloads-1k', expect.any(Object));
    expect(telemetry.milestoneOnce).toHaveBeenCalledWith('articles-found-1k', expect.any(Object));
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
});
