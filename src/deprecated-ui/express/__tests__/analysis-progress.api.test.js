const express = require('express');
const http = require('http');
const request = require('supertest');
const { EventEmitter } = require('events');
const { createAnalysisControlRouter } = require('../routes/api.analysis-control');
const { createEventsRouter } = require('../routes/events');

function waitFor(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('analysis progress integration', () => {
  test('analysis control router emits telemetry and final snapshot', async () => {
    const events = [];
    const analysisRuns = new Map();
    const analysisProgress = { historyLimit: 8 };
    const runner = {
      start() {
        const child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        setTimeout(() => {
          child.stdout.emit('data', Buffer.from('ANALYSIS_PROGRESS {"stage":"starting","status":"starting"}\n'));
          child.stdout.emit('data', Buffer.from('ANALYSIS_PROGRESS {"stage":"db-setup","status":"completed"}\n'));
          child.stdout.emit('data', Buffer.from('analysis log line one\n'));
          child.stderr.emit('data', Buffer.from('analysis warning\n'));
          child.emit('exit', 0, null);
        }, 10);
        return child;
      }
    };

    const app = express();
    app.use(express.json());
    app.use(createAnalysisControlRouter({
      analysisRunner: runner,
      analysisRuns,
      urlsDbPath: '/tmp/news.db',
      generateRunId: () => 'run-unit-test',
      broadcast: (event, data) => events.push({ event, data }),
      analysisProgress,
      QUIET: true
    }));

    const res = await request(app).post('/api/analysis/start').send({});
    expect(res.statusCode).toBe(202);

    await waitFor(60);

    const progressEvents = events.filter((ev) => ev.event === 'analysis-progress');
    expect(progressEvents.length).toBeGreaterThanOrEqual(3);
    expect(progressEvents[0].data.runId).toBe('run-unit-test');
    expect(progressEvents[progressEvents.length - 1].data.final).toBe(true);

    const logStreams = events.filter((ev) => ev.event === 'log').map((ev) => ev.data.stream);
    expect(logStreams).toContain('analysis');
    expect(logStreams).toContain('analysis-stderr');

    expect(analysisRuns.size).toBe(0);
    expect(Array.isArray(analysisProgress.history)).toBe(true);
    expect(analysisProgress.history.length).toBeGreaterThanOrEqual(3);
    const lastSnapshot = analysisProgress.history[analysisProgress.history.length - 1];
    expect(lastSnapshot.final).toBe(true);
    expect(lastSnapshot.exit).toBeDefined();
  });

  test('events router seeds analysis history on connect', async () => {
    const clients = new Set();
    const broadcasts = [];
    const realtime = {
      getSseClients: () => clients,
      getProgress: () => ({}),
      broadcast: (event, data) => {
        broadcasts.push({ event, data });
      },
      registerClient: (client) => clients.add(client),
      removeClient: (client) => clients.delete(client)
    };
    const jobRegistry = {
      getJobs: () => new Map()
    };
    const analysisProgress = {
      history: [{ runId: 'seed-run', stage: 'completed', status: 'completed', summary: 'done' }],
      lastRunId: 'seed-run',
      lastPayload: { runId: 'seed-run', stage: 'completed', status: 'completed', summary: 'done' }
    };

    const app = express();
    app.use(createEventsRouter({
      realtime,
      jobRegistry,
      QUIET: true,
      analysisProgress
    }));

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();

    await new Promise((resolve, reject) => {
      const req = http.get({ hostname: '127.0.0.1', port, path: '/events' }, (res) => {
        res.setEncoding('utf8');
        res.on('data', () => {});
        setTimeout(() => {
          res.destroy();
          resolve();
        }, 30);
      });
      req.on('error', reject);
    });

    await new Promise((resolve) => server.close(resolve));

    expect(broadcasts.some((entry) => entry.event === 'analysis-progress' && entry.data && entry.data.runId === 'seed-run')).toBe(true);
  });
});
