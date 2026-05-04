# CLI Tool Refactoring Summary

**Date:** October 30, 2025  
**Objective:** Extract orchestration logic from `src/tools/guess-place-hubs.js` into reusable modules for API integration

---

## Overview

Successfully refactored the `guess-place-hubs.js` CLI tool to delegate all business logic to a new orchestration layer, enabling both CLI and API interfaces to share the same code. This eliminates duplication and ensures consistency across interfaces.

---

## Results

### File Size Reduction
- **Original:** 2,737 lines
- **Refactored:** 1,543 lines
- **Removed:** 1,194 lines (44% reduction)

### Functions Moved to Orchestration Layer
1. `defaultLogger` (7 lines)
2. `assessDomainReadiness` (78 lines)
3. `createBatchSummary` (30 lines)
4. `createFailedDomainSummary` (19 lines)
5. `runGuessPlaceHubsBatch` (124 lines)
6. `composeCandidateSignals` (21 lines)
7. `selectPlaces` (68 lines)
8. `guessPlaceHubs` (847 lines)

**Total:** 1,194 lines of orchestration logic extracted

### Functions Retained (CLI-Specific)
- `parseCliArgs` - CLI argument parsing
- `buildDomainBatchInputs` - Domain batch construction from various input formats
- `parseDomainImportFile` - CSV import parsing
- `renderSummary` - CLI output formatting with CliFormatter
- `buildJsonSummary` - JSON output construction
- `writeReportFile` - Report file writing
- `normalizeDomain` - Domain URL normalization
- `extractTitle` - HTML title extraction
- `resolveDbPath` - Database path resolution
- Plus ~10 other formatting/rendering helpers

---

## Architecture

### New Structure

```
src/
├── orchestration/               (NEW)
│   ├── dependencies.js          Dependency injection factory
│   ├── placeHubGuessing.js      Pure orchestration logic (1413 lines)
│   └── __tests__/
│       ├── placeHubGuessing.test.js  (5/5 tests passing)
│       └── jest.config.js
│
├── api/                         (NEW)
│   ├── routes/
│   │   └── place-hubs.js        Express routes using orchestration
│   ├── openapi.yaml             OpenAPI 3.0.3 specification
│   └── server.js                Express app with Swagger UI
│
└── tools/
    └── guess-place-hubs.js      Thin CLI wrapper (1543 lines)
```

### Dependency Injection Pattern

**Before:** CLI tool had hardcoded dependencies
```javascript
const db = ensureDb(dbPath);
const newsDb = createSQLiteDatabase(dbPath);
const queries = createGuessPlaceHubsQueries(db);
const validator = new HubValidator({ db, newsDb });
// ... 15+ more dependencies
```

**After:** Factory creates all dependencies
```javascript
const deps = createPlaceHubDependencies({ dbPath, verbose });
// deps includes: db, newsDb, queries, analyzers, validator, stores, logger, fetchFn
```

### Orchestration Layer Exports

**`src/orchestration/placeHubGuessing.js`:**
- `guessPlaceHubsBatch(options, deps)` - Batch processing (returns `{ aggregate, perDomain }`)
- `guessPlaceHubsForDomain(options, deps)` - Single domain processing
- `checkDomainReadiness(options, deps)` - Readiness assessment
- `OrchestrationError` - Custom error class

**`src/orchestration/dependencies.js`:**
- `createPlaceHubDependencies(config)` - Dependency factory
- `validateDependencies(deps)` - Validation helper
- `createLogger(config)` - Logger factory

---

## API Routes

### Endpoints Implemented

**POST `/api/place-hubs/guess`**
- Request body: `{ domains: string[], kinds?: string[], limit?: number }`
- Response: Batch hub guessing results with metrics
- Sync for ≤3 domains, async planned for larger batches

**GET `/api/place-hubs/readiness/:domain`**
- Response: Domain readiness status, DSPL coverage, recommendations
- Used to check if domain is ready for hub guessing

### Response Format

```javascript
{
  version: "1.0.0",
  run: {
    startedAt: "2025-10-30T...",
    endedAt: "2025-10-30T...",
    durationMs: 123
  },
  batch: {
    domainsProcessed: 2,
    successfulDomains: 2,
    failedDomains: 0
  },
  totals: {
    placesEvaluated: 5,
    urlCandidates: 5,
    validationPassed: 5,
    validationFailed: 0
  },
  candidateMetrics: { /* ... */ },
  validationSummary: { /* ... */ },
  domainSummaries: [ /* ... */ ]
}
```

---

## Testing

### Test Suite
- **Location:** `src/orchestration/__tests__/placeHubGuessing.test.js`
- **Test Count:** 5 tests
- **Status:** All passing (5/5)
- **Runtime:** ~6 seconds

### Test Coverage
1. ✅ Dependency creation (validates all required objects present)
2. ✅ Readiness check (theguardian.com returns valid status)
3. ✅ Invalid domain handling (throws OrchestrationError)
4. ✅ Empty batch handling (throws error)
5. ✅ Single domain via domain property (accepts and processes)

### CLI Verification
```bash
# Help output works
node src/tools/guess-place-hubs.js --help

# Live domain test works (uses orchestration layer)
node src/tools/guess-place-hubs.js theguardian.com --kinds country --limit 2 --dry-run
# Output: ✅ "Run duration: 5 ms", "Places evaluated: 2"
```

---

## Benefits

### 1. Code Reusability
- **Before:** CLI-only business logic (can't reuse for API)
- **After:** Orchestration layer used by both CLI and API

### 2. Maintainability
- **Before:** 2737 lines mixing UI and logic
- **After:** 1543 lines CLI, 1413 lines orchestration (clear separation)

### 3. Testability
- **Before:** Hard to test (requires CLI execution)
- **After:** Pure functions testable in isolation

### 4. API Integration
- **Before:** Would need to duplicate logic
- **After:** API routes call same orchestration functions

### 5. Consistency
- **Before:** CLI and API could diverge
- **After:** Single source of truth for business logic

---

## Files Changed

### Created
- `src/orchestration/dependencies.js` (145 lines)
- `src/orchestration/placeHubGuessing.js` (1413 lines)
- `src/orchestration/__tests__/placeHubGuessing.test.js` (180 lines)
- `src/orchestration/jest.config.js` (15 lines)
- `src/api/routes/place-hubs.js` (285 lines)
- `docs/API_SERVER_ARCHITECTURE.md` (1300+ lines)

### Modified
- `src/tools/guess-place-hubs.js` (2737 → 1543 lines)
- Updated imports to use orchestration layer
- Updated `main()` function to call `guessPlaceHubsBatch`
- Updated `module.exports` to remove orchestration functions

### Backed Up
- `src/tools/guess-place-hubs.js.backup` (original 2727 lines preserved)

---

## Next Steps

### Task 4.3 Stage 2: Core API Endpoint Documentation
1. Document existing crawl management endpoints (GET/POST /api/crawls/*)
2. Document background task endpoints (GET/POST /api/background-tasks/*)
3. Document analysis endpoints (GET /api/analysis/*)

### Task 4.3 Stage 3: Hub Guessing Workflow API Endpoints
1. Implement additional endpoints:
   - `GET /api/place-hubs/candidates` - Query candidates
   - `GET /api/place-hubs/reports` - List reports
   - `GET /api/place-hubs/reports/:id` - Download report
   - `POST /api/place-hubs/validate` - Validate URLs

### Task 4.3 Stage 4-6: Schema, Testing, Documentation
1. Define OpenAPI schemas for all entities
2. Add comprehensive request/response examples
3. Create integration tests for all endpoints
4. Generate Postman collection
5. Write developer guide

---

## Lessons Learned

### 1. Dependency Injection Works Well
Factory pattern makes dependencies explicit and testable. Easy to mock for tests, easy to configure for different environments.

### 2. Orchestration Layer Pattern
Clear separation: Interface → Orchestration → Service → Data Access. Each layer has single responsibility.

### 3. CLI + API Consistency
Both interfaces now guaranteed to behave identically because they call same code. No drift, no duplication.

### 4. Incremental Refactoring
Backup original → extract orchestration → create tests → update CLI → verify works. Small steps, always working code.

### 5. Test-Driven Confidence
5 passing tests give confidence that orchestration layer works before integrating with CLI. Caught several issues early.

---

## References

- **Architecture Document:** `docs/API_SERVER_ARCHITECTURE.md`
- **Task Tracker:** `CLI_REFACTORING_TASKS.md` (Task 4.3)
- **OpenAPI Spec:** `src/api/openapi.yaml`
- **Orchestration Tests:** `src/orchestration/__tests__/placeHubGuessing.test.js`
