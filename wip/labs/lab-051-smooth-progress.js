/**
 * Lab 051: Smooth Progress Bar Test (v2)
 * Tests 200ms polling rate.
 */
const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = 'tmp/lab-051-smooth';

async function run() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(path.join(OUTPUT_DIR, 'screenshots'))) {
    fs.mkdirSync(path.join(OUTPUT_DIR, 'screenshots'), { recursive: true });
  }

  console.log('=== Lab 051: Smooth Progress Test ===\n');
  
  console.log('Checking server...');
  try {
    const res = await fetch('http://localhost:3000/api/downloads/stats');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    console.log('Server OK\n');
  } catch (err) {
    console.log('Server not running');
    process.exit(1);
  }

  const browser = await puppeteer.launch({ headless: false, defaultViewport: { width: 1280, height: 900 } });
  const page = await browser.newPage();
  
  const apiCalls = [];
  page.on('response', async (r) => {
    if (r.url().includes('/api/downloads/crawl-progress')) {
      apiCalls.push({ time: Date.now(), status: r.status() });
    }
  });
  
  console.log('Loading Downloads...');
  await page.goto('http://localhost:3000/?app=downloads', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'screenshots/00-initial.png') });

  console.log('Starting mini-crawl (15 pages, theguardian.com)...');
  const crawl = spawn('node', ['tools/dev/mini-crawl.js', 'https://www.theguardian.com', '--max-pages', '15'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  crawl.stdout.on('data', () => {});
  crawl.stderr.on('data', () => {});

  console.log('Monitoring every 100ms...\n');
  const progressHistory = [];
  let lastText = '';
  const startTime = Date.now();
  
  const monitorInterval = setInterval(async () => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    try {
      const text = await page.\('[data-downloads-stat=\"progress-text\"]', el => el.textContent);
      const width = await page.\('[data-downloads-progress-bar]', el => el.style.width);
      if (text !== lastText) {
        console.log('[' + elapsed + 's] Progress: \"' + text + '\" (' + width + ')');
        progressHistory.push({ time: elapsed, text, width });
        lastText = text;
        await page.screenshot({ path: path.join(OUTPUT_DIR, 'screenshots/' + String(progressHistory.length).padStart(2, '0') + '.png') });
      }
    } catch (err) {}
  }, 100);

  await new Promise((resolve) => {
    const timeout = setTimeout(() => { crawl.kill('SIGTERM'); resolve(); }, 60000);
    crawl.on('close', () => { clearTimeout(timeout); console.log('\nCrawl done'); resolve(); });
  });

  clearInterval(monitorInterval);
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'screenshots/99-final.png') });
  
  console.log('\n=== API Polling Analysis ===');
  if (apiCalls.length > 1) {
    const intervals = apiCalls.slice(1).map((c, i) => c.time - apiCalls[i].time);
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    console.log('Calls: ' + apiCalls.length + ', Avg: ' + avg.toFixed(0) + 'ms (target: 200ms)');
    console.log(avg < 300 ? 'PASS: Fast polling' : 'WARN: Slow polling');
  }

  console.log('\n=== Progress Changes: ' + progressHistory.length + ' ===');
  progressHistory.forEach(p => console.log('  [' + p.time + 's] ' + p.text + ' (' + p.width + ')'));

  const report = {
    timestamp: new Date().toISOString(),
    apiPolling: { totalCalls: apiCalls.length, avgMs: apiCalls.length > 1 ? (apiCalls[apiCalls.length-1].time - apiCalls[0].time) / (apiCalls.length - 1) : null },
    progressChanges: progressHistory.length,
    progressHistory,
    success: progressHistory.length >= 2
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'report.json'), JSON.stringify(report, null, 2));

  await browser.close();
  console.log('\n=== Done ===');
  console.log('Progress updates: ' + (report.success ? 'YES' : 'NO'));
  process.exit(report.success ? 0 : 1);
}

run().catch(err => { console.error('Failed:', err); process.exit(1); });
