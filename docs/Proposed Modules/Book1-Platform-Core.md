# Book 1: News Platform Core

**Repository Name**: `copilot-news-platform`  
**Status**: Proposal  
**Role**: Unified Database, API Gateway, Advanced UI  
**Version**: 1.0 Draft

---

## Table of Contents

1.  [Introduction](#1-introduction)
2.  [Goals & Non-Goals](#2-goals--non-goals)
3.  [Architecture Overview](#3-architecture-overview)
4.  [Database Layer](#4-database-layer)
5.  [API Design](#5-api-design)
6.  [User Interface (UI)](#6-user-interface-ui)
7.  [Security & Authentication](#7-security--authentication)
8.  [Performance Targets](#8-performance-targets)
9.  [Testing Strategy](#9-testing-strategy)
10. [Migration Strategy](#10-migration-strategy)
11. [Files to Port from Monorepo](#11-files-to-port-from-monorepo)
12. [Future Advanced Features](#12-future-advanced-features-requires-planning)
13. [Operational Tooling & CLI](#13-operational-tooling--cli)
14. [Observability Strategy](#14-observability-strategy)
15. [Appendix A: Schema Reference](#appendix-a-schema-reference)
16. [Appendix B: Database Layer Deep Dive](#appendix-b-database-layer-deep-dive)
17. [Appendix C: TypeScript Interfaces](#appendix-c-typescript-interfaces)

---

> [!CAUTION]
> **FOR IMPLEMENTING AGENTS: READ THE SOURCE CODE**
>
> This document references many files from the `copilot-dl-news` monorepo. **You MUST locate and examine these files before implementing.** Do not rely solely on this document's descriptions—the actual implementations contain critical details, edge cases, and patterns not fully captured here.
>
> **Before writing any code:**
> 1. Use file search tools to find each referenced file (e.g., `SQLiteNewsDatabase.js`, `DualDatabaseFacade.js`)
> 2. Read the file contents to understand the actual implementation
> 3. Study the function signatures, data structures, and error handling
> 4. Look at related test files (`__tests__/`) for usage examples
>
> The source files are your primary reference. This document is a guide, not a specification.

## 1. Introduction

The **News Platform Core** is the foundational module of the new distributed architecture. It serves as the single source of truth for all news data, geographic information (Gazetteer), and system state. It exposes this data via a well-defined HTTP API and provides an advanced management UI.

### 1.1. Why a Platform Core?

The current `copilot-dl-news` monorepo has grown to ~2000 lines of schema definitions across 97 tables, with tightly coupled UI, crawling, and analysis logic. This creates several problems:

-   **Agent Context Overload**: Any AI agent working on this repo must absorb a massive context.
-   **Deployment Complexity**: Updating the UI requires redeploying everything.
-   **Testing Difficulty**: Unit testing is hampered by intertwined dependencies.

The Platform Core solves this by being the **only module that touches the database**. All other modules (Crawler, Analysis) interact via HTTP.

---

## 2. Goals & Non-Goals

### 2.1. Goals

1.  **Unified Data Store**: Host the `news.db` (SQLite, ~8GB) with all News + Gazetteer data.
2.  **HTTP API**: Expose every read/write operation through a versioned REST API.
3.  **Advanced UI**: Provide administrative dashboards for data visualization and manual operations.
4.  **Event Notification**: Emit events (SSE/Webhooks) to notify downstream modules of new data.
5.  **Type Safety**: Use TypeScript with strict types for all API contracts.

### 2.2. Non-Goals

-   ❌ **Crawling**: No HTTP fetching of external websites. This is the Crawler's job.
-   ❌ **Complex Heuristics**: No pattern analysis or ML. This is the Analysis Engine's (now bundled with Crawler) job.
-   ❌ **Geo Computation**: No on-the-fly geographic calculations beyond simple lookups.

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   News Platform Core                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐  │
│  │  REST API   │    │    SSE      │    │   Admin UI      │  │
│  │ (Fastify)   │◄──►│ (Events)    │    │   (Next.js)     │  │
│  └──────┬──────┘    └──────┬──────┘    └────────┬────────┘  │
│         │                  │                    │           │
│         └──────────────────┴────────────────────┘           │
│                           │                                 │
│                  ┌────────▼────────┐                        │
│                  │  Service Layer  │                        │
│                  │ (Business Logic)│                        │
│                  └────────┬────────┘                        │
│                           │                                 │
│                  ┌────────▼────────┐                        │
│                  │  SQLite + WAL   │                        │
│                  │   (news.db)     │                        │
│                  └─────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
           ▲                              ▲
           │                              │
           │ (HTTP API Calls)             │ (SSE / Webhooks)
           │                              │
   ┌───────┴───────┐              ┌───────┴───────┐
   │  Intelligent  │              │   Other       │
   │    Crawler    │              │   Clients     │
   └───────────────┘              └───────────────┘
```

### 3.1. Tech Stack

| Component       | Technology             | Rationale                                      |
|-----------------|------------------------|------------------------------------------------|
| **Runtime**     | Node.js (v20+)         | Codebase continuity                            |
| **API Framework** | Fastify               | High performance, schema validation, plugin ecosystem |
| **Database**    | SQLite (better-sqlite3) | Existing data, single-file simplicity, WAL mode |
| **UI**          | Next.js (App Router)   | React Server Components, co-located with API  |
| **Validation**  | Zod / TypeBox          | Type-safe request/response schemas             |
| **ORM (Optional)** | Drizzle ORM           | Type-safe SQL with SQLite support              |

---

## 4. Database Layer

### 4.1. The Unified Schema

The Platform inherits the existing schema from `copilot-dl-news`, which includes:

| Category       | Key Tables                                             | Description                              |
|----------------|--------------------------------------------------------|------------------------------------------|
| **News Core**  | `news_websites`, `urls`, `http_responses`, `content_analysis` | Website registry, crawled pages, parsed content |
| **Gazetteer**  | `places`, `place_names`, `place_hierarchies`, `place_types` | Geographic data, multi-language names    |
| **Hubs**       | `place_hubs`, `place_hub_url_patterns`, `place_hub_candidates` | Discovery and verification of location-specific pages |
| **System**     | `background_tasks`, `crawl_log`, `crawl_runs`, `analysis_runs` | Task tracking, logging                   |
| **API**        | `api_keys`                                              | Authentication for external consumers    |

### 4.2. Schema Stats (Current)

```
Tables:   97
Indexes:  249
Triggers: 28
Views:    2
```

> **Source**: Auto-generated from `tools/schema-sync.js`, reflected in `src/data/db/sqlite/v1/schema-definitions.js`.

### 4.3. Key Table Descriptions

#### `news_websites`
The registry of all tracked news sources.
```sql
CREATE TABLE IF NOT EXISTS news_websites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT UNIQUE NOT NULL,
  url TEXT UNIQUE NOT NULL,
  name TEXT,
  status TEXT,
  ...
);
```

#### `urls`
Every discovered URL. This is the largest table.
```sql
CREATE TABLE IF NOT EXISTS urls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT UNIQUE NOT NULL,
  host TEXT,                 -- Domain
  path TEXT,
  status TEXT DEFAULT 'pending', -- pending, fetching, done, error
  ...
);
```

#### `places`
Geographic entities (Countries, Regions, Cities).
```sql
CREATE TABLE IF NOT EXISTS places (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type_id INTEGER REFERENCES place_types(id),
  parent_id INTEGER REFERENCES places(id),
  ...
);
```

#### `place_hubs`
Verified location-specific news pages (e.g., `bbc.com/news/world/africa`).
```sql
CREATE TABLE IF NOT EXISTS place_hubs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id INTEGER NOT NULL REFERENCES news_websites(id),
  place_id INTEGER NOT NULL REFERENCES places(id),
  url TEXT NOT NULL,
  verification_status TEXT,
  ...
);
```

---

## 5. API Design

### 5.1. Core Principles

1.  **RESTful**: Resource-oriented endpoints.
2.  **Versioned**: All endpoints prefixed with `/api/v1/`.
3.  **Paginated**: List endpoints support `limit`, `offset`, `cursor`.
4.  **Filterable**: Query parameters for common filters.

### 5.2. Endpoint Overview

| Category          | Endpoint                              | Methods          | Description                       |
|-------------------|---------------------------------------|------------------|-----------------------------------|
| **Websites**      | `/api/v1/websites`                    | GET, POST        | List/Create news sources          |
|                   | `/api/v1/websites/:id`                | GET, PATCH       | Get/Update a specific source      |
| **URLs**          | `/api/v1/urls`                        | GET              | List crawled URLs                 |
|                   | `/api/v1/urls/queue`                  | GET              | Get pending URLs for crawling     |
|                   | `/api/v1/urls/ingest`                 | POST             | Bulk insert new URLs (from Crawler) |
| **Places**        | `/api/v1/places`                      | GET              | List all places                   |
|                   | `/api/v1/places/search`               | GET              | Search places by name             |
|                   | `/api/v1/places/:id/hierarchy`        | GET              | Get parent chain                  |
| **Hubs**          | `/api/v1/hubs`                        | GET, POST        | List/Create place hubs            |
|                   | `/api/v1/hubs/candidates`             | GET, POST        | Manage hub candidates             |
| **Tasks**         | `/api/v1/tasks`                       | GET, POST        | List/Create background tasks      |
|                   | `/api/v1/tasks/:id`                   | GET, PATCH       | Get/Update/Cancel task            |
| **Events (SSE)**  | `/api/v1/events`                      | GET (SSE)        | Real-time event stream            |

### 5.3. Ingest API Detail

The `POST /api/v1/urls/ingest` endpoint is critical for the Crawler and must be high-throughput.

**Request Body:**
```json
{
  "batch": [
    {
      "url": "https://example.com/article/123",
      "host": "example.com",
      "status": "done",
      "http_status": 200,
      "title": "Article Title",
      "content_type": "text/html",
      "discovered_links": ["https://example.com/article/456"],
      "classification": "article",
      "patterns_found": ["/article/{id}"]
    }
  ]
}
```

**Response:**
```json
{
  "inserted": 1,
  "updated": 0,
  "errors": []
}
```

---

## 6. User Interface (UI)

### 6.1. Overview

The Admin UI is a comprehensive dashboard built with Next.js. It provides visualization and control over all data managed by the Platform.

### 6.2. Key Views

| View Name             | Purpose                                                                 |
|-----------------------|-------------------------------------------------------------------------|
| **Dashboard**         | Overview stats: websites, URLs, hubs, tasks.                            |
| **Website Explorer**  | List, filter, manage news sources. View crawl status and doc counts.   |
| **URL Browser**       | Search and view individual URLs. Inspect metadata.                     |
| **Gazetteer Manager** | Browse places. View hierarchy. Import new geographic data.             |
| **Hub Matrix**        | Visualize Website x Place grid. See verified/candidate/absent status.  |
| **Task Monitor**      | View running/completed/failed background tasks.                        |
| **Crawl Progress**    | Real-time speedometer showing fetch rate.                              |

### 6.4. Feature: Universal Data Explorer

A generic, table-agnostic data browser to inspect any table immediately.

-   **Dynamic Columns**: Toggle visibility of columns (e.g., show only `url`, `status`, `last_seen_at`).
-   **Advanced Filtering**: Builder UI for complex queries (e.g., `status = 'error' AND created_at > '2025-01-01'`).
-   **Quick Actions**: Context menu for common tasks (e.g., "Re-crawl", "View Source", "Delete").
-   **JSON Inspector**: Pretty-print viewer for JSON blobs (e.g., `content_analysis`, `http_responses.headers`).

### 6.5. Feature: SQL Admin Console (General Purpose)

A raw database administration view for developers and advanced users.

-   **Multi-Engine Support**: Switch context between SQLite and Postgres via dropdown.
-   **Read-Only Safety**: By default, runs in read-only transaction mode (toggleable for writes).
-   **Schema Browser**: Tree view of tables, columns, indexes, and triggers.
-   **Query History**: LocalStorage-saved history of run queries.
-   **Export Results**: Download result sets as CSV/JSON.
-   **Execution Stats**: Show query time, rows affect, and detailed EXPLAIN output.

### 6.6. UI Components to Port

The following React components from the monorepo should be ported and refactored:

| Component                     | Source File                                                                                | Notes                                       |
|-------------------------------|--------------------------------------------------------------------------------------------|---------------------------------------------|
| `CrawlSpeedometerControl`     | `src/ui/controls/CrawlSpeedometerControl.js`                                               | Real-time fetch rate visualization          |
| `GeoImportDashboard`          | `src/ui/controls/GeoImportDashboard.js`                                                    | Gazetteer import UI                         |
| `PlaceHubsTable`              | `src/ui/controls/PlaceHubsTable.js`                                                        | Display verified hubs                       |
| `ConfigMatrixControl`         | `src/ui/controls/ConfigMatrixControl.js`                                                    | Website x Place matrix                      |
| `DatabaseSelector`            | `src/ui/controls/DatabaseSelector.js`                                                      | DB file selection                           |
| `ProgressBar`                 | `src/ui/controls/ProgressBar.js`                                                           | Generic progress display                    |
| `Table`                       | `src/ui/controls/Table.js`                                                                 | Generic data table                          |
| Server Pages                  | `src/ui/server/` (multiple files)                                                          | Express routes serving HTML                 |

## 7. Security & Authentication

### 7.1. API Authentication

All external API access requires authentication via API keys.

```typescript
// Request header
Authorization: Bearer dlnews_a1b2c3d4e5f6...
```

**Key Tiers:**

| Tier       | Rate Limit     | Features                |
|------------|----------------|-------------------------|
| `free`     | 100 req/day    | Read-only               |
| `premium`  | 10,000 req/day | Read + limited writes   |
| `unlimited`| No limit       | Full access (Crawler)   |

### 7.2. Key Management

-   Keys are stored as **SHA-256 hashes** in the `api_keys` table.
-   A `key_prefix` (first 8 chars) allows identification without exposing the full key.
-   Revocation is instant via `revoked_at` timestamp.

### 7.3. Internal Security

| Risk                | Mitigation                                           |
|---------------------|------------------------------------------------------|
| SQL Injection       | Use `better-sqlite3` prepared statements, never string concat |
| CORS                | Restrict origins to known UI domains                 |
| DoS on `/ingest`    | Rate limit by IP + API key + batch size limits       |
| Admin UI access     | Session-based auth with HTTPS-only cookies           |

---

## 8. Performance Targets

### 8.1. API Latency

| Endpoint              | P50 Target | P99 Target |
|-----------------------|------------|------------|
| `GET /websites`       | < 20ms     | < 100ms    |
| `GET /urls/queue`     | < 50ms     | < 200ms    |
| `POST /urls/ingest`   | < 100ms    | < 500ms    |
| `GET /places/search`  | < 30ms     | < 150ms    |

### 8.2. Throughput

| Metric                        | Target                    |
|-------------------------------|---------------------------|
| Ingest rate                   | 200+ URLs/second          |
| Concurrent API connections    | 500+                      |
| SSE subscribers               | 100+                      |

### 8.3. Database

| Metric                        | Target                    |
|-------------------------------|---------------------------|
| Query cache hit rate          | > 80%                     |
| WAL checkpoint interval       | 1000 pages                |
| Max DB file size (SQLite)     | 50GB before sharding      |

---

## 9. Testing Strategy

### 9.1. Unit Tests

-   **Location**: `src/**/__tests__/*.test.ts`
-   **Framework**: Vitest
-   **Coverage Target**: 80%+

**Example:**
```typescript
// src/services/__tests__/PlaceService.test.ts
describe('PlaceService', () => {
  it('should return hierarchy for a city', async () => {
    const result = await placeService.getHierarchy(123);
    expect(result).toEqual(['Paris', 'France', 'Europe']);
  });
});
```

### 9.2. Integration Tests

-   **Location**: `tests/integration/`
-   **Setup**: Use in-memory SQLite with seeded fixtures
-   **Key Tests**:
    -   `/ingest` → verify data appears in `urls` table
    -   `/places/search` → verify FTS5 index works

### 9.3. End-to-End Tests

-   **Framework**: Playwright
-   **Scope**: Full UI flows (Website Explorer, Hub Matrix)
-   **CI**: Run on every PR

### 9.4. Load Tests

-   **Tool**: k6 or autocannon
-   **Scenario**: Simulate 10 Crawlers sending 100 URLs/sec each
-   **Pass Criteria**: P99 latency < 500ms, 0 errors

---

## 10. Migration Strategy

### 10.1. Phase 1: Foundation

1.  **Initialize Repo**: `npx create-next-app@latest copilot-news-platform --typescript`
2.  **Copy Database**: Copy `data/news.db` to the new project's `data/` directory.
3.  **Setup Database Access**:
    -   Port `src/data/db/index.js` (adapter factory).
    -   Port `src/data/db/sqlite/v1/SQLiteNewsDatabase.js` (core operations).
    -   Simplify: Remove Postgres adapter if not needed initially.

### 10.2. Phase 2: API

1.  **Build Fastify Server**: Create `src/server/index.ts`.
2.  **Implement Core Endpoints**: Prioritize `/api/v1/websites`, `/api/v1/urls/queue`, `/api/v1/urls/ingest`.
3.  **Add SSE**: Implement `/api/v1/events` for real-time updates.

### 10.3. Phase 3: UI

1.  **Setup Next.js App Router**: Create pages in `app/`.
2.  **Port Components**: Migrate React components from `src/ui/controls/`.
3.  **Connect to API**: Use `fetch` or `useSWR` to call the Fastify API.

### 10.4. Phase 4: Verification

1.  **Seed Test Data**: Create fixtures for end-to-end tests.
2.  **Run Headless Tests**: Playwright for UI, Vitest for API.
3.  **Benchmark Ingest**: Ensure `/ingest` can handle 100+ URLs/second.

---

## 11. Files to Port from Monorepo

> [!IMPORTANT]
> **EXAMINE EACH FILE BEFORE PORTING**
>
> For each file listed below, you MUST:
> 1. **Locate the file** in the `copilot-dl-news` repository using file search
> 2. **Read its contents** to understand implementation details
> 3. **Check for dependencies** it imports from other modules
> 4. **Review associated tests** in `__tests__/` directories
>
> The paths are relative to the `copilot-dl-news` root directory.

The following files from `copilot-dl-news` should be migrated:

### 11.1. Database Layer (Critical)

| File                                                      | Purpose                                            |
|-----------------------------------------------------------|----------------------------------------------------|
| `src/data/db/index.js`                                    | Adapter factory, `getDb()`, `createDatabase()`     |
| `src/data/db/sqlite/v1/SQLiteNewsDatabase.js`             | Core DB operations (66KB, extensive)               |
| `src/data/db/sqlite/v1/schema-definitions.js`             | Full schema (auto-generated, 86KB)                 |
| `src/data/db/sqlite/v1/schema.js`                         | Schema initialization functions                    |
| `src/data/db/sqlite/v1/connection.js`                     | Connection management, WAL setup                   |
| `src/data/db/placeHubCandidatesStore.js`                  | Hub candidate CRUD                                 |
| `src/data/db/placeHubUrlPatternsStore.js`                 | URL pattern storage                                |

### 11.2. Gazetteer Services

| File                                                      | Purpose                                            |
|-----------------------------------------------------------|----------------------------------------------------|
| `src/services/GeoImportService.js`                        | Import GeoNames/Wikidata (25KB)                    |
| `src/services/GeoImportStateManager.js`                   | State machine for imports (48KB)                   |

### 11.3. UI Controls

| File                                                      | Purpose                                            |
|-----------------------------------------------------------|----------------------------------------------------|
| `src/ui/controls/CrawlSpeedometerControl.js`              | Real-time fetch visualization (18KB)               |
| `src/ui/controls/GeoImportDashboard.js`                   | Gazetteer import UI (32KB)                         |
| `src/ui/controls/PlaceHubsTable.js`                       | Hub listing (4KB)                                  |
| `src/ui/controls/ConfigMatrixControl.js`                  | Matrix view (13KB)                                 |
| `src/ui/controls/DatabaseSelector.js` + `.css`            | DB picker (27KB + 22KB CSS)                        |

### 11.4. API Routes (Reference)

| File                                                      | Purpose                                            |
|-----------------------------------------------------------|----------------------------------------------------|
| `src/api/` (directory, 37 files)                          | Existing Express routes (study for patterns)       |
| `z-server/` (directory, 61 files)                         | Alternative server implementation                  |

---

---

## 12. Future Advanced Features (Requires Planning)

These features are out of scope for the initial migration but represent the long-term vision for the Platform Core. They will require separate planning phases.

### 12.1. Visual Schema Builder
-   **Concept**: Drag-and-drop interface to modify the database schema.
-   **Complexity**: High (Must handle migration generation, data preservation).

### 12.2. Automated Query Performance Analyzer
-   **Concept**: "Visual Explain" akin to Postgres pgAdmin.
-   **Features**: Auto-suggest indexes based on slow query logs (`queryTelemetry.js`), visualize table scan vs index scan.

### 12.3. Temporal Data / Time Travel
-   **Concept**: "See the database as it was on [Date]".
-   **Implementation**: Trigger-based audit tables or extensions like `pg_audit` allowing full rewind capability for debugging crawler logic.

### 12.4. Multi-Tenant Data Partitioning
-   **Concept**: Logical separation of data sets for different crawler "Projects".
-   **Use Case**: Running two completely independent crawls (e.g., "Tech News" vs "Sports") on the same infrastructure.

---

## 13. Operational Tooling & CLI

The Platform Core includes a CLI for administrative tasks that are risky or impossible to perform via the Web UI.

### 13.1. Management Script (`scripts/manage.js`)

A unified entry point for ops commands.

**Commands:**
-   `user:create <email> <role>`: Bootstrap initial admin user.
-   `db:migrate:up`: Manually apply pending migrations.
-   `db:migrate:down`: Rollback last migration (CAUTION).
-   `db:seed`: Populate DB with fixture data for testing.
-   `system:status`: quick health check of DB connections and disk space.

### 13.2. Background Task Runner

The `background_tasks` table is processed by a dedicated runner.

-   **Runner**: `src/workers/task-runner.ts`
-   **Concurrency**: configurable via `CONCURRENT_JOBS` env var (default: 2).
-   **Resilience**: Auto-retries with exponential backoff for failed tasks.

---

## 14. Observability Strategy

To ensure reliability, the Platform Core implements a 3-pillar observability stack.

### 14.1. Structured Logging
-   **Format**: JSON-formatted logs for machine parsing.
-   **Library**: `pino` (low overhead).
-   **Fields**: `level`, `time`, `pid`, `reqId`, `module`, `msg`, `context` (JSON obj).

### 14.2. Application Metrics (Prometheus)
Exposed at `/metrics` (protected) for scraping.

| Metric | Type | Description |
|--------|------|-------------|
| `http_requests_total` | Counter | Total API requests by route/status. |
| `active_db_connections_count` | Gauge | Current DB pool usage. |
| `task_queue_depth` | Gauge | Pending items in `background_tasks`. |
| `crawl_ingest_rate` | Histogram | Rate of URL ingestion per second. |

### 14.3. Distributed Tracing
-   **Correlation**: Every HTTP request generates a `reqId` that is:
    1.  Passed to the DB logger.
    2.  Returned in response headers (`X-Request-ID`).
    3.  Included in any "job" created in `task_queue`.
-   **Goal**: Trace a URL ingest failure back to the specific crawler batch that sent it.

---

## Appendix A: Schema Reference

The full schema is defined in `src/data/db/sqlite/v1/schema-definitions.js`. Key table groups:

### A.1. News Core Tables (20+)
- `news_websites`, `urls`, `http_responses`, `content_analysis`, `extracted_links`, `crawl_log`, `crawl_runs`, etc.

### A.2. Gazetteer Tables (10+)
- `places`, `place_names`, `place_hierarchies`, `place_types`, `place_urls`, `place_name_aliases`, etc.

### A.3. Hub Discovery Tables (5+)
- `place_hubs`, `place_hub_candidates`, `place_hub_url_patterns`, `suggested_hubs`, etc.

### A.4. System Tables (10+)
- `background_tasks`, `analysis_runs`, `analysis_run_events`, `api_keys`, `db_migrations`, etc.

---

## Appendix A: Database Layer Deep Dive

This appendix provides detailed implementation guidance for the database layer, including directory structure to copy, dual SQLite/Postgres support, and live migration strategy.

> [!NOTE]
> **The tree below is a snapshot.** Before copying, navigate to `src/data/db/` in the source repo and explore it yourself. Files may have been added, renamed, or reorganized since this document was written. Use `list_dir` and `view_file` tools to verify current structure.

### B.1. Directory Structure to Copy

The following directory tree from `copilot-dl-news/src/data/db/` should be copied directly to the Platform Core module. This establishes the foundation for multi-database support.

```
src/data/db/
├── index.js                          # Adapter factory (registerAdapter, createDatabase, getDb)
├── DualDatabaseFacade.js             # CRITICAL: Dual-write, mode switching, live migration
├── dbAccess.js                       # Common access patterns
├── EnhancedDatabaseAdapter.js        # Wrapper with instrumentation
│
├── sqlite/                           # SQLite-specific implementation
│   ├── index.js
│   ├── v1/
│   │   ├── SQLiteNewsDatabase.js     # 66KB - Core operations (upsertArticle, getArticle, etc.)
│   │   ├── schema-definitions.js     # 86KB - Auto-generated 97-table schema
│   │   ├── schema.js                 # Schema initialization functions
│   │   ├── connection.js             # Connection management, WAL setup
│   │   ├── StatementManager.js       # Prepared statement caching
│   │   ├── instrumentation.js        # Query timing/telemetry
│   │   ├── rateLimitAdapter.js       # Rate limit storage
│   │   ├── queries/                  # Domain-specific query modules
│   │   │   ├── analysis.analysePagesCore.js
│   │   │   └── articleXPathPatterns.js
│   │   └── migrations/               # .sql files for incremental schema changes
│   └── gazetteer/
│       └── v1/                       # Gazetteer-specific queries
│
├── postgres/                         # PostgreSQL implementation
│   ├── index.js
│   └── v1/
│       ├── PostgresNewsDatabase.js   # 544 lines - Full Postgres adapter
│       ├── connection.js             # Pool management
│       ├── ensureDb.js               # Schema initialization for Postgres
│       ├── schema-definitions.js     # Postgres-specific DDL (auto-generated)
│       └── queries/                  # Postgres query modules
│           ├── analysis.analysePagesCore.js
│           ├── articleXPathPatterns.js
│           └── common.js
│
├── migration/                        # SQLite ↔ Postgres migration tools
│   ├── orchestrator.js               # 309 lines - Full migration coordinator
│   ├── exporter.js                   # Export tables to JSON
│   ├── importer.js                   # Import JSON to target DB
│   ├── validator.js                  # Data validation post-migration
│   └── schema-versions.js            # Version tracking
│
├── placeHubCandidatesStore.js        # Hub candidate CRUD
├── placeHubUrlPatternsStore.js       # URL pattern storage
└── queryTelemetry.js                 # Performance monitoring
```

**Total: ~108 files to copy**

### A.2. Dual Database Support (SQLite + Postgres)

The Platform Core must support **both** SQLite and PostgreSQL, with the ability to run them simultaneously during a migration.

#### A.2.1. The Adapter Factory Pattern

The `index.js` file implements a registry pattern:

```javascript
// From src/data/db/index.js
registerAdapter("sqlite", (options) => {
  const { createSQLiteDatabase } = require("./sqlite");
  return createSQLiteDatabase(options);
});

registerAdapter("postgres", (options) => {
  const { createPostgresDatabase } = require("./postgres");
  return createPostgresDatabase(options);
});

// Usage:
const db = createDatabase({ engine: 'sqlite', dbPath: 'data/news.db' });
// OR
const db = createDatabase({ engine: 'postgres', connectionString: 'postgres://...' });
```

Both adapters implement the **same interface**:
- `upsertArticle(article, options)`
- `getArticle(id)`
- `getArticleByUrl(url)`
- `hasUrl(url)`
- `createAnalysePagesCoreQueries()`
- `close()`

#### A.2.2. The DualDatabaseFacade

The `DualDatabaseFacade` class (589 lines) is the key to live migration:

```javascript
// From src/data/db/DualDatabaseFacade.js
const MODES = {
  SINGLE: 'single',          // One DB only
  PRIMARY: 'primary',        // Primary for writes, secondary for reads
  DUAL_WRITE: 'dual-write',  // Write to BOTH DBs simultaneously
  EXPORT: 'export'           // Background export from primary to secondary
};
```

**Key Methods:**

| Method                    | Purpose                                                      |
|---------------------------|--------------------------------------------------------------|
| `initialize()`            | Connect to primary and (optionally) secondary DB             |
| `setMode(mode, options)`  | Switch modes at runtime                                      |
| `exportToSecondary(opts)` | Batch copy data from SQLite to Postgres                      |
| `getStatus()`             | Get current mode, connection health, sync state              |
| `_createDualWriteProxy()` | Auto-proxy writes to both DBs when in `dual-write` mode      |

### A.3. Live Migration Strategy

The Platform supports seamless migration from SQLite to Postgres **without downtime**.

#### A.3.1. Migration Phases

```
┌───────────────────────────────────────────────────────────────────────────┐
│  Phase 1: SINGLE (SQLite)                                                 │
│  - All reads/writes go to SQLite                                          │
│  - Postgres is not connected                                              │
└───────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ setMode('export')
┌───────────────────────────────────────────────────────────────────────────┐
│  Phase 2: EXPORT                                                          │
│  - SQLite remains primary                                                 │
│  - Background job copies all data to Postgres                             │
│  - Progress reported via getStatus()                                      │
└───────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ setMode('dual-write')
┌───────────────────────────────────────────────────────────────────────────┐
│  Phase 3: DUAL-WRITE                                                      │
│  - ALL writes go to BOTH SQLite AND Postgres                              │
│  - Reads can come from either (configurable)                              │
│  - This ensures both DBs are in sync for new data                         │
└───────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ setMode('single', { primary: 'postgres' })
┌───────────────────────────────────────────────────────────────────────────┐
│  Phase 4: SINGLE (Postgres)                                               │
│  - All reads/writes go to Postgres                                        │
│  - SQLite disconnected (can be archived)                                  │
└───────────────────────────────────────────────────────────────────────────┘
```

#### A.3.2. MigrationOrchestrator

The `migration/orchestrator.js` (309 lines) coordinates the migration:

```javascript
const orchestrator = new MigrationOrchestrator(sourceDb, { 
  batchSize: 1000,
  progressCallback: (table, count, total) => console.log(`${table}: ${count}/${total}`)
});

const result = await orchestrator.migrateTo(targetDb, {
  tables: ['urls', 'http_responses', 'content_analysis'], // Selective or all
  validate: true, // Run DataValidator after import
  updateVersion: '2.0.0'
});
```

**Internal Phases:**
1. `_exportPhase()`: Write all tables to JSON manifest
2. `_transformPhase()`: Apply transformers (e.g., data type mappings)
3. `_importPhase()`: Bulk insert into target DB
4. `_updateVersionPhase()`: Mark migration complete

#### A.3.3. Data Validation

The `validator.js` ensures data integrity:

```javascript
const validator = new DataValidator(sourceDb, targetDb);
const report = await validator.validate();
// { missingRows: [...], mismatchedColumns: [...], valid: true/false }
```

### A.4. UI Features for Database Management

The Platform UI should include advanced DB management views:

| View                      | Features                                                     |
|---------------------------|--------------------------------------------------------------|
| **Database Status**       | Current mode (single/dual-write), connection health          |
| **Migration Console**     | Start/pause/resume migration, progress bar                   |
| **Sync Diff Viewer**      | Compare row counts between SQLite and Postgres               |
| **Query Telemetry**       | Slow query log, query frequency charts                       |
| **Schema Browser**        | Interactive table/column explorer                            |

### A.5. Implementation Checklist

When building the Platform Core, implement these in order:

1. **[Day 1] Copy DB Directory**
   - Copy `src/data/db/` wholesale
   - Remove unused Postgres adapter if starting SQLite-only
   - Test: Run `getDb()` and verify connection

2. **[Day 2] Expose via API**
   - `GET /api/v1/db/status` → Returns `DualDatabaseFacade.getStatus()`
   - `POST /api/v1/db/mode` → Changes mode (authenticated admin only)

3. **[Day 3] Build Migration UI**
   - Admin page showing sync progress
   - Start/Stop buttons wired to `MigrationOrchestrator`

4. **[Day 4] Add Telemetry**
   - Integrate `queryTelemetry.js` to log slow queries
   - Display in Admin UI

5. **[Day 5] Validate**
   - Run `DataValidator` on test DBs
   - Document any schema differences between SQLite/Postgres

---

## Appendix C: TypeScript Interfaces

Complete type definitions for API contracts. These should be placed in `src/types/`.

### C.1. Core Entities

```typescript
// src/types/entities.ts

export interface NewsWebsite {
  id: number;
  domain: string;
  url: string;
  name: string | null;
  status: 'active' | 'paused' | 'archived';
  docCount: number;
  lastCrawledAt: string | null;
  createdAt: string;
}

export interface Url {
  id: number;
  url: string;
  host: string;
  path: string;
  status: 'pending' | 'fetching' | 'done' | 'error';
  httpStatus: number | null;
  contentType: string | null;
  classification: 'article' | 'hub' | 'other' | null;
  depth: number;
  fetchedAt: string | null;
  errorMessage: string | null;
}

export interface Place {
  id: number;
  name: string;
  typeId: number;
  typeName: 'country' | 'region' | 'city' | 'other';
  parentId: number | null;
  iso2: string | null;
  population: number | null;
}

export interface PlaceHub {
  id: number;
  websiteId: number;
  placeId: number;
  url: string;
  verificationStatus: 'candidate' | 'verified' | 'absent';
  lastVerifiedAt: string | null;
  articleCount: number | null;
}
```

### C.2. API Request/Response Types

```typescript
// src/types/api.ts

// === INGEST ===
export interface IngestItem {
  url: string;
  host: string;
  status: 'done' | 'error';
  httpStatus?: number;
  title?: string;
  contentType?: string;
  classification?: 'article' | 'hub' | 'other';
  links?: string[];
  patterns?: PatternMatch[];
  fetchedAt: string;
  errorMessage?: string;
}

export interface PatternMatch {
  template: string;
  confidence: number;
  placeSlug?: string;
}

export interface IngestRequest {
  batch: IngestItem[];
  workerId?: string;
}

export interface IngestResponse {
  inserted: number;
  updated: number;
  errors: { url: string; error: string }[];
}

// === QUEUE ===
export interface QueueRequest {
  limit?: number;
  domain?: string;
  priority?: 'high' | 'normal' | 'low';
}

export interface QueueItem {
  id: number;
  url: string;
  depth: number;
  priority: number;
}

export interface QueueResponse {
  jobId: string;
  urls: QueueItem[];
}

// === PLACES ===
export interface PlaceSearchRequest {
  query: string;
  type?: 'country' | 'region' | 'city';
  limit?: number;
}

export interface PlaceHierarchy {
  id: number;
  name: string;
  type: string;
  level: number;
}
```

### C.3. Database Types

```typescript
// src/types/database.ts

export type DatabaseEngine = 'sqlite' | 'postgres';

export interface DatabaseConfig {
  engine: DatabaseEngine;
  dbPath?: string;           // SQLite
  connectionString?: string; // Postgres
}

export interface DualDatabaseConfig {
  mode: 'single' | 'primary' | 'dual-write' | 'export';
  primary: DatabaseConfig;
  secondary?: DatabaseConfig;
  quietLogging?: boolean;
  exportBatchSize?: number;
}

export interface DatabaseStatus {
  mode: string;
  primary: {
    engine: string;
    connected: boolean;
    rowCount?: number;
  };
  secondary?: {
    engine: string;
    connected: boolean;
    rowCount?: number;
    syncProgress?: number; // 0-100
  };
}

export interface MigrationResult {
  success: boolean;
  tablesExported: number;
  rowsExported: number;
  tablesImported: number;
  rowsImported: number;
  errors: string[];
  durationMs: number;
}
```

### C.4. Event Types (SSE)

```typescript
// src/types/events.ts

export type EventType =
  | 'url:ingested'
  | 'url:error'
  | 'hub:verified'
  | 'hub:rejected'
  | 'task:started'
  | 'task:progress'
  | 'task:completed'
  | 'task:failed';

export interface ServerEvent<T = unknown> {
  type: EventType;
  timestamp: string;
  payload: T;
}

export interface UrlIngestedPayload {
  id: number;
  url: string;
  host: string;
  classification: string;
}

export interface TaskProgressPayload {
  taskId: number;
  type: string;
  current: number;
  total: number;
  message: string;
}
```

---

**End of Book 1**
