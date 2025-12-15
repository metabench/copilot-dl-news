# Working Notes – Decision audit persistence + Data Explorer decisions

## 2025-12-15

- Found: Data Explorer already has a `/decisions` view that renders `crawl_milestones` via `listMilestones()`.
- Found: decision traces are emitted as persisted milestones via `CrawlerEvents.emitMilestone({ persist:true })` (e.g. hub freshness decisions).
- Issue: milestone persistence depends on `EnhancedFeaturesManager` creating an enhanced DB adapter, but the adapter only initialized when *some* feature flag was enabled.

### Fix

- Updated `EnhancedFeaturesManager.initialize()` to also initialize the enhanced DB adapter when `hubFreshness.persistDecisionTraces === true`.
- Added regression test to ensure this works with no other feature flags enabled.

### Validation

- Run: `npm run test:by-path src/crawler/__tests__/EnhancedFeaturesManager.test.js`

### Follow-up implementation

- Added persisted decision traces for URL policy skips (query/policy drops) via `NewsCrawler._handlePolicySkip()` when `hubFreshness.persistDecisionTraces:true`.
- Added regression coverage in `src/crawler/__tests__/queue.behaviour.test.js` to ensure skip traces only persist when enabled.

### UI semantics: cache hits are reflexes

- Updated Data Explorer `/decisions` to hide `cache-priority-hit` milestones by default (treat them as cache reflexes, not decisions).
- Escape hatch: `/decisions?includeReflexes=true` includes reflex milestones.
- Tests: `tests/ui/server/dataExplorerServer.test.js` covers both behaviors.

- 2025-12-15 — Session created via CLI. Add incremental notes here.
