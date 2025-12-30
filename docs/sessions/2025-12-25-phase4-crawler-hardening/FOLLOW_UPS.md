# Follow-ups: Phase 4 - Crawler Production Hardening

## Deferred Work

### Proxy Full Integration
- **Priority**: Medium
- **Dependency**: Add `https-proxy-agent` and `socks-proxy-agent` packages
- **Work needed**:
  1. Install: `npm install https-proxy-agent socks-proxy-agent`
  2. Modify FetchPipeline constructor to accept ProxyManager
  3. In `_fetchUrl()`, get proxy from manager and create proxy agent
  4. Call `recordSuccess()`/`recordFailure()` based on response
  5. Wire ProxyManager events to telemetry

### Golden Set Expansion
- **Priority**: Low
- **Work needed**:
  1. Add fixtures for paywalled content
  2. Add fixtures for lazy-load/JS-dependent pages
  3. Add fixtures for different article formats (listicle, gallery)
  4. Add fixtures for edge cases (missing dates, no author)

### Items 5-6
- **Cost-Aware Hub Ranking** (8h, Low priority)
- **Query Telemetry Dashboard** (4h, Low priority)

## Tests to Run

```bash
# Run the new unit tests
npm run test:by-path tests/crawler/unit/PuppeteerDomainManager.test.js
npm run test:by-path tests/crawler/unit/BrowserPoolManager.test.js
npm run test:by-path tests/crawler/unit/ProxyManager.test.js

# Run golden set regression
npm run test:golden
```

## Documentation Updates

Consider adding:
1. `docs/guides/CRAWLER_RESILIENCE_GUIDE.md` - documenting auto-learning, pooling, proxies
2. Update roadmap status in `data/roadmap.json`
