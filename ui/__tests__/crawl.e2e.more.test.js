const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

jest.setTimeout(15000);

function startServerWithEnv(env = {}) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const node = process.execPath;
    const repoRoot = path.join(__dirname, '..', '..');
    const envAll = { ...process.env, ...env, PORT: '0' };
    const cp = spawn(node, ['src/ui/express/server.js'], { cwd: repoRoot, env: envAll, stdio: ['ignore','pipe','pipe'] });
    let stdoutBuf = ''; let stderrBuf = '';
    const onData = (data) => {
      const s = data.toString(); stdoutBuf += s;
      const m = s.match(/GUI server listening on http:\/\/localhost:(\d+)/);
      if (m) { cp.stdout.off('data', onData); resolve({ cp, port: parseInt(m[1],10) }); }
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
        let json = null; try { json = JSON.parse(buf); } catch(_){}
        resolve({ status: res.statusCode, headers: res.headers, text: buf, json });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function collectSseUntil(hostname, port, path, matcher, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname, port, path }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      const done = (tag) => { clearTimeout(t); try { res.destroy(); } catch(_){} resolve({ status: res.statusCode, text: buf, tag }); };
      const t = setTimeout(() => done('timeout'), timeoutMs);
      res.on('data', (d) => {
        buf += d;
        try { if (matcher(buf)) done('matched'); } catch(_) {}
      });
      res.on('end', () => done('eof'));
    });
    req.on('error', reject);
  });
}

describe('e2e http: more precise coverage', () => {
  test('spawn failure yields a done event quickly', async () => {
    const { cp, port } = await startServerWithEnv({ UI_FORCE_SPAWN_FAIL: '1' });
    try {
      // Observe SSE and expect the session to end (done) quickly on simulated failure
      const doneP = collectSseUntil('127.0.0.1', port, '/events?logs=1', (buf) => /event: done/.test(buf), 5000);
      const start = await httpJson('127.0.0.1', port, '/api/crawl', 'POST', { startUrl: 'https://example.com', depth: 0, maxPages: 1 });
      expect(start.status).toBe(202);
      const doneSse = await doneP;
      expect(doneSse.status).toBe(200);
      expect(doneSse.text).toMatch(/event: done/);
    } finally { try { cp.kill('SIGINT'); } catch(_){} }
  });

  test('pause/resume/stop flow toggles paused and ends with done', async () => {
    const { cp, port } = await startServerWithEnv({ UI_FAKE_RUNNER: '1' });
    try {
      const sseP = collectSseUntil('127.0.0.1', port, '/events?logs=1', (buf) => /event: done/.test(buf) && /paused":false/.test(buf), 2500);
      const start = await httpJson('127.0.0.1', port, '/api/crawl', 'POST', { startUrl: 'https://example.com', depth: 0, maxPages: 1 });
      expect(start.status).toBe(202);
      // Issue pause/resume quickly
      const p = await httpJson('127.0.0.1', port, '/api/pause', 'POST', {});
      expect(p.status).toBe(200);
      const r = await httpJson('127.0.0.1', port, '/api/resume', 'POST', {});
      expect(r.status).toBe(200);
      const st = await httpJson('127.0.0.1', port, '/api/stop', 'POST', {});
      expect(st.status).toBe(202);
      const sse = await sseP;
      expect(sse.status).toBe(200);
      // We should see a paused:true then paused:false progress frame and a final done
      expect(sse.text).toMatch(/event: progress[\s\S]*paused\":true/);
      expect(sse.text).toMatch(/event: progress[\s\S]*paused\":false/);
      expect(sse.text).toMatch(/event: done/);
    } finally { try { cp.kill('SIGINT'); } catch(_){} }
  });

  test('SSE logs filter hides logs but progress still arrives', async () => {
    const { cp, port } = await startServerWithEnv({ UI_FAKE_RUNNER: '1' });
    try {
      const sseP = collectSseUntil('127.0.0.1', port, '/events?logs=0', (buf) => /event: progress/.test(buf), 1500);
      const start = await httpJson('127.0.0.1', port, '/api/crawl', 'POST', { startUrl: 'https://example.com', depth: 0, maxPages: 1 });
      expect(start.status).toBe(202);
      const sse = await sseP;
      expect(sse.status).toBe(200);
      expect(sse.text).not.toMatch(/event: log/);
      expect(sse.text).toMatch(/event: progress/);
    } finally { try { cp.kill('SIGINT'); } catch(_){} }
  });

  test('long log line is truncated server-side', async () => {
    const { cp, port } = await startServerWithEnv({ UI_FAKE_RUNNER: '1', UI_FAKE_LONGLOG: '1', UI_LOG_LINE_MAX_CHARS: '2048' });
    try {
      const sseP = collectSseUntil('127.0.0.1', port, '/events?logs=1', (buf) => /\[truncated \d+ chars\]/.test(buf), 2000);
      const start = await httpJson('127.0.0.1', port, '/api/crawl', 'POST', { startUrl: 'https://example.com', depth: 0, maxPages: 1 });
      expect(start.status).toBe(202);
      const sse = await sseP;
      expect(sse.status).toBe(200);
      expect(sse.text).toMatch(/\[truncated \d+ chars\]/);
    } finally { try { cp.kill('SIGINT'); } catch(_){} }
  });

  test('planner stage events stream and persist', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-stage-'));
    const dbPath = path.join(tmpDir, 'news.db');
    const { cp, port } = await startServerWithEnv({ UI_FAKE_RUNNER: '1', UI_FAKE_PLANNER: '1', UI_DB_PATH: dbPath });
    try {
      const sseP = collectSseUntil(
        '127.0.0.1',
        port,
        '/events?logs=1',
        (buf) => /event: planner-stage/.test(buf) && /event: milestone/.test(buf) && /intelligent-completion/.test(buf) && /event: done/.test(buf),
        2500
      );
      const start = await httpJson('127.0.0.1', port, '/api/crawl', 'POST', { startUrl: 'https://example.com', depth: 0, maxPages: 1, crawlType: 'intelligent' });
      expect(start.status).toBe(202);
      const sse = await sseP;
      expect(sse.status).toBe(200);
      expect(sse.text).toMatch(/event: planner-stage/);
      expect(sse.text).toMatch(/event: milestone/);
      expect(sse.text).toMatch(/intelligent-completion/);
      expect(sse.text).toMatch(/event: done/);
    } finally {
      try { cp.kill('SIGINT'); } catch (_) {}
    }
    // Wait for server shutdown (500ms) + margin to ensure database is released
    await new Promise((resolve) => setTimeout(resolve, 600));
    const db = new Database(dbPath, { readonly: true });
    const rows = db.prepare('SELECT stage, status FROM planner_stage_events').all();
    db.close();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => row.status === 'started')).toBe(true);
    expect(rows.some((row) => row.status === 'completed')).toBe(true);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
