const request = require('supertest');
const { createApp } = require('../server');

describe('crawl start health', () => {
  test('POST /api/crawl responds within 100ms and /health shows preparation then running', async () => {
    let emitProgress = null;
    let emitExit = null;
    const fakeRunner = {
      start() {
        const listeners = { data: [], exit: [], close: [], error: [] };
        const stdout = {
          on(ev, fn) {
            if (ev === 'data') listeners.data.push(fn);
          }
        };
        const stderr = { on(){} };
        const child = {
          pid: 4242,
          stdout,
          stderr,
          on(ev, fn) {
            if (!listeners[ev]) listeners[ev] = [];
            listeners[ev].push(fn);
          },
          kill() {}
        };
        emitProgress = (frame = {}) => {
          const payload = {
            visited: 0,
            downloaded: 0,
            found: 0,
            saved: 0,
            errors: 0,
            queueSize: 0,
            ...frame
          };
          const line = `PROGRESS ${JSON.stringify(payload)}\n`;
          for (const fn of listeners.data) fn(Buffer.from(line, 'utf8'));
        };
        emitExit = (code = 0, signal = null) => {
          for (const fn of listeners.exit) fn(code, signal);
          for (const fn of listeners.close) fn(code, signal);
        };
        return child;
      }
    };

    const app = createApp({ runner: fakeRunner, verbose: false });
    const agent = request(app);

    let caughtError;
    try {
      const res = await agent
        .post('/api/crawl')
        .set('Content-Type', 'application/json')
        .send({ startUrl: 'https://example.com' });
      expect(res.status).toBe(202);
      expect(typeof res.body.durationMs).toBe('number');
      expect(res.body.durationMs).toBeLessThan(100);

      // health should indicate running shortly after
      const health = await agent.get('/health');
      expect(health.status).toBe(200);
      const body = health.body;
      expect(body.running).toBe(true);
      expect(body.stage).toBe('preparing');

      // Emit first progress frame to transition to running
      expect(typeof emitProgress).toBe('function');
      expect(typeof emitExit).toBe('function');
      emitProgress();
      await new Promise((r) => setTimeout(r, 10));

      const healthAfterProgress = await agent.get('/health');
      expect(healthAfterProgress.status).toBe(200);
      const bodyAfterProgress = healthAfterProgress.body;
      expect(bodyAfterProgress.running).toBe(true);
      expect(bodyAfterProgress.stage).toBe('running');
    } catch (err) {
      caughtError = err;
    } finally {
      try {
        if (typeof emitExit === 'function') emitExit();
      } catch (_) {}
    }
    if (caughtError) throw caughtError;
  });
});
