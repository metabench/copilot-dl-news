# Plan: Phase 4 - Crawler Production Hardening

## Objective
Implement 4 high-priority crawler hardening features: Domain Puppeteer Auto-Learning, Browser Pool Optimization, Golden Set Regression Testing, and Proxy Rotation Integration.

## Done When
- [ ] ECONNRESET failures automatically trigger Puppeteer learning and persistence
- [ ] Browser pool reuses instances across fetches with health monitoring
- [ ] Golden set regression tests prevent extraction quality degradation
- [ ] Proxy rotation provides IP failover for blocked domains

---

## 📚 ARCHITECTURE CONTEXT (Pre-Research for Crawler Agent)

### Key Files

| Component | File | Purpose |
|-----------|------|---------|
| **FetchPipeline** | `src/crawler/FetchPipeline.js` | Main fetch orchestrator, ~900 lines |
| **PuppeteerFetcher** | `src/crawler/PuppeteerFetcher.js` | Headless browser fetch, ~600 lines |
| **PuppeteerDomainManager** | `src/crawler/PuppeteerDomainManager.js` | Domain learning/config, ~400 lines |
| **Domain Config** | `config/puppeteer-domains.json` | Persistent domain list |

### Current Puppeteer Flow

```
FetchPipeline.fetch(url)
  │
  ├─── Standard node-fetch attempt
  │         │
  │         ├─ Success → return result
  │         │
  │         └─ ECONNRESET?
  │               │
  │               ├─ Is domain in puppeteer-domains.json?
  │               │     │
  │               │     ├─ YES → Puppeteer fallback
  │               │     │
  │               │     └─ NO → Check if learning enabled
  │               │              │
  │               │              └─ Record failure in memory
  │               │                  (currently NOT persisted)
  │               │
  │               └─ _getPuppeteerFetcher() → PuppeteerFetcher.fetch()
  │
  └─── PuppeteerDomainManager.recordFailure()
           │
           ├─ Count failures in window (5 min default)
           ├─ If count >= threshold (3 default)
           │     └─ Add to "learned" or "pending" list
           └─ If autoApprove=true → immediate activation
```

### Current Configuration (puppeteer-domains.json)

```json
{
  "domains": {
    "manual": ["theguardian.com", "bloomberg.com", "wsj.com"],
    "learned": [],
    "pending": []
  },
  "settings": {
    "autoLearnEnabled": true,
    "autoLearnThreshold": 3,
    "autoLearnWindowMs": 300000,
    "autoApprove": false,  // CHANGE TO TRUE for auto-learning
    "trackingEnabled": true
  },
  "browserLifecycle": {
    "maxPagesPerSession": 50,
    "maxSessionAgeMs": 600000,
    "healthCheckEnabled": true,
    "healthCheckIntervalMs": 30000,
    "restartOnError": true,
    "maxConsecutiveErrors": 3
  }
}
```

---

## 🎯 Item 1: Domain Puppeteer Auto-Learning (4h)

### What Exists
- ✅ `PuppeteerDomainManager` tracks failures per domain in memory
- ✅ `recordFailure()` method counts failures and promotes to learned/pending
- ✅ FetchPipeline calls `recordFailure()` on ECONNRESET
- ⚠️ Auto-learning only works if `autoApprove: true` (currently false)
- ⚠️ No telemetry events for learning activity

### Tasks

1. **Enable auto-approve by default** 
   - Change `autoApprove: false` → `autoApprove: true` in config
   - Or add smarter logic: auto-approve after 5+ consistent failures

2. **Add telemetry events**
   ```javascript
   // In PuppeteerDomainManager._promoteToLearned():
   this.emit('domain:learned', { domain, entry, autoApproved: true });
   
   // In FetchPipeline, wire to telemetry:
   this._puppeteerDomainManager.on('domain:learned', (data) => {
     this.telemetry?.telemetry({
       event: 'puppeteer.domain-learned',
       severity: 'info',
       domain: data.domain,
       reason: data.entry.reason
     });
   });
   ```

3. **Verify persistence on restart**
   - Test: cause ECONNRESET, restart crawler, verify domain is in Puppeteer list

### Acceptance Test
```javascript
// In tests/crawler/puppeteer-auto-learn.test.js
it('auto-learns domain after 3 ECONNRESET failures', async () => {
  const manager = new PuppeteerDomainManager({ autoSave: false });
  manager.updateSettings({ autoApprove: true, autoLearnThreshold: 3 });
  
  // Simulate 3 failures
  manager.recordFailure('blocked.example.com', 'https://blocked.example.com/page1', 'ECONNRESET');
  manager.recordFailure('blocked.example.com', 'https://blocked.example.com/page2', 'ECONNRESET');
  const result = manager.recordFailure('blocked.example.com', 'https://blocked.example.com/page3', 'ECONNRESET');
  
  expect(result.learned).toBe(true);
  expect(manager.shouldUsePuppeteer('blocked.example.com')).toBe(true);
});
```

---

## 🎯 Item 2: Browser Pool Optimization (6h)

### What Exists
- ✅ `PuppeteerFetcher` has `reuseSession` option
- ✅ Session health monitoring with health checks
- ✅ Auto-restart after N pages or time
- ⚠️ Pool is single-browser (no parallel browser instances)
- ⚠️ No acquire/release semantics for concurrent access

### Tasks

1. **Create BrowserPoolManager** (`src/crawler/BrowserPoolManager.js`)
   ```javascript
   class BrowserPoolManager {
     constructor({ 
       maxBrowsers = 3,
       maxPagesPerBrowser = 50,
       maxIdleTimeMs = 60000,
       healthCheckIntervalMs = 30000
     }) { ... }
     
     async acquire() → { browser, release: () => void }
     async destroy()
     getStats() → { active, idle, total, launches, reuses }
   }
   ```

2. **Implement acquire/release lifecycle**
   - Pool of N browsers (default 3)
   - `acquire()` returns least-used browser
   - `release()` returns browser to pool
   - Health check removes crashed browsers

3. **Integrate with PuppeteerFetcher**
   - Option to use pool instead of single session
   - Backward compatible: pool=null uses existing behavior

### Performance Target
- 10 sequential fetches in <50% current time (avoid browser launch overhead)

---

## 🎯 Item 3: Golden Set Regression Testing (4h)

### What Exists
- ✅ `TemplateExtractor` and `TemplateExtractionService` for extraction
- ✅ `ContentConfidenceScorer` for quality scoring
- ⚠️ No golden set fixtures
- ⚠️ No regression test runner

### Tasks

1. **Create golden set fixtures** (`tests/golden/fixtures/`)
   - 20-30 representative HTML files from different domains
   - Expected extraction results in JSON sidecar files
   - Include: title, body snippet, date, author, confidence

2. **Build regression test runner** (`tests/golden/golden-set.test.js`)
   ```javascript
   describe('Golden Set Regression', () => {
     const fixtures = loadFixtures('tests/golden/fixtures/');
     
     for (const fixture of fixtures) {
       it(`extracts ${fixture.name} correctly`, () => {
         const result = extractor.extract(fixture.html, fixture.config);
         expect(result.title).toContain(fixture.expected.titleSnippet);
         expect(result.body.length).toBeGreaterThan(fixture.expected.minBodyLength);
       });
     }
   });
   ```

3. **Add npm script**: `"test:golden": "npm run test:by-path tests/golden/"`

### Acceptance Criteria
- 20+ golden pages with verified extractions
- `npm run test:golden` runs in <30 seconds

---

## 🎯 Item 4: Proxy Rotation Integration (6h)

### What Exists
- ⚠️ No proxy support in FetchPipeline
- ⚠️ No proxy support in PuppeteerFetcher

### Tasks

1. **Create proxy config schema** (`config/proxies.json`)
   ```json
   {
     "enabled": false,
     "providers": [
       {
         "name": "provider1",
         "type": "http",
         "host": "proxy.example.com",
         "port": 8080,
         "auth": { "username": "", "password": "" }
       }
     ],
     "strategy": "round-robin",
     "banThresholdFailures": 3,
     "banDurationMs": 300000
   }
   ```

2. **Create ProxyManager** (`src/crawler/ProxyManager.js`)
   ```javascript
   class ProxyManager {
     constructor(config) { ... }
     getProxy(host) → { url, name } | null
     recordSuccess(proxyName)
     recordFailure(proxyName, error)
     isBanned(proxyName) → boolean
     getStats() → { proxies, bans, successes, failures }
   }
   ```

3. **Integrate with fetchers**
   - FetchPipeline: pass proxy agent to node-fetch
   - PuppeteerFetcher: pass proxy args to browser launch

### Acceptance Criteria
- Configure 3+ proxies
- Automatic failover on 403
- Proxy stats visible in telemetry

---

## 📋 Change Set

| Action | Path | Description |
|--------|------|-------------|
| MODIFY | `config/puppeteer-domains.json` | Set autoApprove: true |
| MODIFY | `src/crawler/FetchPipeline.js` | Add telemetry for domain learning |
| CREATE | `src/crawler/BrowserPoolManager.js` | Browser pool implementation |
| MODIFY | `src/crawler/PuppeteerFetcher.js` | Integrate pool option |
| CREATE | `tests/golden/fixtures/` | Golden set HTML + expected JSON |
| CREATE | `tests/golden/golden-set.test.js` | Regression test runner |
| CREATE | `config/proxies.json` | Proxy configuration |
| CREATE | `src/crawler/ProxyManager.js` | Proxy rotation logic |

---

## 🧪 Testing Strategy

### Item 1 Tests
- `tests/crawler/puppeteer-domain-manager.test.js` - existing, extend
- `tests/crawler/puppeteer-auto-learn.test.js` - new

### Item 2 Tests
- `tests/crawler/browser-pool-manager.test.js` - new

### Item 3 Tests
- `tests/golden/golden-set.test.js` - new

### Item 4 Tests
- `tests/crawler/proxy-manager.test.js` - new

---

## ⚠️ Risks & Considerations

1. **Browser pool memory**: Multiple Chromium instances can use 500MB+ each
2. **Proxy credentials**: Don't commit real proxy credentials to git
3. **Golden set staleness**: HTML snapshots may become outdated over time
4. **TLS fingerprinting evolution**: Sites may change blocking strategies

---

## 🎯 Item 5: Cost-Aware Hub Ranking (8h)

### Objective
Integrate `QueryCostEstimatorPlugin` into `IntelligentPlanRunner` so hub seeding uses real query cost data to prioritize low-cost operations first.

### Tasks

1. **Add `_runQuickPlanner()` to IntelligentPlanRunner**
   - Before seeding, run QueryCostEstimatorPlugin to get cost estimates
   - Pass cost model to HubSeeder

2. **Modify HubSeeder to accept costEstimates**
   - Accept optional `costEstimates` in constructor or `seedPlan()` 
   - Sort hub entries by estimated cost (ascending)
   - Low-cost hubs seeded first (within cap)
   - Add telemetry: `hub-seeder.cost-aware-ranking`

3. **Wire costModel through IntelligentPlanningFacade**
   - Pass optional costEstimates to HubSeeder constructor
   - Backward compatible: no costModel = existing behavior

### Acceptance Criteria
- [ ] `_runQuickPlanner()` method in IntelligentPlanRunner
- [ ] HubSeeder accepts costEstimates, sorts by cost
- [ ] Telemetry events for cost-aware seeding
- [ ] Unit tests passing
- [ ] Backward compatibility verified (no cost data = existing behavior)

---

## 🎯 Item 6: Query Telemetry Dashboard (4h)

### Objective
Create a jsgui3 dashboard UI that displays query cost data, planning history, and effectiveness metrics.

### Tasks

1. **Create dashboard server** (`src/ui/server/queryTelemetry/server.js`)
   - Express server on port 3020
   - API: `/api/stats`, `/api/recent`
   - SSR dashboard with jsgui3 controls

2. **Create jsgui3 controls**
   - `QueryStatsTable.js` - Table showing query_type, operation, avg_duration_ms
   - `RecentQueriesPanel.js` - Last 50 queries with color-coded duration

3. **Add npm script**
   - `"ui:query-telemetry": "node src/ui/server/queryTelemetry/server.js"`

### Acceptance Criteria
- [ ] `src/ui/server/queryTelemetry/server.js` created
- [ ] API endpoints: `/api/stats`, `/api/recent`
- [ ] jsgui3 SSR dashboard with stats table
- [ ] npm script added to package.json
- [ ] Check script for dashboard verification

---

## 📚 Related Sessions

- `2025-12-23-guardian-crawl-analysis` - Root cause analysis of TLS fingerprinting
- `2025-12-24-puppeteer-fallback-integration` - Initial Puppeteer integration
- `2025-12-25-roadmap-tracker-ui` - Roadmap tracking system
