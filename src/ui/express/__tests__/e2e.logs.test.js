/**
 * E2E test (optional) that verifies logs appear after starting a crawl.
 * Guarded by E2E env flag to avoid running in CI without a browser.
 * Run with: E2E=1 npm test -- -t e2e
 */

const path = require('path');
const http = require('http');

const E2E_ENABLED = process.env.E2E === '1';
// Allow up to 2 minutes for E2E flows over the public internet
jest.setTimeout(120000);

// Conditionally require puppeteer only when enabled
let puppeteer = null;
if (E2E_ENABLED) {
  try { puppeteer = require('puppeteer'); } catch (_) {}
}

describe('e2e: logs appear on Start', () => {
  if (!E2E_ENABLED || !puppeteer) {
    it('skipped (E2E disabled)', () => {
      expect(true).toBe(true);
    });
    return;
  }

  let serverProc = null;
  let baseUrl = 'http://localhost:3000';
  let browser = null;
  // simple POST helper to stop any running crawl between tests
  const postJson = (pathName, body) => new Promise((resolve) => {
    try {
      const u = new URL(pathName, baseUrl);
      const req = http.request({ method: 'POST', hostname: u.hostname, port: u.port, path: u.pathname, headers: { 'Content-Type': 'application/json' } }, (res) => {
        let buf = '';
        res.on('data', d => buf += d.toString());
        res.on('end', () => {
          let j=null; try { j = JSON.parse(buf); } catch(_) {}
          resolve({ status: res.statusCode, ok: (res.statusCode||0) >= 200 && (res.statusCode||0) < 300, body: j });
        });
      });
      req.on('error', () => resolve({ status: 0, ok: false, body: null }));
      req.end(body ? JSON.stringify(body) : undefined);
    } catch (_) {
      resolve({ status: 0, ok: false, body: null });
    }
  });

  const startServer = () => new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const node = process.execPath;
  const repoRoot = path.join(__dirname, '..', '..', '..', '..');
  // Use a random port and allow an isolated DB path if DB_PATH_TEST is set
  const env = { ...process.env, PORT: '0' };
  if (process.env.DB_PATH_TEST) env.DB_PATH = process.env.DB_PATH_TEST;
  serverProc = spawn(node, ['src/ui/express/server.js'], { cwd: repoRoot, env, stdio: ['ignore','pipe','pipe'] });
    let stderrBuf = '';
    const onData = (data) => {
      const s = data.toString();
      const m = s.match(/GUI server listening on http:\/\/localhost:(\d+)/);
      if (m) {
        const port = parseInt(m[1], 10);
        if (!isNaN(port)) baseUrl = `http://localhost:${port}`;
        serverProc.stdout.off('data', onData);
        resolve();
      }
    };
    serverProc.stdout.on('data', onData);
    serverProc.stderr.on('data', (d) => { stderrBuf += d.toString(); });
    serverProc.once('exit', (code) => {
      reject(new Error(`server exited early: ${code}${stderrBuf ? ' — ' + stderrBuf.trim() : ''}`));
    });
  });

  const stopServer = async () => {
    if (!serverProc) return;
    try { serverProc.kill('SIGINT'); } catch (_) {}
    await new Promise(r => setTimeout(r, 500));
  };

  beforeAll(async () => {
    jest.setTimeout(60000);
    await startServer();
  browser = await puppeteer.launch({ headless: 'new' });
  });

  afterAll(async () => {
    try { if (browser) await browser.close(); } catch (_) {}
    await stopServer();
  });

  afterEach(async () => {
    // Try to stop any running crawl to keep tests isolated
    await postJson('/api/stop');
    await new Promise(r => setTimeout(r, 250));
  });

  it('shows an actual crawler log after Start (Guardian, 4 pages, c=2)', async () => {
    const page = await browser.newPage();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  // Check the Recent Domains panel loads without a hard failure message
  await page.waitForSelector('#domains');
  const domainsText = await page.$eval('#domains', el => (el.textContent||'').trim());
  expect(domainsText).not.toMatch(/^Failed to load/);
    // Ensure logs are enabled
    await page.waitForSelector('#showLogs');
    const isChecked = await page.$eval('#showLogs', el => el.checked);
    if (!isChecked) { await page.click('#showLogs'); }
  // Start via API to ensure flags; perform a real crawl against a public site
    const resp = await page.evaluate(async () => {
      const body = {
    startUrl: 'https://www.theguardian.com',
    depth: 1,
        maxPages: 4,
        concurrency: 2,
        slow: false,
        useSitemap: false,
        sitemapOnly: false,
        preferCache: false,
        refetchIfOlderThan: '0'
      };
      const r = await fetch('/api/crawl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      let j=null; try { j = await r.json(); } catch(_) {}
      return { ok: r.ok, status: r.status, body: j };
    });
    expect(resp && resp.ok).toBe(true);
    // Wait for an actual network fetch line to appear in logs
    const fetchSeen = await page.waitForFunction(() => {
      const el = document.getElementById('logs');
      if (!el) return false;
      return /Fetching:\s+https?:\/\//.test(el.textContent || '');
    }, { timeout: 3000 }).catch(() => null);
    expect(Boolean(fetchSeen)).toBe(true);
    // Also assert progress shows at least one download within the short window
    const dlSeen = await page.waitForFunction(() => {
      const p = document.getElementById('progress');
      if (!p) return false;
      const m = (p.textContent||'').match(/downloaded:\s*(\d+)/i);
      return m && parseInt(m[1], 10) >= 1;
    }, { timeout: 3000 }).catch(() => null);
  expect(Boolean(dlSeen)).toBe(true);
  // Double-check logs contain the expected wording for a download fetch
  const logsText = await page.$eval('#logs', el => el.textContent || '');
  expect(/Fetching:\s+https?:\/\//.test(logsText)).toBe(true);
  });

  it('sitemap-only: enqueues from sitemap and downloads at least one page', async () => {
    const page = await browser.newPage();
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#showLogs');
    const isChecked = await page.$eval('#showLogs', el => el.checked);
    if (!isChecked) { await page.click('#showLogs'); }
    const resp = await page.evaluate(async () => {
      const body = {
        startUrl: 'https://www.theguardian.com',
        depth: 0,
        maxPages: 3,
        concurrency: 2,
        slow: false,
        useSitemap: true,
        sitemapOnly: true,
        preferCache: false,
        refetchIfOlderThan: '0'
      };
      const r = await fetch('/api/crawl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      let j=null; try { j = await r.json(); } catch(_) {}
      return { ok: r.ok, status: r.status, body: j };
    });
    expect(resp && resp.ok).toBe(true);
    // Wait for sitemap enqueue confirmation or first fetch
    const sawSitemapOrFetch = await page.waitForFunction(() => {
      const t = (document.getElementById('logs')?.textContent||'');
      return /Sitemap enqueue complete:\s*\d+/.test(t) || /Fetching:\s+https?:\/\//.test(t);
    }, { timeout: 15000 }).catch(() => null);
    expect(Boolean(sawSitemapOrFetch)).toBe(true);
    // Then assert at least one download happens soon
    const dlSeen = await page.waitForFunction(() => {
      const p = document.getElementById('progress');
      if (!p) return false;
      const m = (p.textContent||'').match(/downloaded:\s*(\d+)/i);
      return m && parseInt(m[1], 10) >= 1;
    }, { timeout: 10000 }).catch(() => null);
    expect(Boolean(dlSeen)).toBe(true);
  });

  it('pause/resume halts and then resumes downloads', async () => {
    const page = await browser.newPage();
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#showLogs');
    const isChecked = await page.$eval('#showLogs', el => el.checked);
    if (!isChecked) { await page.click('#showLogs'); }
    const resp = await page.evaluate(async () => {
      const body = {
        startUrl: 'https://www.theguardian.com',
        depth: 1,
        maxPages: 6,
        concurrency: 2,
        slow: false,
        useSitemap: false,
        sitemapOnly: false,
        preferCache: false,
        refetchIfOlderThan: '0'
      };
      const r = await fetch('/api/crawl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      let j=null; try { j = await r.json(); } catch(_) {}
      return { ok: r.ok, status: r.status, body: j };
    });
    expect(resp && resp.ok).toBe(true);
    // Wait for first download
    const firstDl = await page.waitForFunction(() => {
      const p = document.getElementById('progress');
      if (!p) return false;
      const m = (p.textContent||'').match(/downloaded:\s*(\d+)/i);
      return m && parseInt(m[1], 10) >= 1;
    }, { timeout: 10000 }).catch(() => null);
    expect(Boolean(firstDl)).toBe(true);

    // Pause
    const before = await page.$eval('#progress', el => {
      const m = (el.textContent||'').match(/downloaded:\s*(\d+)/i);
      return m ? parseInt(m[1], 10) : 0;
    });
    const pauseResp = await postJson('/api/pause');
    expect(pauseResp.ok).toBe(true);
    // Ensure downloads remain stable for ~1.5s after pause
    await new Promise(r => setTimeout(r, 1500));
    const afterPause = await page.$eval('#progress', el => {
      const m = (el.textContent||'').match(/downloaded:\s*(\d+)/i);
      return m ? parseInt(m[1], 10) : 0;
    });
    expect(afterPause).toBe(before);
    // Also expect inflight to drop to zero at some point while paused
    const inflightZero = await page.waitForFunction(() => {
      const n = (document.getElementById('inflight')?.textContent||'');
      const m = n.match(/current downloads:\s*(\d+)/i);
      return m && parseInt(m[1], 10) === 0;
    }, { timeout: 5000 }).catch(() => null);
    expect(Boolean(inflightZero)).toBe(true);

    // Resume and expect downloads to increase
    const resumeResp = await postJson('/api/resume');
    expect(resumeResp.ok).toBe(true);
    const increased = await page.waitForFunction((prev) => {
      const p = document.getElementById('progress');
      if (!p) return false;
      const m = (p.textContent||'').match(/downloaded:\s*(\d+)/i);
      return m && parseInt(m[1], 10) > prev;
    }, { timeout: 10000 }, afterPause).catch(() => null);
    expect(Boolean(increased)).toBe(true);
  });

  it('in-flight downloads reflect concurrency (>0)', async () => {
    const page = await browser.newPage();
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#showLogs');
    const isChecked = await page.$eval('#showLogs', el => el.checked);
    if (!isChecked) { await page.click('#showLogs'); }
    const resp = await page.evaluate(async () => {
      const body = {
        startUrl: 'https://www.theguardian.com',
        depth: 1,
        maxPages: 5,
        concurrency: 2,
        slow: false,
        useSitemap: false,
        sitemapOnly: false,
        preferCache: false,
        refetchIfOlderThan: '0'
      };
      const r = await fetch('/api/crawl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      let j=null; try { j = await r.json(); } catch(_) {}
      return { ok: r.ok, status: r.status, body: j };
    });
    expect(resp && resp.ok).toBe(true);
    // Look for a non-zero current downloads snapshot soon after start
    const inflightSeen = await page.waitForFunction(() => {
      const n = (document.getElementById('inflight')?.textContent||'');
      const m = n.match(/current downloads:\s*(\d+)/i);
      return m && parseInt(m[1], 10) >= 1;
    }, { timeout: 8000 }).catch(() => null);
    expect(Boolean(inflightSeen)).toBe(true);
  });
});
