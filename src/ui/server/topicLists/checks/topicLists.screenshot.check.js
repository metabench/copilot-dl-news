#!/usr/bin/env node
'use strict';

/**
 * Screenshot Check: Topic Lists
 *
 * Read-only: renders the Topic Lists page (no DB writes).
 */

const fs = require('fs');
const path = require('path');

const puppeteer = require('puppeteer');

const { resolveBetterSqliteHandle } = require('../../utils/serverStartupCheckdashboardModule');
const { renderTopicListsHtml } = require('../server');

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
  }, 60000);
  watchdog.unref();

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Check: Topic Lists — Screenshot');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  const resolved = resolveBetterSqliteHandle({ dbPath: DB_PATH, readonly: true });
  const { dbHandle } = resolved;

  let browser = null;
  try {
    if (!dbHandle) {
      throw new Error('Database handle not resolved');
    }

    const html = renderTopicListsHtml({
      dbHandle,
      basePath: '/topic-lists',
      lang: 'en',
      q: ''
    });

    if (typeof html !== 'string' || html.length < 400) {
      throw new Error('Expected non-empty HTML');
    }

    const outDir = path.join(process.cwd(), 'screenshots');
    ensureDir(outDir);

    const outPath = path.join(outDir, 'topic-lists.png');

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(15000);

    await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 });
    console.log('ℹ️  Rendering Topic Lists page');
    await page.setContent(html, { waitUntil: 'domcontentloaded' });

    await page.waitForSelector('[data-testid="topic-lists"]', { timeout: 8000 });
    await page.waitForSelector('[data-testid="topic-lists-table"]', { timeout: 8000 });

    await page.screenshot({ path: outPath, fullPage: true });
    console.log(`✅ Screenshot saved: ${outPath}`);

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
