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

function get(hostname, port, path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname, port, path }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (d) => buf += d);
      res.on('end', () => resolve({ status: res.statusCode, text: buf, headers: res.headers }));
    });
    req.on('error', reject);
  });
}

describe('crawl start health', () => {
  test('POST /api/crawl responds quickly and /health shows running', async () => {
    const fakeRunner = {
      start() {
        const listeners = { data: [] };
        const stdout = { on: (ev, fn) => { if (ev === 'data') listeners.data.push(fn); } };
        const stderr = { on(){} };
        const child = { pid: 4242, stdout, stderr, on(){} };
        // Emit a bunch of stderr quickly to simulate chatty startup
        setTimeout(() => {
          for (let i = 0; i < 500; i++) {
            // stderr isn't used in this test, but exercise the path
          }
          const line = `PROGRESS ${JSON.stringify({ visited: 0, downloaded: 0, found: 0, saved: 0, errors: 0, queueSize: 0 })}\n`;
          for (const fn of listeners.data) fn(Buffer.from(line, 'utf8'));
        }, 10);
        return child;
      }
    };

    const app = createApp({ runner: fakeRunner, verbose: false });
    const { server, port } = await startHttp(app);

    const t0 = Date.now();
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
    const dt = Date.now() - t0;
    expect(dt).toBeLessThan(500); // should be quick to accept

    // health should indicate running shortly after
    const health = await get('127.0.0.1', port, '/health');
    expect(health.status).toBe(200);
    const body = JSON.parse(health.text);
    expect(body.running).toBe(true);

    await new Promise((r) => server.close(r));
  });
});
