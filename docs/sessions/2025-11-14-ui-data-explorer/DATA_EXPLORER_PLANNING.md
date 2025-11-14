# UI Data Explorer – Planning Notes

_Last updated: 2025-11-14_

_Document map_: Objectives → Data Inventory → Navigation → View Blueprints → Control Strategy → Express Integration → Roadmap → Drilldowns → Open Questions → Next Actions → Modular Strategy → Dataset Reference.

## 1. Objectives & Principles
- **High-volume scanning**: Every view must handle tens of thousands of rows by default, surfacing summaries (counts, rates, timestamps) before offering deeper detail.
- **Progressive disclosure**: Start with overview dashboards, drill into domain/URL/job specifics only when the operator clicks through.
- **Express + jsgui3-html**: Keep the server thin (Express routers + SQLite query helpers) and let jsgui3 controls (HTML + SVG) render complete documents server-side.
- **Navigation first**: Persistent nav tabs + contextual breadcrumbs so users can move from a URL list to that URL’s download history (descending order) and back without manual URL edits.
- **Read-only**: No mutating endpoints; all controls should degrade gracefully without JS.

## 2. Data Inventory & Candidate Views
| Dataset | Tables / Queries | View Purpose |
| --- | --- | --- |
| URL listings | `urls`, `latest_fetch` via `urlListingNormalized.js` | Primary table w/ pagination + filters |
| URL detail + downloads | `fetches`, `content_storage`, `articles`, `urlDetails.js` | Show row metadata + chronological download list |
| Domain activity | `urls`, `articles`, `fetches`, `recentDomains.js`, `domainSummary.js` | Rank domains by recency, volume, fetch attempts |
| Crawl jobs & stages | `crawl_jobs`, `crawl_types`, `queue_events`, `planner_stage_events` | Timeline of planner stages, durations, milestones |
| Error log | `errors` | Highlight spikes + drill into most recent failures |
| Queue health | `queues.js`, `queue_events` | Snapshot queue depth & throughput |
| Compression/storage | `content_storage`, `compression_stats` | Visualize size savings per compression strategy |
| Gazetteer lookups | `gazetteerPlace.js`, `gazetteerCountry.js` | Validate place-matching coverage (counts per country/ADM1) |

## 3. Navigation Model
1. **Global nav bar** (already wired via `renderHtml` navLinks) with tabs for URLs, Domains, Crawls, Errors, Storage, Gazetteer, Queues.
2. **Secondary breadcrumbs** inside detail pages:
   - URLs → `URL Detail (/urls/:id or ?url=)` → `Downloads (/urls/:id/downloads)`.
   - Domains → Domain overview (cards + table) → Domain drill-down (per-host timeline + latest URLs).
3. **Row-based navigation**: Each table row’s primary cell becomes an anchor linking to the next drill-down level. E.g. in the URL list, clicking the URL text navigates to `/urls/<id>` where we show metadata + download history sorted `fetched_at DESC`.
4. **Pager buttons** remain consistent across list views, using `PagerButtonControl` so keyboard navigation is predictable.

## 4. View Blueprints
### 4.1 URL Overview (`/urls`)
- **Data**: `selectUrlPage` + total count.
- **UI**: Existing columns plus optional filters (host/domain, HTTP status) via GET parameters.
- **Actions**: URL cell links to `/urls/:urlId` (or `/url?url=<encoded>` for compatibility).

### 4.2 URL Detail & Downloads (`/urls/:id`)
- **Queries**:
  - `urls` row (id, canonical, created/seen timestamps).
  - `fetches` filtered by `url_id`, ordered `fetched_at DESC`, limited (e.g., 200) with pagination for deep history.
  - `articles` join when article content exists (word counts, compression stats).
  - `content_storage` for compressed vs uncompressed byte counts.
- **Layout**:
  - Header card summarizing URL metadata + latest status.
  - Downloads table (date, HTTP status, transfer size, pipeline classification, storage id). Provide “View content metadata” button linking to static JSON download (no HTML body).
  - SVG sparkline showing fetch frequency over time (x-axis = time buckets, y-axis = fetch count). Implement `SparklineControl` in jsgui3 (renders `<svg>` with path + axes labels) to keep JS-free.
- **Navigation**: Back link to `/urls` with retained query params; breadcrumb `URLs ▸ example.com/page`.

### 4.3 Domain Activity (`/domains` & `/domains/:host`)
- **Overview**: Already surfaces top hosts; extend with filter controls (window size, limit) and cards for “Articles saved last 24h”, “Fetch success rate”.
- **Detail**: For a host, show:
  - Aggregated stats (total URLs, total fetches, first/last seen).
  - Latest URLs table (host-specific `selectUrlPage` variant).
  - SVG radial chart or stacked bar (via `jsgui.Control` + `<svg>`) to compare content types.

### 4.4 Crawl Jobs Timeline (`/crawls` & `/crawls/:id`)
- **List**: Current table plus inline badges for status/duration.
- **Detail**:
  - Timeline control combining `planner_stage_events` + `queue_events` counts.
  - Use `TimelineControl` (SVG or flex columns) to show each stage with start/end times, durations.
  - Table of milestones + problems.

### 4.5 Error Explorer (`/errors` & `/errors/:id`)
- **List**: Current log table with filter chips (host, kind, HTTP code).
- **Detail**: Expand message + structured `details` JSON, show associated URL + last fetch.
- **Visualization**: Add daily bar chart (SVG) summarizing error counts per host; clicking bar applies filter via query string.

### 4.6 Queue / Throughput Dashboard (`/queues`)
- **Data**: `src/db/sqlite/v1/queries/ui/queues.js` (queue stats + classification buckets).
- **UI**: Cards for depth, new-run seeds, processed counts; table per queue role; timeline of queue_events aggregated per minute (SVG area chart).

### 4.7 Storage & Compression (`/storage`)
- **Data**: `content_storage`, compression metrics from `CompressionAnalytics` helpers.
- **UI**: Cards for total compressed/uncompressed MB, average ratio; table of top N articles by bytes saved; optional scatter plot (SVG) comparing word count vs compressed size.

### 4.8 Gazetteer Coverage (`/gazetteer`)
- **Data**: `gazetteerPlace.js`, `gazetteerCountry.js` queries.
- **UI**: Table of countries with counts, filter by missing ADM1 coverage; optional mini choropleth using inline GeoJSON + `<svg>` (only top-level summary, no interactive map yet).

## 5. jsgui3 Control Strategy
- **Existing controls**: `TableControl`, `PagerButtonControl`, `String_Control`, `Blank_HTML_Document`.
- **New controls to add**:
  - `SparklineControl` – renders `<svg>` polyline from numeric series.
  - `TimelineControl` – stacked horizontal bars for crawl stages.
  - `BadgeControl` – formalize status chips (currently ad-hoc spans) for reuse.
  - `CardGridControl` – simplifies meta-card grids reused across pages.
  - `JsonBlockControl` – pretty-print JSON metadata server-side.
- **SVG rendering**: jsgui3 can emit `<svg>` elements directly. Provide helper utilities for scales (min/max → pixel). Keep styling inline or via `<style>` definitions.
- **Binding plugin**: keep optional; server renders all content, but `public/assets/ui-client.js` may enhance interactions (e.g., toggling JSON blocks). Document any required data attributes.

## 6. Express Integration Plan
1. **Router modules**: Split views into modules under `src/ui/server/routes/` (e.g., `urls.js`, `domains.js`). Each exports `register(app, deps)` for clarity.
2. **Data services**: Encapsulate DB reads per view (e.g., `src/ui/server/services/urlDetails.js`) so Express handlers stay slim and easier to test.
3. **Shared response helper**: Build `renderView(res, viewKey, payload)` that injects `navLinks`, page metadata, and optional breadcrumbs.
4. **Parameterized routes**: Use `/urls/:id` w/ validation. For legacy compatibility, accept `?url=` query fallback.
5. **Error handling**: Standard middleware already exists; extend to include request path + view key for easier logging.
6. **Testing**: Add supertest suites scoped to data explorer routes hitting an in-memory SQLite fixture.

## 7. Implementation Roadmap
1. **Phase 1 (done)**: Multi-view skeleton + nav tabs.
2. **Phase 2**: URL detail + download history.
   - Add `urlDetails.js` queries for fetch history (ordered DESC) + article metadata.
   - Implement sparkline control + detail page.
3. **Phase 3**: Domain detail & filters.
4. **Phase 4**: Crawl job detail timeline + error filtering.
5. **Phase 5**: Queue + storage dashboards (introduce new SVG controls).
6. **Phase 6**: Gazetteer coverage + optional map.
7. **Phase 7**: Polish (breadcrumbs, query param preservation, docs, tests).

## 8. Navigation Example – URL → Downloads Flow
1. User lands on `/urls?page=3&host=guardian.co.uk`.
2. Table displays rows 2001–3000; each URL cell is `<a href="/urls/12345?back=urls&page=3&host=guardian.co.uk">`.
3. `/urls/12345` handler:
   - Loads URL + latest fetch summary.
   - Queries `fetches` for `url_id=12345 ORDER BY fetched_at DESC LIMIT 200`.
   - Builds table with columns (Fetched At, HTTP, Bytes, Classification, Downloader PID, Storage ID) plus “View Content Metadata” buttons hitting `/urls/12345/fetches/:fetchId/meta` (JSON).
   - Header renders breadcrumb w/ `back` link.
4. Optional sub-tab “Downloads” vs “Articles” if we later add article snapshots.

## 9. Drilldown Specifications (Detail-first views)

_Each stack shows the path from overview lists into progressively richer detail screens. Every level inherits breadcrumbs/back parameters for quick navigation._

### 9.1 URL Drilldown Stack
1. **`/urls/:id` – Overview tab**
  - **Queries**: `urls` row, last `latest_fetch`, aggregated counts (total fetches, successful fetches, distinct statuses).
  - **UI**: Meta cards (created/seen timestamps, status mix), `SparklineControl` of fetch cadence, badges for canonical + redirect info.
  - **Navigation**: Tabs for “Downloads”, “Articles”, “Content”. Default tab = Downloads.
2. **`/urls/:id/downloads`**
  - **Queries**: `fetches` filtered by `url_id` ordered `fetched_at DESC` with pagination + row count query.
  - **UI**: Table columns (Fetched At, HTTP, Bytes transferred, Downloader PID, Result, Storage ID). Each row links to `/urls/:id/downloads/:fetchId`.
3. **`/urls/:id/downloads/:fetchId`**
  - **Queries**: Specific fetch row, `content_storage` entry (compressed/uncompressed bytes, encoding), associated article row if classification = article.
  - **UI**: Detail cards, JSON metadata block (headers, timings), download comparison chart (bar comparing compressed vs uncompressed). Provide link to raw file in storage if available.
4. **`/urls/:id/articles` (optional future)**
  - Focused on article extraction metadata (word count, title) + quick links to `articles` table.

### 9.2 Domain Drilldown Stack
1. **`/domains` overview**
  - Already in place; add filter form for window size + host search.
  - Top hosts table → each host name links to `/domains/:host`.
2. **`/domains/:host`**
  - **Queries**: host-level aggregated stats (counts, success rate), timeline of saved articles grouped per day, latest URLs for host (same query shape as `/urls` but filtered).
  - **UI**: Header cards, host-specific sparkline, table of recent URLs (linking back to `/urls/:id`). Add “Related fetch errors” widget linking to filtered `/errors?host=` view.
3. **`/domains/:host/crawls`**
  - Shows crawl jobs whose `args` or `url` reference that host. Useful for verifying coverage.

### 9.3 Crawl Drilldown Stack
1. **`/crawls` overview**
  - Table already planned; each job row links to `/crawls/:id`.
2. **`/crawls/:id`**
  - **Queries**: `crawl_jobs` row, `planner_stage_events`, `queue_events` aggregated per stage, `crawl_milestones`, `crawl_problems`.
  - **UI**: Timeline control showing stages with durations; cards for totals (downloads, articles saved). Milestone table with anchors to `queue_events` detail.
3. **`/crawls/:id/events`**
  - Paginated list of raw queue events (so operators can diagnose drop-offs). Provide filters by queue role + action.

### 9.4 Error Drilldown Stack
1. **`/errors` overview**
  - Table with filters (host/kind/date). Each row links to `/errors/:id`.
2. **`/errors/:id`**
  - **Queries**: Single error row + related URL record + last fetch row.
  - **UI**: JSON viewer for `details`, badges for HTTP code, link to `/urls/:id` for the affected URL, “Retry hints” section referencing queue eligibility logic.
3. **`/errors/summary/:host`**
  - Aggregated view of error types per host; hyperlink inserted into domain detail view.

### 9.5 Queue Drilldown Stack
1. **`/queues` overview**
  - Cards (depth, throughput). Table per queue.
2. **`/queues/:role`**
  - **Queries**: queue table filtered by role + aggregated queue_events.
  - **UI**: Trend chart of enqueue/dequeue counts, table of pending URLs; link each URL back to `/urls/:id`.
3. **`/queues/:role/events`**
  - Raw events timeline for debugging.

### 9.6 Storage/Compression Drilldown Stack
1. **`/storage` overview**
  - Cards for total bytes, scatter plot of compression ratios.
2. **`/storage/articles/:id`**
  - Shows article metadata, compression stats, storage file info; cross-links to `/urls/:id/downloads/:fetchId`.
3. **`/storage/compressors/:alg`**
  - Aggregated stats by compression algorithm to compare effectiveness.

### 9.7 Gazetteer Drilldown Stack
1. **`/gazetteer` overview**
  - Table by country; each row links to `/gazetteer/country/:code`.
2. **`/gazetteer/country/:code`**
  - **Queries**: aggregated place counts, missing ADM1s, last sync timestamp.
  - **UI**: Cards + table of regions; optional inline SVG map shading regions with missing coverage.
3. **`/gazetteer/place/:id`**
  - Detailed record (names, coordinates, linked articles), helpful for verifying matching quality.

### 9.8 Cross-view Drilldown Patterns
- Keep `back` query parameter so each detail page can render a “Return to previous list” button preserving filters.
- Provide breadcrumb arrays to `renderHtml` (future enhancement) to show `URLs ▸ example.com ▸ Downloads ▸ Fetch 9876`.
- Use consistent query param names (`page`, `limit`, `host`, `status`, `role`) to reduce cognitive load.

## 10. Open Questions & Follow-ups
- Decide whether to support search/filter forms (host/status) via GET query or dedicated filter controls (requires form + `PagerButtonControl` update).
- Determine acceptable SVG complexity for choropleths (may need caching if shapes heavy).
- Clarify whether `ui-client.js` should hydrate components for lightweight interactivity (collapsible JSON, copy buttons).
- Evaluate need for authentication before exposing these read-only views (maybe simple HTTP auth at Express layer).

## 11. Next Actions
1. Implement URL detail route + fetch history query helper.
2. Stub new jsgui controls (Sparkline, Badge, CardGrid) with snapshot tests.
3. Create Express router module skeleton + update session docs with progress.
4. Define SQLite fixtures for the upcoming supertest coverage.
5. Land `ui_cached_metrics` schema + worker wiring so home views read cached aggregates (cards show `Last updated` metadata by default).

## 12. Modular Implementation & DRY Strategy
- **Router registry**: `src/ui/server/routes/index.js` exports `registerAll(app, deps)` which iterates a list of `{ key, mountPath, handler }`. Each handler lives in `routes/<view>.js`, ensuring one file per high-level view and making it easy to lazy-load future modules.
- **Service layer**: Under `src/ui/server/services/`, group DB access by concept (`urlService`, `domainService`, etc.). Services expose pure functions returning plain JS objects (no Express/JSGUI coupling) so both routers and tests reuse the same logic.
- **View models**: Each router resolves data via services, then passes a normalized payload to a shared `renderView(viewKey, payload)` helper (in `src/ui/server/viewRenderer.js`). This helper injects nav links, breadcrumbs, and calls `renderHtml` with standardized metadata, avoiding copy/paste.
- **Shared controls**: Keep bespoke controls (Badge, CardGrid, Sparkline, Timeline, JsonBlock) under `src/ui/controls/`. Export them via `src/ui/controls/index.js` so table renderers or future pages can `require` them without deep paths. Provide CSS fragments via `render-url-table.js` or dedicated stylesheet builder so each control gets consistent styling.
- **CSS + theming**: Centralize palette/spacing tokens inside the existing `buildCss()` generator; expose helper functions to append control-specific styles instead of scattering style tags per view.
- **Navigation + breadcrumbs**: Introduce `buildBreadcrumbs([{ label, href }])` utility returning a jsgui control; routers simply pass arrays. This avoids repeated markup for breadcrumb lists.
- **Error handling/logging**: Wrap every router in `createViewHandler(viewKey, handlerFn)` which catches errors, logs `{ viewKey, path, params }`, and forwards to Express error middleware. Keeps consistent logging without repeating try/catch blocks.
- **Testing**: Each service gets unit tests (pure data). Each route gets supertest coverage using an in-memory SQLite fixture builder (`tests/ui/fixtures/buildUiDb.js`). Controls get snapshot tests using `jsgui3-html` render output to keep markup consistent.
- **Client enhancements**: `public/assets/ui-client.js` should look for data attributes (e.g., `[data-json-block]`) regardless of view; this keeps hydration logic DRY. Client bundle stays optional, so server-rendered HTML is complete on its own.
- **Configurable deps**: `createDataExplorerServer` continues to accept `options` (dbPath, title, pageSize). Extend to accept `services` overrides for testing (dependency injection), enabling mock DB layers without patching globals.
- **Aggregate metrics cache**: expose a dedicated `metricsService` that first checks `ui_cached_metrics` (populated by `scripts/ui/run-aggregate-worker.js`) for each stat. The service returns `{ value, generatedAt, maxAgeMs, stale }` so view models can attach freshness badges. When cache rows are missing or marked stale, the service may fall back to the live query but should log a warning; under load, we prefer stale-but-fast cards over blocking the response.

## 13. Data Structures & UI Surfaces (Overview)
| Data Structure | Source tables / queries | Primary UI views | Key controls / visuals |
| --- | --- | --- | --- |
| **URL records** | `urls`, `latest_fetch`, `urlListingNormalized` | `/urls`, `/urls/:id` | TableControl rows, meta cards, breadcrumbs |
| **Fetch/download history** | `fetches`, `content_storage`, `urlDetails` | `/urls/:id/downloads`, `/urls/:id/downloads/:fetchId` | Downloads table, JsonBlock, Sparkline (frequency), bar comparison of bytes |
| **Article metadata** | `articles`, `content_storage` | `/urls/:id/articles`, `/storage/articles/:id` | CardGrid, Badge (classification), link out to content metadata |
| **Domain aggregates** | `recentDomains`, `domainSummary`, host-filtered URL queries | `/domains`, `/domains/:host` | TableControl, sparkline, radial or bar chart for content mix |
| **Crawl jobs** | `crawl_jobs`, `crawl_types` | `/crawls` | Table with Badge status, duration chips |
| **Crawl timelines** | `planner_stage_events`, `queue_events`, `crawl_milestones`, `crawl_problems` | `/crawls/:id`, `/crawls/:id/events` | TimelineControl (SVG), milestone table, problem list |
| **Error log** | `errors` | `/errors`, `/errors/:id`, `/errors/summary/:host` | Table with filter chips, JsonBlock for details, daily bar chart |
| **Queue snapshots** | `ui/queues.js`, `queue_events` | `/queues`, `/queues/:role`, `/queues/:role/events` | CardGrid for depth/throughput, area chart, table per role |
| **Compression/storage** | `content_storage`, compression analytics helpers | `/storage`, `/storage/articles/:id`, `/storage/compressors/:alg` | Cards for total MB, scatter plot (SVG), table of top savings |
| **Gazetteer coverage** | `gazetteerPlace.js`, `gazetteerCountry.js` | `/gazetteer`, `/gazetteer/country/:code`, `/gazetteer/place/:id` | Table, optional SVG choropleth, detail cards |
| **Queue/seed planning** | `queue_events`, hub eligibility data | `/queues/:role`, `/domains/:host/crawls` | Timeline segments, status badges |
| **Telemetry snapshots** | Aggregated stats (downloads per minute, error rates) | Future dashboard page | Mixed controls: sparklines, cards, badges |

This table acts as a reference for which datasets will be surfaced and which controls/visuals they rely on, guiding future view additions.

## 14. Navigation & Drilldown Pattern Guide

| Pattern | Current usage | Extension playbook |
| --- | --- | --- |
| **Global nav + breadcrumbs** | `renderHtml` already injects persistent tabs (URLs, Domains, Crawls, Errors) and ad-hoc breadcrumb arrays. | Promote `buildBreadcrumbsNav` into a shared helper, pass `{ label, href }` arrays from every router, and expand the nav list to include Queues, Storage, and Gazetteer. New views inherit the same structure simply by registering their key + path in `DATA_VIEWS`. |
| **Row-to-detail linking** | URL rows link to `/urls/:id`; domain tables link to `/domains/:host`. Pager + link styles are standardized via `TableControl`. | Keep defining table schemas inside reusable subclasses (e.g., `UrlListingTableControl`). For new datasets (crawls, queues, storage) create analogous controls that export `buildColumns` + `buildRows`, ensuring every primary cell resolves to the appropriate drilldown route, preserving `back` params when available. |
| **Meta cards + sparkline teasers** | Meta grids summarize counts, limits, and cache freshness; sparkline cards visualize hourly fetch cadence. | Adopt the same card grid for domains, queues, and errors (swap labels/data services). When introducing new sparklines (e.g., errors per day), reuse `SparklineControl` with normalized series builders so operators instantly recognize the pattern. |
| **Service + control layering** | Express routes call dedicated query helpers, then pass normalized payloads to `renderHtml` + controls. | Continue creating service modules (e.g., `queueService`, `storageService`) that emit view models the controls expect. This keeps drilldown flows consistent: every new screen becomes “query via service → map through control helpers → render”, without bespoke markup. |
| **Back-link preservation** | Detail pages accept optional `back` query params and echo them inside breadcrumb links or “Return to list” buttons. | Standardize a `deriveBackLink(req)` helper and call it in each drilldown route. For deeper stacks (e.g., `/urls/:id/downloads/:fetchId`) cascade the same `back` token so operators can return to the original filtered table even after multiple clicks. |

**How to extend**
1. **Register the dataset**: Add an entry to `DATA_VIEWS` (or a sub-route definition) with `key`, `path`, `navLabel`, and a `render` function that orchestrates query + render steps.
2. **Reuse control subclasses**: Either import an existing table control (`UrlListingTableControl`) or define a sibling control (Queues, Storage) that exports both the control and its `buildRows` helper so scripts/tests stay consistent.
3. **Pass navigation context**: Supply `navLinks`, breadcrumbs, and `back` params whenever calling `renderHtml`. These props guarantee consistent navigation affordances without duplicating markup.
4. **Document the stack**: For each new drilldown, update this section with the path hierarchy and any custom controls so future contributors can follow the same breadcrumb-driven approach.

By leaning on these patterns, every new dataset can expose the same “overview → drilldown → raw detail” journey: list pages highlight key metrics, rows link into detail tabs, and operators can always step backward without re-entering filters.
