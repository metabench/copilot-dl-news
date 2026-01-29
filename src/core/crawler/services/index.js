'use strict';

/**
 * Service layer exports.
 *
 * Provides:
 * - ServiceContainer: Lightweight DI container
 * - wireServices: Factory to create fully-wired containers
 * - createTestContainer: Minimal container for testing
 * - Service group registrars for custom composition
 * - ResilienceService: Internal self-monitoring and circuit breakers (Phase 1)
 * - ContentValidationService: Garbage content filtering (Phase 1)
 */

const ServiceContainer = require('./ServiceContainer');
const { wireServices, createTestContainer } = require('./wireServices');

// Service group registrars
const { registerPolicyServices } = require('./groups/PolicyServices');
const { registerPlanningServices } = require('./groups/PlanningServices');
const { registerProcessingServices } = require('./groups/ProcessingServices');
const { registerTelemetryServices } = require('./groups/TelemetryServices');
const { registerStorageServices } = require('./groups/StorageServices');

// Phase 1: Resilience services
const { ResilienceService, CircuitState } = require('./ResilienceService');
const { ContentValidationService } = require('./ContentValidationService');

// Phase 1: Discovery services
const { ArchiveDiscoveryStrategy } = require('./ArchiveDiscoveryStrategy');
const { PaginationPredictorService } = require('./PaginationPredictorService');

module.exports = {
  // Core
  ServiceContainer,
  wireServices,
  createTestContainer,

  // Group registrars (for custom composition)
  registerPolicyServices,
  registerPlanningServices,
  registerProcessingServices,
  registerTelemetryServices,
  registerStorageServices,
  
  // Phase 1: Resilience
  ResilienceService,
  CircuitState,
  ContentValidationService,
  
  // Phase 1: Discovery
  ArchiveDiscoveryStrategy,
  PaginationPredictorService
};
