# Session Summary – Guardian Crawl Analysis & ECONNRESET Investigation

## Accomplishments

### Root Cause Identified
- **Guardian uses TLS fingerprinting (JA3/JA4)**, not just User-Agent detection
- Node.js/undici TLS signature is blocked regardless of HTTP headers
- Browser-like headers (Chrome 120) still fail at TLS layer

### Browser Headers Attempt (Failed)
- Updated `src/crawler/FetchPipeline.js:520-540` with full Chrome 120 headers
- Added `--slow` and `--rate-limit` flags to `tools/dev/mini-crawl.js`
- **Result**: Still ECONNRESET — fingerprinting defeats headers

### Puppeteer Fallback (SUCCESS)
- Created `src/crawler/PuppeteerFetcher.js` — Reusable headless browser module
- Created `tools/dev/mini-crawl-puppeteer.js` — Puppeteer-based crawler tool
- **Result**: Guardian crawl succeeds — 5 pages, all HTTP 200, 4.2 MB

### DB Tracking
- All URL events include `fetchMethod: 'puppeteer'` field
- AI agents can query to identify which URLs required Puppeteer
- Job ID `puppeteer-crawl-2025-12-23T05-23-56` in `task_events` table

## Metrics / Evidence

| Metric | Value |
|--------|-------|
| Guardian pages crawled | 5 |
| HTTP status | All 200 |
| Content size | 4,240.8 KB |
| Duration | 8.4 seconds |
| Delay between pages | 1000ms |
| DB events written | 3 (start, url:batch, complete) |
| fetchMethod field | ✅ Stored for all URLs |

**Verification command**:
```bash
node tools/dev/task-events.js --summary puppeteer-crawl-2025-12-23T05-23-56
```

## Decisions

1. **Use Puppeteer for TLS-fingerprinting sites** — HTTP headers alone cannot bypass JA3/JA4 detection
2. **Track fetchMethod in DB** — Enables AI agents to analyze which domains need Puppeteer
3. **Rate limit Puppeteer crawls** — 1000ms delay prevents trigger-happy bot detection

## Next Steps

1. **Integration**: Add Puppeteer as automatic fallback in main crawler when ECONNRESET occurs
2. **Configuration**: Create domain-based Puppeteer allow-list for known fingerprinting sites
3. **Performance**: Consider browser reuse across multiple URLs (currently one browser per crawl)
