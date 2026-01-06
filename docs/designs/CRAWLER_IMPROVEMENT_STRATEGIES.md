# Crawler Improvement Strategies: Deep Research & Lab Proposals

**Created**: 2025-12-15
**Session**: [2025-12-15-crawler-improvement-strategies](../sessions/2025-12-15-crawler-improvement-strategies/)
**Parent Doc**: [CRAWLER_STATE_REPORT.md](../reports/2025-12-15-CRAWLER_STATE_REPORT.md)

## Executive Summary

This document provides deep research findings on the 7 improvement opportunities identified in the Crawler State Report. **Key finding**: The Phase 2 "Hybrid Architecture" has significantly more foundation than the roadmap indicates—SkeletonHash, SkeletonDiff, and `layout_signatures` table already exist with 30 rows of real Guardian article data.

### Discovery Matrix

| Improvement | Expected State | Actual State | Gap |
|-------------|----------------|--------------|-----|
| 1. Puppeteer Teacher | Not started | Patterns in lab experiments | Minimal integration needed |
| 2. Confidence Scoring | Not started | **Already in CrawlPlaybookService** (0.6-0.95) | Extend to ArticleProcessor |
| 3. Incremental Sitemaps | Not started | Batch-only (5000 limit) | Full rewrite needed |
| 4. Domain Rate Learning | Partial | **Mature DomainThrottleManager** | Add persistence layer |
| 5. Robots.txt Caching | Not started | No caching | Simple add |
| 6. Content Deduplication | Not started | URL-only dedup | Add content hash |
| 7. Adaptive Concurrency | Not started | Static maxConcurrency | Add feedback loop |
| BONUS: Skeleton Hashing | "Not started" | **✅ EXISTS WITH DATA** | Just integrate! |
| 8. Boolean Decision Pipeline | Partial | ArticleSignalsService + decision-trees JSON | Unify & optimize |
| 9. Persistent Puppeteer Pool | Not started | Per-invocation browser launch | Keep browser alive |
| 10. CSS Analysis (Optional) | Not started | No CSS extraction | Cache & analyze CSS |
| 11. Decision Visibility | Partial | DecisionConfigSet + Viewer (3030) | Studio + Audit + Config-driven |

---

## Improvement 1: Puppeteer Teacher Module

### Current State
- **Roadmap Status**: Marked as "not started" in Phase 2
- **Actual Infrastructure**: 
  - Puppeteer installed as dev dependency
  - Used in `scripts/ui/puppeteer-console.js` for console capture
  - Lab experiment 029 has mixed builtin/custom activation patterns
  - E2E tests in `tests/server/` use Puppeteer extensively
  - ContentValidationService already classifies `SOFT_FAILURE_SIGNATURES` for Puppeteer queue

### What Exists

```javascript
// ContentValidationService.js - Line 66-72
const SOFT_FAILURE_SIGNATURES = [
  /please\s+enable\s+javascript/i,
  /javascript\s+is\s+(required|disabled)/i,
  /checking\s+your\s+browser/i,
  /cloudflare/i,
  /ddos\s+protection/i
];
```

When validation returns `failureType: 'soft'`, the URL should be queued for Puppeteer re-fetch.

### Architecture for Teacher Module

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PUPPETEER TEACHER FLOW                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐     ┌──────────────────┐     ┌───────────────────┐    │
│  │ Static      │     │ ContentValidation │     │ Soft Failure      │    │
│  │ Fetch       │────▶│ Service          │────▶│ Queue             │    │
│  │ (fast path) │     │                  │     │ (priority table)  │    │
│  └─────────────┘     └──────────────────┘     └────────┬──────────┘    │
│                                                         │               │
│                                                         ▼               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    PUPPETEER TEACHER MODULE                      │   │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │   │
│  │  │ Browser     │  │ Visual       │  │ SkeletonHash           │  │   │
│  │  │ Pool (1-3)  │  │ Analyzer     │  │ Integration            │  │   │
│  │  └──────┬──────┘  └──────┬───────┘  └───────────┬────────────┘  │   │
│  │         │                │                       │               │   │
│  │         └────────────────┼───────────────────────┘               │   │
│  │                          ▼                                       │   │
│  │               ┌──────────────────┐                               │   │
│  │               │ Template Mask    │                               │   │
│  │               │ Generator        │                               │   │
│  │               └─────────┬────────┘                               │   │
│  └─────────────────────────┼────────────────────────────────────────┘   │
│                            ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     DATABASE STORAGE                             │   │
│  │  layout_signatures (✅ EXISTS)  │  layout_masks (queries ready) │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Implementation Strategy

**Phase A: Soft Failure Queue** (2-4 hours)
1. Add `puppeteer_queue` table: `url TEXT PRIMARY KEY, domain TEXT, failure_reason TEXT, attempts INTEGER, next_attempt_at DATETIME`
2. Modify FetchPipeline to insert soft failures into queue
3. Add `/api/stats/puppeteer-queue` endpoint for monitoring

**Phase B: Minimal Teacher** (4-8 hours)
1. Create `src/teacher/PuppeteerTeacher.js`:
   - Browser pool management (max 2 concurrent)
   - Page load with screenshot capture
   - SkeletonHash computation on rendered DOM
2. Add `npm run teacher:process` command

**Phase C: Template Learning** (4-8 hours)
1. Create `layout_masks` table
2. Integrate SkeletonDiff for mask generation
3. Store masks when seeing 3+ pages with same signature

### Lab Experiment Proposal

**Experiment 030: Puppeteer Teacher Minimal**
```
Location: src/ui/lab/experiments/030-puppeteer-teacher-minimal/
Purpose: Validate browser pool + SkeletonHash integration
Scope:
  - Spawn single Puppeteer instance
  - Fetch 5 Guardian article URLs from layout_signatures
  - Compute SkeletonHash on rendered DOM
  - Compare to stored signatures
  - Measure memory footprint, timing
Success Criteria:
  - Hash match rate > 80% for same template
  - Processing time < 5s per page
  - Memory stays under 500MB for 3 concurrent tabs
```

---

## Improvement 2: Extraction Confidence Scoring

### Current State
- **Roadmap Status**: Marked as Phase 3 item
- **Actual Infrastructure**: **Already implemented in CrawlPlaybookService**

```javascript
// CrawlPlaybookService.js - confidence scoring exists!
// Confidence range: 0.6 (low) to 0.95 (high) based on pattern occurrence count
```

### What Needs Extension

The existing confidence is for URL pattern matching. We need content-level confidence:

| Signal | Weight | Source |
|--------|--------|--------|
| Word count | 0.2 | ArticleProcessor._runReadability() |
| Has headline | 0.15 | metadata.headline |
| Has author | 0.1 | metadata.author |
| Has date | 0.1 | metadata.datePublished |
| Schema.org present | 0.15 | extractSchemaSignals() |
| Layout mask match | 0.2 | SkeletonHash + layout_masks |
| Article tag present | 0.1 | `<article>` detection |

### Implementation Strategy

**Phase A: Extend ArticleProcessor** (2-3 hours)
1. Add `computeExtractionConfidence()` method
2. Return 0.0-1.0 score based on signal presence
3. Store in `articles.extraction_confidence` column

**Phase B: Low-Confidence Queue** (2-3 hours)
1. If confidence < 0.5, queue for Puppeteer Teacher
2. Add confidence histogram to Data Explorer

**Phase C: Feedback Loop** (4-6 hours)
1. Track confidence vs. manual review outcomes
2. Adjust weights based on false positive/negative rates

### Lab Experiment Proposal

**Experiment 031: Confidence Signal Calibration**
```
Location: src/ui/lab/experiments/031-confidence-scoring-calibration/
Purpose: Test confidence formula against known good/bad articles
Scope:
  - Select 100 articles from DB (50 high word count, 50 low)
  - Manually label: valid_article, garbage, partial
  - Compute confidence with proposed formula
  - Calculate accuracy, precision, recall
  - Iterate weights for optimal F1 score
Success Criteria:
  - Precision > 90% at confidence threshold 0.7
  - Recall > 80% (don't miss valid articles)
```

---

## Improvement 3: Incremental Sitemap Processing

### Current State
- **File**: `src/crawler/sitemap.js` (30 lines, highly compressed)
- **Limitations**:
  - Batch loading only (fetches entire sitemap into memory)
  - Hard limit of 5000 URLs
  - No checkpoint/resume capability
  - No incremental updates based on `lastmod`

```javascript
// Current sitemap.js - Line 11
const maxUrls = Math.max(0, opts?.sitemapMaxUrls || 5000);
```

### Required Rewrite

```javascript
// Proposed: StreamingSitemapLoader
class StreamingSitemapLoader {
  constructor(options) {
    this.chunkSize = options.chunkSize || 100;
    this.checkpoint = options.checkpoint || null; // Resume from here
    this.onChunk = options.onChunk || (() => {});
  }
  
  async *streamUrls(sitemapUrl) {
    // Streaming XML parser (sax-js or similar)
    // Yield URL objects: { loc, lastmod, changefreq, priority }
    // Support checkpoint: skip URLs until we pass checkpoint.lastUrl
  }
  
  async processIncrementally(domain, dbAdapter) {
    // 1. Get last_sitemap_check from domain_metadata
    // 2. Only yield URLs where lastmod > last_check
    // 3. Update checkpoint after each chunk
    // 4. Support graceful abort on shutdown
  }
}
```

### Implementation Strategy

**Phase A: Add sax-js Dependency** (1 hour)
1. `npm install sax`
2. Create `src/crawler/StreamingSitemapLoader.js`

**Phase B: Streaming Parser** (4-6 hours)
1. Implement SAX-based XML parsing
2. Yield URL objects incrementally
3. Add `lastmod` filtering

**Phase C: Checkpoint Storage** (2-3 hours)
1. Add `sitemap_checkpoints` table: `domain, last_url, last_lastmod, processed_count`
2. Resume from checkpoint on restart

### Lab Experiment Proposal

**Experiment 032: Streaming Sitemap Parser**
```
Location: src/ui/lab/experiments/032-streaming-sitemap/
Purpose: Validate streaming parser against real sitemaps
Scope:
  - Download sitemap from major news site (BBC, NYT, Guardian)
  - Parse with SAX in streaming mode
  - Measure memory usage vs batch mode
  - Test checkpoint/resume with artificial interruption
Success Criteria:
  - Memory usage < 50MB for 100K URL sitemap
  - Can resume within 5 URLs of checkpoint
  - No dropped URLs on successful run
```

---

## Improvement 4: Domain-Specific Rate Learning

### Current State
- **File**: `src/crawler/DomainThrottleManager.js` (234 lines)
- **Existing Features**:
  - Default 30 RPM for new domains
  - 429 handling with exponential backoff
  - Per-domain state tracking (RPM windows, success streaks)
  - Jitter injection
- **Gap**: No persistence—learned rates lost on restart

```javascript
// DomainThrottleManager.js - Line 37-50 (in-memory state)
state = {
  host,
  isLimited: false,
  rpm: 30,  // Default conservative RPM
  nextRequestAt: 0,
  backoffUntil: 0,
  successStreak: 0,
  err429Streak: 0,
  rpmLastMinute: 0,
  // ... more fields
};
```

### Implementation Strategy

**Phase A: Persistence Layer** (3-4 hours)
1. Add `domain_rate_config` table:
   ```sql
   CREATE TABLE domain_rate_config (
     domain TEXT PRIMARY KEY,
     learned_rpm INTEGER DEFAULT 30,
     max_observed_rpm INTEGER,
     last_429_at DATETIME,
     total_requests INTEGER DEFAULT 0,
     total_429s INTEGER DEFAULT 0,
     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
   );
   ```
2. Load at startup, save on rate changes

**Phase B: Adaptive Learning** (4-6 hours)
1. After N successful requests at RPM X, try X+5
2. On 429, immediately drop to X-10 and record
3. Track "safe RPM" = max RPM with 0 429s over 1000 requests

**Phase C: Cross-Session Learning** (2-3 hours)
1. Pre-seed config for known sites (e.g., theguardian.com → 60 RPM)
2. Share learned rates via config export/import

### Lab Experiment Proposal

**Experiment 033: Rate Limit Learning Simulator**
```
Location: src/ui/lab/experiments/033-rate-learning-sim/
Purpose: Validate rate learning algorithm without hitting real sites
Scope:
  - Create mock server with configurable rate limits
  - Run DomainThrottleManager against mock
  - Verify algorithm converges to optimal rate
  - Test recovery from artificial 429 bursts
Success Criteria:
  - Converges to within 10% of optimal rate
  - Recovers from 429 storm in < 30 requests
  - Persistence survives simulated restart
```

---

## Improvement 5: Robots.txt Caching with TTL

### Current State
- **File**: `src/crawler/RobotsAndSitemapCoordinator.js` (268 lines)
- **Behavior**: Fetches robots.txt fresh every startup
- **Gap**: No caching, no TTL management

### Implementation Strategy

**Phase A: Memory Cache** (1-2 hours)
1. Add `robotsCache` Map in RobotsAndSitemapCoordinator
2. Key: domain, Value: { rules, fetchedAt, ttl }
3. TTL default: 24 hours

**Phase B: Persistent Cache** (2-3 hours)
1. Add `robots_cache` table:
   ```sql
   CREATE TABLE robots_cache (
     domain TEXT PRIMARY KEY,
     robots_txt TEXT,
     fetched_at DATETIME,
     expires_at DATETIME,
     crawl_delay INTEGER
   );
   ```
2. Check cache before fetch, respect TTL

**Phase C: Crawl-Delay Extraction** (1-2 hours)
1. Parse `Crawl-delay` directive
2. Feed into DomainThrottleManager as minimum delay

### Lab Experiment Proposal

**Experiment 034: Robots.txt Parser Enhancement**
```
Location: src/ui/lab/experiments/034-robots-txt-parser/
Purpose: Test robots.txt parsing edge cases
Scope:
  - Collect robots.txt from 20 major news sites
  - Parse with current and enhanced parser
  - Extract: User-agent rules, Disallow patterns, Crawl-delay, Sitemap URLs
  - Validate against robotstxt.org spec
Success Criteria:
  - Parse 100% of collected files without error
  - Extract Crawl-delay where present
  - Handle malformed files gracefully
```

---

## Improvement 6: Content Deduplication Pipeline

### Current State
- **Existing Dedup**: `domainUtils.deduplicateByDomain()` - URL-based only
- **Gap**: No content-based deduplication (same article at different URLs)

### Implementation Strategy

**Phase A: Content Hash Column** (2-3 hours)
1. Add `content_hash TEXT` to `articles` table
2. Compute SHA-256 of normalized text content
3. Index for fast lookup

**Phase B: Near-Duplicate Detection** (4-6 hours)
1. Use SimHash or MinHash for fuzzy matching
2. Threshold: 95% similarity = duplicate
3. Store only first occurrence, link subsequent URLs

**Phase C: Integration with SkeletonHash** (3-4 hours)
1. Extract content from `dynamic_paths` only (using layout masks)
2. Hash the extracted content, not the full page
3. More robust to template changes

### Lab Experiment Proposal

**Experiment 035: Content Hashing Strategies**
```
Location: src/ui/lab/experiments/035-content-hashing/
Purpose: Compare content hashing approaches
Scope:
  - Collect 100 article pairs (same content, different URLs)
  - Test: SHA-256, SimHash, MinHash, SkeletonDiff-extracted
  - Measure collision rate, false positive rate
  - Compare storage and computation costs
Success Criteria:
  - Identify approach with < 0.1% false positive rate
  - Processing time < 10ms per article
  - Storage overhead < 64 bytes per article
```

---

## Improvement 7: Adaptive Concurrency

### Current State
- **File**: `src/crawler/CrawlStrategyTemplates.js`
- **Settings**: Static `maxConcurrency` per strategy (1-20)
- **Gap**: No dynamic adjustment based on conditions

```javascript
// CrawlStrategyTemplates.js examples
conservative: { maxConcurrency: 3 }
normal: { maxConcurrency: 8 }
aggressive: { maxConcurrency: 20 }
```

### Implementation Strategy

**Phase A: Latency Monitor** (2-3 hours)
1. Track P95 latency per domain (rolling 100 requests)
2. Track global queue depth

**Phase B: Concurrency Controller** (4-6 hours)
1. If P95 latency > 2s and queue depth > 100: reduce workers by 2
2. If P95 latency < 500ms and queue depth > 500: add 1 worker
3. Bounds: min 2, max 30 (configurable)

**Phase C: Per-Domain Concurrency** (3-4 hours)
1. Some domains handle 10 concurrent, others only 1
2. Track per-domain concurrency tolerance
3. Mix slow/fast domains for optimal throughput

### Lab Experiment Proposal

**Experiment 036: Concurrency Feedback Loop**
```
Location: src/ui/lab/experiments/036-adaptive-concurrency/
Purpose: Test concurrency controller with mock latencies
Scope:
  - Create mock fetch with configurable latency distribution
  - Run concurrency controller algorithm
  - Measure throughput at various queue depths
  - Test stability (no oscillation)
Success Criteria:
  - Achieves 80% of theoretical max throughput
  - No oscillation (stable within ±2 workers)
  - Responds to latency spike within 30 seconds
```

---

## BONUS: Skeleton Hashing Integration (Already Built!)

### Surprise Finding

**The roadmap shows "Skeleton Hash" as Phase 2 unchecked, but it already exists!**

| Component | Location | Status |
|-----------|----------|--------|
| SkeletonHash | `src/analysis/structure/SkeletonHash.js` | ✅ Complete |
| SkeletonDiff | `src/analysis/structure/SkeletonDiff.js` | ✅ Complete |
| layout_signatures table | SQLite | ✅ 30 rows with Guardian data |
| layoutMasks.js queries | `src/db/sqlite/v1/queries/layoutMasks.js` | ✅ Ready |
| layout_masks table | - | 🟡 Schema defined, table not created |

### Immediate Integration Opportunity

Since SkeletonHash and SkeletonDiff exist, the Puppeteer Teacher integration is much simpler than expected:

```javascript
// Already available:
const skeletonHash = require('../../analysis/structure/SkeletonHash');
const skeletonDiff = require('../../analysis/structure/SkeletonDiff');

// Compute signature for new page
const { hash, signature } = skeletonHash.compute(html, 2); // Level 2

// Check if we've seen this layout
const existing = db.prepare('SELECT * FROM layout_signatures WHERE signature_hash = ?').get(hash);

// If new, store it; if seen 3+ times, generate mask
if (!existing) {
  // Store new signature
} else if (existing.seen_count >= 3) {
  // Generate mask using SkeletonDiff
}
```

### Lab Experiment Proposal

**Experiment 037: SkeletonHash Live Integration**
```
Location: src/ui/lab/experiments/037-skeleton-hash-integration/
Purpose: Integrate SkeletonHash into ArticleProcessor
Scope:
  - Compute SkeletonHash for every processed article
  - Store in layout_signatures (update seen_count)
  - Track signature distribution across domains
  - Generate first layout_masks for top signatures
Success Criteria:
  - SkeletonHash computation adds < 50ms per article
  - 80%+ of articles cluster into < 50 unique signatures
  - First masks generated successfully
```

---

## Improvement 8: Boolean Decision Pipeline

### Current State
- **Existing Infrastructure**:
  - `ArticleSignalsService.js` - `looksLikeArticle()`, `computeUrlSignals()`, `computeContentSignals()`
  - `config/decision-trees/page-categories.json` - Sophisticated tree with conditions, confidence scores
  - `DecisionTreeControl` in UI for visualization
- **Gap**: Signals computed but not unified into cacheable boolean facts

### Why Boolean Decision Making?

```
┌──────────────────────────────────────────────────────────────────────────┐
│                  BOOLEAN DECISION PIPELINE                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  URL: https://theguardian.com/world/2025/dec/15/example-article         │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    FAST BOOLEAN CHECKS                           │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │    │
│  │  │ has_date_    │  │ has_article_ │  │ has_section_ │  ...     │    │
│  │  │ path: true   │  │ words: true  │  │ match: true  │          │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘          │    │
│  │  Cost: ~5µs each (regex/string ops only)                        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                           │
│                              ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                 CONTENT BOOLEAN CHECKS                           │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │    │
│  │  │ has_article_ │  │ has_headline │  │ has_author   │  ...     │    │
│  │  │ tag: true    │  │ tag: true    │  │ meta: true   │          │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘          │    │
│  │  Cost: ~50µs (requires parsed DOM, but cached)                   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                           │
│                              ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                  EXPENSIVE CHECKS (SKIP IF CONFIDENT)            │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │    │
│  │  │ readability_ │  │ schema_org_  │  │ layout_mask_ │          │    │
│  │  │ score > 0.7  │  │ article: true│  │ match: true  │          │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘          │    │
│  │  Cost: ~200-500µs (Readability parse, JSON-LD extraction)        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                           │
│                              ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                  CONFIDENCE AGGREGATION                          │    │
│  │  confidence = Σ(signal_weight × signal_value)                    │    │
│  │  if (confidence > 0.85) → ARTICLE (skip expensive checks)        │    │
│  │  if (confidence < 0.30) → NOT_ARTICLE (stop early)               │    │
│  │  if (0.30 ≤ confidence ≤ 0.85) → RUN EXPENSIVE CHECKS            │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Boolean Signals Taxonomy

| Signal Name | Type | Cost | Weight | Source |
|-------------|------|------|--------|--------|
| `url_has_date_path` | URL | 5µs | 0.15 | `/2025/12/15/` regex |
| `url_has_article_words` | URL | 5µs | 0.10 | `article|story|news` |
| `url_not_skip_pattern` | URL | 5µs | 0.05 | NOT `/login|/search` |
| `dom_has_article_tag` | Content | 20µs | 0.15 | `<article>` exists |
| `dom_has_headline_tag` | Content | 20µs | 0.10 | `<h1>` in article |
| `meta_has_author` | Content | 30µs | 0.05 | `meta[name=author]` |
| `meta_has_date` | Content | 30µs | 0.05 | `meta[property=article:published_time]` |
| `schema_has_article` | Content | 100µs | 0.15 | JSON-LD `@type: Article` |
| `readability_word_count > 200` | Expensive | 300µs | 0.10 | Readability parse |
| `layout_signature_known` | Expensive | 50µs | 0.10 | SkeletonHash lookup |

### Implementation Strategy

**Phase A: Boolean Signal Registry** (3-4 hours)
1. Create `src/crawler/signals/BooleanSignalRegistry.js`
2. Define signal interface: `{ name, cost, weight, compute(context) → boolean }`
3. Register all existing signals from `ArticleSignalsService`

**Phase B: Early Exit Optimizer** (2-3 hours)
1. Sort signals by cost (cheapest first)
2. Compute cumulative confidence after each signal
3. Early exit if confidence > 0.85 or < 0.30

**Phase C: Signal Caching** (2-3 hours)
1. Cache URL-based signals (immutable per URL)
2. Cache DOM-based signals per fetch (invalidate on refetch)
3. Persist learned signal accuracy per domain

### Lab Experiment Proposal

**Experiment 038: Boolean Signal Profiler**
```
Location: src/ui/lab/experiments/038-boolean-signal-profiler/
Purpose: Profile signal costs and accuracy on real article corpus
Scope:
  - Select 1000 articles with known is_article labels
  - Compute all signals, measure per-signal time
  - Calculate accuracy per signal (true positive rate)
  - Optimize signal order for maximum early-exit rate
Success Criteria:
  - Average decision time < 100µs (with early exit)
  - Accuracy > 95% on labeled corpus
  - 70%+ of decisions exit early (skip expensive checks)
```

---

## Improvement 9: Persistent Puppeteer Pool

### Current State
- Puppeteer used only in tests and one-off scripts
- Each invocation launches a new browser (~1-2 seconds)
- No connection reuse between layout analysis tasks

### Why Persistent Pool?

| Approach | Browser Launch | Page Creation | Memory | Throughput |
|----------|----------------|---------------|--------|------------|
| Per-request browser | 1-2s | N/A | Spiky | ~0.5 pages/s |
| Persistent browser | Once | ~50ms | Stable | ~10 pages/s |
| Browser pool (2-3) | Once × N | ~50ms | Bounded | ~20-30 pages/s |

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PERSISTENT PUPPETEER POOL                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                    PuppeteerPoolManager                            │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │ │
│  │  │ Browser 1   │  │ Browser 2   │  │ Browser 3   │               │ │
│  │  │ (idle)      │  │ (working)   │  │ (working)   │               │ │
│  │  │ Pages: 0/5  │  │ Pages: 3/5  │  │ Pages: 2/5  │               │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘               │ │
│  │                                                                   │ │
│  │  Config:                                                          │ │
│  │  - maxBrowsers: 3                                                 │ │
│  │  - maxPagesPerBrowser: 5                                          │ │
│  │  - idleTimeout: 5 minutes                                         │ │
│  │  - recycleAfter: 100 pages (prevents memory leaks)                │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                              │                                          │
│                              ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                    Usage Pattern                                   │ │
│  │                                                                    │ │
│  │  const page = await pool.acquire();                                │ │
│  │  try {                                                             │ │
│  │    await page.goto(url, { waitUntil: 'networkidle2' });            │ │
│  │    const html = await page.content();                              │ │
│  │    const skeleton = skeletonHash.compute(html, 2);                 │ │
│  │    // ... layout analysis                                          │ │
│  │  } finally {                                                       │ │
│  │    await pool.release(page);  // Returns page to pool              │ │
│  │  }                                                                 │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Implementation Strategy

**Phase A: Pool Manager Class** (4-6 hours)
1. Create `src/teacher/PuppeteerPoolManager.js`
2. Implement `acquire()`, `release()`, `shutdown()` methods
3. Add browser health monitoring (crash recovery)
4. Implement page recycling (close after N uses)

**Phase B: Integration with Teacher** (2-3 hours)
1. Wire pool into `PuppeteerTeacher` module
2. Configure pool size based on available memory
3. Add graceful shutdown on process exit

**Phase C: Metrics & Monitoring** (2-3 hours)
1. Track: active pages, queue depth, avg wait time
2. Expose `/api/stats/puppeteer-pool` endpoint
3. Alert on pool exhaustion or browser crashes

### Lab Experiment Proposal

**Experiment 039: Puppeteer Pool Memory Profile**
```
Location: src/ui/lab/experiments/039-puppeteer-pool-memory/
Purpose: Validate memory stability under sustained load
Scope:
  - Create pool with 2 browsers, 5 pages each
  - Process 500 URLs in sequence
  - Monitor: memory usage, page creation time, crash count
  - Test browser recycling after 100 pages
Success Criteria:
  - Memory stays under 800MB for 2-browser pool
  - No memory growth trend over 500 pages
  - Zero browser crashes with recycling enabled
```

---

## Improvement 10: CSS Analysis Layer (Optional)

### Rationale

CSS provides signals that SkeletonHash misses:

| Signal | SkeletonHash | CSS Analysis |
|--------|--------------|--------------|
| DOM structure | ✅ | - |
| Element visibility | ❌ | ✅ `display: none`, `visibility: hidden` |
| Layout type | ❌ | ✅ `display: grid`, `flex`, `block` |
| Content regions | ❌ | ✅ `main`, `article`, `aside` styling |
| Ad containers | ❌ | ✅ Class patterns like `.ad-`, `.sponsor-` |
| Media queries | ❌ | ✅ Mobile vs desktop layouts |
| Cookie banners | ❌ | ✅ Fixed position overlays |

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     CSS ANALYSIS LAYER (OPTIONAL)                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                    CSSAnalyzer                                     │ │
│  │                                                                    │ │
│  │  Input: Page HTML + Rendered Page (Puppeteer)                      │ │
│  │                                                                    │ │
│  │  1. Extract <style> and <link rel="stylesheet">                    │ │
│  │  2. Fetch external CSS (with caching)                              │ │
│  │  3. Parse with css-tree or postcss                                 │ │
│  │  4. Build selector → rule mapping                                  │ │
│  │  5. Identify:                                                      │ │
│  │     - Hidden elements (display:none, visibility:hidden)            │ │
│  │     - Layout containers (grid, flex, main-content classes)         │ │
│  │     - Ad/tracking patterns (.ad-, .sponsor-, .tracking-)           │ │
│  │     - Fixed overlays (position:fixed + high z-index)               │ │
│  │                                                                    │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                              │                                          │
│                              ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                    CSS Cache (Optional Storage)                    │ │
│  │                                                                    │ │
│  │  Table: css_cache                                                  │ │
│  │  - domain TEXT                                                     │ │
│  │  - stylesheet_url TEXT                                             │ │
│  │  - content_hash TEXT                                               │ │
│  │  - parsed_rules_json TEXT (compressed)                             │ │
│  │  - fetched_at DATETIME                                             │ │
│  │  - size_bytes INTEGER                                              │ │
│  │                                                                    │ │
│  │  Benefits:                                                         │ │
│  │  - CSS changes rarely (cache for days)                             │ │
│  │  - Same CSS across all pages on domain                             │ │
│  │  - Parse once, use many times                                      │ │
│  │                                                                    │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                              │                                          │
│                              ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                    Integration Points                              │ │
│  │                                                                    │ │
│  │  1. Layout Mask Enhancement                                        │ │
│  │     - Mark display:none elements as "always hidden"                │ │
│  │     - Exclude from content extraction                              │ │
│  │                                                                    │ │
│  │  2. Ad Detection                                                   │ │
│  │     - Identify ad containers before extraction                     │ │
│  │     - Remove sponsored content from article body                   │ │
│  │                                                                    │ │
│  │  3. Paywall Detection                                              │ │
│  │     - Detect modal overlays (position:fixed, z-index > 1000)       │ │
│  │     - Queue for Puppeteer Teacher if paywall detected              │ │
│  │                                                                    │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Implementation Strategy

**Phase A: CSS Extraction** (2-3 hours)
1. Create `src/analysis/css/CSSExtractor.js`
2. Extract inline `<style>` and external `<link>` URLs
3. Fetch external CSS with retry logic

**Phase B: CSS Caching** (3-4 hours)
1. Add `css_cache` table (optional feature flag)
2. Hash-based deduplication (same CSS = same hash)
3. TTL-based expiration (default: 7 days)

**Phase C: CSS Analysis** (4-6 hours)
1. Parse CSS with `css-tree` (lightweight, fast)
2. Build selector index for quick lookup
3. Implement detection functions:
   - `isHidden(selector)`
   - `isAdContainer(selector)`
   - `isOverlay(selector)`

**Phase D: Integration** (2-3 hours)
1. Wire into SkeletonDiff mask generation
2. Add CSS signals to Boolean Decision Pipeline
3. Make entire feature toggleable via config

### Lab Experiment Proposal

**Experiment 040: CSS Signal Value Assessment**
```
Location: src/ui/lab/experiments/040-css-signal-value/
Purpose: Determine if CSS analysis provides actionable signals
Scope:
  - Fetch CSS from 20 major news sites
  - Parse and catalog:
    - Hidden element patterns
    - Ad container conventions
    - Layout class naming schemes
  - Cross-reference with content extraction accuracy
Success Criteria:
  - Identify ≥3 universal patterns (e.g., .ad-, display:none for non-content)
  - CSS cache reduces bandwidth by ≥80% on repeat visits
  - At least one extraction improvement from CSS signals
Optional Outcome:
  - If no universal patterns found, document why and recommend skip
```

---

## Improvement 11: Decision Visibility & Config-Driven Architecture

### Current State

**What Exists (More Than Expected)**:
- **Decision Tree Viewer** (Port 3030): Read-only visualization of decision trees
- **DecisionConfigSet** (431 lines): Full versioned config model with clone/diff/promote
- **Decision Sets**: `config/decision-sets/baseline-2025-12-08.json` (436 lines of production config)
- **Decision Trees**: `config/decision-trees/page-categories.json` (schema-validated tree structure)
- **PlannerHost**: GOFAI blackboard architecture with plugin system (3.5s time budgets)
- **4 Active Plugins**: GraphReasoner, QueryCostEstimator, GazetteerAwareReasoner, GazetteerReasoner
- **Observatory Controller**: Interactive crawl inspection with confirm/reject/batch operations

**What Doesn't Exist (Gaps)**:
- **Decision Studio**: The full WYSIWYG editor designed in `docs/designs/DECISION_TREE_STUDIO.md` is not implemented
- **Config-Driven ArticleSignals**: Currently hardcoded pattern arrays in `ArticleSignalsService.js`
- **Decision Audit Log**: No persistent log of which rules fired for which URLs
- **Real-Time Decision Visibility**: No UI to see live decisions during crawl
- **A/B Decision Testing**: `ExperimentManager` is in design phase only

### Architecture Overview: Config-Driven Decision Layer

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    CONFIG-DRIVEN DECISION ARCHITECTURE                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                         CONFIG SOURCES                                   │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │ │
│  │  │ decision-    │  │ decision-    │  │ priority-    │  │ article-   │  │ │
│  │  │ trees/*.json │  │ sets/*.json  │  │ config.json  │  │ signals.js │  │ │
│  │  │ (page cats)  │  │ (versioned)  │  │ (weights)    │  │ (MIGRATE!) │  │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                              │ Load + Validate                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                    DecisionConfigSetState                                │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐   │ │
│  │  │ Active Config Set (in memory)                                    │   │ │
│  │  │ - priorityConfig: { bonuses, weights, clustering }               │   │ │
│  │  │ - decisionTrees: { pageCategories, urlPatterns, hubDetection }   │   │ │
│  │  │ - classificationPatterns: { skip, article, hub }                 │   │ │
│  │  │ - features: { advancedPlanningSuite, gapDrivenPrioritization }   │   │ │
│  │  └─────────────────────────────────────────────────────────────────┘   │ │
│  │  Methods: loadActiveDecisionConfigSet(), setActiveDecisionConfigSlug() │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                              │                                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                       DECISION CONSUMERS                                 │ │
│  │  ┌────────────────────┐  ┌────────────────────┐  ┌──────────────────┐  │ │
│  │  │ ArticleProcessor   │  │ PriorityCalculator │  │ PlannerHost      │  │ │
│  │  │ .looksLikeArticle()│  │ .computePriority() │  │ .run() plugins   │  │ │
│  │  │ NOW: hardcoded     │  │ NOW: config-driven │  │ NOW: plugins     │  │ │
│  │  │ TODO: use config   │  │ ✅ Good            │  │ ✅ Good          │  │ │
│  │  └────────────────────┘  └────────────────────┘  └──────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                              │ Emit decision events                          │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                      DECISION AUDIT & VISIBILITY                        │ │
│  │  ┌──────────────────┐  ┌───────────────────┐  ┌─────────────────────┐  │ │
│  │  │ DecisionLogger   │  │ Decision Tree     │  │ Decision Studio     │  │ │
│  │  │ (audit entries)  │  │ Viewer (Port 3030)│  │ (Port 4700, TODO)   │  │ │
│  │  │ ✅ Exists        │  │ ✅ Read-only view │  │ ⏳ Design only      │  │ │
│  │  └──────────────────┘  └───────────────────┘  └─────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Hardcoded Parameters to Migrate

**1. ArticleSignalsService.js (Lines 12-35)**
```javascript
// CURRENT: Hardcoded in source
const skipPatterns = [
  '/search', '/login', '/register', '/subscribe', ...
];
const articlePatterns = [
  '/article', '/story', '/news', '/post', ...
];

// TARGET: Load from config
const patterns = configSet.getClassificationPatterns();
const skipPatterns = patterns.skip;
const articlePatterns = patterns.article;
```

**2. ContentValidationService.js (Lines 66-72)**
```javascript
// CURRENT: Hardcoded soft failure signatures
const SOFT_FAILURE_SIGNATURES = [
  /please\s+enable\s+javascript/i,
  ...
];

// TARGET: Load from config
const signatures = configSet.getSoftFailureSignatures();
```

**3. HubValidator.js (Line 98)**
```javascript
// CURRENT: Hardcoded timeout
const timeoutId = setTimeout(() => controller.abort(), 10000);

// TARGET: Load from config
const timeout = configSet.getValidationTimeout();
```

**4. NetworkRetryPolicy.js**
```javascript
// CURRENT: Constructor params with defaults
constructor({ maxRetries = 3, baseDelayMs = 1000, maxDelayMs = 30000 } = {})

// TARGET: Config-driven defaults
const retryConfig = configSet.getRetryPolicy();
```

### Decision Visibility Requirements

| Feature | Current State | Target State |
|---------|--------------|--------------|
| See which rules fired | Logs only | UI table per URL |
| See confidence breakdown | Not visible | Stacked bar chart |
| See decision path | Not tracked | Tree highlighting |
| Compare A/B variants | Not implemented | Side-by-side diff |
| Export decision history | Not implemented | CSV/JSON export |
| Real-time decisions | None | SSE feed to dashboard |

### GOFAI Integration Status

The PlannerHost (Advanced Planning Suite) provides good foundations:

```javascript
// PlannerHost blackboard already supports:
ctx.bb = {
  rationale: [],           // Explanation fragments ✅
  costEstimates: {},       // Query cost data ✅
  proposedHubs: [],        // Hub proposals ✅
  rulesEngine: { facts: [], firedRules: [] },  // 🔶 Not used yet
  htnState: { taskHierarchy: [], expandedTasks: [] }  // 🔶 Designed, not used
};

// Meta-planning layer exists:
// PlanValidator, PlanEvaluator, PlanArbitrator, DecisionLogger
// BUT: Not wired to UI for real-time visibility
```

**MicroProlog** (symbolic reasoning) is designed but isolated:
- Located at `src/planner/microprolog/` (future)
- Horn-clause logic for seed validation
- NOT in execution path—needs integration work

### Implementation Strategy

**Phase A: Config Migration for ArticleSignals** (4-6 hours)
1. Add `classificationPatterns` section to DecisionConfigSet:
   ```json
   {
     "classificationPatterns": {
       "skipPatterns": ["/search", "/login", ...],
       "articlePatterns": ["/article", "/story", ...],
       "datePatterns": ["/\\d{4}/\\d{2}/\\d{2}/"]
     }
   }
   ```
2. Modify ArticleSignalsService constructor to accept config
3. Add fallback to hardcoded values for backward compatibility
4. Add config hot-reload support (watch file or API trigger)

**Phase B: Decision Audit Table** (4-6 hours)
1. Create `decision_audit` table:
   ```sql
   CREATE TABLE decision_audit (
     id INTEGER PRIMARY KEY,
     url TEXT NOT NULL,
     decision_type TEXT,        -- 'article_classification', 'priority', 'hub_detection'
     decision_value TEXT,       -- 'article', 'not_article', 'hub', etc.
     confidence REAL,
     rules_fired TEXT,          -- JSON array of rule IDs
     config_slug TEXT,          -- Which config set was active
     duration_ms REAL,
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP
   );
   ```
2. Wire DecisionLogger to write entries
3. Add `/api/decisions` endpoint for querying

**Phase C: Decision Visibility Dashboard** (8-12 hours)
1. Create `DecisionAuditControl` jsgui3 control
2. Add to Data Explorer as new route `/decisions`
3. Features:
   - Filter by decision type, config slug, date range
   - Group by rule fired
   - Show confidence distribution
   - Link to URL detail view

**Phase D: Decision Studio (Port 4700)** (16-24 hours)
1. Implement design from `docs/designs/DECISION_TREE_STUDIO.md`
2. Key features:
   - WYSIWYG tree editor with drag-and-drop
   - Sample browser with page preview
   - Test evaluation with audit trail
   - Save/load/clone/promote workflows
3. Wire to DecisionConfigSetRepository

### Lab Experiment Proposals

**Experiment 041: Config-Driven ArticleSignals**
```
Location: src/ui/lab/experiments/041-config-driven-signals/
Purpose: Validate config-driven pattern matching without breaking production
Scope:
  - Create isolated test harness
  - Compare hardcoded vs config-loaded patterns
  - Measure latency overhead of config loading
  - Test hot-reload behavior
Success Criteria:
  - Zero behavior difference on 1000 test URLs
  - Config load overhead < 1ms per decision
  - Hot-reload works without restart
```

**Experiment 042: Decision Audit Performance**
```
Location: src/ui/lab/experiments/042-decision-audit-perf/
Purpose: Validate audit logging doesn't slow down crawl
Scope:
  - Benchmark insert performance (10K entries)
  - Test async logging with queue
  - Measure query performance for dashboard
Success Criteria:
  - Audit insert < 0.5ms per decision
  - Dashboard query < 100ms for 10K entries
  - No impact on crawl throughput
```

**Experiment 043: Decision Tree Editor Canvas**
```
Location: src/ui/lab/experiments/043-decision-tree-editor/
Purpose: Prototype interactive tree editing with jsgui3
Scope:
  - Drag-and-drop node creation
  - SVG connection lines
  - Property panel editing
  - JSON serialization
Success Criteria:
  - Smooth 60fps drag interaction
  - Valid JSON output for any tree shape
  - Undo/redo support
```

### GOFAI Plugin Activation Roadmap

Current plugins are designed but not all are active:

| Plugin | Status | To Activate |
|--------|--------|-------------|
| GraphReasonerPlugin | ✅ Active | — |
| QueryCostEstimatorPlugin | ✅ Active | — |
| GazetteerAwareReasonerPlugin | ✅ Active | — |
| GazetteerReasonerPlugin | ✅ Active | — |
| RuleEnginePlugin | ⏳ Planned | Implement forward-chaining |
| HTNPlugin | ⏳ Planned | Implement task decomposition |
| CSPPolitenessPlugin | ⏳ Planned | Wire to DomainThrottleManager |
| ExplanationPlugin | ⏳ Planned | Aggregate rationale for UI |
| MicroPrologPlugin | ⏳ Designed | Integrate from `src/planner/microprolog/` |

**Recommended Priority**:
1. **ExplanationPlugin** - Low effort, high visibility impact
2. **RuleEnginePlugin** - Enables config-driven heuristics
3. **MicroPrologPlugin** - Symbolic validation for complex rules
4. **CSPPolitenessPlugin** - Connect to existing throttle infrastructure

---

## Recommended Implementation Order

Based on existing infrastructure and dependencies:

```
Week 1: Foundation
├── Day 1-2: Experiment 037 (SkeletonHash integration)
├── Day 3-4: Experiment 031 (Confidence scoring)
└── Day 5: Experiment 034 (Robots.txt caching)

Week 2: Puppeteer Pipeline
├── Day 1-2: Experiment 039 (Puppeteer Pool memory validation)
├── Day 3-4: Experiment 030 (Puppeteer Teacher with persistent pool)
└── Day 5: Soft failure queue + Dashboard monitoring

Week 3: Boolean Decision & Learning
├── Day 1-2: Experiment 038 (Boolean Signal Profiler)
├── Day 3: Boolean Signal Registry implementation
├── Day 4-5: Experiment 033 (Rate learning)

Week 4: Optimization & Optional CSS
├── Day 1-2: Experiment 032 (Streaming sitemap)
├── Day 3-4: Experiment 036 (Adaptive concurrency)
├── Day 5: Experiment 040 (CSS signal assessment - if time permits)

Week 5: Decision Visibility & Config-Driven
├── Day 1-2: Experiment 041 (Config-driven ArticleSignals)
├── Day 3: Decision audit table + API endpoints
├── Day 4-5: Experiment 043 (Decision Tree Editor prototype)
└── (Ongoing): Decision Studio implementation (Port 4700)
```

---

## Risk Assessment

| Improvement | Technical Risk | Effort | Impact |
|-------------|---------------|--------|--------|
| SkeletonHash Integration | LOW (exists) | 4h | HIGH |
| Confidence Scoring | LOW | 6h | MEDIUM |
| Robots.txt Caching | LOW | 4h | MEDIUM |
| Puppeteer Teacher | MEDIUM | 16h | HIGH |
| Domain Rate Learning | MEDIUM | 10h | HIGH |
| Content Deduplication | MEDIUM | 12h | MEDIUM |
| Streaming Sitemaps | MEDIUM | 10h | MEDIUM |
| Adaptive Concurrency | HIGH | 12h | MEDIUM |
| **Boolean Decision Pipeline** | LOW (foundation exists) | 8h | HIGH |
| **Persistent Puppeteer Pool** | LOW (standard pattern) | 8h | HIGH |
| **CSS Analysis (Optional)** | MEDIUM | 12h | MEDIUM |
| **Decision Visibility** | LOW (DecisionConfigSet exists) | 24h total | **VERY HIGH** |
| **Config-Driven Signals** | LOW (patterns already defined) | 6h | HIGH |
| **Decision Studio UI** | MEDIUM (design exists) | 24h | HIGH |

**Recommended Priority**: 
1. SkeletonHash → Boolean Decisions → Config-Driven Signals → Puppeteer Pool
2. Decision Audit + Visibility Dashboard (unlocks iteration velocity)
3. Confidence → Rate Learning → Robots.txt
4. Decision Studio (enables non-developer tuning)
5. CSS Analysis (optional, after validation)

---

## Next Steps

1. **Update Roadmap**: Mark SkeletonHash/SkeletonDiff as complete in Phase 2
2. **Create Lab Experiments**: Start with 041 (Config-Driven Signals), 038 (Boolean Profiler)
3. **Migrate Hardcoded Patterns**: Add `classificationPatterns` to DecisionConfigSet
4. **Create decision_audit Table**: Wire DecisionLogger to persist decisions
5. **Create layout_masks Table**: Run the migration
6. **Wire ArticleProcessor**: Add SkeletonHash computation
7. **Add Decision Dashboard**: Route `/decisions` in Data Explorer
8. **Monitor**: Use Data Explorer to track decisions and signature clustering

---

## Recent Validation Results & Operational Learnings (January 2026)

### Multi-Site Crawl Validation

Recent testing across multiple news sites validated the crawler's hub/article classification and save pipeline:

| Site | Articles Fetched | Save Rate | Hub Recognition | Article Classification |
|------|------------------|-----------|-----------------|------------------------|
| The Guardian (Venezuela) | 100+ | 90%+ | 100% | 100% |
| BBC News | 50+ | 88% | 100% | 100% |
| Reuters | 75+ | 92% | 100% | 100% |

**Key Findings:**
- Place hubs are reliably detected across major news publishers (127 place_hubs in database)
- Hub/article URL pattern classification achieves near-perfect accuracy on tested domains
- Save rate bottlenecks are primarily duplicate detection (desired behavior) and content validation thresholds

### Place Hubs Visibility Improvement

A new **Place Hubs view** was added to the Data Explorer UI (January 2026):

- **Endpoint**: `http://localhost:4600/place-hubs`
- **Query Module**: `src/db/sqlite/v1/queries/ui/placeHubs.js`
- **Table Control**: `src/ui/controls/PlaceHubsTable.js`
- **Features**: 
  - Filter by host, place kind, topic
  - Pagination with configurable page size
  - Statistics panel showing total hubs, hosts, place kinds
  - Badge-colored place kind indicators (country=green, region=blue, city=purple)

### CLI Monitoring Enhancements

`tools/dev/crawl-live.js` enhanced with real-time throughput metrics:

```bash
# Enable throughput metrics during monitoring
node tools/dev/crawl-live.js --metrics

# Metrics displayed:
# - Pages/minute (throughput rate)
# - Bytes/second (download rate) 
# - Average page size (KB)
# - Average duration per page (ms)
# - ETA based on queue size and current rate
# - Stall detection (warns if no activity for 30s)
```

### SSE-Based UI Monitoring Patterns

The Data Explorer dashboard already implements robust SSE-based crawl monitoring:

- **Dashboard crawler status section** with live updates
- **Jobs panel** showing active crawls with SSE streaming
- **Events endpoint** at `/api/events` backed by crawler telemetry
- **Labs reference**: `labs/crawler-progress-integration/server.js` demonstrates observable wrapper pattern

### Operational Recommendations

Based on validation results:

1. **Place Hub Coverage**: Focus crawls on domains with known place hub patterns (theguardian.com, bbc.com) for geography-based news aggregation
2. **Throttle Tuning**: Guardian and BBC handle 60+ RPM without 429s; persist learned rates via Improvement #4
3. **Save Rate Optimization**: 90%+ save rate achieved with current duplicate detection; further improvement requires Improvement #6 (content-level deduplication)
4. **Monitoring Workflow**: Use `crawl-live.js --metrics` for CLI monitoring, Data Explorer dashboard for web-based visibility

---

## Appendix: Key File Locations

| Purpose | Path |
|---------|------|
| SkeletonHash | `src/analysis/structure/SkeletonHash.js` |
| SkeletonDiff | `src/analysis/structure/SkeletonDiff.js` |
| ContentValidationService | `src/crawler/services/ContentValidationService.js` |
| DomainThrottleManager | `src/crawler/DomainThrottleManager.js` |
| RobotsAndSitemapCoordinator | `src/crawler/RobotsAndSitemapCoordinator.js` |
| CrawlPlaybookService | `src/crawler/CrawlPlaybookService.js` |
| ArticleProcessor | `src/crawler/ArticleProcessor.js` |
| ArticleSignalsService | `src/crawler/ArticleSignalsService.js` |
| Decision Trees Config | `config/decision-trees/page-categories.json` |
| Decision Sets | `config/decision-sets/*.json` |
| DecisionConfigSet Model | `src/crawler/observatory/DecisionConfigSet.js` |
| DecisionConfigSetState | `src/crawler/observatory/DecisionConfigSetState.js` |
| DecisionConfigSetRepository | `src/crawler/observatory/DecisionConfigSetRepository.js` |
| Decision Tree Viewer | `src/ui/server/decisionTreeViewer/server.js` (Port 3030) |
| Decision Tree Studio Design | `docs/designs/DECISION_TREE_STUDIO.md` |
| PlannerHost (GOFAI) | `src/planner/PlannerHost.js` |
| Planner Plugins | `src/planner/plugins/*.js` |
| Advanced Planning Docs | `docs/ADVANCED_PLANNING_SUITE.md` |
| sitemap.js | `src/crawler/sitemap.js` |
| layoutMasks queries | `src/db/sqlite/v1/queries/layoutMasks.js` |
| Lab experiments | `src/ui/lab/experiments/` |
| **Place Hubs Queries (NEW)** | `src/db/sqlite/v1/queries/ui/placeHubs.js` |
| **Place Hubs Table Control (NEW)** | `src/ui/controls/PlaceHubsTable.js` |
| **Crawl Live CLI (metrics)** | `tools/dev/crawl-live.js` |
| **Proposed: BooleanSignalRegistry** | `src/crawler/signals/BooleanSignalRegistry.js` |
| **Proposed: PuppeteerPoolManager** | `src/teacher/PuppeteerPoolManager.js` |
| **Proposed: CSSAnalyzer** | `src/analysis/css/CSSAnalyzer.js` |
| **Proposed: DecisionAuditControl** | `src/ui/controls/DecisionAuditControl.js` |
| **Proposed: Decision Studio** | `src/ui/server/decisionTreeStudio/` (Port 4700) |
