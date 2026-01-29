'use strict';

/**
 * Crawl Profiler Module
 * 
 * High-resolution timing instrumentation for crawl phases with
 * bottleneck detection and report generation.
 * 
 * @module crawler/profiler
 */

const { CrawlProfiler, VALID_PHASES } = require('./CrawlProfiler');
const { BottleneckDetector, DEFAULT_THRESHOLDS, RECOMMENDATIONS } = require('./BottleneckDetector');
const { ProfileReporter } = require('./ProfileReporter');

module.exports = {
  CrawlProfiler,
  BottleneckDetector,
  ProfileReporter,
  VALID_PHASES,
  DEFAULT_THRESHOLDS,
  RECOMMENDATIONS
};
