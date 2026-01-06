# Chapter 2: Data Flow

> **Implementation Status**: ✅ All phases implemented. See [Chapter 16](16-implementation-guide.md) for file locations.

## Codebase Quick Reference

| Phase | Key Files | Status |
|-------|-----------|--------|
| Discovery | `src/crawler/core/Crawler.js`, `src/crawler/planner/` | ✅ Complete |
| Download | `src/crawler/NewsCrawler.js`, `src/utils/compression.js` | ✅ Complete |
| Extraction | `src/utils/HtmlArticleExtractor.js`, `src/utils/ArticleXPathAnalyzer.js` | ✅ Complete |
| Analysis | `src/modules/analyse-pages-core.js`, `labs/analysis-observable/` | ✅ Complete |
| Disambiguation | `src/analysis/place-extraction.js`, `src/ui/server/placeHubGuessing/` | 🔄 Partial |
| Export | `src/export/` | ✅ Complete |

## The Complete Pipeline

Data flows through the system in distinct phases, each with clear inputs and outputs.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         PHASE 1: DISCOVERY                                │
│                                                                          │
│   Seed URL ──▶ Queue ──▶ Fetch ──▶ Parse Links ──▶ Filter ──▶ Queue     │
│                  │                                              │        │
│                  └──────────────────────────────────────────────┘        │
│                                    ▼                                      │
│                           Priority Planner                                │
│                     (scores URLs, manages depth)                          │
└──────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         PHASE 2: DOWNLOAD                                 │
│                                                                          │
│   Prioritized URL ──▶ Fetch HTML ──▶ Compress ──▶ Store                  │
│                                          │                                │
│                                          ▼                                │
│                              content_cache table                          │
│                          (zstd compressed HTML)                           │
└──────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         PHASE 3: EXTRACTION                               │
│                                                                          │
│   Compressed HTML ──▶ Decompress ──▶ XPath/Readability ──▶ Clean Text    │
│                                              │                            │
│                                              ▼                            │
│                                     articles table                        │
│                               (title, body, metadata)                     │
└──────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         PHASE 4: ANALYSIS                                 │
│                                                                          │
│   Article Text ──▶ Fact Extraction ──▶ Classification ──▶ Store          │
│        │                  │                   │              │            │
│        │                  ▼                   ▼              ▼            │
│        │           article_facts      content_analysis    updates         │
│        │                                                                  │
│        └──────────▶ Place Detection ──▶ place_mentions table             │
└──────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                       PHASE 5: DISAMBIGUATION                             │
│                                                                          │
│   Place Mentions ──▶ Candidate Lookup ──▶ Score & Rank ──▶ Resolve       │
│                              │                   │              │         │
│                              ▼                   ▼              ▼         │
│                         gazetteer          aliases      resolved_places   │
│                         (places)       (multilang)     (final answer)     │
└──────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         PHASE 6: EXPORT                                   │
│                                                                          │
│   Enriched Data ──▶ Format ──▶ Filter ──▶ Output                         │
│                                              │                            │
│                              ┌───────────────┴───────────────┐           │
│                              ▼               ▼               ▼           │
│                            JSON            CSV            API            │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Phase Details

### Phase 1: Discovery

**Purpose:** Find URLs worth downloading

**Components:**
- `src/crawler/core/Crawler.js` — Core crawl loop
- `src/crawler/planner/` — Priority planning
- `src/crawler/queue/` — URL queue management

**Key Tables:**
- None directly (queue is in-memory during crawl)

**Events Emitted:**
- `QUEUE` — URL enqueued/dequeued/dropped
- `PROGRESS` — Crawl progress updates

### Phase 2: Download

**Purpose:** Fetch and store HTML content

**Components:**
- `src/crawler/NewsCrawler.js` — Orchestrates downloads
- `src/utils/compression.js` — Zstd compression
- `src/db/adapters/` — Database writes

**Key Tables:**
- `content_cache` — Compressed HTML storage
- `articles` — Article metadata

**Events Emitted:**
- `PAGE` — Page downloaded
- `TELEMETRY` — Performance metrics

### Phase 3: Extraction

**Purpose:** Extract readable content from HTML

**Components:**
- `src/utils/HtmlArticleExtractor.js` — Article extraction
- `src/utils/ArticleXPathAnalyzer.js` — XPath-based extraction
- `@mozilla/readability` — Fallback extraction

**Key Decision:** XPath vs Readability
```
IF cached XPath pattern exists for domain:
  → Use XPath extraction (fast: 50-200ms)
ELSE:
  → Use JSDOM + Readability (slow: 10-30s for large pages)
```

### Phase 4: Analysis

**Purpose:** Extract structured facts and classifications

**Components:**
- `src/modules/analyse-pages-core.js` — Core analysis
- `labs/analysis-observable/` — Observable wrapper
- `src/facts/` — Fact extraction rules

**Key Tables:**
- `content_analysis` — Analysis results with version tracking
- `article_facts` — Extracted boolean facts
- `place_mentions` — Detected place references

**Version Tracking:**
```sql
-- Each analysis run increments the version
SELECT MAX(analysis_version) + 1 AS next_version FROM content_analysis;

-- Query pages needing analysis
SELECT * FROM content_analysis WHERE analysis_version < ?;
```

### Phase 5: Disambiguation

**Purpose:** Resolve place mentions to specific geographic entities

**Components:**
- See `docs/sessions/2026-01-04-gazetteer-progress-ui/book/`

**Key Tables:**
- `gazetteer` — Place definitions
- `aliases` — Multi-language place names
- `resolved_places` — Final disambiguation results

### Phase 6: Export

**Purpose:** Deliver enriched data to downstream systems

**Components:**
- `src/export/` — Export pipelines
- `tools/export-*.js` — CLI export tools

**Output Formats:**
- JSON (full fidelity)
- CSV (tabular)
- API (real-time)

---

## Data Volumes (Typical)

| Stage | Records | Storage |
|-------|---------|---------|
| URLs discovered | ~500k | Queue (memory) |
| Pages downloaded | ~50k | ~2GB compressed |
| Articles extracted | ~48k | ~500MB text |
| Analysis results | ~48k | ~100MB |
| Place mentions | ~200k | ~50MB |
| Resolved places | ~150k | ~30MB |

---

## Timing Expectations

| Operation | Time | Notes |
|-----------|------|-------|
| Crawl 100 pages | 2-5 min | Depends on site response |
| Analyze 100 pages | 2-10 min | XPath fast, JSDOM slow |
| Full 48k analysis | 4-12 hours | With bottlenecks |
| Disambiguation 200k | ~30 min | Database-bound |

---

## Error Propagation

Errors at each phase have different impacts:

| Phase | Error Type | Impact | Recovery |
|-------|------------|--------|----------|
| Discovery | Network timeout | Skip URL | Retry queue |
| Download | HTTP 404/500 | No content | Mark failed |
| Extraction | Parse failure | No article | Log, skip |
| Analysis | Exception | No facts | Retry later |
| Disambiguation | No match | Unresolved | Human review |

---

## Next Chapter

[Chapter 3: Database Schema →](03-database-schema.md)
