# AGENTS.md — Server & Crawler Modularisation Plan

_Last updated: 2025-01-05_

This document exists solely to keep every change aligned with the ongoing refactor that pulls HTML rendering and database access out of `src/ui/express/server.js` and `src/crawl.js`. Anything that does not help that priority belongs in the RUNBOOK, ROADMAP, or in module-specific docs instead.

## North Star

- `server.js` should be a slim composition root: import route factories, mount them, wire shared helpers, and leave HTML/SQL elsewhere.
- `crawl.js` should be an orchestrator: coordinate specialised crawler modules instead of implementing networking, parsing, and persistence inline.
- Every new behaviour lands in a focused module (router, view, data helper, crawler subsystem) with accompanying tests.

## Current Baseline

- **Client Application Modularization (COMPLETE)**: `src/ui/public/index.js` reduced from 2,073 lines to **512 lines (75% reduction)**. All functionality extracted to 11 focused modules under `src/ui/public/index/`:
  - `renderingHelpers.js` (~400 lines) - Pure functions for DOM rendering, formatters
  - `sseHandlers.js` (558 lines) - 10 SSE event handlers
  - `crawlControls.js` (443 lines) - 6 button click handlers
  - `jobsAndResumeManager.js` (568 lines) - Jobs rendering, resume queue management
  - `advancedFeaturesPanel.js` (156 lines) - Feature flags, priority bonuses/weights
  - `analysisHandlers.js` (505 lines) - Analysis & planner event handlers
  - `initialization.js` (382 lines) - App initialization (logs, theme, health strip)
  - `formatters.js` (~200 lines) - Number, date, time formatting utilities
  - `statusIndicators.js` (~150 lines) - Stage & status badge updates
  - `app.js` (~800 lines) - Pipeline, insights, patterns state management
  - `metricsView.js` (~600 lines) - Metrics rendering & real-time updates
  - **Architecture**: Zero globals, dependency injection throughout, lang-tools patterns (`each()`, `is_defined()`)
  - **Testing**: All 409 tests pass, zero regressions
  - **Documentation**: See `PHASE_6_ASSESSMENT.md` for full analysis
- **Architectural Foundation**: Centralized HTML utilities (`utils/html.js`) and component library (`components/base.js`) established, inspired by jsgui3 patterns. See `docs/HTML_COMPOSITION_ARCHITECTURE.md` for full design guide.
- **Complete Migration**: ALL route and view files now use centralized utilities and components (eliminating ~250 lines of duplicate code).
  - **Route files migrated**: `routes/ssr.milestones.js`, `routes/ssr.queues.js`, `routes/ssr.analysis.js`, `routes/ssr.gazetteer.country.js`, `routes/ssr.gazetteer.js`, `routes/ssr.gazetteer.place.js` now use `createRenderContext` and `errorPage` component.
  - **Route files migrated**: `routes/ssr.milestones.js`, `routes/ssr.queues.js`, `routes/ssr.analysis.js`, `routes/ssr.gazetteer.country.js`, `routes/ssr.gazetteer.js`, `routes/ssr.gazetteer.place.js`, `routes/ssr.bootstrapDb.js` now use `createRenderContext` and `errorPage` component.
  - **View files migrated**: `views/milestonesPage.js`, `views/problemsPage.js`, `views/queueDetailPage.js`, `views/queuesListPage.js`, `views/analysisListPage.js`, `views/analysisDetailPage.js`, `views/problems.js`, `views/bootstrapDbPage.js` now import from centralized utilities for navigation and HTML composition, keeping SSR markup consistent.
- **Database adapters**: `src/db/index.js` now exposes an adapter registry with SQLite registered by default (`src/db/sqlite/` hosts `NewsDatabase`, `ensureDb`, and related helpers), unlocking future Postgres/compression backends without touching callers.
- **SQL modularization**: New gazetteer components follow strict SQL separation:
  - Query modules: `src/db/sqlite/queries/gazetteer.progress.js` (stage tracking), `src/db/sqlite/queries/gazetteer.ingest.js` (place/name upserts with prepared statements)
  - Data helpers: `src/ui/express/data/gazetteerProgressData.js` (aggregates progress and counts for endpoints)
  - Refactored components: `GazetteerPriorityScheduler`, `WikidataCountryIngestor`, `api.gazetteer.progress.js`, `ssr.gazetteer.progress.js` now use data layer instead of inline SQL
- Extracted server surfaces: `routes/api.recent-domains.js`, `routes/api.domain-summary.js`, `routes/api.gazetteer.js`, `routes/api.gazetteer.places.js`, `routes/api.gazetteer.place.js`, `routes/api.crawl.js`, `routes/ssr.queues.js`, `routes/ssr.milestones.js`, `routes/ssr.gazetteer.places.js`, `routes/ssr.gazetteer.kind.js`, `routes/ssr.analysis.js`.
- Dedicated gazetteer data helpers now cover list/detail lookups: `data/gazetteerPlaces.js`, `data/gazetteerPlace.js`.
- Crawler helpers already exist under `src/crawler/` (limiter, sitemap, urlPolicy, etc.); remaining inline logic in `crawl.js` should migrate into that directory.
- Queue orchestration extracted to `src/crawler/QueueManager.js`, with `crawl.js` delegating enqueue/dequeue behaviour.
- Fetch execution extracted to `src/crawler/FetchPipeline.js`, with `crawl.js` delegating cache checks, network fetches, and retry metadata.
- Page execution pipeline extracted to `src/crawler/PageExecutionService.js`, with `crawl.js` delegating fetch results, article processing, and link scheduling.
- URL eligibility rules extracted to `src/crawler/UrlEligibilityService.js`, with `QueueManager` delegating normalization, robots checks, and known-article promotion.
- URL decision persistence, error/outcome tracking, and domain throttling now live in `src/crawler/UrlDecisionService.js`, `src/crawler/ErrorTracker.js`, and `src/crawler/DomainThrottleManager.js`, each covered by dedicated tests.
- Worker loop orchestration extracted to `src/crawler/WorkerRunner.js`, with `crawl.js` delegating worker lifecycle management.
- Robots and sitemap ingestion extracted to `src/crawler/RobotsAndSitemapCoordinator.js`, keeping startup loading logic out of `crawl.js`.
- Enhanced features lifecycle managed by `src/crawler/EnhancedFeaturesManager.js`, handling optional services and priority scoring.
- Intelligent planner pipeline extracted to `src/crawler/IntelligentPlanRunner.js`, with `crawl.js` delegating intelligent planning stages.
- Seeded hub lifecycle now tracked via metadata: `CrawlerState` records seeded and visited hubs, `HubSeeder` annotates country candidates with priority boosts, and `PageExecutionService` emits milestones when country hubs are successfully fetched.

If you touch a route or crawler pathway that is still inline, schedule an extraction before expanding its behaviour.

## Refactor Playbook — `server.js`

1. **Identify a surface**: inline Express handler, HTML string, or raw SQL in `server.js`.
2. **Create modules**:
   - `data/*.js` for database queries (accepting `db` handles; no direct `require('../../db')`).
   - `views/*.js` for SSR HTML markup (pure functions returning strings, deterministic for Jest).
   - `routes/*.js` router factory that composes the two and accepts its dependencies from `server.js`.
3. **Mount**: Import the new router in `server.js`, remove the legacy handler, and wire dependencies explicitly.
4. **Test**: Add or update Jest coverage under `src/ui/express/__tests__/` or `ui/__tests__/`.
5. **Document**: Amend "Current Baseline" when a surface is fully extracted.

## Refactor Playbook — `crawl.js`

1. **Locate cohesive blocks** (fetch scheduling, content parsing, planner stages, persistence writes).
2. **Extract to `src/crawler/`** modules (for example `QueueRunner`, `FetchCoordinator`, `OutputPersister`).
3. **Inject dependencies** from `crawl.js` rather than importing globals inside helpers; this keeps logic testable.
4. **Emit telemetry outside** the helper (SSE/events/logs stay in the orchestrator).
5. **Cover with tests** under `src/crawler/__tests__/` or integration suites that exercise the new module.

## Module Contracts

- **Routes** receive dependencies explicitly: `{ getDbRO, getDbRW, renderNav, startTrace, urlsDbPath, ... }`.
- **Data helpers** accept a ready database handle/path and do not manage connections themselves.
- **Views** are pure functions that return HTML strings.
- **Crawler helpers** take configuration objects; they do not read `process.env` directly.

## SQL Modularization Guidelines

**Critical Rule**: NO inline SQL in routes, controllers, services, or orchestrators.

### SQL Query Placement

1. **SQLite-specific queries** belong in `src/db/sqlite/queries/`:
   - Create focused modules by feature: `gazetteer.progress.js`, `gazetteer.ingest.js`, `articles.js`, `urls.js`, etc.
   - Export pure functions that accept a database handle and return results
   - Build prepared statements in factory functions when needed for performance
   - Example:
     ```javascript
     // src/db/sqlite/queries/gazetteer.progress.js
     function getStageState(db, stageName) {
       return db.prepare(`
         SELECT * FROM gazetteer_crawl_state 
         WHERE stage = ? 
         ORDER BY id DESC LIMIT 1
       `).get(stageName);
     }
     module.exports = { getStageState, ... };
     ```

2. **UI data helpers** belong in `src/ui/express/data/`:
   - Aggregate multiple query functions for specific endpoints
   - Transform database results into UI-friendly formats
   - Accept both database handle and other dependencies (schedulers, services)
   - Example:
     ```javascript
     // src/ui/express/data/gazetteerProgressData.js
     const progressQueries = require('../../../db/sqlite/queries/gazetteer.progress');
     function getProgressSummary(db, scheduler) {
       const stages = progressQueries.getAllStageStates(db);
       const counts = progressQueries.getPlaceCountsByKind(db);
       return { stages, counts, ... };
     }
     module.exports = { getProgressSummary };
     ```

3. **Routes** consume data helpers:
   - Never write SQL directly in route handlers
   - Import from `data/` layer
   - Focus on HTTP concerns (validation, response formatting, error handling)
   - Example:
     ```javascript
     // routes/api.gazetteer.progress.js
     const progressData = require('../data/gazetteerProgressData');
     router.get('/api/gazetteer/progress', (req, res) => {
       const db = getDbRO();
       const summary = progressData.getProgressSummary(db, scheduler);
       res.json(summary);
     });
     ```

### Benefits of This Architecture

- **Testability**: Query functions can be unit tested with in-memory databases
- **Reusability**: Multiple routes can share the same query logic
- **Database abstraction**: Switching from SQLite to Postgres only requires rewriting query modules
- **Readability**: Routes focus on HTTP, not SQL syntax
- **Type safety**: Query results are documented in one place

### Migration Checklist

When extracting inline SQL:
1. Create or extend a module in `src/db/sqlite/queries/`
2. Export pure query functions
3. Create or extend a data helper in `src/ui/express/data/` if aggregation is needed
4. Update routes to import and use the data layer
5. Remove all inline SQL statements
6. Test the extraction doesn't break functionality

## Definition of Done for an Extraction

- Legacy code removed from `server.js` or `crawl.js`.
- Dedicated module(s) added with unit tests.
- Related SSR/API tests updated to cover the new path.
- "Current Baseline" revised if the extraction adds or retires a surface.

## Working Agreement

- New features start life as extracted modules—do not add fresh HTML or SQL to `server.js` or `crawl.js`.
- If a hotfix must land inline, open a follow-up issue and reference it in the diff.
- When removing or reshaping blocks in `server.js` or `crawl.js`, confirm the file still parses (matching braces, exports, and returns) and run a quick syntax/test check. If a syntax error surfaces, inspect the diff or reported location to understand and fix it before reaching for `git checkout` or other revert commands.
- Favor small, surgical edits when extracting handlers: anchor patches around precise line ranges, maintain a written checklist of remaining inline surfaces, and step through each removal cautiously to avoid reintroducing regressions.
- Keep commits reviewable: aim for one extraction per commit whenever possible.
- For UI state management, pattern discovery logic, or supporting utilities, reference the implementation patterns at:
  * **jsgui3-html**: https://github.com/metabench/jsgui3-html (Control-based component composition, data binding, isomorphic rendering)
  * **jsgui3-server**: https://github.com/metabench/jsgui3-server (Server-side rendering patterns, Active_HTML_Document base class, context management)
  * Copying code patterns from those projects—and adapting them to suit this codebase's SSR needs—is explicitly allowed and encouraged when it accelerates progress or aligns implementations.

## UI Review Pipeline — Responsive Screenshots

Agents must keep crawler UI enhancements grounded in real rendering evidence. Before proposing layout or presentation changes:

1. **Generate screenshots across key breakpoints.** Run `npm run ui:capture-screens` from the repo root. The tool will spin up the Express UI in fast-start mode (or reuse an existing server when `--url` is provided) and capture the crawler dashboard for eleven devices ranging from compact phones (portrait and landscape) through tablets to ultrawide desktops (both orientations). Override the output location or target path with flags such as `--output=custom/dir`, `--label=my-review`, or `--path=/urls` when needed. Use `--views=` to restrict to specific devices (for example `--views=mobile-large-portrait,ultrawide-landscape`), or pass `--tooling` to automatically capture the tooling surfaces with those two focus viewports.
2. **Review the saved artefacts.** Outputs live under `screenshots/crawler/<timestamp>/` with a `metadata.json` manifest describing each viewport. Open every PNG in that set—especially the smallest and largest form factors—and note crowding, truncation, or wasted space. Cross-reference existing instructions in this document and open issues to prioritise the biggest usability wins.
3. **Capture insights and follow-ups.** Record concrete improvement ideas (for example spacing adjustments, font scaling, control regrouping, or dark-mode gaps) in the relevant design or implementation notes before editing code. Tie each suggestion to the screenshot filename(s) that revealed the issue so reviewers can reproduce the observation.
4. **Iterate and repeat.** After landing UI changes, rerun the screenshot tool to confirm the fixes hold across the responsive matrix. Include before/after comparisons in PR discussions when the visuals materially change.

Agents skipping these steps should expect review pushback—responsive evidence is now part of the definition of done for crawler UI polish.

## Detached Server Mode — Testing UI Features Without Terminal Blocking

**Problem**: AI agents frequently need to test UI features by starting the Express server, making API calls, and verifying responses. However, running `node src/ui/express/server.js` blocks the terminal and captures SIGINT, causing the server to shut down when subsequent commands are executed.

**Solution**: The server now supports a `--detached` mode that runs without blocking the terminal and optionally auto-shuts down after a specified time.

### Command-Line Options

- `--detached`: Run the server without attaching signal handlers (SIGINT/SIGTERM), allowing the terminal to be released for other commands.
- `--auto-shutdown <milliseconds>`: Automatically shut down the server after the specified duration in milliseconds.
- `--auto-shutdown-seconds <seconds>`: Automatically shut down the server after the specified duration in seconds (convenience alias).

### Usage Examples

**1. Start server in detached mode with 60-second auto-shutdown (recommended for agents):**
```bash
node src/ui/express/server.js --detached --auto-shutdown-seconds 60 &
```

The `&` at the end (on Unix/Linux/macOS) or using `Start-Process` on Windows ensures the process runs in the background.

**2. PowerShell background execution with auto-shutdown:**
```powershell
Start-Process node -ArgumentList "src/ui/express/server.js","--detached","--auto-shutdown-seconds","60" -WindowStyle Hidden
```

**3. Testing workflow for agents:**
```bash
# Start server in detached mode with 1-minute timeout
node src/ui/express/server.js --detached --auto-shutdown-seconds 60 &

# Wait for server to start (1-2 seconds typically sufficient)
sleep 2

# Make API calls or test UI features
curl -X POST http://localhost:41000/api/benchmarks -H "Content-Type: application/json" -d '{"iterations": 3}'

# Check results
curl http://localhost:41000/api/benchmarks

# Server will automatically shut down after 60 seconds
```

**4. Detached mode without auto-shutdown (manual cleanup required):**
```bash
node src/ui/express/server.js --detached &
# Remember to manually kill the process when done
```

### Agent Guidelines

When testing UI features, benchmarks, or API endpoints:

1. **Always use detached mode with auto-shutdown** to prevent terminal blocking and ensure cleanup:
   ```bash
   node src/ui/express/server.js --detached --auto-shutdown-seconds 60 &
   ```

2. **Wait briefly after starting** the server (1-3 seconds) to allow it to initialize before making requests.

3. **Use the 60-second timeout** for typical testing workflows. Adjust if your test suite requires more time.

4. **Prefer `Start-Process` on Windows** to avoid terminal blocking:
   ```powershell
   Start-Process node -ArgumentList "src/ui/express/server.js","--detached","--auto-shutdown-seconds","60" -WindowStyle Hidden
   ```

5. **Check server logs** by capturing output if needed:
   ```bash
   node src/ui/express/server.js --detached --auto-shutdown-seconds 60 > server.log 2>&1 &
   tail -f server.log
   ```

6. **Verify the server is running** before making requests:
   ```bash
   curl -f http://localhost:41000/metrics || echo "Server not ready yet"
   ```

### Port Detection

The server automatically searches for available ports starting from `$PORT` (or 41000-61000 range). Check the startup logs to see which port was selected:
```
GUI server listening on http://localhost:41000
```

### When NOT to Use Detached Mode

- **Interactive debugging**: When you need to see real-time logs and want manual shutdown control.
- **Long-running development**: When developing UI features and need the server to stay up indefinitely.
- **Production deployments**: Use proper process managers (pm2, systemd, etc.) instead of detached mode.

## Maintaining This Document

- Update "Current Baseline" whenever a route or crawler subsystem is extracted.
- Resist reintroducing encyclopaedic detail—link to specialised docs if deeper context is needed.