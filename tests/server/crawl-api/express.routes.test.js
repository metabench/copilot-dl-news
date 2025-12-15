'use strict';

const request = require('supertest');
const { createServer } = require('../../../src/server/crawl-api/v1/express/server');
const { SequenceConfigError } = require('../../../src/server/crawl-api');

describe('Express crawl API routes', () => {
  let app;
  let service;
  let logger;

  beforeEach(() => {
    service = {
      getAvailability: jest.fn(() => ({
        operations: [
          {
            name: 'ensureCountryHubs',
            summary: 'Ensure baseline coverage',
            defaultOptions: { structureOnly: true }
          }
        ],
        sequences: [
          {
            name: 'ensureAndExploreCountryHubs',
            label: 'Ensure + Explore',
            description: 'Two step preset',
            continueOnError: false,
            stepCount: 2,
            steps: [
              { operation: 'ensureCountryHubs', label: null },
              { operation: 'exploreCountryHubs', label: 'Explore Country Hubs' }
            ]
          }
        ]
      })),
      runOperation: jest.fn(() =>
        Promise.resolve({
          status: 'ok',
          startedAt: '2025-11-07T00:00:00.000Z',
          finishedAt: '2025-11-07T00:01:00.000Z',
          elapsedMs: 60000
        })
      ),
      runSequencePreset: jest.fn(() =>
        Promise.resolve({
          status: 'ok',
          steps: [
            { name: 'ensureCountryHubs', status: 'ok' },
            { name: 'exploreCountryHubs', status: 'ok' }
          ]
        })
      ),
      runSequenceConfig: jest.fn(() =>
        Promise.resolve({
          status: 'ok',
          sequenceConfig: {
            source: 'config-file'
          }
        })
      )
    };

    logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    const server = createServer({
      port: 0,
      logger,
      crawlService: service
    });

    app = server.app;
  });

  it('exposes in-process job endpoints when registry is supplied', async () => {
    const inProcessJobRegistry = {
      list: jest.fn(() => ([{ id: 'job-1', mode: 'in-process' }]))
    };

    const server = createServer({
      port: 0,
      logger,
      crawlService: service,
      inProcessJobRegistry
    });

    const res = await request(server.app)
      .get('/v1/jobs')
      .expect(200);

    expect(inProcessJobRegistry.list).toHaveBeenCalledTimes(1);
    expect(res.body).toEqual(
      expect.objectContaining({
        status: 'ok',
        items: expect.any(Array)
      })
    );
  });

  it('does not expose in-process job endpoints when registry is missing', async () => {
    const res = await request(app)
      .get('/v1/jobs')
      .expect(404);

    expect(res.text).toContain('Cannot GET');
  });

  it('routes job actions to the in-process registry', async () => {
    const inProcessJobRegistry = {
      list: jest.fn(() => ([{ id: 'job-1', mode: 'in-process' }])),
      get: jest.fn((jobId) => (jobId === 'job-1' ? { id: 'job-1' } : null)),
      pause: jest.fn((jobId) => jobId === 'job-1'),
      resume: jest.fn((jobId) => jobId === 'job-1'),
      stop: jest.fn((jobId) => jobId === 'job-1'),
      startOperation: jest.fn(() => ({ jobId: 'job-1', job: { id: 'job-1' } }))
    };

    const server = createServer({
      port: 0,
      logger,
      crawlService: service,
      inProcessJobRegistry
    });

    await request(server.app)
      .get('/v1/jobs/job-1')
      .expect(200);

    await request(server.app)
      .post('/v1/jobs/job-1/pause')
      .send({})
      .expect(200);
    expect(inProcessJobRegistry.pause).toHaveBeenCalledWith('job-1');

    await request(server.app)
      .post('/v1/jobs/job-1/resume')
      .send({})
      .expect(200);
    expect(inProcessJobRegistry.resume).toHaveBeenCalledWith('job-1');

    await request(server.app)
      .post('/v1/jobs/job-1/stop')
      .send({})
      .expect(200);
    expect(inProcessJobRegistry.stop).toHaveBeenCalledWith('job-1');

    const invalidAction = await request(server.app)
      .post('/v1/jobs/job-1/nope')
      .send({})
      .expect(400);
    expect(invalidAction.body).toEqual(
      expect.objectContaining({
        status: 'error',
        error: expect.objectContaining({
          code: 'BAD_REQUEST'
        })
      })
    );

    const missingJob = await request(server.app)
      .post('/v1/jobs/missing/pause')
      .send({})
      .expect(404);
    expect(missingJob.body).toEqual(
      expect.objectContaining({
        status: 'error',
        error: expect.objectContaining({
          code: 'NOT_FOUND'
        })
      })
    );
  });

  it('validates operation start payload for in-process jobs', async () => {
    const inProcessJobRegistry = {
      list: jest.fn(() => ([])),
      get: jest.fn(() => null),
      startOperation: jest.fn(() => ({ jobId: 'job-1', job: { id: 'job-1' } }))
    };

    const server = createServer({
      port: 0,
      logger,
      crawlService: service,
      inProcessJobRegistry
    });

    const missingStartUrl = await request(server.app)
      .post('/v1/operations/ensureCountryHubs/start')
      .send({})
      .expect(400);

    expect(missingStartUrl.body).toEqual(
      expect.objectContaining({
        status: 'error',
        error: expect.objectContaining({
          code: 'BAD_REQUEST'
        })
      })
    );

    const ok = await request(server.app)
      .post('/v1/operations/ensureCountryHubs/start')
      .send({ startUrl: 'https://example.com', overrides: { plannerVerbosity: 1 } })
      .expect(200);

    expect(inProcessJobRegistry.startOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'ensureCountryHubs',
        startUrl: 'https://example.com',
        overrides: { plannerVerbosity: 1 }
      })
    );
    expect(ok.body).toEqual(
      expect.objectContaining({
        status: 'ok',
        mode: 'operation-job',
        jobId: 'job-1',
        job: expect.any(Object)
      })
    );
  });

  it('exposes health endpoint', async () => {
    const response = await request(app).get('/healthz');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'ok',
        service: 'crawl-api',
        framework: 'express',
        version: 'v1'
      })
    );
  });

  it('returns availability with defaults', async () => {
    const response = await request(app).get('/v1/availability');

    expect(service.getAvailability).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'ok',
        availability: {
          operations: expect.any(Array),
          sequencePresets: expect.any(Array)
        },
        totals: {
          operations: 1,
          sequencePresets: 1
        }
      })
    );
  });

  it('allows filtering availability to sequences only', async () => {
    const response = await request(app).get('/v1/availability').query({ operations: 'false' });

    expect(response.status).toBe(200);
    expect(response.body.availability).toEqual(
      expect.not.objectContaining({ operations: expect.anything() })
    );
    expect(response.body.availability.sequencePresets).toBeDefined();
  });

  it('runs an operation via HTTP', async () => {
    const response = await request(app)
      .post('/v1/operations/ensureCountryHubs/run')
      .send({
        startUrl: 'https://example.com',
        overrides: { plannerVerbosity: 2 }
      });

    expect(response.status).toBe(200);
    expect(service.runOperation).toHaveBeenCalledWith({
      logger,
      operationName: 'ensureCountryHubs',
      startUrl: 'https://example.com',
      overrides: { plannerVerbosity: 2 }
    });
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'ok',
        mode: 'operation',
        operation: expect.objectContaining({ name: 'ensureCountryHubs' }),
        result: expect.objectContaining({ status: 'ok' })
      })
    );
  });

  it('runs a sequence preset via HTTP', async () => {
    const response = await request(app)
      .post('/v1/sequences/presets/ensureAndExploreCountryHubs/run')
      .send({
        startUrl: 'https://example.com',
        sharedOverrides: { maxAgeHubMs: 0 },
        stepOverrides: { exploreCountryHubs: { crawlType: 'intelligent-hubs' } },
        continueOnError: true
      });

    expect(response.status).toBe(200);
    expect(service.runSequencePreset).toHaveBeenCalledWith({
      logger,
      sequenceName: 'ensureAndExploreCountryHubs',
      startUrl: 'https://example.com',
      sharedOverrides: { maxAgeHubMs: 0 },
      stepOverrides: { exploreCountryHubs: { crawlType: 'intelligent-hubs' } },
      continueOnError: true,
      onStepComplete: undefined,
      context: undefined
    });
    expect(response.body).toEqual(
      expect.objectContaining({
        mode: 'sequence-preset',
        status: 'ok',
        result: expect.any(Object)
      })
    );
  });

  it('runs a sequence config via HTTP', async () => {
    const response = await request(app)
      .post('/v1/sequences/configs/fullCountryHubDiscovery/run')
      .send({
        configDir: '/tmp/configs',
        configHost: 'example.com',
        startUrl: 'https://example.com',
        sharedOverrides: { plannerVerbosity: 1 },
        stepOverrides: {},
        continueOnError: false,
        configCliOverrides: { domain: 'example.com' }
      });

    expect(response.status).toBe(200);
    expect(service.runSequenceConfig).toHaveBeenCalledWith({
      logger,
      sequenceConfigName: 'fullCountryHubDiscovery',
      configDir: '/tmp/configs',
      configHost: 'example.com',
      startUrl: 'https://example.com',
      sharedOverrides: { plannerVerbosity: 1 },
      stepOverrides: {},
      continueOnError: false,
      configCliOverrides: { domain: 'example.com' },
      onStepComplete: undefined
    });
    expect(response.body).toEqual(
      expect.objectContaining({
        mode: 'sequence-config',
        status: 'ok'
      })
    );
  });

  it('returns validation error when sequence config loader fails', async () => {
    service.runSequenceConfig.mockImplementation(() => {
      throw new SequenceConfigError('CONFIG_NOT_FOUND', 'Missing configuration file.');
    });

    const response = await request(app)
      .post('/v1/sequences/configs/fullCountryHubDiscovery/run')
      .send({
        configDir: '/tmp/configs',
        configHost: 'example.com'
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'error',
        error: expect.objectContaining({
          code: 'SEQUENCE_CONFIG_ERROR',
          message: 'Missing configuration file.'
        })
      })
    );
  });

  it('validates required payload fields', async () => {
    const response = await request(app)
      .post('/v1/operations/ensureCountryHubs/run')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'error',
        error: expect.objectContaining({ code: 'BAD_REQUEST' })
      })
    );
    expect(service.runOperation).not.toHaveBeenCalled();
  });
});
