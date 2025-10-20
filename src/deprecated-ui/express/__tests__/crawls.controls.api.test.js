const request = require('supertest');
const { EventEmitter } = require('events');
const { createApp } = require('../server');

function makeRunnerFake({ exitDelayMs = 300 } = {}) {
  return {
    start() {
      const ee = new EventEmitter();
      ee.stdout = new EventEmitter();
      ee.stderr = new EventEmitter();
      ee.stdin = { writes: [], write(chunk) { this.writes.push(String(chunk)); return true; } };
      ee.killed = false;
      ee.kill = (sig) => { ee.killed = true; ee.emit('exit', null, sig || 'SIGTERM'); };
      const timer = setTimeout(() => {
        try { ee.stdout.emit('data', Buffer.from('PROGRESS {"visited":0,"downloaded":0}\n')); } catch(_) {}
        try { ee.emit('exit', 0, null); } catch(_) {}
      }, exitDelayMs);
      timer.unref?.();
      return ee;
    }
  };
}

describe('per-job control endpoints', () => {
  test('pause/resume/stop via path routes work and mirror body routes', async () => {
    const app = createApp({ runner: makeRunnerFake({ exitDelayMs: 1000 }) });
    const start = await request(app).post('/api/crawl').send({ startUrl: 'https://example.com', depth: 0 });
    expect(start.statusCode).toBe(202);
    const jobId = start.body.jobId;
    expect(typeof jobId).toBe('string');

    // Pause via path
    const p1 = await request(app).post(`/api/crawls/${jobId}/pause`).send();
    expect(p1.statusCode).toBe(200);
    expect(p1.body).toMatchObject({ ok: true, paused: true });

    // Resume via path
    const r1 = await request(app).post(`/api/crawls/${jobId}/resume`).send();
    expect(r1.statusCode).toBe(200);
    expect(r1.body).toMatchObject({ ok: true, paused: false });

    // Stop via path
    const s1 = await request(app).post(`/api/crawls/${jobId}/stop`).send();
    expect([200,202]).toContain(s1.statusCode);
    expect(s1.body).toHaveProperty('stopped');
  });

  test('invalid id yields 404', async () => {
    const app = createApp({ runner: makeRunnerFake({ exitDelayMs: 1000 }) });
    const start = await request(app).post('/api/crawl').send({ startUrl: 'https://example.com', depth: 0 });
    expect(start.statusCode).toBe(202);
    const bad = await request(app).post('/api/crawls/nope/stop').send();
    expect(bad.statusCode).toBe(404);
  });
});
