# Working Notes

## Discovery

### Slow `/domains` Route Analysis

The `renderDomainSummaryView` function in `dataExplorerServer.js` is slow because:

1. `buildDomainSnapshot()` - Gets top domains from cache or live query (reasonably fast)
2. **N+1 Problem**: For each domain (~50), it runs:
   - `getArticleCount(db, normalizedHost)` - Complex JOIN query
   - `getFetchCountForHost(db, normalizedHost)` - Another JOIN query

Each query involves JOINs across `http_responses`, `urls`, `content_storage`, `content_analysis` tables.

```javascript
// Current slow code:
const entries = snapshot.hosts.map((domain) => {
  const normalizedHost = domain.host ? toLowerHost(domain.host) : null;
  return {
    host: domain.host || null,
    windowArticles: domain.articleCount || 0,
    allArticles: normalizedHost ? getArticleCount(db, normalizedHost) : 0,  // SLOW
    fetches: normalizedHost ? getFetchCountForHost(db, normalizedHost) : 0,  // SLOW
    lastSavedAt: domain.lastSavedAt
  };
});
```

### EventSource Errors

Client code in `src/ui/client/sseHandlers.js` connects to `/api/events`:
```javascript
const source = new EventSource('/api/events');
```

But `dataExplorerServer.js` doesn't expose this endpoint - it only exists in `src/deprecated-ui/express/server.js`.

## Solution

### 1. Fast Initial Render
Skip the slow per-host queries, render placeholders instead:
- `allArticles: null` (render as `[loading]`)
- `fetches: null` (render as `[loading]`)

### 2. Add SSE Stub Endpoint
Add `/api/events` endpoint that:
- Returns 200 with SSE headers
- Sends heartbeat to keep connection alive
- Doesn't error on client

## Implementation

See commits in this session.
