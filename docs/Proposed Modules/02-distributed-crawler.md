# Chapter 2: Intelligent Crawler (`copilot-news-crawler`)

**Status**: Proposal (Refined)
**Role**: Data Acquisition & Intelligence
**Dependency**: Depends on `copilot-news-platform` API

## 1. Overview
The **Intelligent Crawler** combines detailed fetching logic with powerful analysis heuristics. By colocating these concerns, the system can immediately identify "Hubs" or "Patterns" during the crawl and adapt its strategy in real-time, without waiting for an external async process.

## 2. Responsibilities
1.  **Fetch**: High-performance, polite crawling (politeness, robots.txt).
2.  **Analyze**: In-stream analysis of downloaded content (Pattern Extraction, Hub Detection).
3.  **Report**: Submits "Rich Ingests" to the Platform (HTML + Discovered Patterns + Hub Candidates).

## 3. Architecture

### 3.1. The Loop
1.  **Job**: Worker requests a job (`GET /api/queue`). Platform assigns a domain.
2.  **Crawl & Analyze**:
    -   Fetch Page.
    -   *Immediate*: Run `AnalysisEngine` on the DOM/Text.
    -   *Decision*: If "Hub", prioritize its links. If "Junk", discard/deprioritize.
3.  **Sync**: Batch upload results to Platform (`POST /api/ingest`).

### 3.2. Components
-   **FetcherLib**: Wraps Puppeteer/Cheerio.
-   **AnalysisLib**: The bundled logic (ported from `AnalysisService.js`).
-   **Worker**: The orchestration of the two loop steps.

## 4. Why Merged?
-   **Latency**: Removes the round-trip delay between "downloading a page" and "realizing it's a hub".
-   **Simplicity**: Deployment involves just "The Brain" (Platform) and "The Arms" (Crawler).
-   **Cohesion**: Finding patterns is intrinsic to navigating a news site effectively.
