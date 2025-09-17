const request = require('supertest');
const { EventEmitter } = require('events');
const { createApp } = require('../server');

function makeRunnerWithStdin(lines = [], exitCode = 0, delayMs = 50) {
  return {
    start() {
      const ee = new EventEmitter();
      ee.stdout = new EventEmitter();
      ee.stderr = new EventEmitter();
      ee.stdin = { writes: [], write(chunk) { this.writes.push(String(chunk)); return true; } };
      ee.killed = false;
      ee.kill = () => { ee.killed = true; ee.emit('exit', null, 'SIGTERM'); };
      setTimeout(() => {
        for (const l of lines) ee.stdout.emit('data', Buffer.from(l + '\n'));
        ee.emit('exit', exitCode, null);
      }, delayMs);
      return ee;
    }
  };
}

describe('pause/resume API integration', () => {
  test('pause and resume respond ok with stdin-enabled runner', async () => {
    const app = createApp({ runner: makeRunnerWithStdin(['PROGRESS {"visited":0,"downloaded":0}'], 0, 200) });
    const start = await request(app).post('/api/crawl').send({ startUrl: 'https://example.com', depth: 0 });
    expect(start.statusCode).toBe(202);

    const pause = await request(app).post('/api/pause');
    expect(pause.statusCode).toBe(200);
    expect(pause.body).toMatchObject({ ok: true, paused: true });

    const resume = await request(app).post('/api/resume');
    expect(resume.statusCode).toBe(200);
    expect(resume.body).toMatchObject({ ok: true, paused: false });

    const stop = await request(app).post('/api/stop');
    expect([200,202]).toContain(stop.statusCode);
  });
});
