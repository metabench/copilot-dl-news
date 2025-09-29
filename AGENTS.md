# AGENTS.md — Server & Crawler Modularisation Plan

_Last updated: 2025-10-01_

This document exists solely to keep every change aligned with the ongoing refactor that pulls HTML rendering and database access out of `src/ui/express/server.js` and `src/crawl.js`. Anything that does not help that priority belongs in the RUNBOOK, ROADMAP, or in module-specific docs instead.

## North Star

- `server.js` should be a slim composition root: import route factories, mount them, wire shared helpers, and leave HTML/SQL elsewhere.
- `crawl.js` should be an orchestrator: coordinate specialised crawler modules instead of implementing networking, parsing, and persistence inline.
- Every new behaviour lands in a focused module (router, view, data helper, crawler subsystem) with accompanying tests.

## Current Baseline

- Extracted server surfaces: `routes/api.recent-domains.js`, `routes/api.domain-summary.js`, `routes/api.gazetteer.js`, `routes/api.gazetteer.places.js`, `routes/api.gazetteer.place.js`, `routes/api.crawl.js`, `routes/ssr.queues.js`, `routes/ssr.milestones.js`, `routes/ssr.gazetteer.places.js`, `routes/ssr.gazetteer.kind.js`, `routes/ssr.analysis.js`.
- Dedicated gazetteer data helpers now cover list/detail lookups: `data/gazetteerPlaces.js`, `data/gazetteerPlace.js`.
- Crawler helpers already exist under `src/crawler/` (limiter, sitemap, urlPolicy, etc.); remaining inline logic in `crawl.js` should migrate into that directory.
- Queue orchestration extracted to `src/crawler/QueueManager.js`, with `crawl.js` delegating enqueue/dequeue behaviour.
- Fetch execution extracted to `src/crawler/FetchPipeline.js`, with `crawl.js` delegating cache checks, network fetches, and retry metadata.
- URL eligibility rules extracted to `src/crawler/UrlEligibilityService.js`, with `QueueManager` delegating normalization, robots checks, and known-article promotion.

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

## Maintaining This Document

- Update "Current Baseline" whenever a route or crawler subsystem is extracted.
- Resist reintroducing encyclopaedic detail—link to specialised docs if deeper context is needed.