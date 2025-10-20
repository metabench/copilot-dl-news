/**
 * E2E test for logs font size controls with persistence.
 * Requires E2E=1 with Puppeteer available.
 */

const path = require('path');
const http = require('http');

const E2E_ENABLED = process.env.E2E === '1';
jest.setTimeout(120000);

let puppeteer = null;
if (E2E_ENABLED) {
  try { puppeteer = require('puppeteer'); } catch (_) {}
}

describe('e2e: logs font size controls persist', () => {
  if (!E2E_ENABLED || !puppeteer) {
    it('skipped (E2E disabled)', () => { expect(true).toBe(true); });
    return;
  }

  let serverProc = null;
  let baseUrl = 'http://localhost:3000';

  const startServer = () => new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const node = process.execPath;
    const repoRoot = path.join(__dirname, '..', '..', '..', '..');
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
    serverProc.once('exit', (code) => reject(new Error(`server exited early: ${code}${stderrBuf ? ' — ' + stderrBuf.trim() : ''}`)));
  });

  const stopServer = async () => {
    if (!serverProc) return;
    try { serverProc.kill('SIGINT'); } catch (_) {}
    await new Promise(r => setTimeout(r, 500));
  };

  let browser = null;

  beforeAll(async () => {
    await startServer();
    browser = await puppeteer.launch({ headless: 'new' });
  });

  afterAll(async () => {
    try { if (browser) await browser.close(); } catch (_) {}
    await stopServer();
  });

  it('adjusts font size and persists across reloads', async () => {
    const page = await browser.newPage();
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#logs');
    const getSize = async () => page.$eval('#logs', el => parseInt(getComputedStyle(el).fontSize.replace('px',''), 10));
    const before = await getSize();
    // Increase twice
    await page.click('#logsFontPlus');
    await page.click('#logsFontPlus');
    const afterPlus = await getSize();
    expect(afterPlus).toBe(before + 2);
    // Decrease once
    await page.click('#logsFontMinus');
    const afterMinus = await getSize();
    expect(afterMinus).toBe(before + 1);
    // Reload and verify persistence
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#logs');
    const persisted = await getSize();
    expect(persisted).toBe(before + 1);
  });
});
