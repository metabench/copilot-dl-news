# Goal: Crawler → Analysis → Country Hub Guessing

Created: 2026-01-11
Workflow: `/goal-decomposition-refactor`

## Original Goal Statement

> "Set up the crawler, including its UI, to ensure all news websites have at least 500 documents downloaded, crawl as needed to achieve this, run the analysis system on all domains, obtain the hub patterns, and then use these patterns, combined with gazetteer data, to guess place hubs, starting with country hubs"

---

## Phase 1: Goal Decomposition

### 1.1 Atomic Sub-Goals

| # | Sub-Goal | Description |
|---|----------|-------------|
| 1 | **Threshold Configuration** | Crawler can be configured with per-domain document thresholds (e.g., 500 docs) |
| 2 | **Document Count Tracking** | System tracks document counts per domain in real-time |
| 3 | **UI Progress Display** | UI shows per-domain doc counts and progress toward thresholds |
| 4 | **Threshold-Driven Crawling** | Crawler continues/resumes until thresholds are met for all domains |
| 5 | **Analysis Trigger** | Analysis system can be triggered on domains that meet threshold |
| 6 | **Hub Pattern Extraction** | Analysis produces hub URL patterns from verified hubs |
| 7 | **Pattern Storage** | Extracted patterns are stored and queryable |
| 8 | **Gazetteer Availability** | Gazetteer data is loaded and accessible for lookups |
| 9 | **Country Hub Guessing** | Combine patterns + gazetteer → predict country hub URLs |
| 10 | **Country Priority** | Country hubs are processed first (before cities, regions, etc.) |
| 11 | **Results Verification** | Results are visible and verifiable (UI + CLI) |

### 1.2 Code Area Mapping

| Sub-Goal | Primary Code Areas | Can Test Alone? | Dependencies |
|----------|-------------------|-----------------|--------------|
| 1. Threshold config | `src/core/crawler/config/`, `config/` profiles | ✅ Yes | None |
| 2. Doc count tracking | `NewsCrawler.js`, `MilestoneTracker.js`, DB queries | ⚠️ Partial | DB schema |
| 3. UI progress display | `src/ui/server/crawlObserver/`, `crawlStatus/` | ❌ No | Full server, DB |
| 4. Threshold crawling | `NewsCrawler.js`, `startupSequence.js`, exit conditions | ⚠️ Partial | Full crawler |
| 5. Analysis trigger | `src/services/*HubGapAnalyzer*` | ⚠️ Partial | DB with data |
| 6. Pattern extraction | `PlaceHubPatternLearningService.js` | ⚠️ Partial | Verified hubs in DB |
| 7. Pattern storage | `src/data/db/placeHubUrlPatternsStore.js` | ✅ Yes | DB schema |
| 8. Gazetteer | `src/core/crawler/gazetteer/`, `GazetteerManager.js` | ⚠️ Partial | Gazetteer DB |
| 9. Country guessing | `CountryHubGapAnalyzer.js` | ⚠️ Partial | Patterns + Gazetteer |
| 10. Country priority | `CountryHubPlanner.js`, `HubSeeder.js` | ⚠️ Partial | Config |
| 11. Verification | **DOES NOT EXIST** - need to create CLI tools | ❌ No | All above |

### 1.3 Coupled Components Identified

Components that CANNOT currently be tested in isolation:

1. **Document count display (UI)** - Requires full server running
2. **Threshold-driven crawling** - Embedded in 2300-line NewsCrawler.js
3. **Analysis pipeline** - Needs DB with real data
4. **Country hub guessing** - Coupled to DB and gazetteer

---

## Phase 2: Refactoring Priorities

### High Priority Extractions

1. **DocumentCountTracker** (from NewsCrawler)
   - Extract logic for counting docs per domain
   - Pure interface: `getDocCount(domain) → number`
   - Testable with mock DB

2. **ThresholdChecker** (new)
   - Input: domain doc counts + threshold config
   - Output: which domains need more crawling
   - Pure function, fully testable

3. **HubPatternMatcher** (from CountryHubGapAnalyzer)
   - Input: patterns + gazetteer countries
   - Output: predicted URLs
   - Can be tested with fixture data

---

## Phase 3: CLI Verification Tools Needed

| Tool | Purpose | Exit 0 When |
|------|---------|-------------|
| `check-doc-counts.js` | Show docs per domain | All domains ≥ threshold |
| `check-analysis-status.js` | Show which domains analyzed | All eligible analyzed |
| `check-hub-patterns.js` | List discovered patterns | Patterns exist for domains |
| `check-country-hub-guesses.js` | Show guessed country hubs | Guesses generated |

---

## Sub-Goal Execution Order

```
[1] Threshold Config ─────────────────┐
                                      │
[2] Doc Count Tracking ───────────────┤
                                      │
[3] UI Progress Display ──────────────┼── Parallel Development
                                      │
[8] Gazetteer Availability ───────────┤
                                      │
[11] Verification Tools ──────────────┘

Then Sequential:
[4] Threshold-Driven Crawling (run until all ≥ 500)
        ↓
[5] Analysis Trigger (run on completed domains)
        ↓
[6] Hub Pattern Extraction
        ↓
[7] Pattern Storage (verify stored)
        ↓
[9] Country Hub Guessing
        ↓
[10] Country Priority (verify countries first)
```

---

## Current State Assessment Needed

Before implementation, need to check:

1. What is current doc count per domain?
2. Are there domains already at 500+?
3. What patterns already exist?
4. Is gazetteer populated?
5. Are there existing country hub guesses?

---

## Next Steps

1. ✅ Create session folder - DONE
2. ⏳ Create CLI tools to assess current state
3. ⏳ Identify what can be reused vs needs creation
4. ⏳ Begin refactoring for isolation
5. ⏳ Execute sub-goals sequentially with verification
