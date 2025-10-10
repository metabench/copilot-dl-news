/**
 * @fileoverview BASIC E2E test for geography crawl type (FAST tests)
 * Tests the complete flow: UI → API → Crawler initialization
 * 
 * ✅ Run in normal test suite (quick smoke tests)
 * For comprehensive testing, see: geography.full.e2e.test.js
 * 
 * This test verifies:
 * 1. Geography crawl type can be started from the UI
 * 2. Server accepts geography crawl requests
 * 3. Crawler initializes without hanging
 * 4. SSE events stream startup progress
 * 5. Startup stages complete successfully (but doesn't wait for full completion)
 * 
 * Concurrency Parameter:
 * - Tests use concurrency=1 for predictability
 * - Concurrency is stored as MAXIMUM allowed, not a requirement
 * - Current implementation processes sequentially (stage by stage)
 * - Future optimizations may utilize parallelism within the maximum
 * - See docs/SPECIALIZED_CRAWL_CONCURRENCY.md for design details
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const { createApp } = require('../server.js');
const fs = require('fs');
const path = require('path');
const os = require('os');

function createTempDb() {
  const tmpDir = path.join(os.tmpdir(), 'geography-e2e-test');
  fs.mkdirSync(tmpDir, { recursive: true });
  const unique = `${process.pid}-${Date.now()}-${Math.random()}`;
  return path.join(tmpDir, `test-${unique}.db`);
}

/**
 * Collect SSE events until predicate or timeout
 */
function collectSseEvents(baseUrl, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const events = [];
    let buffer = '';
    const startTime = Date.now();
    
    const url = new URL('/events?logs=1', baseUrl);
    
    fetch(url.toString())
      .then(response => {
        if (!response.ok) {
          reject(new Error(`SSE connection failed: ${response.status}`));
          return;
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        const timeout = setTimeout(() => {
          reader.cancel();
          resolve({ events, buffer, timedOut: true });
        }, timeoutMs);
        
        function read() {
          reader.read()
            .then(({ done, value }) => {
              if (done) {
                clearTimeout(timeout);
                resolve({ events, buffer, timedOut: false });
                return;
              }
              
              buffer += decoder.decode(value, { stream: true });
              
              // Parse SSE events from buffer
              const lines = buffer.split('\n');
              buffer = lines.pop() || ''; // Keep incomplete line
              
              let currentEvent = {};
              for (const line of lines) {
                if (line.startsWith('event:')) {
                  currentEvent.type = line.substring(6).trim();
                } else if (line.startsWith('data:')) {
                  const dataStr = line.substring(5).trim();
                  try {
                    currentEvent.data = JSON.parse(dataStr);
                  } catch {
                    currentEvent.data = dataStr;
                  }
                } else if (line === '') {
                  // Empty line marks end of event
                  if (currentEvent.type) {
                    events.push({ ...currentEvent });
                  }
                  currentEvent = {};
                }
              }
              
              // Check for startup completion
              const hasStartupComplete = events.some(e => 
                e.type === 'milestone' && 
                e.data?.kind === 'startup-complete'
              );
              
              if (hasStartupComplete) {
                clearTimeout(timeout);
                reader.cancel();
                resolve({ events, buffer, timedOut: false });
                return;
              }
              
              read();
            })
            .catch(err => {
              clearTimeout(timeout);
              reject(err);
            });
        }
        
        read();
      })
      .catch(reject);
  });
}

describe('Geography Crawl E2E', () => {
  let app, server, baseUrl;
  let dbPath;

  beforeEach(async () => {
    dbPath = createTempDb();
    app = createApp({ dbPath, verbose: true });
    
    await new Promise((resolve, reject) => {
      server = app.listen(0, 'localhost', (err) => {
        if (err) return reject(err);
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        console.log(`[TEST] Server listening on ${baseUrl}`);
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    
    // Clean up WAL files
    const suffixes = ['', '-shm', '-wal'];
    for (const suffix of suffixes) {
      try { 
        fs.unlinkSync(dbPath + suffix); 
      } catch (_) {}
    }
  });

  test('server responds to /api/crawl-types with geography option', async () => {
    const response = await fetch(`${baseUrl}/api/crawl-types`);
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.items).toBeDefined();
    expect(Array.isArray(data.items)).toBe(true);
    
    const geographyType = data.items.find(t => t.name === 'geography');
    expect(geographyType).toBeDefined();
    expect(geographyType.description).toContain('gazetteer');
  });

  test('POST /api/crawl accepts geography crawl type', async () => {
    const response = await fetch(`${baseUrl}/api/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        crawlType: 'geography',
        maxPages: 10,
        concurrency: 1,
        depth: 1
      })
    });
    
    expect(response.status).toBe(202);
    
    const data = await response.json();
    expect(data.jobId).toBeDefined();
    expect(data.message).toMatch(/started|queued/i);
  });

  test('geography crawl streams startup stages via SSE', async () => {
    // Start SSE collection before starting crawl
    const ssePromise = collectSseEvents(baseUrl, 15000);
    
    // Small delay to ensure SSE connection is established
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Start geography crawl
    const startResponse = await fetch(`${baseUrl}/api/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        crawlType: 'geography',
        maxPages: 5,
        concurrency: 1,
        depth: 1
      })
    });
    
    expect(startResponse.status).toBe(202);
    
    // Wait for SSE events
    const { events, timedOut } = await ssePromise;
    
    // Should not time out
    expect(timedOut).toBe(false);
    
    // Should have received events
    expect(events.length).toBeGreaterThan(0);
    
    // Check for startup stages
    const startupStages = events.filter(e => 
      e.type === 'startup-stage' || 
      (e.type === 'milestone' && e.data?.kind?.includes('startup'))
    );
    
    expect(startupStages.length).toBeGreaterThan(0);
    
    // Should see "Preparing data directory" stage
    const prepareDataStage = events.find(e => 
      e.data?.stage === 'prepare-data' ||
      e.data?.message?.includes('Preparing data directory')
    );
    expect(prepareDataStage).toBeDefined();
    
    // Should eventually see startup complete or transition to running
    const hasCompletion = events.some(e => 
      e.type === 'milestone' && 
      (e.data?.kind === 'startup-complete' || e.data?.kind === 'crawl-started')
    );
    
    // Log events for debugging if test fails
    if (!hasCompletion) {
      console.log('\n[TEST DEBUG] SSE Events received:');
      events.forEach((e, i) => {
        console.log(`  ${i + 1}. ${e.type}:`, JSON.stringify(e.data).substring(0, 100));
      });
    }
    
    expect(hasCompletion).toBe(true);
  }, 20000);

  test('geography crawl does NOT require startUrl', async () => {
    const response = await fetch(`${baseUrl}/api/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        crawlType: 'geography',
        maxPages: 5,
        concurrency: 1
        // No startUrl provided - should be fine for geography
      })
    });
    
    expect(response.status).toBe(202);
    const data = await response.json();
    expect(data.jobId).toBeDefined();
  });

  test('geography crawl initialization does not hang', async () => {
    const startTime = Date.now();
    
    console.log('[TEST] Starting geography crawl...');
    const response = await fetch(`${baseUrl}/api/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        crawlType: 'geography',
        maxPages: 3,
        concurrency: 1
      })
    });
    
    const responseTime = Date.now() - startTime;
    const responseData = await response.json();
    console.log('[TEST] Crawl start response:', responseData);
    
    // Response should come back quickly (< 2 seconds)
    expect(responseTime).toBeLessThan(2000);
    expect(response.status).toBe(202);
    
    // Wait for async process start (setTimeout in CrawlOrchestrationService)
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Give crawler time to initialize (wait longer)
    console.log('[TEST] Waiting 10s for crawl to initialize...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Check status - should be running or completed, not stuck
    const statusResponse = await fetch(`${baseUrl}/api/status`);
    expect(statusResponse.status).toBe(200);
    
    const status = await statusResponse.json();
    
    // Log status for debugging
    console.log('[TEST DEBUG] Status after 10s:', {
      running: status.running,
      stage: status.stage,
      visited: status.visited,
      errors: status.errors,
      allJobs: status.jobs || 'N/A',
      lastExit: status.lastExit || 'N/A'
    });
    
    // Geography crawls may complete quickly with small maxPages
    // Accept either: still running, or completed with visited > 0, or have errors reported
    const isValidState = status.running === true || 
                        status.visited > 0 || 
                        status.errors > 0 ||
                        status.stage === 'done';
    
    if (!isValidState) {
      // Try to get logs to understand what happened
      const logsResponse = await fetch(`${baseUrl}/api/logs?limit=50`);
      if (logsResponse.ok) {
        const logs = await logsResponse.json();
        console.log('[TEST DEBUG] Recent logs:', logs);
      }
    }
    
    expect(isValidState).toBe(true);
  }, 20000);

  test('geography crawl includes gazetteer-specific telemetry', async () => {
    const ssePromise = collectSseEvents(baseUrl, 15000);
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const startResponse = await fetch(`${baseUrl}/api/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        crawlType: 'geography',
        maxPages: 5,
        concurrency: 1
      })
    });
    
    expect(startResponse.status).toBe(202);
    
    const { events } = await ssePromise;
    
    // Should have gazetteer-related events
    const gazetteerEvents = events.filter(e => 
      JSON.stringify(e.data).toLowerCase().includes('gazetteer') ||
      JSON.stringify(e.data).toLowerCase().includes('geography')
    );
    
    expect(gazetteerEvents.length).toBeGreaterThan(0);
  }, 15000);
});
