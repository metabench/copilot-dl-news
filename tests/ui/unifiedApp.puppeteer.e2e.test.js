'use strict';

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const puppeteer = require('puppeteer');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((err) => {
        if (err) return reject(err);
        resolve(address.port);
      });
    });
    server.on('error', reject);
  });
}

function waitForHttp200(url, { timeoutMs = 8000 } = {}) {
  const start = Date.now();

  return (async () => {
    while (true) {
      const elapsed = Date.now() - start;
      if (elapsed > timeoutMs) {
        throw new Error(`Timed out waiting for 200 from ${url}`);
      }

      if (typeof fetch === 'function' && typeof AbortController === 'function') {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1500);
        try {
          const res = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            headers: { Connection: 'close' }
          });
          try {
            await res.arrayBuffer();
          } catch (_) {}
          if (res.status === 200) return;
        } catch (_) {
          // ignore and retry
        } finally {
          clearTimeout(timer);
        }
      } else {
        const ok = await new Promise((resolve) => {
          const req = http.get(url, { timeout: 1500, headers: { Connection: 'close' }, agent: false }, (res) => {
            res.resume();
            resolve(res.statusCode === 200);
          });
          req.on('error', () => resolve(false));
          req.on('timeout', () => {
            req.destroy();
            resolve(false);
          });
        });

        if (ok) return;
      }

      await delay(200);
    }
  })();
}

describe('unifiedApp puppeteer navigation smoke', () => {
  jest.setTimeout(60_000);

  test('loads shell and switches to Docs/Design without console errors', async () => {
    const projectRoot = process.cwd();
    const serverPath = path.join(projectRoot, 'src', 'ui', 'server', 'unifiedApp', 'server.js');

    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;

    const child = spawn(process.execPath, [serverPath, '--port', String(port)], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    const output = { stdout: '', stderr: '' };
    child.stdout?.on('data', (d) => (output.stdout += d.toString()));
    child.stderr?.on('data', (d) => (output.stderr += d.toString()));

    let childExited = false;
    let childExitCode = null;
    child.once('exit', (code) => {
      childExited = true;
      childExitCode = code;
    });

    const killChild = async () => {
      if (childExited) return;
      try {
        child.kill();
      } catch (_) {}

      for (let i = 0; i < 30; i++) {
        if (childExited) return;
        await delay(100);
      }

      try {
        child.kill('SIGKILL');
      } catch (_) {}
    };

    let browser;

    try {
      await waitForHttp200(`${baseUrl}/`, { timeoutMs: 15_000 });

      if (childExited) {
        const extra = [
          `Server process exited early (code ${childExitCode})`,
          output.stdout ? `--- server stdout ---\n${output.stdout.slice(0, 800)}` : '',
          output.stderr ? `--- server stderr ---\n${output.stderr.slice(0, 800)}` : ''
        ]
          .filter(Boolean)
          .join('\n');

        throw new Error(extra);
      }

      browser = await puppeteer.launch({ headless: true });
      const page = await browser.newPage();

      const consoleErrors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          const text = msg.text();
          // Chrome prints a generic error for 404s (often favicon). We validate 4xx/5xx via response tracking below.
          if (!text.includes('Failed to load resource: the server responded with a status of 404')) {
            consoleErrors.push(text);
          }
        }
      });

      const httpErrors = [];
      page.on('response', (res) => {
        const status = res.status();
        if (status >= 400) {
          httpErrors.push({ status, url: res.url() });
        }
      });

      const pageErrors = [];
      page.on('pageerror', (err) => {
        pageErrors.push(String(err?.message || err));
      });

      await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForSelector('.unified-shell', { timeout: 15000 });

      // Ensure the default Home view actually loads (regression guard: avoid infinite Loading...).
      await page.waitForSelector('.home-dashboard', { timeout: 15000 });

      // Switch to docs and verify iframe appears
      await page.click('[data-app-id="docs"]');
      await page.waitForSelector('iframe.app-embed[src="/docs"]', { timeout: 15000 });

      // Switch to design and verify iframe appears
      await page.click('[data-app-id="design"]');
      await page.waitForSelector('iframe.app-embed[src="/design"]', { timeout: 15000 });

      const allowed404 = new Set([
        '/favicon.ico',
        '/apple-touch-icon.png',
        '/apple-touch-icon-precomposed.png'
      ]);

      const badHttpErrors = httpErrors.filter((e) => {
        if (e.status !== 404) return true;
        try {
          const u = new URL(e.url);
          return !allowed404.has(u.pathname);
        } catch (_) {
          return true;
        }
      });

      if (pageErrors.length || consoleErrors.length || badHttpErrors.length) {
        const problems = [
          pageErrors.length ? `Page errors:\n${pageErrors.join('\n')}` : '',
          consoleErrors.length ? `Console errors:\n${consoleErrors.join('\n')}` : ''
          ,
          badHttpErrors.length
            ? `HTTP errors:\n${badHttpErrors
                .slice(0, 10)
                .map((e) => `${e.status} ${e.url}`)
                .join('\n')}`
            : ''
        ]
          .filter(Boolean)
          .join('\n\n');

        throw new Error(problems);
      }
    } catch (err) {
      const extra = [
        output.stdout ? `--- server stdout ---\n${output.stdout.slice(0, 800)}` : '',
        output.stderr ? `--- server stderr ---\n${output.stderr.slice(0, 800)}` : ''
      ]
        .filter(Boolean)
        .join('\n');

      err.message = extra ? `${err.message}\n\n${extra}` : err.message;
      throw err;
    } finally {
      if (browser) {
        const browserClose = browser.close();
        await Promise.race([browserClose, delay(5000)]);
        try {
          browser.process()?.kill('SIGKILL');
        } catch (_) {}
      }
      await killChild();

      try {
        child.stdout?.removeAllListeners('data');
        child.stderr?.removeAllListeners('data');
        child.stdout?.destroy();
        child.stderr?.destroy();
      } catch (_) {}
    }
  });

  test('navigates across all sidebar apps and each loads content', async () => {
    const projectRoot = process.cwd();
    const serverPath = path.join(projectRoot, 'src', 'ui', 'server', 'unifiedApp', 'server.js');

    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;

    const child = spawn(process.execPath, [serverPath, '--port', String(port)], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    const output = { stdout: '', stderr: '' };
    child.stdout?.on('data', (d) => (output.stdout += d.toString()));
    child.stderr?.on('data', (d) => (output.stderr += d.toString()));

    let childExited = false;
    let childExitCode = null;
    child.once('exit', (code) => {
      childExited = true;
      childExitCode = code;
    });

    const killChild = async () => {
      if (childExited) return;
      try {
        child.kill();
      } catch (_) {}

      for (let i = 0; i < 30; i++) {
        if (childExited) return;
        await delay(100);
      }

      try {
        child.kill('SIGKILL');
      } catch (_) {}
    };

    let browser;

    try {
      await waitForHttp200(`${baseUrl}/`, { timeoutMs: 20_000 });

      if (childExited) {
        const extra = [
          `Server process exited early (code ${childExitCode})`,
          output.stdout ? `--- server stdout ---\n${output.stdout.slice(0, 800)}` : '',
          output.stderr ? `--- server stderr ---\n${output.stderr.slice(0, 800)}` : ''
        ]
          .filter(Boolean)
          .join('\n');

        throw new Error(extra);
      }

      browser = await puppeteer.launch({ headless: true });
      const page = await browser.newPage();

      const consoleErrors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          const text = msg.text();
          if (!text.includes('Failed to load resource: the server responded with a status of 404')) {
            consoleErrors.push(text);
          }
        }
      });

      const pageErrors = [];
      page.on('pageerror', (err) => {
        pageErrors.push(String(err?.message || err));
      });

      await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForSelector('.unified-shell', { timeout: 15000 });
      await page.waitForSelector('.home-dashboard', { timeout: 15000 });

      const appIds = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.nav-item'))
          .map((el) => el.getAttribute('data-app-id'))
          .filter(Boolean);
      });

      const uniqueAppIds = Array.from(new Set(appIds));
      if (!uniqueAppIds.length) {
        throw new Error('No nav items found to test');
      }

      // Walk all apps via the actual UI.
      for (const appId of uniqueAppIds) {
        await page.click(`[data-app-id="${appId}"]`);
        await page.waitForSelector(`#app-${appId}:not(.app-container--hidden)`, { timeout: 15000 });

        // Wait for the async loadAppContent() fetch to populate something.
        await page.waitForFunction(
          (id) => {
            const el = document.getElementById('app-' + id);
            if (!el) return false;
            return Boolean(
              el.querySelector('.home-dashboard') ||
                el.querySelector('.app-placeholder') ||
                el.querySelector('iframe.app-embed')
            );
          },
          { timeout: 15000 },
          appId
        );

        // If this app renders an iframe, ensure the mounted route returns 200.
        const iframeSrc = await page.$eval(`#app-${appId}`, (el) => {
          const iframe = el.querySelector('iframe.app-embed');
          return iframe ? iframe.getAttribute('src') : null;
        });

        if (iframeSrc) {
          await waitForHttp200(`${baseUrl}${iframeSrc}`, { timeoutMs: 20_000 });
        } else {
          // Non-iframe apps should render either the home dashboard or a placeholder.
          const hasExpectedContent = await page.$eval(`#app-${appId}`, (el) => {
            return Boolean(el.querySelector('.home-dashboard') || el.querySelector('.app-placeholder'));
          });
          if (!hasExpectedContent) {
            throw new Error(`App ${appId} did not render expected content (home-dashboard or app-placeholder)`);
          }
        }
      }

      if (pageErrors.length || consoleErrors.length) {
        const problems = [
          pageErrors.length ? `Page errors:\n${pageErrors.join('\n')}` : '',
          consoleErrors.length ? `Console errors:\n${consoleErrors.join('\n')}` : ''
        ]
          .filter(Boolean)
          .join('\n\n');

        throw new Error(problems);
      }
    } catch (err) {
      const extra = [
        output.stdout ? `--- server stdout ---\n${output.stdout.slice(0, 800)}` : '',
        output.stderr ? `--- server stderr ---\n${output.stderr.slice(0, 800)}` : ''
      ]
        .filter(Boolean)
        .join('\n');

      err.message = extra ? `${err.message}\n\n${extra}` : err.message;
      throw err;
    } finally {
      if (browser) {
        const browserClose = browser.close();
        await Promise.race([browserClose, delay(5000)]);
        try {
          browser.process()?.kill('SIGKILL');
        } catch (_) {}
      }
      await killChild();

      try {
        child.stdout?.removeAllListeners('data');
        child.stderr?.removeAllListeners('data');
        child.stdout?.destroy();
        child.stderr?.destroy();
      } catch (_) {}
    }
  });
});
