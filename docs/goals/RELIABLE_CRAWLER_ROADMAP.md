# Roadmap: Reliable News Crawler

> **Vision**: A tenacious, domain-aware crawler that learns site layouts to extract high-quality news data from the long tail of the web.

## Phase 1: Foundation & Reliability (The "Tenacious" Crawler)
*Focus: Ensure the crawler never gives up and recovers from failures.*
*Spec: [RELIABLE_CRAWLER_PHASE_1_SPEC.md](../designs/RELIABLE_CRAWLER_PHASE_1_SPEC.md)*

- [x] **Internal Resilience**: The crawler process monitors its own health (heartbeat), handles network drops by pausing, and implements domain-level circuit breakers for 429/403 errors. ✅ `ResilienceService` (16 tests)
- [x] **Archive Discovery**: Explicit logic to find and traverse `/archive`, `/sitemap`, and calendar-based navigation when the "fresh" news runs dry. ✅ `ArchiveDiscoveryStrategy` (25 tests)
- [x] **Pagination Predictor**: Heuristic to detect and speculatively crawl pagination (`?page=N`, `/page/N`). ✅ `PaginationPredictorService` (33 tests)
- [x] **Strict Validation**: A pipeline step that rejects "empty" or "garbage" articles (e.g., "Please enable JS to view this site") before they hit the DB. ✅ `ContentValidationService` (16 tests)

## Phase 2: The Hybrid Architecture (The "Smart" Crawler)
*Focus: Integrate headless browsing for layout learning and static analysis.*

- [ ] **Puppeteer Integration**: Add optional dependency and `src/teacher/` module.
- [ ] **Visual Analyzer**: Script to render a page and identify the "largest text block" and "metadata block" visually.
- [ ] **Skeleton Hash**: Implement the `SkeletonHash` algorithm (Level 1 & Level 2) in the fast crawler.
- [ ] **Structure Miner**: Create a tool to process batches of pages (e.g., 1000), cluster them by L2 signature, and identify common vs. varying substructures.
- [ ] **Signature Storage**: Implement the `layout_signatures` and `layout_templates` tables.

## Phase 3: Feedback & Quality (The "Self-Correcting" Crawler)
*Focus: continuous improvement of extraction quality.*

- [ ] **Visual Diff Tool**: A UI tool to compare "Readability Extraction" vs "Visual Extraction" side-by-side.
- [ ] **Confidence Scoring**: Tag every article with a confidence score. Low confidence -> Re-queue for Teacher analysis.
- [ ] **Golden Set Testing**: Allow users to define "Golden" extractions for key sites to prevent regression.

## Phase 4: Scale & Distribution (The "Industrial" Crawler)
*Focus: Running at scale.*

- [ ] **Proxy Rotation**: Integration with proxy providers for hard-to-crawl sites.
- [ ] **Distributed Queues**: (Optional) Moving beyond SQLite for multi-machine crawling (Redis/Postgres).
