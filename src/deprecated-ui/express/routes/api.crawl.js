const express = require('express');
const { performance } = require('perf_hooks');
const { CrawlOrchestrationService } = require('../services/core/CrawlOrchestrationService');
const { JobEventHandlerService } = require('../services/core/JobEventHandlerService');
const { recordCrawlJobStart, markCrawlJobStatus } = require('../data/crawlJobs');
const {
  insertQueueEvent,
  insertCrawlProblem,
  insertPlannerStageEvent,
  insertCrawlMilestone
} = require('../data/crawlEvents');
const { 
  CrawlAlreadyRunningError, 
  InvalidCrawlOptionsError 
} = require('../services/errors/ServiceErrors');
const { ConflictError, InternalServerError } = require('../errors/HttpError');

function createCrawlStartRouter(options = {}) {
  const {
    jobRegistry,
    allowMultiJobs = false,
    urlsDbPath,
    runner,
    buildArgs,
    broadcast,
    broadcastJobs,
    broadcastProgress,
    broadcastTelemetry = null,
    getDbRW,
    queueDebug = false,
    metrics,
    QUIET = false,
    traceStart = false,
    crawlerManager = null,
    eventHandlerService: providedEventHandler,
    crawlOrchestrationService: providedCrawlService
  } = options;

  if (!jobRegistry) {
    throw new Error('createCrawlStartRouter requires jobRegistry');
  }
  if (typeof urlsDbPath !== 'string' || !urlsDbPath) {
    throw new Error('createCrawlStartRouter requires urlsDbPath');
  }
  if (!runner || typeof runner.start !== 'function') {
    throw new Error('createCrawlStartRouter requires runner.start');
  }
  if (typeof buildArgs !== 'function') {
    throw new Error('createCrawlStartRouter requires buildArgs(requestBody)');
  }
  if (typeof broadcast !== 'function') {
    throw new Error('createCrawlStartRouter requires broadcast(event, data, jobId)');
  }
  if (typeof broadcastJobs !== 'function') {
    throw new Error('createCrawlStartRouter requires broadcastJobs(force)');
  }
  if (typeof broadcastProgress !== 'function') {
    throw new Error('createCrawlStartRouter requires broadcastProgress(payload, jobId, metrics)');
  }
  if (typeof getDbRW !== 'function') {
    throw new Error('createCrawlStartRouter requires getDbRW()');
  }
  if (!metrics || typeof metrics !== 'object') {
    throw new Error('createCrawlStartRouter requires metrics object');
  }

  const eventHandlerService = providedEventHandler instanceof JobEventHandlerService
    ? providedEventHandler
    : new JobEventHandlerService({
        jobRegistry,
        broadcast,
        broadcastJobs,
        broadcastProgress,
        broadcastTelemetry,
        getDbRW,
        dbOperations: {
          markCrawlJobStatus,
          insertQueueEvent,
          insertCrawlProblem,
          insertPlannerStageEvent,
          insertCrawlMilestone
        },
        QUIET,
        queueDebug,
        traceStart,
        crawlerManager
      });

  const crawlOrchestrationService = providedCrawlService instanceof CrawlOrchestrationService
    ? providedCrawlService
    : new CrawlOrchestrationService({
        jobRegistry,
        runner,
        buildArgs,
        urlsDbPath,
        getDbRW,
        recordJobStart: recordCrawlJobStart,
        eventHandler: eventHandlerService,
        broadcastJobs,
        QUIET
      });

  const jobs = jobRegistry.getJobs();
  const crawlState = jobRegistry.getCrawlState();

  const router = express.Router();

  router.post('/api/crawl', async (req, res, next) => {
    const perfStart = performance.now();
    const t0 = Date.now();

    try {
      console.log(`[api] POST /api/crawl received (runningJobs=${jobs.size})`);
    } catch (_) {}

    try {
      // Use service to start crawl
      const result = await crawlOrchestrationService.startCrawl(req.body || {}, { 
        crawlerManager, 
        t0 
      });

      // Notify crawler manager
      if (crawlerManager && typeof crawlerManager.noteJobStart === 'function') {
        try {
          crawlerManager.noteJobStart({
            jobId: result.jobId,
            url: result.url,
            mode: 'fresh',
            argsSource: 'api.crawl',
            startedAt: result.startedAt
          });
        } catch (_) {}
      }

      const durationMs = Number((performance.now() - perfStart).toFixed(3));

      // Return HTTP response
      res.status(202).json({ 
        pid: result.process?.pid || null, 
        args: result.args, 
        jobId: result.jobId, 
        stage: result.stage, 
        message: 'Crawl started',
        durationMs 
      });

      if (traceStart) {
        const t1 = Date.now();
        try {
          console.log(`[trace] start handler total=${t1 - t0}ms durationMs=${durationMs}`);
        } catch (_) {}
      }
    } catch (err) {
      // Convert domain errors to HTTP errors
      if (err instanceof CrawlAlreadyRunningError) {
        try {
          console.log('[api] POST /api/crawl -> 409 already-running');
        } catch (_) {}
        return next(new ConflictError(err.message));
      }
      
      if (err instanceof InvalidCrawlOptionsError) {
        return next(new ConflictError(err.message));
      }

      // Generic error
      return next(new InternalServerError(err.message || 'Failed to start crawl'));
    }
  });

  return router;
}

module.exports = {
  createCrawlStartRouter
};
