# AGENTS.md — Server & Crawler Modularisation Plan

_Last updated: 2025-10-03_

This document exists solely to keep every change aligned with the ongoing refactor that pulls HTML rendering and database access out of `src/ui/express/server.js` and `src/crawl.js`. Anything that does not help that priority belongs in the RUNBOOK, ROADMAP, or in module-specific docs instead.

## North Star

- `server.js` should be a slim composition root: import route factories, mount them, wire shared helpers, and leave HTML/SQL elsewhere.
- `crawl.js` should be an orchestrator: coordinate specialised crawler modules instead of implementing networking, parsing, and persistence inline.
- Every new behaviour lands in a focused module (router, view, data helper, crawler subsystem) with accompanying tests.

## Current Baseline

- **Architectural Foundation**: Centralized HTML utilities (`utils/html.js`) and component library (`components/base.js`) established, inspired by jsgui3 patterns. See `docs/HTML_COMPOSITION_ARCHITECTURE.md` for full design guide.
- **Complete Migration**: ALL route and view files now use centralized utilities and components (eliminating ~250 lines of duplicate code).
  - **Route files migrated**: `routes/ssr.milestones.js`, `routes/ssr.queues.js`, `routes/ssr.analysis.js`, `routes/ssr.gazetteer.country.js`, `routes/ssr.gazetteer.js`, `routes/ssr.gazetteer.place.js` now use `createRenderContext` and `errorPage` component.
  - **View files migrated**: `views/milestonesPage.js`, `views/problemsPage.js`, `views/queueDetailPage.js`, `views/queuesListPage.js`, `views/analysisListPage.js`, `views/analysisDetailPage.js`, `views/problems.js` now import from centralized utilities and use `pill` component for status badges.
- **Database adapters**: `src/db/index.js` now exposes an adapter registry with SQLite registered by default (`src/db/sqlite/` hosts `NewsDatabase`, `ensureDb`, and related helpers), unlocking future Postgres/compression backends without touching callers.
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

## Maintaining This Document

- Update "Current Baseline" whenever a route or crawler subsystem is extracted.
- Resist reintroducing encyclopaedic detail—link to specialised docs if deeper context is needed.