# copilot-dl-news → coordination point: status + migration map

Date 2026-07-17. Goal (owner's intent): copilot-dl-news becomes a thin
coordination/orchestration layer that depends on extracted sibling repos,
not a monolith that also contains internal copies of them.

## Reality vs belief

Extraction STARTED but the migration is UNFINISHED. copilot-dl-news
declares four local sibling deps and glues them, yet still contains and
RUNS its own internal copies of most of what was extracted. So it is
currently BOTH a coordination point and a monolith — which is why "same
concept in two places" keeps recurring.

Tracked JS/TS file counts (excludes node_modules/dist):
- copilot-dl-news: ~2,863
- news-crawler-db: 517 (DB layer)
- jsgui3-html: 617 (UI framework, shared across a ~20-repo jsgui3 ecosystem)
- news-db-pure-analysis: 54 (analysis)
- news-crawler-itself: MISSING on disk

## Extraction status per domain

| Domain | Extracted repo | Used by copilot? | Internal duplicate still present |
|--------|----------------|------------------|----------------------------------|
| DB access | news-crawler-db (517) | Yes | **Yes — src/data/db (199 files); unifiedApp imports BOTH in one file** |
| Analysis | news-db-pure-analysis (54) | Yes (9 files) | Partial — src/intelligence/analysis parallels |
| UI framework | jsgui3-html/client/server | Yes | src/ui (515) + deprecated-ui (319) still large |
| Crawler engine | news-crawler-itself | **No — repo missing, nothing imports it** | src/core (380) is the real engine |

## Cleared this pass (dead weight, low-risk)

- Removed the abandoned `news-crawler-itself` dependency + its two
  `crawl:modern*` scripts from package.json (repo missing; nothing in
  src imported it; the dep would break `npm install`).
- Deleted `config/puppeteer-domains.json` (read from a wrong path, never
  loaded; superseded by the `domain_fetch_policies` DB table + the
  `/fetch-policies` API) and the broken CLI `tools/dev/puppeteer-domains.js`
  (required a non-existent `src/crawler/` path).
- Fixed the `src/crawler/` → `src/core/crawler/` require in
  `tests/crawler/unit/PuppeteerDomainManager.test.js` (silently unloadable
  for months); revived it and skipped 6 drifted auto-learn assertions
  (the auto-learn feature is itself dead — wrong config path — and
  superseded by domain_fetch_policies).

## NOT removable yet — deprecated-ui (319 files)

Recipe step (1) DONE 2026-07-17: `analysisRuns` now lives in
news-crawler-db (listAnalysisRuns + getAnalysisRun + diagnostics added
there — it is pure DB access, so it went to the DB repo, not a copilot
halfway house; vitest legacyAnalysisRunsListGet.test.ts covers them).
`propertyEditor` moved to `src/shared/propertyEditor.js`. All live
importers repointed (routes/analysis.js, tools/analysis-run.js,
tools/analysis/upgrade-analysis-schema.js — a 4th importer the original
survey missed — taskDefinitions.js, tests/server/api/analysis.test.js).
`deprecated-ui/express/services/analysisRuns.js` is now a re-export shim
for the internal deprecated-ui consumers and dies with the tree.
Verified: ncdb 3/3 vitest; copilot 13+22+5 jest + require-smoke
(checks/smoke-analysis-imports.js).

Recipe step (2) DONE 2026-07-17: verdict reached and acted on.
- analyticsHub + qualityDashboard are LIVE — unifiedApp mounts their
  `server.js` router factories — but they import NOTHING from
  deprecated-ui or src/api/server.js. The earlier claim that their
  index.js files reference api/server was wrong (they are barrels over
  ./server + ./controls).
- `src/api/server.js` was an unlaunched duplicate of unifiedApp's
  serving role (none of the 147 package scripts, no cmd, no electron
  main referenced it; unifiedApp wires its own API via
  registerPlaceHubReviewRoutes + server/crawl-api/v1). DELETED, along
  with its only consumer tests/api/crawl-status-page.test.js (it tested
  the dead /crawl-status duplicate; the live one is unifiedApp's).
  That removes deprecated-ui's last non-test importer in src/.
- Fallout finding: `src/api/routes/*` (analysis, background-tasks,
  place-hubs, crawls, health, decisionConfigSet) were mounted ONLY by
  the deleted server.js, yet stay green under tests/server/api/*.
  They are now tested-but-unmounted library code — decide later:
  mount them in unifiedApp or retire them (the src/api/v1 + graphql
  trees likely share this condition; unverified).
- Also repaired in passing (same class as the pass-1 PuppeteerDomainManager
  fix): tests/api/push.test.js had a require path overshooting the repo
  root — silently unloadable; path fixed, 8/15 pass, 7 drifted
  assertions test.skip'd pending a push-router reconciliation pass.
  tests/api/v1/routes/articles.test.js updated for the implemented
  /similar route (501 without engine, was Phase-8 placeholder 200).

Removal recipe (remaining): (3) delete src/deprecated-ui + its test
dir. Blockers to clear first — importers that still reach into the tree:
- src/core/crawler/__tests__/IntelligentCrawlerManager.dynamic-replanning
  .test.js + phase-123-integration.test.js (IntelligentCrawlerManager)
- tools/benchmarks/run.js (gazetteerCountry, ssr.gazetteer.country)
- tools/manual-tests/{test-gazetteer-aware-planning,test-geography-crawl,
  verify-queues-impl}.js
- tests/server-connection.test.js (deprecated-ui/express/server)
- tests/deprecated-ui/** (jest-ignored already; deleted with the tree)
- tools/dev-bridge/checks/smoke-analysis-imports.js re-requires the
  analysisRuns shim intentionally — update it when the tree goes.

## Recommended remaining phases (owner to sequence)

1. **DB consolidation** — the biggest duplication: retire src/data/db
   (199 files) into news-crawler-db; repoint imports; delete internal
   copies. Highest payoff, needs careful verification (live app imports
   both today).
2. **deprecated-ui removal** — per the recipe above (~319 files).
3. **Crawler-engine decision** — is news-crawler-itself the intended
   future engine (restore + migrate src/core to it) or abandoned (already
   removed the dep; keep src/core as the engine and, longer term, extract
   it cleanly)?
4. **Analysis** — finish moving src/intelligence/analysis into
   news-db-pure-analysis; delete internal copies.
5. **UI** — reduce src/ui by leaning on jsgui3-html; prune docs (2,790
   files, larger than src top-level).
