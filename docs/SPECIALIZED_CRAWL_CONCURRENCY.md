# Specialized Crawl Mode Concurrency Design

**When to Read**: Read this document if you are confused about why setting `--concurrency=8` for a geography crawl doesn't speed it up. This guide explains the design decision to treat the `concurrency` parameter as a *maximum allowed limit* for specialized crawls, rather than a direct instruction for parallel execution.

## Overview

This document explains how the `concurrency` parameter is treated differently for specialized crawl modes (gazetteer, geography, wikidata) versus regular web crawls.

## Core Principle

**The `concurrency` parameter represents the MAXIMUM ALLOWED concurrency, not a requirement.**

### Regular Web Crawls
- `concurrency=4` → Launch 4 parallel worker threads
- Each worker processes pages concurrently from a shared queue
- Higher concurrency = faster crawling (within rate limit constraints)

### Specialized Crawls (Gazetteer, Geography)
- `concurrency=4` → **Maximum** of 4 parallel operations allowed
- Actual parallelism determined by crawl mode's specific requirements
- **Current implementation: Sequential processing (concurrency effectively = 1)**
- Future optimizations may use limited parallelism but will respect the maximum

## Why Specialized Crawls Don't Use Full Concurrency

### 1. External API Rate Limits
- **Wikidata SPARQL**: ~60 requests/minute limit
- **Overpass API**: Rate-limited by OpenStreetMap foundation
- Parallel requests would trigger rate limiting and IP blocks
- Sequential processing ensures compliance with API terms

### 2. Database Transaction Ordering
- Geography data has hierarchical dependencies:
  - Countries must exist before regions
  - Regions must exist before cities
  - Parent entities referenced by foreign keys
- Parallel writes could violate referential integrity
- Sequential stages ensure data consistency

### 3. Data Consistency Requirements
- **Breadth-first processing**: Complete all countries before any regions
- **Stage completion**: Each stage must finish before next begins
- **Ingestor sequencing**: Multiple ingestors per stage run one at a time
- Parallelism would break these guarantees

## Implementation Details

### File: `src/crawl.js`

```javascript
// Concurrency option schema comment
concurrency: { 
  type: 'number', 
  default: 1, 
  processor: (val) => Math.max(1, val) 
},
// For regular crawls: number of parallel workers
// For specialized crawls (gazetteer, geography): maximum allowed (may use less)
// Gazetteer mode currently processes sequentially and ignores this value

// In _applyGazetteerDefaults()
// Store concurrency as maximum allowed, not as required parallelism level
this.concurrency = Math.max(1, options.concurrency || 1);
this.usePriorityQueue = false; // Disable concurrent queue
```

### File: `src/crawler/gazetteer/GazetteerModeController.js`

```javascript
/**
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

### File: `src/crawler/gazetteer/GazetteerIngestionCoordinator.js`

```javascript
/**
 * CONCURRENCY: This coordinator processes ingestors sequentially, one at a time.
 * It does NOT parallelize work across stages or ingestors. The crawler's
 * concurrency parameter is ignored by design - gazetteer operations depend on:
 * - External API rate limits (Wikidata, Overpass)
 * - Database transaction ordering (parent places before children)
 * - Sequential dependency chains (countries → regions → boundaries)
 */
```

### File: `src/crawler/gazetteer/StagedGazetteerCoordinator.js`

```javascript
/**
 * CONCURRENCY: Stages and ingestors are processed SEQUENTIALLY. The crawler's
 * concurrency setting is treated as a maximum allowed limit but is NOT used for
 * parallelization by default. Each stage completes before the next begins, and
 * within each stage, ingestors run one at a time.
 */
```

## Future Optimization Opportunities

While current implementation is fully sequential, future versions could add limited parallelism **within the concurrency maximum**:

### Potential Parallelism (Future)
1. **Parallel ingestors within a stage** (if independent):
   - WikidataCountryIngestor + OsmBoundaryIngestor could run in parallel
   - Each respects API rate limits independently
   - Would use `concurrency=2` maximum

2. **Batched API requests**:
   - Wikidata allows batch SPARQL queries
   - Could fetch 50 countries per request instead of 1
   - Still single-threaded but faster overall

3. **Database write buffering**:
   - Collect multiple records in memory
   - Batch insert in single transaction
   - Reduces database round-trips

### NOT Recommended (Future)
- ❌ Parallel stages (breaks dependencies)
- ❌ Parallel country processing (would exceed API limits)
- ❌ Concurrent writes without locking (race conditions)

## Usage Examples

### CLI
```bash
# Geography crawl with concurrency=1 (default, explicit maximum)
node src/crawl.js https://placeholder.example.com --crawl-type=geography --concurrency=1

# Geography crawl with concurrency=4 (higher maximum, still uses 1)
node src/crawl.js https://placeholder.example.com --crawl-type=geography --concurrency=4
```

Both commands produce identical behavior because geography mode processes sequentially. The `--concurrency=4` sets a higher ceiling but doesn't force parallel processing.

### Programmatic
```javascript
const crawler = new NewsCrawler('https://placeholder.example.com', {
  crawlType: 'geography',
  concurrency: 8  // Maximum allowed, actual usage = 1 (sequential)
});

await crawler.crawl();
// Processes: countries → regions → boundaries (one at a time)
```

## Design Philosophy

This design follows the **"provide maximum, use minimum"** principle:

1. ✅ Users can set high concurrency limits without breaking specialized crawls
2. ✅ Specialized modes use appropriate parallelism (often none) for their constraints
3. ✅ Future optimizations can increase parallelism without API changes
4. ✅ Clear documentation prevents confusion about actual behavior

## Related Documentation

- `AGENTS.md` - General crawler architecture
- `docs/GAZETTEER_BREADTH_FIRST_IMPLEMENTATION.md` - Gazetteer stage design
- `docs/GEOGRAPHY_CRAWL_TYPE.md` - Geography crawl overview

---

**Last Updated**: October 9, 2025  
**Status**: Documented and implemented across all gazetteer components
