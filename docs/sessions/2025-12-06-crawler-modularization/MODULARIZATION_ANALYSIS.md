# Modularization Analysis — Largest JS Source Files

Generated: 2025-12-06

## Executive Summary

This analysis identifies the largest JavaScript source files (excluding bundles) and recommends modularization strategies. The focus is on files with high function counts that have extractable responsibilities.

---

## Priority Targets (by impact)

### 1. `src/crawler/NewsCrawler.js` — 67KB, 2250 lines, 143 functions

**Current Structure:**
- Extends `Crawler` base class
- 143 functions in a single class
- Heavy constructor with service wiring
- Multiple concerns: configuration, orchestration, gazetteer mode, planner integration

**Modularization Opportunities:**

| Extraction | Target Module | Lines Saved | Effort |
|------------|---------------|-------------|--------|
| Gazetteer mode logic | `crawler/modes/GazetteerCrawlMode.js` | ~300-400 | Medium |
| Planner/intelligent mode | `crawler/modes/IntelligentCrawlMode.js` | ~200-300 | Medium |
| Configuration normalization | `crawler/config/CrawlerConfigNormalizer.js` | ~100-150 | Low |
| Stats/progress reporting | `crawler/reporting/CrawlProgressReporter.js` | ~150 | Low |
| URL processing logic | **Use new `pipeline/` pattern** | ~300-400 | Medium |

**Recommended Approach:**
1. **Mode Strategy Pattern** — Extract gazetteer, intelligent, and basic modes into separate strategy classes
2. **Pipeline Integration** — Wire page processing through `runPipeline()` instead of inline methods
3. **Config Module** — Extract option normalization and validation

---

### 2. `src/ui/server/dataExplorerServer.js` — 63KB, 1814 lines, 85 functions

**Current Structure:**
- Express server with many route handlers inline
- Utility functions at module scope
- Query parameter handling mixed with business logic

**Modularization Opportunities:**

| Extraction | Target Module | Lines Saved | Effort |
|------------|---------------|-------------|--------|
| Route handlers | `server/routes/dataExplorerRoutes.js` | ~800 | Medium |
| Query utilities | `server/utils/queryHelpers.js` | ~100 | Low |
| Response builders | `server/builders/responseBuilders.js` | ~200 | Low |
| Process management | `server/utils/processLifecycle.js` | ~100 | Low |

**Recommended Approach:**
1. **Route Extraction** — Move each route group (`/urls`, `/domains`, `/crawls`, `/errors`, `/config`) to separate route modules
2. **Middleware Layer** — Extract common query parsing, pagination, and back-link handling
3. **Service Layer** — Create thin service wrappers for database queries

---

### 3. `src/orchestration/DomainProcessor.js` — 60KB, 1947 lines, 32 functions

**Current Structure:**
- Single class with very long methods
- Already has some utility extraction (`utils/*.js`)
- Heavy `processDomain()` method (~500+ lines)

**Modularization Opportunities:**

| Extraction | Target Module | Lines Saved | Effort |
|------------|---------------|-------------|--------|
| Readiness assessment | `orchestration/steps/ReadinessAssessment.js` | ~200 | Medium |
| Recommendation processing | `orchestration/steps/RecommendationProcessor.js` | ~300 | Medium |
| Fetch orchestration | `orchestration/steps/FetchOrchestrator.js` | ~200 | Medium |
| Summary builders | Already in `utils/summaryUtils.js` | — | Done |

**Recommended Approach:**
1. **Pipeline Pattern** — Convert `processDomain()` to ordered steps using `runPipeline()` pattern
2. **Step Extraction** — Each phase (readiness, recommendations, fetch, persist) becomes a step

---

### 4. `src/db/sqlite/v1/SQLiteNewsDatabase.js` — 56KB, 1641 lines, 86 functions

**Current Structure:**
- Already partially modularized (ArticleOperations, StatementManager, etc.)
- Many delegate methods for legacy compatibility
- Mixed query and transaction concerns

**Modularization Opportunities:**

| Extraction | Target Module | Lines Saved | Effort |
|------------|---------------|-------------|--------|
| Coverage queries | `queries/coverage.js` | ~100 | Low |
| Gazetteer operations | `operations/GazetteerOperations.js` | ~150 | Low |
| Task/job operations | `operations/TaskOperations.js` | ~100 | Low |
| Stream operations | `operations/StreamOperations.js` | ~100 | Low |

**Recommended Approach:**
1. **Continue Existing Pattern** — Already uses `ArticleOperations`, `StatementManager` — extend this
2. **Operation Modules** — Group related methods into operation classes
3. **Facade Preservation** — Keep main class as facade for backward compatibility

---

### 5. `src/crawler/gazetteer/ingestors/WikidataCountryIngestor.js` — 57KB, ~1500 lines

**Current Structure:**
- Heavy data transformation logic
- Inline parsing and normalization
- Similar structure to WikidataAdm1Ingestor

**Modularization Opportunities:**

| Extraction | Target Module | Lines Saved | Effort |
|------------|---------------|-------------|--------|
| Label extractors | `ingestors/shared/labelExtractors.js` | ~200 | Low |
| Coordinate parsers | `ingestors/shared/coordinateParsers.js` | ~100 | Low |
| Wikidata entity helpers | `ingestors/shared/wikidataHelpers.js` | ~150 | Low |

---

### 6. `src/tools/analysis-run.js` — 52KB

Script file with multiple concerns. Could be split into:
- Configuration/argument parsing
- Analysis orchestration
- Reporting/output formatting

---

### 7. `src/ui/controls/diagramAtlasControlsFactory.js` — 42KB

Factory file for UI controls. Could benefit from:
- Splitting diagram-specific logic into sub-factories
- Extracting shared layout utilities

---

## Immediate Action Items

### Quick Wins (Low Effort, High Impact)

1. **Extract query helpers from dataExplorerServer.js**
   - `sanitizePage()`, `sanitizePageSize()`, `toBooleanQueryFlag()` → `server/utils/queryHelpers.js`
   
2. **Extract config normalization from NewsCrawler.js**
   - `normalizeHost()`, `resolvePriorityProfileFromCrawlType()` → `crawler/config/helpers.js`

3. **Continue SQLiteNewsDatabase modularization**
   - Follow existing pattern with `*Operations.js` classes

### Medium-Term (Pipeline Integration)

1. **Wire NewsCrawler page processing through pipeline pattern**
   - Replace `processPage()` with `runPipeline(buildSteps(...))`
   - Enables testable, configurable step chains

2. **Convert DomainProcessor.processDomain() to pipeline**
   - Each phase becomes a step
   - Enables easier debugging and instrumentation

### Longer-Term (Architectural)

1. **Mode Strategy for NewsCrawler**
   - Extract gazetteer, intelligent, basic modes to strategy classes
   - Crawler becomes orchestrator that delegates to mode strategy

2. **Route Modules for UI Servers**
   - Each entity type (`/urls`, `/domains`, etc.) gets its own route file
   - Server file becomes thin wiring layer

---

## Files to Ignore

These are **built bundles**, not source files:
- `src/ui/server/*/public/*-client.js` — Rollup/esbuild bundles
- `src/deprecated-ui/express/public/assets/chunks/*.js` — Build artifacts
- `src/db/sqlite/v1/schema-definitions.js` — Generated from DB schema

---

## Next Steps

1. **Choose one target** from Quick Wins
2. **Create session folder** for the modularization work
3. **Apply pipeline pattern** where beneficial
4. **Add focused tests** for extracted modules
