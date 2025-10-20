const http = require('http');

function startServerWithEnv(env = {}) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const path = require('path');
    const node = process.execPath;
    const repoRoot = path.join(__dirname, '..', '..');
    const envAll = { ...process.env, ...env, PORT: '0' };
    const cp = spawn(node, ['src/ui/express/server.js'], { cwd: repoRoot, env: envAll, stdio: ['ignore','pipe','pipe'] });
    let stderrBuf = '';
    const onData = (data) => {
      const s = data.toString();
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

function collectSseJson(hostname, port, path, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname, port, path }, (res) => {
      let buf = ''; res.setEncoding('utf8');
      const events = [];
      const finish = (tag) => { clearTimeout(t); try { res.destroy(); } catch(_){} resolve({ status: res.statusCode, events, raw: buf, tag }); };
      const t = setTimeout(() => finish('timeout'), timeoutMs);
      res.on('data', (d) => {
        buf += d;
        const parts = buf.split('\n\n');
        buf = parts.pop();
        for (const part of parts) {
          const m = part.match(/^event: (\w+)/m);
          if (!m) continue;
          const ev = m[1];
          const dataLine = part.split('\n').find(l => l.startsWith('data: '));
          if (!dataLine) continue;
          try {
            const payload = JSON.parse(dataLine.slice(6));
            events.push({ ev, payload });
            if (ev === 'done') finish('done');
          } catch(_){}
        }
      });
      res.on('end', () => finish('eof'));
    });
    req.on('error', reject);
  });
}

describe('jobId tagging and /events?job acceptance', () => {
  test('POST /api/crawl returns jobId and SSE progress/done include jobId', async () => {
    const { cp, port } = await startServerWithEnv({ UI_FAKE_RUNNER: '1' });
    try {
      const start = await httpJson('127.0.0.1', port, '/api/crawl', 'POST', { startUrl: 'https://example.com', depth: 0, maxPages: 1, useSitemap: false, sitemapOnly: false, requestTimeoutMs: 1500 });
      expect(start.status).toBe(202);
      expect(start.json).toBeTruthy();
      expect(start.json).toHaveProperty('jobId');
      const jobId = start.json.jobId;
      expect(typeof jobId).toBe('string');

      const sse = await collectSseJson('127.0.0.1', port, '/events?logs=0&job=' + encodeURIComponent(jobId), 4000);
      expect(sse.status).toBe(200);
      const progress = sse.events.find(e => e.ev === 'progress');
      expect(progress && typeof progress.payload.jobId === 'string').toBe(true);
      const done = sse.events.find(e => e.ev === 'done');
      expect(done && typeof done.payload.jobId === 'string').toBe(true);
    } finally { try { cp.kill('SIGINT'); } catch(_){} }
  });
});

