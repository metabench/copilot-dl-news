'use strict';

/**
 * BottleneckDetector — Identifies slow phases in crawl profiles
 * 
 * Analyzes multiple profile results to detect patterns, identify
 * systemic bottlenecks, and provide optimization recommendations.
 * 
 * @module BottleneckDetector
 */

const { EventEmitter } = require('events');

/**
 * @typedef {Object} BottleneckAnalysis
 * @property {string} phase - Phase name
 * @property {number} avgDuration - Average duration in ms
 * @property {number} p50 - 50th percentile (median)
 * @property {number} p95 - 95th percentile
 * @property {number} p99 - 99th percentile
 * @property {number} maxDuration - Maximum observed duration
 * @property {number} minDuration - Minimum observed duration
 * @property {number} stdDev - Standard deviation
 * @property {number} percentOfTotal - Percentage of total time
 * @property {number} sampleCount - Number of samples
 */

/**
 * @typedef {Object} Bottleneck
 * @property {string} phase - Phase name
 * @property {string} severity - 'critical' | 'high' | 'medium' | 'low'
 * @property {number} score - Bottleneck score (0-100)
 * @property {string} reason - Human-readable explanation
 * @property {string[]} recommendations - Suggested fixes
 */

/**
 * @typedef {Object} DetectionResult
 * @property {Bottleneck[]} bottlenecks - Detected bottlenecks sorted by severity
 * @property {Object<string, BottleneckAnalysis>} analysis - Per-phase analysis
 * @property {number} totalSamples - Number of profiles analyzed
 * @property {number} avgTotalTime - Average total crawl time
 * @property {Object} healthScore - Overall health metrics
 */

/**
 * Thresholds for bottleneck detection
 */
const DEFAULT_THRESHOLDS = {
  // Phase-specific thresholds (ms)
  dns: { warn: 100, critical: 500 },
  tcp: { warn: 100, critical: 500 },
  tls: { warn: 200, critical: 1000 },
  firstByte: { warn: 500, critical: 2000 },
  download: { warn: 1000, critical: 5000 },
  parseHtml: { warn: 100, critical: 500 },
  extract: { warn: 200, critical: 1000 },
  dbWrite: { warn: 50, critical: 200 },
  
  // Percentage thresholds
  percentOfTotalWarn: 40,
  percentOfTotalCritical: 60,
  
  // Variance thresholds
  highVarianceCoeff: 0.5, // coefficient of variation
  
  // Health score thresholds
  healthGood: 80,
  healthFair: 60
};

/**
 * Phase-specific optimization recommendations
 */
const RECOMMENDATIONS = {
  dns: [
    'Enable DNS caching',
    'Use DNS-over-HTTPS for reliability',
    'Consider local DNS resolver',
    'Check DNS provider latency'
  ],
  tcp: [
    'Enable TCP keepalive',
    'Consider HTTP/2 connection reuse',
    'Check network routing',
    'Reduce concurrent connections if hitting limits'
  ],
  tls: [
    'Enable TLS session resumption',
    'Use HTTP/2 for connection multiplexing',
    'Check TLS certificate chain length',
    'Consider TLS 1.3 for faster handshakes'
  ],
  firstByte: [
    'Server may be under load',
    'Check origin server performance',
    'Consider CDN for static content',
    'Verify no upstream proxy delays'
  ],
  download: [
    'Enable compression (gzip/brotli)',
    'Check bandwidth limitations',
    'Consider streaming parsing',
    'Verify content size is expected'
  ],
  parseHtml: [
    'Use streaming HTML parser',
    'Reduce DOM complexity processing',
    'Check for parsing errors causing retries',
    'Consider pre-filtering unnecessary content'
  ],
  extract: [
    'Optimize XPath/CSS selectors',
    'Cache compiled selectors',
    'Reduce extraction scope',
    'Consider parallel extraction'
  ],
  dbWrite: [
    'Use batch inserts',
    'Check database connection pool',
    'Verify indexes on write paths',
    'Consider async/buffered writes'
  ]
};

class BottleneckDetector extends EventEmitter {
  /**
   * @param {Object} [options]
   * @param {Object} [options.thresholds] - Custom thresholds
   * @param {Object} [options.logger=console] - Logger instance
   */
  constructor(options = {}) {
    super();
    
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };
    this.logger = options.logger || console;
    
    /** @type {Map<string, number[]>} */
    this._phaseSamples = new Map();
    
    /** @type {number[]} */
    this._totalTimeSamples = [];
  }

  /**
   * Add a profile for analysis
   * 
   * @param {Object} profile - Profile result from CrawlProfiler
   * @param {Object<string, number>} profile.phases - Phase durations
   * @param {number} profile.total - Total duration
   */
  addProfile(profile) {
    if (!profile || !profile.phases) {
      throw new Error('Invalid profile: missing phases');
    }
    
    for (const [phase, duration] of Object.entries(profile.phases)) {
      if (!this._phaseSamples.has(phase)) {
        this._phaseSamples.set(phase, []);
      }
      this._phaseSamples.get(phase).push(duration);
    }
    
    if (typeof profile.total === 'number') {
      this._totalTimeSamples.push(profile.total);
    }
    
    this.emit('profile:added', { phases: Object.keys(profile.phases) });
  }

  /**
   * Detect bottlenecks from accumulated profiles
   * 
   * @returns {DetectionResult}
   */
  detect() {
    const analysis = {};
    const bottlenecks = [];
    
    // Analyze each phase
    for (const [phase, samples] of this._phaseSamples) {
      if (samples.length === 0) continue;
      
      const phaseAnalysis = this._analyzePhase(phase, samples);
      analysis[phase] = phaseAnalysis;
      
      // Check for bottlenecks
      const bottleneck = this._detectPhaseBottleneck(phase, phaseAnalysis);
      if (bottleneck) {
        bottlenecks.push(bottleneck);
      }
    }
    
    // Sort bottlenecks by severity score
    bottlenecks.sort((a, b) => b.score - a.score);
    
    // Calculate health score
    const healthScore = this._calculateHealthScore(analysis, bottlenecks);
    
    const avgTotalTime = this._totalTimeSamples.length > 0
      ? this._calculateMean(this._totalTimeSamples)
      : Object.values(analysis).reduce((sum, a) => sum + a.avgDuration, 0);
    
    return {
      bottlenecks,
      analysis,
      totalSamples: this._totalTimeSamples.length || Math.max(...[...this._phaseSamples.values()].map(s => s.length), 0),
      avgTotalTime: Math.round(avgTotalTime * 100) / 100,
      healthScore
    };
  }

  /**
   * Analyze a single phase
   * 
   * @param {string} phase - Phase name
   * @param {number[]} samples - Duration samples
   * @returns {BottleneckAnalysis}
   * @private
   */
  _analyzePhase(phase, samples) {
    const sorted = [...samples].sort((a, b) => a - b);
    const mean = this._calculateMean(samples);
    const stdDev = this._calculateStdDev(samples, mean);
    
    // Calculate total time for percentage
    const totalTime = this._totalTimeSamples.length > 0
      ? this._calculateMean(this._totalTimeSamples)
      : [...this._phaseSamples.values()].reduce((sum, s) => sum + this._calculateMean(s), 0);
    
    return {
      phase,
      avgDuration: Math.round(mean * 100) / 100,
      p50: this._percentile(sorted, 50),
      p95: this._percentile(sorted, 95),
      p99: this._percentile(sorted, 99),
      maxDuration: Math.max(...samples),
      minDuration: Math.min(...samples),
      stdDev: Math.round(stdDev * 100) / 100,
      percentOfTotal: totalTime > 0 ? Math.round((mean / totalTime) * 10000) / 100 : 0,
      sampleCount: samples.length
    };
  }

  /**
   * Detect if a phase is a bottleneck
   * 
   * @param {string} phase - Phase name
   * @param {BottleneckAnalysis} analysis - Phase analysis
   * @returns {Bottleneck|null}
   * @private
   */
  _detectPhaseBottleneck(phase, analysis) {
    const threshold = this.thresholds[phase] || { warn: 500, critical: 2000 };
    const reasons = [];
    let score = 0;
    
    // Check absolute duration
    if (analysis.p95 >= threshold.critical) {
      score += 40;
      reasons.push(`P95 duration (${analysis.p95}ms) exceeds critical threshold (${threshold.critical}ms)`);
    } else if (analysis.p95 >= threshold.warn) {
      score += 20;
      reasons.push(`P95 duration (${analysis.p95}ms) exceeds warning threshold (${threshold.warn}ms)`);
    }
    
    // Check percentage of total
    if (analysis.percentOfTotal >= this.thresholds.percentOfTotalCritical) {
      score += 30;
      reasons.push(`Consumes ${analysis.percentOfTotal}% of total time (>${this.thresholds.percentOfTotalCritical}%)`);
    } else if (analysis.percentOfTotal >= this.thresholds.percentOfTotalWarn) {
      score += 15;
      reasons.push(`Consumes ${analysis.percentOfTotal}% of total time (>${this.thresholds.percentOfTotalWarn}%)`);
    }
    
    // Check variance
    const coeffOfVariation = analysis.avgDuration > 0 ? analysis.stdDev / analysis.avgDuration : 0;
    if (coeffOfVariation >= this.thresholds.highVarianceCoeff) {
      score += 15;
      reasons.push(`High variance (CV=${Math.round(coeffOfVariation * 100)}%) indicates inconsistent performance`);
    }
    
    // Check P99 vs P50 ratio (tail latency)
    if (analysis.p50 > 0 && analysis.p99 / analysis.p50 > 5) {
      score += 15;
      reasons.push(`Tail latency issue: P99 is ${Math.round(analysis.p99 / analysis.p50)}x P50`);
    }
    
    if (score === 0) return null;
    
    const severity = score >= 60 ? 'critical' : score >= 40 ? 'high' : score >= 20 ? 'medium' : 'low';
    
    return {
      phase,
      severity,
      score,
      reason: reasons.join('; '),
      recommendations: RECOMMENDATIONS[phase] || ['No specific recommendations available']
    };
  }

  /**
   * Calculate overall health score
   * 
   * @param {Object<string, BottleneckAnalysis>} analysis
   * @param {Bottleneck[]} bottlenecks
   * @returns {Object}
   * @private
   */
  _calculateHealthScore(analysis, bottlenecks) {
    let score = 100;
    
    // Deduct points for bottlenecks
    for (const b of bottlenecks) {
      switch (b.severity) {
        case 'critical': score -= 25; break;
        case 'high': score -= 15; break;
        case 'medium': score -= 8; break;
        case 'low': score -= 3; break;
      }
    }
    
    score = Math.max(0, score);
    
    const status = score >= this.thresholds.healthGood ? 'good' 
      : score >= this.thresholds.healthFair ? 'fair' 
      : 'poor';
    
    return {
      score,
      status,
      bottleneckCount: bottlenecks.length,
      criticalCount: bottlenecks.filter(b => b.severity === 'critical').length
    };
  }

  /**
   * Get analysis for a specific phase
   * 
   * @param {string} phase - Phase name
   * @returns {BottleneckAnalysis|null}
   */
  getPhaseAnalysis(phase) {
    const samples = this._phaseSamples.get(phase);
    if (!samples || samples.length === 0) return null;
    return this._analyzePhase(phase, samples);
  }

  /**
   * Get comparison between two phases
   * 
   * @param {string} phase1 - First phase
   * @param {string} phase2 - Second phase
   * @returns {Object|null}
   */
  comparePhases(phase1, phase2) {
    const analysis1 = this.getPhaseAnalysis(phase1);
    const analysis2 = this.getPhaseAnalysis(phase2);
    
    if (!analysis1 || !analysis2) return null;
    
    return {
      [phase1]: analysis1,
      [phase2]: analysis2,
      comparison: {
        avgDiff: analysis1.avgDuration - analysis2.avgDuration,
        p95Diff: analysis1.p95 - analysis2.p95,
        faster: analysis1.avgDuration < analysis2.avgDuration ? phase1 : phase2,
        ratio: analysis2.avgDuration > 0 ? analysis1.avgDuration / analysis2.avgDuration : 0
      }
    };
  }

  /**
   * Get trending data (requires time-series samples)
   * 
   * @param {string} phase - Phase name
   * @param {number} windowSize - Moving average window
   * @returns {number[]} Moving averages
   */
  getTrend(phase, windowSize = 5) {
    const samples = this._phaseSamples.get(phase);
    if (!samples || samples.length < windowSize) return [];
    
    const trend = [];
    for (let i = windowSize - 1; i < samples.length; i++) {
      const window = samples.slice(i - windowSize + 1, i + 1);
      trend.push(this._calculateMean(window));
    }
    return trend;
  }

  /**
   * Reset all accumulated data
   */
  reset() {
    this._phaseSamples.clear();
    this._totalTimeSamples = [];
  }

  /**
   * Get sample count
   * @returns {number}
   */
  getSampleCount() {
    return this._totalTimeSamples.length;
  }

  // ─── Statistics Helpers ────────────────────────────────────────────

  /**
   * @private
   */
  _calculateMean(samples) {
    if (samples.length === 0) return 0;
    return samples.reduce((sum, v) => sum + v, 0) / samples.length;
  }

  /**
   * @private
   */
  _calculateStdDev(samples, mean) {
    if (samples.length < 2) return 0;
    const squaredDiffs = samples.map(v => Math.pow(v - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / samples.length);
  }

  /**
   * @private
   */
  _percentile(sortedSamples, p) {
    if (sortedSamples.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedSamples.length) - 1;
    return sortedSamples[Math.max(0, Math.min(index, sortedSamples.length - 1))];
  }
}

module.exports = { BottleneckDetector, DEFAULT_THRESHOLDS, RECOMMENDATIONS };
