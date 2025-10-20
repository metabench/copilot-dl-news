const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const Database = require('better-sqlite3');

function startServerWithEnv(env = {}) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

describe('Queues persistence and APIs', () => {
  it('persists queue events and lists them via APIs', async () => {
    const { cp, port } = await startServerWithEnv({ UI_FAKE_RUNNER: '1', UI_FAKE_QUEUE: '1' });
    try {
      const r = await post(port, '/api/crawl', { startUrl: 'https://ex.com', depth: 0, maxPages: 1, useSitemap: false });
      expect(r.status).toBe(202);
      const jobId = r.json.jobId || r.json.job_id || null;

      // Allow a short time for events to be processed and persisted
      await delay(220);

      const q = await get(port, '/api/queues');
      expect(q.status).toBe(200);
      expect(Array.isArray(q.json.items)).toBe(true);
      const jobRow = jobId ? q.json.items.find(i => i.id === jobId) : q.json.items[0];
      expect(jobRow).toBeTruthy();
      expect(jobRow.events).toBeGreaterThanOrEqual(2);

      const ev = await get(port, `/api/queues/${encodeURIComponent(jobRow.id)}/events?limit=10`);
      expect(ev.status).toBe(200);
      expect(ev.json.job.id).toBe(jobRow.id);
      expect(ev.json.items.length).toBeGreaterThan(0);
      const actions = new Set(ev.json.items.map(i => i.action));
      expect(actions.has('enqueued')).toBe(true);
      expect(actions.has('dequeued')).toBe(true);
      expect(actions.has('drop')).toBe(true);
    } finally {
      try { cp.kill('SIGINT'); } catch(_) {}
    }
  });

  it('auto-resolves queues that never recorded events', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'queues-test-'));
    const dbPath = path.join(tmpDir, 'news-auto.db');

    const { cp, port } = await startServerWithEnv({
      UI_FAKE_RUNNER: '1',
      UI_FAKE_QUEUE: '1',
      UI_DB_PATH: dbPath
    });

    try {
      // Give the server time to initialise the database schema.
      await delay(120);

      const db = new Database(dbPath);
      try {
        db.exec(`
          CREATE TABLE IF NOT EXISTS crawl_jobs (
            id TEXT PRIMARY KEY,
            url TEXT,
            args TEXT,
            pid INTEGER,
            started_at TEXT,
            ended_at TEXT,
            status TEXT
          );
          CREATE TABLE IF NOT EXISTS queue_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT NOT NULL,
            ts TEXT NOT NULL,
            action TEXT NOT NULL,
            url TEXT,
            depth INTEGER,
            host TEXT,
            reason TEXT,
            queue_size INTEGER
          );
        `);
        const startedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        db.prepare('INSERT OR REPLACE INTO crawl_jobs(id, url, args, pid, started_at, ended_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run('ghost-job-1', 'https://example.com', '[]', null, startedAt, null, 'running');
      } finally {
        db.close();
      }

      const response = await get(port, '/api/queues');
      expect(response.status).toBe(200);
      const ghost = response.json.items.find((row) => row.id === 'ghost-job-1');
      expect(ghost).toBeTruthy();
      expect(ghost.status).toBe('done');
      expect(ghost.endedAt).toBeTruthy();
      expect(ghost.events).toBe(0);

      const detail = await get(port, '/api/queues/ghost-job-1/events');
      expect(detail.status).toBe(200);
      expect(detail.json.job.status).toBe('done');
      expect(detail.json.items).toEqual([]);
    } finally {
      try { cp.kill('SIGINT'); } catch (_) {}
      await delay(80);
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (_) {}
    }
  });
});
