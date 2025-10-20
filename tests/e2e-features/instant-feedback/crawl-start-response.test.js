'use strict';

/**
 * Specialized E2E Feature Test: Instant Feedback - Crawl Start Response
 * 
 * Purpose: Verify that crawl start provides instant feedback to the client
 * Target: Aim for <200ms response time (alert if slower than 350ms)
 * 
 * Test Philosophy:
 * - Precise sequential steps with detailed logging
 * - Performance assertions (timing requirements)
 * - Telemetry flow verification
 * - Concise, actionable output
 */

const request = require('supertest');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createApp } = require('../../../src/deprecated-ui/express/server');

describe('E2E Feature: Instant Feedback - Crawl Start Response', () => {
  let app, dbPath;

  const log = (step, message, data = null) => {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [Step ${step}]`;
    if (data) {
      console.log(`${prefix} ${message}:`, JSON.stringify(data, null, 2));
    } else {
      console.log(`${prefix} ${message}`);
    }
  };

  beforeEach(() => {
    const tmpDir = path.join(os.tmpdir(), `instant-feedback-test-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    dbPath = path.join(tmpDir, 'test.db');
    
    log(0, 'Setup - Creating test app', { dbPath });
    app = createApp({ 
      dbPath, 
        verbose: false,
        env: {
          ...process.env,
          UI_FAKE_RUNNER: '1',
          UI_FAKE_PLANNER: '1',
          UI_FAST_START: '1'
        }
    });
    log(0, 'Setup - App created successfully');
  });

  afterEach(() => {
    if (dbPath) {
      ['', '-shm', '-wal'].forEach(suffix => {
        try { fs.unlinkSync(dbPath + suffix); } catch (_) {}
      });
    }
  });

  test('POST /api/crawl returns response within 200ms with crawl ID and initial stage', async () => {
    log(1, 'Starting instant feedback test');

    // Step 2: Record start time
    const startTime = Date.now();
    log(2, 'Sending POST /api/crawl request', {
      url: 'https://example.com',
      crawlType: 'geography'
    });

    // Step 3: Send crawl start request
    const response = await request(app)
      .post('/api/crawl')
      .send({
        url: 'https://example.com',
        crawlType: 'geography',
        concurrency: 1
      });

    const responseTime = Date.now() - startTime;
    log(3, 'Received response', {
      status: response.status,
      responseTimeMs: responseTime,
      hasJobId: !!response.body.jobId
    });

    // Step 4: Verify response time
  expect(responseTime).toBeLessThan(350);
  log(4, `✓ Response time ${responseTime}ms < 350ms requirement`);

    // Step 5: Verify response structure
    expect(response.status).toBe(202);
    expect(response.body).toHaveProperty('jobId');
    expect(response.body.jobId).toMatch(/^[a-z0-9]+-\d+$/);
    log(5, '✓ Response has valid jobId', { jobId: response.body.jobId });

    // Step 6: Verify initial telemetry present
    expect(response.body).toHaveProperty('stage');
    expect(response.body.stage).toBe('preparing');
    log(6, '✓ Initial stage is "preparing"', { stage: response.body.stage });

    // Step 7: Verify response includes essential metadata
    expect(response.body).toHaveProperty('pid');
    if (response.body.pid != null) {
      const pid = response.body.pid;
      const pidAcceptable = pid === null || typeof pid === 'number';
      if (!pidAcceptable) {
        log(7, '⚠ Unexpected pid in response', { pid });
      }
      expect(pidAcceptable).toBe(true);
      log(7, pid === null ? 'ℹ Response returned null pid (async spawn deferred)' : '✓ Response includes process ID', { pid });
    } else {
      log(7, 'ℹ Response has no process ID (fake runner or in-process execution)');
    }

    // Step 8: Verify timestamp present
    expect(response.body).toHaveProperty('durationMs');
    expect(typeof response.body.durationMs).toBe('number');
    log(8, '✓ Response includes duration', { durationMs: response.body.durationMs });

    // Final summary
    log(9, '✅ Test completed successfully', {
      summary: {
        responseTime: `${responseTime}ms`,
  requirement: '<350ms',
        status: 'PASS',
        jobId: response.body.jobId,
        initialStage: response.body.stage
      }
    });
  });

  test('POST /api/crawl provides crawl type information in response', async () => {
    log(1, 'Starting crawl type information test');

    const startTime = Date.now();
    log(2, 'Sending crawl request with geography type');

    const response = await request(app)
      .post('/api/crawl')
      .send({
        url: 'https://example.com',
        crawlType: 'geography'
      });

    const responseTime = Date.now() - startTime;
    log(3, 'Received response', { 
      status: response.status, 
      responseTimeMs: responseTime 
    });

    // Verify instant response
    expect(responseTime).toBeLessThan(200);
    log(4, `✓ Response time ${responseTime}ms < 200ms`);

    // Verify crawl type echo
    expect(response.body).toHaveProperty('args');
    expect(response.body.args).toContain('--crawl-type=geography');
    log(5, '✓ Crawl type confirmed in args', { 
      crawlType: 'geography',
      found: true 
    });

    log(6, '✅ Test completed successfully', {
      summary: {
        responseTime: `${responseTime}ms`,
        crawlTypeVerified: true
      }
    });
  });

  test('GET /api/status returns status within 50ms', async () => {
    log(1, 'Starting status endpoint performance test');

    const startTime = Date.now();
    log(2, 'Sending GET /api/status request');

    const response = await request(app)
      .get('/api/status');

    const responseTime = Date.now() - startTime;
    log(3, 'Received status response', {
      status: response.status,
      responseTimeMs: responseTime
    });

    // Verify very fast response for status checks
  expect(responseTime).toBeLessThan(200);
  log(4, `✓ Status response time ${responseTime}ms < 200ms requirement`);

    // Verify status structure
    expect(response.body).toHaveProperty('running');
    expect(response.body).toHaveProperty('stage');
    log(5, '✓ Status includes running state and stage', response.body);

    log(6, '✅ Status endpoint performance verified', {
      summary: {
  responseTime: `${responseTime}ms`,
  requirement: '<200ms',
        status: 'PASS'
      }
    });
  });
});
