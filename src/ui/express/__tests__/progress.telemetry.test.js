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

function collectSse(hostname, port, path, timeoutMs = 1500) {
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

describe('progress telemetry over SSE', () => {
  test('includes domainRateLimited and domainIntervalMs when provided', async () => {
    const fakeRunner = {
      start() {
        // Minimal event emitter interface for stdout
        const listeners = { data: [] };
        const stdout = { on: (ev, fn) => { if (ev === 'data') listeners.data.push(fn); } };
        const stderr = { on(){} };
        const child = {
          pid: 9999,
          stdout,
          stderr,
          on(){},
        };
        // Emit a structured PROGRESS line shortly after start
        setTimeout(() => {
          const p = {
            visited: 1, downloaded: 1, found: 0, saved: 0, errors: 0,
            bytes: 1024,
            queueSize: 0,
            domain: 'example.com',
            domainRpm: 15,
            domainLimit: 20,
            domainBackoffMs: 0,
            domainRateLimited: true,
            domainIntervalMs: 3000
          };
          const line = `PROGRESS ${JSON.stringify(p)}\n`;
          for (const fn of listeners.data) fn(Buffer.from(line, 'utf8'));
        }, 100);
        return child;
      }
    };
    const app = createApp({ runner: fakeRunner });
    const { server, port } = await startHttp(app);

    // Open SSE first
    const ssePromise = collectSse('127.0.0.1', port, '/events', 1200);
    // Start the crawl to trigger the fake runner
    await new Promise((resolve) => {
      const req = http.request({ hostname: '127.0.0.1', port, path: '/api/crawl', method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
        res.resume(); res.on('end', resolve);
      });
      req.end(JSON.stringify({ startUrl: 'https://example.com' }));
    });
    const sse = await ssePromise;
    expect(sse.status).toBe(200);
    expect(sse.text).toMatch(/event: progress/);
    // Ensure payload fields are included in the JSON text
    expect(sse.text).toMatch(/domainRateLimited/);
    expect(sse.text).toMatch(/domainIntervalMs/);

    await new Promise((r) => server.close(r));
  });
});
