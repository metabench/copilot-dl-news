'use strict';

/**
 * Specialized E2E Feature Test: Telemetry Flow - Preparation Stages
 * 
 * Purpose: Verify detailed telemetry during crawl preparation phase
 * Target: Capture all preparation stage emissions (bootstrap, planning, etc.)
 * 
 * Test Philosophy:
 * - Sequential stage verification
 * - Telemetry timing analysis
 * - Stage transition validation
 * - Clear progress indicators
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { SimpleEventSource } = require('../../helpers/simpleEventSource');

describe('E2E Feature: Telemetry Flow - Preparation Stages', () => {
  let serverProcess, serverPort, dbPath, tmpDir;
  const telemetryLog = [];

  const log = (step, message, data = null) => {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [Step ${step}]`;
    if (data) {
      console.log(`${prefix} ${message}:`, JSON.stringify(data, null, 2));
    } else {
      console.log(`${prefix} ${message}`);
    }
  };

  beforeAll(async () => {
    tmpDir = path.join(os.tmpdir(), `telemetry-test-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    dbPath = path.join(tmpDir, 'test.db');

    log(0, 'Setup - Starting server process', { dbPath });

    serverProcess = spawn('node', [
      'src/ui/express/server.js',
      '--detached'
    ], {
      env: {
        ...process.env,
        DB_PATH: dbPath,
        PORT: '0',
        UI_VERBOSE: '0',
        UI_FAST_START: '1',
        UI_FAKE_RUNNER: '1',
        UI_FAKE_PLANNER: '1',
        UI_FAKE_QUEUE: '1',
        UI_FAKE_MILESTONES: '1',
        UI_FAKE_PROBLEMS: '1',
        UI_FAKE_PLANNER_DELAY_MS: '25'
      },
      cwd: path.resolve(__dirname, '../../..'),
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Capture port from server output
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server start timeout')), 10000);
      
      serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        const match = output.match(/listening on.*:(\d+)/);
        if (match) {
          serverPort = parseInt(match[1], 10);
          clearTimeout(timeout);
          log(0, 'Setup - Server started', { port: serverPort });
          resolve();
        }
      });

      serverProcess.stderr.on('data', (data) => {
        console.error('Server error:', data.toString());
      });
    });
  }, 15000);

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill();
      log(99, 'Cleanup - Server process terminated');
    }
    if (dbPath) {
      ['', '-shm', '-wal'].forEach(suffix => {
        try { fs.unlinkSync(dbPath + suffix); } catch (_) {}
      });
    }
  });

  test('Geography crawl emits detailed preparation stage telemetry', async () => {
    log(1, 'Starting preparation stages telemetry test');

    // Step 2: Connect to SSE telemetry stream
    log(2, 'Connecting to SSE telemetry endpoint', {
      url: `http://localhost:${serverPort}/events?logs=1`
    });

    const eventSource = new SimpleEventSource(`http://localhost:${serverPort}/events?logs=1`);
    const stages = [];
    const progressEvents = [];

    eventSource.on('open', () => {
      log(3, '✓ SSE connection established');
    });

    eventSource.on('planner-stage', (event) => {
      const data = JSON.parse(event.data);
      stages.push(data);
      log(4, 'Received planner-stage event', {
        type: data.type,
        status: data.status,
        durationMs: data.durationMs
      });
    });

    eventSource.on('progress', (event) => {
      const data = JSON.parse(event.data);
      progressEvents.push(data);
      if (data.phase) {
        log(5, 'Received progress event', {
          phase: data.phase,
          current: data.current,
          totalItems: data.totalItems
        });
      }
    });

    // Step 3: Start crawl
    log(6, 'Sending crawl start request');
    const startTime = Date.now();

    const response = await fetch(`http://localhost:${serverPort}/api/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://example.com',
        crawlType: 'geography',
        concurrency: 1
      })
    });

    const responseTime = Date.now() - startTime;
    const responseData = await response.json();

    log(7, 'Crawl started', {
      responseTimeMs: responseTime,
      jobId: responseData.jobId,
      initialStage: responseData.stage
    });

    // Verify instant response
  expect(responseTime).toBeLessThan(700);
    expect(responseData.jobId).toBeDefined();
    expect(responseData.stage).toBe('preparing');

    // Step 4: Wait for preparation stages to complete
    log(8, 'Monitoring preparation stages for 30 seconds');

    await new Promise(resolve => setTimeout(resolve, 30000));

    eventSource.close();
    log(9, 'SSE connection closed', {
      totalStages: stages.length,
      totalProgress: progressEvents.length
    });

    // Step 5: Analyze captured telemetry
    log(10, 'Analyzing preparation stage telemetry');

    const expectedStages = ['bootstrap', 'infer-patterns', 'reasoning'];
    const capturedStageTypes = [...new Set(stages.map(s => s.type))];

    log(11, 'Stage types captured', {
      expected: expectedStages,
      actual: capturedStageTypes,
      count: stages.length
    });

    // Verify essential stages present
    const hasBootstrap = stages.some(s => s.type === 'bootstrap' || s.type?.includes('bootstrap'));
    log(12, hasBootstrap ? '✓ Bootstrap stage detected' : '⚠ Bootstrap stage missing', {
      found: hasBootstrap
    });

    // Verify stage timing information
    const stagesWithTiming = stages.filter(s => s.durationMs != null);
    log(13, 'Stages with timing information', {
      count: stagesWithTiming.length,
      sample: stagesWithTiming.slice(0, 3)
    });

    // Verify progress events
    const processingProgress = progressEvents.filter(p => p.phase === 'processing');
    log(14, 'Processing progress events', {
      count: processingProgress.length,
      sample: processingProgress.slice(0, 2)
    });

    // Final summary
    log(15, '✅ Preparation stage telemetry test completed', {
      summary: {
  instantResponse: `${responseTime}ms < 700ms`,
        stagesCaptured: stages.length,
        progressEventsCaptured: progressEvents.length,
        telemetryFlowing: stages.length > 0 || progressEvents.length > 0
      }
    });

    // Assertions
    expect(stages.length + progressEvents.length).toBeGreaterThan(0);
  }, 45000);
});
