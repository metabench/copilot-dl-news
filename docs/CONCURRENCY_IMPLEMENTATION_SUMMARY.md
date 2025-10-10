# Concurrency Implementation Summary

**When to Read**:
- To understand that the `concurrency` parameter is a *maximum limit* for specialized crawls (like geography), not a guaranteed number of parallel workers.
- As a historical summary of the documentation changes made to clarify this behavior.
- Before attempting to parallelize gazetteer crawls, to understand the existing sequential design.

**Date**: October 9, 2025  
**Purpose**: Ensure consistent understanding that `concurrency` is a MAXIMUM for specialized crawls

## Changes Made

### 1. Core Crawler (`src/crawl.js`)

**Option Schema Documentation** (line ~180):
```javascript
// Concurrency: For regular crawls, number of parallel workers.
// For gazetteer/geography crawls: maximum allowed concurrency (may use less or none).
// Gazetteer mode currently processes sequentially and ignores this value.
concurrency: { type: 'number', default: 1, processor: (val) => Math.max(1, val) },
```

**Constructor Comment** (line ~229):
```javascript
// Concurrency: for regular crawls = number of parallel workers
// For specialized crawls (gazetteer, geography) = maximum allowed (may use less)
this.concurrency = opts.concurrency;
```

**_resolveGazetteerVariant() JSDoc** (line ~745):
```javascript
/**
 * Determine if crawlType represents a specialized gazetteer mode
 * 
 * Specialized modes (gazetteer, geography, wikidata) have different execution
 * characteristics than regular web crawls:
 * - Sequential processing (not concurrent by default)
 * - External API dependencies with rate limits
 * - Hierarchical data relationships requiring ordered processing
 * - concurrency parameter treated as maximum allowed, not requirement
 */
```

**_applyGazetteerDefaults() JSDoc** (line ~773):
```javascript
/**
 * Apply default settings for gazetteer/geography crawl modes
 * 
 * CONCURRENCY: The concurrency parameter is stored but treated as a MAXIMUM
 * ALLOWED limit, not a requirement. Gazetteer and geography crawls process
 * data sequentially by default due to:
 * - External API rate limits (Wikidata SPARQL: 60 req/min, Overpass API)
 * - Database transaction ordering (parent places must exist before children)
 * - Sequential dependencies (countries → regions → boundaries)
 * 
 * Future optimizations may add limited parallelism (e.g., parallel ingestors
 * within a stage), but will always respect this.concurrency as an upper bound.
 */
```

### 2. Gazetteer Mode Controller (`src/crawler/gazetteer/GazetteerModeController.js`)

**Class-level JSDoc**:
```javascript
/**
 * GazetteerModeController - Controls gazetteer/geography crawl execution
 * 
 * CONCURRENCY NOTE: Gazetteer crawls process data sequentially and do NOT use
 * the concurrency parameter. The concurrency setting from the crawler is treated
 * as a maximum allowed limit, but gazetteer operations are inherently sequential
 * due to their reliance on external API rate limits (Wikidata SPARQL, Overpass API)
 * and database transaction ordering requirements.
 * 
 * Future optimizations may add limited parallelism within stages, but the
 * concurrency parameter will always be treated as an upper bound, not a requirement.
 */
```

### 3. Ingestion Coordinator (`src/crawler/gazetteer/GazetteerIngestionCoordinator.js`)

**Module-level JSDoc**:
```javascript
/**
 * GazetteerIngestionCoordinator - Sequential processing of gazetteer data stages
 * 
 * CONCURRENCY: This coordinator processes ingestors sequentially, one at a time.
 * It does NOT parallelize work across stages or ingestors. The crawler's
 * concurrency parameter is ignored by design - gazetteer operations depend on:
 * - External API rate limits (Wikidata, Overpass)
 * - Database transaction ordering (parent places before children)
 * - Sequential dependency chains (countries → regions → boundaries)
 */
```

### 4. Staged Coordinator (`src/crawler/gazetteer/StagedGazetteerCoordinator.js`)

**Class-level JSDoc** (expanded):
```javascript
/**
 * StagedGazetteerCoordinator
 * 
 * Orchestrates breadth-first gazetteer ingestion by running ingestors in stages.
 * ...
 * 
 * CONCURRENCY: Stages and ingestors are processed SEQUENTIALLY. The crawler's
 * concurrency setting is treated as a maximum allowed limit but is NOT used for
 * parallelization by default. Each stage completes before the next begins, and
 * within each stage, ingestors run one at a time. This design accommodates:
 * - External API rate limits (Wikidata SPARQL, Overpass API)
 * - Database transaction dependencies (parent → child relationships)
 * - Data consistency requirements (all countries before any regions)
 */
```

### 5. UI/Server Integration

**buildArgs.js** (`src/ui/express/services/buildArgs.js`):
```javascript
// Concurrency: For regular web crawls, this sets the number of parallel workers.
// For specialized crawls (gazetteer/geography/wikidata), this sets the MAXIMUM
// allowed concurrency. Specialized crawls may process sequentially (effectively
// concurrency=1) regardless of this value due to API rate limits and data dependencies.
if (body.concurrency != null) args.push(`--concurrency=${parseInt(body.concurrency, 10)}`);
```

**index.html** (`src/ui/express/public/index.html`):
```html
<input id="concurrency" type="number" value="1" 
       title="For web crawls: number of parallel workers. For geography/gazetteer crawls: maximum allowed (may use less)." />
```

### 6. Documentation

**New Comprehensive Guide**: `docs/SPECIALIZED_CRAWL_CONCURRENCY.md`
- Explains maximum vs requirement concept
- Compares regular vs specialized crawl behavior
- Documents implementation across all files
- Provides usage examples
- Outlines future optimization opportunities

**Updated Geography Guide**: `docs/GEOGRAPHY_CRAWL_TYPE.md`
- Corrected Performance Considerations section
- Removed misleading "higher concurrency speeds up" statement
- Added accurate timing expectations (~5-10 minutes for full dataset)
- Linked to comprehensive concurrency documentation

**Updated Main README**: `README.md`
- Added clarification to `--concurrency=N` flag description
- Noted specialized crawls treat it as maximum allowed

## Verification Checklist

✅ **Core crawler option schema** - documented maximum behavior  
✅ **Gazetteer mode controller** - class-level documentation  
✅ **Ingestion coordinator** - module-level documentation  
✅ **Staged coordinator** - expanded class documentation  
✅ **buildArgs service** - inline comment explaining flow  
✅ **UI HTML** - tooltip explaining to end users  
✅ **SPECIALIZED_CRAWL_CONCURRENCY.md** - comprehensive guide created  
✅ **GEOGRAPHY_CRAWL_TYPE.md** - corrected misleading statements  
✅ **README.md** - updated CLI flag documentation  

## Testing

All existing tests continue to pass without modification because:
- The behavior hasn't changed (gazetteer crawls were already sequential)
- Only documentation and comments were added/updated
- Tests use `concurrency: 1` which works identically before and after

## Future Work

When adding parallelism to gazetteer crawls (future optimization):

1. **Check crawler.concurrency** before spawning parallel operations
2. **Respect the maximum** - never exceed `this.concurrency`
3. **Document actual usage** - update comments with new parallelism details
4. **Update SPECIALIZED_CRAWL_CONCURRENCY.md** - reflect actual usage patterns

Example future code:
```javascript
// In StagedGazetteerCoordinator.execute()
const maxParallelIngestors = Math.min(
  stage.ingestors.length,
  this.crawler.concurrency  // Respect maximum
);

// Run ingestors with limited parallelism
await pMap(stage.ingestors, ingestor => ingestor.run(), {
  concurrency: maxParallelIngestors
});
```

## Related Documentation

- `AGENTS.md` - General crawler architecture
- `docs/GAZETTEER_BREADTH_FIRST_IMPLEMENTATION.md` - Stage-based processing
- `docs/GEOGRAPHY_CRAWL_TYPE.md` - Geography crawl overview
- `docs/SPECIALIZED_CRAWL_CONCURRENCY.md` - Detailed concurrency design

---

**Status**: Fully implemented and documented across the entire codebase.
