'use strict';

const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
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

function waitForHttp200(url, { timeoutMs = 15000 } = {}) {
  const start = Date.now();

  return (async () => {
    while (true) {
      const elapsed = Date.now() - start;
      if (elapsed > timeoutMs) {
        throw new Error(`Timed out waiting for 200 from ${url}`);
      }

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
      await delay(200);
    }
  })();
}

describe('Test Studio UI visual rerun (Guardian 1000)', () => {
  jest.setTimeout(360_000);

  test('shows UI, runs 1000-page crawl via rerun button, and displays passing result', async () => {
    const projectRoot = process.cwd();
    const serverPath = path.join(projectRoot, 'src', 'ui', 'server', 'testStudio', 'server.js');

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

      for (let i = 0; i < 40; i++) {
        if (childExited) return;
        await delay(100);
      }

      try {
        child.kill('SIGKILL');
      } catch (_) {}
    };

    let browser;
    let page;

    const consoleMessages = [];
    const consoleErrors = [];
    const pageErrors = [];

    const ignoredConsoleErrorSubstrings = [
      'Failed to load resource: the server responded with a status of 404 (Not Found)'
    ];

    const nowTag = new Date().toISOString().replace(/[:.]/g, '-');
    const outputRoot = process.env.PUPPETEER_OUTPUT_DIR
      ? path.resolve(projectRoot, process.env.PUPPETEER_OUTPUT_DIR)
      : path.join(projectRoot, 'testlogs', 'ui-e2e');

    const artifactDir = path.join(outputRoot, `test-studio-guardian-1000-${nowTag}`);
    fs.mkdirSync(artifactDir, { recursive: true });

    try {
      await waitForHttp200(`${baseUrl}/`, { timeoutMs: 20_000 });

      if (childExited) {
        const extra = [
          `Server process exited early (code ${childExitCode})`,
          output.stdout ? `--- server stdout ---\n${output.stdout.slice(0, 1200)}` : '',
          output.stderr ? `--- server stderr ---\n${output.stderr.slice(0, 1200)}` : ''
        ]
          .filter(Boolean)
          .join('\n');

        throw new Error(extra);
      }

      const headful = process.env.PUPPETEER_HEADFUL === '1';
      browser = await puppeteer.launch({
        headless: headful ? false : true,
        slowMo: headful ? 50 : 0,
        defaultViewport: headful ? null : { width: 1280, height: 800 },
        args: headful ? ['--start-maximized'] : []
      });

      page = await browser.newPage();

      page.on('console', (msg) => {
        const line = `[console.${msg.type()}] ${msg.text()}`;
        consoleMessages.push(line);
        if (msg.type() === 'error') consoleErrors.push(line);
      });

      page.on('pageerror', (err) => {
        pageErrors.push(String(err?.stack || err?.message || err));
      });

      await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForSelector('#rerun-guardian-1000', { timeout: 20000 });
      await page.waitForSelector('#test-list', { timeout: 20000 });

      const hasRerunFn = await page.evaluate(() => typeof window.rerunTestFile === 'function');
      if (!hasRerunFn) {
        throw new Error('Expected window.rerunTestFile to be a function (dashboard script likely failed to load)');
      }

      // Click the rerun button and watch status update.
      await page.click('#rerun-guardian-1000');
      await page.waitForFunction(
        () => {
          const el = document.querySelector('#rerun-status');
          return el && /Running/.test(el.textContent || '');
        },
        { timeout: 20000 }
      );

      // Wait for PASS (exit 0) state.
      await page.waitForFunction(
        () => {
          const el = document.querySelector('#rerun-status');
          return el && /PASS \(exit 0\)/.test(el.textContent || '');
        },
        { timeout: 320_000 }
      );

      // Ensure the results list contains our 1000-page crawl test.
      await page.waitForFunction(
        () => {
          const rows = Array.from(document.querySelectorAll('.test-row'));
          return rows.some((r) => (r.textContent || '').includes('guardian-like fixture crawl reaches 1000 pages'));
        },
        { timeout: 30000 }
      );

      // Persist artifacts so headful runs still have captured output.
      const rerunOutput = await page.evaluate(() => {
        const el = document.querySelector('#rerun-output');
        return el ? String(el.textContent || '') : '';
      });
      fs.writeFileSync(path.join(artifactDir, 'rerun-output.txt'), rerunOutput, 'utf8');

      await page.screenshot({ path: path.join(artifactDir, 'final.png'), fullPage: true });

      const relevantConsoleErrors = consoleErrors.filter(
        (line) => !ignoredConsoleErrorSubstrings.some((s) => line.includes(s))
      );

      if (pageErrors.length || relevantConsoleErrors.length) {
        const problems = [
          pageErrors.length ? `Page errors:\n${pageErrors.join('\n')}` : '',
          relevantConsoleErrors.length ? `Console errors:\n${relevantConsoleErrors.join('\n')}` : ''
        ]
          .filter(Boolean)
          .join('\n\n');

        throw new Error(problems);
      }

      // If headful, keep the browser open briefly so you can watch the final state.
      if (headful) {
        const pauseMs = Number.parseInt(process.env.PUPPETEER_PAUSE_MS || '', 10);
        await delay(Number.isFinite(pauseMs) ? pauseMs : 1500);
      }
    } catch (err) {
      let statusText = '';
      try {
        if (page) {
          statusText = await page.evaluate(() => {
            const el = document.querySelector('#rerun-status');
            return el ? String(el.textContent || '') : '';
          });
        }
      } catch (_) {}

      try {
        if (page) {
          const rerunOutput = await page.evaluate(() => {
            const el = document.querySelector('#rerun-output');
            return el ? String(el.textContent || '') : '';
          });
          fs.writeFileSync(path.join(artifactDir, 'rerun-output.txt'), rerunOutput, 'utf8');
          await page.screenshot({ path: path.join(artifactDir, 'failure.png'), fullPage: true });
        }
      } catch (_) {}

      const extra = [
        `Artifacts: ${artifactDir}`,
        statusText ? `--- ui rerun-status ---\n${statusText}` : '',
        pageErrors.length ? `--- page errors ---\n${pageErrors.slice(0, 10).join('\n')}` : '',
        consoleErrors.length ? `--- console errors ---\n${consoleErrors.slice(0, 10).join('\n')}` : '',
        consoleMessages.length ? `--- console (tail) ---\n${consoleMessages.slice(-25).join('\n')}` : '',
        output.stdout ? `--- server stdout ---\n${output.stdout.slice(0, 1200)}` : '',
        output.stderr ? `--- server stderr ---\n${output.stderr.slice(0, 1200)}` : ''
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
