const request = require('supertest');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');
const { createApp } = require('../server');
const { PlanningSessionManager } = require('../services/planning/PlanningSessionManager');
const { ConfigManager } = require('../../../shared/config/ConfigManager');

function makeTestRunner({ stdoutLines = [], exitCode = 0, delayMs = 10 } = {}) {
  return {
    start() {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = { write: jest.fn().mockReturnValue(true) };
      child.killed = false;
      child.kill = jest.fn(() => {
        child.killed = true;
        setTimeout(() => child.emit('exit', null, 'SIGTERM'), 0);
      });
      setTimeout(() => {
        for (const line of stdoutLines) {
          child.stdout.emit('data', Buffer.from(`${line}\n`));
        }
        child.emit('exit', exitCode, null);
      }, delayMs);
      return child;
    }
  };
}

class StubPlanRunner {
  constructor({ sessions }) {
    this.sessions = sessions;
  }

  startPreview({ options = {}, sessionKey = null, metadata = {}, tags = null } = {}) {
    if (!options.startUrl) {
      throw new Error('startUrl required for preview');
    }
    let derivedKey = sessionKey;
    if (!derivedKey) {
      try {
        const url = new URL(options.startUrl);
        derivedKey = url.hostname;
      } catch (_) {
        /* ignore URL parse errors here */
      }
    }
    const session = this.sessions.createSession(options, { sessionKey: derivedKey, metadata, tags });
    const blueprint = {
      sections: [],
      navigation: {},
      seedPlan: { seeds: [] },
      targetedAnalysis: {}
    };
    const summary = {
      preparedAt: new Date().toISOString(),
      planner: null,
      intelligent: null,
      fetchCount: 0,
      seedQueue: []
    };
    this.sessions.completeSession(session.id, blueprint, summary);
    return session;
  }

  cancel(sessionId, reason = 'cancelled') {
    this.sessions.cancelSession(sessionId, reason);
    return true;
  }

  isRunning() {
    return false;
  }
}

describe('planning preview API', () => {
  let planningSessionManager;
  let app;
  const baseOptions = {
    startUrl: 'https://example.com',
    crawlType: 'intelligent',
    intMaxSeeds: 5,
    plannerVerbosity: 1
  };

  beforeEach(() => {
    planningSessionManager = new PlanningSessionManager({ ttlMs: 60_000, terminalTtlMs: 5_000 });
    const asyncPlanRunner = new StubPlanRunner({ sessions: planningSessionManager });
    const dbPath = path.join(os.tmpdir(), `plan-api-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
    app = createApp({
      dbPath,
      planningSessionManager,
      asyncPlanRunner,
      runner: makeTestRunner({ stdoutLines: ['PROGRESS {"visited":0,"downloaded":0}'] })
    });
  });

  test('starts a planning session and returns ready status snapshot', async () => {
    const start = await request(app)
      .post('/api/crawl/plan')
      .send({ options: baseOptions });

    expect(start.statusCode).toBe(202);
    expect(start.body).toMatchObject({ status: 'planning', sessionId: expect.any(String) });

    const sessionId = start.body.sessionId;
    const status = await request(app).get(`/api/crawl/plan/${sessionId}/status`);
    expect(status.statusCode).toBe(200);
    expect(status.body.session).toMatchObject({
      id: sessionId,
      status: 'ready',
      blueprint: expect.any(Object),
      summary: expect.any(Object)
    });
  });

  test('confirming a ready session starts a crawl and marks confirmed', async () => {
    const start = await request(app).post('/api/crawl/plan').send({ options: baseOptions });
    const sessionId = start.body.sessionId;
    const confirm = await request(app)
      .post(`/api/crawl/plan/${sessionId}/confirm`)
      .send({ options: baseOptions });

    expect(confirm.statusCode).toBe(202);
    expect(confirm.body).toMatchObject({ jobId: expect.any(String), sessionId });

    const snapshot = planningSessionManager.getSession(sessionId);
    expect(snapshot.status).toBe('confirmed');
  });

  test('starting a duplicate planning session returns conflict', async () => {
    const first = await request(app).post('/api/crawl/plan').send({ options: baseOptions });
    expect(first.statusCode).toBe(202);

    const second = await request(app).post('/api/crawl/plan').send({ options: baseOptions });
    expect(second.statusCode).toBe(409);
    expect(second.body).toMatchObject({ error: 'session-conflict' });
  });

  test('cancelling a session returns cancelled snapshot', async () => {
    const start = await request(app).post('/api/crawl/plan').send({ options: baseOptions });
    const sessionId = start.body.sessionId;

    const cancel = await request(app).post(`/api/crawl/plan/${sessionId}/cancel`);
    expect(cancel.statusCode).toBe(200);
    expect(cancel.body.session.status).toBe('cancelled');
  });
});

describe('advanced planning feature flag integration', () => {
  test('server applies advanced planning flag updates to async planner', () => {
    const configManager = new ConfigManager(null, {
      inMemory: true,
      initialConfig: {
        features: {
          advancedPlanningSuite: false
        }
      },
      watch: false
    });

    const planningSessionManager = new PlanningSessionManager({ ttlMs: 60_000, terminalTtlMs: 5_000 });
    const dbPath = path.join(os.tmpdir(), `plan-toggle-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);

    const app = createApp({
      dbPath,
      configManager,
      planningSessionManager,
      runner: makeTestRunner(),
      analysisRunner: makeTestRunner()
    });

    const asyncPlanRunner = app.locals.asyncPlanRunner;
    expect(asyncPlanRunner).toBeTruthy();
    expect(asyncPlanRunner.usePlannerHost).toBe(false);
    expect(asyncPlanRunner.dbAdapter).toBeTruthy();

    configManager.updateConfig({ features: { advancedPlanningSuite: true } });
    expect(asyncPlanRunner.usePlannerHost).toBe(true);

    configManager.updateConfig({ features: { advancedPlanningSuite: false } });
    expect(asyncPlanRunner.usePlannerHost).toBe(false);

    configManager.close();
  });
});
