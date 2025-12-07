'use strict';

/**
 * Crawler Telemetry Module
 * 
 * This module provides a standardized abstraction layer for crawler-to-UI
 * communication. It ensures that UI components can display crawl progress
 * consistently, regardless of the underlying crawler implementation.
 * 
 * Architecture:
 * 
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │                    CRAWLER (any implementation)                   │
 *   │  CrawlOrchestrator, SimpleRunner, or future crawlers             │
 *   └────────────────────────────┬─────────────────────────────────────┘
 *                                │ EventEmitter events
 *                                ▼
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │                   CrawlTelemetryBridge                           │
 *   │  - Normalizes events to standard schema                          │
 *   │  - Batches high-frequency events                                 │
 *   │  - Maintains history for late-joining clients                    │
 *   │  - Broadcasts via callback (typically to SSE)                    │
 *   └────────────────────────────┬─────────────────────────────────────┘
 *                                │ Standard telemetry events
 *                                ▼
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │                   SSE Transport (server)                          │
 *   │  Express endpoint: /api/events                                   │
 *   └────────────────────────────┬─────────────────────────────────────┘
 *                                │ EventSource stream
 *                                ▼
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │                 CrawlDisplayAdapter (client)                     │
 *   │  - Parses telemetry events                                       │
 *   │  - Maintains normalized UI state                                 │
 *   │  - Provides callbacks for UI updates                             │
 *   └────────────────────────────┬─────────────────────────────────────┘
 *                                │ State updates
 *                                ▼
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │                    UI Components                                  │
 *   │  Progress bars, phase indicators, logs, metrics                  │
 *   └──────────────────────────────────────────────────────────────────┘
 * 
 * Usage:
 * 
 *   // Server-side (setup)
 *   const { CrawlTelemetryBridge } = require('./telemetry');
 *   
 *   const bridge = new CrawlTelemetryBridge({
 *     broadcast: (event) => sseClients.forEach(c => c.write(event)),
 *     maxHistorySize: 500
 *   });
 *   
 *   // Connect any EventEmitter-based crawler
 *   const orchestrator = new CrawlOrchestrator(...);
 *   const disconnect = bridge.connectCrawler(orchestrator);
 *   
 *   // Or emit events manually
 *   bridge.emitProgress({
 *     jobId: 'job-123',
 *     visited: 100,
 *     queued: 50
 *   });
 *   
 *   // Cleanup
 *   disconnect();
 *   bridge.destroy();
 *   
 *   // Client-side (browser)
 *   <script src="/js/crawlDisplayAdapter.js"></script>
 *   <script>
 *   const adapter = CrawlDisplayAdapter.create({
 *     onStateChange: (state) => updateDashboard(state),
 *     onProgress: (progress) => updateProgressBar(progress),
 *     onPhaseChange: (phase, display) => updatePhaseIndicator(display)
 *   });
 *   
 *   const eventSource = new EventSource('/api/events');
 *   eventSource.onmessage = (evt) => {
 *     const data = JSON.parse(evt.data);
 *     if (data.type?.startsWith('crawl:')) {
 *       adapter.handleEvent(data);
 *     }
 *   };
 *   </script>
 * 
 * @module src/crawler/telemetry
 */

const {
  CRAWL_PHASES,
  CRAWL_EVENT_TYPES,
  SEVERITY_LEVELS,
  SCHEMA_VERSION,
  createTelemetryEvent,
  createProgressEvent,
  createPhaseChangeEvent,
  createGoalSatisfiedEvent,
  createBudgetEvent,
  createWorkerScaledEvent,
  createUrlVisitedEvent,
  createUrlErrorEvent,
  formatPhaseName,
  isValidTelemetryEvent
} = require('./CrawlTelemetrySchema');

const { CrawlTelemetryBridge } = require('./CrawlTelemetryBridge');
const { TelemetryIntegration } = require('./TelemetryIntegration');

module.exports = {
  // Schema
  CRAWL_PHASES,
  CRAWL_EVENT_TYPES,
  SEVERITY_LEVELS,
  SCHEMA_VERSION,
  
  // Event factories
  createTelemetryEvent,
  createProgressEvent,
  createPhaseChangeEvent,
  createGoalSatisfiedEvent,
  createBudgetEvent,
  createWorkerScaledEvent,
  createUrlVisitedEvent,
  createUrlErrorEvent,
  
  // Utilities
  formatPhaseName,
  isValidTelemetryEvent,
  
  // Bridge
  CrawlTelemetryBridge,
  
  // Server integration
  TelemetryIntegration
};
