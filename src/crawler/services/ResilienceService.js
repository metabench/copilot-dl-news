/**
 * ResilienceService
 * 
 * Internal self-monitoring and resilience for the crawler process.
 * Tracks heartbeat, manages circuit breakers per domain, and handles
 * graceful degradation without external supervision.
 * 
 * Part of Phase 1: Foundation - "The Tenacious Crawler"
 * 
 * @see docs/designs/RELIABLE_CRAWLER_PHASE_1_SPEC.md
 */

const dns = require('dns').promises;
const http = require('http');
const https = require('https');

/**
 * Circuit breaker states
 * @enum {string}
 */
const CircuitState = {
  CLOSED: 'closed',     // Normal operation
  OPEN: 'open',         // Failing, requests blocked
  HALF_OPEN: 'half-open' // Testing if service recovered
};

/**
 * @typedef {Object} DomainCircuit
 * @property {string} state - Circuit state (closed/open/half-open)
 * @property {number} failures - Consecutive failure count
 * @property {number} lastFailure - Timestamp of last failure
 * @property {number} openedAt - When circuit opened (0 if closed)
 * @property {string} [lastError] - Last error message
 */

/**
 * @typedef {Object} HealthStatus
 * @property {boolean} healthy - Overall health status
 * @property {number} lastActivity - Timestamp of last activity
 * @property {boolean} networkUp - Network connectivity status
 * @property {boolean} databaseUp - Database connectivity status
 * @property {number} staleMs - Milliseconds since last activity
 * @property {string[]} issues - List of current issues
 */

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // Heartbeat / stall detection
  stallThresholdMs: 5 * 60 * 1000,  // 5 minutes without activity = stall
  heartbeatIntervalMs: 30 * 1000,   // Check every 30 seconds
  
  // Network checks
  networkCheckHosts: ['8.8.8.8', '1.1.1.1'],
  networkCheckTimeoutMs: 5000,
  networkRetryIntervalMs: 30 * 1000,
  
  // Circuit breaker per domain
  circuitFailureThreshold: 5,        // Errors before opening circuit
  circuitResetTimeoutMs: 5 * 60 * 1000, // Time in open state before half-open
  circuitHalfOpenSuccesses: 2,       // Successes needed to close from half-open
  
  // Backoff calculation
  backoffBaseMs: 1000,
  backoffMaxMs: 5 * 60 * 1000,
  backoffJitter: 0.2,
  
  // Fatal conditions
  maxConsecutiveStalls: 3,
  memoryThresholdMb: 1500  // Exit if memory exceeds this
};

class ResilienceService {
  /**
   * @param {Object} options
   * @param {Object} [options.config] - Override default configuration
   * @param {Object} [options.telemetry] - Telemetry service for logging
   * @param {Object} [options.logger] - Logger instance
   * @param {Function} [options.getDbAdapter] - Function to get database adapter
   * @param {Function} [options.onStallDetected] - Callback when stall is detected
   * @param {Function} [options.onNetworkDown] - Callback when network is down
   * @param {Function} [options.onFatalCondition] - Callback for unrecoverable state
   */
  constructor(options = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.telemetry = options.telemetry ?? null;
    this.logger = options.logger ?? console;
    this.getDbAdapter = options.getDbAdapter ?? (() => null);
    
    // Callbacks
    this.onStallDetected = options.onStallDetected ?? null;
    this.onNetworkDown = options.onNetworkDown ?? null;
    this.onFatalCondition = options.onFatalCondition ?? null;
    
    // State
    this._lastActivityAt = Date.now();
    this._lastHeartbeatCheck = Date.now();
    this._consecutiveStalls = 0;
    this._networkUp = true;
    this._databaseUp = true;
    this._paused = false;
    this._disposed = false;
    
    // Circuit breakers per domain
    /** @type {Map<string, DomainCircuit>} */
    this._circuits = new Map();
    
    // Heartbeat timer
    this._heartbeatTimer = null;
    
    // Stats
    this._stats = {
      stallsDetected: 0,
      networkOutages: 0,
      circuitsBroken: 0,
      recoveries: 0
    };
  }

  /**
   * Start the resilience monitoring
   */
  start() {
    if (this._disposed) {
      throw new Error('ResilienceService has been disposed');
    }
    
    if (this._heartbeatTimer) {
      return; // Already running
    }
    
    this._heartbeatTimer = setInterval(() => {
      this._checkHeartbeat();
    }, this.config.heartbeatIntervalMs);
    
    // Don't block process exit
    this._heartbeatTimer.unref();
    
    this._log('info', 'ResilienceService started', {
      stallThresholdMs: this.config.stallThresholdMs,
      circuitFailureThreshold: this.config.circuitFailureThreshold
    });
  }

  /**
   * Stop the resilience monitoring
   */
  stop() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
    this._log('info', 'ResilienceService stopped');
  }

  /**
   * Dispose of all resources
   */
  dispose() {
    this.stop();
    this._circuits.clear();
    this._disposed = true;
  }

  /**
   * Record activity - call this on every crawl action
   * Resets the stall timer
   */
  recordActivity() {
    this._lastActivityAt = Date.now();
    this._consecutiveStalls = 0;
  }

  /**
   * Pause monitoring (e.g., during intentional waits)
   */
  pause() {
    this._paused = true;
  }

  /**
   * Resume monitoring
   */
  resume() {
    this._paused = false;
    this._lastActivityAt = Date.now();
  }

  /**
   * Check if the service is currently running
   * @returns {boolean}
   */
  isRunning() {
    return this._heartbeatTimer !== null && !this._disposed;
  }

  /**
   * Get the timestamp of the last recorded activity
   * @returns {number} Unix timestamp in milliseconds
   */
  getLastActivityTs() {
    return this._lastActivityAt;
  }

  /**
   * Get current health status
   * @returns {HealthStatus}
   */
  getHealthStatus() {
    const now = Date.now();
    const staleMs = now - this._lastActivityAt;
    const issues = [];
    
    if (staleMs > this.config.stallThresholdMs) {
      issues.push(`stale: ${Math.round(staleMs / 1000)}s since last activity`);
    }
    if (!this._networkUp) {
      issues.push('network: down');
    }
    if (!this._databaseUp) {
      issues.push('database: down');
    }
    
    return {
      healthy: issues.length === 0,
      lastActivity: this._lastActivityAt,
      networkUp: this._networkUp,
      databaseUp: this._databaseUp,
      staleMs,
      issues
    };
  }

  /**
   * Get statistics
   * @returns {Object}
   */
  getStats() {
    return {
      ...this._stats,
      activeCircuits: this._circuits.size,
      openCircuits: [...this._circuits.values()].filter(c => c.state === CircuitState.OPEN).length
    };
  }

  // ========================
  // Circuit Breaker Methods
  // ========================

  /**
   * Record a failure for a domain
   * @param {string} host - Domain hostname
   * @param {string} [errorType] - Type of error (e.g., '403', '429', 'timeout')
   * @param {string} [errorMessage] - Error message
   * @returns {boolean} - True if circuit just opened
   */
  recordFailure(host, errorType, errorMessage) {
    const circuit = this._getOrCreateCircuit(host);
    const now = Date.now();
    
    circuit.failures++;
    circuit.lastFailure = now;
    circuit.lastError = `${errorType}: ${errorMessage}`.slice(0, 200);
    
    if (circuit.state === CircuitState.CLOSED &&
        circuit.failures >= this.config.circuitFailureThreshold) {
      circuit.state = CircuitState.OPEN;
      circuit.openedAt = now;
      this._stats.circuitsBroken++;
      
      this._log('warn', `Circuit breaker OPEN for ${host}`, {
        failures: circuit.failures,
        lastError: circuit.lastError
      });
      
      if (this.telemetry) {
        try {
          this.telemetry.problem({
            kind: 'circuit-breaker-open',
            scope: host,
            message: `Circuit breaker tripped after ${circuit.failures} failures`,
            details: { errorType, failures: circuit.failures }
          });
        } catch (e) {}
      }
      
      return true;
    }
    
    if (circuit.state === CircuitState.HALF_OPEN) {
      // Failure in half-open state: reopen circuit
      circuit.state = CircuitState.OPEN;
      circuit.openedAt = now;
      circuit.failures = this.config.circuitFailureThreshold;
      
      this._log('warn', `Circuit breaker re-opened for ${host}`);
      return true;
    }
    
    return false;
  }

  /**
   * Record a success for a domain
   * @param {string} host - Domain hostname
   */
  recordSuccess(host) {
    const circuit = this._circuits.get(host);
    if (!circuit) return;
    
    if (circuit.state === CircuitState.HALF_OPEN) {
      circuit.successes = (circuit.successes || 0) + 1;
      
      if (circuit.successes >= this.config.circuitHalfOpenSuccesses) {
        circuit.state = CircuitState.CLOSED;
        circuit.failures = 0;
        circuit.openedAt = 0;
        circuit.successes = 0;
        this._stats.recoveries++;
        
        this._log('info', `Circuit breaker CLOSED for ${host} (recovered)`);
        
        if (this.telemetry) {
          try {
            this.telemetry.milestoneOnce(`circuit-recovered:${host}`, {
              kind: 'circuit-breaker-closed',
              message: `Circuit breaker recovered for ${host}`,
              details: { host }
            });
          } catch (e) {}
        }
      }
    } else if (circuit.state === CircuitState.CLOSED) {
      // Successful request: decay failure count
      if (circuit.failures > 0) {
        circuit.failures = Math.max(0, circuit.failures - 1);
      }
    }
  }

  /**
   * Check if requests to a domain should be allowed
   * @param {string} host - Domain hostname
   * @returns {boolean} - True if requests are allowed
   */
  isAllowed(host) {
    const circuit = this._circuits.get(host);
    if (!circuit) return true;
    
    const now = Date.now();
    
    if (circuit.state === CircuitState.CLOSED) {
      return true;
    }
    
    if (circuit.state === CircuitState.OPEN) {
      // Check if enough time has passed to try again
      const elapsed = now - circuit.openedAt;
      if (elapsed >= this.config.circuitResetTimeoutMs) {
        circuit.state = CircuitState.HALF_OPEN;
        circuit.successes = 0;
        this._log('info', `Circuit breaker HALF-OPEN for ${host} (testing recovery)`);
        return true;
      }
      return false;
    }
    
    // Half-open: allow limited requests
    return true;
  }

  /**
   * Get circuit state for a domain
   * @param {string} host - Domain hostname
   * @returns {DomainCircuit|null}
   */
  getCircuitState(host) {
    return this._circuits.get(host) || null;
  }

  /**
   * Get backoff time for a domain
   * @param {string} host - Domain hostname
   * @returns {number} - Milliseconds to wait before next request
   */
  getBackoffMs(host) {
    const circuit = this._circuits.get(host);
    if (!circuit || circuit.failures === 0) return 0;
    
    // Exponential backoff with jitter
    const attempt = Math.min(circuit.failures, 10);
    const exponential = Math.min(
      this.config.backoffMaxMs,
      this.config.backoffBaseMs * Math.pow(2, attempt - 1)
    );
    
    const jitter = exponential * this.config.backoffJitter * (Math.random() - 0.5);
    return Math.round(exponential + jitter);
  }

  /**
   * Get time until circuit might recover
   * @param {string} host - Domain hostname
   * @returns {number} - Milliseconds until half-open, or 0 if not blocked
   */
  getTimeUntilRecovery(host) {
    const circuit = this._circuits.get(host);
    if (!circuit || circuit.state !== CircuitState.OPEN) return 0;
    
    const elapsed = Date.now() - circuit.openedAt;
    return Math.max(0, this.config.circuitResetTimeoutMs - elapsed);
  }

  // ========================
  // Diagnostic Methods
  // ========================

  /**
   * Check network connectivity
   * @returns {Promise<boolean>}
   */
  async checkNetwork() {
    for (const host of this.config.networkCheckHosts) {
      try {
        await this._pingHost(host);
        this._networkUp = true;
        return true;
      } catch (e) {
        // Try next host
      }
    }
    
    this._networkUp = false;
    this._stats.networkOutages++;
    this._log('error', 'Network connectivity check failed');
    return false;
  }

  /**
   * Check database connectivity
   * @returns {Promise<boolean>}
   */
  async checkDatabase() {
    try {
      const adapter = this.getDbAdapter();
      if (!adapter) {
        // No database configured - that's fine
        this._databaseUp = true;
        return true;
      }
      
      if (typeof adapter.ping === 'function') {
        await adapter.ping();
      } else if (typeof adapter.getDb === 'function') {
        const db = adapter.getDb();
        if (db && typeof db.prepare === 'function') {
          db.prepare('SELECT 1').get();
        }
      }
      
      this._databaseUp = true;
      return true;
    } catch (e) {
      this._databaseUp = false;
      this._log('error', 'Database connectivity check failed', { error: e.message });
      return false;
    }
  }

  /**
   * Run full diagnostic suite
   * @returns {Promise<Object>}
   */
  async runDiagnostics() {
    const results = {
      timestamp: new Date().toISOString(),
      network: await this.checkNetwork(),
      database: await this.checkDatabase(),
      memory: this._checkMemory(),
      circuits: this._getCircuitSummary()
    };
    
    results.healthy = results.network && results.database && results.memory.ok;
    
    return results;
  }

  // ========================
  // Private Methods
  // ========================

  /**
   * @private
   */
  _checkHeartbeat() {
    if (this._paused || this._disposed) return;
    
    const now = Date.now();
    const staleMs = now - this._lastActivityAt;
    this._lastHeartbeatCheck = now;
    
    if (staleMs > this.config.stallThresholdMs) {
      this._handleStall(staleMs);
    }
    
    // Check memory
    const memCheck = this._checkMemory();
    if (!memCheck.ok) {
      this._handleMemoryPressure(memCheck);
    }
  }

  /**
   * @private
   */
  async _handleStall(staleMs) {
    this._consecutiveStalls++;
    this._stats.stallsDetected++;
    
    this._log('warn', 'Stall detected', {
      staleMs,
      consecutiveStalls: this._consecutiveStalls
    });
    
    if (this.telemetry) {
      try {
        this.telemetry.problem({
          kind: 'stall-detected',
          message: `Crawler stalled: ${Math.round(staleMs / 1000)}s since last activity`,
          details: { staleMs, consecutiveStalls: this._consecutiveStalls }
        });
      } catch (e) {}
    }
    
    // Run diagnostics
    const networkUp = await this.checkNetwork();
    
    if (!networkUp) {
      this._log('warn', 'Network down during stall - entering wait mode');
      if (this.onNetworkDown) {
        try {
          await this.onNetworkDown();
        } catch (e) {}
      }
    }
    
    // Check for fatal stall condition
    if (this._consecutiveStalls >= this.config.maxConsecutiveStalls) {
      this._handleFatalCondition('max-stalls-exceeded', {
        consecutiveStalls: this._consecutiveStalls,
        threshold: this.config.maxConsecutiveStalls
      });
    } else if (this.onStallDetected) {
      try {
        await this.onStallDetected({
          staleMs,
          consecutiveStalls: this._consecutiveStalls,
          networkUp
        });
      } catch (e) {}
    }
  }

  /**
   * @private
   */
  _handleMemoryPressure(memCheck) {
    this._log('warn', 'Memory pressure detected', memCheck);
    
    if (this.telemetry) {
      try {
        this.telemetry.problem({
          kind: 'memory-pressure',
          message: `High memory usage: ${memCheck.usedMb}MB (threshold: ${memCheck.thresholdMb}MB)`,
          details: memCheck
        });
      } catch (e) {}
    }
    
    // Suggest GC if available
    if (global.gc) {
      try {
        global.gc();
        this._log('info', 'Triggered garbage collection');
      } catch (e) {}
    }
    
    // Check if critical
    if (memCheck.usedMb > memCheck.thresholdMb * 1.5) {
      this._handleFatalCondition('memory-critical', memCheck);
    }
  }

  /**
   * @private
   */
  _handleFatalCondition(reason, details) {
    this._log('error', `Fatal condition: ${reason}`, details);
    
    if (this.telemetry) {
      try {
        this.telemetry.problem({
          kind: 'fatal-condition',
          message: `Unrecoverable state: ${reason}`,
          details
        });
      } catch (e) {}
    }
    
    if (this.onFatalCondition) {
      try {
        this.onFatalCondition({ reason, details });
      } catch (e) {}
    }
  }

  /**
   * @private
   */
  _checkMemory() {
    const usage = process.memoryUsage();
    const usedMb = Math.round(usage.heapUsed / 1024 / 1024);
    const thresholdMb = this.config.memoryThresholdMb;
    
    return {
      usedMb,
      thresholdMb,
      ok: usedMb < thresholdMb,
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
      external: Math.round(usage.external / 1024 / 1024)
    };
  }

  /**
   * @private
   */
  async _pingHost(host) {
    return new Promise((resolve, reject) => {
      const timeout = this.config.networkCheckTimeoutMs;
      
      dns.lookup(host, { timeout })
        .then(() => resolve(true))
        .catch(reject);
    });
  }

  /**
   * @private
   */
  _getOrCreateCircuit(host) {
    if (!this._circuits.has(host)) {
      this._circuits.set(host, {
        state: CircuitState.CLOSED,
        failures: 0,
        lastFailure: 0,
        openedAt: 0,
        successes: 0
      });
    }
    return this._circuits.get(host);
  }

  /**
   * @private
   */
  _getCircuitSummary() {
    const summary = {
      total: this._circuits.size,
      closed: 0,
      open: 0,
      halfOpen: 0,
      openDomains: []
    };
    
    for (const [host, circuit] of this._circuits) {
      if (circuit.state === CircuitState.CLOSED) summary.closed++;
      else if (circuit.state === CircuitState.OPEN) {
        summary.open++;
        summary.openDomains.push(host);
      }
      else if (circuit.state === CircuitState.HALF_OPEN) summary.halfOpen++;
    }
    
    return summary;
  }

  /**
   * @private
   */
  _log(level, message, details) {
    const entry = {
      service: 'ResilienceService',
      level,
      message,
      timestamp: new Date().toISOString(),
      ...details
    };
    
    if (this.logger && typeof this.logger[level] === 'function') {
      this.logger[level](`[Resilience] ${message}`, details || '');
    }
  }
}

module.exports = { ResilienceService, CircuitState };
