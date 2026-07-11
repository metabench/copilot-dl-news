# Remote Fetch Worker — local coordination, remote page downloads

Run the crawl planner/coordinator locally (queue, URL decisions, robots,
caching, storage into the local `data/news.db`) while the raw page downloads
are executed by a stateless fetch worker on a remote box (Oracle Cloud).

Nothing about the crawl's data flow changes: page bodies come back inline in
each fetch response and are persisted by the local `FetchPipeline` exactly as
local fetches are. There is no remote database and nothing to sync.

```
local machine (coordinator)                     remote box (muscle)
┌─────────────────────────────┐   POST /batch   ┌────────────────────┐
│ crawl planner + crawl_queue │ ──────────────► │ worker-server.js   │
│ FetchPipeline (fetchFn) ────┼───────────────► │  fetches pages,    │
│ link extraction, storage    │ ◄────────────── │  returns bodies    │
│ data/news.db                │  bodies inline  │  (no state, no DB) │
└─────────────────────────────┘                 └────────────────────┘
```

## Server side (the remote box)

The worker is `wip/labs/distributed-crawl/worker-server.js` — a single-file,
dependency-free Node HTTP server (Puppeteer optional). Endpoints: `POST /batch`
(fetch a batch, bodies as base64), `GET /meta`, `GET /health`, `GET /status.json`,
`GET /events` (SSE dashboard feed), `GET /demo`.

```bash
# on the remote box
node worker-server.js --port=8081 --host=0.0.0.0
```

Deployment helper: `tools/dev/remote-deploy.js` (scp + systemd install), e.g.

```bash
node tools/dev/remote-deploy.js --apply --app worker --host <oracle-ip> --user ubuntu \
  --service worker --install-systemd --restart --check-url http://<oracle-ip>:8081/health
```

Remember to open the port in the OCI security list and firewalld. The worker
has no auth — restrict the ingress rule to your own IP.

## Local side (enabling remote downloads)

Remote fetch is **off by default**. Enable per run:

```bash
# env switch (simplest)
CRAWL_REMOTE_FETCH=true WORKER_URL=http://<oracle-ip>:8081 node crawl.js ...

# or as a crawler option / shared override
node crawl.js ... --shared-overrides '{"remoteFetch":{"enabled":true,"workerUrl":"http://<oracle-ip>:8081"}}'
```

Worker address resolution (highest wins):
1. explicit `remoteFetch.workerUrl` option / `--worker-url`
2. `WORKER_URL` env
3. fleet host (`FLEET_HOST` env or `tools/crawl/.fleet-host` file) + port
   `REMOTE_FETCH_WORKER_PORT` (default 8081)

The same resolution now backs the place-hub guessing operation and
`tools/crawl/guess-place-hubs.js` (previously a hardcoded Oracle IP).

Behavior notes:
- If the worker is unreachable, fetches fall back to local automatically
  (`DISTRIBUTED_FALLBACK=false` to disable and fail instead).
- The worker follows redirects itself and reports the landing URL
  (`finalUrl` → `response.url`).
- Politeness/rate limiting stays local and per-host as before; the worker
  executes what it is sent.

Implementation: `src/core/crawler/adapters/remoteFetch.js` (fetchFn factory),
injected into `FetchPipeline` by `CrawlerServiceWiring.js` and
`services/groups/ProcessingServices.js`. Tests:
`src/core/crawler/adapters/__tests__/remoteFetch.test.js`.

## Dashboard / telemetry

Remote-fetch crawls report live telemetry through the standard crawl
telemetry pipeline, visible on the **crawl status page** (`/crawl-status` on
the main API server and in the unified app). A dedicated "Remote fetch"
strip appears under the throughput strip whenever a crawl is downloading
through a worker, showing: worker health (`●` healthy / `●!` unreachable /
`○` not yet contacted) and URL, remote requests OK/errors, MB transferred,
local fallbacks, and last fetch latency. The strip stays hidden for
local-fetch crawls.

Data flow (each hop has file-level docs):
`remoteFetch.js getTelemetry()` → `core/Crawler.emitProgress` (`remoteFetch`
field on progress events) → `CrawlTelemetryBridge` → `CrawlTelemetrySchema
.createProgressEvent` → SSE `/api/crawl-telemetry/events` →
`crawl-status-client.js renderRemoteFetch` → `CrawlStatusPage` strip.

The worker also has its own live view: `GET /status.json`, an SSE `/events`
feed and a `/demo` page served directly by `worker-server.js` — useful for
watching the Oracle box independently of any local crawl.

**Electron desktop app:** `start-crawler-app.cmd` opens the unified app
directly on the live crawl view (`--app crawl-status`) with concurrent jobs
enabled (`--allow-multi-jobs`). Jobs started from the in-app form or batch
launcher report live numbers: the job registry keeps a per-job `progress`
snapshot (counts, rates, queue, remoteFetch) fed by crawler progress events
(`src/server/crawl-api/v1/core/jobProgress.js`), so the jobs table and
throughput strip update via the 3s jobs poll while the remote-fetch strip
updates via SSE. Verify a running app with:
`node src/ui/server/unifiedApp/checks/crawlDisplay.check.js 3170`

Checks/tests: `src/ui/server/crawlStatus/checks/crawlStatusPage.remoteFetch.check.js`,
`src/core/crawler/telemetry/__tests__/remoteFetchTelemetry.test.js`,
`src/core/crawler/adapters/__tests__/remoteFetch.test.js`.

## Relationship to remote-crawler-v2

`deploy/remote-crawler-v2/` is the other model: a full crawler on the remote
box with its own DB, reconciled later via `/api/export/batch` +
`ingestRemoteCrawlV2Batch` (see `tools/crawl/crawl-remote.js`). Use that when
the remote node should crawl autonomously. Use the remote fetch worker (this
setup) when you want a single source of truth — the local news.db — and the
remote box acting purely as download muscle.
