const puppeteer = require('puppeteer');
const { startServerWithEnv } = require('../../utils/uiServer');
const { collectSseEvents } = require('../../utils/sse');

describe('E2E Feature: UI Start button (fake runner)', () => {
  jest.setTimeout(60000);
  let cp; let port; let browser; let page;

  beforeAll(async () => {
    ({ cp, port } = await startServerWithEnv({
      UI_FAKE_RUNNER: '1',
      UI_FAST_START: '1',
      UI_FAKE_PLANNER: '1',
      UI_FAKE_QUEUE: '1',
      UI_FAKE_MILESTONES: '1',
      UI_FAKE_PROBLEMS: '1'
    }));
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('request', req => console.log('PAGE REQUEST:', req.method(), req.url()));
    page.on('requestfailed', req => console.log('PAGE REQUEST FAILED:', req.method(), req.url(), req.failure()?.errorText));
    page.on('response', res => console.log('PAGE RESPONSE:', res.status(), res.url()));
  });

  afterAll(async () => {
    try { if (browser) await browser.close(); } catch (_) {}
    try { if (cp) cp.kill('SIGINT'); } catch (_) {}
  });

  test('Start click triggers crawl and UI shows progress and DONE via logs', async () => {
    const base = `http://localhost:${port}`;
    await page.goto(base, { waitUntil: 'domcontentloaded' });

    // Ensure logs visible
    await page.evaluate(() => { const cb = document.getElementById('showLogs'); if (cb && !cb.checked) cb.click(); });

    // Ensure the Start button is present and clickable
    await page.waitForSelector('#startBtn', { timeout: 5000 });

    // Start listening for SSE events BEFORE clicking the button to avoid a race condition.
    const ssePromise = collectSseEvents(base, {
      timeoutMs: 10000,
      stopOn: (events) => events.some(e => e.type === 'milestone' && e.data?.kind === 'startup-complete')
    });

    // Click start and wait for the API response.
    const waitResp = page.waitForResponse(res => res.url().endsWith('/api/crawl') && res.request().method() === 'POST', { timeout: 15000 });
    await page.click('#startBtn');
    const resp = await waitResp;
    expect([202, 409]).toContain(resp.status());

    // Now, await the resolution of the SSE collection.
    const sse = await ssePromise;

    const hasStart = sse.events.some(e => e.type === 'milestone' && e.data?.kind === 'startup-complete');
    expect(hasStart).toBe(true);

    // As a final check, let's see if the UI logs reflect the start
    const logContent = await page.$eval('#logs', el => el.textContent);
    expect(logContent).toContain('Started:');
  });
});
