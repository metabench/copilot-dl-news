/**
 * Tests for ResilienceService
 * 
 * @see src/crawler/services/ResilienceService.js
 */

const { ResilienceService, CircuitState } = require('../ResilienceService');

describe('ResilienceService', () => {
  let service;
  let mockTelemetry;
  let mockLogger;

  beforeEach(() => {
    mockTelemetry = {
      problem: jest.fn(),
      milestoneOnce: jest.fn()
    };
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    service = new ResilienceService({
      telemetry: mockTelemetry,
      logger: mockLogger,
      config: {
        stallThresholdMs: 1000,
        heartbeatIntervalMs: 100,
        circuitFailureThreshold: 3,
        circuitResetTimeoutMs: 500,
        circuitHalfOpenSuccesses: 2
      }
    });
  });

  afterEach(() => {
    service.dispose();
  });

  describe('lifecycle', () => {
    test('should start and stop without errors', () => {
      expect(() => service.start()).not.toThrow();
      expect(() => service.stop()).not.toThrow();
    });

    test('should throw when starting after dispose', () => {
      service.dispose();
      expect(() => service.start()).toThrow('disposed');
    });
  });

  describe('activity tracking', () => {
    test('should record activity and update timestamp', () => {
      const before = Date.now();
      service.recordActivity();
      const status = service.getHealthStatus();
      
      expect(status.lastActivity).toBeGreaterThanOrEqual(before);
      expect(status.staleMs).toBeLessThan(100);
    });

    test('should detect stale state', async () => {
      // Set a very short stall threshold for testing
      service.config.stallThresholdMs = 50;
      
      // Wait for it to become stale
      await new Promise(r => setTimeout(r, 100));
      
      const status = service.getHealthStatus();
      expect(status.healthy).toBe(false);
      expect(status.issues.length).toBeGreaterThan(0);
      expect(status.issues[0]).toContain('stale');
    });

    test('should reset stall counter on activity', () => {
      service._consecutiveStalls = 5;
      service.recordActivity();
      expect(service._consecutiveStalls).toBe(0);
    });
  });

  describe('circuit breaker', () => {
    const host = 'example.com';

    test('should start in CLOSED state', () => {
      expect(service.isAllowed(host)).toBe(true);
      expect(service.getCircuitState(host)).toBeNull();
    });

    test('should open circuit after threshold failures', () => {
      // Record failures up to threshold
      service.recordFailure(host, '403', 'Forbidden');
      service.recordFailure(host, '403', 'Forbidden');
      expect(service.isAllowed(host)).toBe(true);
      
      // Third failure should open circuit
      const opened = service.recordFailure(host, '403', 'Forbidden');
      expect(opened).toBe(true);
      
      const circuit = service.getCircuitState(host);
      expect(circuit.state).toBe(CircuitState.OPEN);
      expect(service.isAllowed(host)).toBe(false);
    });

    test('should emit telemetry when circuit opens', () => {
      for (let i = 0; i < 3; i++) {
        service.recordFailure(host, '429', 'Rate limited');
      }
      
      expect(mockTelemetry.problem).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'circuit-breaker-open',
          scope: host
        })
      );
    });

    test('should transition to HALF_OPEN after timeout', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        service.recordFailure(host, '500', 'Error');
      }
      expect(service.isAllowed(host)).toBe(false);
      
      // Wait for reset timeout
      await new Promise(r => setTimeout(r, 600));
      
      // Should now be half-open
      expect(service.isAllowed(host)).toBe(true);
      const circuit = service.getCircuitState(host);
      expect(circuit.state).toBe(CircuitState.HALF_OPEN);
    });

    test('should close circuit after successes in HALF_OPEN', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        service.recordFailure(host, '500', 'Error');
      }
      
      // Wait for reset timeout
      await new Promise(r => setTimeout(r, 600));
      
      // Allow request (transitions to half-open)
      service.isAllowed(host);
      
      // Record successful requests
      service.recordSuccess(host);
      expect(service.getCircuitState(host).state).toBe(CircuitState.HALF_OPEN);
      
      service.recordSuccess(host);
      expect(service.getCircuitState(host).state).toBe(CircuitState.CLOSED);
    });

    test('should re-open circuit on failure in HALF_OPEN', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        service.recordFailure(host, '500', 'Error');
      }
      
      // Wait for reset timeout
      await new Promise(r => setTimeout(r, 600));
      
      // Transition to half-open
      service.isAllowed(host);
      
      // Fail in half-open
      service.recordFailure(host, '500', 'Still failing');
      
      expect(service.getCircuitState(host).state).toBe(CircuitState.OPEN);
    });

    test('should calculate backoff correctly', () => {
      service.recordFailure(host, '429', 'Rate limited');
      const backoff1 = service.getBackoffMs(host);
      expect(backoff1).toBeGreaterThan(0);
      
      service.recordFailure(host, '429', 'Rate limited');
      const backoff2 = service.getBackoffMs(host);
      expect(backoff2).toBeGreaterThan(backoff1);
    });

    test('should return time until recovery for OPEN circuit', () => {
      for (let i = 0; i < 3; i++) {
        service.recordFailure(host, '500', 'Error');
      }
      
      const timeUntil = service.getTimeUntilRecovery(host);
      expect(timeUntil).toBeGreaterThan(0);
      expect(timeUntil).toBeLessThanOrEqual(500);
    });
  });

  describe('diagnostics', () => {
    test('should run full diagnostics', async () => {
      const results = await service.runDiagnostics();
      
      expect(results).toHaveProperty('timestamp');
      expect(results).toHaveProperty('network');
      expect(results).toHaveProperty('database');
      expect(results).toHaveProperty('memory');
      expect(results).toHaveProperty('circuits');
      expect(results).toHaveProperty('healthy');
    });

    test('should check memory usage', () => {
      const memCheck = service._checkMemory();
      expect(memCheck).toHaveProperty('usedMb');
      expect(memCheck).toHaveProperty('thresholdMb');
      expect(memCheck).toHaveProperty('ok');
      expect(typeof memCheck.usedMb).toBe('number');
    });
  });

  describe('statistics', () => {
    test('should track circuit statistics', () => {
      const host1 = 'domain1.com';
      const host2 = 'domain2.com';
      
      // Open circuit for host1
      for (let i = 0; i < 3; i++) {
        service.recordFailure(host1, '500', 'Error');
      }
      
      const stats = service.getStats();
      expect(stats.circuitsBroken).toBe(1);
      expect(stats.activeCircuits).toBe(1);
      expect(stats.openCircuits).toBe(1);
    });
  });
});
