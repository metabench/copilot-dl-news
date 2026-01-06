/**
 * Lab: Downloads Progress Bar E2E Test (uses existing server)
 * 
 * Verifies that the Downloads panel progress bar updates in real-time
 * during a 50-page crawl.
 * 
 * Prerequisites: The unified server must be running on port 3000
 *   npm run ui:unified
 * 
 * Run: node labs/lab-050-downloads-existing.js
 */
'use strict';

const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = path.join(__dirname, '..', 'tmp', 'lab-050');
const SCREENSHOTS_DIR = path.join(OUTPUT_DIR, 'screenshots');
const LOG_FILE = path.join(OUTPUT_DIR, 'lab-050.log');

// Ensure output directories exist
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkServerRunning() {
  try {
    const response = await fetch('http://localhost:3000/api/downloads/stats');
    const data = await response.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
}

async function startMiniCrawl(maxPages = 50) {
  log(`Starting mini-crawl with ${maxPages} pages...`);
  
  const crawl = spawn('node', [
    'tools/dev/mini-crawl.js',
    'https://www.bbc.com/news',  // Use BBC for variety
    '--max-pages', String(maxPages),
    '--timeout', '600000'
  ], {
    cwd: path.join(__dirname, '..'),
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true
  });

  // Collect job ID
  let jobId = null;
  
  crawl.stdout.on('data', (data) => {
    const text = data.toString().trim();
    log('[CRAWL] ' + text);
    
    // Look for job ID in output
    const match = text.match(/jobId":"([^"]+)"/);
    if (match && !jobId) {
      jobId = match[1];
      log('Job ID detected: ' + jobId);
    }
  });

  crawl.stderr.on('data', (data) => {
    log('[CRAWL ERR] ' + data.toString().trim());
  });

  // Wait for job ID
  await new Promise((resolve) => {
    const check = setInterval(() => {
      if (jobId) {
        clearInterval(check);
        resolve();
      }
    }, 100);
    setTimeout(() => {
      clearInterval(check);
      resolve();
    }, 10000);
  });

  return { process: crawl, jobId };
}

async function runLab() {
  // Clear log file
  fs.writeFileSync(LOG_FILE, '');
  log('=== Lab 050: Downloads Progress Bar E2E Test ===');
  log('Using existing server on port 3000');
  
  let crawl = null;
  let browser = null;

  try {
    // Step 0: Check server is running
    log('Checking if server is running...');
    const serverRunning = await checkServerRunning();
    if (!serverRunning) {
      throw new Error('Server not running on port 3000. Please run: npm run ui:unified');
    }
    log('✓ Server is running');

    // Step 1: Get baseline stats from API
    log('Getting baseline stats...');
    const baselineResponse = await fetch('http://localhost:3000/api/downloads/stats');
    const baselineData = await baselineResponse.json();
    log('Baseline stats: ' + JSON.stringify(baselineData.stats));
    const baselineTotal = baselineData.stats?.total_responses || 0;

    // Step 2: Launch Puppeteer browser
    log('Launching Puppeteer browser...');
    browser = await puppeteer.launch({
      headless: false, // Show the browser so user can see
      defaultViewport: { width: 1400, height: 900 },
      args: ['--no-sandbox']
    });

    const page = await browser.newPage();
    
    // Capture console logs
    page.on('console', msg => {
      log(`[BROWSER] ${msg.type()}: ${msg.text()}`);
    });

    // Step 3: Navigate to Downloads panel
    log('Navigating to Downloads panel...');
    await page.goto('http://localhost:3000/?app=downloads', { waitUntil: 'networkidle0' });
    await sleep(2000);
    
    // Take initial screenshot
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01-initial.png') });
    log('Screenshot: 01-initial.png');

    // Step 4: Get initial UI stats
    const getStats = async () => {
      return await page.evaluate(() => {
        const total = document.querySelector('[data-downloads-stat="total"]')?.textContent || '–';
        const verified = document.querySelector('[data-downloads-stat="verified"]')?.textContent || '–';
        const bytes = document.querySelector('[data-downloads-stat="bytes"]')?.textContent || '–';
        const progressText = document.querySelector('[data-downloads-stat="progress-text"]')?.textContent || '–';
        const progressBar = document.querySelector('[data-downloads-progress-bar]');
        const progressWidth = progressBar ? progressBar.style.width : '0%';
        return { total, verified, bytes, progressText, progressWidth };
      });
    };

    const initialStats = await getStats();
    log('Initial UI stats: ' + JSON.stringify(initialStats));

    // Step 5: Start the crawl
    log('Starting crawl...');
    const { process: crawlProcess, jobId } = await startMiniCrawl(50);
    crawl = crawlProcess;
    log('Crawl started with job ID: ' + (jobId || 'unknown'));

    // Step 6: Monitor progress every 5 seconds for 3 minutes
    const progressHistory = [];
    const checkInterval = 5000;
    const maxDuration = 180000; // 3 minutes
    let elapsed = 0;
    let checkCount = 0;

    log('Starting progress monitoring...');
    while (elapsed < maxDuration) {
      await sleep(checkInterval);
      elapsed += checkInterval;
      checkCount++;

      // Get stats from API
      const apiResponse = await fetch('http://localhost:3000/api/downloads/stats');
      const apiData = await apiResponse.json();
      const currentTotal = apiData.stats?.total_responses || 0;
      const newDownloads = currentTotal - baselineTotal;

      // Get stats from UI
      const uiStats = await getStats();

      progressHistory.push({
        time: elapsed / 1000,
        apiTotal: currentTotal,
        newDownloads,
        ui: uiStats
      });

      log(`Progress check ${checkCount} (${elapsed/1000}s): API=${currentTotal} (+${newDownloads}), UI=${JSON.stringify(uiStats)}`);

      // Take screenshot every 30 seconds
      if (checkCount % 6 === 0) {
        const screenshotNum = String(Math.floor(checkCount / 6) + 1).padStart(2, '0');
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `progress-${screenshotNum}.png`) });
        log(`Screenshot: progress-${screenshotNum}.png`);
      }

      // Check if crawl is done (process exited or 50 new downloads)
      if (newDownloads >= 50) {
        log('Reached 50 new downloads, stopping monitoring');
        break;
      }
    }

    // Step 7: Take final screenshot
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'final.png') });
    log('Screenshot: final.png');

    // Step 8: Generate report
    const report = {
      timestamp: new Date().toISOString(),
      baselineTotal,
      checkCount,
      progressHistory,
      success: progressHistory.length > 0 && 
               progressHistory[progressHistory.length - 1].newDownloads > 0
    };

    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'report.json'),
      JSON.stringify(report, null, 2)
    );
    log('Report saved to report.json');

    log('=== Lab Complete ===');
    log('Results:');
    log(`  Baseline total: ${baselineTotal}`);
    log(`  Final total: ${progressHistory[progressHistory.length - 1]?.apiTotal || 'N/A'}`);
    log(`  New downloads: ${progressHistory[progressHistory.length - 1]?.newDownloads || 0}`);
    log(`  Progress checks: ${checkCount}`);
    log(`  Success: ${report.success}`);

  } catch (error) {
    log('ERROR: ' + error.message);
    log(error.stack);
    throw error;
  } finally {
    // Cleanup
    if (crawl) {
      log('Killing crawl process...');
      crawl.kill();
    }
    if (browser) {
      log('Closing browser...');
      await browser.close();
    }
  }
}

runLab().catch(err => {
  console.error('Lab failed:', err.message);
  process.exit(1);
});
