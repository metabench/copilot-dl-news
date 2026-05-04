# V5 Crawler Architecture Proposal

**Status:** Proposed  
**Intent:** Turn the repo's existing remote crawler, UI, export, and article-viewing assets into one remotely operated crawler application.

**Execution Plan:** `docs/plans/2026-03-v5-remote-crawler-application/`

## 1. Why V5 Exists

The current repo already has meaningful crawler application pieces:

- a remote multi-domain crawl server
- a CLI control layer
- a unified browser shell
- article browsing and reading UIs
- download evidence and export/sync APIs

What it does **not** have yet is a single coherent remote product that makes those pieces feel like one application.

That is the v5 goal.

## 2. Clarifying V2 vs V4 vs V5

### V2
`deploy/remote-crawler-v2/` is the strongest currently inspectable remote-server path in the repo. It already contains multi-domain control, export, replay, sync, SSE, dynamic domains, and recovery-oriented seams.

### V4
`v4` in repo docs refers to the broader distributed fleet/control-plane direction. In the current worktree, much of that story is either doc-only or absent, so it is not the best concrete base for an operator-facing remote application plan.

### V5
`v5` should be treated as the **applicationization layer**:
- keep the strongest existing crawl backend assets
- wrap them in a proper remote UI and API gateway
- make export/browse/read workflows first-class
- make the remote system feel like one tool, not a bag of scripts
- keep the operator webapp responsive by isolating crawl execution and heavy background work away from the UI/gateway event loop

## 3. Existing Assets V5 Should Reuse

| Existing asset | Reuse in v5 |
|---|---|
| `deploy/remote-crawler-v2/multi-domain-server.js` | Crawl runtime and control API base |
| `tools/crawl/crawl-remote.js` | CLI compatibility and automation path |
| `src/ui/server/unifiedApp/` | Browser shell / control center container |
| `src/ui/server/dataExplorerServer.js` | Data inspection, article list, domain drilldowns |
| `src/ui/server/articleViewer/server.js` | Clean article reading experience |
| `src/ui/server/crawlObserver/server.js` | Crawl event/task diagnostics |
| `src/services/CountryHubGapAnalyzer.js` | Place/country hub prediction and gap analysis base |
| `src/services/PlaceHubPatternLearningService.js` | Learned URL-pattern intelligence for place hubs |
| `placeHubGuessingUiQueries` / `topicHubGuessingUiQueries` | Existing UI-oriented query surface for hub guessing |
| Unified App downloads APIs | Download evidence and progress panels |

The v5 plan should prefer **composition** over replacement.

## 4. Target Operator Experience

The operator lands on one remote URL and gets one shell with these primary modules:

### 4.1 Control Room
- Start/stop crawls
- Seed URLs or choose saved profiles
- Set domain scope, max pages, time windows, concurrency caps
- Watch live state, errors, and throughput

### 4.2 Article Library
- Browse downloaded articles
- Filter by host, date range, classification, crawl run
- Open a clean article reader
- Jump from article to domain or crawl context

### 4.3 Bundle Manager
- Create export jobs for a time range or crawl run
- Track bundle job state
- Download completed bundles
- Inspect manifests and sizes before downloading

### 4.4 Monitoring
- Crawl events
- Error streams
- Queue/domain state
- Download evidence and throughput timelines

### 4.5 Settings / Access
- Operator login/session
- Saved crawl profiles
- Host/domain configuration
- Bundle retention and export policy

### 4.6 Discovery Intelligence
- Ask the system for likely place hubs and topic hubs before or during a crawl
- Review candidate hubs with evidence and current status
- Accept, reject, or defer hub candidates without leaving the main shell
- Launch or refine crawls from accepted hub candidates and saved hub-aware profiles

## 5. Proposed V5 Application Shape

## 5.1 Remote Gateway + Shell

Use the unified shell model as the main operator entrypoint.  
The shell should not directly talk to many unrelated backends.  
It should talk to one gateway layer that exposes:

- crawl control endpoints
- live event streams
- article/library endpoints
- bundle-job endpoints
- monitoring endpoints

This follows the repo's radial API ideas: one external surface, many internal modules.

The gateway/shell process should be treated as an **always-on web application**:

- long-lived on the remote host
- supervised by systemd/PM2/container restart policy
- optimized for low-latency status, article, and bundle-management requests
- not blocked by crawl execution or archive generation

## 5.2 Crawl Control Service

Start from `remote-crawler-v2` and harden it into the v5 crawl service:

- profile-driven crawl launch
- runtime domain add/remove
- bounded runs and long-running runs
- standardized health/status payloads
- clear restart/recovery semantics
- intelligent place/topic hub candidate generation tied to domains, runs, and saved profiles

The important point is: **do not begin v5 by rewriting the crawler engine.**

V5 should also make discovery intelligence a core behavior, not a side tool:

- reuse existing country/place hub analysis and pattern-learning services before inventing new logic
- expose place/topic hub candidates as reviewable crawl-planning objects in the UI and API
- persist candidate state such as `candidate`, `accepted`, `rejected`, and `verified`
- keep candidate reasoning/evidence visible so operators can steer crawls intentionally

The runtime model should be explicit:

- the UI/API process owns orchestration, contracts, auth, and live state publication
- crawl workers run outside the UI process, in a worker/process pool
- CPU-heavy or blocking work such as large archive creation, compression, and bulk export runs in background workers/jobs
- the main event loop stays free for fast operator interactions and live updates

## 5.3 Article Library and Reader

V5 should make downloaded content directly usable on the remote host.

Reuse:
- Data Explorer `/articles` and article drilldowns for browsing
- standalone Article Viewer patterns for clean reading

This makes the remote server more than a crawl box. It becomes a content workspace.

## 5.4 Bundle Job System

The current export APIs are good foundations, but large operator downloads should be **async jobs**, not just big response streams.

Recommended v5 bundle flow:

1. Operator creates a bundle job from UI or API.
2. Job resolves filter scope:
   - time range
   - domain set
   - crawl run
   - include/exclude raw HTML
3. Server writes bundle artifacts in background.
4. Operator sees progress, estimated size, row counts, and completion state.
5. Completed bundle becomes downloadable by authenticated URL.

Required operator guarantees:

- bundle manifests expose integrity metadata such as counts and checksums
- downloads are restart-safe from an operator workflow perspective, even if the underlying transport retries
- bundle jobs survive backend restart with visible resume/failure state

Recommended default bundle shape:

- `manifest.json`
- `articles.ndjson`
- `content/` payloads
- optional `raw-html/` or `extracted/` partitioning

Recommended archive format:

- default: `tar.zst` for large operator downloads
- compatibility export: `jsonl.gz` or replay-style gzip stream

This preserves current export work while making the operator workflow much better.

## 5.5 Local Sync / Federation

Local sync should remain supported, but it becomes a **secondary workflow**:

- remote browsing and export work directly on the remote host
- optional sync back to local `data/news.db` still exists
- future fleet/federation can layer on later

V5 should first succeed as a single remote application.

## 6. Storage Model

V5 should keep storage simple in the first serious version:

- primary crawl/content store on the remote host
- bundle manifests/jobs tracked on the remote host
- article browsing reads directly from the remote store
- optional sync/replication exports outwards

This is more practical than making v5 depend on a brand-new distributed storage migration before the product exists.

## 7. Deployment Model

### Phase 1 deployment recommendation
- one remote host
- one gateway/UI process
- one crawl runtime process group
- one content store
- authenticated reverse proxy in front

This phase should be **always-on by default**, not "run it when needed."  
Operators should be able to leave the application running on the remote host and come back to a live control surface.

### Later evolution
- remote worker pools
- split API shell from crawl workers
- stronger DB tier if needed
- background worker queue for bundle jobs and analysis jobs

The operator-facing product should come before full fleet abstraction.

## 8. Security Model

V5 must define an explicit remote access boundary. Minimum acceptable plan:

- authenticated operator access
- TLS or SSH-tunneled access
- no public unauthenticated crawl control endpoints
- audited bundle downloads
- clear retention policy for generated archives

Security is not optional once the app becomes remotely accessible by browser.

## 8.5 Responsiveness and Concurrency

V5 should explicitly optimize for operator responsiveness and crawl throughput at the same time.

Rules:

- the browser-facing webapp must stay responsive even during active crawls
- long-running crawls must not monopolize the main Node event loop
- large export bundles must be generated asynchronously
- status/event delivery must degrade gracefully under load
- backpressure and queue limits must exist for crawl starts, bundle jobs, and article queries

Default implementation direction:

- UI/gateway: one fast event-loop-oriented service
- crawl execution: worker processes or equivalent isolated execution pool
- bundle generation/compression: background job workers
- live updates: SSE or WS with bounded payload sizes and replay/history support

## 8.6 First-Class Product Requirements

The following are mandatory v5 requirements, not deferred aspirations:

- article browsing and reading are core operator workflows
- intelligent place and topic hub guessing are core crawl-planning workflows
- remote deployments must have an auth boundary before operator exposure
- crawl runs and bundle jobs must persist enough state to survive restart and support resume/cancel
- bundle downloads must expose integrity metadata and restart-safe retrieval behavior
- retention, quotas, and backpressure must protect the remote host from disk or queue exhaustion
- UI/API latency budgets must be explicit and enforced under active crawl and bundle load

## 9. Delivery Phases

### Phase A: Stabilize the reusable backend
- restore bootable remote runtime path
- normalize status/health/control payloads
- verify export/replay/sync endpoints
- restore or wrap reusable hub-intelligence services and candidate state persistence

### Phase B: Remote shell
- mount or adapt existing unified shell
- add Control Room, Discovery Intelligence, Monitoring, and Settings modules
- keep CLI compatibility

### Phase C: Library and Reader
- expose article browsing and reading directly in the remote shell
- reuse existing article list/viewer controls and routes

### Phase D: Bundle Jobs
- add bundle-job persistence
- background archive generation
- downloadable manifests and archives

### Phase E: Hardening
- auth
- reverse proxy
- deployment packaging
- bundle retention
- disk/queue safeguards
- operator audit/logging

## 10. Explicit Non-Goals

- Do not start with a greenfield rewrite of crawling internals.
- Do not require full fleet orchestration before shipping a usable remote application.
- Do not create a new monolithic admin UI when the unified shell, Data Explorer, and Article Viewer already exist.

## 11. Short Version

V5 should mean:

> One remote URL. One operator shell. Direct crawl control. Intelligent hub-guided discovery. Direct article browsing. Background bundle exports. Secure access. Reused internals.

That is the comprehensive remote crawler application the current repo is closest to becoming.
