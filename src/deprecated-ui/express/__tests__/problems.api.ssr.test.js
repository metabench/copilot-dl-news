const http = require('http');

function startServerWithEnv(env = {}) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const path = require('path');
    const node = process.execPath;
  const repoRoot = path.join(__dirname, '..', '..', '..', '..');
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

function post(port, path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ method: 'POST', port, path, headers: { 'content-type': 'application/json' } }, res => {
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
    http.get({ port, path }, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(data || '{}') }); }
        catch { resolve({ status: res.statusCode, text: data }); }
      });
    }).on('error', reject);
  });
}

describe('Problems persistence and APIs', () => {
  it('persists problem events and lists them via APIs and SSR', async () => {
    const { cp, port } = await startServerWithEnv({ UI_FAKE_RUNNER: '1', UI_FAKE_PROBLEMS: '1' });
    try {
      const r = await post(port, '/api/crawl', { startUrl: 'https://ex.com', depth: 0, maxPages: 1, useSitemap: false });
      expect(r.status).toBe(202);
      const jobId = r.json.jobId || r.json.job_id || null;

      // Allow a short time for events to be processed and persisted
      await new Promise(res => setTimeout(res, 220));

      const api = await get(port, '/api/problems?limit=10');
      expect(api.status).toBe(200);
      expect(Array.isArray(api.json.items)).toBe(true);
      expect(api.json.items.length).toBeGreaterThanOrEqual(1);
      const kinds = new Set(api.json.items.map(i => i.kind));
      expect(kinds.has('missing-hub') || kinds.has('unknown-pattern')).toBe(true);

      // Filter by job id when available
      if (jobId) {
        const apiByJob = await get(port, `/api/problems?job=${encodeURIComponent(jobId)}&limit=10`);
        expect(apiByJob.status).toBe(200);
        expect(Array.isArray(apiByJob.json.items)).toBe(true);
      }

      const ssr = await get(port, '/problems/ssr');
      expect(ssr.status).toBe(200);
      expect(typeof ssr.text).toBe('string');
      expect(ssr.text).toMatch(/<title>Problems<\/title>/);
    } finally {
      try { cp.kill('SIGINT'); } catch(_) {}
    }
  });
});
