# Roadmap: Reliable News Crawler

> **Vision**: A tenacious, domain-aware crawler that learns site layouts to extract high-quality news data from the long tail of the web.

## How to use this roadmap in this repo

- Treat this as the **long-term direction**. For day-to-day operation and architecture, start with:
	- [Architecture: Crawls vs Background Tasks](../ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md)
	- [Crawl CLI Quick Reference](../cli/crawl.md)
- For any non-trivial crawler work, create a session under `docs/sessions/` and capture:
	- the objective and done-when criteria (PLAN)
	- commands, checks, and test runs (WORKING_NOTES)
	- outcomes + follow-ups (SESSION_SUMMARY / FOLLOW_UPS)
	See [Session Documentation Hub](../sessions/SESSIONS_HUB.md).
- When a roadmap item requires a design choice, write an ADR-lite in `docs/decisions/` and link it here.

## Phase 1: Foundation & Reliability (The "Tenacious" Crawler)
*Focus: Ensure the crawler never gives up and recovers from failures.*
*Spec: [RELIABLE_CRAWLER_PHASE_1_SPEC.md](../designs/RELIABLE_CRAWLER_PHASE_1_SPEC.md)*

- [x] **Internal Resilience**: The crawler process monitors its own health (heartbeat), handles network drops by pausing, and implements domain-level circuit breakers for 429/403 errors. ✅ `ResilienceService` (16 tests)
- [x] **Archive Discovery**: Explicit logic to find and traverse `/archive`, `/sitemap`, and calendar-based navigation when the "fresh" news runs dry. ✅ `ArchiveDiscoveryStrategy` (25 tests)
- [x] **Pagination Predictor**: Heuristic to detect and speculatively crawl pagination (`?page=N`, `/page/N`). ✅ `PaginationPredictorService` (33 tests)
- [x] **Strict Validation**: A pipeline step that rejects "empty" or "garbage" articles (e.g., "Please enable JS to view this site") before they hit the DB. ✅ `ContentValidationService` (16 tests)

## Phase 2: The Hybrid Architecture (The "Smart" Crawler)
*Focus: Integrate headless browsing for layout learning and static analysis.*

- [x] **Puppeteer Integration**: Add optional dependency and `src/teacher/` module. ✅ `TeacherService` with page pooling & resource blocking
- [x] **Visual Analyzer**: Script to render a page and identify the "largest text block" and "metadata block" visually. ✅ `VisualAnalyzer` with content detection
- [x] **Skeleton Hash**: Implement the `SkeletonHash` algorithm (Level 1 & Level 2) in the fast crawler. ✅ `SkeletonHasher` with L1/L2 hashing
- [ ] **Structure Miner**: Create a tool to process batches of pages (e.g., 1000), cluster them by L2 signature, and identify common vs. varying substructures.
- [ ] **Signature Storage**: Implement the `layout_signatures` and `layout_templates` tables.

## Phase 3: Feedback & Quality (The "Self-Correcting" Crawler)
*Focus: continuous improvement of extraction quality.*

- [ ] **Visual Diff Tool**: A UI tool to compare "Readability Extraction" vs "Visual Extraction" side-by-side.
- [ ] **Confidence Scoring**: Tag every article with a confidence score. Low confidence -> Re-queue for Teacher analysis.
- [ ] **Golden Set Testing**: Allow users to define "Golden" extractions for key sites to prevent regression.

## Phase 4: Scale & Distribution (The "Industrial" Crawler)
*Focus: Running at scale.*

- [x] **Proxy Rotation**: Integration with proxy providers for hard-to-crawl sites. ✅ `ProxyManager` (41 tests)
- [x] **Distributed Queues**: Postgres-backed queue with `FOR UPDATE SKIP LOCKED` for atomic dequeue. ✅ `PostgresUrlQueueAdapter` (48 tests)

## Phase 5: Layout Intelligence & Quality Feedback
*Focus: Learning site structures and measuring extraction quality.*

- [x] **Structure Miner**: Batch analysis tool to cluster pages by L2 signature and identify templates. ✅ `StructureMiner` (23 tests)
- [x] **Signature Storage**: `layout_signatures` and `layout_templates` tables with full adapter. ✅ `layoutAdapter` (46 tests)
- [x] **Visual Diff Tool**: Side-by-side comparison of Readability vs Template extraction. ✅ Dashboard at port 3021
- [x] **Confidence Scoring**: Tag articles with confidence scores, re-queue low confidence for analysis. ✅ `ContentConfidenceScorer` (22 checks)
- [x] **Golden Set Testing**: Fixture-based extraction regression testing with real HTML. ✅ 21 fixtures, `golden-set.test.js`

## Phase 6: Scale, Distribution & Production Polish
*Focus: Multi-worker coordination and production readiness.*

- [x] **Distributed Queue Backend**: `IUrlQueue` interface with SQLite and Postgres adapters. ✅ 48 tests
- [x] **Multi-Worker Coordinator**: `WorkerRegistry`, `DomainLockManager`, `WorkDistributor`. ✅ 59 tests
- [x] **Production Monitoring Dashboard**: Real-time metrics at port 3099. ✅ 9 checks
- [x] **Golden Set Real HTML**: Enhanced fixture tools with `--live` capture. ✅ `populate-fixtures.js`
- [x] **Rate Limit Intelligence**: Exponential backoff with success streak detection. ✅ `RateLimitTracker` (39 tests)
- [x] **Extraction Benchmarking**: Multi-extractor comparison tool. ✅ Cheerio 76.2%, Readability 23.8%

## Phase 7: Production Hardening & Intelligent Orchestration
*Focus: Self-improving crawl orchestration, quality dashboards, and deployment readiness.*
*Spec: [RELIABLE_CRAWLER_PHASE_7_SPEC.md](../designs/RELIABLE_CRAWLER_PHASE_7_SPEC.md)*

- [x] **Crawl Performance Profiler**: High-resolution timing per crawl phase with bottleneck detection. ✅ `CrawlProfiler` (56 tests)
- [x] **Self-Healing Error Recovery**: Diagnose 9 failure types, auto-remediate (proxy rotation, rate limit backoff, Puppeteer upgrade). ✅ `SelfHealingService` (61 tests)
- [x] **Intelligent Crawl Scheduler**: Priority-based scheduling with update pattern learning. ✅ `CrawlScheduler` (56 tests)
- [x] **Extraction Quality Dashboard**: Unified dashboard at port 3100 with confidence histogram, domain table, regression alerts. ✅ 29 checks
- [x] **Domain Learning Pipeline**: Auto-approve templates >90% accuracy, human review queue for rest. ✅ `DomainLearningPipeline` (61 tests)
- [x] **Production Config & Deployment**: Docker compose with 3 crawler replicas, Postgres, health checks, graceful shutdown. ✅ `deploy/`

## Phase 8: Analytics, Intelligence & API
*Focus: Transform crawl data into insights, expose APIs, enable intelligent curation.*
*Spec: [RELIABLE_CRAWLER_PHASE_8_SPEC.md](../designs/RELIABLE_CRAWLER_PHASE_8_SPEC.md)*

- [ ] **Search & Full-Text Index**: FTS5-based search with facets, highlighting, and advanced query syntax.
- [ ] **REST API Gateway**: Versioned REST API at port 4000 with auth, rate limiting, and OpenAPI spec.
- [ ] **Content Similarity Engine**: MinHash/SimHash for duplicate detection and cross-domain tracking.
- [ ] **Content Tagging & Categorization**: Automatic topic, entity, keyword, and sentiment tagging.
- [ ] **Historical Analytics Dashboard**: Trends, leaderboards, heatmaps, and growth metrics at port 3101.
- [ ] **Real-Time Event Stream**: WebSocket/SSE for live crawl events with subscription filtering.
- [ ] **Article Recommendation Engine**: Content-based, tag-based, and trending recommendations.
- [ ] **Data Export & Syndication**: JSON/CSV/RSS/Atom exports with scheduled S3 uploads.
