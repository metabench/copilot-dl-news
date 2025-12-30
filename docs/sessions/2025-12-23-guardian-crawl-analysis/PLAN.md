# Plan – Guardian Crawl Analysis & ECONNRESET Investigation

## Objective
Analyze crawl telemetry, investigate Guardian anti-bot blocking, and design Puppeteer fallback with DB tracking

## Done When
- [x] Run test crawl on The Guardian (20 pages)
- [x] Analyze crawl results from DB queries
- [x] Identify root cause of ECONNRESET failures
- [x] Test quick fix (browser-like User-Agent + rate limiting) — FAILED (TLS fingerprinting)
- [x] Design Puppeteer fallback architecture
- [x] Add `fetchMethod` field to URL events for AI analysis
- [x] Document findings and recommendations

## Final Result: ✅ SUCCESS

Guardian crawl now works using Puppeteer:
- **5 pages fetched**, all HTTP 200
- **4.2 MB content**, 8.4s duration
- **`fetchMethod: 'puppeteer'`** stored in DB for all URLs
- **Job ID**: `puppeteer-crawl-2025-12-23T05-23-56`

## Context (Prior Session Carryover)

This session continues from earlier work that:
1. Fixed URL event persistence bug (`telemetry.bridge.emitStarted()` was missing in mini-crawl)
2. Successfully ran BBC crawl (49 events captured, timing data verified)
3. Failed to crawl Guardian (ECONNRESET after 3 retries)

## Findings So Far

### Guardian ECONNRESET Root Cause Analysis

**Error Pattern**:
```
[network] connection-reset-backoff: retrying https://www.theguardian.com/ (attempt 2/3) in 1191ms [code=ECONNRESET]
Following redirect 1: https://www.theguardian.com/ → https://www.theguardian.com/uk
[network] Exhausted retries after 3 attempts [code=ECONNRESET]
```

**Causes Identified**:

1. **User-Agent Detection (HIGH)**: Crawler sends `'Mozilla/5.0 (compatible; NewsBot/1.0)'` — obvious bot signature
2. **No Rate Limiting**: `rateLimitMs: 0` by default, requests fire as fast as possible
3. **Fingerprinting**: Guardian allows initial 302 redirect but kills connection on follow-up (detects automation)

### Proposed Solutions

| Option | Approach | Effort | Robustness |
|--------|----------|--------|------------|
| A | Browser-like User-Agent + delays | Low | Medium |
| B | Puppeteer fallback on ECONNRESET | Medium | High |
| C | Full header stealth mode | Low | Medium |

## Change Set

- `src/crawler/FetchPipeline.js` — Update headers, add fallback logic
- `tools/dev/mini-crawl.js` — Add `--slow-mode` or `--stealth` flags
- `src/crawler/telemetry/TelemetryBridge.js` — Add `fetchMethod` to URL events
- `src/crawler/PuppeteerFetcher.js` — New file for headless browser fallback

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Puppeteer adds complexity | Keep as optional fallback, not default |
| Guardian may still block headless Chrome | Consider puppeteer-extra-plugin-stealth |
| Performance overhead | Only use Puppeteer after fetch fails |

## Tests / Validation

1. Run mini-crawl with browser-like User-Agent → expect success
2. Run mini-crawl with Puppeteer fallback → verify `fetchMethod: 'puppeteer'` in events
3. Query DB to confirm all URL events have valid `fetchMethod` field
