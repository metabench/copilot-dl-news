# DB Access Patterns Lab - Findings

## Date: 2026-01-04

## Candidate Generation Pattern

### The Generate-Many-Filter-Fast Approach

The place extraction system uses a **generate candidates → score → select best** pattern:

| Phase | Count | Time | Notes |
|-------|-------|------|-------|
| Raw matches | ~645/URL | <1ms | All possible slug matches |
| Chain building | ~50 chains | ~3ms | Group by path segments |
| Best chain | 1 | <0.1ms | Select highest-scoring chain |
| **Final result** | ~1 place/URL | ~4ms total | Disambiguated result |

**Key Insight**: The raw candidate count (645) is intentional - it represents all gazetteer entries that could match URL segments. The disambiguation algorithm (`buildChains` → `chooseBestChain`) rapidly filters to ~1 result.

### Benchmarking Recommendations

Before implementing new candidate generation strategies:
1. **Benchmark candidate generation** separately from filtering
2. **Measure memory pressure** at peak candidate count
3. **Profile the filtering phase** - this is where smart algorithms pay off
4. **Test with edge cases** - URLs with many ambiguous segments

### Related: Place Hub Guessing

Historical context: Place hub guessing (`src/ui/server/placeHubGuessing/`) has had accuracy issues. The `analyze-hub-quality.js` script can assess hub discovery quality. The candidate generation pattern here is similar - generating candidates broadly, then filtering.

---

## LIKE Query Optimization

### Question: Can LIKE prefix queries be sped up or avoided?

**Answer: No - SQLite LIKE queries cannot use B-tree indexes.**

### Evidence

Using `EXPLAIN QUERY PLAN`, we confirmed:

```sql
-- LIKE with prefix CANNOT use index (full table scan)
SELECT * FROM place_names WHERE name LIKE 'London%'
-- → SCAN place_names

-- LIKE with wildcard - also full scan
SELECT * FROM place_names WHERE normalized LIKE '%london%'
-- → SCAN place_names

-- Only exact match uses the index
SELECT * FROM place_names WHERE normalized = 'london'
-- → SEARCH place_names USING INDEX idx_place_names_norm
```

### Recommendations

1. **Use normalized exact match** instead of LIKE when possible
2. **Load gazetteer into memory** for O(1) slug/name lookups
3. **Pre-normalize names** in the database for exact matching

### Affected Code

- `src/db/sqlite/v1/queries/gazetteer.search.js` (line 43): Uses `pn.name LIKE ?`
  - This is for user-facing search, so LIKE may be intentional
  - Consider using normalized column with exact match for known names

---

## Article Text Extraction Gap

### Current State

The `content_analysis.body_text` column is NULL for all 46,853 records:

```sql
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN body_text IS NULL THEN 1 ELSE 0 END) as null_body_text
FROM content_analysis;
-- total: 46853, null_body_text: 46853
```

### What Exists

| Component | Purpose | Location |
|-----------|---------|----------|
| `TemplateExtractor` | Site-specific HTML→text | `src/extraction/TemplateExtractor.js` |
| `HtmlArticleExtractor` | Generic article extraction | `src/utils/HtmlArticleExtractor.js` |
| `searchAdapter.updateArticleText()` | Populate body_text | `src/db/sqlite/v1/queries/searchAdapter.js` |
| `searchAdapter.getArticlesNeedingBackfill()` | Find NULL body_text | `src/db/sqlite/v1/queries/searchAdapter.js` |
| Content compression | Store/retrieve HTML | `content_storage.content_blob` (type 11) |

### Content Access Layer Proposal

The current path to get article text is complex:
```
URL → http_responses → content_storage → decompress → parse HTML → extract text
```

A higher-level content access layer could provide:

```javascript
// Proposed: ContentAccessService
class ContentAccessService {
  // Get extracted text with caching to body_text
  async getArticleText(urlId, options = {}) {
    // 1. Check if body_text already extracted
    // 2. If not, decompress content_blob
    // 3. Parse HTML and extract text
    // 4. Optionally cache to body_text column
    // 5. Return text
  }
  
  // Batch extraction for analysis pipelines
  async batchExtractText(urlIds, options = {}) {
    // Efficient batch decompression and extraction
  }
  
  // Get structured content (title, body, metadata)
  async getStructuredContent(urlId) {
    // Returns { title, bodyText, byline, authors, publishDate }
  }
}
```

### Immediate Recommendations

1. **Run the backfill** - there's already `searchAdapter.getArticlesNeedingBackfill()`
2. **Benchmark decompression** - measure content_blob → HTML overhead
3. **Add a content facade** - single entry point for getting article text
4. **Cache extracted text** - populate body_text as articles are accessed

---

## Place Detection Benchmarks

### Fixture

- **2000 URLs** with stored content selected from database
- **64.6% have place slugs** in URL path
- Deterministic fixture saved to `fixtures/urls-with-content-2000.json`

### URL-Only Detection Benchmark

| Metric | Value |
|--------|-------|
| Matcher build time | 260-290ms |
| Places loaded | 7,749 |
| Slugs indexed | 19,174 |
| URL parsing | 500K-640K ops/sec |
| Slug lookup (Map) | 9-12M ops/sec |
| Full URL extraction | 75-260 URLs/sec |
| Detection rate | 72% of URLs |
| Time for 2000 URLs | ~8-25s |

**Key Insights:**
- In-memory Map lookup is extremely fast (~10M ops/sec)
- URL extraction bottleneck is the `buildChains()` and `chooseBestChain()` logic
- DB access is NOT the bottleneck - everything is in memory

### Content-Based Detection Benchmark

| Metric | URL-Only | Title-Only | Body-Only | Full Pipeline |
|--------|----------|------------|-----------|---------------|
| Throughput | 260/sec | 30K/sec | 1.5K/sec | 250/sec |
| Places/article | 0.95 | 0.98 | 149.94* | 151.88 |
| Detection rate | 95.5% | 79% | 100%* | 100% |

*Using synthetic body text seeded with place names every ~50 words

**Key Insights:**
1. **Title detection is extremely fast** at 30K ops/sec
2. **URL chain analysis is the bottleneck** at 250-260/sec
3. **Text processing** runs at 12M chars/sec - very efficient
4. **Body analysis adds ~4% overhead** to the URL-only baseline

---

## Additional Experiments (1/2/3/4)

### Experiment 1 — Candidate vs Filter (Phase Timing)

From `results/candidate-vs-filter-2026-01-04.json` (n=2000 URLs):

- `build_chains` dominates: **12.405ms/url** (~**99.04%** of measured time)
- `segment_analysis`: 0.113ms/url (~0.91%)
- `choose_best`: 0.002ms/url (~0.016%)
- Average candidates/url: **~918**; average chains/url: **~33.3**
- URLs with a best chain: **1439 / 2000 (72.0%)**

Implication: if we want URL-only place detection faster, the target is almost entirely `buildChains()`.

### Experiment 2 — Content Decompression Pipeline (DB → Decompress → JSDOM → Readability)

From `results/content-decompression-2026-01-04.json`:

- With `--limit 200 --max-html-bytes 250000`, only **1/200** records were processed (199 skipped due to size).
- On the processed record, total pipeline avg was **8.764ms/article**, with almost all time in:
  - `html_parse`: 4.494ms
  - `text_extract`: 4.082ms
  - `db_fetch` + `decompress`: ~0.043ms combined

Implication: once you’re parsing HTML + running Readability, DB fetch and decompression are effectively free by comparison; the hard part is robust, fast HTML→text extraction on large real-world pages.

### Experiment 3 — Body Text Backfill Feasibility (Dry-Run)

From `results/body-text-backfill-2026-01-04.json` (dryRun=true, n=5):

- Extraction-only: **avg 10,365ms/article** (~0.096 articles/sec)

Rule-of-thumb: at ~0.096 articles/sec, backfilling ~46.8k rows would take on the order of **~5–6 CPU-days** (single process), before considering DB write overhead.

Implication: full backfill is likely a long-running batch job unless we (a) optimize extraction heavily, (b) parallelize, and/or (c) switch to incremental caching on read.

### Experiment 4 — Title Boost Quality (URL-only vs Title-only vs Union)

From `results/title-boost-quality-2026-01-04.json` (n=2000 URLs):

- URL-only detection: **72.0%** (1439/2000) at **~13.97ms/url**
- Title-only detection: **27.3%** (546/2000) at **~0.010ms/url**
- Combined detection: **73.0%** (1460/2000) at **~13.98ms/url**
- Net boost from adding title: **+1.0 percentage point** for **~0.1%** extra time

Implication: title-based extraction is extremely cheap, but (on this dataset) doesn’t materially improve *detection rate* beyond URL-only.

---

## Benchmark Files

### Created Tools
- `check-indexes.js` - Analyze SQLite indexes and query plans
- `explore-schema.js` - Schema exploration utility
- `generate-url-fixture.js` - Generate deterministic URL fixture
- `debug-content-join.js` - Debug content table joins

### Benchmarks
- `benchmarks/url-place-detection.bench.js` - URL-only analysis
- `benchmarks/content-place-detection.bench.js` - Full content analysis

### Results
- `results/url-place-detection-2026-01-04.json`
- `results/content-place-detection-2026-01-04.json`

---

## Recommendations Summary

### High Priority
1. **Benchmark candidate generation vs filtering separately** - understand where time is spent
2. **Run body_text backfill** - uses existing infrastructure
3. **Create ContentAccessService** - facade over the complex content retrieval path

### Medium Priority
1. **Replace LIKE with normalized exact match** in gazetteer search when appropriate
2. **Optimize chain building** in `place-extraction.js` - the real bottleneck
3. **Benchmark content decompression** - measure overhead

### Low Priority (Future)
1. **Populate body_text column** during crawl
2. **Build inverted index** for place name → URL lookups
3. **Consider FTS5** for place name search (already set up for articles)
