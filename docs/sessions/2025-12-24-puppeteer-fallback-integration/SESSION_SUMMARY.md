# Session Summary – Puppeteer Fallback Integration in FetchPipeline

## Accomplishments

### Core Integration
- **Lazy PuppeteerFetcher loading** in FetchPipeline to avoid mandatory puppeteer dependency
- **Configuration options** for Puppeteer fallback:
  - `puppeteerFallback.enabled` (default: true)
  - `puppeteerFallback.domains` (default: theguardian.com, bloomberg.com, wsj.com)
  - `puppeteerFallback.onEconnreset` (default: true)
- **Helper methods** added:
  - `_getPuppeteerFetcher()` — lazy initialization with browser reuse
  - `_shouldUsePuppeteerFallback(host)` — domain matching with subdomain support
  - `destroyPuppeteer()` — cleanup when crawler finishes
- **ECONNRESET fallback logic** (~60 lines) in catch block:
  - Detects ECONNRESET after retry exhaustion
  - Checks if host matches TLS-fingerprinting domains
  - Retries with Puppeteer and returns success result
  - Tracks `fetchMethod: 'puppeteer-fallback'` for DB analysis

### Files Modified
- `src/crawler/FetchPipeline.js` — Added Puppeteer fallback integration
- `checks/puppeteer-fallback.check.js` — 12 unit assertions (all pass)
- `checks/puppeteer-fallback-e2e.check.js` — E2E simulation check (all pass)

## Metrics / Evidence

| Test | Result |
|------|--------|
| FetchPipeline unit tests | 9/9 pass |
| Puppeteer fallback check | 12/12 pass |
| E2E simulation check | ✅ All pass |
| mini-crawl-puppeteer E2E | ✅ Guardian 200 OK in 1293ms |

Commands:
```bash
npm run test:by-path src/crawler/__tests__/FetchPipeline.test.js  # 9/9 pass
node checks/puppeteer-fallback.check.js                           # 12/12 pass  
node checks/puppeteer-fallback-e2e.check.js                       # All pass
node tools/dev/mini-crawl-puppeteer.js https://www.theguardian.com --max-pages 1  # 200 OK
```

## Decisions
- **Lazy loading**: PuppeteerFetcher only instantiated on first ECONNRESET, not at startup
- **Browser reuse**: Same browser instance reused across multiple fallback calls
- **Default domains**: Conservative list of known TLS-fingerprinting sites
- **Fetch method tracking**: `puppeteer-fallback` distinct from regular `puppeteer` for analytics

## Next Steps
- [ ] Monitor production crawls to measure fallback frequency
- [ ] Consider adding more domains to default list based on ECONNRESET patterns
- [ ] Add CLI flag to force Puppeteer mode for specific domains
- [ ] Document the fallback in crawler architecture docs
