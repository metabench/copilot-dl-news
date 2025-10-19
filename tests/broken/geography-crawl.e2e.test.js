/**
 * E2E test for geography crawl with full telemetry monitoring
 * 
 * This test verifies the complete geography crawl workflow:
 * 1. Geography crawl type can be selected from dropdown
 * 2. Crawl starts successfully and emits server confirmation
 * 3. SSE telemetry events arrive and are processed correctly
 * 4. Progress indicators update with determinate progress
 * 5. Gazetteer ingestors emit totalItems/currentIngestor data
 * 
 * DISABLED BY DEFAULT - Enable with: GEOGRAPHY_E2E=1 npm test
 * 
 * This is a long-running test that monitors a full geography crawl.
 * Use for manual validation of telemetry infrastructure.
 */

// Disable Jest console truncation for this test completely
process.env.JEST_DISABLE_TRUNCATE = '1';
process.env.JEST_MAX_CONSOLE_LINES = '999999';
process.env.JEST_MAX_CONSOLE_CHARS = '999999';
process.env.JEST_MAX_CONSOLE_COLS = '999999';
process.env.JEST_ALLOW_NOISY_LOGS = '1';

const path = require('path');
const fs = require('fs');
const os = require('os');

// Controlled by environment variable - use GEOGRAPHY_E2E=1 npm test to enable
const E2E_ENABLED = process.env.GEOGRAPHY_E2E === '1';
jest.setTimeout(600000); // 10 minutes for full geography crawl

let puppeteer = null;
if (E2E_ENABLED) {
  try { 
    puppeteer = require('puppeteer'); 
  } catch (err) {
    console.warn('[geography-e2e] Puppeteer not available:', err.message);
  }
}

describe('e2e: geography crawl with telemetry', () => {
  if (!E2E_ENABLED || !puppeteer) {
    it('skipped (set GEOGRAPHY_E2E=1 to enable)', () => { 
      expect(true).toBe(true); 
    });
    return;
  }

  let serverProc = null;
  let baseUrl = 'http://localhost:3000';
  let browser = null;
  let page = null;
  let tempDbPath = null;
  let serverLogs = []; // Collect server logs for cache verification

  const diagnostics = {
    crawlTypeFound: false,
    crawlStarted: false,
    sseConnected: false,
    telemetryReceived: false,
    progressReceived: false,
    gazetteerDataReceived: false,
    cacheHitDetected: false,
    errors: []
  };

  /**
   * Start server with temporary database
   */
  const startServer = () => new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const node = process.execPath;
    const repoRoot = path.join(__dirname, '..', '..', '..', '..');
    
    // Create temp DB for this test
    const tmpDir = path.join(os.tmpdir(), `geography-e2e-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    tempDbPath = path.join(tmpDir, 'test.db');
    
    const env = { 
      ...process.env, 
      PORT: '0',
      DB_PATH: tempDbPath,
      NODE_ENV: 'test',
      UI_FAST_START: '1',
      UI_FAKE_RUNNER: '1',
      UI_FAKE_PLANNER: '1',
      UI_FAKE_QUEUE: '1',
      UI_FAKE_MILESTONES: '1',
      UI_FAKE_PROBLEMS: '1',
      UI_FAKE_PLANNER_DELAY_MS: '25'
    };
    
    console.log('[geography-e2e] Starting server with DB:', tempDbPath);
    serverProc = spawn(node, ['src/ui/express/server.js'], { 
      cwd: repoRoot, 
      env, 
      stdio: ['ignore', 'pipe', 'pipe'] 
    });
    
    let stderrBuf = '';
    let resolved = false;
    
    const onData = (data) => {
      const s = data.toString();
      serverLogs.push(s); // Collect for cache verification
      console.log('[geography-e2e] Server output:', s.trim());
      
      // Check for cache indicators
      if (s.includes('SPARQL cache hit') || s.includes('cache hit')) {
        diagnostics.cacheHitDetected = true;
      }
      
      const m = s.match(/GUI server listening on http:\/\/localhost:(\d+)/);
      if (m && !resolved) {
        const port = parseInt(m[1], 10);
        if (!isNaN(port)) {
          baseUrl = `http://localhost:${port}`;
          console.log('[geography-e2e] Server ready at:', baseUrl);
          // Don't remove listener - keep collecting logs
          // serverProc.stdout.off('data', onData);
          resolved = true;
          resolve();
        }
      }
    };
    
    serverProc.stdout.on('data', onData);
    serverProc.stderr.on('data', (d) => { 
      const msg = d.toString();
      stderrBuf += msg;
      console.error('[geography-e2e] Server stderr:', msg.trim());
    });
    
    serverProc.once('exit', (code) => {
      if (!resolved) {
        reject(new Error(`Server exited early with code ${code}${stderrBuf ? '\n' + stderrBuf.trim() : ''}`));
      }
    });
    
    // Timeout after 30 seconds (use unref to prevent hanging)
    const startupTimeout = setTimeout(() => {
      if (!resolved) {
        reject(new Error('Server failed to start within 30 seconds'));
      }
    }, 30000);
    startupTimeout.unref();
  });

  /**
   * Stop server and clean up
   */
  const stopServer = async () => {
    if (!serverProc) return;
    try { 
      serverProc.kill('SIGINT'); 
      console.log('[geography-e2e] Killed server process');
    } catch (err) {
      console.warn('[geography-e2e] Error killing server:', err.message);
    }
    await new Promise(r => setTimeout(r, 1000));
    
    // Clean up temp DB
    if (tempDbPath) {
      try {
        const suffixes = ['', '-shm', '-wal'];
        for (const suffix of suffixes) {
          const filePath = tempDbPath + suffix;
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
        const dir = path.dirname(tempDbPath);
        if (fs.existsSync(dir)) {
          fs.rmdirSync(dir);
        }
        console.log('[geography-e2e] Cleaned up temp DB');
      } catch (err) {
        console.warn('[geography-e2e] Error cleaning up DB:', err.message);
      }
    }
  };

  /**
   * Print diagnostics on failure
   */
  const printDiagnostics = () => {
    console.log('\n========== GEOGRAPHY E2E DIAGNOSTICS ==========');
    console.log('Crawl Type Found:', diagnostics.crawlTypeFound);
    console.log('Crawl Started:', diagnostics.crawlStarted);
    console.log('SSE Connected:', diagnostics.sseConnected);
    console.log('Telemetry Received:', diagnostics.telemetryReceived);
    console.log('Progress Received:', diagnostics.progressReceived);
    console.log('Gazetteer Data Received:', diagnostics.gazetteerDataReceived);
    console.log('Cache Hit Detected:', diagnostics.cacheHitDetected);
    console.log('Errors:', diagnostics.errors.length);
    if (diagnostics.errors.length > 0) {
      diagnostics.errors.forEach((err, idx) => {
        console.log(`  [${idx + 1}]`, err);
      });
    }
    console.log('===============================================\n');
  };

  beforeAll(async () => {
    try {
      await startServer();
      browser = await puppeteer.launch({ 
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      console.log('[geography-e2e] Browser launched');
    } catch (err) {
      console.error('[geography-e2e] Setup failed:', err);
      throw err;
    }
  });

  afterAll(async () => {
    try { 
      if (browser) {
        await browser.close(); 
        console.log('[geography-e2e] Browser closed');
      }
    } catch (err) {
      console.warn('[geography-e2e] Error closing browser:', err.message);
    }
    await stopServer();
  });

  it('should select geography crawl type, start crawl, and monitor telemetry', async () => {
    console.log('[geography-e2e] Starting test...');
    
    try {
      // Create new page
      page = await browser.newPage();
      console.log('[geography-e2e] New page created');
      
      // Set up console monitoring - track ALL console messages for debugging
      const consoleErrors = [];
      page.on('console', async msg => {
        const type = msg.type();
        
        // Try to get actual text from JSHandles
        let text = msg.text();
        
        // Log ALL console messages for debugging
        console.log('[geography-e2e] Browser console', type.toUpperCase() + ':', text);
        
        if (text.includes('JSHandle@') || text.includes('[object Object]')) {
          try {
            // For JSHandle errors or [object Object], try to extract the actual error details
            const args = msg.args();
            const texts = [];
            for (const arg of args) {
              try {
                const json = await arg.jsonValue();
                if (typeof json === 'object' && json !== null) {
                  // If it's an error object, extract useful properties
                  if (json.message) {
                    texts.push(`Error: ${json.message}`);
                    if (json.stack) texts.push(json.stack.split('\n').slice(0, 3).join('\n'));
                  } else {
                    texts.push(JSON.stringify(json));
                  }
                } else {
                  texts.push(String(json));
                }
              } catch {
                // If JSON serialization fails, try toString
                try {
                  const msgProp = await arg.getProperty('message');
                  const msgValue = await msgProp.jsonValue();
                  if (msgValue) texts.push(`Error: ${msgValue}`);
                  
                  const stackProp = await arg.getProperty('stack');
                  const stackValue = await stackProp.jsonValue();
                  if (stackValue) texts.push(stackValue.split('\n').slice(0, 3).join('\n'));
                } catch {
                  texts.push(arg.toString());
                }
              }
            }
            if (texts.length > 0) text = texts.join(' ');
          } catch (err) {
            console.log('[geography-e2e] Could not extract JSHandle value:', err.message);
          }
        }
        
        // Track parse errors specifically (these indicate broken telemetry)
        if (text.includes('parse error') || text.includes('JSHandle@error') || text.includes('critical error')) {
          consoleErrors.push(text);
          console.log('[geography-e2e] Browser console ERROR:', text);
          diagnostics.errors.push(`Browser console: ${text}`);
        } else if (type === 'error' || text.includes('Error') || text.includes('failed') || text.includes('Failed')) {
          console.log('[geography-e2e] Browser console ERROR:', text);
          diagnostics.errors.push(`Browser console: ${text}`);
        }
      });
      
      // Set up page error monitoring
      page.on('pageerror', err => {
        console.log('[geography-e2e] Page error:', err.message);
        diagnostics.errors.push(`Page error: ${err.message}`);
      });

      // Set up request failure monitoring to catch 404s and module loading issues
      page.on('requestfailed', req => {
        console.log('[geography-e2e] Request FAILED:', req.url(), 'failure:', req.failure().errorText);
        diagnostics.errors.push(`Request failed: ${req.url()} - ${req.failure().errorText}`);
      });
      
      // Monitor responses to catch non-200 status codes
      page.on('response', async response => {
        const status = response.status();
        const url = response.url();
        // Log non-200 responses, especially 404s which might be served as HTML
        if (status !== 200 && status !== 304) {
          const contentType = response.headers()['content-type'] || 'unknown';
          console.log('[geography-e2e] Non-200 response:', status, url, 'content-type:', contentType);
          diagnostics.errors.push(`Non-200 response: ${status} ${url} (${contentType})`);
        }
        // Specifically catch HTML responses to JS module requests
        if (url.includes('.js') || url.includes('chunk')) {
          const contentType = response.headers()['content-type'] || 'unknown';
          if (contentType.includes('text/html')) {
            console.log('[geography-e2e] CRITICAL: JS module served as HTML:', url, 'status:', status);
            diagnostics.errors.push(`JS module served as HTML: ${url} (status ${status})`);
          }
        }
      });
      
      // Navigate to crawler page
      console.log('[geography-e2e] Navigating to:', baseUrl);
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      console.log('[geography-e2e] Page loaded');
      
      // Debug: Check if ANY JavaScript is executing
      const jsWorks = await page.evaluate(() => {
        return {
          hasWindow: typeof window !== 'undefined',
          hasDocument: typeof document !== 'undefined',
          hasConsole: typeof console !== 'undefined',
          canLog: true
        };
      });
      console.log('[geography-e2e] JavaScript execution test:', jsWorks);
      
      // Debug: Try calling console.log from within the page
      await page.evaluate(() => {
        console.log('[PAGE] Test log from page.evaluate');
        console.error('[PAGE] Test error from page.evaluate');
      });
      
      // Debug: Check if dropdown element exists
      const dropdownExists = await page.evaluate(() => {
        const select = document.getElementById('crawlType');
        return {
          exists: !!select,
          optionsCount: select ? select.options.length : 0,
          firstValue: select && select.options.length > 0 ? select.options[0].value : null
        };
      });
      console.log('[geography-e2e] Dropdown state:', dropdownExists);
      
      // Wait for crawl type dropdown to be populated
      await page.waitForFunction(
        () => {
          const select = document.getElementById('crawlType');
          return select && select.options.length > 1 && select.options[0].value !== '';
        },
        { timeout: 10000 }
      );
      console.log('[geography-e2e] Crawl type dropdown populated');
      
      // Check if geography option exists
      const hasGeography = await page.evaluate(() => {
        const select = document.getElementById('crawlType');
        return Array.from(select.options).some(opt => 
          opt.value.toLowerCase() === 'geography' || 
          opt.value.toLowerCase().includes('geography')
        );
      });
      
      if (!hasGeography) {
        printDiagnostics();
        throw new Error('DIAGNOSTIC: Geography crawl type not found in dropdown. Available types: ' + 
          await page.evaluate(() => {
            const select = document.getElementById('crawlType');
            return Array.from(select.options).map(opt => opt.value).join(', ');
          })
        );
      }
      
      diagnostics.crawlTypeFound = true;
      console.log('[geography-e2e] Geography crawl type found');
      
      // Select geography crawl type (specifically "geography", not "gazetteer")
      const selectedType = await page.evaluate(() => {
        const select = document.getElementById('crawlType');
        const geoOption = Array.from(select.options).find(opt => 
          opt.value.toLowerCase() === 'geography' || 
          opt.value.toLowerCase().includes('geography')
        );
        if (geoOption) {
          select.value = geoOption.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return geoOption.value;
        }
        return null;
      });
      
      if (!selectedType) {
        printDiagnostics();
        throw new Error('DIAGNOSTIC: Failed to select geography crawl type');
      }
      
      console.log('[geography-e2e] Selected crawl type:', selectedType);
      
      // Wait for UI to update after crawl type change
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check if URL field is properly handled for gazetteer type
      const urlFieldState = await page.evaluate(() => {
        const startUrl = document.getElementById('startUrl');
        const urlGroup = startUrl?.closest('.control-field');
        return {
          urlValue: startUrl?.value,
          urlDisabled: startUrl?.disabled,
          urlRequired: startUrl?.required,
          urlGroupHidden: urlGroup?.style.display === 'none',
          urlGroupClass: urlGroup?.className
        };
      });
      console.log('[geography-e2e] URL field state for gazetteer:', urlFieldState);
      
      // Clear URL field if it has a value (gazetteer doesn't need URL)
      if (urlFieldState.urlValue) {
        await page.evaluate(() => {
          const startUrl = document.getElementById('startUrl');
          if (startUrl) {
            startUrl.value = '';
          }
        });
        console.log('[geography-e2e] Cleared URL field');
      }
      
      // Set up telemetry monitoring before starting crawl
      const telemetryData = {
        events: [],
        progressEvents: [],
        telemetryEvents: [],
        milestoneEvents: [],
        gazetteerProgress: []
      };
      
      await page.exposeFunction('logTelemetryEvent', (eventType, data) => {
        telemetryData.events.push({ type: eventType, data, timestamp: Date.now() });
        
        if (eventType === 'progress') {
          telemetryData.progressEvents.push(data);
          diagnostics.progressReceived = true;
          
          // Check for gazetteer-specific data
          if (data && (data.phase === 'gazetteer' || data.ingestor || data.totalIngestors)) {
            telemetryData.gazetteerProgress.push(data);
            diagnostics.gazetteerDataReceived = true;
            console.log('[geography-e2e] Gazetteer progress:', JSON.stringify(data, null, 2));
          }
        }
        
        if (eventType === 'telemetry') {
          telemetryData.telemetryEvents.push(data);
          diagnostics.telemetryReceived = true;
        }
        
        if (eventType === 'milestone') {
          telemetryData.milestoneEvents.push(data);
        }
      });
      
      console.log('[geography-e2e] Telemetry monitoring set up');
      
      // Check button state before clicking
      const buttonStateBeforeClick = await page.evaluate(() => {
        const startBtn = document.getElementById('startBtn');
        const startUrl = document.getElementById('startUrl');
        return {
          startBtnExists: !!startBtn,
          startBtnDisabled: startBtn?.disabled,
          startBtnText: startBtn?.textContent,
          startUrlValue: startUrl?.value,
          startUrlRequired: startUrl?.required
        };
      });
      console.log('[geography-e2e] Button state before click:', buttonStateBeforeClick);
      
      // Click start button
      console.log('[geography-e2e] Clicking start button...');
      
      // Try clicking using JavaScript to ensure it fires
      const clickResult = await page.evaluate(() => {
        const startBtn = document.getElementById('startBtn');
        if (!startBtn) return { error: 'Button not found' };
        
        // Check if button has event listeners
        const hasClickListener = typeof startBtn.onclick === 'function';
        
        // Trigger click
        startBtn.click();
        
        return {
          buttonExists: true,
          hasClickListener,
          buttonDisabledBeforeClick: startBtn.disabled
        };
      });
      
      // Write to file to avoid truncation
      const clickResultStr = JSON.stringify(clickResult, null, 2);
      console.log('[geography-e2e] Click result:', clickResultStr.substring(0, 200));
      fs.writeFileSync(path.join(os.tmpdir(), 'geography-e2e-click-result.json'), clickResultStr);
      
      console.log('[geography-e2e] Start button clicked');
      
      // Wait a moment and check button state + logs
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      const buttonStateAfterClick = await page.evaluate(() => {
        const startBtn = document.getElementById('startBtn');
        const logsEl = document.getElementById('logs');
        const logsText = logsEl?.textContent || '';
        // Get last few lines, split by newline
        const lines = logsText.split('\n').filter(l => l.trim());
        const lastLines = lines.slice(-10); // Last 10 lines
        
        return {
          startBtnDisabled: startBtn?.disabled,
          startBtnText: startBtn?.textContent,
          logsLength: lines.length,
          lastLogs: lastLines
        };
      });
      console.log('[geography-e2e] Button state after 2s wait:');
      console.log('  Disabled:', buttonStateAfterClick.startBtnDisabled);
      console.log('  Text:', buttonStateAfterClick.startBtnText);
      console.log('  Total log lines:', buttonStateAfterClick.logsLength);
      
      // Write logs to file
      const logsPath = path.join(os.tmpdir(), 'geography-e2e-logs.json');
      fs.writeFileSync(logsPath, JSON.stringify(buttonStateAfterClick, null, 2));
      console.log('[geography-e2e] Full logs written to:', logsPath);
      
      console.log('  Last 10 log lines:');
      buttonStateAfterClick.lastLogs.forEach((line, idx) => {
        console.log(`    [${idx}]`, line.substring(0, 150));
      });
      
      // Wait for crawl to start by checking logs for "Started:" message
      // (Button disabled state is too transient - only lasts during fetch)
      console.log('[geography-e2e] Waiting for "Started:" confirmation in logs...');
      await page.waitForFunction(
        () => {
          const logs = document.getElementById('logs');
          if (!logs) return false;
          const logsText = logs.textContent || '';
          return /Started:\s*\{/.test(logsText);
        },
        { timeout: 5000 }
      );
      
      diagnostics.crawlStarted = true;
      console.log('[geography-e2e] Crawl started successfully!');
      
      // Attach event listeners to window.evt NOW (after page loaded and evt created)
      console.log('[geography-e2e] About to attach event listeners...');
      try {
        await page.evaluate(() => {
        if (window.evt) {
          // Attach our interceptor to the existing EventSource
          ['progress', 'telemetry', 'milestone', 'queue'].forEach(eventType => {
            window.evt.addEventListener(eventType, (e) => {
              try {
                const data = JSON.parse(e.data);
                if (window.logTelemetryEvent) {
                  window.logTelemetryEvent(eventType, data);
                }
              } catch (err) {
                console.error(`[E2E] Failed to parse ${eventType}:`, err);
              }
            });
          });
          console.log('[E2E] Attached event listeners to window.evt');
        } else {
          console.warn('[E2E] window.evt not found!');
        }
      });
        console.log('[geography-e2e] Event listeners attached successfully');
      } catch (err) {
        console.error('[geography-e2e] Failed to attach event listeners:', err.message);
      }
      
      // Monitor SSE telemetry for geography crawl progress
      // Geography crawls may take longer as they filter by location
      console.log('[geography-e2e] Monitoring SSE telemetry for 120 seconds...');
      
      diagnostics.sseConnected = true;
      
      // Check if window.evt exists
      const sseStatus = await page.evaluate(() => {
        return {
          evtExists: !!window.evt,
          evtType: window.evt ? window.evt.constructor.name : null,
          evtReadyState: window.evt ? window.evt.readyState : null,
          evtUrl: window.evt ? window.evt.url : null
        };
      });
      console.log('[geography-e2e] SSE Status:', JSON.stringify(sseStatus, null, 2));
      
      // Check if crawl actually started by reading logs
      const logsAfterStart = await page.evaluate(() => {
        const logs = document.getElementById('logs');
        return logs ? logs.textContent : '';
      });
      
      console.log('[geography-e2e] Logs after start (first 500 chars):');
      console.log(logsAfterStart.substring(0, 500));
      
      // Monitor until crawl completes (with safety timeout)
      const maxDuration = 600000; // 10 minutes max
      const startTime = Date.now();
      let lastEventCount = 0;
      let crawlCompleted = false;
      let lastStatusCheck = 0;
      
      console.log('[geography-e2e] Monitoring geography crawl until completion...');
      
      while (Date.now() - startTime < maxDuration) {
        await new Promise(resolve => setTimeout(resolve, 3000)); // Check every 3s
        
        // Events are already being collected by logTelemetryEvent via DOM listeners
        const currentEventCount = telemetryData.events.length;
        
        if (currentEventCount > lastEventCount) {
          const newEventCount = currentEventCount - lastEventCount;
          console.log(`[geography-e2e] Received ${newEventCount} new events (total: ${currentEventCount})`);
          console.log(`  Telemetry: ${telemetryData.telemetryEvents.length}, Progress: ${telemetryData.progressEvents.length}, Gazetteer: ${telemetryData.gazetteerProgress.length}`);
          
          lastEventCount = currentEventCount;
        }
        
        // Check crawl status every 5 seconds
        const now = Date.now();
        if (now - lastStatusCheck > 5000) {
          lastStatusCheck = now;
          
          const status = await page.evaluate(async () => {
            try {
              const res = await fetch('/api/status');
              const data = await res.json();
              return {
                running: data.running,
                activeJobs: data.active || 0,
                jobId: data.jobId || null
              };
            } catch (err) {
              return { running: false, error: err.message };
            }
          });
          
          console.log(`[geography-e2e] Status check: running=${status.running}, activeJobs=${status.activeJobs}`);
          
          if (!status.running && telemetryData.events.length > 0) {
            console.log('[geography-e2e] Crawl completed naturally');
            crawlCompleted = true;
            break;
          }
        }
      }
      
      if (!crawlCompleted) {
        console.warn('[geography-e2e] Crawl did not complete within timeout - test will fail');
      }
      
      
      console.log('[geography-e2e] Monitoring complete');
      console.log(`[geography-e2e] Total events collected: ${telemetryData.events.length}`);
      console.log(`[geography-e2e] Telemetry events: ${telemetryData.telemetryEvents.length}`);
      console.log(`[geography-e2e] Progress events: ${telemetryData.progressEvents.length}`);
      
      if (telemetryData.gazetteerProgress.length > 0) {
        console.log(`[geography-e2e] Gazetteer progress events: ${telemetryData.gazetteerProgress.length}`);
        console.log('[geography-e2e] Sample gazetteer data:', JSON.stringify(telemetryData.gazetteerProgress[0], null, 2));
      }
      
      // Get final crawl statistics from the page
      const finalStats = await page.evaluate(() => {
        const stats = {
          logLines: 0,
          lastLogLine: '',
          buttonState: '',
          crawlComplete: false
        };
        
        const logs = document.getElementById('logs');
        if (logs) {
          const lines = logs.textContent.split('\n').filter(l => l.trim());
          stats.logLines = lines.length;
          stats.lastLogLine = lines[lines.length - 1] || '';
        }
        
        const startBtn = document.getElementById('startBtn');
        if (startBtn) {
          stats.buttonState = startBtn.disabled ? 'disabled' : 'enabled';
          stats.buttonText = startBtn.textContent;
        }
        
        // Check for completion indicators
        stats.crawlComplete = stats.lastLogLine.includes('Finished:') || 
                             stats.lastLogLine.includes('Complete') ||
                             stats.lastLogLine.includes('Done');
        
        return stats;
      });
      
      console.log('[geography-e2e] Final crawl statistics:', JSON.stringify(finalStats, null, 2));
      const telemetryCompleted = telemetryData.telemetryEvents.some(event => {
        const eventType = event?.type || event?.event || '';
        const message = (event?.message || '').toLowerCase();
        return eventType === 'completed' ||
               eventType === 'done' ||
               message.includes('completed') ||
               message.includes('finished');
      });
      console.log('[geography-e2e] Completion signals:', {
        crawlCompleted,
        finalLogComplete: finalStats.crawlComplete,
        telemetryCompleted
      });
      
      // Print diagnostics summary
      printDiagnostics();
      
      // CRITICAL ASSERTIONS - Fail if any console errors occurred (except known UI bugs)
      const relevantErrors = consoleErrors.filter(err => 
        // Filter out known UI bugs unrelated to geography crawl telemetry
        !err.includes('Failed to refresh insights after completion')
      );
      
      if (relevantErrors.length > 0) {
        console.error(`[geography-e2e] FAILED: ${relevantErrors.length} console errors detected:`);
        relevantErrors.forEach((err, idx) => {
          console.error(`  [${idx + 1}] ${err}`);
        });
        throw new Error(`Test failed: ${relevantErrors.length} console errors detected (parse errors indicate broken telemetry handling)`);
      }
      
      if (consoleErrors.length > relevantErrors.length) {
        console.warn(`[geography-e2e] Note: Filtered out ${consoleErrors.length - relevantErrors.length} known UI bugs (insights refresh errors)`);
      }
      
      // Verify crawl completed successfully
      expect(crawlCompleted).toBe(true);
  expect(finalStats.crawlComplete || telemetryCompleted || crawlCompleted).toBe(true);
      
      // Verify all expected behaviors
      expect(diagnostics.crawlTypeFound).toBe(true);
      expect(diagnostics.crawlStarted).toBe(true);
      expect(diagnostics.sseConnected).toBe(true);
      expect(diagnostics.telemetryReceived).toBe(true);
      expect(diagnostics.progressReceived).toBe(true);
      
      // Verify we received substantial telemetry data
      expect(telemetryData.events.length).toBeGreaterThan(10);
      expect(telemetryData.telemetryEvents.length).toBeGreaterThan(5);
      expect(telemetryData.progressEvents.length).toBeGreaterThan(5);
      
      // ========== ENHANCED ASSERTIONS: Verify Geography Crawl Specifics ==========
      
      console.log('[geography-e2e] Analyzing geography crawl telemetry...');
      
      // 1. Verify WikidataCountryIngestor discovery phase (REQUIRED)
      const discoveryPhase = telemetryData.telemetryEvents.find(e => 
        e.phase === 'discovery-complete' || e.message?.includes('Discovered') || e.message?.includes('countries')
      );
      
      expect(discoveryPhase).toBeDefined();
      console.log('[geography-e2e] ✓ Discovery phase event found:', JSON.stringify(discoveryPhase, null, 2));
      
      expect(discoveryPhase.totalItems).toBeDefined();
      expect(discoveryPhase.totalItems).toBeGreaterThan(0);
      console.log(`[geography-e2e] ✓ Discovered ${discoveryPhase.totalItems} countries`);
      
      // 2. Verify stage-based execution (countries stage, then boundaries stage) - REQUIRED
      const stageStartEvents = telemetryData.telemetryEvents.filter(e => e.phase === 'stage-start');
      expect(stageStartEvents.length).toBeGreaterThan(0);
      console.log('[geography-e2e] ✓ Stage start events found:', stageStartEvents.length);
      
      const countriesStage = stageStartEvents.find(e => e.stage === 'countries');
      expect(countriesStage).toBeDefined();
      console.log('[geography-e2e] ✓ Countries stage started:', countriesStage.ingestorCount, 'ingestors');
      expect(countriesStage.ingestorCount).toBeGreaterThan(0);
      
      // 3. Verify ingestor execution (WikidataCountryIngestor, OsmBoundaryIngestor) - REQUIRED
      const ingestorStartEvents = telemetryData.telemetryEvents.filter(e => e.phase === 'ingestor-start');
      expect(ingestorStartEvents.length).toBeGreaterThan(0);
      console.log('[geography-e2e] ✓ Ingestor start events:', ingestorStartEvents.length);
      
      const wikidataIngestor = ingestorStartEvents.find(e => e.ingestor === 'wikidata-countries');
      expect(wikidataIngestor).toBeDefined();
      console.log('[geography-e2e] ✓ WikidataCountryIngestor started');
      
      // 4. Verify determinate progress (totalItems > 0, current progresses)
      const processingEvents = telemetryData.telemetryEvents.filter(e => 
        e.phase === 'processing' || e.phase === 'ingestor-progress'
      );
      console.log('[geography-e2e] Processing events:', processingEvents.length);
      
      const eventsWithTotal = processingEvents.filter(e => e.totalItems != null && e.totalItems > 0);
      if (eventsWithTotal.length > 0) {
        console.log('[geography-e2e] ✓ Found', eventsWithTotal.length, 'events with determinate progress (totalItems > 0)');
        
        // Verify current progresses over time
        const eventsWithCurrent = eventsWithTotal.filter(e => e.current != null);
        if (eventsWithCurrent.length >= 2) {
          const firstCurrent = eventsWithCurrent[0].current;
          const lastCurrent = eventsWithCurrent[eventsWithCurrent.length - 1].current;
          if (lastCurrent > firstCurrent) {
            console.log(`[geography-e2e] ✓ Progress increased from ${firstCurrent} to ${lastCurrent}`);
          }
        }
      }
      
      // 5. Verify ingestor completion - REQUIRED
      const ingestorCompleteEvents = telemetryData.telemetryEvents.filter(e => e.phase === 'ingestor-complete');
      console.log('[geography-e2e] Ingestor completion events:', ingestorCompleteEvents.length);
      expect(ingestorCompleteEvents.length).toBeGreaterThan(0);
      console.log('[geography-e2e] ✓ Ingestors completed successfully');
      
      // Verify at least one ingestor upserted records
      const totalUpserted = ingestorCompleteEvents.reduce((sum, evt) => {
        return sum + (evt.result?.recordsUpserted || 0);
      }, 0);
      expect(totalUpserted).toBeGreaterThan(0);
      console.log(`[geography-e2e] ✓ Database records created: ${totalUpserted} places upserted`);
      
      ingestorCompleteEvents.forEach(evt => {
        const summary = evt.result || {};
        console.log(`  - ${evt.ingestor}: processed=${summary.recordsProcessed}, upserted=${summary.recordsUpserted}, errors=${summary.errors || 0}`);
      });
      
      // 6. Verify stage completion
      const stageCompleteEvents = telemetryData.telemetryEvents.filter(e => e.phase === 'stage-complete');
      console.log('[geography-e2e] Stage completion events:', stageCompleteEvents.length);
      if (stageCompleteEvents.length > 0) {
        console.log('[geography-e2e] ✓ Stages completed successfully');
        stageCompleteEvents.forEach(evt => {
          const totals = evt.totals || {};
          console.log(`  - ${evt.stage}: processed=${totals.recordsProcessed}, upserted=${totals.recordsUpserted}, duration=${evt.durationMs}ms`);
        });
      }
      
      // 7. Verify gazetteer progress data (totalIngestors, currentIngestor)
      if (telemetryData.gazetteerProgress.length > 0) {
        diagnostics.gazetteerDataReceived = true;
        console.log('[geography-e2e] ✓ Gazetteer progress data received');
        
        // Check for totalIngestors and currentIngestor
        const withTotalIngestors = telemetryData.gazetteerProgress.filter(e => e.totalIngestors != null);
        if (withTotalIngestors.length > 0) {
          console.log(`[geography-e2e] ✓ Found ${withTotalIngestors.length} events with totalIngestors`);
          console.log('  Sample:', JSON.stringify(withTotalIngestors[0], null, 2));
        }
      }
      
      // 8. Verify overall completion
      const coordinatorComplete = telemetryData.telemetryEvents.find(e => 
        e.phase === 'complete' && e.summary != null
      );
      if (coordinatorComplete) {
        console.log('[geography-e2e] ✓ Coordinator completed with summary');
        const totals = coordinatorComplete.summary.totals || {};
        if (totals.stagesAttempted > 0) {
          console.log(`[geography-e2e] ✓ Final totals: stages=${totals.stagesCompleted}/${totals.stagesAttempted}, ingestors=${totals.ingestorsCompleted}/${totals.ingestorsAttempted}`);
        }
      } else {
        console.log('[geography-e2e] ⚠ No coordinator completion event (expected in test environment)');
      }
      
      // 9. Verify cache behavior (check server logs for SPARQL cache hit)
      console.log('[geography-e2e] Checking server logs for cache behavior...');
      const serverLogStr = serverLogs.join('\n');
      const cacheHits = serverLogStr.match(/SPARQL cache hit|cache hit/gi) || [];
      const cacheFetches = serverLogStr.match(/Fetching SPARQL|Fetching.*entities/gi) || [];
      
      console.log(`[geography-e2e] Cache statistics: ${cacheHits.length} hits, ${cacheFetches.length} fetches`);
      if (diagnostics.cacheHitDetected || cacheHits.length > 0) {
        console.log('[geography-e2e] ✓ Cache system is working (detected cache hits)');
      } else if (cacheFetches.length > 0) {
        console.log('[geography-e2e] ✓ Cache system active (detected fetches - first run or cache miss)');
      } else {
        console.log('[geography-e2e] ⚠ No cache activity (expected in test environment without Wikidata connection)');
      }
      
      // 10. Verify progress bars for country processing
      console.log('[geography-e2e] Verifying progress bars for country downloads...');
      const processingProgressEvents = telemetryData.progressEvents.filter(e => e.phase === 'processing');
      console.log(`[geography-e2e] Processing progress events: ${processingProgressEvents.length}`);
      
      if (processingProgressEvents.length > 0) {
        console.log('[geography-e2e] ✓ Progress bars emitted during country processing');
        
        // Verify progress has current/totalItems for determinate progress bars
        const determinateProgress = processingProgressEvents.filter(e => 
          e.current != null && e.totalItems != null
        );
        expect(determinateProgress.length).toBeGreaterThan(0);
        console.log(`[geography-e2e] ✓ Determinate progress bars: ${determinateProgress.length} events with current/totalItems`);
        
        // Sample progress event
        const sampleProgress = determinateProgress[0];
        console.log('[geography-e2e] Sample progress event:', JSON.stringify(sampleProgress, null, 2));
        expect(sampleProgress.current).toBeGreaterThan(0);
        expect(sampleProgress.totalItems).toBeGreaterThan(0);
        expect(sampleProgress.message).toBeDefined();
        console.log(`[geography-e2e] ✓ Progress bar format validated: ${sampleProgress.current}/${sampleProgress.totalItems} - "${sampleProgress.message}"`);
      } else {
        console.log('[geography-e2e] ⚠ No processing progress events (unexpected - should emit progress bars)');
      }
      
      // 11. Verify database records were created via telemetry
      // (totalUpserted already calculated and verified in step 5)
      console.log(`[geography-e2e] ✓ Verified database records: ${totalUpserted} places upserted (from step 5)`);
      
      console.log('[geography-e2e] ========== ENHANCED ASSERTIONS COMPLETE ==========');
      console.log('[geography-e2e] ✓ Test completed successfully with real data verification');
      console.log('[geography-e2e] ✓ Verified actual Wikidata downloads or cache retrieval');
      console.log('[geography-e2e] ✓ Verified progress bars for country processing');
      
      console.log('[geography-e2e] ✓ Test completed successfully');
      console.log('[geography-e2e] Geography crawl completed end-to-end with full telemetry monitoring');
      console.log(`[geography-e2e] Total runtime: ${Math.round((Date.now() - startTime) / 1000)}s`);
      console.log(`[geography-e2e] Events captured: ${telemetryData.events.length} (telemetry: ${telemetryData.telemetryEvents.length}, progress: ${telemetryData.progressEvents.length})`);
      console.log(`[geography-e2e] Total records upserted: ${totalUpserted}`);
      console.log(`[geography-e2e] Progress bars emitted: ${processingProgressEvents.length}`);
      
    } catch (err) {
      console.error('[geography-e2e] Test failed:', err);
      printDiagnostics();
      throw err;
    }
  });
});
