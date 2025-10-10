'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require('puppeteer');

describe('E2E Feature: Geography Crawl - Startup and Telemetry', () => {
  let serverProcess, serverPort, dbPath, tmpDir, browser, page;
  let consoleMessages, consoleErrors, networkErrors, telemetryEvents;

  const log = (step, message, data = null) => {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [Step ${step}]`;
    if (data) {
      console.log(`${prefix} ${message}:`, JSON.stringify(data, null, 2));
    } else {
      console.log(`${prefix} ${message}`);
    }
  };

  beforeEach(async () => {
    consoleMessages = [];
    consoleErrors = [];
    networkErrors = [];
    telemetryEvents = [];
    tmpDir = path.join(os.tmpdir(), `geography-startup-test-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    dbPath = path.join(tmpDir, 'test.db');
    log(0, 'Setup - Starting server process', { dbPath });
    serverProcess = spawn('node', ['src/ui/express/server.js', '--detached'], {
      env: { ...process.env, DB_PATH: dbPath, PORT: '0', UI_VERBOSE: '0', UI_FAST_START: '1', UI_FAKE_RUNNER: '1', UI_FAKE_PLANNER: '1', UI_FAKE_QUEUE: '1', UI_FAKE_MILESTONES: '1', UI_FAKE_PROBLEMS: '1', UI_FAKE_PLANNER_DELAY_MS: '25' },
      cwd: path.resolve(__dirname, '../../..'), stdio: ['ignore', 'pipe', 'pipe']
    });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server start timeout')), 15000);
      serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        const match = output.match(/listening on.*:(\d+)/);
        if (match) { serverPort = parseInt(match[1], 10); clearTimeout(timeout); log(0, 'Setup - Server started', { port: serverPort }); resolve(); }
      });
      serverProcess.stderr.on('data', (data) => { console.error('Server error:', data.toString()); });
    });
    log(0, 'Setup - Launching browser');
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    page = await browser.newPage();
    page.on('console', (msg) => {
      const type = msg.type(); const text = msg.text();
      if (text.startsWith('[2025-')) return;
      consoleMessages.push({ type, text, timestamp: Date.now() });
      console.log(`[BROWSER ${type.toUpperCase()}] ${text}`);
      if (type === 'error') { consoleErrors.push({ text, timestamp: Date.now() }); }
    });
    page.on('requestfailed', (request) => {
      const failure = request.failure();
      networkErrors.push({ url: request.url(), failure: failure ? failure.errorText : 'unknown', timestamp: Date.now() });
      log('NETWORK', ' Network request failed', { url: request.url(), error: failure ? failure.errorText : 'unknown' });
    });
    log(0, 'Setup - Browser launched and monitoring enabled');
  }, 20000);

  afterEach(async () => {
    if (browser) { await browser.close(); log(99, 'Cleanup - Browser closed'); }
    if (serverProcess) { serverProcess.kill(); log(99, 'Cleanup - Server process terminated'); }
    if (dbPath) { ['', '-shm', '-wal'].forEach(suffix => { try { fs.unlinkSync(dbPath + suffix); } catch (_) {} }); }
  });

  test('Geography crawl starts and displays with telemetry', async () => {
    log(1, 'Starting geography crawl startup test');
    await page.goto(`http://localhost:${serverPort}`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('#crawlType', { timeout: 5000 });
    await page.select('#crawlType', 'geography');
    await page.click('#startBtn');
    await page.waitForFunction(() => {
      const section = document.getElementById('crawlProgressSection');
      return section && section.getAttribute('data-active') === '1';
    }, { timeout: 10000 });
    log(2, 'Test completed');
    expect(consoleErrors.length).toBe(0);
  }, 30000);
});
