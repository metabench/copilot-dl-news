# Telemetry Contract (Crawler Events)

## Boundary
Crawler implementations emit telemetry through the normalized crawler telemetry module:
- `src/crawler/telemetry/`

This boundary exists so:
- any crawler can drive a UI
- UI consumers can rely on stable event shapes

## Contract

### Required event fields
Crawler telemetry events must include:
- `type`: string (e.g. `crawl:started`)
- `jobId`: string
- `id`: string (unique event id)
- `timestamp`: ISO timestamp
- `timestampMs`: number
- `severity`: `debug` | `info` | `warn` | `error`
- `data`: object (type-specific payload)

### Canonical event types
See `CRAWL_EVENT_TYPES` in `src/crawler/telemetry/CrawlTelemetrySchema.js`.
Examples include:
- lifecycle: `crawl:started`, `crawl:stopped`, `crawl:paused`, `crawl:resumed`
- progress: `crawl:progress`, `crawl:phase:changed`
- url: `crawl:url:visited`, `crawl:url:error`
- goals/budgets/workers: `crawl:goal:satisfied`, `crawl:budget:updated`, `crawl:worker:scaled`

### Bridge semantics
`CrawlTelemetryBridge` provides:
- event normalization (factories)
- batching for high-frequency events
- bounded history for late-joining clients

## Invariants
- Consumers can treat `type` as the stable discriminator.
- The schema must remain JSON-serializable end-to-end (SSE friendly).
- Batching must not reorder events across types in surprising ways (progress should remain monotonic per job).

## Enforcement
- Jest contract suite: `tests/crawler/telemetry/telemetry.test.js`

## Change protocol
If you add or change event types:
1. Update `CRAWL_EVENT_TYPES` and event factories.
2. Update `tests/crawler/telemetry/telemetry.test.js` to lock the new shape.
3. If you break existing consumers, add a compatibility shim or version the schema.
