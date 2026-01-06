/**
 * Lab: Test 50-page crawl with progress bar monitoring
 * 
 * This lab:
 * 1. Opens the Downloads panel in a Puppeteer browser
 * 2. Starts a mini-crawl in the background
 * 3. Monitors the progress bar updating every 3 seconds
 * 4. Takes screenshots to document progress
 * 5. Reports on whether the progress bar updated correctly
 */

const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SERVER_URL = 'http://localhost:3000';
const OUTPUT_DIR = path.join(__dirname, '..', 'tmp', 'lab-050-progress');
const SCREENSHOTS_DIR = path.join(OUTPUT_DIR, 'screenshots');
const TARGET_URL = 'https://www.reuters.com/';
const MAX_PAGES = 50;
const CHECK_INTERVAL_MS = 3000;
const MAX_DURATION_MS = 5 * 60 * 1000; // 5 minutes max

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function checkServerRunning() {
  try {
    const res = await fetch(`${SERVER_URL}/api/downloads/stats`);
    const data = await res.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
}

async function getCrawlProgress() {
  try {
    const res = await fetch(`${SERVER_URL}/api/downloads/crawl-progress`);
    return res.json();
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

async function getUiProgress(page) {
  return page.evaluate(() => {
    const total = document.querySelector('[data-downloads-stat="total"]')?.textContent || '';
    const verified = document.querySelector('[data-downloads-stat="verified"]')?.textContent || '';
    const bytes = document.querySelector('[data-downloads-stat="bytes"]')?.textContent || '';
    const progressText = document.querySelector('[data-downloads-stat="progress-text"]')?.textContent || '';
    const progressBar = document.querySelector('[data-downloads-progress-bar]');
    const progressWidth = progressBar?.style?.width || '0%';
    return { total, verified, bytes, progressText, progressWidth };
  });
}

async function main() {
  // Setup directories
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  log('=== Lab: 50-Page Crawl Progress Test ===');

  // Check server
  if (!await checkServerRunning()) {
    log('ERROR: Server not running at ' + SERVER_URL);
    process.exit(1);
  }
  log('Server check passed');

  // Check initial state
  const initialProgress = await getCrawlProgress();
  log('Initial crawl state: ' + JSON.stringify(initialProgress));

  // Launch browser
  log('Launching browser...');
  const browser = await puppeteer.launch({ 
    headless: false,
    defaultViewport: { width: 1200, height: 900 }
  });
  const page = await browser.newPage();

  // Navigate to Downloads panel
  await page.goto(`${SERVER_URL}/?app=downloads`, { waitUntil: 'networkidle2' });
  log('Opened Downloads panel');

  // Wait for initial render
  await new Promise(r => setTimeout(r, 2000));

  // Take initial screenshot
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01-initial.png'), fullPage: true });
  log('Screenshot: 01-initial.png');

  const uiInitial = await getUiProgress(page);
  log('Initial UI: ' + JSON.stringify(uiInitial));

  // Start crawl
  log('Starting mini-crawl...');
  const crawl = spawn('node', [
    'tools/dev/mini-crawl.js',
    TARGET_URL,
    '--max-pages', String(MAX_PAGES),
    '--timeout', String(MAX_DURATION_MS)
  ], {
    cwd: path.join(__dirname, '..'),
    stdio: ['pipe', 'pipe', 'pipe']
  });

  crawl.stdout.on('data', (data) => {
    const line = data.toString().trim();
    if (line.includes('PAGE') || line.includes('PROGRESS') || line.includes('Started') || line.includes('Job ID')) {
      log('[CRAWL] ' + line.substring(0, 150));
    }
  });

  crawl.stderr.on('data', (data) => {
    log('[CRAWL ERR] ' + data.toString().trim().substring(0, 150));
  });

  // Monitor progress
  const startTime = Date.now();
  const history = [];
  let checkNum = 0;
  let lastDownloaded = 0;
  let stableCount = 0;
  let progressBarUpdated = false;

  log('Monitoring progress...');
  
  while (Date.now() - startTime < MAX_DURATION_MS) {
    await new Promise(r => setTimeout(r, CHECK_INTERVAL_MS));
    checkNum++;

    const api = await getCrawlProgress();
    const ui = await getUiProgress(page);
    
    const downloaded = api.progress?.downloaded || 0;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    
    history.push({
      time: elapsed,
      api: api.status === 'ok' ? { active: api.active, downloaded, goal: api.goal, percent: api.progress?.percentComplete } : api,
      ui
    });

    log(`Check ${checkNum} (${elapsed}s): API=${downloaded}/${api.goal || 50} (${api.progress?.percentComplete}%), UI="${ui.progressText}" (${ui.progressWidth})`);

    // Check if progress bar has updated from initial "0 / 50"
    if (ui.progressText !== '0 / 50' && ui.progressWidth !== '0%') {
      if (!progressBarUpdated) {
        progressBarUpdated = true;
        log('✅ PROGRESS BAR IS UPDATING!');
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `02-progress-${checkNum}.png`), fullPage: true });
      }
    }

    // Take periodic screenshots
    if (checkNum % 5 === 0) {
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `progress-${String(checkNum).padStart(2, '0')}.png`), fullPage: true });
    }

    // Check if crawl is done
    if (downloaded >= MAX_PAGES) {
      log(`Reached goal of ${MAX_PAGES} downloads`);
      break;
    }

    // Check for stalled crawl
    if (downloaded === lastDownloaded && downloaded > 0) {
      stableCount++;
      if (stableCount > 10) {
        log('Crawl appears stalled, stopping');
        break;
      }
    } else {
      stableCount = 0;
    }
    lastDownloaded = downloaded;
  }

  // Final screenshot
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '99-final.png'), fullPage: true });
  log('Screenshot: 99-final.png');

  // Kill crawl
  log('Stopping crawl...');
  crawl.kill('SIGTERM');

  // Close browser
  await browser.close();

  // Generate report
  const report = {
    timestamp: new Date().toISOString(),
    targetUrl: TARGET_URL,
    maxPages: MAX_PAGES,
    checkCount: checkNum,
    progressBarUpdated,
    history
  };

  fs.writeFileSync(path.join(OUTPUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
  log('Report saved to report.json');

  log('=== Lab Complete ===');
  log(`Progress bar updated: ${progressBarUpdated ? '✅ YES' : '❌ NO'}`);
  log(`Total checks: ${checkNum}`);
  log(`Screenshots: ${SCREENSHOTS_DIR}`);

  process.exit(0);
}

main().catch(err => {
  console.error('Lab failed:', err);
  process.exit(1);
});
