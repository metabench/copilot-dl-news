# Chapter 1: News Platform Core (`copilot-news-platform`)

**Status**: Proposal (Refined)
**Role**: The "Brain" - Unified Data, API, and UI.

## 1. Overview
The **Platform Core** is the foundation of the system. It bundles the **Database** (News + Gazetteer), the **API**, and the **Management UI** into a single, cohesive module. This focuses the agent's context on "Knowledge Representation & Management" without distraction from low-level crawling or complex analysis heuristics.

## 2. Key Responsibilities
1.  **Unified Data Persistence**:
    -   Hosts the single SQLite database (`news.db`) containing:
        -   **News Data**: Websites, URLs, Crawl Logs.
        -   **Gazetteer Data**: Places, Hierarchies, Geo-boundaries.
        -   *Benefit*: Allows efficient SQL joins between "News Articles" and "Locations" without API overhead.
2.  **API Gateway**: Exposes all data via REST/GraphQL for the Crawler and Analysis modules.
3.  **Visualization (UI)**: The unified dashboard for:
    -   Mapping Hubs (using local Gazetteer data).
    -   Monitoring Crawl Progress.
    -   Manually correcting data.

## 3. Architecture

### 3.1. Tech Stack
-   **Runtime**: Node.js (Fastify/Express).
-   **Database**: `better-sqlite3` (WAL mode).
-   **UI**: Next.js (App Router).

### 3.2. Data Model (Merged Schema)
The unified schema enables powerful queries like *"Find all URLs mentioning 'Cities in France'"*.
-   `news_websites`, `urls`, `crawl_log`, `crawl_runs`
-   `places`, `place_names`, `place_hierarchies`, `place_hubs` (The Gazetteer)

### 3.3. API Design
*   **For Crawler**: `GET /api/queue` (Distribute work), `POST /api/ingest` (Save content).
*   **For Analysis**: `GET /api/analyze/pending`, `POST /api/analyze/result`.
*   **For Gazetteer**: The API serves place lookups internally to the UI, but external pattern extraction modules can also query `GET /api/places/search`.

## 4. Why this Abstraction?
By grouping the DB and Gazetteer together, we solve the **"Agent Surface Area"** problem:
-   **Platform Agent**: Works on Schema, API, and UI. Sees the "Whole World".
-   **Crawler Agent**: Sees only "Fetch & Parse". Doesn't care about Countries or Cities.
-   **Analysis Agent**: Sees "Text & Logic". Uses the API to get data, applies ML/Heuristics, sends results back.
