# Working Notes – Analysis Backfill Observable with Electron UI

- 2026-01-04 — Session created via CLI. Add incremental notes here.

## 2026-01-04: JSDOM Performance Bottleneck Identified

### Root Cause Analysis

The analysis process was appearing to "stall" after processing 1 record. Investigation revealed the process wasn't stuck - it was extremely slow.

**Benchmark Results (3 pages, version 1022):**
```
Average per page: 23.8 seconds
  - jsdomMs:          23,417ms (98.2%)
  - readabilityAlgoMs:   190ms
  - buildAnalysisMs:     132ms
  - html.totalMs:          5ms
  - db.updateAnalysisMs:   6ms
```

### Bottleneck Path

```
prepareArticleContent()
  └── If no XPath pattern exists for domain
      └── Falls back to Readability extraction
          └── createJsdom(html, { url })  ← 23+ seconds per page
          └── new Readability(document).parse()
```

### Why JSDOM is Slow

JSDOM creates a full browser-like DOM environment in Node.js. For large HTML documents (news articles can be 500KB+), this involves:
1. Full HTML parsing into a complete DOM tree
2. CSS cascade computation
3. JavaScript context creation
4. Memory allocation for thousands of nodes

### Mitigation Strategies

1. **XPath Caching** (Current approach, but needs improvement)
   - If a domain already has a learned XPath, use it directly
   - Skip JSDOM entirely for subsequent pages from same domain

2. **HTML Size Limits**
   - Truncate HTML before JSDOM parsing (e.g., first 200KB)
   - Most article content is in the first portion of the page

3. **Cheerio-Only Path**
   - Use Cheerio (fast) for structure analysis
   - Only invoke JSDOM when absolutely necessary

4. **Parallel Processing**
   - Run multiple analyses in parallel
   - But watch for memory pressure

### Observable UI Improvements Needed

1. **Show per-page timing** in progress display
2. **Stall detection** - warn if no progress for 30+ seconds
3. **ETA based on actual timing** rather than record count
4. **Bottleneck indicators** - show which phase is slow

### Next Steps

- [x] Add timing breakdown to SSE events
- [x] Implement stall detection in observable
- [ ] Consider HTML truncation before JSDOM (less critical now)
- [x] Profile XPath coverage to understand fallback rate

---

## 2026-01-04: ROOT CAUSE FIX - XPath to CSS Selector Bug

### The Bug

The `_xpathToCssSelector` function in `ArticleXPathService.js` only handled:
1. XPaths starting with `/html/body/`
2. Two hardcoded paths: `/body/main/article` and `/html/body/main/article`

It returned `null` for the common `//*[@id="maincontent"]` syntax, causing every extraction to fail and fall back to JSDOM.

### The Fix

Added regex handling for common XPath patterns in [ArticleXPathService.js](src/services/ArticleXPathService.js):
- `//*[@id="..."]` → `#id`
- `//tagname[@id="..."]` → `tagname#id`
- `//*[@class="..."]` → `.class`
- `//*[@data-*="..."]` → `[data-*="..."]`

### Performance Results

| Metric | Before Fix | After Fix | Improvement |
|--------|------------|-----------|-------------|
| Avg per page | 23,800 ms | 78 ms | **305x faster** |
| xpathExtractionMs | 0 (failed) | 35 ms | Now works! |
| jsdomMs | 23,417 ms | 0 ms | Skipped entirely |
| recordsPerSecond | 0.04 | 13+ | **325x faster** |

### Benchmark Results (20 pages)

```
Average per page: 78 ms
  - xpathExtractionMs: 35ms
  - buildAnalysisMs:   42ms
  - html.totalMs:       9ms
  - readabilityMs:      0ms (JSDOM not needed!)
```

### Key Insight

The cached XPath `//*[@id="maincontent"]` was correct and worked in the HTML. The bug was purely in the conversion layer. This is why:
1. XPath lookup succeeded (pattern existed)
2. CSS conversion failed (returned null)
3. Cheerio extraction returned null
4. Fell back to slow JSDOM path

### Lessons Learned

1. **Test the full extraction path, not just lookup** - The pattern existed but couldn't be used
2. **Check intermediate conversion steps** - The XPath→CSS conversion was the bottleneck
3. **Profile before optimizing** - Would have found this faster with timing breakdown
4. **ID selectors are common** - Support them in any XPath→CSS converter
