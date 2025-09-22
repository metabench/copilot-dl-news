const http = require('http');
const { createApp } = require('../server');

function startHttp(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

function collectSse(hostname, port, path, timeoutMs = 1200) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname, port, path }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      const t = setTimeout(() => { try { res.destroy(); } catch(_){}; resolve({ status: res.statusCode, text: buf }); }, timeoutMs);
      res.on('data', (d) => buf += d);
      res.on('end', () => { clearTimeout(t); resolve({ status: res.statusCode, text: buf }); });
    });
    req.on('error', reject);
  });
}

describe('chatty start does not hang server', () => {
  test('server remains responsive and rate-limits logs on startup flood', async () => {
    // Very chatty fake runner that emits many stdout lines immediately
    const fakeRunner = {
      start() {
        const listeners = { data: [] };
        const stdout = { on: (ev, fn) => { if (ev === 'data') listeners.data.push(fn); } };
        const stderr = { on(){} };
        const child = { pid: 12345, stdout, stderr, on(){} };
        // Burst a lot of non-structured lines + a progress frame
        setTimeout(() => {
          for (let i = 0; i < 2000; i++) {
            const line = `noise ${i}\n`;
            for (const fn of listeners.data) fn(Buffer.from(line, 'utf8'));
          }
          const p = { visited: 1, downloaded: 0, found: 0, saved: 0, errors: 0, queueSize: 0 };
          const pl = `PROGRESS ${JSON.stringify(p)}\n`;
          for (const fn of listeners.data) fn(Buffer.from(pl, 'utf8'));
        }, 50);
        return child;
      }
    };

    // Force strict log caps via env for test determinism
    process.env.UI_LOGS_MAX_PER_SEC = '100';
    process.env.UI_LOG_LINE_MAX_CHARS = '256';

    const app = createApp({ runner: fakeRunner, verbose: false });
    const { server, port } = await startHttp(app);

    // Open SSE before starting crawl
    const ssePromise = collectSse('127.0.0.1', port, '/events?logs=1', 1000);

    // Start crawl
    await new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port, path: '/api/crawl', method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
        try {
          expect(res.statusCode).toBe(202);
          res.resume(); res.on('end', resolve);
        } catch (e) { reject(e); }
      });
      req.on('error', reject);
      req.end(JSON.stringify({ startUrl: 'https://example.com' }));
    });

    const sse = await ssePromise;
    expect(sse.status).toBe(200);
    // We should see at least some logs and a progress event
    expect(sse.text).toMatch(/event: log/);
    expect(sse.text).toMatch(/event: progress/);
    // And a rate-limit notice due to flood
  expect(sse.text).toMatch(/log rate limit: dropping logs/);

    await new Promise((r) => server.close(r));
  });
});
