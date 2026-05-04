# V5 Remote Crawler Application – Master Plan

**Status:** Active  
**Started:** 2026-03-08  
**Linked Long-Term Session:** `docs/sessions/long-term/lt-001-advanced-crawler-ui/`

## Objective
Deliver `v5` as the full remote crawler application: one remotely accessible system with browser-based control, intelligent crawl planning, article browsing/reading, bundle exports, monitoring, deployment, security, sync, and a serious test/perfection loop.

## North Star

An operator should be able to:

1. Open one remote URL.
2. Authenticate safely.
3. Start, stop, scope, and monitor crawls from the UI.
4. Use intelligent place/topic hub suggestions to guide and refine crawls.
5. Browse and read downloaded news on the remote server.
6. Create large compressed export bundles for a time range or crawl run.
7. Download those bundles reliably.
8. Still use CLI/API automation when needed.
9. Leave the remote application running continuously and return to a fast, responsive UI.

## What “V5 For All Of It” Means

This plan covers the whole remote crawler product surface, not just the crawl runtime:

- version boundary and subsystem layout
- crawl backend/runtime
- storage and data model
- API gateway/contracts
- operator UI shell
- intelligent crawl planning and hub discovery
- article library/reader
- bundle jobs and downloads
- monitoring/recovery
- deployment and security
- local sync/federation
- test/perf/reliability/perfection loop

## Reuse-First Rule

V5 should reuse and consolidate existing assets before replacing them:

- `deploy/remote-crawler-v2/`
- `tools/crawl/crawl-remote.js`
- `src/ui/server/unifiedApp/`
- `src/ui/server/dataExplorerServer.js`
- `src/ui/server/articleViewer/server.js`
- `src/ui/server/crawlObserver/server.js`
- `src/services/CountryHubGapAnalyzer.js`
- `src/services/PlaceHubPatternLearningService.js`
- existing place/topic hub guessing query/UI surfaces
- existing download evidence APIs and article controls

## Major Workstreams

### WS-1: V5 Boundary and Migration Envelope
Goal: create a clear v5 subsystem boundary so the new application can evolve without breaking older runtime paths.

Expected outcome:
- explicit v5 directories/namespaces
- compatibility adapters to old runtime pieces
- migration notes for what is reused vs replaced

### WS-2: Crawl Runtime and Remote Store
Goal: restore and harden a bootable remote crawl backend suitable for the v5 application.

Expected outcome:
- bootable runtime
- normalized health/status/control responses
- stable domain/run state model
- bundle-job persistence hooks
- place/topic hub candidate generation and persistence
- explicit separation between orchestration/event-loop responsibilities and crawl-worker execution responsibilities

### WS-3: Gateway and Contracts
Goal: provide one stable API surface for browser UI, CLI, and future integrations.

Expected outcome:
- one gateway namespace
- standardized contracts for control, status, events, hub suggestions, articles, bundles
- compatibility for existing CLI workflows where sensible
- fast-path endpoints and event delivery that remain responsive under crawl load

### WS-4: Operator Shell and Control Room
Goal: provide the main browser entrypoint for operators.

Expected outcome:
- unified shell
- crawl control panel
- hub-guess review and launch flows
- live progress and errors
- saved profile handling
- operator-safe actions
- UI responsiveness targets that are independent from crawl throughput

### WS-5: Article Library and Reader
Goal: make the remote crawler directly useful as a content workspace.

Expected outcome:
- article list/filter/search view
- article detail/reader view
- host/run/date drilldowns
- navigation from crawl runs to downloaded content

### WS-6: Bundle Jobs and Downloads
Goal: provide first-class export jobs for large remote datasets.

Expected outcome:
- async bundle creation
- manifest and retention metadata
- downloadable compressed archives
- integrity metadata and restart-safe download behavior
- bundle progress, failure, retry, and audit state
- archive generation fully off the request/response critical path

### WS-7: Monitoring, Recovery, and SRE Surfaces
Goal: give operators and future maintainers visibility into system state and failure handling.

Expected outcome:
- monitoring pages
- live event streams
- restart/recovery controls
- bundle job observability
- crawl anomaly visibility
- resource-pressure and backpressure visibility

### WS-8: Deployment, Security, and Access
Goal: make v5 remotely usable without exposing unsafe raw endpoints.

Expected outcome:
- auth boundary
- reverse proxy/TLS guidance
- process model and packaging
- remote-host deployment runbook
- always-on service supervision and restart policy
- no remotely exposed unauthenticated control surface

### WS-9: Sync, Federation, and External Consumption
Goal: keep local sync and external use cases compatible without making them the primary UI path.

Expected outcome:
- optional local sync path
- bundle-based offline import path
- future fleet/federation seams

### WS-10: Testing, Performance, and Perfection
Goal: make v5 testable, measurable, and improvable after the first implementation lands.

Expected outcome:
- focused unit/integration/UI/smoke suites
- performance budgets
- recovery drills
- operator polish backlog
- hub-guessing regression coverage
- responsiveness budgets for UI/API under active crawl and bundle load

## Delivery Phases

### Phase 0 – Planning Complete
- v5 concept doc
- execution plan set
- long-term anchor

### Phase 1 – Backend Alpha
- bootable runtime
- gateway skeleton
- baseline contracts
- minimal tests
- process model chosen for keeping the UI/gateway event loop responsive

### Phase 2 – Operator UI Alpha
- shell
- control room
- monitoring basics
- article list/reader
- always-on remote host workflow proven

### Phase 3 – Bundle Export Beta
- bundle jobs
- manifests
- remote downloads
- retention policy

### Phase 4 – Hardened Remote Product
- auth
- deploy packaging
- smoke environment
- recovery validation
- performance tuning

## Recommended Implementation Order

1. WS-1 boundary
2. WS-2 runtime
3. WS-3 gateway
4. WS-4 operator shell
5. WS-5 article library
6. WS-6 bundle jobs
7. WS-7 monitoring/recovery
8. WS-8 deployment/security
9. WS-9 sync/federation
10. WS-10 perfection loop

## Explicit Non-Goals

- Do not start with a greenfield crawler rewrite.
- Do not wait for full fleet orchestration before shipping a usable single-host remote application.
- Do not build a brand-new monolithic admin UI when reusable shell/article/monitoring assets already exist.

## First-Class Requirements Promoted In This Pass

- Article browsing/reading is a core workflow, not an optional adjunct.
- Intelligent place/topic hub guessing is a core workflow, not analyst-only tooling.
- Remote auth is a launch-blocking requirement, not a polish item.
- Crawl runs and bundle jobs must survive restart with clear resume/cancel semantics.
- Bundle downloads must expose integrity metadata and operator-safe retry behavior.
- Retention, quotas, and backpressure must protect the host from runaway crawl or export pressure.
- Responsiveness budgets must be explicit enough to verify under real load.

## Human Review Questions

Recommended defaults, pending human confirmation:

1. Phase-1 deployment target: single remote host first.
2. Default large-bundle format: `tar.zst`.
3. Security posture: authenticated reverse proxy in front of the v5 app.
4. Primary browsing experience: integrated shell, with standalone reader compatibility.
5. Default concurrency model: UI/gateway kept separate from crawl workers and bundle workers.
