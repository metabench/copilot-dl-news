# API Server Architecture & Integration Guide

**Document Version:** 1.0  
**Date:** October 31, 2025  
**Status:** Design Document (Pre-Implementation)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architectural Principles](#architectural-principles)
3. [System Layers](#system-layers)
4. [Code Organization](#code-organization)
5. [Modularization Strategy](#modularization-strategy)
6. [Integration Patterns](#integration-patterns)
7. [Implementation Roadmap](#implementation-roadmap)
8. [API Endpoint Specifications](#api-endpoint-specifications)
9. [Testing Strategy](#testing-strategy)
10. [Migration Path](#migration-path)

---

## Executive Summary

### Purpose

This document defines the architecture for integrating a standalone OpenAPI 3.x-compliant API server into the News Crawler project. The API server will provide headless REST endpoints for all major functionality while maintaining clear separation between UI concerns, business logic, and data access.

### Key Objectives

1. **Headless API First**: All functionality accessible via REST API without requiring a UI
2. **Code Reusability**: CLI tools and API routes share the same underlying business logic
3. **Clean Architecture**: Strict layer separation (routes → services → data access)
4. **Zero Duplication**: No logic duplication between CLI tools and API routes
5. **Testability**: Each layer independently testable with clear contracts

### Current State

**Existing Structure:**
```
src/
  ├── tools/                    # CLI tools (high-level interfaces)
  │   ├── guess-place-hubs.js   # ~2700 lines including orchestration
  │   ├── find-place-hubs.js
  │   └── ...
  ├── services/                 # Business logic (analyzers, validators)
  │   ├── CountryHubGapAnalyzer.js
  │   ├── RegionHubGapAnalyzer.js
  │   └── ...
  ├── db/                       # Data access layer
  │   ├── sqlite/v1/queries/    # Query adapters
  │   └── placeHubCandidatesStore.js
  └── deprecated-ui/express/    # Legacy UI server (to be replaced)
```

**Problem**: CLI tools contain orchestration logic that should be shared with API routes.

---

## Architectural Principles

### 1. Layered Architecture

```
┌─────────────────────────────────────────────────┐
│  Interface Layer (User-Facing)                  │
│  - CLI tools (CliFormatter, CliArgumentParser)  │
│  - API routes (Express handlers, Swagger docs)  │
└─────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│  Orchestration Layer (Business Workflows)       │
│  - Workflow orchestrators (batch processing)    │
│  - Coordination logic (multi-step operations)   │
│  - Error handling & retry logic                 │
└─────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│  Service Layer (Domain Logic)                   │
│  - Analyzers (CountryHub, RegionHub, CityHub)  │
│  - Validators (HubValidator)                    │
│  - Pattern matchers, DSPL engines               │
└─────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│  Data Access Layer (Storage)                    │
│  - Query adapters (v1 queries)                  │
│  - Stores (candidates, fetch recorder)          │
│  - Database connections                         │
└─────────────────────────────────────────────────┘
```

### 2. Dependency Flow

- **Downward Only**: Higher layers depend on lower layers, never upward
- **No Lateral Dependencies**: Layers at the same level don't depend on each other
- **Interface-Based**: Lower layers expose clean interfaces, hide implementation details

### 3. Single Responsibility

- **CLI Tools**: Argument parsing + output formatting + progress display
- **API Routes**: Request validation + response formatting + HTTP concerns
- **Orchestrators**: Workflow coordination + batch processing + error handling
- **Services**: Domain logic + business rules + validation
- **Data Access**: SQL queries + database operations + transaction management

### 4. Dependency Injection

All dependencies injected at construction time:

```javascript
// ❌ BAD: Hard-coded dependencies
class MyService {
  constructor() {
    this.db = ensureDb('/path/to/db');  // Hard-coded path
    this.logger = console;               // Global dependency
  }
}

// ✅ GOOD: Injected dependencies
class MyService {
  constructor({ db, logger }) {
    this.db = db;
    this.logger = logger;
  }
}
```

---

## System Layers

### Layer 1: Interface Layer

**Responsibilities:**
- Accept user input (CLI args, HTTP requests)
- Format output (ASCII tables, JSON responses)
- Progress indication (CLI spinners, SSE events)
- Help/documentation generation

**What It Does NOT Do:**
- Business logic
- Database access
- Validation (beyond input schema)
- Orchestration

**Examples:**
- `src/tools/guess-place-hubs.js` (CLI interface)
- `src/api/routes/place-hubs.js` (API interface)

### Layer 2: Orchestration Layer

**Responsibilities:**
- Coordinate multi-step workflows
- Batch processing logic
- Error handling & retry strategies
- Progress tracking
- Summary aggregation

**What It Does NOT Do:**
- Format output (returns structured data)
- Parse arguments (receives options object)
- Direct database access (uses services/stores)

**Examples (To Be Created):**
- `src/orchestration/placeHubGuessing.js`
- `src/orchestration/crawlManagement.js`

**Key Pattern:**
```javascript
// Orchestrator returns structured data
async function guessPlaceHubsBatch(options, deps) {
  // options: { domains, kinds, limit, apply, ... }
  // deps: { db, logger, fetchFn, analyzers, validator, stores }
  
  const results = {
    totals: {},
    domainSummaries: [],
    diffPreview: {},
    errors: []
  };
  
  for (const domain of options.domains) {
    const domainResult = await guessPlaceHubsForDomain(domain, options, deps);
    results.domainSummaries.push(domainResult);
    aggregateTotals(results.totals, domainResult.metrics);
  }
  
  return results;  // Structured data, no formatting
}
```

### Layer 3: Service Layer

**Responsibilities:**
- Domain-specific business logic
- Validation rules
- Pattern matching algorithms
- DSPL (Domain-Specific Pattern Language) processing

**What It Does NOT Do:**
- Orchestrate multi-step workflows
- Format output
- Direct database access (uses query adapters)

**Examples (Existing):**
- `src/services/CountryHubGapAnalyzer.js`
- `src/services/RegionHubGapAnalyzer.js`
- `src/hub-validation/HubValidator.js`

### Layer 4: Data Access Layer

**Responsibilities:**
- SQL query execution
- Transaction management
- Connection pooling
- Schema migrations

**What It Does NOT Do:**
- Business logic
- Validation (beyond schema constraints)
- Orchestration

**Examples (Existing):**
- `src/db/sqlite/v1/queries/guessPlaceHubsQueries.js`
- `src/db/placeHubCandidatesStore.js`
- `src/utils/fetch/fetchRecorder.js`

---

## Code Organization

### New Directory Structure

```
src/
├── api/                              # API server (NEW)
│   ├── server.js                     # Express app setup, Swagger UI
│   ├── openapi.yaml                  # OpenAPI 3.x specification
│   ├── routes/                       # HTTP route handlers
│   │   ├── health.js                 # GET /api/health
│   │   ├── place-hubs.js             # Place hub endpoints
│   │   ├── crawls.js                 # Crawl management endpoints
│   │   ├── analysis.js               # Analysis endpoints
│   │   └── background-tasks.js       # Background task endpoints
│   ├── middleware/                   # Express middleware
│   │   ├── errorHandler.js
│   │   ├── requestLogger.js
│   │   └── validation.js
│   └── __tests__/                    # API integration tests
│       ├── place-hubs.test.js
│       └── health.test.js
│
├── orchestration/                    # Workflow orchestrators (NEW)
│   ├── placeHubGuessing.js           # Hub guessing workflows
│   │   ├── guessPlaceHubsBatch()     # Batch processing
│   │   ├── guessPlaceHubsForDomain() # Single domain
│   │   ├── checkDomainReadiness()    # Readiness checks
│   │   └── aggregateSummary()        # Result aggregation
│   ├── crawlManagement.js            # Crawl orchestration
│   ├── analysisWorkflows.js          # Analysis orchestration
│   └── __tests__/                    # Orchestrator unit tests
│       └── placeHubGuessing.test.js
│
├── services/                         # Domain logic (EXISTING)
│   ├── CountryHubGapAnalyzer.js
│   ├── RegionHubGapAnalyzer.js
│   ├── CityHubGapAnalyzer.js
│   └── ...
│
├── db/                               # Data access (EXISTING)
│   ├── sqlite/v1/queries/
│   └── ...
│
├── tools/                            # CLI tools (REFACTORED)
│   ├── guess-place-hubs.js           # CLI wrapper around orchestrator
│   └── ...
│
└── utils/                            # Shared utilities (EXISTING)
    ├── CliFormatter.js
    ├── CliArgumentParser.js
    └── ...
```

---

## Modularization Strategy

### Refactoring `guess-place-hubs.js`

**Current State** (~2700 lines):
- Argument parsing
- Domain batch building
- Readiness checking
- Place selection
- Hub guessing logic
- Validation
- Diff preview generation
- Report writing
- Summary rendering

**Target State**:

#### 1. Extract Orchestration Logic

**File**: `src/orchestration/placeHubGuessing.js`

```javascript
/**
 * Place Hub Guessing Orchestration
 * 
 * Pure orchestration logic without CLI or API concerns.
 * All functions return structured data objects.
 */

/**
 * Batch hub guessing for multiple domains
 * @param {Object} options - Guessing options
 * @param {string[]} options.domains - Domains to process
 * @param {string[]} options.kinds - Place kinds
 * @param {number} options.limit - Place limit
 * @param {boolean} options.apply - Persist to database
 * @param {Object} deps - Injected dependencies
 * @param {Object} deps.db - Database connection
 * @param {Object} deps.logger - Logger instance
 * @param {Function} deps.fetchFn - Fetch function
 * @param {Object} deps.analyzers - Hub analyzers
 * @param {Object} deps.validator - Hub validator
 * @param {Object} deps.stores - Data stores
 * @returns {Promise<Object>} Structured results
 */
async function guessPlaceHubsBatch(options, deps) {
  const {
    domains,
    kinds = ['country'],
    limit = null,
    apply = false,
    readinessTimeoutSeconds = 10,
    ...otherOptions
  } = options;

  const {
    db,
    logger,
    fetchFn,
    analyzers,
    validator,
    stores
  } = deps;

  // Orchestration logic here
  const startTime = Date.now();
  const results = {
    version: 1,
    generatedAt: new Date().toISOString(),
    run: {
      startedAt: new Date().toISOString(),
      completedAt: null,
      durationMs: null
    },
    batch: {
      totalDomains: domains.length,
      processedDomains: 0
    },
    totals: initializeTotals(),
    domainSummaries: [],
    diffPreview: { inserted: [], updated: [] },
    candidateMetrics: {},
    validationSummary: {},
    errors: []
  };

  for (const domain of domains) {
    try {
      const domainResult = await guessPlaceHubsForDomain(
        domain,
        { ...options, kinds, limit, apply },
        deps
      );
      
      results.domainSummaries.push(domainResult);
      results.batch.processedDomains++;
      
      // Aggregate metrics
      aggregateMetrics(results.totals, domainResult.metrics);
      aggregateDiffPreview(results.diffPreview, domainResult.diffPreview);
      
    } catch (error) {
      logger.error(`Domain ${domain} failed:`, error);
      results.errors.push({
        domain,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Finalize results
  results.run.completedAt = new Date().toISOString();
  results.run.durationMs = Date.now() - startTime;
  results.candidateMetrics = deriveCandidateMetrics(results.totals);
  results.validationSummary = deriveValidationSummary(results.totals);

  return results;  // Pure data object
}

/**
 * Guess place hubs for a single domain
 */
async function guessPlaceHubsForDomain(domain, options, deps) {
  // Single domain processing logic
  // Returns structured data without formatting
}

/**
 * Check domain readiness for hub guessing
 */
async function checkDomainReadiness(domain, options, deps) {
  // Readiness check logic
  // Returns ReadinessStatus object
}

module.exports = {
  guessPlaceHubsBatch,
  guessPlaceHubsForDomain,
  checkDomainReadiness
};
```

#### 2. Refactor CLI Tool

**File**: `src/tools/guess-place-hubs.js` (simplified to ~500 lines)

```javascript
#!/usr/bin/env node

/**
 * Place Hub Guessing CLI
 * 
 * Thin wrapper around orchestration layer.
 * Handles: argument parsing, output formatting, progress display.
 */

const { CliFormatter } = require('../utils/CliFormatter');
const { CliArgumentParser } = require('../utils/CliArgumentParser');
const { guessPlaceHubsBatch } = require('../orchestration/placeHubGuessing');
const { ensureDb } = require('../db/sqlite/ensureDb');
// ... other imports

async function main() {
  // 1. Parse CLI arguments
  const args = parseCliArgs(process.argv.slice(2));
  
  // 2. Prepare dependencies
  const db = ensureDb(args.dbPath);
  const deps = {
    db,
    logger: createLogger(args.verbose),
    fetchFn: createFetchFn(),
    analyzers: createAnalyzers(db),
    validator: createValidator(db),
    stores: createStores(db)
  };

  // 3. Call orchestrator (pure business logic)
  const results = await guessPlaceHubsBatch(args, deps);

  // 4. Format and display output
  if (args.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    const fmt = new CliFormatter();
    renderSummary(fmt, results, args);
  }

  // 5. Write report if requested
  if (args.emitReport) {
    await writeReportFile(results, args);
  }

  // 6. Exit with appropriate code
  process.exit(results.errors.length > 0 ? 1 : 0);
}

function renderSummary(fmt, results, args) {
  fmt.header('Guess Place Hubs');
  
  // Configuration section
  renderConfiguration(fmt, args);
  
  // Results section
  renderResults(fmt, results);
  
  // Diff preview (if apply mode)
  if (args.apply) {
    renderDiffPreview(fmt, results.diffPreview);
  }
  
  // Domain summaries (if batch)
  if (results.batch.totalDomains > 1) {
    renderDomainSummaries(fmt, results.domainSummaries);
  }
  
  fmt.footer();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  main,
  parseCliArgs,
  renderSummary
};
```

#### 3. Create API Route

**File**: `src/api/routes/place-hubs.js`

```javascript
/**
 * Place Hub API Routes
 * 
 * Thin wrapper around orchestration layer.
 * Handles: request validation, response formatting, HTTP concerns.
 */

const express = require('express');
const { guessPlaceHubsBatch, checkDomainReadiness } = require('../../orchestration/placeHubGuessing');
const { ensureDb } = require('../../db/sqlite/ensureDb');
const { createLogger } = require('../../utils/logger');
// ... other imports

function createPlaceHubsRouter(options = {}) {
  const router = express.Router();
  const dbPath = options.dbPath;

  /**
   * POST /api/place-hubs/guess
   * Batch hub guessing
   */
  router.post('/guess', async (req, res, next) => {
    try {
      // 1. Validate request
      const { domains, options: guessOptions = {} } = req.body;
      
      if (!domains || !Array.isArray(domains) || domains.length === 0) {
        return res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'Missing or empty domains array',
          timestamp: new Date().toISOString()
        });
      }

      // 2. Prepare dependencies (same as CLI)
      const db = ensureDb(dbPath);
      const deps = {
        db,
        logger: createLogger(options.verbose),
        fetchFn: createFetchFn(),
        analyzers: createAnalyzers(db),
        validator: createValidator(db),
        stores: createStores(db)
      };

      // 3. Decide sync vs async
      const isAsync = domains.length > 3;
      
      if (isAsync) {
        // Create background job (future feature)
        const jobId = await createBackgroundJob('place-hub-guess', {
          domains,
          options: guessOptions
        });
        
        return res.status(202).json({
          jobId,
          status: 'pending',
          message: `Hub guessing job created for ${domains.length} domains`
        });
      }

      // 4. Synchronous processing (call same orchestrator as CLI)
      const results = await guessPlaceHubsBatch(
        { domains, ...guessOptions },
        deps
      );

      // 5. Return JSON response (no formatting, just data)
      res.status(200).json(results);
      
    } catch (error) {
      next(error);  // Let error handler middleware deal with it
    }
  });

  /**
   * GET /api/place-hubs/readiness/:domain
   * Check domain readiness
   */
  router.get('/readiness/:domain', async (req, res, next) => {
    try {
      const { domain } = req.params;
      const { timeoutSeconds = 10 } = req.query;

      const db = ensureDb(dbPath);
      const deps = {
        db,
        logger: createLogger(false),  // Silent for API
        stores: createStores(db)
      };

      const readiness = await checkDomainReadiness(
        domain,
        { timeoutSeconds: parseInt(timeoutSeconds, 10) },
        deps
      );

      res.status(200).json(readiness);
      
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = {
  createPlaceHubsRouter
};
```

### Key Points

1. **Zero Duplication**: CLI and API both call `guessPlaceHubsBatch()` from orchestration layer
2. **Layer Separation**: Orchestrator knows nothing about CLI or HTTP
3. **Dependency Injection**: All dependencies passed in, no hard-coded imports
4. **Pure Functions**: Orchestrator returns data, caller decides how to present it
5. **Testability**: Each layer can be tested independently

---

## Integration Patterns

### Pattern 1: Shared Orchestrator

```javascript
// src/orchestration/placeHubGuessing.js
async function guessPlaceHubsBatch(options, deps) {
  // Pure orchestration logic
  return results;  // Structured data object
}

// src/tools/guess-place-hubs.js (CLI)
const results = await guessPlaceHubsBatch(cliArgs, cliDeps);
renderToConsole(results);  // CLI-specific formatting

// src/api/routes/place-hubs.js (API)
const results = await guessPlaceHubsBatch(apiOptions, apiDeps);
res.json(results);  // HTTP response
```

### Pattern 2: Dependency Injection Factory

```javascript
// src/orchestration/dependencies.js
function createOrchestrationDependencies(options = {}) {
  const {
    dbPath,
    verbose = false,
    fetchFn = defaultFetchFn
  } = options;

  const db = ensureDb(dbPath);
  const logger = createLogger(verbose);

  return {
    db,
    logger,
    fetchFn,
    analyzers: {
      country: new CountryHubGapAnalyzer({ db, logger }),
      region: new RegionHubGapAnalyzer({ db, logger }),
      city: new CityHubGapAnalyzer({ db, logger })
    },
    validator: new HubValidator(db),
    stores: {
      candidates: createPlaceHubCandidatesStore(db),
      fetchRecorder: createFetchRecorder({ db, logger })
    }
  };
}

// Used by both CLI and API
const deps = createOrchestrationDependencies({ dbPath, verbose });
```

### Pattern 3: Result Transformers

```javascript
// src/utils/resultTransformers.js

/**
 * Transform orchestrator results for CLI display
 */
function transformForCli(results) {
  return {
    ...results,
    // Add CLI-specific fields
    displaySections: buildCliSections(results),
    progressIndicators: buildProgressIndicators(results)
  };
}

/**
 * Transform orchestrator results for API response
 */
function transformForApi(results) {
  return {
    ...results,
    // Add API-specific fields
    _links: buildHateoasLinks(results),
    _metadata: buildResponseMetadata(results)
  };
}
```

### Pattern 4: Error Handling

```javascript
// src/orchestration/errors.js
class OrchestrationError extends Error {
  constructor(message, { code, details, originalError }) {
    super(message);
    this.name = 'OrchestrationError';
    this.code = code;
    this.details = details;
    this.originalError = originalError;
  }
}

// CLI handles orchestration errors
try {
  const results = await guessPlaceHubsBatch(args, deps);
} catch (error) {
  if (error instanceof OrchestrationError) {
    fmt.error(error.message);
    if (args.verbose) {
      fmt.details(error.details);
    }
    process.exit(1);
  }
  throw error;
}

// API handles orchestration errors
router.use((error, req, res, next) => {
  if (error instanceof OrchestrationError) {
    return res.status(error.code === 'INVALID_INPUT' ? 400 : 500).json({
      error: error.code,
      message: error.message,
      details: error.details,
      timestamp: new Date().toISOString()
    });
  }
  next(error);
});
```

---

## Implementation Roadmap

### Phase 1: Extract Orchestration Layer (Week 1)

**Objective**: Create pure orchestration modules without CLI/API concerns

**Tasks**:
1. Create `src/orchestration/placeHubGuessing.js`
   - Extract `guessPlaceHubsBatch()` from CLI tool
   - Extract `guessPlaceHubsForDomain()`
   - Extract `checkDomainReadiness()`
   - Remove all CLI formatting logic
   - Remove all argument parsing logic
   - Accept options object + deps object
   - Return pure data structures

2. Create `src/orchestration/dependencies.js`
   - Factory for creating injected dependencies
   - Shared by CLI and API

3. Create unit tests for orchestrator
   - Mock all dependencies
   - Test batch processing logic
   - Test error handling
   - Test aggregation logic

**Success Criteria**:
- Orchestrator has zero CLI dependencies
- Orchestrator has zero Express dependencies
- All tests pass with mocked dependencies
- No side effects (no console.log, no process.exit)

### Phase 2: Refactor CLI Tools (Week 1-2)

**Objective**: Simplify CLI tools to thin wrappers around orchestrators

**Tasks**:
1. Refactor `src/tools/guess-place-hubs.js`
   - Keep: argument parsing, output formatting
   - Remove: orchestration logic (moved to orchestrator)
   - Call orchestrator with prepared options/deps
   - Format results using CliFormatter
   - Target: reduce from ~2700 to ~500 lines

2. Add CLI integration tests
   - Test argument parsing
   - Test output formatting
   - Test error handling
   - Mock orchestrator to test CLI layer in isolation

**Success Criteria**:
- CLI tool passes all existing tests
- CLI behavior unchanged from user perspective
- CLI code significantly reduced
- Clear separation between CLI concerns and logic

### Phase 3: Build API Routes (Week 2)

**Objective**: Create REST API routes using same orchestrators

**Tasks**:
1. Create `src/api/routes/place-hubs.js`
   - `POST /api/place-hubs/guess` (calls orchestrator)
   - `GET /api/place-hubs/readiness/:domain` (calls orchestrator)
   - Request validation
   - Response formatting
   - Error handling

2. Create API integration tests
   - Use supertest for HTTP testing
   - Test request validation
   - Test response schemas
   - Test error responses
   - Verify OpenAPI spec matches implementation

3. Update OpenAPI spec with actual examples

**Success Criteria**:
- All API endpoints return correct responses
- OpenAPI spec validates successfully
- API integration tests pass
- Swagger UI interactive docs work

### Phase 4: Add Remaining Endpoints (Week 3)

**Objective**: Complete API surface for all major features

**Tasks**:
1. Create crawl management orchestrator
   - Extract from existing crawl code
   - Follow same patterns as place hub orchestrator

2. Create crawl API routes
   - `GET /api/crawls`
   - `POST /api/crawl`
   - `GET /api/crawls/:id`
   - `POST /api/crawls/:id/pause`
   - `POST /api/crawls/:id/resume`

3. Create analysis orchestrator + routes
4. Create background task orchestrator + routes

**Success Criteria**:
- All major features accessible via API
- CLI tools continue working unchanged
- Full OpenAPI documentation
- Complete integration test coverage

### Phase 5: Documentation & Examples (Week 4)

**Objective**: Comprehensive documentation and usage examples

**Tasks**:
1. Write `docs/API_USAGE_GUIDE.md`
   - Getting started
   - Common workflows
   - Authentication (when implemented)
   - Error handling
   - Rate limiting

2. Create API client examples
   - Node.js example script
   - Python example script
   - curl command examples

3. Generate Postman collection from OpenAPI spec

4. Update README.md with API quick start

**Success Criteria**:
- Developers can use API without reading code
- Examples cover 80% of common use cases
- Postman collection works out of box

---

## API Endpoint Specifications

### Place Hub Endpoints

#### POST /api/place-hubs/guess

**Purpose**: Batch hub guessing for one or more domains

**Request Body**:
```json
{
  "domains": ["theguardian.com", "bbc.com"],
  "options": {
    "kinds": ["country", "region", "city"],
    "limit": 10,
    "patternsPerPlace": 3,
    "readinessTimeoutSeconds": 10,
    "apply": false,
    "maxAgeDays": 7,
    "refresh404Days": 180,
    "retry4xxDays": 7
  }
}
```

**Response (Sync - ≤3 domains)**:
```json
{
  "version": 1,
  "generatedAt": "2025-10-31T12:00:00.000Z",
  "run": {
    "startedAt": "2025-10-31T12:00:00.000Z",
    "completedAt": "2025-10-31T12:02:30.000Z",
    "durationMs": 150000
  },
  "batch": {
    "totalDomains": 2,
    "processedDomains": 2
  },
  "totals": {
    "totalPlaces": 20,
    "totalUrls": 60,
    "fetched": 45,
    "cached": 15,
    "validationSucceeded": 38,
    "validationFailed": 7,
    "insertedHubs": 35,
    "updatedHubs": 3,
    "errors": 0
  },
  "diffPreview": {
    "insertedCount": 35,
    "updatedCount": 3,
    "totalChanges": 38,
    "inserted": [
      {
        "url": "https://theguardian.com/world/france",
        "placeKind": "country",
        "placeName": "France",
        "status": "validated"
      }
    ],
    "updated": []
  },
  "candidateMetrics": {
    "generated": 60,
    "cachedHits": 15,
    "cachedKnown404": 5,
    "cachedRecent4xx": 0,
    "duplicates": 0,
    "stored404": 2,
    "fetchedOk": 45,
    "validationPassed": 38,
    "validationFailed": 7,
    "rateLimited": 0,
    "persistedInserts": 35,
    "persistedUpdates": 3
  },
  "validationSummary": {
    "passed": 38,
    "failed": 7,
    "failureReasons": {
      "missing-place-name": 3,
      "low-confidence": 4
    }
  },
  "domainSummaries": [
    {
      "domain": "theguardian.com",
      "status": "processed",
      "readiness": {
        "status": "ready",
        "reason": "Domain has sufficient signals",
        "recommendations": []
      },
      "metrics": {},
      "candidateMetrics": {},
      "validationSummary": {},
      "diffPreview": {},
      "timing": {
        "startedAt": "2025-10-31T12:00:00.000Z",
        "completedAt": "2025-10-31T12:01:15.000Z",
        "durationMs": 75000
      }
    }
  ]
}
```

**Response (Async - >3 domains)**:
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "message": "Hub guessing job created for 10 domains",
  "_links": {
    "self": "/api/background-tasks/550e8400-e29b-41d4-a716-446655440000",
    "status": "/api/background-tasks/550e8400-e29b-41d4-a716-446655440000/status"
  }
}
```

#### GET /api/place-hubs/readiness/:domain

**Purpose**: Check if domain has sufficient data for hub guessing

**Parameters**:
- `domain` (path): Domain or hostname
- `timeoutSeconds` (query): Probe timeout (default: 10)

**Response**:
```json
{
  "status": "ready",
  "reason": "Domain has sufficient signals to attempt hub guessing.",
  "recommendations": [],
  "hasFetchHistory": true,
  "hasStoredHubs": true,
  "hasVerifiedMappings": true,
  "hasCandidates": true,
  "hasVerifiedPatterns": true,
  "latestDetermination": {
    "status": "processed",
    "reason": "Domain processed successfully",
    "timestamp": "2025-10-30T23:32:39.000Z"
  },
  "metrics": {
    "fetchCount": 150,
    "storedHubCount": 45,
    "verifiedHubMappingCount": 54,
    "candidateCount": 74,
    "elapsedMs": 125
  }
}
```

---

## Testing Strategy

### Unit Tests

**Orchestration Layer** (`src/orchestration/__tests__/`):
- Mock all dependencies (db, logger, fetchFn, etc.)
- Test batch processing logic
- Test single domain processing
- Test readiness checks
- Test error handling
- Test aggregation logic
- Test diff preview generation

**Example**:
```javascript
// src/orchestration/__tests__/placeHubGuessing.test.js
describe('guessPlaceHubsBatch', () => {
  it('processes multiple domains sequentially', async () => {
    const mockDeps = {
      db: createMockDb(),
      logger: createMockLogger(),
      fetchFn: jest.fn().mockResolvedValue({ status: 200, text: () => '' }),
      analyzers: createMockAnalyzers(),
      validator: createMockValidator(),
      stores: createMockStores()
    };

    const results = await guessPlaceHubsBatch(
      {
        domains: ['example1.com', 'example2.com'],
        kinds: ['country'],
        limit: 5,
        apply: false
      },
      mockDeps
    );

    expect(results.batch.totalDomains).toBe(2);
    expect(results.batch.processedDomains).toBe(2);
    expect(results.domainSummaries).toHaveLength(2);
  });
});
```

### Integration Tests

**CLI Integration** (`src/tools/__tests__/`):
- Test with real database (temp database)
- Test argument parsing
- Test output formatting
- Test error messages
- Test file I/O (report writing)

**API Integration** (`src/api/__tests__/`):
- Use supertest for HTTP testing
- Test with real database (temp database)
- Test request validation
- Test response schemas
- Test error responses
- Test async job creation (when implemented)

**Example**:
```javascript
// src/api/__tests__/place-hubs.test.js
const request = require('supertest');
const { createApiServer } = require('../server');

describe('POST /api/place-hubs/guess', () => {
  let app;
  let dbPath;

  beforeEach(() => {
    dbPath = createTempDb();
    seedTestData(dbPath);
    app = createApiServer({ dbPath });
  });

  it('returns 200 for valid single domain request', async () => {
    const response = await request(app)
      .post('/api/place-hubs/guess')
      .send({
        domains: ['example.com'],
        options: {
          kinds: ['country'],
          limit: 5,
          apply: false
        }
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchSchema(HubGuessReportSchema);
    expect(response.body.batch.totalDomains).toBe(1);
  });

  it('returns 400 for missing domains', async () => {
    const response = await request(app)
      .post('/api/place-hubs/guess')
      .send({ options: {} });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_REQUEST');
  });
});
```

### E2E Tests

**End-to-End Workflows**:
- Start API server
- Execute multi-step workflows
- Verify database state changes
- Test SSE event streams
- Test background job completion

---

## Migration Path

### Step 1: Extract Without Breaking (Week 1)

1. Create `src/orchestration/placeHubGuessing.js`
2. Copy orchestration logic from CLI tool
3. Make it work with injected dependencies
4. Add comprehensive unit tests
5. **Do not modify CLI tool yet**

### Step 2: CLI Tool Calls Orchestrator (Week 1-2)

1. Modify `src/tools/guess-place-hubs.js`
2. Remove orchestration logic
3. Call orchestrator from CLI tool
4. Verify all existing tests pass
5. Verify CLI behavior unchanged

### Step 3: Add API Routes (Week 2)

1. Create `src/api/routes/place-hubs.js`
2. Call same orchestrator
3. Add API integration tests
4. Deploy API alongside CLI

### Step 4: Expand to Other Features (Week 3-4)

1. Apply same pattern to crawl management
2. Apply same pattern to analysis workflows
3. Apply same pattern to background tasks

### Rollback Strategy

If issues arise:
- Orchestrator is standalone module (can be disabled)
- CLI tool can revert to inline logic (git revert)
- API routes can be disabled (feature flag)
- No breaking changes to existing APIs

---

## Conclusion

This architecture provides:

1. **Clear Separation**: Interface → Orchestration → Service → Data
2. **Zero Duplication**: CLI and API share orchestration logic
3. **Testability**: Each layer independently testable
4. **Maintainability**: Changes in one layer don't affect others
5. **Extensibility**: Easy to add new interfaces (GraphQL, gRPC, etc.)

The key insight is that **orchestration logic belongs in its own layer**, separate from both CLI and API concerns. This allows us to write the business logic once and expose it through multiple interfaces without duplication.

**Next Steps**: Begin Phase 1 implementation - extract orchestration layer for place hub guessing.
