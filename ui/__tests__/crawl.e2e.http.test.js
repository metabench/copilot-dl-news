const http = require('http');

function startServerWithEnv(env = {}) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const path = require('path');
    const node = process.execPath;
    const repoRoot = path.join(__dirname, '..', '..');
    const envAll = { ...process.env, ...env, PORT: '0' };
  const cp = spawn(node, ['src/ui/express/server.js'], { cwd: repoRoot, env: envAll, stdio: ['ignore','pipe','pipe'] });
    let stdoutBuf = '';
    let stderrBuf = '';
    const onData = (data) => {
      const s = data.toString(); stdoutBuf += s;
      const m = s.match(/GUI server listening on http:\/\/localhost:(\d+)/);
      if (m) {
        const port = parseInt(m[1], 10);
        cp.stdout.off('data', onData);
        resolve({ cp, port, stdoutBuf, stderrBuf });
      }
    };
    cp.stdout.on('data', onData);
    cp.stderr.on('data', d => { stderrBuf += d.toString(); });
    cp.once('exit', (code) => reject(new Error(`server exited early: code=${code} stderr=${stderrBuf.trim()}`)));
  });
}

function httpJson(hostname, port, path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;
    const req = http.request({ hostname, port, path, method, headers: { 'Content-Type': 'application/json', 'Content-Length': data ? data.length : 0 } }, (res) => {
      let buf = ''; res.setEncoding('utf8');
      res.on('data', (d) => buf += d);
      res.on('end', () => {
        let json = null; try { json = JSON.parse(buf); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, text: buf, json });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
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

// Skip by default in CI if E2E disabled
const E2E_ENABLED = !process.env.CI || process.env.E2E_HTTP === '1';

(E2E_ENABLED ? describe : describe.skip)('e2e http: start crawl and receive progress via SSE', () => {
  let cp; let port;
  beforeAll(async () => {
    const started = await startServerWithEnv({ UI_FAKE_RUNNER: '1' });
    cp = started.cp; port = started.port;
  });
  afterAll(async () => {
    if (cp) try { cp.kill('SIGINT'); } catch (_) {}
    await new Promise(r => setTimeout(r, 300));
  });

  test('POST /api/crawl responds 202 and SSE shows activity', async () => {
    const ssePromise = collectSse('127.0.0.1', port, '/events?logs=1', 1200);
    const start = await httpJson('127.0.0.1', port, '/api/crawl', 'POST', { startUrl: 'https://example.com', depth: 0, maxPages: 1, useSitemap: false, sitemapOnly: false });
    expect(start.status).toBe(202);
    const sse = await ssePromise;
    expect(sse.status).toBe(200);
    expect(sse.text).toMatch(/event: log/);
    expect(sse.text).toMatch(/event: progress/);
  });
});
