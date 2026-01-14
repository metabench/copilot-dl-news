#!/usr/bin/env node
'use strict';

/**
 * Screenshot Check: Topic Hub Guessing — Matrix
 */

const fs = require('fs');
const path = require('path');

const puppeteer = require('puppeteer');

const { resolveBetterSqliteHandle } = require('../../utils/serverStartupCheckdashboardModule');
const { renderTopicHubGuessingMatrixHtml } = require('../server');

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'news.db');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function main() {
  const watchdog = setTimeout(() => {
    console.error('\n❌ Watchdog: screenshot check exceeded time budget');
    process.exit(3);
  }, 90000);
  watchdog.unref();

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Check: Topic Hub Guessing — Matrix Screenshot');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  const resolved = resolveBetterSqliteHandle({ dbPath: DB_PATH, readonly: true });
  const { dbHandle } = resolved;

  let browser = null;
  try {
    if (!dbHandle) {
      throw new Error('Database handle not resolved');
    }

    const html = renderTopicHubGuessingMatrixHtml({
      dbHandle,
      lang: 'en',
      topicLimit: 18,
      hostLimit: 16,
      matrixMode: 'table'
    });

    if (typeof html !== 'string' || html.length < 500) {
      throw new Error('Expected non-empty HTML');
    }

    const outDir = path.join(process.cwd(), 'screenshots');
    ensureDir(outDir);

    const outPath = path.join(outDir, 'topic-hub-guessing-matrix.png');
    const flippedPath = path.join(outDir, 'topic-hub-guessing-matrix-flipped.png');
    const virtualPath = path.join(outDir, 'topic-hub-guessing-matrix-virtual.png');
    const virtualScrolledPath = path.join(outDir, 'topic-hub-guessing-matrix-virtual-scrolled.png');
    const virtualFlippedPath = path.join(outDir, 'topic-hub-guessing-matrix-virtual-flipped.png');

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(15000);
    await page.setViewport({ width: 1500, height: 900, deviceScaleFactor: 2 });

    page.on('pageerror', (err) => {
      console.log(`ℹ️  [browser pageerror] ${err && err.message ? err.message : String(err)}`);
    });
    page.on('console', (msg) => {
      const type = msg.type();
      if (type === 'error' || type === 'warning') {
        console.log(`ℹ️  [browser console:${type}] ${msg.text()}`);
      }
    });

    console.log('ℹ️  Rendering table mode');
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await new Promise((resolve) => setTimeout(resolve, 200));

    await page.waitForSelector('[data-testid="flip-axes"]', { timeout: 4000 });

    await page.screenshot({ path: outPath, fullPage: true });
    console.log(`✅ Screenshot saved: ${outPath}`);

    await page.click('[data-testid="flip-axes"]');
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-testid="topic-hub-guessing"]');
      return root && root.getAttribute('data-view') === 'b';
    }, { timeout: 4000 });

    await page.screenshot({ path: flippedPath, fullPage: true });
    console.log(`✅ Screenshot saved: ${flippedPath}`);

    const htmlVirtual = renderTopicHubGuessingMatrixHtml({
      dbHandle,
      lang: 'en',
      topicLimit: 200,
      hostLimit: 50,
      matrixMode: 'virtual'
    });

    console.log('ℹ️  Rendering virtual mode');
    await page.setContent(htmlVirtual, { waitUntil: 'domcontentloaded' });
    await new Promise((resolve) => setTimeout(resolve, 200));

    await page.waitForSelector('[data-testid="matrix-virtual"]', { timeout: 6000 });
    await page.waitForSelector('[data-testid="thg-vm-viewport-a"]', { timeout: 6000 });

    await page.waitForFunction(() => {
      const root = document.querySelector('[data-testid="matrix-virtual"]');
      return root && root.getAttribute('data-vm-ready') === '1';
    }, { timeout: 6000 });

    const vmStats0 = await page.$eval('[data-testid="matrix-virtual"]', (el) => {
      return {
        cellCount: Number(el.getAttribute('data-cell-count')),
        firstRow: Number(el.getAttribute('data-first-row')),
        firstCol: Number(el.getAttribute('data-first-col')),
        totalRows: Number(el.getAttribute('data-total-rows')),
        totalCols: Number(el.getAttribute('data-total-cols'))
      };
    });

    if (!Number.isFinite(vmStats0.cellCount) || vmStats0.cellCount <= 0) {
      throw new Error(`Virtual matrix did not render cells (cellCount=${vmStats0.cellCount})`);
    }
    if (vmStats0.cellCount > 2500) {
      throw new Error(`Virtual matrix DOM too large (cellCount=${vmStats0.cellCount})`);
    }

    await page.screenshot({ path: virtualPath, fullPage: true });
    console.log(`✅ Screenshot saved: ${virtualPath}`);

    const beforeStats = await page.$eval('[data-testid="matrix-virtual"]', (el) => ({
      seq: Number(el.getAttribute('data-render-seq')) || 0,
      firstRow: Number(el.getAttribute('data-first-row')) || 0,
      firstCol: Number(el.getAttribute('data-first-col')) || 0
    }));

    console.log('ℹ️  Scrolling virtual viewport');
    await page.$eval('[data-testid="thg-vm-viewport-a"]', (el) => {
      el.scrollTop = 26 * 120;
      el.scrollLeft = 44 * 20;
      el.dispatchEvent(new Event('scroll', { bubbles: true }));
    });

    // Best-effort: allow a few frames for the scroll handler + rAF render.
    await new Promise((resolve) => setTimeout(resolve, 500));

    const vmStats1 = await page.$eval('[data-testid="matrix-virtual"]', (el) => ({
      cellCount: Number(el.getAttribute('data-cell-count')),
      firstRow: Number(el.getAttribute('data-first-row')),
      firstCol: Number(el.getAttribute('data-first-col'))
    }));

    console.log(`✅ Virtual scroll window: firstRow=${vmStats1.firstRow} firstCol=${vmStats1.firstCol} cells=${vmStats1.cellCount}`);

    await page.screenshot({ path: virtualScrolledPath, fullPage: true });
    console.log(`✅ Screenshot saved: ${virtualScrolledPath}`);

    await page.click('[data-testid="flip-axes"]');
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-testid="topic-hub-guessing"]');
      return root && root.getAttribute('data-view') === 'b';
    }, { timeout: 6000 });

    await page.waitForFunction(() => {
      const root = document.querySelector('[data-testid="matrix-virtual-flipped"]');
      return root && root.getAttribute('data-vm-ready') === '1';
    }, { timeout: 6000 });

    await page.screenshot({ path: virtualFlippedPath, fullPage: true });
    console.log(`✅ Screenshot saved: ${virtualFlippedPath}`);

    await page.close();
    await browser.close();
    browser = null;

    console.log('');
    console.log('✅ Screenshot check passed');
    clearTimeout(watchdog);
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Error:', err.stack || err.message);
    process.exitCode = 2;
  } finally {
    clearTimeout(watchdog);
    try {
      if (browser) await browser.close();
    } catch {
      // ignore
    }

    try {
      resolved.close();
    } catch {
      // ignore
    }
  }
}

main();
