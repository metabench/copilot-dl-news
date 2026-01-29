#!/usr/bin/env node
'use strict';

/**
 * Screenshot Check: Place Hub Guessing — Matrix
 *
 * Renders the SSR HTML and takes a full-page screenshot via Puppeteer.
 * This is useful to verify rotated column headers, truncation, and overall layout.
 */

const fs = require('fs');
const path = require('path');

const puppeteer = require('puppeteer');

const { resolveBetterSqliteHandle } = require('../../utils/dashboardModule');
const { renderPlaceHubGuessingMatrixHtml } = require('../server');

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'news.db');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Check: Place Hub Guessing — Matrix Screenshot');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  const resolved = resolveBetterSqliteHandle({ dbPath: DB_PATH, readonly: true });
  const { dbHandle } = resolved;

  let browser = null;
  try {
    if (!dbHandle) {
      throw new Error('Database handle not resolved');
    }

    const html = renderPlaceHubGuessingMatrixHtml({
      dbHandle,
      placeKind: 'country',
      pageKind: 'country-hub',
      placeLimit: 18,
      hostLimit: 16,
      matrixMode: 'table'
    });

    if (typeof html !== 'string' || html.length < 500) {
      throw new Error('Expected non-empty HTML');
    }

    const outDir = path.join(process.cwd(), 'screenshots');
    ensureDir(outDir);

    const outPath = path.join(outDir, 'place-hub-guessing-matrix.png');
    const flippedPath = path.join(outDir, 'place-hub-guessing-matrix-flipped.png');
    const virtualPath = path.join(outDir, 'place-hub-guessing-matrix-virtual.png');
    const virtualScrolledPath = path.join(outDir, 'place-hub-guessing-matrix-virtual-scrolled.png');
    const virtualFlippedPath = path.join(outDir, 'place-hub-guessing-matrix-virtual-flipped.png');

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 900, deviceScaleFactor: 2 });

    // Debug aid: surface browser-side errors when virtual mode init fails.
    page.on('pageerror', (err) => {
      console.log(`ℹ️  [browser pageerror] ${err && err.message ? err.message : String(err)}`);
    });
    page.on('console', (msg) => {
      const type = msg.type();
      if (type === 'error' || type === 'warning') {
        console.log(`ℹ️  [browser console:${type}] ${msg.text()}`);
      }
    });

    // Avoid long hangs if external fonts are blocked; we only care about layout.
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Ensure the flip button is present (and script is wired).
    await page.waitForSelector('[data-testid="flip-axes"]', { timeout: 4000 });

    const viewBefore = await page.$eval('[data-testid="place-hub-guessing"]', (el) => el.getAttribute('data-view') || '');
    if (viewBefore !== 'a') {
      console.log(`ℹ️  Initial data-view is ${viewBefore} (expected 'a')`);
    }

    const headerStats = await page.$$eval('[data-testid="matrix-view-a"] [data-testid="matrix-col-headers"] th', (els) => {
      const texts = els
        .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);

      const colCount = els.filter((el) => el.classList.contains('matrix-th-col')).length;
      const tooltipCount = els
        .map((el) => el.querySelector('.matrix-th-col-label'))
        .filter((el) => el && el.getAttribute('title'))
        .length;

      return {
        totalTh: els.length,
        colTh: colCount,
        tooltipCount,
        textSample: texts.slice(0, 10)
      };
    });

    console.log(`✅ Header <th> cells: ${headerStats.totalTh} (cols=${headerStats.colTh})`);
    console.log(`ℹ️  Header tooltips (truncated labels): ${headerStats.tooltipCount}`);
    console.log(`ℹ️  Header text sample: ${headerStats.textSample.join(' | ')}`);

    await page.screenshot({ path: outPath, fullPage: true });
    console.log(`✅ Screenshot saved: ${outPath}`);

    // Flip view and capture a second screenshot.
    await page.click('[data-testid="flip-axes"]');

    await page.waitForFunction(() => {
      const root = document.querySelector('[data-testid="place-hub-guessing"]');
      return root && root.getAttribute('data-view') === 'b';
    }, { timeout: 4000 });

    const flippedHeaderStats = await page.$$eval('[data-testid="matrix-view-b"] [data-testid="matrix-col-headers"] th', (els) => {
      const texts = els
        .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);

      const colCount = els.filter((el) => el.classList.contains('matrix-th-col')).length;
      const tooltipCount = els
        .map((el) => el.querySelector('.matrix-th-col-label'))
        .filter((el) => el && el.getAttribute('title'))
        .length;

      return {
        totalTh: els.length,
        colTh: colCount,
        tooltipCount,
        textSample: texts.slice(0, 10)
      };
    });

    console.log(`✅ Flipped header <th> cells: ${flippedHeaderStats.totalTh} (cols=${flippedHeaderStats.colTh})`);
    console.log(`ℹ️  Flipped header tooltips (truncated labels): ${flippedHeaderStats.tooltipCount}`);
    await page.screenshot({ path: flippedPath, fullPage: true });
    console.log(`✅ Screenshot saved: ${flippedPath}`);

    // Virtual mode screenshots
    const htmlVirtual = renderPlaceHubGuessingMatrixHtml({
      dbHandle,
      placeKind: 'country',
      pageKind: 'country-hub',
      placeLimit: 200,
      hostLimit: 50,
      matrixMode: 'virtual'
    });

    await page.setContent(htmlVirtual, { waitUntil: 'domcontentloaded' });
    await new Promise((resolve) => setTimeout(resolve, 200));

    await page.waitForSelector('[data-testid="matrix-virtual"]', { timeout: 6000 });
    await page.waitForSelector('[data-testid="phg-vm-viewport-a"]', { timeout: 6000 });

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

    // Scroll the virtual viewport to force re-windowing.
    const beforeSeq = await page.$eval('[data-testid="matrix-virtual"]', (el) => Number(el.getAttribute('data-render-seq')) || 0);
    await page.$eval('[data-testid="phg-vm-viewport-a"]', (el) => {
      el.scrollTop = 26 * 120;
      el.scrollLeft = 44 * 20;
    });

    await page.waitForFunction((seq) => {
      const root = document.querySelector('[data-testid="matrix-virtual"]');
      const cur = Number(root && root.getAttribute('data-render-seq')) || 0;
      return cur > seq;
    }, { timeout: 6000 }, beforeSeq);

    const vmStats1 = await page.$eval('[data-testid="matrix-virtual"]', (el) => ({
      cellCount: Number(el.getAttribute('data-cell-count')),
      firstRow: Number(el.getAttribute('data-first-row')),
      firstCol: Number(el.getAttribute('data-first-col'))
    }));

    console.log(`✅ Virtual scroll window: firstRow=${vmStats1.firstRow} firstCol=${vmStats1.firstCol} cells=${vmStats1.cellCount}`);

    await page.screenshot({ path: virtualScrolledPath, fullPage: true });
    console.log(`✅ Screenshot saved: ${virtualScrolledPath}`);

    // Flip view in virtual mode and capture.
    await page.click('[data-testid="flip-axes"]');
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-testid="place-hub-guessing"]');
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
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Error:', err.stack || err.message);
    process.exitCode = 2;
  } finally {
    try {
      if (browser) await browser.close();
    } catch (_) {
      // ignore
    }

    try {
      resolved.close();
    } catch (_) {
      // ignore
    }
  }
}

main();
