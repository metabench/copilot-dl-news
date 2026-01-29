# Architecture Diagram Content Map (High Density)

## 1. INGESTION & STORAGE (Stage 1)

### 1.1 `news-crawler-core` (The Orchestrator)
- **Role**: Coordination, Scheduling, Lifecycle Management.
- **Key Classes**:
    - `NewsCrawler`: Main entry point. Manages the event loop.
        - `.crawl(url, options)`: Starts a crawl job.
        - `.pause()`, `.resume()`, `.stop()`: Lifecycle controls.
    - `IntelligentPlanningFacade`: Interfaces with Intelligence layer.
        - `.getNextBatch()`: Requests prioritized URLs.
    - `RobotsTxtManager`: Compliance engine.
        - `.isAllowed(userAgent, url)`
    - `RateLimiter`: Sliding window token bucket.
        - `.acquire(host)`: Returns Promise.
- **Events (Pub/Sub)**:
    - emitted: `crawl:started`, `crawl:progress`, `crawl:finished`, `crawl:error`
    - consumed: `plan:updated` (from Intelligence)
- **API (Maroon)**:
    - `POST /crawl/control/:action` (start/stop/pause)
    - `GET /telemetry/stream` (SSE)

### 1.2 `news-crawler-db` (Operational Data)
- **Role**: High-velocity storage, raw HTML, fetch metadata.
- **Schema (Tables)**:
    - `urls`: id, url, depth, status (pending/fetched/error).
    - `http_responses`: headers, status_code, ttfb, download_time.
    - `articles`: id, title, content_text, html_blob (compressed).
    - `links`: source_url_id, target_url_id, anchor_text.
- **Adapters**:
    - `ArticleAdapter.upsert(article)`
    - `FetchAdapter.log(response)`
- **Shared Access**:
    - Accessible via raw SQL by `news-db-analysis` (Read-Optimized).

### 1.3 `news-gazetteer` (Reference Data)
- **Role**: Geospatial truth, place normalization, hierarchy.
- **Schema (Tables)**:
    - `places`: id, name, population, lat, lon, type (city/country).
    - `place_hierarchy`: parent_id, child_id (adjacency list).
    - `place_names`: alt_names, language, script.
- **Functions**:
    - `Gazetteer.match(text)`: Returns candidate places with confidence.
    - `Gazetteer.disambiguate(candidates, context)`: resolving Paris, TX vs Paris, France.
- **API (Maroon)**:
    - `GET /geo/lookup?q=...`
    - `POST /geo/resolve-batch`

## 2. DEEP ANALYSIS (Stage 2)

### 2.1 `news-db-analysis` (The Engine)
- **Role**: Stateful processing, job running, result storage.
- **Services (Orchestration)**:
    - `NewsAnalysisService`:
        - `.runFullScan()`: Pipelines all sub-services.
        - `.analyzeBatch(ids)`: Targeted analysis.
    - `StoryClusteringService`:
        - Input: Stream of articles (simhash).
        - Output: Clusters (Story ID).
        - Logic: Sliding time window (24h).
    - `TopicTrendService`:
        - Input: Token frequencies over time.
        - Output: Trend spikes (velocity > threshold).
    - `HubGapService`:
        - Input: Gazetteer coverage vs Article distribution.
        - Output: Under-crawled regions.
    - `BackfillService`: Re-runs new algorithms on old data.
- **Data Flow**:
    - READ: `crawler-db` (Articles)
    - EXECUTE: `pure-analysis` functions
    - WRITE: `analysis_runs`, `article_tags`, `trends` tables.

### 2.2 `news-db-pure-analysis` (The Math Library)
- **Role**: Stateless, deterministic algorithms. Side-effect free.
- **Modules**:
    - `clustering/simhash.ts`:
        - `compute(text) -> 64bit_hash`
        - `hamming(h1, h2) -> distance`
    - `summarization/textRank.ts`:
        - `rankSentences(text) -> scored_sentences[]`
    - `classification/decisionTree.ts`:
        - `evaluate(tree, features) -> class_label`
    - `sentiment/lexicon.ts`:
        - `score(text, lexicon) -> {valence, arousal}`
    - `geo/hubUrlPredictor.ts`:
        - `predict(domain, country) -> probable_url_patterns`

## 3. INTELLIGENCE & PLANNING (Stage 3)

### 3.1 `news-intelligence` (The Strategist)
- **Role**: High-level decision making, learning, coverage optimization.
- **Components**:
    - `KnowledgeGraphBuilder`:
        - Extracts entities (People, Orgs) from specific articles.
        - Links entities across stories.
    - `TopicHubGapAnalyzer`:
        - Compares `Gazetteer` known places vs `Article` mentions.
        - Identifies "News Deserts".
    - `CrawlPlanner`:
        - Generates `CrawlPlan` objects for the Core.
        - "We need 500 fetches from .br domains to fill the Brazil gap."
- **Feedback Loop**:
    - Intelligence outputs -> Control Instructions for Stage 1.

## 4. UI VISUALIZATION (Overlay)
- **Data Explorer**: Raw row views (SQL Grid).
- **Map View**: Geospatial density heatmap (Gazetteer + Articles).
- **Trend Graph**: Time-series visualization (Analysis output).
- **Plan Inspector**: Gantt chart of crawl jobs and coverage targets.
