# Working Notes – HTTP Record/Replay Harness + Decision Trace Milestones

- 2025-12-13 — Session created via CLI.

## Key code anchors found

### HTTP cache substrate (response bodies)
- `src/utils/HttpRequestResponseFacade.js`
	- Stores response bodies (compressed) in `content_storage` and cache metadata in `http_responses`.
	- Provides deterministic cache key generation via `generateCacheKey(url, request, metadata)`.

### Fetch telemetry (metadata-only)
- `src/utils/fetch/fetchRecorder.js`
	- `createFetchRecorder()` records fetch rows via `newsDb.insertFetch(fetchRow)` and optionally writes legacy rows.
	- Does not store response bodies; not sufficient for HTTP record/replay.

### Important mismatch to resolve
- Some callers appear to treat `HttpRequestResponseFacade` as an instance with instance methods, while the current module exports static methods.
	- Example call sites include gazetteer ingestors.
	- This must be resolved (either add an adapter wrapper or update call sites) before building record/replay on top.

## 2025-12-13 — Phase 0 Complete: Facade API Mismatch Resolved

Implemented **Option A (adapter wrapper)** from the plan:

### Changes Made

1. **Added `HttpRequestResponseFacadeInstance` class** (`src/utils/HttpRequestResponseFacade.js`)
   - Instance wrapper that accepts `{ db }` or raw db in constructor
   - Exposes instance methods: `cacheHttpResponse()`, `getCachedHttpResponse()`, `generateCacheKey()`
   - Delegates to static `HttpRequestResponseFacade` methods internally
   - Supports both call signatures: `(url, options)` and `({ url, ...options })`

2. **Updated callers to use instance wrapper**:
   - `src/tools/populate-gazetteer.js`: `new HttpRequestResponseFacadeInstance(raw)`
   - `src/crawler/gazetteer/ingestors/WikidataAdm1Ingestor.js`: `new HttpRequestResponseFacadeInstance(this.db)`
   - `src/crawler/gazetteer/ingestors/WikidataCountryIngestor.js`: `new HttpRequestResponseFacadeInstance({ db: this.db })`

### Rationale
- Minimal change footprint: callers keep their existing patterns
- Static methods remain available for other consumers
- Both constructor signatures (`db` or `{ db }`) are supported

## 2025-12-13 — Phase A Complete: HTTP Record/Replay Harness

Implemented the HTTP record/replay harness:

### New File: `src/utils/fetch/httpRecordReplay.js`

Features:
- **Three modes**: `live` (passthrough), `record` (capture), `replay` (deterministic)
- **Deterministic fixture keys**: Based on URL, method, query params, body hash
- **Security**: Redacts sensitive headers (Authorization, Cookie, etc.)
- **Binary support**: Base64 encoding for non-text responses
- **Namespacing**: Per-test fixture directories to avoid collisions
- **Fail-fast replay**: Throws if fixture missing (no silent network fallthrough)

API:
```javascript
const { createHttpRecordReplay } = require('./httpRecordReplay');

const harness = createHttpRecordReplay({
  mode: 'replay',
  fixtureDir: './tests/fixtures/http',
  namespace: 'my-test'
});

const response = await harness.fetch('https://api.example.com/data');
```

Utilities:
- `hasFixture(url, options)` — check if fixture exists
- `listFixtures()` — list all fixtures in namespace
- `clearFixtures()` — delete all fixtures in namespace
- `getFixturePath(url, options)` — get fixture file path

### Test File: `tests/crawler/httpRecordReplay.test.js`

Covers:
- Key generation consistency
- Header redaction
- Mode validation
- Replay from fixtures
- Base64 body handling
- Record mode capture
- Utility methods

## 2025-12-13 — Phase B Complete: Decision Trace Helper

Implemented standardized decision trace pipeline:

### New File: `src/crawler/decisionTraceHelper.js`

Features:
- **Standardized trace schema**: kind, message, details, scope, target, persist
- **Size enforcement**: Truncates oversized payloads to prevent DB bloat
- **Typed helpers**: hubFreshness, fetchPolicy, cacheFallback, rateLimit, skipReason
- **Integration**: Emits via existing `CrawlerEvents.emitMilestone()`
- **Opt-in persistence**: Only persists when `persist: true`

Standard decision kinds:
- `hub-freshness-decision`
- `fetch-policy-decision`
- `cache-fallback-decision`
- `rate-limit-decision`
- `skip-reason-decision`

API:
```javascript
const { createDecisionTraceEmitter } = require('./decisionTraceHelper');

const tracer = createDecisionTraceEmitter({
  events: crawlerEvents,
  source: 'hub-freshness',
  persistByDefault: false
});

tracer.hubFreshness({
  url: 'https://example.com/hub',
  effectiveMaxAge: 600000,
  refreshOnStartup: true,
  fallbackToCache: true
});
```

### Test File: `tests/crawler/decisionTraceHelper.test.js`

Covers:
- Trace normalization
- Kind validation
- Source injection
- Payload truncation
- Emitter creation
- Typed trace methods
- Persist flag handling
- No-op emitter for testing

## Next actions
- Run tests to validate implementations (pending shell access)
- Document `hubFreshness.persistDecisionTraces` in config docs
- Update SVG to reflect Phase A + B completion
