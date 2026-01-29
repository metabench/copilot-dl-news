# 500-Page Threshold & Site Pattern Analysis

## Objective

Implement a smarter place hub guessing system that:
1. Only runs pattern analysis for hosts with 500+ pages downloaded
2. Shows 500+ page hosts with a visual indicator (lighter grey in matrix)
3. Provides a crawl feature to bootstrap sites to 500 pages
4. Uses site-specific URL pattern analysis to predict hub URLs more accurately

## Current State Analysis

From `tmp/host-page-analysis.json`:

**7 hosts with 500+ pages (eligible for pattern analysis):**
| Host | Pages | Successful |
|------|-------|------------|
| www.theguardian.com | 63,844 | 62,488 |
| www.bbc.com | 4,541 | 4,523 |
| efectococuyo.com | 3,807 | 3,807 |
| www.eltiempo.com | 2,134 | 1,896 |
| en.wikipedia.org | 1,914 | 1,914 |
| theguardian.com | 1,181 | 421 |
| www.thestar.com | 1,009 | 1,009 |

**29 hosts need more pages to reach 500:**
- www.reuters.com: 267 (need 233 more)
- www.abc.net.au: 114 (need 386 more)
- www.lemonde.fr: 101 (need 399 more)
- www.nytimes.com: 11 (need 489 more)
- And more...

## Implementation Phases

### Phase 1: Add Page Count Query & Data Layer ✅

**Tasks:**
1. [x] Create query to get page counts per host
2. [x] Add function `getHostPageCounts(dbHandle)` to queries file
3. [x] Add function `getHostsAboveThreshold(dbHandle, threshold)`
4. [x] Add function `getHostsBelowThreshold(dbHandle, threshold)`
5. [x] Add function `getHostPageCount(dbHandle, host)` for single host lookup
6. [x] Add function `getHostPageCountMap(dbHandle, hosts, threshold)` for efficient Map lookup
7. [x] Update `buildMatrixModel()` to include `hostPageCounts` Map and stats

### Phase 2: Visual Differentiation in Matrix ✅

**Tasks:**
1. [x] Add `hostPageCounts` Map to matrix model for efficient lookups
2. [x] Update MatrixTableControl column headers with page count indicator (✓ for 500+)
3. [x] Update MatrixTableControl row headers (flipped view) with page count indicator
4. [x] Update VirtualMatrixControl column headers with page count labels/titles
5. [x] Update VirtualMatrixControl row headers (flipped view) with page count labels/titles
6. [x] Add `colAttrs` and `rowAttrs` support to VirtualMatrixControl for data attributes
7. [x] Add CSS for `[data-host-eligible="true"]` styling (lighter green tint)
8. [x] Add stats to chrome panel: "✓ 500+" and "◌ <500" counts
9. [x] Check script passes (27/27 checks)

**Visual Design (Implemented):**
- Hosts with 500+ pages: Green tinted column/row header + "✓" indicator in label
- Hosts under 500: Normal grey styling
- Tooltip shows: "✅ Pattern analysis: ELIGIBLE ({count} pages)" or "📊 {count} pages (need {x} more)"
- Stats bar shows "✓ 500+" and "◌ <500" counts with tooltips

### Phase 3: Pattern Analysis System ✅

**Tasks:**
1. [x] Create `src/services/sitePatternAnalysis.js` service
2. [x] Analyze URL structures from http_responses for each host
3. [x] Detect common path patterns: `/world/{place}`, `/news/{topic}`, `/topics/{tag}`
4. [x] Store discovered patterns in new table `site_url_patterns`
5. [x] Integrate with hub URL generation
6. [x] Create CLI tool `tools/dev/run-pattern-analysis.js`
7. [x] Run analysis on all 6 eligible hosts (72 patterns saved)

**Schema for `site_url_patterns`:**
```sql
CREATE TABLE site_url_patterns (
  id INTEGER PRIMARY KEY,
  host TEXT NOT NULL,
  pattern_type TEXT NOT NULL,  -- 'section', 'place-hub'
  path_template TEXT NOT NULL, -- '/world/{place}', '/news/{place}'
  first_segment TEXT,          -- First path segment (world, news, etc.)
  confidence REAL,             -- 0.0-1.0 based on match frequency
  article_count INTEGER,       -- Articles matching this pattern
  child_count INTEGER,         -- Child paths count
  example_urls TEXT,           -- JSON array of sample URLs
  discovered_at TEXT,
  last_verified_at TEXT,
  is_active INTEGER DEFAULT 1,
  notes TEXT,
  UNIQUE(host, pattern_type, path_template)
);
```

**Patterns Discovered:**
| Host | Patterns | Top Pattern |
|------|----------|-------------|
| www.theguardian.com | 10 | `/world/{place}` (80% confidence) |
| www.bbc.com | 23 | Various language patterns |
| efectococuyo.com | 10 | Section patterns |
| en.wikipedia.org | 7 | Wiki structure patterns |
| www.eltiempo.com | 11 | `/mundo/{place}` (80% confidence) |
| www.thestar.com | 11 | `/news/{place}` patterns |

### Phase 4: Smart URL Generation ✅

**Tasks:**
1. [x] Add `getSitePatterns()` query function
2. [x] Add `generateCandidateHubUrls()` query function
3. [x] Modify `generateCandidateHubUrl()` to accept dbHandle and consult patterns
4. [x] Update `runPlaceScan()` to pass dbHandle to URL generator
5. [x] For hosts with patterns: Use discovered patterns
6. [x] For hosts without: Fall back to default patterns

**Test Results:**
- The Guardian "France": `/world/france` ✅ (matches discovered pattern)
- El Tiempo "Venezuela": `/mundo/venezuela` ✅ (uses Spanish section)
- Unknown host: Falls back to `/world/{place}` default

### Phase 5: Bootstrap Crawl Feature

**Tasks:**
1. [ ] Create endpoint `POST /api/bootstrap-hosts` to queue crawl jobs
2. [ ] Identify hosts below threshold
3. [ ] Calculate pages needed per host
4. [ ] Integrate with existing crawler infrastructure
5. [ ] Add UI button to trigger bootstrap crawl

---

## Done When

1. [x] Matrix column headers show page count indicator
2. [x] Hosts with 500+ pages have distinct visual styling
3. [x] Pattern analysis runs on eligible hosts and stores results
4. [x] `generateCandidateHubUrl()` uses site-specific patterns when available
5. [ ] Bootstrap crawl can be triggered for under-500 hosts
6. [ ] All existing tests pass
7. [x] New check scripts validate the feature

---

## Risks & Assumptions

- Pattern analysis may be computationally expensive for large hosts (Guardian: 60k+ pages)
- Some hosts may have inconsistent URL structures (no clear patterns)
- Bootstrap crawl respects rate limits and robots.txt

## Tests to Add

1. `getHostPageCounts()` unit test
2. `getHostsAboveThreshold()` unit test  
3. Pattern analysis correctness tests
4. Integration test for pattern-aware URL generation
