const { spawn } = require('child_process');

function startServerWithEnv(env = {}) {
  return new Promise((resolve, reject) => {
    const node = process.execPath;
    const path = require('path');
    // Use repo root as cwd so the server path resolves correctly
    const repoRoot = path.join(__dirname, '..', '..', '..', '..');
    const cp = spawn(node, ['src/ui/express/server.js'], {
      cwd: repoRoot,
      env: { ...process.env, PORT: '0', UI_FAKE_RUNNER: '1', UI_FAKE_MILESTONES: '1', ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const onData = (b) => {
      const s = b.toString();
      const m = s.match(/GUI server listening on http:\/\/localhost:(\d+)/i) || s.match(/listening on http:\/\/localhost:(\d+)/i);
      if (m) { cp.stdout.off('data', onData); resolve({ cp, port: parseInt(m[1], 10) }); }
    };
    cp.stdout.on('data', onData);
    cp.on('error', reject);
    // If the server exits before we detect the port, fail fast
    cp.once('exit', (code) => reject(new Error(`server exited early: code=${code}`)));
    setTimeout(() => reject(new Error('server start timeout')), 5000);
  });
}

function post(port, path, body) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const req = http.request({ method: 'POST', port, path, headers: { 'content-type': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(data || '{}') }); }
        catch { resolve({ status: res.statusCode, text: data }); }
      });
    });
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

function get(port, path) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const req = http.request({ hostname: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, text: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('Milestones SSR', () => {
  it('lists milestones emitted by the fake runner', async () => {
    const { cp, port } = await startServerWithEnv();
    try {
      // Start a crawl so the fake runner emits and the server persists milestones
      const r = await post(port, '/api/crawl', { startUrl: 'https://ex.com', depth: 0, maxPages: 1, useSitemap: false });
      expect(r.status).toBe(202);
      // Allow short time for the fake runner to emit milestones and for persistence
      await new Promise(res => setTimeout(res, 250));
      const ssr = await get(port, '/milestones/ssr');
      expect(ssr.status).toBe(200);
      expect(ssr.text).toMatch(/<title>Milestones<\/title>/);
      // Should contain our fake milestones kinds
      expect(ssr.text).toMatch(/patterns-learned/);
      expect(ssr.text).toMatch(/hubs-seeded/);
    } finally {
      try { cp.kill('SIGTERM'); } catch (_) {}
    }
  });
});
