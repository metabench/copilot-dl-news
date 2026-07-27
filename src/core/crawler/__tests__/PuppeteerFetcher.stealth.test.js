'use strict';

const { PuppeteerFetcher } = require('../PuppeteerFetcher');

/**
 * Live-observed 2026-07-20 on Globe and Mail: extending the Puppeteer
 * fallback to fire on JS-required soft-failures (see
 * FetchPipeline.puppeteerJsWallRescue.test.js) wasn't enough on its own —
 * the site kept serving its "enable JavaScript" wall even through a full
 * headless-Chrome render with a networkidle2 wait. Root cause: stock
 * headless Chrome exposes navigator.webdriver === true, which the site's
 * own bot-detection checked directly — no amount of extra waiting fixes a
 * page that was never going to render for a detected-automation session.
 * _applyStealth patches exactly that signal (+ a realistic UA) before
 * navigation. This is a plain unit test of the patch call shape — it does
 * not spin up a real browser.
 */
describe('PuppeteerFetcher._applyStealth', () => {
  function makeFakePage() {
    return {
      setUserAgent: jest.fn().mockResolvedValue(undefined),
      evaluateOnNewDocument: jest.fn().mockResolvedValue(undefined)
    };
  }

  it('sets a realistic desktop User-Agent (not the bundled-Chromium default)', async () => {
    const fetcher = new PuppeteerFetcher({ logger: { warn: jest.fn() } });
    const page = makeFakePage();

    await fetcher._applyStealth(page);

    expect(page.setUserAgent).toHaveBeenCalledTimes(1);
    const ua = page.setUserAgent.mock.calls[0][0];
    expect(ua).toContain('Chrome/');
    expect(ua).not.toContain('HeadlessChrome');
  });

  it('installs an evaluateOnNewDocument patch that clears navigator.webdriver', async () => {
    const fetcher = new PuppeteerFetcher({ logger: { warn: jest.fn() } });
    const page = makeFakePage();

    await fetcher._applyStealth(page);

    expect(page.evaluateOnNewDocument).toHaveBeenCalledTimes(1);
    const patchFn = page.evaluateOnNewDocument.mock.calls[0][0];
    expect(typeof patchFn).toBe('function');

    // Execute the patch in a fake DOM-ish sandbox to prove it does what it
    // claims — this is exactly the check bot-detection scripts run.
    const sandbox = { navigator: {}, window: {} };
    // eslint-disable-next-line no-new-func
    const runInSandbox = new Function('navigator', 'window', `(${patchFn.toString()})()`);
    runInSandbox.call(sandbox, sandbox.navigator, sandbox.window);
    expect(sandbox.navigator.webdriver).toBeUndefined();
    expect(sandbox.window.chrome).toBeDefined();
    expect(sandbox.navigator.plugins.length).toBeGreaterThan(0);
    expect(sandbox.navigator.languages).toContain('en-US');
  });

  it('is resilient: a stealth-patch failure never throws (fetch must proceed anyway)', async () => {
    const warn = jest.fn();
    const fetcher = new PuppeteerFetcher({ logger: { warn } });
    const page = {
      setUserAgent: jest.fn().mockRejectedValue(new Error('page closed')),
      evaluateOnNewDocument: jest.fn()
    };

    await expect(fetcher._applyStealth(page)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Stealth patch failed'));
  });

  it('launch args disable the AutomationControlled blink feature', () => {
    const fetcher = new PuppeteerFetcher({});
    expect(fetcher.launchOptions.args).toContain('--disable-blink-features=AutomationControlled');
  });
});
