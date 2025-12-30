'use strict';

/**
 * Teacher Module - Puppeteer-based Visual Analysis
 * 
 * Phase 2 of the Reliable Crawler Roadmap.
 * Provides headless browser rendering for:
 * - JavaScript-dependent pages that fail static crawling
 * - Visual layout analysis and "largest text block" detection
 * - Skeleton hash generation for page structure fingerprinting
 * 
 * @module teacher
 */

const { TeacherService } = require('./TeacherService');
const { VisualAnalyzer } = require('./VisualAnalyzer');
const { SkeletonHasher } = require('./SkeletonHasher');

module.exports = {
  TeacherService,
  VisualAnalyzer,
  SkeletonHasher
};
