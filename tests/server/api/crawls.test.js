'use strict';

const express = require('express');
const request = require('supertest');
const { createCrawlsRouter } = require('../../../src/api/routes/crawls');

function createJobRegistry(overrides = {}) {
  return {
    getJobs: jest.fn(() => new Map(overrides.jobs || [])),
    getJob: jest.fn((id) => {
      const map = overrides.jobs ? new Map(overrides.jobs) : new Map();
      return map.get(id) || null;
    }),
    stopJob: jest.fn(() => ({ ok: true })),
    removeJob: jest.fn(),
    pauseJob: jest.fn(() => ({ ok: true, job: overrides.sampleJob || null })),
    resumeJob: jest.fn(() => ({ ok: true, job: overrides.sampleJob || null })),
    ...overrides.registry
  };
}

function createApp(overrides = {}) {
  const hasRegistry = Object.prototype.hasOwnProperty.call(overrides, 'jobRegistry');
  const jobRegistry = hasRegistry ? overrides.jobRegistry : createJobRegistry(overrides);
  const broadcastProgress = overrides.broadcastProgress ?? jest.fn();
  const broadcastJobs = overrides.broadcastJobs ?? jest.fn();
  const logger = overrides.logger ?? { error: jest.fn() };

  const router = createCrawlsRouter({
    jobRegistry,
    broadcastProgress,
    broadcastJobs,
    logger,
    quiet: overrides.quiet ?? false
  });

  const app = express();
  app.use(express.json());
  app.use(router);

  return { app, jobRegistry, broadcastProgress, broadcastJobs, logger };
}

function createRunningJob(overrides = {}) {
  return {
    id: overrides.id || 'job-1',
    url: overrides.url || 'https://example.com',
    startedAt: overrides.startedAt || '2025-11-17T10:00:00Z',
    stage: overrides.stage || 'running',
    metrics: overrides.metrics || {
      visited: 10,
      downloaded: 5,
      errors: 0,
      queueSize: 1,
      _lastProgressWall: '2025-11-17T10:05:00Z'
    },
    child: overrides.child ?? { pid: 999 },
    paused: overrides.paused ?? false,
    stageChangedAt: overrides.stageChangedAt || '2025-11-17T10:02:00Z'
  };
}

describe('crawls router', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET / returns 503 when registry unavailable', async () => {
    const { app } = createApp({ jobRegistry: null });

    const response = await request(app).get('/');

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('JOB_REGISTRY_UNAVAILABLE');
  });

  test('GET / returns job summaries', async () => {
    const job = createRunningJob();
    const jobs = [['job-1', job]];
    const jobRegistry = createJobRegistry({ jobs });
    const { app } = createApp({ jobRegistry });

    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(1);
    expect(response.body.items[0]).toMatchObject({
      id: 'job-1',
      pid: 999,
      status: 'running',
      visited: 10,
      errors: 0
    });
  });

  test('GET / handles registry errors gracefully', async () => {
    const jobRegistry = {
      getJobs: jest.fn(() => { throw new Error('boom'); })
    };
    const logger = { error: jest.fn() };
    const { app } = createApp({ jobRegistry, logger });

    const response = await request(app).get('/');

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('INTERNAL_ERROR');
    expect(logger.error).toHaveBeenCalled();
  });

  test('GET /:id requires a non-empty id', async () => {
    const { app } = createApp();

    const response = await request(app).get('/%20');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_JOB_ID');
  });

  test('GET /:id returns 404 when job missing', async () => {
    const jobRegistry = createJobRegistry();
    jobRegistry.getJob.mockReturnValue(null);
    const { app } = createApp({ jobRegistry });

    const response = await request(app).get('/missing');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('JOB_NOT_FOUND');
  });

  test('GET /:id returns job detail when present', async () => {
    const job = createRunningJob({ metrics: { visited: 20, downloaded: 10, errors: 1, queueSize: 2, _lastProgressWall: '2025-11-17T10:15:00Z' } });
    const jobRegistry = createJobRegistry({ jobs: [['job-1', job]] });
    jobRegistry.getJob.mockReturnValue(job);
    const { app } = createApp({ jobRegistry });

    const response = await request(app).get('/job-1');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: 'job-1',
      startUrl: 'https://example.com',
      metrics: expect.objectContaining({ visited: 20, errors: 1 }),
      lastActivityAt: '2025-11-17T10:15:00Z',
      paused: false
    });
  });

  test('DELETE /:id removes job and broadcasts snapshot', async () => {
    const job = createRunningJob();
    const jobs = [['job-1', job]];
    const jobRegistry = createJobRegistry({ jobs });
    jobRegistry.getJob.mockReturnValue(job);
    const broadcastJobs = jest.fn();
    const { app } = createApp({ jobRegistry, broadcastJobs });

    const response = await request(app).delete('/job-1');

    expect(response.status).toBe(200);
    expect(jobRegistry.stopJob).toHaveBeenCalledWith('job-1');
    expect(jobRegistry.removeJob).toHaveBeenCalledWith('job-1');
    expect(broadcastJobs).toHaveBeenCalledWith(true);
    expect(response.body).toEqual({ success: true, message: 'Crawl job cleared.' });
  });

  test('DELETE /:id returns 404 when job missing', async () => {
    const jobRegistry = createJobRegistry();
    jobRegistry.getJob.mockReturnValue(null);
    const { app } = createApp({ jobRegistry });

    const response = await request(app).delete('/unknown');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('JOB_NOT_FOUND');
  });

  test('POST /:id/stop returns escalation info', async () => {
    const job = createRunningJob();
    const jobRegistry = createJobRegistry({ jobs: [['job-1', job]] });
    jobRegistry.stopJob.mockReturnValue({ ok: true, escalatesInMs: 500 });
    const broadcastJobs = jest.fn();
    const { app } = createApp({ jobRegistry, broadcastJobs });

    const response = await request(app).post('/job-1/stop');

    expect(response.status).toBe(202);
    expect(jobRegistry.stopJob).toHaveBeenCalledWith('job-1');
    expect(broadcastJobs).toHaveBeenCalledWith(true);
    expect(response.body).toEqual({ stopped: true, escalatesInMs: 500 });
  });

  test('POST /:id/stop returns 404 when job missing', async () => {
    const jobRegistry = createJobRegistry();
    jobRegistry.stopJob.mockReturnValue({ ok: false });
    const { app } = createApp({ jobRegistry });

    const response = await request(app).post('/job-1/stop');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('JOB_NOT_FOUND');
  });

  test('POST /:id/pause handles stdin unavailable condition', async () => {
    const jobRegistry = createJobRegistry();
    jobRegistry.pauseJob.mockReturnValue({ ok: false, error: 'stdin-unavailable' });
    const { app } = createApp({ jobRegistry });

    const response = await request(app).post('/job-1/pause');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: false, paused: false, error: 'stdin unavailable' });
  });

  test('POST /:id/pause returns ok response and emits progress', async () => {
    const job = createRunningJob({ paused: true });
    const jobRegistry = createJobRegistry({ sampleJob: job });
    jobRegistry.pauseJob.mockReturnValue({ ok: true, job });
    const broadcastProgress = jest.fn();
    const broadcastJobs = jest.fn();
    const { app } = createApp({ jobRegistry, broadcastProgress, broadcastJobs });

    const response = await request(app).post('/job-1/pause');

    expect(response.status).toBe(200);
    expect(broadcastProgress).toHaveBeenCalledWith(expect.objectContaining({ stage: 'running', paused: true }), 'job-1', job.metrics);
    expect(broadcastJobs).toHaveBeenCalledWith(true);
    expect(response.body).toEqual({ ok: true, paused: true });
  });

  test('POST /:id/resume returns ok response and emits progress', async () => {
    const job = createRunningJob({ paused: false });
    const jobRegistry = createJobRegistry({ sampleJob: job });
    jobRegistry.resumeJob.mockReturnValue({ ok: true, job });
    const broadcastProgress = jest.fn();
    const broadcastJobs = jest.fn();
    const { app } = createApp({ jobRegistry, broadcastProgress, broadcastJobs });

    const response = await request(app).post('/job-1/resume');

    expect(response.status).toBe(200);
    expect(broadcastProgress).toHaveBeenCalledWith(expect.objectContaining({ stage: 'running', paused: false }), 'job-1', job.metrics);
    expect(broadcastJobs).toHaveBeenCalledWith(true);
    expect(response.body).toEqual({ ok: true, paused: false });
  });

  test('POST /:id/resume returns 404 when job missing', async () => {
    const jobRegistry = createJobRegistry();
    jobRegistry.resumeJob.mockReturnValue({ ok: false });
    const { app } = createApp({ jobRegistry });

    const response = await request(app).post('/job-1/resume');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('JOB_NOT_FOUND');
  });

  test('broadcast errors log by default and are suppressed when quiet', async () => {
    const job = createRunningJob({ paused: true });
    const jobRegistry = createJobRegistry({ sampleJob: job });
    jobRegistry.pauseJob.mockReturnValue({ ok: true, job });
    const noisyLogger = { error: jest.fn() };
    const broadcastProgress = jest.fn(() => { throw new Error('progress failure'); });
    const { app } = createApp({ jobRegistry, broadcastProgress, logger: noisyLogger });

    await request(app).post('/job-1/pause');
    expect(noisyLogger.error).toHaveBeenCalled();

    const quietLogger = { error: jest.fn() };
    const { app: quietApp } = createApp({ jobRegistry, broadcastProgress, logger: quietLogger, quiet: true });

    await request(quietApp).post('/job-1/pause');
    expect(quietLogger.error).not.toHaveBeenCalled();
  });
});
