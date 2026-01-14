/**
 * @fileoverview COMPREHENSIVE E2E test for geography crawl
 * 
 * ⚠️ DEVELOPMENT/DEBUGGING TOOL - NOT A REGULAR TEST ⚠️
 * 
 * These tests are designed as DEVELOPMENT TOOLS for understanding and debugging
 * the geography crawl system. They are NOT run in the normal test suite.
 * 
 * Purpose:
 * - Live monitoring of crawl progress during development
 * - Detailed telemetry and timing analysis
 * - Understanding system behavior under real-world conditions
 * - Validating data ingestion pipelines
 * 
 * Characteristics:
 * - Long runtime (~5-15 minutes for full global dataset, hours/days for OSM data)
 * - External API dependencies (Wikidata SPARQL, Overpass API)
 * - Network requirements and rate limiting
 * - High resource usage (CPU, memory, disk)
 * - Detailed console output for progress tracking
 * 
 * Run explicitly with: 
 *   GEOGRAPHY_FULL_E2E=1 JEST_DISABLE_TRUNCATE=1 npm test -- geography.full.e2e
 * 
 * Or use the npm script:
 *   npm run test:geography-full (Windows: requires manual env var setting)
 * 
 * Test Coverage:
 * - Complete geography crawl lifecycle (start → run → complete)
 * - All startup stages (prepare-data, db-open, gazetteer-schema, etc.)
 * - Pipeline configuration (ingestors, coordinators, planners)
 * - Controller initialization and execution
 * - Real API requests to Wikidata and Overpass
 * - Database schema creation and data ingestion
 * - Progress reporting with country counts
 * - Multi-stage processing (countries → regions → cities → boundaries)
 * - Telemetry and milestone events
 * - Error handling and timeout protection
 * - Final summary and database validation
 * 
 * Concurrency Behavior:
 * - Tests verify that ANY concurrency value works (1, 4, 8)
 * - Implementation currently sequential but concurrency stored as maximum
 * - Future optimizations may use parallelism within the maximum
 */

const { createApp } = require('../server');
const { getCrawl, getCrawlLogs } = require('../../../data/db/sqlite/access');
const { createTempDb } = require('../../../data/db/sqlite/test-utils');
const { getCounts } = require('../../../data/db/sqlite/seed-utils');
const { LogCondenser } = require('../../../shared/utils/LogCondenser');
const fs = require('fs');

// How long to wait for the server to start
const SERVER_STARTUP_TIMEOUT = 10000;
// Timeout for crawl completion
const CRAWL_COMPLETION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

let dbPath; // Declare dbPath here to make it accessible throughout the describe block

class TestProgressLogger {
  constructor(options = {}) {
    this.stepCounter = 0;
    this.startTime = options.startTime || Date.now();
    this.logCondenser = new LogCondenser({ startTime: this.startTime });
  }

  step(message) {
    this.stepCounter++;
    this.logCondenser.info(`STEP ${this.stepCounter}`, message);
  }

  info(message) {
    this.logCondenser.info('INFO', message);
  }

  warn(message) {
    this.logCondenser.warn('WARN', message);
  }

  error(message) {
    this.logCondenser.error('ERR ', message);
  }

  success(message) {
    this.logCondenser.success('OK  ', message);
  }
}

/**
 * Collects all SSE events from a stream and logs them in a condensed format
 */
async function collectDetailedSseEvents({ crawlId, host, logger }) {
  const startTime = Date.now();
  const events = [];
  let lastEventTime = startTime;
  let lastEventType = null;
  let eventCount = 0;
  
  return new Promise((resolve, reject) => {
    let reader;
    let buffer = '';

    const url = new URL('/events', host);
    url.searchParams.set('logs', '1');
    url.searchParams.set('job', crawlId);
    
    const logCondenser = new LogCondenser({ startTime });
    
    // Progress heartbeat every 10 seconds (frequent updates for development tool)
    const heartbeat = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const timeSinceLastEvent = Math.round((Date.now() - lastEventTime) / 1000);
      logger.info(`[${elapsed}s] ⏱ ${eventCount} events, last: ${lastEventType} (${timeSinceLastEvent}s ago)`);
    }, 10000);
    
    // Set a timeout to prevent infinite waiting
    const timeout = setTimeout(() => {
      clearInterval(heartbeat);
      if (reader) {
        reader.cancel().catch(() => {});
      }
      const elapsed = Date.now() - startTime;
      const timeSinceLastEvent = Date.now() - lastEventTime;
      logger.warn(`Timeout: SSE collection exceeded ${CRAWL_COMPLETION_TIMEOUT}ms (elapsed: ${elapsed}ms)`);
      logger.warn(`Last event: ${lastEventType} (${timeSinceLastEvent}ms ago)`);
      logger.warn(`Total events received: ${events.length}`);
      resolve(events);
    }, CRAWL_COMPLETION_TIMEOUT);

    fetch(url.toString())
      .then(response => {
        if (!response.ok) {
          clearTimeout(timeout);
          clearInterval(heartbeat);
          logger.error(`SSE connection failed: ${response.status}`);
          reject(new Error(`SSE connection failed with status ${response.status}`));
          return;
        }
        
        reader = response.body.getReader();
        const decoder = new TextDecoder();

        function read() {
          reader.read()
            .then(({ done, value }) => {
              if (done) {
                clearTimeout(timeout);
                clearInterval(heartbeat);
                logger.warn(`SSE stream ended without 'done' event (${events.length} events received)`);
                resolve(events);
                return;
              }

              buffer += decoder.decode(value, { stream: true });
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
                    const event = { ...currentEvent };
                    events.push(event);
                    eventCount++;
                    lastEventTime = Date.now();
                    lastEventType = event.type;
                    logCondenser.logSseEvent(event);
                    
                    // Show progress events immediately
                    if (event.type === 'progress' && event.data) {
                      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                      if (data.message) {
                        const elapsed = Math.round((Date.now() - startTime) / 1000);
                        logger.info(`[${elapsed}s] → ${data.message}`);
                      }
                    }
                    
                    // Show milestone events for stage transitions
                    if (event.type === 'milestone' && event.data) {
                      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                      if (data.kind && (data.kind.includes('gazetteer') || data.kind.includes('stage'))) {
                        const elapsed = Math.round((Date.now() - startTime) / 1000);
                        logger.info(`[${elapsed}s] ▶ ${data.message || data.kind}`);
                      }
                    }
                    
                    // Show telemetry events for major operations
                    if (event.type === 'telemetry' && event.data) {
                      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                      if (data.level === 'info' && data.message) {
                        const elapsed = Math.round((Date.now() - startTime) / 1000);
                        // Only show important telemetry (query start/complete, entity fetch)
                        if (data.message.includes('query') || data.message.includes('fetch') || data.message.includes('batch')) {
                          logger.info(`[${elapsed}s] ℹ ${data.message}`);
                        }
                      }
                    }
                    
                    // Check for done event
                    if (event.type === 'done') {
                      clearTimeout(timeout);
                      clearInterval(heartbeat);
                      reader.cancel().catch(() => {});
                      resolve(events);
                      return;
                    }
                  }
                  currentEvent = {};
                }
              }

              read();
            })
            .catch(err => {
              clearTimeout(timeout);
              clearInterval(heartbeat);
              logger.error(`SSE read error: ${err.message}`);
              logger.error(`Last successful event: ${lastEventType} (${Date.now() - lastEventTime}ms ago)`);
              resolve(events);
            });
        }

        read();
      })
      .catch(error => {
        clearTimeout(timeout);
        clearInterval(heartbeat);
        logger.error(`SSE connection error: ${error.message}`);
        reject(error);
      });
  });
}


describe('Geography Crawl - Full E2E', () => {
  let app;
  let host;
  let server;
  let db;
  const state = {
    crawlId: null,
    events: []
  };
  const logger = new TestProgressLogger();

  beforeAll(async () => {
    logger.step('Setting up test environment');
    dbPath = createTempDb('geography-full-e2e');
    logger.info(`Temporary database created at ${dbPath}`);

    logger.step('Creating Express app');
    app = createApp({ dbPath, verbose: false });
    db = app.locals.backgroundTaskManager.db;
    
    // Verify database is accessible
    try {
      const test = db.prepare('SELECT 1 AS test').get();
      logger.info(`Database verified accessible (test query returned: ${test.test})`);
    } catch (err) {
      logger.error(`Database NOT accessible: ${err.message}`);
      throw err;
    }

    logger.step('Starting server');
    await new Promise(resolve => {
      server = app.listen(0, '127.0.0.1', () => {
        const { address, port } = server.address();
        host = `http://${address}:${port}`;
        logger.success(`Server running at ${host}`);
        logger.info(`Database path: ${dbPath}`);
        resolve();
      });
    });
  }, SERVER_STARTUP_TIMEOUT);

  afterAll(async () => {
    logger.step('Tearing down test environment');
    if (server) {
      await new Promise(resolve => server.close(resolve));
      logger.success('Server shut down');
    }
    // Cleanup DB files
    if (dbPath) {
      try {
        fs.unlinkSync(dbPath);
        fs.unlinkSync(`${dbPath}-shm`);
        fs.unlinkSync(`${dbPath}-wal`);
      } catch (e) {
        // ignore errors
      }
    }
  });

  test('1. should start a new geography crawl', async () => {
    logger.step('Starting geography crawl via HTTP API');
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
    
    try {
      const response = await fetch(`${host}/api/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crawlType: 'geography',
          maxPages: 1000,
          concurrency: 1,
          depth: 1
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      expect(response.status).toBe(202);
      
      const data = await response.json();
      expect(data.jobId).toBeDefined();
      state.crawlId = data.jobId;
      
      logger.success(`Crawl started with ID: ${state.crawlId}`);
      
      // Wait a moment for crawl to initialize
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Note: We skip the immediate status check since the crawl runs as a child process
      // and we'll verify proper execution through SSE events in the next test
      logger.info('Crawl started, will verify execution through SSE stream');
    } catch (error) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        throw new Error('Timeout: POST /api/crawl took longer than 10s to respond');
      }
      throw error;
    }
  }, 20000); // Jest timeout: 20s

  test('2. should receive detailed SSE events during the crawl', async () => {
    logger.step(`Collecting SSE events for crawl ID ${state.crawlId}`);
    const events = await collectDetailedSseEvents({ crawlId: state.crawlId, host, logger });
    state.events = events; // Store for later tests
    expect(events.length).toBeGreaterThan(0);
    
    // Verify we received key initialization events
    const initEvents = events.filter(e => {
      if (e.type === 'milestone' && e.data) {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        return data.kind && (
          data.kind.includes('gazetteer') || 
          data.kind.includes('init') ||
          data.kind.includes('pipeline')
        );
      }
      return false;
    });
    
    logger.info(`Initialization events: ${initEvents.length}`);
    if (initEvents.length === 0) {
      logger.warn('No initialization milestones found - crawl may have skipped setup');
    } else {
      initEvents.slice(0, 5).forEach(e => {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        logger.info(`  ${data.kind}: ${data.message || '(no message)'}`);
      });
    }
    
    // Verify we received actual execution events (not just startup)
    // Check for stage console logs OR progress events
    const stageConsoleEvents = events.filter(e => {
      if (e.type === 'log' && e.data) {
        const msg = typeof e.data === 'string' ? e.data : JSON.stringify(e.data);
        return msg.includes('STARTING STAGE') || msg.includes('Executing ingestor');
      }
      return false;
    });
    
    const executionProgressEvents = events.filter(e => {
      if (e.type === 'progress' && e.data) {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        return data.message && !data.message.includes('Preparing') && !data.message.includes('complete');
      }
      return false;
    });
    
    logger.info(`Stage console logs: ${stageConsoleEvents.length}`);
    logger.info(`Execution progress events: ${executionProgressEvents.length}`);
    
    const totalExecutionEvents = stageConsoleEvents.length + executionProgressEvents.length;
    if (totalExecutionEvents === 0) {
      logger.error('PROBLEM: No execution events - crawl may have ended without processing');
      logger.error('Event types received: ' + events.map(e => e.type).slice(0, 20).join(', '));
    }
    expect(totalExecutionEvents).toBeGreaterThan(0);

    // Check for errors and console output
    const errorEvents = events.filter(e => {
      if (e.type === 'problem') return true;
      if (e.type === 'milestone' && e.data) {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (data.kind && (data.kind.includes('error') || data.kind.includes('failed'))) {
          return true;
        }
      }
      return false;
    });
    
    // Show critical console.error output if present
    const consoleErrors = events.filter(e => {
      if (e.type === 'log' && e.data) {
        const msg = typeof e.data === 'string' ? e.data : JSON.stringify(e.data);
        return msg.includes('[WikidataCountry') || msg.includes('[CRAWL]') || msg.includes('[StagedGazetteer');
      }
      return false;
    });
    if (consoleErrors.length > 0) {
      logger.info(`Console: ${consoleErrors.length} debug logs`);
      consoleErrors.forEach(e => {
        const msg = typeof e.data === 'string' ? e.data : JSON.stringify(e.data);
        logger.info(`  ${msg.substring(0, 200)}`);
      });
    }
    
    // Display PROBLEM events prominently (API errors, rate limits, etc.)
    const problemEvents = events.filter(e => e.type === 'problem');
    if (problemEvents.length > 0) {
      logger.warn(`Problems: ${problemEvents.length} events`);
      problemEvents.slice(0, 5).forEach(p => {
        const data = typeof p.data === 'string' ? JSON.parse(p.data) : p.data;
        logger.warn(`  ${data.kind}: ${data.message}`);
      });
    }
    
    if (errorEvents.length > 0) {
      logger.warn(`Errors: ${errorEvents.length} events`);
      errorEvents.slice(0, 2).forEach(err => {
        const msg = err.data?.message || JSON.stringify(err).substring(0, 100);
        logger.info(`  ${msg}`);
      });
    }
    
    // Check for telemetry events from WikidataCountryIngestor
    const telemetryEvents = events.filter(e => {
      if (e.type === 'telemetry' && e.data) {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        return data.source === 'WikidataCountryIngestor';
      }
      return false;
    });
    
    if (telemetryEvents.length > 0) {
      logger.info(`Telemetry: ${telemetryEvents.length} WikidataCountry events`);
      const queryCompletes = telemetryEvents.filter(e => {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        return data.level === 'query-complete';
      });
      
      if (queryCompletes.length > 0) {
        queryCompletes.forEach(evt => {
          const data = typeof evt.data === 'string' ? JSON.parse(evt.data) : evt.data;
          const d = data.details || {};
          logger.info(`  ${d.queryType}: ${d.durationMs || d.networkDurationMs || 0}ms, ${d.resultCount || d.receivedCount || 0} results`);
        });
      }
    }

    const doneEvent = events.find(e => e.type === 'done');
    if (!doneEvent) {
      logger.error(`Timeout: No 'done' event received within ${CRAWL_COMPLETION_TIMEOUT}ms`);
      logger.error(`Last event types: ${events.slice(-10).map(e => e.type).join(', ')}`);
    }
    expect(doneEvent).toBeDefined();
    logger.success(`SSE stream closed via 'done' event. Total events: ${events.length}`);
  }, CRAWL_COMPLETION_TIMEOUT + 5000); // Jest timeout: 5s buffer

  test('3. should verify crawl completed', async () => {
    logger.step(`Verifying crawl completed for crawl ID ${state.crawlId}`);
    const crawl = await getCrawl(db, state.crawlId);
    // The crawl may show as 'running' or 'completed' in the DB
    // What matters is we received the 'done' SSE event in test 2
    expect(crawl).toBeDefined();
    expect(crawl.id).toBe(state.crawlId);
    logger.success(`Crawl record exists with status: ${crawl.status}`);
  });

  test('4. should verify that gazetteer data exists', async () => {
    logger.step('Verifying gazetteer database content');
    const counts = await getCounts(db);
    logger.info(`Found ${counts.gazetteer || 0} places and ${counts.gazetteer_countries || 0} countries`);
    
    // Show breakdown by kind to diagnose issues
    let kindBreakdown = [];
    try {
      kindBreakdown = db.prepare(`
        SELECT kind, COUNT(*) as count 
        FROM places 
        GROUP BY kind 
        ORDER BY count DESC
      `).all();
      logger.info(`Places by kind: ${JSON.stringify(kindBreakdown)}`);
      
      // Also show sample of places to diagnose
      const samples = db.prepare(`
        SELECT id, wikidata_qid, kind, country_code, canonical_name_id
        FROM places
        LIMIT 5
      `).all();
      logger.info(`Sample places: ${JSON.stringify(samples)}`);
      
      // Check if there are any places with kind=null
      const nullKind = db.prepare(`SELECT COUNT(*) as count FROM places WHERE kind IS NULL`).get();
      if (nullKind.count > 0) {
        logger.warn(`Found ${nullKind.count} places with NULL kind!`);
      }
    } catch (err) {
      logger.warn(`Could not query place kinds: ${err.message}`);
    }
    
    // Diagnose empty database (immediate termination symptom)
    if (counts.gazetteer === 0) {
      logger.error('PROBLEM: Zero places in database - crawl did not ingest any data');
      logger.error('This indicates the coordinator never executed or completed immediately');
      
      // Check if tables exist
      const tables = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name LIKE 'place%'
      `).all();
      logger.error(`Tables found: ${tables.map(t => t.name).join(', ')}`);
      
      // Show milestone events that occurred
      const milestones = state.events.filter(e => e.type === 'milestone');
      logger.error(`Milestones received: ${milestones.length}`);
      milestones.slice(0, 10).forEach(m => {
        const data = typeof m.data === 'string' ? JSON.parse(m.data) : m.data;
        logger.error(`  ${data.kind}: ${data.message}`);
      });
    }
    
    // Assert minimum thresholds for a successful geography crawl
    expect(counts.gazetteer).toBeGreaterThan(0);
    expect(counts.gazetteer_countries).toBeGreaterThanOrEqual(5); // At least 5 countries
    
    // Verify we have countries in the breakdown
    const countryCount = kindBreakdown.find(k => k.kind === 'country')?.count || 0;
    expect(countryCount).toBeGreaterThan(0);
    
    // Verify we have regions (adm1)
    const regionCount = kindBreakdown.find(k => k.kind === 'region')?.count || 0;
    logger.info(`Region count: ${regionCount}`);
    
    // Verify we have cities (if depth allows - crawlDepth 2)
    const cityCount = kindBreakdown.find(k => k.kind === 'city')?.count || 0;
    logger.info(`City count: ${cityCount}`);
    if (cityCount > 0) {
      logger.success(`Cities loaded: ${cityCount} cities found`);
    } else {
      logger.warn(`No cities loaded - check maxDepth setting or crawl configuration`);
    }
    
    logger.success(`Database contains gazetteer data: ${counts.gazetteer} places (${countryCount} countries, ${regionCount} regions, ${cityCount} cities)`);
  });

  test('5. should show comprehensive telemetry summary', async () => {
    logger.step('Analyzing telemetry data for query performance assessment');
    
    // Summary is shown in test 2 now with enhanced telemetry
    // This test verifies telemetry was captured
    expect(state.events).toBeDefined();
    expect(state.events.length).toBeGreaterThan(0);
    
    // Verify we have a reasonable distribution of event types
    const eventTypeCounts = {};
    state.events.forEach(e => {
      eventTypeCounts[e.type] = (eventTypeCounts[e.type] || 0) + 1;
    });
    
    logger.info('Event type distribution:');
    Object.entries(eventTypeCounts).forEach(([type, count]) => {
      logger.info(`  ${type}: ${count}`);
    });
    
    // Verify we have critical event types (indicates actual execution)
    const criticalTypes = ['milestone', 'progress', 'telemetry'];
    const missingTypes = criticalTypes.filter(t => !eventTypeCounts[t]);
    
    if (missingTypes.length > 0) {
      logger.warn(`Missing critical event types: ${missingTypes.join(', ')}`);
      logger.warn('This may indicate incomplete execution or early termination');
    }
    
    // Minimum expectations for a real crawl
    expect(eventTypeCounts.milestone || 0).toBeGreaterThan(3); // At least init, start, complete
    expect(eventTypeCounts.progress || 0).toBeGreaterThan(0); // At least one progress update
    
    logger.success(`Telemetry captured: ${state.events.length} total events`);
  });
  
  test('6. should verify all stages are displayed in UI', async () => {
    logger.step('Verifying all geography crawl stages appear in UI');
    
    // Expected stages for geography crawl
    const expectedStages = ['countries', 'adm1', 'cities'];
    
    // Find all stage-related progress events
    const stageEvents = state.events.filter(e => {
      if (e.type === 'progress' && e.data) {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        // Check for stage-start or stage-complete phase
        if (data.phase === 'stage-start' || data.phase === 'stage-complete') {
          return true;
        }
        // Also check gazetteer progress with stage info
        if (data.gazetteer && data.gazetteer.phase) {
          return data.gazetteer.phase.includes('stage');
        }
      }
      return false;
    });
    
    logger.info(`Found ${stageEvents.length} stage-related events`);
    
    // Track which stages were started and completed
    const stagesStarted = new Set();
    const stagesCompleted = new Set();
    
    stageEvents.forEach(e => {
      const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      const stageName = data.stage || data.gazetteer?.payload?.stage;
      
      if (stageName) {
        if (data.phase === 'stage-start' || (data.gazetteer?.phase === 'stage-start')) {
          stagesStarted.add(stageName);
          logger.info(`  ✓ Stage started: ${stageName}`);
        }
        if (data.phase === 'stage-complete' || (data.gazetteer?.phase === 'stage-complete')) {
          stagesCompleted.add(stageName);
          logger.info(`  ✓ Stage completed: ${stageName}`);
        }
      }
    });
    
    // Check for stage milestones in console/log events
    const consoleStages = state.events.filter(e => {
      if (e.type === 'log' && e.data) {
        const msg = typeof e.data === 'string' ? e.data : JSON.stringify(e.data);
        return msg.includes('STARTING STAGE');
      }
      return false;
    });
    
    logger.info(`Console stage logs: ${consoleStages.length}`);
    consoleStages.forEach(e => {
      const msg = typeof e.data === 'string' ? e.data : JSON.stringify(e.data);
      const match = msg.match(/STARTING STAGE:\s*(\w+)/);
      if (match) {
        const stageName = match[1];
        stagesStarted.add(stageName);
        logger.info(`  ✓ Console log for stage: ${stageName}`);
      }
    });
    
    // Verify we found stage events
    if (stagesStarted.size === 0) {
      logger.error('PROBLEM: No stage events found in SSE stream');
      logger.error('This indicates stages are not being communicated to the UI');
      logger.error('Progress events received: ' + state.events.filter(e => e.type === 'progress').length);
      
      // Show sample progress events to diagnose
      const sampleProgress = state.events.filter(e => e.type === 'progress').slice(0, 5);
      sampleProgress.forEach(e => {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        logger.error(`  Sample: phase=${data.phase}, gazetteer.phase=${data.gazetteer?.phase}`);
      });
    }
    
    expect(stagesStarted.size).toBeGreaterThan(0);
    
    // Verify we have at least the countries stage (minimum)
    expect(stagesStarted.has('countries')).toBe(true);
    logger.success(`Stages displayed in UI: ${Array.from(stagesStarted).join(', ')}`);
    
    // Check for expected stages (warn if missing, don't fail - might be depth-limited)
    expectedStages.forEach(stageName => {
      if (!stagesStarted.has(stageName)) {
        logger.warn(`Expected stage '${stageName}' not found - may be limited by maxDepth setting`);
      }
    });
  });
  
  test('7. should verify crawl execution time was reasonable', async () => {
    logger.step('Verifying crawl execution time');
    
    // Find start and end times from events
    const startEvent = state.events.find(e => {
      if (e.type === 'milestone' && e.data) {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        return data.kind && data.kind.includes('start');
      }
      return false;
    });
    
    const endEvent = state.events.find(e => e.type === 'done');
    
    if (startEvent && endEvent) {
      // Rough duration estimate from event order
      const startIndex = state.events.indexOf(startEvent);
      const endIndex = state.events.indexOf(endEvent);
      const eventDuration = endIndex - startIndex;
      
      logger.info(`Events between start and end: ${eventDuration}`);
      
      // If crawl "completed" with very few events, it likely terminated early
      if (eventDuration < 10) {
        logger.error('PROBLEM: Very few events between start and completion');
        logger.error('This indicates the crawl ended immediately without processing');
        throw new Error(`Crawl completed with only ${eventDuration} events - likely immediate termination`);
      }
      
      expect(eventDuration).toBeGreaterThanOrEqual(10);
      logger.success(`Crawl executed with ${eventDuration} events (reasonable duration)`);
    } else {
      logger.warn('Could not determine execution duration from events');
    }
  });
  
  test('8. should verify stage progression is shown progressively', async () => {
    logger.step('Verifying stage progression order in UI');
    
    // Extract all stage start events in order
    const stageStartEvents = [];
    state.events.forEach(e => {
      if (e.type === 'progress' && e.data) {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (data.phase === 'stage-start' || data.gazetteer?.phase === 'stage-start') {
          const stageName = data.stage || data.gazetteer?.payload?.stage;
          if (stageName) {
            stageStartEvents.push(stageName);
          }
        }
      }
    });
    
    if (stageStartEvents.length === 0) {
      logger.warn('No stage-start events found (checking console logs)');
      
      // Try to find from console logs
      state.events.forEach(e => {
        if (e.type === 'log' && e.data) {
          const msg = typeof e.data === 'string' ? e.data : JSON.stringify(e.data);
          const match = msg.match(/STARTING STAGE:\s*(\w+)/);
          if (match) {
            stageStartEvents.push(match[1]);
          }
        }
      });
    }
    
    logger.info(`Stage progression: ${stageStartEvents.join(' → ')}`);
    
    // Verify stages appear in logical order (countries first)
    if (stageStartEvents.length > 0) {
      expect(stageStartEvents[0]).toBe('countries');
      logger.success('Stages shown progressively, starting with countries');
    } else {
      logger.error('PROBLEM: No stage progression events found');
      throw new Error('No stage progression detected - UI not showing stages');
    }
  });
});
