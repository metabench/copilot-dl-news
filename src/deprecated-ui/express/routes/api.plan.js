'use strict';

const express = require('express');
const {
  PlanningSessionConflictError,
  PlanningSessionNotFoundError,
  PlanningSessionError
} = require('../services/planning/PlanningSessionManager');
const {
  CrawlAlreadyRunningError,
  InvalidCrawlOptionsError
} = require('../services/errors/ServiceErrors');

function createPlanningApiRouter(options = {}) {
  const {
    planningSessionManager,
    asyncPlanRunner,
    jobRegistry,
    crawlOrchestrationService,
    broadcast,
    crawlerManager = null,
    allowMultiJobs = false
  } = options;

  if (!planningSessionManager || typeof planningSessionManager.createSession !== 'function' || typeof planningSessionManager.getSession !== 'function') {
    throw new Error('createPlanningApiRouter requires planningSessionManager with session lifecycle methods');
  }
  if (!asyncPlanRunner || typeof asyncPlanRunner.startPreview !== 'function') {
    throw new Error('createPlanningApiRouter requires asyncPlanRunner');
  }
  if (!jobRegistry || typeof jobRegistry.checkStartAllowed !== 'function') {
    throw new Error('createPlanningApiRouter requires jobRegistry');
  }
  if (!crawlOrchestrationService || typeof crawlOrchestrationService.startCrawl !== 'function') {
    throw new Error('createPlanningApiRouter requires crawlOrchestrationService');
  }
  if (typeof broadcast !== 'function') {
    throw new Error('createPlanningApiRouter requires broadcast(event, payload)');
  }

  const router = express.Router();

  router.post('/api/crawl/plan', (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const options = body.options && typeof body.options === 'object' ? body.options : body;
    const sessionKey = typeof body.sessionKey === 'string' ? body.sessionKey : null;
    const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};
    const tags = body.tags && typeof body.tags === 'object' ? body.tags : null;

    try {
      const session = asyncPlanRunner.startPreview({
        options,
        sessionKey,
        metadata,
        tags
      });
      res.status(202).json({
        sessionId: session.id,
        status: session.status,
        expiresAt: session.expiresAt,
        options: session.options,
        metadata: session.metadata,
        sessionKey: session.metadata?.sessionKey || null
      });
    } catch (error) {
      if (error instanceof PlanningSessionConflictError) {
        const existing = planningSessionManager.getSession(error.sessionId);
        return res.status(409).json({
          error: 'session-conflict',
          message: error.message,
          session: existing
        });
      }
      return res.status(400).json({
        error: 'plan-start-failed',
        message: error.message || 'Failed to start planner preview'
      });
    }
  });

  router.get('/api/crawl/plan/:sessionId/status', (req, res) => {
    const sessionId = String(req.params.sessionId || '').trim();
    if (!sessionId) {
      return res.status(400).json({ error: 'invalid-session-id' });
    }
    const snapshot = planningSessionManager.getSession(sessionId);
    if (!snapshot) {
      return res.status(404).json({ error: 'session-not-found' });
    }
    return res.json({ session: snapshot });
  });

  router.post('/api/crawl/plan/:sessionId/cancel', (req, res) => {
    const sessionId = String(req.params.sessionId || '').trim();
    if (!sessionId) {
      return res.status(400).json({ error: 'invalid-session-id' });
    }

    try {
      const cancelled = asyncPlanRunner.cancel(sessionId, 'cancelled-by-client');
      const session = planningSessionManager.getSession(sessionId);
      return res.json({
        cancelled: !!cancelled,
        session
      });
    } catch (error) {
      if (error instanceof PlanningSessionNotFoundError) {
        return res.status(404).json({ error: 'session-not-found' });
      }
      return res.status(400).json({
        error: 'cancel-failed',
        message: error.message || 'Failed to cancel planning session'
      });
    }
  });

  router.post('/api/crawl/plan/:sessionId/confirm', (req, res) => {
    const sessionId = String(req.params.sessionId || '').trim();
    if (!sessionId) {
      return res.status(400).json({ error: 'invalid-session-id' });
    }

    const session = planningSessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'session-not-found' });
    }

    if (session.status !== 'ready') {
      return res.status(409).json({
        error: 'invalid-session-state',
        message: `Cannot confirm session in status ${session.status}`
      });
    }

    const providedOptions = req.body && typeof req.body === 'object' ? req.body.options : null;
    if (providedOptions && !_optionsEqual(session.options, providedOptions)) {
      return res.status(409).json({
        error: 'options-mismatch',
        message: 'Confirmation options do not match session options'
      });
    }

    const status = jobRegistry.checkStartAllowed();
    if (!status.ok && !allowMultiJobs) {
      return res.status(409).json({
        error: status.reason || 'crawl-not-allowed',
        message: 'Crawler is not ready to start a new job'
      });
    }

    try {
      const result = crawlOrchestrationService.startCrawl(session.options || {}, { crawlerManager });
      const snapshot = planningSessionManager.confirmSession(sessionId, { jobId: result.jobId });

      if (crawlerManager && typeof crawlerManager.noteJobStart === 'function') {
        try {
          crawlerManager.noteJobStart({
            jobId: result.jobId,
            url: result.url,
            mode: 'preview-confirmed',
            argsSource: 'api.crawl.plan.confirm',
            planSessionId: sessionId,
            startedAt: result.startedAt
          });
        } catch (_) {}
      }

      broadcast('plan-status', {
        sessionId,
        status: 'confirmed',
        jobId: result.jobId,
        session: snapshot
      });
      return res.status(202).json({
        jobId: result.jobId,
        startedAt: result.startedAt,
        sessionId,
        session: snapshot
      });
    } catch (error) {
      if (error instanceof CrawlAlreadyRunningError) {
        return res.status(409).json({ error: 'already-running', message: error.message });
      }
      if (error instanceof InvalidCrawlOptionsError) {
        return res.status(400).json({ error: 'invalid-options', message: error.message });
      }
      if (error instanceof PlanningSessionError) {
        return res.status(400).json({ error: error.code || 'session-error', message: error.message });
      }
      return res.status(500).json({
        error: 'confirm-failed',
        message: error.message || 'Failed to confirm plan'
      });
    }
  });

  return router;
}

function _optionsEqual(a, b) {
  try {
    return _stableStringify(a) === _stableStringify(b);
  } catch (_) {
    return false;
  }
}

function _stableStringify(value) {
  if (value === undefined) {
    return 'undefined';
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return String(value);
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((item) => _stableStringify(item)).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  const props = keys.map((key) => `${JSON.stringify(key)}:${_stableStringify(value[key])}`);
  return '{' + props.join(',') + '}';
}

module.exports = {
  createPlanningApiRouter
};
