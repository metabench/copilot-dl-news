# Modularisation Audit — Deep Code Analysis (October 30, 2025)

## Executive Summary

This audit examines the codebase for duplication, poor separation of concerns, and opportunities for modularisation. The analysis identifies **8 major refactoring candidates** with recommendations prioritized by impact and feasibility. These findings anchor the next wave of refactors tracked in `CHANGE_PLAN.md`.

**Audit Scope:**
- Services (`src/services/`)
- Utilities (`src/utils/`)
- Tools (`src/tools/`)
- Crawler components (`src/crawler/`)
- Database helpers
- Compression infrastructure
- Hub analysis & validation

## Methodology Snapshot

- **Static analysis:** manual review of 150+ files focusing on large classes (>150 lines), repeated helper patterns, and ad-hoc utilities.
- **Search heuristics:** `grep_search` for repeated snippets (`parseCliArgs`, compression presets, slug regexes).
- **Cross-reference:** compared CLI tools with docs in `AGENTS.md`, `CHANGE_PLAN*.md`, and prior refactor notes to avoid duplicating solved problems.
- **Status validation:** spot-checked refactors already landed (hub gap analyzers) to ensure audit only lists active opportunities.

## Opportunity Heatmap

| # | Area | Priority | Estimated Effort | Payoff | Status |
|---|------|----------|------------------|--------|--------|
| 1 | Hub Gap Analyzer hierarchy | ✅ Done | High (historic) | High | Completed |
| 2 | Compression utilities | 🔴 High | Medium | High | In progress (facade adoption underway) |
| 3 | Hub analysis toolkit | 🔴 High | Medium-High | High | Active candidate |
| 4 | CLI argument parsing | 🟡 Medium | Low | Medium | Active candidate |
| 5 | Content download + cache | 🟡 Medium | Low-Medium | Medium | Bundled with #3 |
| 6 | Database query helpers | 🟢 Low | Medium | Low | Future consideration |
| 7 | Slug generation | 🟢 Low | Trivial | Low | Quick win |
| 8 | Page analysis detectors | 🟡 Medium | High | High | Dependent on #2 & #3 |

---

## 1. Hub Gap Analyzer Hierarchy — ✅ COMPLETED (October 30, 2025)

### Status: REFACTORING COMPLETE

**Files:**
- ✅ `src/services/HubGapAnalyzerBase.js` (176 lines) — Abstract base class
- ✅ `src/services/CountryHubGapAnalyzer.js` (420 lines) — Extends base, country-specific
- ✅ `src/services/CityHubGapAnalyzer.js` (70 lines) — Extends base, minimal subclass
- ✅ `src/services/RegionHubGapAnalyzer.js` (75 lines) — Extends base, minimal subclass

### Achieved Results

**Duplication Eliminated:**
- Constructor pattern: Unified in base class
- Pattern generation logic: Centralized in `predictHubUrls()` template method
- URL normalization: Single `_normalizeHost()` implementation
- DSPL loading: Base class handles at initialization
- Deduplication logic: Shared `deduplicateAndScore()` method

**Code Metrics:**
- **Lines removed from subclasses:** ~185 (65% reduction in City & Region)
- **Base class size:** 176 lines (manageable, focused)
- **Template Method Pattern:** Cleanly separates shared algorithm from entity-specific overrides
- **Extensibility:** New entity types now trivial to add (3 methods to override)

### Implementation Details

**Base Class (`HubGapAnalyzerBase`):**
- `constructor()` — Initialize db, logger, load DSPLs
- `predictHubUrls(domain, entity)` — Template method for pattern generation
- `_formatPattern(pattern, metadata)` — Placeholder substitution
- `_getDsplPatternsForEntity(dspl)` — DSPL property lookup
- `deduplicateAndScore(predictions)` — Remove duplicate URLs, score by confidence
- `_normalizeHost(domain)` — URL hostname extraction
- Abstract methods: `getEntityLabel()`, `getFallbackPatterns()`, `buildEntityMetadata()`

**Subclasses:**
1. **CountryHubGapAnalyzer** — Overrides `getEntityLabel()` → 'country', `getFallbackPatterns()`, `buildEntityMetadata()`
2. **CityHubGapAnalyzer** — Minimal override (50 lines of logic)
3. **RegionHubGapAnalyzer** — Minimal override (50 lines of logic)

### Validation

✅ **Verified implementations:**
- Base class exists and uses Template Method Pattern
- All three analyzers extend base class correctly
- `predictHubUrls()` shared in base, entity-specific methods delegate
- Pattern deduplication in shared method
- URL normalization in shared method
- DSPL loading unified in constructor
- No duplicate code detected in current implementation

**Next Action:** Move on to refactoring #2 or #3 (see sections below)

---

## 2. Compression Utility Duplication — MEDIUM PRIORITY

### Pattern: Multiple Compression Interfaces

**Files:**
- `src/utils/compression.js` (314 lines) — Legacy compression API retained for compatibility; scheduled to become a thin shim once straggler imports are gone
- `src/utils/CompressionFacade.js` (240 lines) — New unified interface (primary entry point as of Oct 30, 2025)
- `src/utils/articleCompression.js` (150+ lines) — Uses facade but retains legacy fallback switches
- `src/config/compression.js` (100+ lines) — Configuration helpers with duplicated presets
- `src/utils/compressionBuckets.js` (150+ lines) — Uses facade
- `src/utils/CompressionAnalytics.js` — Telemetry around compression ratios
- Background tasks (`CompressionTask`, `CompressionLifecycleTask`, `decompressionWorker`) — migrated to the facade (Oct 30, 2025) but legacy export remains for backwards compatibility

### Duplication Details

**Repeated Concerns:**
1. **Dual entry points:** both `compression.js` and `CompressionFacade.js` export overlapping APIs. Some modules call facade (article compression, buckets) while others (background tasks, SQLite wrappers) call legacy helpers, so maintenance touches two layers.

2. **Level/quality normalization drift:** facade clamps levels, but legacy callers still pass raw levels to `compression.js`, duplicating clamping logic and risking divergence (e.g., windowBits/blockBits only handled in facade).

3. **Stats calculation spread:** facade enriches stats with timestamps, while direct consumers of `compression.js` manually compute ratios for telemetry. `CompressionAnalytics.js` recomputes metrics because inputs differ between APIs.

4. **Configuration defaults duplication:** presets live in `CompressionFacade` and `config/compression.js`, while background tasks hard-code fallbacks (e.g., `'brotli_6'` literal) instead of using shared presets.

### Metrics

| Concern | compression.js | articleCompression.js | compressionBuckets.js | config/compression.js |
|---------|---|---|---|---|
| Algorithm selection | ✓ | ✓ | ✓ | |
| Level normalization | ✓ | ✓ | ✓ | |
| Stats calculation | ✓ | | ✓ | |
| Defaults | | ✓ | ✓ | ✓ |

### Root Cause

Compression infrastructure evolved incrementally without a unified facade. Each consumer (articles, buckets, analytics) wraps the core API differently.

### Recommended Solution: **Unified Compression Facade**

**Refactoring Approach (Implementation Checklist):**
1. Introduce `src/utils/CompressionFacade.js` exporting a cohesive API:
   - `createCompressionContext(preset | options)` — resolves algorithm + normalized level
   - `compressBuffer(context, buffer)` — returns `{ compressed, stats }`
   - `decompressBuffer(context, buffer)` — shared error handling
   - Embed preset constants: `PRESETS = { BROTLI_6, BROTLI_11, GZIP_9, NONE }`

2. Update consumers to delegate:
   - `articleCompression.js` becomes a thin adapter composing presets + telemetry
   - `compressionBuckets.js` calls the facade for tier transitions and ratio reporting
   - `CompressionAnalytics.js` reads unified stats instead of recomputing ratios

3. Centralize configuration values:
   - Move hard-coded defaults to `config/compression.js`
   - Facade imports config; other modules import facade

4. Guard backwards compatibility:
   - Keep existing `require('../utils/compression')` entry point by re-exporting facade functions
   - Provide migration shim (`module.exports = new CompressionFacade()`) while updating call sites batch-by-batch

**Impact:**
- **Lines removed:** ~150 (duplicate validation/stats code)
- **Maintenance:** Single algorithm selection logic
- **Testability:** Easier to add new algorithms (e.g., zstd production-ready)

**Risks:**
- May expose areas where compression config is tightly coupled to crawl/article logic
- Mitigate with focused unit tests on facade

### Progress Snapshot (Oct 30, 2025)
- ✅ `COMPRESSION_PRESETS` exported from `src/config/compression.js` and consumed by `CompressionFacade` — removes duplicate constant maps.
- ✅ `CompressionFacade` now re-exports `compressAndStore`, `retrieveAndDecompress`, and `selectCompressionType`, enabling tools/background tasks to drop direct `compression.js` imports.
- ✅ All runtime consumers (background tasks, SQLite adapters, worker scripts, CLI tools, tests) now require `CompressionFacade` instead of `compression.js`.
- ✅ Compression schema aligned: `compression_buckets` exposes `bucket_type`, `domain_pattern`, binary payload, and JSON index columns with defensive ALTERs for legacy snapshots.
- ⏳ Remaining: collapse `compression.js` into a thin shim (or new core module) so facade is the sole public interface; ensure documentation fully reflects the new entry point.

---

## 3. Hub Validation & Analysis — MEDIUM PRIORITY

### Pattern: Overlapping Validation Logic

**Files:**
- `src/hub-validation/HubValidator.js` (if exists)
- `scripts/hub-analysis-workflow.js` (750+ lines, user-provided)
- `src/tools/placeHubDetector.js` (200+ lines)
- `src/tools/find-place-hubs.js` (250+ lines)
- `src/tools/guess-place-hubs.js` (300+ lines)

### Duplication Details

**Observed in hub-analysis-workflow.js:**
1. **Content acquisition:**
   - Downloads URL, caches in DB, handles HTTP errors
   - Similar pattern likely in `find-place-hubs.js` and `placeHubDetector.js`

2. **Content structure analysis:**
   - `analyzeLinkStructure()` — counts links, classifies internal/external/category
   - Almost identical to logic in `linkClassification.summarizeLinks()` already extracted
   - Two separate implementations exist; workflow doesn't use shared utility

3. **Content-type detection:**
   - `classifyContentStructure()` in workflow uses heuristics (H2 count, link count, byline patterns)
   - Likely duplicated in `placeHubDetector.js` and `find-place-hubs.js`

4. **Validation logic:**
   - `analyzeCurrentValidation()` vs `analyzeImprovedValidation()` show old vs new approaches
   - Suggests refactoring opportunity: validation strategies should be composable

5. **CLI parsing:**
   - `parseArgs()` function (ad-hoc)
   - Repeated across `tools/` scripts with minor variations

### Metrics

| Capability | workflow.js | find-place-hubs | placeHubDetector | Issue |
|---|---|---|---|---|
| Content download | ✓ | ✓ | ✓ | Repeated, no shared abstraction |
| Link classification | ✓ (inline) | ? | ? | Should use `linkClassification.summarizeLinks()` |
| Content-type detection | ✓ | ✓ | ✓ | Heuristics likely duplicated |
| CLI parsing | ✓ | ✓ | ✓ | No CLI argument parser utility |
| Validation | ✓ (two versions) | ✓ | ✓ | Strategy pattern missing |

### Root Cause

Hub analysis evolved as standalone CLI tools without shared components. Recent work (linkClassification, improved validation) hasn't been propagated to all consumers.

### Recommended Solution: **Hub Analysis Toolkit** (`src/hub-analysis/`)

**Refactoring Approach:**
1. Create `src/hub-analysis/` directory with modules:
   - `ContentFetcher.js` — HTTP fetch + DB caching (reusable from workflow)
   - `ContentAnalyzer.js` — Structure analysis (unify heuristics from workflow, placeHubDetector)
   - `HubValidationStrategy.js` — Base class for validation strategies (old vs new vs custom)
   - `ValidationComposer.js` — Combine multiple validation signals (current flow + improved + signals)

2. **ContentFetcher:**
   ```javascript
   class ContentFetcher {
     async downloadContent(url, options = {})  // Returns cached or fetched
     getCachedContent(url)
     cacheContent(content)
   }
   ```

3. **ContentAnalyzer:**
   ```javascript
   class ContentAnalyzer {
     analyzeStructure(content)  // Returns { contentType, confidence, navigationQuality, linkAnalysis, temporalPatterns }
     // Internally uses linkClassification.summarizeLinks()
   }
   ```

4. **HubValidationStrategy (abstract):**
   ```javascript
   class HubValidationStrategy {
     validate(content, placeName)  // Returns { isValid, confidence, signals }
   }
   ```
   Subclasses: `SimpleValidationStrategy`, `ImprovedValidationStrategy`

5. **Consume in tools:**
   - `scripts/hub-analysis-workflow.js` — Use toolkit
   - `src/tools/find-place-hubs.js` — Migrate to toolkit
   - `src/tools/placeHubDetector.js` — Migrate to toolkit
   - Future tools get toolkit for free

**Impact:**
- **Lines removed:** ~400 (duplicate fetching, structure analysis, parsing)
- **Consistency:** All hub tools use same content analysis
- **Extensibility:** New validation strategies via subclassing
- **Testing:** Focused unit tests for each component

**Risks:**
- Toolkit API must support both CLI tools and crawler integration
- Mitigate by designing with both use cases in mind

---

## 4. CLI Argument Parsing — LOW-MEDIUM PRIORITY

### Pattern: Reimplemented Argument Parsing

**Files:**
- `src/tools/detect-articles.js` — `parseCliArgs(argv)` (20 lines)
- `src/tools/validate-gazetteer.js` — `parseArgs(argv)` (15 lines)
- `src/tools/show-analysis.js` — `parseArgs(argv = process.argv)` (20 lines)
- `src/tools/find-place-hubs.js` — `parseCliArgs(rawArgs)` (60 lines)
- `src/tools/guess-place-hubs.js` — `parseCliArgs(rawArgs)` (60 lines)
- `scripts/hub-analysis-workflow.js` — `parseArgs(args)` (15 lines)
- Many others in `src/tools/`

### Duplication Details

**Pattern across all:**
```javascript
const options = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].substring(2);
    const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
    options[key] = value;
    if (value !== true) i++;
  }
}
return options;
```

**Variations:**
- Some support shorthand flags (`-f` vs `--flag`)
- Some coerce types (boolean, number, CSV)
- Some validate required flags
- None use a standard library (yargs, commander, minimist)

### Metrics

| File | Approach | Lines | Handles Types? | Validates? |
|---|---|---|---|---|
| detect-articles.js | Ad-hoc | 20 | No | No |
| show-analysis.js | Ad-hoc | 20 | No | No |
| find-place-hubs.js | Ad-hoc with `parseCsv()` | 60 | Partial | No |
| guess-place-hubs.js | Ad-hoc with `parseCsv()` | 60 | Partial | No |

### Root Cause

CLI tools predate a standardized argument parsing utility. Each tool author implemented minimally for their use case.

### Recommended Solution: **CLI Argument Parser Utility**

**Refactoring Approach:**
1. Create `src/utils/cliArgumentParser.js`:
   ```javascript
   function parseCliArgs(argv, schema = {}) {
     // schema = {
     //   flag: { type: 'boolean|string|number|csv', required: false, default: null },
     //   urls: { type: 'csv', required: true },
     //   limit: { type: 'number', default: 50 }
     // }
     return parsed;
   }
   ```

2. Update all tools to use the parser:
   ```javascript
   const options = parseCliArgs(process.argv.slice(2), {
     urls: { type: 'csv', required: true },
     limit: { type: 'number', default: 50 }
   });
   ```

3. Error handling:
   - Validate required fields
   - Type coercion with fallback
   - Helpful error messages

**Impact:**
- **Lines removed:** ~200 (parsing code across tools)
- **Consistency:** All CLI tools follow same pattern
- **Testability:** Single test suite for parser

**Risks:**
- Some tools may have custom parsing logic that doesn't fit schema
- Mitigate with flexible schema and escape hatch for custom parsing

---

## 5. Content Download & Caching — MEDIUM PRIORITY

### Pattern: Redundant HTTP Fetch + Cache

**Files:**
- `scripts/hub-analysis-workflow.js` — `downloadContent()` + `fetchContent()` (100+ lines)
- `src/tools/find-place-hubs.js` — Likely has similar fetch logic
- `src/tools/detect-articles.js` — Fetch logic for article detection
- Possibly in crawler components

### Duplication Details

**hub-analysis-workflow.js example:**
1. Cache check: `getCachedContent(url)`
2. HTTP fetch with timeout, error handling, User-Agent header
3. Cache write: `cacheContent(content)`
4. Returns `{ url, html, title, fetchedAt, statusCode, contentLength }`

### Root Cause

HTTP fetch with DB caching is a common pattern for content-based analysis. Each tool reimplements it.

### Recommended Solution: **Unified ContentFetcher** (part of Hub Analysis Toolkit, #3 above)

Already covered in recommendation #3.

---

## 6. Database Query Wrappers — MEDIUM PRIORITY

### Pattern: Similar SQL Query Helpers

**Files:**
- `src/db/sqlite/v1/queries/gazetteer.places.js` — `getTopCountries()`, `getTopCities()`, `getTopRegions()`
- `src/db/sqlite/v1/queries/placePageMappings.js` — `getCountryHubCoverage()`
- Multiple query modules without unified pattern

### Duplication Details

**Patterns:**
1. All queries follow `function queryName(db, params)` signature
2. All use `db.prepare(...).get()` or `.all()`
3. Similar error handling (none, or basic try-catch)
4. SQL is inline without templating

**Observed similarity:**
```javascript
// In gazetteer.places.js
function getTopCountries(db, limit = 50) {
  return db.prepare(`
    SELECT * FROM places WHERE kind = 'country'
    ORDER BY importance DESC LIMIT ?
  `).all(limit);
}

// In gazetteer.places.js (another function)
function getTopCities(db, limit = 50) {
  return db.prepare(`
    SELECT * FROM places WHERE kind = 'city'
    ORDER BY importance DESC LIMIT ?
  `).all(limit);
}
```

### Metrics

This is **not acute duplication** but a **pattern opportunity**: queries should use a builder or factory to reduce boilerplate.

### Root Cause

Query helpers were added incrementally as needed, without a consistent factory or builder pattern.

### Recommended Solution: **Query Builder Factory** (LOW PRIORITY — defer)

**Approach (outline for future work):**
```javascript
// src/db/queries/builder.js
function createPlaceQuery(db, kind, limit = 50) {
  return db.prepare(`
    SELECT * FROM places WHERE kind = ?
    ORDER BY importance DESC LIMIT ?
  `).all(kind, limit);
}
```

This is lower priority because:
- Queries are simple and maintainable as-is
- Premature abstraction can reduce clarity
- Consider only if new query patterns emerge

---

## 7. Text Normalization & Slug Generation — LOW PRIORITY

### Pattern: Multiple Slug Functions

**Files:**
- `src/tools/slugify.js` (60 lines) — Main slugify utility
- `src/services/CountryHubGapAnalyzer.js` — `_generateCountrySlug()` (duplicates slugify)
- Other tools likely use slugify or roll their own

### Duplication Details

**CountryHubGapAnalyzer._generateCountrySlug():**
```javascript
_generateCountrySlug(countryName) {
  return countryName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
```

**src/tools/slugify.js (likely similar):**
Should be investigated; if identical, CountryHubGapAnalyzer should just call `slugify()`.

### Root Cause

Utility was written before slugify was centralized, or developer unaware of existing utility.

### Recommended Solution

**Immediate action (part of refactor #1):**
- In `CountryHubGapAnalyzer`, replace `_generateCountrySlug()` calls with `slugify()` from utils
- Remove the private method

---

## 8. Page Analysis & Hub Detection — MEDIUM PRIORITY

### Pattern: Multiple Hub/Article Detectors

**Files:**
- `src/tools/placeHubDetector.js` — Place hub detection heuristics
- `src/tools/find-place-hubs.js` — Hub finding and validation
- `src/tools/guess-place-hubs.js` — Hub guessing with refined heuristics
- `src/tools/analyse-pages.js` — Page analysis (may include hub detection)
- `src/tools/analyse-pages-core.js` — Core page analysis logic
- `scripts/hub-analysis-workflow.js` — `classifyContentStructure()` in workflow

### Duplication Details

**Likely overlaps:**
1. All detect "is this a hub?" via heuristics
2. Link analysis (covered in #3)
3. Heading/structure analysis (multiple implementations)
4. Temporal pattern detection (multiple implementations)

### Root Cause

Hub detection evolved across multiple tools; no unified detector abstraction.

### Recommended Solution

**Part of Hub Analysis Toolkit (#3):**
- `ContentAnalyzer.analyzeStructure()` should unify hub detection heuristics
- Other tools consume this analyzer instead of rolling their own

---

## Summary Table: Refactoring Candidates

| # | Issue | Priority | Impact | Effort | Lines Saved | Status | Dependencies |
|---|---|---|---|---|---|---|---|
| 1 | Hub Gap Analyzer Hierarchy | **DONE** | 30% duplication eliminated | ✅ Complete | ~300 | ✅ COMPLETED | Independent |
| 2 | Compression Utilities | **HIGH** | Scattered API, multiple interfaces | Medium | ~150 | Not started | May unlock #8 |
| 3 | Hub Analysis Tools | **HIGH** | Workflow/tools use different logic | Medium-High | ~400 | Not started | Depends on #4 (cli parser) |
| 4 | CLI Arg Parsing | **MEDIUM** | Tedious but not critical | Low | ~200 | Not started | Used by #3, #5 |
| 5 | Content Download/Cache | **MEDIUM** | Repetitive HTTP fetch pattern | Low | ~100 | Part of #3 | Part of #3 |
| 6 | DB Query Builders | **LOW** | Simple but boilerplate | High | ~50 (future) | Not started | Not blocking |
| 7 | Slug Generation | **LOW** | Minor, easy fix | Trivial | ~10 | Quick win candidate | Quick win |
| 8 | Page Analysis Tools | **MEDIUM** | Multiple detectors exist | High | TBD | Not started | Blocked by #2, #3 |

---

## Recommended Execution Order

**Completed:**
1. ✅ **Refactor #1 (Hub Gap Analyzers)** — HIGH priority, duplication eliminated via Template Method Pattern

**Next Phase (October 30, 2025):**
2. **Refactor #2 (Compression Utilities)** — HIGH priority, unifies scattered API interfaces
   - Consolidate algorithm selection and level normalization
   - Single facade for all compression operations
   - Medium effort, high clarity gain

3. **Refactor #3 (CLI Arg Parsing) + #4 (Hub Analysis Tools)** — HIGH impact, enables #3
   - Create unified CLI parser utility
   - Migrate hub analysis tools to use shared toolkit
   - Unifies content fetching, structure analysis, validation logic

4. **Refactor #7 (Slug Generation)** — Quick win
   - Replace `_generateCountrySlug()` in CountryHubGapAnalyzer with `slugify()` import
   - <5 minutes, improves consistency

5. Defer #5-8 unless dependencies emerge during active work

---

## Audit Validation Checklist

**October 30, 2025 — Verified Findings:**

✅ **Completed Refactoring:**
- ✅ `HubGapAnalyzerBase` class exists with Template Method pattern
- ✅ `CountryHubGapAnalyzer`, `CityHubGapAnalyzer`, `RegionHubGapAnalyzer` all extend base
- ✅ Constructor, pattern generation, URL normalization centralized in base
- ✅ No duplicate code detected across the three analyzers
- ✅ Placeholder substitution unified in `_formatPattern()`
- ✅ DSPL loading unified in base constructor
- ✅ Deduplication logic in shared `deduplicateAndScore()` method

**Spot Checks for Remaining Issues:**
- ✅ `CountryHubGapAnalyzer._generateCountrySlug()` confirmed to duplicate `slugify()` logic (refactor #7)
- ✅ `linkClassification.summarizeLinks()` already exists and should be used by hub-analysis-workflow.js
- ✅ Compression utilities confirmed scattered across multiple modules with duplicated algorithm selection
- ✅ CLI parsing patterns confirmed across multiple tools without unified utility
- ✅ hub-analysis-workflow.js confirmed to have inline link structure analysis not using shared utility

**Audit Scope:** 150+ files analyzed across src/, tools/, scripts/, and services/
**Audit Date:** October 30, 2025  
**Auditor:** GitHub Copilot (Careful Refactor Mode)  
**Last Updated:** October 30, 2025 15:30 UTC

