const http = require('http');

function startServerWithEnv(env = {}) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const path = require('path');
    const node = process.execPath;
    const repoRoot = path.join(__dirname, '..', '..');
    const envAll = { ...process.env, ...env, PORT: '0' };
    const cp = spawn(node, ['src/ui/express/server.js'], { cwd: repoRoot, env: envAll, stdio: ['ignore','pipe','pipe'] });
    const onData = (data) => {
      const s = data.toString();
      const m = s.match(/GUI server listening on http:\/\/localhost:(\d+)/);
      if (m) { cp.stdout.off('data', onData); resolve({ cp, port: parseInt(m[1],10) }); }
    };
    cp.stdout.on('data', onData);
    cp.once('exit', (code) => reject(new Error(`server exited early: code=${code}`)));
  });
}

function postJson({ hostname, port, path, body, timeoutMs = 5000 }) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body||{}), 'utf8');
    const req = http.request({ hostname, port, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } }, (res) => {
      let buf = ''; res.setEncoding('utf8');
      res.on('data', (d) => buf += d);
      res.on('end', () => { resolve({ status: res.statusCode, text: buf }); });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { try { req.destroy(new Error('timeout')); } catch(_){} });
    req.write(data); req.end();
  });
}

function sseUntil({ hostname, port, path, matcher, timeoutMs = 1500 }) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname, port, path }, (res) => {
      res.setEncoding('utf8');
      let buf = '';
      const onData = (d) => {
        buf += d;
        try { if (matcher(buf)) { cleanup(); resolve({ status: res.statusCode, text: buf }); } } catch(_) {}
      };
      const cleanup = () => { try { res.off('data', onData); } catch(_) {} try { res.destroy(); } catch(_) {} clearTimeout(t); };
      const t = setTimeout(() => { cleanup(); resolve({ status: res.statusCode, text: buf }); }, timeoutMs);
      res.on('data', onData);
      res.on('end', () => { cleanup(); resolve({ status: res.statusCode, text: buf }); });
    });
    req.on('error', reject);
  });
}

describe('HTTP E2E: catch pending POST and early SSE activity', () => {
  test('POST /api/crawl returns within 800ms', async () => {
    const { cp, port } = await startServerWithEnv({ UI_FAKE_RUNNER: '1' });
    try {
      const t0 = process.hrtime.bigint();
      const res = await postJson({ hostname: '127.0.0.1', port, path: '/api/crawl', body: { startUrl: 'https://example.com', depth: 0, maxPages: 1, useSitemap: false, sitemapOnly: false }, timeoutMs: 4000 });
      const dtMs = Number(process.hrtime.bigint() - t0) / 1e6;
      expect(res.status).toBe(202);
      expect(dtMs).toBeLessThan(800);
    } finally { try { cp.kill('SIGINT'); } catch(_){} }
  });

  test('SSE shows start activity within 500ms of POST', async () => {
    const { cp, port } = await startServerWithEnv({ UI_FAKE_RUNNER: '1' });
    try {
      // Open SSE first to avoid missing seeded events
      const seen = { start: false, progress: false };
      const sseP = sseUntil({ hostname: '127.0.0.1', port, path: '/events?logs=1', matcher: (buf) => (/\[server\] starting crawler/.test(buf) || /event: progress/.test(buf)), timeoutMs: 1200 });
      const res = await postJson({ hostname: '127.0.0.1', port, path: '/api/crawl', body: { startUrl: 'https://example.com', depth: 0, maxPages: 1, useSitemap: false, sitemapOnly: false }, timeoutMs: 3000 });
      expect(res.status).toBe(202);
      const sse = await sseP;
      expect(sse.status).toBe(200);
      expect(sse.text).toMatch(/(\[server\] starting crawler|event: progress)/);
    } finally { try { cp.kill('SIGINT'); } catch(_){} }
  });
});
