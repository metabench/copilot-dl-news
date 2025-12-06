# Working Notes – Crawler SafeCall Expansion

- 2025-12-03 — Session initialized. Goals: add utility tests, spread `safeCall` pattern to DomainThrottleManager + dbClient.
- 2025-12-03 — Added helper wrappers inside `dbClient` and refactored CRUD helpers. Wrote `utils.safeCall.test.js` covering the new utilities. Updated DomainThrottleManager limiter paths to call through `safeCall`/`safeCallAsync`.
- 2025-12-03 — Tests: `npm run test:by-path src/crawler/__tests__/utils.safeCall.test.js src/crawler/__tests__/DomainThrottleManager.test.js src/crawler/__tests__/dbClient.countrySlugs.test.js` ✅

- 2025-12-03 07:02 — 
## NewsCrawler Modularization Analysis Added to Memory

**Analyzed file**: `src/crawler/NewsCrawler.js` (2579 lines)

### Key Findings Documented
1. **Current State**: Already uses 25+ injected services via `_applyInjectedServices` method
2. **Integration Point**: `wireCrawlerServices()` function at line ~2280 is where new services get wired
3. **Method Groups Identified**: 8 cohesive groups by prefix/purpose

### Patterns Added to Memory
1. **"Modularize God Class via Service Extraction"** - Step-by-step extraction workflow
2. **"Extract Pure Computation to Calculator Service"** - Specific pattern for PriorityCalculator

### Anti-Pattern Added
- **"Breaking Public API During Extraction"** - Keep facade stable, delegate internally

### Recommended Extraction Order (documented in LESSONS.md)
1. PriorityCalculator (pure computation, ~150 lines) - **LOWEST RISK**
2. ExitManager (isolated, ~100 lines)
3. ProblemResolutionHandler (cohesive, ~100 lines)
4. StartupOrchestrator (higher coupling, ~350 lines)

### Knowledge Map Updated
- `src/crawler/NewsCrawler.js` status changed to "needs-review" with detailed notes

Future agents can now query the memory system for NewsCrawler modularization guidance.
