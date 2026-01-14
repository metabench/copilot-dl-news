'use strict';

const express = require('express');
const {
  ensureAnalysisRunSchema,
  listAnalysisRuns,
  getAnalysisRun
} = require('../../deprecated-ui/express/services/analysisRuns');
const {
  countArticlesNeedingAnalysis,
  getAnalysisStatusCounts
} = require('../../data/db/queries/analysisQueries');

function createErrorPayload(code, message) {
  return {
    error: code,
    message,
    timestamp: new Date().toISOString()
  };
}

function defaultLogger(logger) {
  if (logger && typeof logger.error === 'function') {
    return logger;
  }
  return console;
}

function coerceInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function createAnalysisRouter({ getDbRW, logger } = {}) {
  const router = express.Router();
  const log = defaultLogger(logger);

  function resolveDb(res) {
    if (typeof getDbRW !== 'function') {
      res.status(503).json(createErrorPayload('DATABASE_UNAVAILABLE', 'Writable database is not available.'));
      return null;
    }

    try {
      const db = getDbRW();
      if (!db) {
        res.status(503).json(createErrorPayload('DATABASE_UNAVAILABLE', 'Writable database is not available.'));
        return null;
      }
      return db;
    } catch (error) {
      log.error('Failed to resolve database connection for analysis router:', error);
      res.status(500).json(createErrorPayload('INTERNAL_ERROR', error.message || 'Failed to acquire database connection.'));
      return null;
    }
  }

  router.get('/', (req, res) => {
    const db = resolveDb(res);
    if (!db) {
      return;
    }

    try {
      ensureAnalysisRunSchema(db);
      const limit = req.query.limit != null ? coerceInteger(req.query.limit, undefined) : undefined;
      const offset = req.query.offset != null ? coerceInteger(req.query.offset, undefined) : undefined;
      const includeDetailsParam = req.query.includeDetails;
      const includeDetails = includeDetailsParam == null
        ? true
        : includeDetailsParam === 'true' || includeDetailsParam === true;

      const result = listAnalysisRuns(db, { limit, offset, includeDetails });

      res.json({
        total: result.total,
        items: result.items,
        includeDetails
      });
    } catch (error) {
      log.error('Failed to list analysis runs:', error);
      res.status(500).json(createErrorPayload('INTERNAL_ERROR', error.message || 'Failed to list analysis runs.'));
    }
  });

  router.get('/status', (req, res) => {
    const db = resolveDb(res);
    if (!db) {
      return;
    }

    try {
      const counts = getAnalysisStatusCounts(db);
      res.json(counts);
    } catch (error) {
      log.error('Failed to fetch analysis status counts:', error);
      res.status(500).json(createErrorPayload('INTERNAL_ERROR', error.message || 'Failed to fetch analysis status counts.'));
    }
  });

  router.get('/count', (req, res) => {
    const db = resolveDb(res);
    if (!db) {
      return;
    }

    try {
      const version = req.query.version != null ? coerceInteger(req.query.version, 1) : 1;
      const result = countArticlesNeedingAnalysis(db, version);

      res.json({
        count: Number(result?.needingAnalysis || 0),
        analysisVersion: version
      });
    } catch (error) {
      log.error('Failed to count analysis backlog:', error);
      res.status(500).json(createErrorPayload('INTERNAL_ERROR', error.message || 'Failed to count analysis backlog.'));
    }
  });

  router.get('/:id', (req, res) => {
    const identifier = String(req.params.id || '').trim();
    if (!identifier) {
      return res.status(400).json(createErrorPayload('INVALID_ANALYSIS_ID', 'Analysis id is required.'));
    }

    const db = resolveDb(res);
    if (!db) {
      return;
    }

    try {
      ensureAnalysisRunSchema(db);
      const eventsLimit = req.query.eventsLimit != null
        ? coerceInteger(req.query.eventsLimit, undefined)
        : req.query.limit != null
          ? coerceInteger(req.query.limit, undefined)
          : undefined;

      const run = getAnalysisRun(db, identifier, { limitEvents: eventsLimit });
      if (!run) {
        return res.status(404).json(createErrorPayload('ANALYSIS_NOT_FOUND', 'Analysis run not found.'));
      }

      res.json(run);
    } catch (error) {
      log.error('Failed to fetch analysis run:', error);
      res.status(500).json(createErrorPayload('INTERNAL_ERROR', error.message || 'Failed to fetch analysis run.'));
    }
  });

  return router;
}

module.exports = {
  createAnalysisRouter
};
