/**
 * Orchestration Pipeline Module
 * 
 * Pipeline-based orchestration for domain processing and related workflows.
 * 
 * @module src/orchestration/pipeline
 */

const {
  // Step builders
  createNormalizeDomainStep,
  createInitSummaryStep,
  createAssessReadinessStep,
  createSelectPlacesStep,
  createSelectTopicsStep,
  createCheckProcessableStep,
  createProcessHubTypesStep,
  createFinalizeSummaryStep,
  
  // Pipeline builders
  buildDomainProcessingSteps,
  processDomainPipeline
} = require('./domainProcessingPipeline');

module.exports = {
  // Domain processing step builders
  createNormalizeDomainStep,
  createInitSummaryStep,
  createAssessReadinessStep,
  createSelectPlacesStep,
  createSelectTopicsStep,
  createCheckProcessableStep,
  createProcessHubTypesStep,
  createFinalizeSummaryStep,
  
  // Domain processing pipeline
  buildDomainProcessingSteps,
  processDomainPipeline
};
