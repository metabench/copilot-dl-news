const { StartupProgressTracker } = require('../StartupProgressTracker');

describe('StartupProgressTracker', () => {
  test('emits running and completion summaries', () => {
    const emissions = [];
    const tracker = new StartupProgressTracker({
      emit: (payload, statusText) => emissions.push({ payload, statusText })
    });

    tracker.startStage('db', { label: 'Open database' });
    tracker.completeStage('db', { label: 'Open database' });

    expect(emissions[0].payload.summary.running).toBe('db');
    expect(emissions[0].statusText).toBe('Open database…');

    const final = emissions[emissions.length - 1];
    expect(final.payload.summary.completed).toBe(1);
    expect(final.payload.summary.done).toBe(true);
    expect(final.statusText).toBe('Startup complete');
  });

  test('marks failed stages and surfaces error', () => {
    const emissions = [];
    const tracker = new StartupProgressTracker({
      emit: (payload, statusText) => emissions.push({ payload, statusText })
    });

    tracker.startStage('planner', { label: 'Plan intelligent crawl' });
    tracker.failStage('planner', 'boom', { label: 'Plan intelligent crawl' });

    const final = emissions[emissions.length - 1];
    expect(final.payload.summary.failed).toBe(1);
    expect(final.payload.stages[0].error).toBe('boom');
    expect(final.statusText).toBe('Plan intelligent crawl failed');
  });

  test('skipped stages contribute to completion progress', () => {
    const emissions = [];
    const tracker = new StartupProgressTracker({
      emit: (payload, statusText) => emissions.push({ payload, statusText })
    });

    tracker.skipStage('sitemaps', { label: 'Load sitemaps', message: 'disabled' });

    const final = emissions[emissions.length - 1];
    expect(final.payload.summary.skipped).toBe(1);
    expect(final.payload.summary.done).toBe(true);
    expect(final.payload.stages[0].message).toBe('disabled');
    expect(final.statusText).toBe('Startup complete');
  });
});
