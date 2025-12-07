'use strict';

/**
 * Phase 1 Resilience: FetchPipeline content validation integration tests
 * 
 * Tests the integration of ContentValidationService and ResilienceService
 * with the FetchPipeline network fetch flow.
 */

const { ContentValidationService } = require('../services/ContentValidationService');
const { ResilienceService } = require('../services/ResilienceService');

describe('ContentValidationService', () => {
  let service;

  beforeEach(() => {
    service = new ContentValidationService({ 
      logger: { info: () => {}, warn: () => {} },
      minBodyLength: 50 // Low threshold for testing
    });
  });

  it('accepts valid HTML content', () => {
    const result = service.validate({
      url: 'https://example.com',
      html: '<html><body><h1>Article Title</h1><p>Content here that is long enough to pass validation minimum length requirements and contains enough text...</p></body></html>',
      statusCode: 200
    });

    expect(result.valid).toBe(true);
  });

  it('rejects Cloudflare/JS challenge pages as soft failures', () => {
    const result = service.validate({
      url: 'https://example.com',
      html: `<html><body>
        <div>Checking your browser before accessing example.com</div>
        <div>This process is automatic. Your browser will redirect shortly.</div>
        <div>DDoS protection by Cloudflare. Ray ID: abc123</div>
        <div>Please enable JavaScript and cookies to continue.</div>
      </body></html>`,
      statusCode: 200
    });

    expect(result.valid).toBe(false);
    expect(result.failureType).toBe('soft'); // Soft = try with Puppeteer
  });

  it('rejects access denied pages as hard failures', () => {
    const result = service.validate({
      url: 'https://example.com',
      html: `<html><body>
        <h1>403 Forbidden</h1>
        <p>Access Denied. You do not have permission to access this resource.</p>
        <p>If you believe this is an error, please contact the administrator.</p>
      </body></html>`,
      statusCode: 200
    });

    expect(result.valid).toBe(false);
    expect(result.failureType).toBe('hard'); // Hard = stop domain
  });

  it('rejects rate limited responses by status code', () => {
    const result = service.validate({
      url: 'https://example.com',
      html: '<html><body>Rate limit exceeded. Please try again later. This is enough content.</body></html>',
      statusCode: 429
    });

    expect(result.valid).toBe(false);
    expect(result.failureType).toBe('hard');
  });

  it('rejects content that is too short', () => {
    const result = service.validate({
      url: 'https://example.com',
      html: '<html><body>Hi</body></html>',
      statusCode: 200
    });

    expect(result.valid).toBe(false);
    expect(result.failureType).toBe('soft');
    expect(result.reason).toBe('body-too-short');
  });

  it('tracks statistics', () => {
    // Valid content
    service.validate({
      url: 'https://example.com/1',
      html: '<html><body><h1>Valid content that is long enough to pass minimum length validation requirements</h1></body></html>',
      statusCode: 200
    });

    // Invalid - too short
    service.validate({
      url: 'https://example.com/2',
      html: 'short',
      statusCode: 200
    });

    const stats = service.getStats();
    expect(stats.validated).toBe(2);
    expect(stats.rejected).toBe(1);
    // Accepted = validated - rejected
    expect(stats.validated - stats.rejected).toBe(1);
  });
});

describe('ResilienceService', () => {
  let service;

  beforeEach(() => {
    service = new ResilienceService({
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      config: {
        stallThresholdMs: 60000,
        heartbeatIntervalMs: 1000,
        circuitFailureThreshold: 3, // Override to 3 for testing
        circuitResetTimeoutMs: 1000
      }
    });
  });

  afterEach(() => {
    service.stop();
  });

  it('starts and stops cleanly', () => {
    service.start();
    expect(service.isRunning()).toBe(true);
    service.stop();
    expect(service.isRunning()).toBe(false);
  });

  it('tracks host failures for circuit breaker', () => {
    service.recordFailure('test.com', 'network', 'timeout');
    service.recordFailure('test.com', 'network', 'timeout');
    
    // Should still be allowed (threshold is 3)
    expect(service.isAllowed('test.com')).toBe(true);
    
    service.recordFailure('test.com', 'network', 'timeout');
    
    // Now circuit should be open
    expect(service.isAllowed('test.com')).toBe(false);
  });

  it('resets circuit after timeout and successes', async () => {
    // Create with very short reset timeout for testing
    const fastService = new ResilienceService({
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      config: {
        circuitFailureThreshold: 3,
        circuitResetTimeoutMs: 50, // 50ms for fast testing
        circuitHalfOpenSuccesses: 1
      }
    });

    try {
      // Trip the circuit
      fastService.recordFailure('test.com', 'network', 'timeout');
      fastService.recordFailure('test.com', 'network', 'timeout');
      fastService.recordFailure('test.com', 'network', 'timeout');
      expect(fastService.isAllowed('test.com')).toBe(false);

      // Wait for circuit to transition to HALF_OPEN
      await new Promise(resolve => setTimeout(resolve, 60));
      
      // Should be allowed to try (HALF_OPEN)
      expect(fastService.isAllowed('test.com')).toBe(true);

      // Record success to close circuit
      fastService.recordSuccess('test.com');
      expect(fastService.isAllowed('test.com')).toBe(true);
    } finally {
      fastService.stop();
    }
  });

  it('records activity to prevent stall detection', () => {
    service.start();
    const before = service.getLastActivityTs();
    service.recordActivity();
    expect(service.getLastActivityTs()).toBeGreaterThanOrEqual(before);
  });

  it('computes backoff with jitter', () => {
    service.recordFailure('backoff.com', 'network', 'error 1');
    const backoff1 = service.getBackoffMs('backoff.com');
    
    service.recordFailure('backoff.com', 'network', 'error 2');
    const backoff2 = service.getBackoffMs('backoff.com');
    
    // Second backoff should be greater due to exponential increase
    expect(backoff2).toBeGreaterThan(backoff1);
  });

  it('runs diagnostics', async () => {
    const diag = await service.runDiagnostics();
    expect(diag.network).toBeDefined();
    expect(diag.memory).toBeDefined();
  });
});
