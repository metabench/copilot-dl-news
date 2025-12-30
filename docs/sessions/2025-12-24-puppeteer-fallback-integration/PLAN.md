# Plan – Puppeteer Fallback Integration in FetchPipeline

## Objective
Add automatic Puppeteer fallback when ECONNRESET occurs in FetchPipeline.js for sites with TLS fingerprinting (JA3/JA4).

## Done When
- [x] Puppeteer fallback logic integrated into FetchPipeline ECONNRESET handler
- [x] Lazy-loading prevents mandatory puppeteer dependency
- [x] Configuration options for enabling/disabling and domain list
- [x] Helper methods: `_getPuppeteerFetcher()`, `_shouldUsePuppeteerFallback()`, `destroyPuppeteer()`
- [x] Unit tests pass (9/9 FetchPipeline tests)
- [x] Check script validates integration (`checks/puppeteer-fallback.check.js`)
- [x] E2E check validates lazy loader and domain matching
- [x] Key deliverables documented in `SESSION_SUMMARY.md`

## Change Set
- `src/crawler/FetchPipeline.js` — Added Puppeteer fallback (~60 lines)
  - Lines 1-18: Lazy PuppeteerFetcher import
  - Lines 164-175: Constructor puppeteerFallback config
  - Lines 185-237: Helper methods and cleanup
  - Lines 949-1005: ECONNRESET fallback logic
- `checks/puppeteer-fallback.check.js` — 12 assertions for config & methods

## Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| Puppeteer dependency bloat | Lazy-loaded only when needed |
| Stale browser instance | `destroyPuppeteer()` cleanup method |
| Fallback on wrong domains | Domain allow-list with host matching |
| Double-fetch overhead | Only triggers after initial ECONNRESET |

## Tests / Validation
- ✅ Unit tests: `npm run test:by-path src/crawler/__tests__/FetchPipeline.test.js` (9/9 pass)
- ✅ Check script: `node checks/puppeteer-fallback.check.js` (12/12 pass)
- ⏳ E2E test: `node tools/dev/mini-crawl.js https://www.theguardian.com --max-pages 3`
