'use strict';

const express = require('express');
const request = require('supertest');
const { createAnalysisRouter } = require('../../../src/api/routes/analysis');

jest.mock('../../../src/deprecated-ui/express/services/analysisRuns', () => ({
  ensureAnalysisRunSchema: jest.fn(),
  listAnalysisRuns: jest.fn(),
  getAnalysisRun: jest.fn()
}));

jest.mock('../../../src/data/db/queries/analysisQueries', () => ({
  countArticlesNeedingAnalysis: jest.fn(),
  getAnalysisStatusCounts: jest.fn()
}));

const {
  ensureAnalysisRunSchema,
  listAnalysisRuns,
  getAnalysisRun
} = require('../../../src/deprecated-ui/express/services/analysisRuns');
const {
  countArticlesNeedingAnalysis,
  getAnalysisStatusCounts
} = require('../../../src/data/db/queries/analysisQueries');

function createApp(overrides = {}) {
  const getDbRW = overrides.getDbRW ?? (() => overrides.db ?? { name: 'db' });
  const logger = overrides.logger ?? { error: jest.fn() };
  const router = createAnalysisRouter({ getDbRW, logger });

  const app = express();
  app.use(express.json());
  app.use(router);

  return { app, getDbRW, logger };
}

describe('analysis router', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ensureAnalysisRunSchema.mockImplementation(() => {});
    listAnalysisRuns.mockReturnValue({ total: 0, items: [] });
    getAnalysisRun.mockReturnValue(null);
    countArticlesNeedingAnalysis.mockReturnValue({ needingAnalysis: 0 });
    getAnalysisStatusCounts.mockReturnValue({ running: 0, pending: 0 });
  });

  test('GET / returns runs with defaults', async () => {
    listAnalysisRuns.mockReturnValue({ total: 2, items: [{ id: 'a' }, { id: 'b' }] });
    const db = { name: 'analysis-db' };
    const { app } = createApp({ db });

    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(ensureAnalysisRunSchema).toHaveBeenCalledWith(db);
    expect(listAnalysisRuns).toHaveBeenCalledWith(db, { limit: undefined, offset: undefined, includeDetails: true });
    expect(response.body).toEqual({ total: 2, items: [{ id: 'a' }, { id: 'b' }], includeDetails: true });
  });

  test('GET / respects limit, offset, and includeDetails=false', async () => {
    const db = { name: 'analysis-db' };
    const { app } = createApp({ db });

    await request(app)
      .get('/')
      .query({ limit: '5', offset: '10', includeDetails: 'false' });

    expect(listAnalysisRuns).toHaveBeenCalledWith(db, { limit: 5, offset: 10, includeDetails: false });
  });

  test('GET / returns 503 when database unavailable', async () => {
    const { app } = createApp({ getDbRW: () => null });

    const response = await request(app).get('/');

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('DATABASE_UNAVAILABLE');
  });

  test('GET / handles internal errors gracefully', async () => {
    ensureAnalysisRunSchema.mockImplementation(() => {
      throw new Error('schema failure');
    });
    const db = { name: 'db' };
    const { app, logger } = createApp({ db });

    const response = await request(app).get('/');

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('INTERNAL_ERROR');
    expect(logger.error).toHaveBeenCalled();
  });

  test('GET /status returns counts from query helper', async () => {
    getAnalysisStatusCounts.mockReturnValue({ running: 1, completed: 2 });
    const db = { name: 'db' };
    const { app } = createApp({ db });

    const response = await request(app).get('/status');

    expect(response.status).toBe(200);
    expect(getAnalysisStatusCounts).toHaveBeenCalledWith(db);
    expect(response.body).toEqual({ running: 1, completed: 2 });
  });

  test('GET /status returns 503 when db unavailable', async () => {
    const { app } = createApp({ getDbRW: () => null });

    const response = await request(app).get('/status');

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('DATABASE_UNAVAILABLE');
  });

  test('GET /count returns counts for default version', async () => {
    const db = { name: 'db' };
    const { app } = createApp({ db });

    const response = await request(app).get('/count');

    expect(response.status).toBe(200);
    expect(countArticlesNeedingAnalysis).toHaveBeenCalledWith(db, 1);
    expect(response.body).toEqual({ count: 0, analysisVersion: 1 });
  });

  test('GET /count respects version query', async () => {
    const db = { name: 'db' };
    const { app } = createApp({ db });
    countArticlesNeedingAnalysis.mockReturnValue({ needingAnalysis: 12 });

    const response = await request(app).get('/count').query({ version: '3' });

    expect(response.status).toBe(200);
    expect(countArticlesNeedingAnalysis).toHaveBeenCalledWith(db, 3);
    expect(response.body).toEqual({ count: 12, analysisVersion: 3 });
  });

  test('GET /:id requires a non-empty identifier', async () => {
    const { app } = createApp();

    const response = await request(app).get('/%20');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_ANALYSIS_ID');
  });

  test('GET /:id returns 404 when run missing', async () => {
    const db = { name: 'db' };
    getAnalysisRun.mockReturnValue(null);
    const { app } = createApp({ db });

    const response = await request(app).get('/missing');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('ANALYSIS_NOT_FOUND');
  });

  test('GET /:id returns run and respects eventsLimit alias', async () => {
    const db = { name: 'db' };
    const run = { id: '123', events: [] };
    getAnalysisRun.mockReturnValue(run);
    const { app } = createApp({ db });

    const response = await request(app).get('/123').query({ limit: '25' });

    expect(response.status).toBe(200);
    expect(getAnalysisRun).toHaveBeenCalledWith(db, '123', { limitEvents: 25 });
    expect(response.body).toEqual(run);
  });

  test('GET /:id supports explicit eventsLimit query', async () => {
    const db = { name: 'db' };
    const run = { id: 'abc', events: [{ id: 1 }] };
    getAnalysisRun.mockReturnValue(run);
    const { app } = createApp({ db });

    await request(app).get('/abc').query({ eventsLimit: '5' });

    expect(getAnalysisRun).toHaveBeenCalledWith(db, 'abc', { limitEvents: 5 });
  });

  test('resolveDb handles getDbRW errors', async () => {
    const error = new Error('db failure');
    const logger = { error: jest.fn() };
    const getDbRW = jest.fn(() => { throw error; });
    const { app } = createApp({ getDbRW, logger });

    const response = await request(app).get('/');

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('INTERNAL_ERROR');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to resolve database connection'), error);
  });
});

