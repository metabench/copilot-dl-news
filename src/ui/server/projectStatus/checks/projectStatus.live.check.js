#!/usr/bin/env node
'use strict';

/**
 * projectStatus.live.check.js — load the REAL page in a REAL browser and assert the
 * things an in-process check cannot see.
 *
 * WHY THIS EXISTS. Cycle 133 measured the UI self-test corpus: 82 checks, ~10,600
 * lines, but only 4 driving a browser — and all three "screenshot" checks render SSR
 * HTML in-process and photograph it, so they never load a URL either. 91% of the
 * corpus is render + string assertions, which is blind BY CONSTRUCTION to what the
 * client does.
 *
 * That blindness shipped a real defect. In cycle 128.5 this page served SSR HTML
 * frozen at server start while its own /api/status returned current data; the client
 * silently repaired the DOM, so every string assertion — and the page itself, to a
 * human — looked correct. It was caught by opening the page and cross-checking two
 * sources in the same process, and fixed with one line (refresh on activate).
 *
 * The load-bearing assertion here is L3: the DOM must agree with the LIVE API, not
 * with the boot-time SSR. That is the assertion that would have failed automatically
 * in 128.5 (SSR said 82 cycles, the API said 84), and it stays meaningful afterwards
 * because it re-checks the invariant rather than the fix.
 *
 * Uses async spawn, never spawnSync: a synchronous spawn blocks the whole event loop,
 * so a server in the same process could never answer (a hang this project has hit).
 *
 *   node src/ui/server/projectStatus/checks/projectStatus.live.check.js
 *   PORT=3190 node src/ui/server/projectStatus/checks/projectStatus.live.check.js
 */

const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const SERVER = path.join(ROOT, 'src', 'ui', 'server', 'projectStatus', 'server.js');
// Default off 3184 so a running preview server is never disturbed by the check.
const PORT = Number(process.env.PORT) || 3191;
const BASE = `http://127.0.0.1:${PORT}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// 90s, not 30s (cycle 169, measured): the server publishes its bundle at boot
// — the project's own docs say "give it ~40s" — and boot-to-ready measured 33s
// once the library grew, so a 30s wait failed on exactly the margin. Every
// "flaky" red of this probe in cycles 168-169 was this number: the check's
// budget must cover the DOCUMENTED boot time with headroom, or the probe
// reports machine load as an application failure.
async function waitForServer(timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { await getJson(`${BASE}/api/status`); return true; } catch (_) { await sleep(300); }
  }
  return false;
}

async function main() {
  const failures = [];
  const pass = (msg) => console.log(`  ✅ ${msg}`);
  const fail = (msg) => { failures.push(msg); console.log(`  ❌ ${msg}`); };

  const watchdog = setTimeout(() => {
    console.error('\n❌ Watchdog: live check exceeded its time budget');
    process.exit(3);
  }, 120000);
  watchdog.unref();

  console.log(`\nCheck: project-status page — LIVE (browser, :${PORT})\n`);

  const server = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  let serverErr = '';
  server.stderr.on('data', (d) => { serverErr += d.toString(); });

  let browser = null;
  try {
    if (!(await waitForServer())) throw new Error(`server never became ready on :${PORT}. stderr: ${serverErr.slice(0, 400)}`);

    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();

    // /favicon.ico is requested by the BROWSER, not by the page — this server serves no
    // icon, so its 404 is noise. Excluded by URL rather than by loosening the assertion,
    // so a genuinely missing asset still fails. (First run of this check flagged exactly
    // that favicon 404: the check was too strict, not the page broken.)
    const isBrowserNoise = (url) => /\/favicon\.ico(\?|$)/.test(url);

    const consoleErrors = [];
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      // Chrome's console TEXT for a failed load ("Failed to load resource: ... 404")
      // does not contain the URL — that lives in the message location. Filtering on
      // text silently kept the favicon noise; filter on the location instead.
      const url = (m.location() && m.location().url) || '';
      if (isBrowserNoise(url)) return;
      consoleErrors.push(`${m.text()}${url ? ` [${url}]` : ''}`);
    });
    const apiCalls = [];
    page.on('request', (r) => { if (r.url().includes('/api/status')) apiCalls.push(r.url()); });
    // Stronger than console-watching: every resource the PAGE asked for must load.
    const badResponses = [];
    page.on('response', (r) => {
      if (r.status() >= 400 && !isBrowserNoise(r.url())) badResponses.push(`${r.status()} ${r.url()}`);
    });

    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });

    // L1 — the isomorphic client actually activated. A string check cannot see this:
    // the marker is added by activate() at runtime, never by the SSR render.
    const active = await page.$('.ps-client-active');
    if (active) pass('L1 client activated (.ps-client-active present in the live DOM)');
    else fail('L1 client did NOT activate — the page is inert SSR; check the jsgui3 client bundle and control registration');

    // L2 — it fetched on activate rather than only on the 60 s interval (the c128.5 fix).
    if (apiCalls.length >= 1) pass(`L2 fetched /api/status on load (${apiCalls.length} request(s))`);
    else fail('L2 no /api/status request on load — activate() must call refresh() immediately, or visitors read boot-time SSR');

    // L3 — THE ONE THAT MATTERS: the DOM agrees with the LIVE API, not the frozen SSR.
    const api = await getJson(`${BASE}/api/status`);
    const domCycles = await page.evaluate(() => {
      const m = document.body.innerText.match(/(\d+)\s*CYCLES/i);
      return m ? Number(m[1]) : null;
    });
    if (domCycles === null) fail('L3 could not read the cycles figure from the live DOM');
    else if (domCycles === api.stats.cycles) pass(`L3 DOM agrees with the live API (${domCycles} cycles)`);
    else fail(`L3 DOM says ${domCycles} cycles but the API says ${api.stats.cycles} — the SSR-frozen/client-repair divergence of cycle 128.5`);

    // L4 — a page that logs errors is not working, however right it looks.
    if (consoleErrors.length === 0) pass('L4 no console errors');
    else fail(`L4 ${consoleErrors.length} console error(s): ${consoleErrors.slice(0, 2).join(' | ')}`);

    // L5 — every asset the page references actually loads (css, client bundle, svg).
    if (badResponses.length === 0) pass('L5 all page-requested resources loaded');
    else fail(`L5 ${badResponses.length} failed response(s): ${badResponses.slice(0, 3).join(' | ')}`);
  } catch (e) {
    fail(`live check threw: ${e.message}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill();
  }

  if (failures.length) {
    console.log(`\n❌ project-status live check: ${failures.length} failure(s).`);
    process.exit(1);
  }
  console.log('\n✅ project-status live check passed (5 assertions no in-process check can make).');
}

main().catch((e) => { console.error('fatal:', e); process.exit(1); });
