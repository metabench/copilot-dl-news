/**
 * Lab: Downloads Progress Bar E2E Test
 * 
 * Verifies that the Downloads panel progress bar updates in real-time
 * during a 50-page crawl.
 * 
 * Run: node labs/lab-050-downloads-progress.js
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

async function startUnifiedServer() {
  log('Starting unified server...');
  
  const server = spawn('node', ['src/ui/server/unifiedApp/server.js'], {
    cwd: path.join(__dirname, '..'),
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true
  });

  let started = false;
  const startPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (!started) reject(new Error('Server start timeout'));
    }, 30000);

    server.stdout.on('data', (data) => {
      const text = data.toString();
      log('[SERVER] ' + text.trim());
      if (text.includes('Unified App Shell running')) {
        started = true;
        clearTimeout(timeout);
        resolve();
      }
    });

    server.stderr.on('data', (data) => {
      log('[SERVER ERR] ' + data.toString().trim());
    });
  });

  await startPromise;
  log('Server started successfully');
  return server;
}

async function startMiniCrawl(maxPages = 50) {
  log(`Starting mini-crawl with ${maxPages} pages...`);
  
  const crawl = spawn('node', [
    'tools/dev/mini-crawl.js',
    'https://www.theguardian.com',
    '--max-pages', String(maxPages),
    '--timeout', '600000'
  ], {
    cwd: path.join(__dirname, '..'),
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true
  });

  crawl.stdout.on('data', (data) => {
    log('[CRAWL] ' + data.toString().trim());
  });

  crawl.stderr.on('data', (data) => {
    log('[CRAWL ERR] ' + data.toString().trim());
  });

  return crawl;
}

async function runLab() {
  // Clear log file
  fs.writeFileSync(LOG_FILE, '');
  log('=== Lab 050: Downloads Progress Bar E2E Test ===');
  
  let server = null;
  let crawl = null;
  let browser = null;

  try {
    // Step 1: Start the unified server
    server = await startUnifiedServer();
    await sleep(2000); // Give it time to fully initialize

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

    // Step 4: Get initial stats
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
    log('Initial stats: ' + JSON.stringify(initialStats));

    // Step 5: Start the crawl
    log('Starting crawl...');
    crawl = await startMiniCrawl(50);

    // Step 6: Monitor progress every 10 seconds
    const progressSnapshots = [];
    let screenshotIndex = 2;
    
    for (let i = 0; i < 30; i++) { // Monitor for up to 5 minutes
      await sleep(10000); // Wait 10 seconds
      
      const stats = await getStats();
      progressSnapshots.push({ 
        time: new Date().toISOString(), 
        ...stats 
      });
      
      log(`Progress check ${i + 1}: ${JSON.stringify(stats)}`);
      
      // Take screenshot every 30 seconds
      if (i % 3 === 0) {
        const screenshotPath = path.join(SCREENSHOTS_DIR, `${String(screenshotIndex).padStart(2, '0')}-progress.png`);
        await page.screenshot({ path: screenshotPath });
        log(`Screenshot: ${path.basename(screenshotPath)}`);
        screenshotIndex++;
      }

      // Check if we've reached 50
      const verifiedNum = parseInt(stats.verified.replace(/,/g, ''), 10);
      if (!isNaN(verifiedNum) && verifiedNum >= 50) {
        log('Target of 50 downloads reached!');
        break;
      }
    }

    // Step 7: Take final screenshot
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'final.png') });
    log('Screenshot: final.png');

    // Step 8: Generate report
    const report = {
      testName: 'Downloads Progress Bar E2E',
      startTime: progressSnapshots[0]?.time,
      endTime: progressSnapshots[progressSnapshots.length - 1]?.time,
      initialStats,
      finalStats: progressSnapshots[progressSnapshots.length - 1],
      progressSnapshots,
      progressBarUpdated: progressSnapshots.some(s => s.progressWidth !== '0%'),
      statsUpdated: progressSnapshots.some(s => s.total !== initialStats.total)
    };

    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'report.json'), 
      JSON.stringify(report, null, 2)
    );
    log('Report saved to report.json');

    // Summary
    log('=== RESULTS ===');
    log(`Progress bar updated: ${report.progressBarUpdated ? 'YES ✓' : 'NO ✗'}`);
    log(`Stats updated: ${report.statsUpdated ? 'YES ✓' : 'NO ✗'}`);
    log(`Final verified count: ${report.finalStats?.verified || 'unknown'}`);

  } catch (error) {
    log('ERROR: ' + error.message);
    log('Stack: ' + error.stack);
  } finally {
    log('Cleaning up...');
    
    if (browser) {
      log('Waiting 10 seconds before closing browser...');
      await sleep(10000);
      await browser.close();
    }
    
    if (crawl) {
      crawl.kill();
    }
    
    if (server) {
      server.kill();
    }
    
    log('Lab complete');
  }
}

runLab().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
