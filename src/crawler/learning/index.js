'use strict';

/**
 * Domain Learning Module Index
 * 
 * Exports all components for domain template learning.
 */

const { TemplateGenerator, TITLE_CANDIDATES, CONTENT_CANDIDATES, DATE_CANDIDATES, AUTHOR_CANDIDATES } = require('./TemplateGenerator');
const { TemplateTester } = require('./TemplateTester');
const { ReviewQueue, ReviewStatus } = require('./ReviewQueue');
const { DomainLearningPipeline, DEFAULT_AUTO_APPROVE_THRESHOLD, MIN_SAMPLES } = require('./DomainLearningPipeline');

module.exports = {
  // Main pipeline
  DomainLearningPipeline,
  DEFAULT_AUTO_APPROVE_THRESHOLD,
  MIN_SAMPLES,
  
  // Components
  TemplateGenerator,
  TemplateTester,
  ReviewQueue,
  ReviewStatus,
  
  // Selector candidates
  TITLE_CANDIDATES,
  CONTENT_CANDIDATES,
  DATE_CANDIDATES,
  AUTHOR_CANDIDATES
};
