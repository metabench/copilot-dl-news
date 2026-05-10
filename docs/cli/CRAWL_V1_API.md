# Crawl v1 HTTP API — Quick Reference

> Endpoints exposed by `registerCrawlApiV1Routes` (mounted at `/api/v1/crawl` in the
> unified UI app). Source: [`src/server/crawl-api/v1/express/routes/operations.js`](../src/server/crawl-api/v1/express/routes/operations.js).
> In-process job runtime: [`src/server/crawl-api/v1/core/InProcessCrawlJobRegistry.js`](../src/server/crawl-api/v1/core/InProcessCrawlJobRegistry.js).

## Base URL

`/api/v1/crawl`

When the unified UI is mounted with `apiBasePath: '/api/v1/crawl'` (the current
default in `src/ui/server/unifiedApp/server.js`).

## Endpoints

### Discovery

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/availability?operations=true&sequences=true` | List operations + sequence presets the server can run |

Response shape:

```json
{
  "status": "ok",
  "availability": {
    "operations": [
      { "name": "basicArticleCrawl", "label": "Basic Article Crawl", "category": "article-crawl",
        "defaultOptions": { "crawlType": "basic", "useSitemap": true, "...": "..." },
        "optionSchema": { "crawlType": { "type": "enum", "options": [...] }, "...": "..." } }
    ],
    "sequences": [ /* presets */ ]
  }
}
```

### In-process jobs

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/jobs` | List in-process jobs (id, status, startUrl, timestamps) |
| `GET`  | `/jobs/:jobId` | Single job snapshot |
| `POST` | `/jobs/:jobId/pause` \| `/resume` \| `/stop` | Lifecycle control |
| `POST` | `/operations/:operationName/start` | **Start a new in-process crawl** (returns `running` immediately) |
| `POST` | `/operations/:operationName/run` | Synchronous run (blocks until complete) — avoid for large crawls |
| `POST` | `/sequences/presets/:sequenceName/run` | Run a preset sequence (synchronous) |
| `POST` | `/sequences/configs/:sequenceConfigName/run` | Run a sequence config (synchronous) |

### `POST /operations/:operationName/start`

Request body:

```json
{
  "startUrl": "https://www.example.com/",
  "overrides": {
    "maxPages": 1000,
    "maxDownloads": 1000,
    "maxDepth": 6
  }
}
```

Response (HTTP 200):

```json
{
  "status": "ok",
  "mode": "operation-job",
  "jobId": "31a58368-6b62-4fc0-8930-62f792754b3f",
  "job": {
    "id": "31a58368-6b62-4fc0-8930-62f792754b3f",
    "mode": "in-process",
    "operationName": "basicArticleCrawl",
    "startUrl": "https://www.example.com/",
    "status": "running",
    "createdAt": "2026-05-08T00:00:35.900Z",
    "startedAt": "2026-05-08T00:00:35.900Z",
    "finishedAt": null,
    "paused": false,
    "abortRequested": false
  }
}
```

By default the registry refuses a second concurrent job and returns HTTP 409.
Set the unified-app environment variable `UI_ALLOW_MULTI_JOBS=true` to allow
parallel jobs (each in its own crawler instance).

### Telemetry (separate prefix)

The runtime crawler progress (visited / downloaded / errors / queue) does NOT
appear in `GET /jobs/:jobId` today — see
[`docs/sessions/2026-05-08-batch-crawl-and-platform-awareness/CRAWLER_REVIEW.md`](../docs/sessions/2026-05-08-batch-crawl-and-platform-awareness/CRAWLER_REVIEW.md).

For live progress use the SSE / history endpoints in the same unified app:

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/api/crawl-telemetry/events` | Server-Sent Events: per-page download/queue events |
| `GET`  | `/api/crawl-telemetry/history` | Recent telemetry snapshots |

## Batch launcher

For starting many jobs in one command, prefer the CLI rather than scripting raw
`fetch` calls:

```powershell
# 10 sites × 1000 pages, parallel concurrency 5, retries 2
node tools/crawl/crawl-batch.js --preset news-10 --max-pages 1000 --json

# Equivalent named profile
npm run crawl -- news-10x1000

# Custom URL list
node tools/crawl/crawl-batch.js --urls-file my-urls.txt --operation siteExplorer --concurrency 4
```

The launcher does a pre-flight `GET /availability`, refuses to start if the
operation is unknown, retries transient failures, and exits with code `2` if any
job failed after retries (so it composes cleanly with shell pipelines and CI).

## Common operations (snapshot, May 2026)

| Operation | Category | When to pick it |
|-----------|----------|-----------------|
| `basicArticleCrawl` | article-crawl | Broad collection from any news site (default for batch CLI) |
| `siteExplorer` | discovery | Map site structure without committing to article downloads |
| `sitemapDiscovery` | discovery | Pull URLs straight from `sitemap.xml` |
| `sitemapOnly` | discovery | Sitemap fetch with no follow-up traversal |
| `findTopicHubs` / `findPlaceAndTopicHubs` / `guessPlaceHubs` | hub-discovery | Hub inference workflows |
| `ensureCountryHubs` / `exploreCountryHubs` | hub-management | Country-hub lifecycle |
| `crawlCountryHubHistory` / `crawlCountryHubsHistory` | content-refresh | Refresh hub histories |
| `hubArchiveCrawl` / `hubDepthProbe` | (uncategorised) | Hub archive / depth probes |

Discover the full list with `GET /availability` — the catalog is
schema-described, so future additions appear automatically.
