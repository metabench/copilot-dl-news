const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

function startServer(env = {}) {
  return new Promise((resolve, reject) => {
    const node = process.execPath;
    const repoRoot = path.join(__dirname, '..', '..', '..', '..');
    const cp = spawn(node, ['src/ui/express/server.js'], {
      cwd: repoRoot,
      env: { ...process.env, PORT: '0', UI_FAKE_RUNNER: '1', UI_FAKE_PROBLEMS: '1', UI_FAKE_MILESTONES: '1', ...env },
      stdio: ['ignore','pipe','pipe']
    });
    const onData = (b) => {
      const s = b.toString();
      const m = s.match(/GUI server listening on http:\/\/localhost:(\d+)/i);
      if (m) { cp.stdout.off('data', onData); resolve({ cp, port: parseInt(m[1],10) }); }
    };
    cp.stdout.on('data', onData);
    cp.once('exit', (code) => reject(new Error(`server exited early: code=${code}`)));
    setTimeout(() => reject(new Error('server start timeout')), 6000);
  });
}

function post(port, p, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ method: 'POST', port, path: p, headers: { 'content-type': 'application/json' } }, res => {
      let data = ''; res.on('data', c => (data += c)); res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(data || '{}') }); }
        catch { resolve({ status: res.statusCode, text: data }); }
      }); });
    req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
  });
}

function getText(port, p) {
  return new Promise((resolve, reject) => {
    http.get({ port, path: p }, res => { let data = ''; res.on('data', c => (data += c)); res.on('end', () => resolve({ status: res.statusCode, text: data })); }).on('error', reject);
  });
}

describe('Problems & Milestones SSR combined', () => {
  it('renders both SSR pages with table headers and seeded events', async () => {
    const { cp, port } = await startServer();
    try {
      const r = await post(port, '/api/crawl', { startUrl: 'https://example.com', depth: 0, maxPages: 1, useSitemap: false });
      expect(r.status).toBe(202);
      // wait for fake runner to emit and persistence to flush
      await new Promise(res => setTimeout(res, 260));
      const problems = await getText(port, '/problems/ssr');
      const milestones = await getText(port, '/milestones/ssr');
      expect(problems.status).toBe(200);
      expect(milestones.status).toBe(200);
      expect(problems.text).toMatch(/<title>Problems<\/title>/);
      expect(milestones.text).toMatch(/<title>Milestones<\/title>/);
      // basic layout expectations (table headers / nav links)
      expect(problems.text).toMatch(/Kind/i);
      expect(problems.text).toMatch(/Scope/i);
      expect(milestones.text).toMatch(/Kind/i);
      // verify at least one known fake kind appears
      expect(problems.text).toMatch(/missing-hub|unknown-pattern/);
      expect(milestones.text).toMatch(/patterns-learned/);
    } finally {
      try { cp.kill('SIGTERM'); } catch (_) {}
    }
  });
});
