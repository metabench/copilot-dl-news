/**
 * E2E test that verifies clicking the Start button in the UI triggers a crawl
 * and shows immediate activity. Uses the built-in fake runner for determinism.
 *
 * Run locally with:
 *   E2E=1 npm test --silent -- src/ui/express/__tests__/e2e.start.button.test.js
 */

const path = require('path');

const E2E_ENABLED = process.env.E2E === '1';
jest.setTimeout(60000);

let puppeteer = null;
if (E2E_ENABLED) {
  try { puppeteer = require('puppeteer'); } catch (_) {}
}

describe('e2e: Start button triggers visible activity fast', () => {
  if (!E2E_ENABLED || !puppeteer) {
    it('skipped (E2E disabled)', () => { expect(true).toBe(true); });
    return;
  }

  let serverProc = null;
  let baseUrl = 'http://localhost:3000';
  let browser = null;

  const startServer = () => new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const node = process.execPath;
    const repoRoot = path.join(__dirname, '..', '..', '..', '..');
    const env = { ...process.env, PORT: '0', UI_FAKE_RUNNER: '1', UI_DB_PATH: path.join(__dirname, 'tmp_ui_e2e_start.db') };
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
    await startServer();
    browser = await puppeteer.launch({ headless: 'new' });
  });

  afterAll(async () => {
    try { if (browser) await browser.close(); } catch (_) {}
    await stopServer();
  });

  it('clicking Start logs "Started:" quickly and shows progress', async () => {
    const page = await browser.newPage();
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    // Ensure logs are enabled
    await page.waitForSelector('#showLogs');
    const isChecked = await page.$eval('#showLogs', el => el.checked);
    if (!isChecked) { await page.click('#showLogs'); }

    // Prepare minimal, fast inputs
    await page.$eval('#startUrl', el => { el.value = 'https://example.com'; });
    await page.$eval('#depth', el => { el.value = '0'; });
    await page.$eval('#maxPages', el => { el.value = '1'; });
    await page.$eval('#concurrency', el => { el.value = '1'; });
    // Ensure sitemap-only is off and useSitemap off
    const useSmOn = await page.$eval('#useSitemap', el => el.checked);
    if (useSmOn) await page.click('#useSitemap');
    const soOn = await page.$eval('#sitemapOnly', el => el.checked);
    if (soOn) await page.click('#sitemapOnly');

    // Click Start and assert fast acceptance (client logs "Started:" within ~1s)
    await page.click('#startBtn');
    const startedSeen = await page.waitForFunction(() => {
      const t = (document.getElementById('logs')?.textContent || '');
      return /\nStarted:\s*\{/.test(t);
    }, { timeout: 1200 }).catch(() => null);
    expect(Boolean(startedSeen)).toBe(true);

    // Then confirm progress appears promptly (fake runner emits quickly)
    const progressSeen = await page.waitForFunction(() => {
      const p = document.getElementById('progress');
      if (!p) return false;
      // visited: 1 should appear after the fake runner advance
      const m = (p.textContent||'').match(/visited:\s*(\d+)/i);
      return m && parseInt(m[1], 10) >= 1;
    }, { timeout: 2000 }).catch(() => null);
    expect(Boolean(progressSeen)).toBe(true);
  });
});
