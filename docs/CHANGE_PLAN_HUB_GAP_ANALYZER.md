# CHANGE_PLAN — Hub Gap Analyzer Refactoring

**Priority:** HIGH | **Impact:** 30% reduction in duplication | **Effort:** Medium | **Lines Saved:** ~300

## Goal / Non-Goals

- **Goal:** Eliminate duplication in `CountryHubGapAnalyzer`, `CityHubGapAnalyzer`, and `RegionHubGapAnalyzer` by introducing `HubGapAnalyzerBase` abstract class. Consolidate ~300 lines of duplicated constructor, DSPL loading, pattern generation, and URL normalization logic into a single shared implementation.
- **Non-Goals:** Not refactoring the crawler's hub detection or changing the database schema. Not modifying DSPL file format or loading strategy (already working). Focus is purely on eliminating duplication between the three service classes.

## Current Behavior

**Duplicated Across All Three Classes:**
1. **Constructor** (identical signature, DB validation, DSPL loading):
   ```javascript
   constructor({ db, logger = console, dsplDir = path.join(...) } = {})
   ```

2. **DSPL Loading** (both initialization and lookup):
   ```javascript
   this.dspls = loadDsplLibrary({ dsplDir: this.dsplDir, logger: this.logger });
   ```

3. **Pattern Generation** (same algorithm applied to all entity types):
   - Load DSPL patterns for entity type
   - Fall back to hardcoded `fallbackPatterns` array if DSPL missing
   - Format each pattern by replacing `{slug}`, `{code}`, `{regionSlug}` placeholders
   - Build absolute URL using `new URL(formatted, baseUrl).href`
   - Add to Set to deduplicate

4. **URL Normalization** (identical logic):
   ```javascript
   const baseUrl = `https://${domain}`;
   new URL(formatted, baseUrl).href;
   ```

5. **Slug Generation** (CountryHubGapAnalyzer has duplicate of `slugify()` utility):
   ```javascript
   _generateCountrySlug(countryName) { /* duplicates src/tools/slugify.js logic */ }
   ```

**Only Differences:**
- `getTopCountries()` vs `getTopCities()` vs `getTopRegions()` query different tables
- `fallbackPatterns` array differs per entity type
- Placeholder names differ slightly (country vs city vs region)

## Refactor & Modularization Plan

### Step 1: Create `HubGapAnalyzerBase.js`

Create `src/services/HubGapAnalyzerBase.js` with shared implementation:
- Constructor with DB validation and DSPL loading
- `predictHubUrls(domain, entity)` — main entry point for pattern generation
- `_addPatternFromDspl(domain, dsplPatterns, baseUrl)` — DSPL pattern helper
- `_addPatternFromFallback(domain, fallbackPatterns, baseUrl)` — fallback helper
- `_formatPattern(pattern, placeholders)` — placeholder replacement
- `_deduplicateAndScore(predictions)` — URL deduplication
- Abstract methods to be overridden by subclasses:
  - `getEntityLabel()` — e.g., "country", "city", "region" (for logging)
  - `getFallbackPatterns()` — entity-type-specific pattern list
  - `buildEntityMetadata(entity)` — extract name, slug, code, etc. from entity object

### Step 2: Refactor Each Subclass

**`CountryHubGapAnalyzer`:**
- Extend `HubGapAnalyzerBase`
- Keep `analyzeGaps()`, `generatePredictions()`, `extractCountryNameFromUrl()` (country-specific logic)
- Delete duplicated: constructor, DSPL loading, pattern generation logic
- Implement abstract methods:
  ```javascript
  getEntityLabel() { return 'country'; }
  
  getFallbackPatterns() {
    return [
      { pattern: `/world/{slug}`, confidence: 0.6 },
      { pattern: `/news/world/{slug}`, confidence: 0.5 },
      // ... rest of patterns
    ];
  }
  
  buildEntityMetadata(country) {
    return {
      name: country.name,
      slug: slugify(country.name),
      code: country.code.toLowerCase()
    };
  }
  ```
- Delete `_generateCountrySlug()` and replace calls with `slugify()` from utils

**`CityHubGapAnalyzer`:**
- Extend `HubGapAnalyzerBase`
- Keep `getTopCities()` query (city-specific)
- Delete duplicated: constructor, pattern generation
- Implement abstract methods:
  ```javascript
  getEntityLabel() { return 'city'; }
  
  getFallbackPatterns() {
    return [
      { pattern: '/{citySlug}', confidence: 0.6 },
      { pattern: '/city/{citySlug}', confidence: 0.5 },
      // ...
    ];
  }
  
  buildEntityMetadata(city) {
    const citySlug = slugify(city.name);
    return {
      name: city.name,
      citySlug,
      countryCode: city.countryCode ? city.countryCode.toLowerCase() : null,
      regionSlug: city.regionName ? slugify(city.regionName) : null
    };
  }
  ```

**`RegionHubGapAnalyzer`:**
- Extend `HubGapAnalyzerBase`
- Keep `getTopRegions()` query (region-specific)
- Delete duplicated: constructor, pattern generation
- Implement abstract methods:
  ```javascript
  getEntityLabel() { return 'region'; }
  
  getFallbackPatterns() {
    return [
      { pattern: '/{regionSlug}', confidence: 0.6 },
      { pattern: '/{countryCode}/{regionSlug}', confidence: 0.5 },
      // ...
    ];
  }
  
  buildEntityMetadata(region) {
    return {
      name: region.name,
      slug: slugify(region.name),
      countryCode: region.countryCode ? region.countryCode.toLowerCase() : null,
      regionCode: region.code || null
    };
  }
  ```

### Step 3: Validate and Test

1. Run existing unit tests for all three classes — behavior must be identical
2. Add new tests for `HubGapAnalyzerBase` covering:
   - Pattern deduplication (no duplicate URLs)
   - Placeholder substitution correctness
   - DSPL pattern priority over fallback
   - URL validation (no malformed URLs in output)
   - Confidence scoring consistency

### Step 4: Update Related Code

1. **Check all imports** of the three analyzer classes — no changes needed (exports unchanged)
2. **Fix CountryHubGapAnalyzer** to use `slugify()` from utils instead of `_generateCountrySlug()`

## Patterns to Introduce

1. **Template Method Pattern**: Base class defines algorithm (`predictHubUrls()`), subclasses provide building blocks
2. **Strategy Objects**: Each subclass provides different strategies via `getFallbackPatterns()` and `buildEntityMetadata()`
3. **Shared Utilities**: All subclasses use `slugify()` from `src/tools/slugify.js`

## Risks & Unknowns

- **Risk:** Base class abstraction could hide entity-specific behavior we haven't identified yet
  - **Mitigate:** Thorough unit testing; run existing tests before and after refactor
- **Risk:** Placeholder names or order might differ subtly between entity types
  - **Mitigate:** Port logic exactly as-is; add test cases for each entity type with real URLs
- **Risk:** Some consumers might rely on private methods being different across classes
  - **Mitigate:** Search codebase for direct instantiation and method calls; document public API

## Docs Impact

- Internal JSDoc updated in `HubGapAnalyzerBase` describing template method pattern and abstract methods
- Subclass constructors document no changes (API unchanged)
- No public documentation changes (internal service class)

## Focused Test Plan

Run these specific test suites during development:

```bash
# Before changes — establish baseline
npx jest --runTestsByPath src/services/__tests__/CountryHubGapAnalyzer.test.js --bail
npx jest --runTestsByPath src/services/__tests__/CityHubGapAnalyzer.test.js --bail
npx jest --runTestsByPath src/services/__tests__/RegionHubGapAnalyzer.test.js --bail

# After creating base class — ensure subclasses still work identically
npx jest --runTestsByPath src/services/__tests__ --bail

# New tests for base class
npx jest --runTestsByPath src/services/__tests__/HubGapAnalyzerBase.test.js --bail
```

## Rollback Plan

**If issues arise during development:**

1. Delete `src/services/HubGapAnalyzerBase.js`
2. Restore original versions of `CountryHubGapAnalyzer.js`, `CityHubGapAnalyzer.js`, `RegionHubGapAnalyzer.js` from git
3. Run test suite above to confirm behavior matches baseline
4. No database schema or migration needed

**If issues arise in production:**

1. Revert commit(s) introducing base class
2. Existing consumers unaffected (public API unchanged)

## Refactor Index

| Old Code | New Location | Status |
|----------|---|---|
| `CountryHubGapAnalyzer` constructor | `HubGapAnalyzerBase` constructor | Shared |
| `CountryHubGapAnalyzer._generateCountrySlug()` | Replaced with `slugify()` from utils | Deleted |
| `CountryHubGapAnalyzer.predictCountryHubUrls()` | `HubGapAnalyzerBase.predictHubUrls()` | Shared (renamed) |
| `CityHubGapAnalyzer.predictCityHubUrls()` | `HubGapAnalyzerBase.predictHubUrls()` | Shared (renamed) |
| `RegionHubGapAnalyzer.predictRegionHubUrls()` | `HubGapAnalyzerBase.predictHubUrls()` | Shared (renamed) |
| All `_addPattern()` helpers | `HubGapAnalyzerBase._addPattern()` | Shared |
| All `_deduplicateAndScore()` | `HubGapAnalyzerBase._deduplicateAndScore()` | Shared |
| Entity-specific `getTopCountries/Cities/Regions()` | Kept in each subclass | Per-entity |
| Entity-specific fallback patterns | `getFallbackPatterns()` abstract method | Per-entity |

## Implementation Checklist

- [ ] Create `src/services/HubGapAnalyzerBase.js` with shared logic
- [ ] Refactor `CountryHubGapAnalyzer` to extend base class
- [ ] Refactor `CityHubGapAnalyzer` to extend base class
- [ ] Refactor `RegionHubGapAnalyzer` to extend base class
- [ ] Replace `_generateCountrySlug()` calls with `slugify()` from utils
- [ ] Run baseline tests to confirm identical behavior
- [ ] Add unit tests for `HubGapAnalyzerBase` covering pattern generation
- [ ] Verify no breaking changes to public API
- [ ] Update this CHANGE_PLAN with completion notes
