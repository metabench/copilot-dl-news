const { createSequenceRunner } = require('../../core/orchestration/SequenceRunner');
const { createCliLogger } = require('../../cli/progressReporter');

function createStartupSequenceRunner(crawler) {
  const log = createCliLogger();
  const wrap = (handler) => async (_startUrl, overrides = {}) => {
    try {
      const result = await handler.call(crawler, overrides || {});
      if (result && typeof result === 'object' && typeof result.status === 'string') {
        return result;
      }
      if (result && typeof result === 'object') {
        return { status: 'ok', ...result };
      }
      return { status: 'ok' };
    } catch (error) {
      crawler._lastSequenceError = error;
      throw error;
    }
  };

  const operations = {
    init: wrap(async () => {
      await crawler.init();
    }),
    planner: wrap(async () => {
      await crawler._runPlannerStage();
    }),
    sitemaps: wrap(async () => {
      await crawler._runSitemapStage();
    }),
    seedStartUrl: wrap(async (overrides) => {
      crawler._seedInitialRequest(overrides);
    }),
    markStartupComplete: wrap(async (overrides) => {
      const message = overrides && typeof overrides.message === 'string'
        ? overrides.message
        : overrides && typeof overrides.statusText === 'string'
          ? overrides.statusText
          : null;
      crawler._markStartupComplete(message);
    }),
    runSequentialLoop: wrap(async () => {
      await crawler._runSequentialLoop();
    }),
    runConcurrentWorkers: wrap(async () => {
      await crawler._runConcurrentWorkers();
    }),
    runGazetteerMode: wrap(async () => {
      await crawler._runGazetteerMode();
    })
  };

  operations.listOperations = () => [
    'init',
    'planner',
    'sitemaps',
    'seedStartUrl',
    'markStartupComplete',
    'runSequentialLoop',
    'runConcurrentWorkers',
    'runGazetteerMode'
  ];

  const telemetryAdapter = {
    onSequenceStart: (payload) => {
      if (crawler.telemetry && typeof crawler.telemetry.milestoneOnce === 'function') {
        crawler.telemetry.milestoneOnce(`sequence:start:${payload.sequence?.sequenceName || 'unknown'}`, {
          kind: 'sequence-start',
          message: `Starting sequence ${payload.sequence?.sequenceName || 'unknown'}`,
          details: payload
        });
      }
    },
    onSequenceComplete: (payload) => {
      if (crawler.telemetry && typeof crawler.telemetry.milestoneOnce === 'function') {
        crawler.telemetry.milestoneOnce(`sequence:complete:${payload.sequence?.sequenceName || 'unknown'}`, {
          kind: 'sequence-complete',
          message: `Completed sequence ${payload.sequence?.sequenceName || 'unknown'}`,
          details: payload
        });
      }
    },
    onStepEvent: (payload) => {
      if (crawler.telemetry && typeof crawler.telemetry.milestoneOnce === 'function') {
        crawler.telemetry.milestoneOnce(`sequence:step:${payload.step?.id || 'unknown'}`, {
          kind: 'sequence-step',
          message: `Step ${payload.step?.id || 'unknown'}: ${payload.event}`,
          details: payload
        });
      }
    }
  };

  return createSequenceRunner({ operations, logger: log, telemetry: telemetryAdapter });
}

function buildStartupSequence(crawler, mode) {
  const metadata = { sequenceName: `newsCrawler:${mode}`, mode };
  if (mode === 'gazetteer') {
    return { metadata, startUrl: crawler.startUrl, steps: [
      { id: 'init', operation: 'init', label: 'Initialize crawler' },
      { id: 'gazetteer', operation: 'runGazetteerMode', label: 'Run gazetteer mode' }
    ] };
  }
  const steps = [
    { id: 'init', operation: 'init', label: 'Initialize crawler' },
    { id: 'planner', operation: 'planner', label: 'Run planner' },
    { id: 'sitemaps', operation: 'sitemaps', label: 'Load sitemaps' },
    { id: 'seed-start-url', operation: 'seedStartUrl', label: 'Seed start URL', overrides: { respectSitemapOnly: mode !== 'sequential' } },
    { id: 'startup-complete', operation: 'markStartupComplete', label: 'Mark startup complete' }
  ];
  steps.push(mode === 'sequential'
    ? { id: 'sequential-loop', operation: 'runSequentialLoop', label: 'Process crawl queue' }
    : { id: 'concurrent-workers', operation: 'runConcurrentWorkers', label: 'Run crawl workers' });
  return { metadata, startUrl: crawler.startUrl, steps };
}

module.exports = { createStartupSequenceRunner, buildStartupSequence };
