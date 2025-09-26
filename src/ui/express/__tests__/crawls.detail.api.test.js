const http = require('http');
const { EventEmitter } = require('events');
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

function makePersistentFakeRunner() {
  return {
    start() {
      const ee = new EventEmitter();
      ee.stdout = new EventEmitter();
      ee.stderr = new EventEmitter();
      ee.stdin = { write: () => true };
      ee.pid = Math.floor(Math.random() * 100000) + 1000;
      ee.killed = false;
      ee.kill = () => {
        if (ee.killed) return;
        ee.killed = true;
        setTimeout(() => { try { ee.emit('exit', 0, null); } catch (_) {} }, 10);
      };
      setTimeout(() => {
        try { ee.stdout.emit('data', Buffer.from('Starting persistent fake crawler\n', 'utf8')); } catch (_) {}
        try {
          const prog = { visited: 1, downloaded: 1, found: 1, saved: 1, errors: 0, queueSize: 0, robotsLoaded: true };
          ee.stdout.emit('data', Buffer.from('PROGRESS ' + JSON.stringify(prog) + '\n', 'utf8'));
        } catch (_) {}
      }, 10);
      return ee;
    }
  };
}

function httpPostJson({ port, path, body }) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body || {}));
    const req = http.request({ hostname: '127.0.0.1', port, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } }, (res) => {
      const bufs = [];
      res.on('data', (c) => bufs.push(c));
      res.on('end', () => {
        const text = Buffer.concat(bufs).toString('utf8');
        let json = null; try { json = JSON.parse(text); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function httpGetJson({ port, path }) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path, headers: { 'Accept': 'application/json' } }, (res) => {
      const bufs = [];
      res.on('data', (c) => bufs.push(c));
      res.on('end', () => {
        const text = Buffer.concat(bufs).toString('utf8');
        let json = null; try { json = JSON.parse(text); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    }).on('error', reject);
  });
}

describe('GET /api/crawls/:id (detail)', () => {
  test('returns a snapshot for a running job and after stop', async () => {
    const app = createApp({ allowMultiJobs: true, runner: makePersistentFakeRunner() });
    const { server, port } = await startHttp(app);
    try {
      const r1 = await httpPostJson({ port, path: '/api/crawl', body: { startUrl: 'https://example.com/one', depth: 0 } });
      expect(r1.status).toBe(202);
      const j1 = String(r1.json.jobId || '');
      expect(j1).toBeTruthy();

      // Fetch detail
      const d1 = await httpGetJson({ port, path: `/api/crawls/${encodeURIComponent(j1)}` });
      expect(d1.status).toBe(200);
      expect(d1.json).toMatchObject({ id: j1, startUrl: 'https://example.com/one', status: expect.any(String) });
      expect(Array.isArray(d1.json.args)).toBe(true);
      expect(typeof d1.json.startedAt).toBe('string');
      expect(d1.json.endedAt === null || typeof d1.json.endedAt === 'string').toBe(true);
      expect(d1.json.metrics).toMatchObject({ visited: expect.any(Number), downloaded: expect.any(Number) });

      // Stop job
      const stop1 = await httpPostJson({ port, path: '/api/stop', body: { jobId: j1 } });
      expect([200,202]).toContain(stop1.status);
      await new Promise(r => setTimeout(r, 30));

      // Fetch detail again; expect status=done and endedAt set
      const d2 = await httpGetJson({ port, path: `/api/crawls/${encodeURIComponent(j1)}` });
      // After stop, job entry may be removed from memory; 404 is acceptable for now
      if (d2.status === 200) {
        expect(d2.json.status).toBe('done');
        expect(typeof d2.json.endedAt).toBe('string');
      } else {
        expect(d2.status).toBe(404);
      }
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});
