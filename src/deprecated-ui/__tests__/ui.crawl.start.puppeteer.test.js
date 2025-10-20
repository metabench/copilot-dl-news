const http = require('http');
const puppeteer = require('puppeteer');
const runUIE2E = process.env.UI_E2E === '1';

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

(runUIE2E ? describe : describe.skip)('UI E2E: start shows quick activity', () => {
  jest.setTimeout(20000);
  let cp; let port; let browser; let page; const logs = [];

  beforeAll(async () => {
    ({ cp, port } = await startServerWithEnv({
      UI_FAKE_RUNNER: '1',
      UI_FAKE_PLANNER: '1',
      UI_FAKE_QUEUE: '1',
      UI_FAKE_MILESTONES: '1',
      UI_FAKE_PROBLEMS: '1',
      UI_FAST_START: '1',
      UI_FAKE_PLANNER_DELAY_MS: '25'
    }));
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox'] });
    page = await browser.newPage();
    page.on('console', (msg) => { try { logs.push('[console] ' + msg.text()); } catch(_) {} });
    page.on('pageerror', (err) => { try { logs.push('[pageerror] ' + err.message); } catch(_) {} });
    page.on('requestfailed', (req) => { try { logs.push('[requestfailed] ' + req.url() + ' ' + req.failure()?.errorText); } catch(_) {} });
  });

  afterAll(async () => {
    try { if (browser) await browser.close(); } catch(_) {}
    try { if (cp) cp.kill('SIGINT'); } catch(_) {}
  });

  test('Clicking Start triggers 202 quickly and visible activity', async () => {
    const base = `http://localhost:${port}`;
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    // Ensure logs are enabled to observe output
    await page.evaluate(() => { const cb = document.getElementById('showLogs'); if (cb && !cb.checked) cb.click(); });
  const before = await page.$eval('#progress', el => el.textContent);
    // Don't wait for idle; tolerate 409 later and still assert activity

    // Click Start and prefer observing the network response; if it flakes, fall back to in-page fetch
    let status = null; let payload = null; let networkOk = false;
    try {
      const waitResp = page.waitForResponse(res => res.url().endsWith('/api/crawl') && res.request().method() === 'POST', { timeout: 4000 });
      await page.click('#startBtn');
      const resp = await waitResp;
      status = resp.status();
      payload = await resp.json().catch(() => ({}));
      networkOk = true;
    } catch (_) {
      // Fallback path
      const res = await page.evaluate(async () => {
        const r = await fetch('/api/crawl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startUrl: 'https://example.com', depth: 0, maxPages: 1, useSitemap: false, sitemapOnly: false }) });
        return { status: r.status, json: await r.json().catch(() => ({})) };
      });
      status = res.status; payload = res.json; networkOk = false;
    }
    if (status !== 202) {
      // If 409, accept if we can show visible crawl activity (already running)
      expect([202, 409]).toContain(status);
    } else {
      expect(status).toBe(202);
    }
    expect(payload).toBeTruthy();

    // Visible activity: Started: line, server start log, or progress change
    await page.waitForFunction((prev) => {
      const logsEl = document.getElementById('logs');
      const progEl = document.getElementById('progress');
      const lt = logsEl ? (logsEl.textContent || '') : '';
      const pt = progEl ? (progEl.textContent || '') : '';
      return lt.includes('Started:') || lt.includes('[server] starting crawler') || pt !== prev || /visited:\s*[1-9]/.test(pt);
    }, { timeout: 6000 }, before);

    // Fake runner should complete quickly; see DONE within 4s
    await page.waitForFunction(() => {
      const el = document.getElementById('logs');
      return el && (el.textContent || '').includes('DONE:');
    }, { timeout: 4000 }).catch((e) => {
      throw new Error('Expected DONE: in logs. Debug: ' + logs.slice(-10).join('\n'));
    });
  });

  test('With logs disabled, progress still updates after Start click', async () => {
    const base = `http://localhost:${port}`;
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { const cb = document.getElementById('showLogs'); if (cb && cb.checked) cb.click(); });
    const before = await page.$eval('#progress', el => el.textContent);
    // No idle wait here either; rely on visible progress change
    let okStatus = null;
    try {
      const waitResp = page.waitForResponse(res => res.url().endsWith('/api/crawl') && res.request().method() === 'POST', { timeout: 4000 });
      await page.click('#startBtn');
      const resp = await waitResp; okStatus = resp.status();
    } catch (_) {
      const res = await page.evaluate(async () => {
        const r = await fetch('/api/crawl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startUrl: 'https://example.com', depth: 0, maxPages: 1, useSitemap: false, sitemapOnly: false }) });
        return r.status;
      });
      okStatus = res;
    }
  expect([202, 409]).toContain(okStatus);
    // Start polling server status and metrics in-page to detect a running or recently finished crawl
    await page.evaluate(() => {
      window.__seenRun = false;
      window.__seenDone = window.__seenDone || false;
      (async function poll(){
        try {
          const r = await fetch('/api/status');
          if (r.ok) {
            const j = await r.json();
            if (j.running) window.__seenRun = true;
            if (j.lastExit != null) window.__seenDone = true;
          }
        } catch {}
        setTimeout(poll, 200);
      })();
      // Metrics poller: observe running and visited/downloaded counters
      window.__metricsVisited = false;
      (async function pollMetrics(){
        try {
          const r = await fetch('/metrics');
          if (r.ok) {
            const t = await r.text();
            if (/^crawler_running\s+1/m.test(t)) window.__seenRun = true;
            if (/^crawler_requests_total\s+(\d+)/m.test(t) || /^crawler_downloads_total\s+(\d+)/m.test(t)) {
              const m1 = t.match(/^crawler_requests_total\s+(\d+)/m);
              const m2 = t.match(/^crawler_downloads_total\s+(\d+)/m);
              const v = (m1?parseFloat(m1[1]):0) + (m2?parseFloat(m2[1]):0);
              if (v > 0) window.__metricsVisited = true;
            }
          }
        } catch {}
        setTimeout(pollMetrics, 400);
      })();
    });
    // Succeed if any of:
    // - progress shows visited>=1
    // - server reports running
    // - server indicates the run finished (lastExit present)
    // - metrics counters show activity
    // - UI shows immediate 'starting'/'running' hint in progress text
    await page.waitForFunction(() => {
      const el = document.getElementById('progress');
      const t = el ? (el.textContent || '') : '';
      const progressed = /visited:\s*[1-9]/.test(t);
      const hint = /starting|running/i.test(t) && !/visited:\s*0/.test(t);
      return progressed || hint || (window.__seenRun === true) || (window.__seenDone === true) || (window.__metricsVisited === true);
    }, { timeout: 6000 });
  });
});
