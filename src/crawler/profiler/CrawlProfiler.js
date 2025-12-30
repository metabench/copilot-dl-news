'use strict';

/**
 * CrawlProfiler — High-resolution timing instrumentation for crawl phases
 * 
 * Tracks timing of individual crawl phases with nanosecond precision using
 * process.hrtime.bigint(). Supports nested phases, memory tracking, and
 * aggregate statistics.
 * 
 * Phases tracked:
 * - dns: DNS lookup time
 * - tcp: TCP connection establishment
 * - tls: TLS/SSL handshake
 * - firstByte: Time to first byte (TTFB)
 * - download: Content download time
 * - parseHtml: HTML parsing time
 * - extract: Content extraction time
 * - dbWrite: Database write time
 * 
 * @module CrawlProfiler
 * @example
 * const profiler = new CrawlProfiler();
 * profiler.start('dns');
 * await dns.lookup(domain);
 * profiler.end('dns');
 * 
 * const profile = profiler.getProfile();
 * // { phases: { dns: 45 }, total: 45, bottleneck: 'dns' }
 */

const { EventEmitter } = require('events');

/**
 * Valid phase names for the profiler
 * @type {string[]}
 */
const VALID_PHASES = [
  'dns',
  'tcp',
  'tls',
  'firstByte',
  'download',
  'parseHtml',
  'extract',
  'dbWrite'
];

/**
 * @typedef {Object} PhaseData
 * @property {bigint} startTime - Start time in nanoseconds
 * @property {bigint|null} endTime - End time in nanoseconds
 * @property {number} durationMs - Duration in milliseconds
 * @property {number} startMemoryMB - Memory usage at start (MB)
 * @property {number} endMemoryMB - Memory usage at end (MB)
 * @property {string|null} parentPhase - Parent phase name for nesting
 * @property {boolean} completed - Whether the phase has completed
 */

/**
 * @typedef {Object} ProfileResult
 * @property {Object<string, number>} phases - Phase durations in ms
 * @property {number} total - Total duration in ms
 * @property {string|null} bottleneck - Slowest phase name
 * @property {Object<string, number>} memory - Memory delta per phase (MB)
 * @property {Object} metadata - Additional metadata
 */

class CrawlProfiler extends EventEmitter {
  /**
   * @param {Object} [options]
   * @param {boolean} [options.trackMemory=true] - Track memory usage per phase
   * @param {Object} [options.logger=console] - Logger instance
   * @param {string} [options.crawlId] - Unique crawl identifier
   */
  constructor(options = {}) {
    super();
    
    this.trackMemory = options.trackMemory !== false;
    this.logger = options.logger || console;
    this.crawlId = options.crawlId || null;
    
    /** @type {Map<string, PhaseData>} */
    this._phases = new Map();
    
    /** @type {string[]} */
    this._phaseStack = [];
    
    /** @type {bigint|null} */
    this._profileStart = null;
    
    /** @type {bigint|null} */
    this._profileEnd = null;
    
    /** @type {Object} */
    this._metadata = {};
    
    /** @type {boolean} */
    this._finalized = false;
  }

  /**
   * Start timing a phase
   * 
   * @param {string} phaseName - Name of the phase to start
   * @param {Object} [options]
   * @param {string} [options.parentPhase] - Parent phase for nesting
   * @throws {Error} If phase is invalid or already started
   */
  start(phaseName, options = {}) {
    if (this._finalized) {
      throw new Error('Profiler has been finalized, cannot start new phases');
    }
    
    if (!VALID_PHASES.includes(phaseName)) {
      throw new Error(`Invalid phase name: ${phaseName}. Valid phases: ${VALID_PHASES.join(', ')}`);
    }
    
    if (this._phases.has(phaseName) && !this._phases.get(phaseName).completed) {
      throw new Error(`Phase '${phaseName}' is already running`);
    }
    
    const now = process.hrtime.bigint();
    
    // Track overall profile start
    if (this._profileStart === null) {
      this._profileStart = now;
    }
    
    const memoryUsage = this.trackMemory ? this._getMemoryMB() : 0;
    
    /** @type {PhaseData} */
    const phaseData = {
      startTime: now,
      endTime: null,
      durationMs: 0,
      startMemoryMB: memoryUsage,
      endMemoryMB: 0,
      parentPhase: options.parentPhase || (this._phaseStack.length > 0 ? this._phaseStack[this._phaseStack.length - 1] : null),
      completed: false
    };
    
    this._phases.set(phaseName, phaseData);
    this._phaseStack.push(phaseName);
    
    this.emit('phase:start', { phase: phaseName, crawlId: this.crawlId });
  }

  /**
   * End timing a phase
   * 
   * @param {string} phaseName - Name of the phase to end
   * @returns {number} Duration in milliseconds
   * @throws {Error} If phase was not started
   */
  end(phaseName) {
    if (!this._phases.has(phaseName)) {
      throw new Error(`Phase '${phaseName}' was not started`);
    }
    
    const phase = this._phases.get(phaseName);
    if (phase.completed) {
      throw new Error(`Phase '${phaseName}' has already ended`);
    }
    
    const now = process.hrtime.bigint();
    phase.endTime = now;
    phase.durationMs = Number(now - phase.startTime) / 1_000_000;
    phase.completed = true;
    
    if (this.trackMemory) {
      phase.endMemoryMB = this._getMemoryMB();
    }
    
    // Remove from stack
    const stackIndex = this._phaseStack.lastIndexOf(phaseName);
    if (stackIndex !== -1) {
      this._phaseStack.splice(stackIndex, 1);
    }
    
    // Track overall profile end
    this._profileEnd = now;
    
    this.emit('phase:end', { 
      phase: phaseName, 
      durationMs: phase.durationMs,
      crawlId: this.crawlId 
    });
    
    return phase.durationMs;
  }

  /**
   * Time a function execution as a phase
   * 
   * @template T
   * @param {string} phaseName - Phase name
   * @param {() => T | Promise<T>} fn - Function to execute
   * @returns {Promise<T>} Function result
   */
  async time(phaseName, fn) {
    this.start(phaseName);
    try {
      const result = await fn();
      return result;
    } finally {
      this.end(phaseName);
    }
  }

  /**
   * Record a phase duration without start/end (for external timing)
   * 
   * @param {string} phaseName - Phase name
   * @param {number} durationMs - Duration in milliseconds
   * @param {Object} [options]
   * @param {number} [options.memoryDeltaMB] - Memory change during phase
   */
  record(phaseName, durationMs, options = {}) {
    if (!VALID_PHASES.includes(phaseName)) {
      throw new Error(`Invalid phase name: ${phaseName}`);
    }
    
    const now = process.hrtime.bigint();
    
    if (this._profileStart === null) {
      this._profileStart = now - BigInt(Math.round(durationMs * 1_000_000));
    }
    
    /** @type {PhaseData} */
    const phaseData = {
      startTime: now - BigInt(Math.round(durationMs * 1_000_000)),
      endTime: now,
      durationMs,
      startMemoryMB: 0,
      endMemoryMB: options.memoryDeltaMB || 0,
      parentPhase: null,
      completed: true
    };
    
    this._phases.set(phaseName, phaseData);
    this._profileEnd = now;
  }

  /**
   * Get the profile results
   * 
   * @returns {ProfileResult}
   */
  getProfile() {
    const phases = {};
    const memory = {};
    let total = 0;
    let bottleneck = null;
    let maxDuration = 0;
    
    for (const [name, data] of this._phases) {
      if (data.completed) {
        phases[name] = data.durationMs;
        total += data.durationMs;
        
        if (data.durationMs > maxDuration) {
          maxDuration = data.durationMs;
          bottleneck = name;
        }
        
        if (this.trackMemory) {
          memory[name] = data.endMemoryMB - data.startMemoryMB;
        }
      }
    }
    
    return {
      phases,
      total: Math.round(total * 100) / 100,
      bottleneck,
      memory: this.trackMemory ? memory : {},
      metadata: {
        crawlId: this.crawlId,
        timestamp: new Date().toISOString(),
        phaseCount: this._phases.size,
        completedPhases: Object.keys(phases).length,
        ...this._metadata
      }
    };
  }

  /**
   * Get timing for a specific phase
   * 
   * @param {string} phaseName - Phase name
   * @returns {number|null} Duration in ms or null if not recorded
   */
  getPhaseTime(phaseName) {
    const phase = this._phases.get(phaseName);
    return phase?.completed ? phase.durationMs : null;
  }

  /**
   * Get current running phase(s)
   * 
   * @returns {string[]} Array of running phase names
   */
  getRunningPhases() {
    return [...this._phaseStack];
  }

  /**
   * Check if a phase has been recorded
   * 
   * @param {string} phaseName - Phase name
   * @returns {boolean}
   */
  hasPhase(phaseName) {
    return this._phases.has(phaseName);
  }

  /**
   * Add metadata to the profile
   * 
   * @param {string} key - Metadata key
   * @param {*} value - Metadata value
   */
  addMetadata(key, value) {
    this._metadata[key] = value;
  }

  /**
   * Finalize the profiler (prevents further modifications)
   * 
   * @returns {ProfileResult}
   */
  finalize() {
    // End any running phases
    for (const phaseName of [...this._phaseStack]) {
      this.logger.warn(`[CrawlProfiler] Force-ending uncompleted phase: ${phaseName}`);
      this.end(phaseName);
    }
    
    this._finalized = true;
    return this.getProfile();
  }

  /**
   * Reset the profiler for reuse
   */
  reset() {
    this._phases.clear();
    this._phaseStack = [];
    this._profileStart = null;
    this._profileEnd = null;
    this._metadata = {};
    this._finalized = false;
  }

  /**
   * Create a child profiler for nested operations
   * 
   * @param {string} [childId] - Child profiler identifier
   * @returns {CrawlProfiler}
   */
  createChild(childId) {
    return new CrawlProfiler({
      trackMemory: this.trackMemory,
      logger: this.logger,
      crawlId: childId || `${this.crawlId}-child`
    });
  }

  /**
   * Merge another profiler's results into this one
   * 
   * @param {CrawlProfiler} other - Profiler to merge
   * @param {Object} [options]
   * @param {string} [options.prefix] - Prefix for merged phase names
   */
  merge(other, options = {}) {
    const profile = other.getProfile();
    const prefix = options.prefix ? `${options.prefix}:` : '';
    
    for (const [phase, duration] of Object.entries(profile.phases)) {
      // Note: For merge we need to add custom phases, so we bypass validation
      this._phases.set(`${prefix}${phase}`, {
        startTime: 0n,
        endTime: 0n,
        durationMs: duration,
        startMemoryMB: 0,
        endMemoryMB: profile.memory[phase] || 0,
        parentPhase: null,
        completed: true
      });
    }
  }

  /**
   * Get memory usage in MB
   * @private
   */
  _getMemoryMB() {
    const usage = process.memoryUsage();
    return Math.round((usage.heapUsed / 1024 / 1024) * 100) / 100;
  }

  /**
   * Get list of valid phase names
   * @returns {string[]}
   */
  static getValidPhases() {
    return [...VALID_PHASES];
  }
}

module.exports = { CrawlProfiler, VALID_PHASES };
