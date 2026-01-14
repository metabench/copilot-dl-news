'use strict';

const express = require('express');
const {
  createCrawlService,
  buildAvailabilityPayload,
  SequenceConfigError
} = require('../../../../../core/crawlService');

function parseBoolean(value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function ensurePlainObject(value, field) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  const error = new Error(`${field} must be an object.`);
  error.statusCode = 400;
  error.code = 'BAD_REQUEST';
  throw error;
}

function createService(context = {}) {
  if (context.crawlService && typeof context.crawlService === 'object') {
    return context.crawlService;
  }
  const factory = context.createCrawlService || createCrawlService;
  const serviceOptions = context.serviceOptions || {};
  return factory(serviceOptions);
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function mapError(error) {
  if (error instanceof SequenceConfigError) {
    return {
      status: 400,
      code: 'SEQUENCE_CONFIG_ERROR',
      message: error.message || error.reason || 'Sequence configuration failed.'
    };
  }

  if (error && typeof error.statusCode === 'number') {
    return {
      status: error.statusCode,
      code: error.code || 'BAD_REQUEST',
      message: error.message || 'Invalid request.'
    };
  }

  const message = error && error.message ? error.message : 'Unexpected error while processing request.';
  if (message.toLowerCase().includes('required') || message.toLowerCase().includes('unknown')) {
    return {
      status: 400,
      code: 'BAD_REQUEST',
      message
    };
  }

  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: 'Unexpected error while processing crawl request.'
  };
}

function registerOperationRoutes(app, context = {}) {
  if (!app || typeof app.use !== 'function') {
    throw new Error('An Express-compatible app instance is required to register crawl routes.');
  }

  const {
    logger = console,
    basePath = `/${context.version || 'v1'}`
  } = context;

  const service = createService(context);
  const inProcessJobRegistry = context.inProcessJobRegistry && typeof context.inProcessJobRegistry.list === 'function'
    ? context.inProcessJobRegistry
    : null;
  const router = express.Router();
  router.use(express.json({ limit: '1mb' }));

  if (inProcessJobRegistry) {
    router.get(
      '/jobs',
      asyncHandler(async (req, res) => {
        res.json({
          status: 'ok',
          items: inProcessJobRegistry.list()
        });
      })
    );

    router.get(
      '/jobs/:jobId',
      asyncHandler(async (req, res) => {
        const job = inProcessJobRegistry.get(req.params.jobId);
        if (!job) {
          res.status(404).json({
            status: 'error',
            error: {
              code: 'NOT_FOUND',
              message: 'Job not found.'
            }
          });
          return;
        }
        res.json({ status: 'ok', job });
      })
    );

    router.post(
      '/jobs/:jobId/:action',
      asyncHandler(async (req, res) => {
        const { jobId, action } = req.params;

        if (action !== 'pause' && action !== 'resume' && action !== 'stop') {
          res.status(400).json({
            status: 'error',
            error: {
              code: 'BAD_REQUEST',
              message: 'Unknown job action.'
            }
          });
          return;
        }

        const ok = action === 'pause'
          ? await inProcessJobRegistry.pause(jobId)
          : action === 'resume'
            ? await inProcessJobRegistry.resume(jobId)
            : await inProcessJobRegistry.stop(jobId);

        if (!ok) {
          res.status(404).json({
            status: 'error',
            error: {
              code: 'NOT_FOUND',
              message: 'Job not found.'
            }
          });
          return;
        }

        res.json({ status: 'ok' });
      })
    );

    router.post(
      '/operations/:operationName/start',
      asyncHandler(async (req, res) => {
        const { operationName } = req.params;
        const { startUrl, overrides } = req.body || {};

        if (!operationName) {
          const error = new Error('operationName path parameter is required.');
          error.statusCode = 400;
          error.code = 'BAD_REQUEST';
          throw error;
        }
        if (!startUrl) {
          const error = new Error('startUrl is required to start an operation.');
          error.statusCode = 400;
          error.code = 'BAD_REQUEST';
          throw error;
        }

        const normalizedOverrides = ensurePlainObject(overrides, 'overrides') || {};
        const { jobId, job } = inProcessJobRegistry.startOperation({
          logger,
          operationName,
          startUrl,
          overrides: normalizedOverrides
        });

        res.json({
          status: 'ok',
          mode: 'operation-job',
          jobId,
          job
        });
      })
    );
  }

  router.get(
    '/availability',
    asyncHandler(async (req, res) => {
      const includeAll = parseBoolean(req.query.all, false);
      const includeOperations = includeAll || parseBoolean(req.query.operations, true);
      const includeSequences = includeAll || parseBoolean(req.query.sequences, true);

      const availability = service.getAvailability({ logger });
      const payload =
        buildAvailabilityPayload(
          availability,
          {
            showOperationsList: includeOperations,
            showSequencesList: includeSequences
          },
          includeAll
        ) || {};

      res.json({
        status: 'ok',
        availability: payload,
        totals: {
          operations: Array.isArray(availability.operations) ? availability.operations.length : 0,
          sequencePresets: Array.isArray(availability.sequences) ? availability.sequences.length : 0
        }
      });
    })
  );

  router.post(
    '/operations/:operationName/run',
    asyncHandler(async (req, res) => {
      const { operationName } = req.params;
      const { startUrl, overrides } = req.body || {};

      if (!operationName) {
        const error = new Error('operationName path parameter is required.');
        error.statusCode = 400;
        error.code = 'BAD_REQUEST';
        throw error;
      }
      if (!startUrl) {
        const error = new Error('startUrl is required to run an operation.');
        error.statusCode = 400;
        error.code = 'BAD_REQUEST';
        throw error;
      }

      const normalizedOverrides = ensurePlainObject(overrides, 'overrides') || {};
      const result = await service.runOperation({
        logger,
        operationName,
        startUrl,
        overrides: normalizedOverrides
      });

      res.json({
        status: 'ok',
        mode: 'operation',
        operation: {
          name: operationName,
          startUrl,
          overrides: normalizedOverrides
        },
        result
      });
    })
  );

  router.post(
    '/sequences/presets/:sequenceName/run',
    asyncHandler(async (req, res) => {
      const { sequenceName } = req.params;
      const {
        startUrl,
        sharedOverrides,
        stepOverrides,
        continueOnError,
        context: sequenceContext
      } = req.body || {};

      if (!sequenceName) {
        const error = new Error('sequenceName path parameter is required.');
        error.statusCode = 400;
        error.code = 'BAD_REQUEST';
        throw error;
      }
      if (!startUrl) {
        const error = new Error('startUrl is required to run a sequence preset.');
        error.statusCode = 400;
        error.code = 'BAD_REQUEST';
        throw error;
      }

      const normalizedShared = ensurePlainObject(sharedOverrides, 'sharedOverrides') || {};
      const normalizedSteps = ensurePlainObject(stepOverrides, 'stepOverrides') || {};
      const result = await service.runSequencePreset({
        logger,
        sequenceName,
        startUrl,
        sharedOverrides: normalizedShared,
        stepOverrides: normalizedSteps,
        continueOnError: Boolean(continueOnError),
        onStepComplete: undefined,
        context: sequenceContext
      });

      res.json({
        status: 'ok',
        mode: 'sequence-preset',
        sequence: {
          name: sequenceName,
          startUrl,
          sharedOverrides: normalizedShared,
          stepOverrides: normalizedSteps,
          continueOnError: Boolean(continueOnError)
        },
        result
      });
    })
  );

  router.post(
    '/sequences/configs/:sequenceConfigName/run',
    asyncHandler(async (req, res) => {
      const { sequenceConfigName } = req.params;
      const {
        configDir,
        configHost,
        startUrl,
        sharedOverrides,
        stepOverrides,
        continueOnError,
        configCliOverrides
      } = req.body || {};

      if (!sequenceConfigName) {
        const error = new Error('sequenceConfigName path parameter is required.');
        error.statusCode = 400;
        error.code = 'BAD_REQUEST';
        throw error;
      }

      const normalizedShared = ensurePlainObject(sharedOverrides, 'sharedOverrides') || {};
      const normalizedSteps = ensurePlainObject(stepOverrides, 'stepOverrides') || {};
      const normalizedCliOverrides = ensurePlainObject(configCliOverrides, 'configCliOverrides') || {};

      const result = await service.runSequenceConfig({
        logger,
        sequenceConfigName,
        configDir,
        configHost,
        startUrl,
        sharedOverrides: normalizedShared,
        stepOverrides: normalizedSteps,
        continueOnError: Boolean(continueOnError),
        configCliOverrides: normalizedCliOverrides,
        onStepComplete: undefined
      });

      res.json({
        status: 'ok',
        mode: 'sequence-config',
        sequenceConfig: {
          name: sequenceConfigName,
          configDir: configDir || null,
          configHost: configHost || null,
          startUrl,
          sharedOverrides: normalizedShared,
          stepOverrides: normalizedSteps,
          continueOnError: Boolean(continueOnError),
          configCliOverrides: normalizedCliOverrides
        },
        result
      });
    })
  );

  router.use((error, req, res, next) => {
    const mapped = mapError(error);
    if (logger && typeof logger.error === 'function' && mapped.status === 500) {
      logger.error(error);
    }
    res.status(mapped.status).json({
      status: 'error',
      error: {
        code: mapped.code,
        message: mapped.message
      }
    });
  });

  app.use(basePath, router);
}

module.exports = {
  registerOperationRoutes
};
