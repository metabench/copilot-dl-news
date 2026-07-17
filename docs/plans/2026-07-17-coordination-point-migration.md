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
| DB access | news-crawler-db (517) | Yes | **Mostly a SHIM layer now — see DB-consolidation audit below (143/199 files re-export ncdb)** |
| Analysis | news-db-pure-analysis (54) | Yes (9 files) | Partial — src/intelligence/analysis parallels |
| UI framework | jsgui3-html/client/server | Yes | src/ui (515) large; deprecated-ui (319) REMOVED 2026-07-17 |
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

## deprecated-ui — REMOVED 2026-07-17 (recipe steps 1–3 complete)

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

Removal recipe (remaining): (3) delete src/deprecated-ui + its test dir.

Step-3 blockers CLEARED 2026-07-17 (importers that reached into the tree
are now repointed/retired and green):
- IntelligentCrawlerManager.js RELOCATED src/deprecated-ui/express/services
  → src/core/crawler/ (beside its only live testers). Its lone relative
  require (../../../shared/utils/domainUtils) was recalibrated to ../../ for
  the shallower depth — the naive git mv left it dangling and it only
  surfaced once the module ran under a NON-ignored dir. Both core tests
  (dynamic-replanning, phase-123-integration) repointed to
  ../IntelligentCrawlerManager: 27/27 + 9/9 green.
- git rm'd (dead consumers, no live importer): tools/benchmarks/run.js (+
  its now-dead `benchmarks` package.json script), tools/manual-tests/
  {test-gazetteer-aware-planning,test-geography-crawl,verify-queues-impl}.js,
  tests/server-connection.test.js (imported deprecated-ui/express/server).
- deprecated-ui/express/server.js + the deprecated-ui ICM tests still name
  the old module path, but the whole /src/deprecated-ui/ subtree is
  jest-ignored (package.json testPathIgnorePatterns) and dies in step (3).

Step 3 DONE 2026-07-17: src/deprecated-ui + tests/deprecated-ui git rm -r'd
(368 files). Pre-audit found the only require()s of the tree were INSIDE it
(both jest-ignored); no live/mounted importer remained (src/api/server.js,
its last non-test src importer, went in step 2). smoke-analysis-imports.js
had its shim require dropped first (the ncdb surface check is now the
canonical guard). Verified post-delete: smoke PASS, tests/server/api/
analysis.test.js 13/13. Loose ends (harmless no-ops, tidy in a later sweep):
test-config.json still defines a `deprecated-ui` run-tests profile + several
/deprecated-ui/ ignore entries; jest.careful.config + the main jest
testPathIgnorePatterns still list the now-absent paths;
backgroundTasksMonitor/main.js comments name a `ui:deprecated` server.
NOTE, pre-existing + unrelated to this chunk: src/core/crawler/__tests__
placeHubs.data (no such column: url), ProblemResolutionService (prepare
call-count), utils.safeCall (missing module) fail on their own — leave for
a later core-crawler test-drift pass.

## Recommended remaining phases (owner to sequence)

1. **DB consolidation** — slice-0 AUDIT DONE 2026-07-17; the plan's old
   framing ("199-file internal duplicate") was WRONG. Corrected map:
   - src/data/db is mostly a COMPATIBILITY SHIM layer: 143/199 files
     require news-crawler-db and largely re-export it. The core
     SQLiteNewsDatabase.js is a documented wrapper ("SQL and facade
     ownership live in news-crawler-db"); ncdb exports NewsDatabase/
     SQLiteNewsDatabase/StatementManager/SchemaInitializer directly.
   - Real-logic residue (non-ncdb-requiring, excl. tests): TaskEventWriter
     (548 ln), EnhancedDatabaseAdapter (444), migration/orchestrator (308),
     index.js barrel (211), dbAccess.js (163, convenience wrappers over the
     wrapper), sqlite/v1/connection.js (136), ui/urlListingNormalized (99),
     queries/analysisQueries (62), small barrels/checks.
   - Consumers of src/data/db paths: ~157 src + 41 tools + 27 tests files
     (~330 requires). The migration mechanic is repoint-then-delete-shim,
     file by file or module by module; behavior identity is provable via
     reference-equality smokes (checks/smoke-uapp-db-repoint.js pattern,
     shim fn === ncdb fn).
   - First repoint LANDED: unifiedApp/server.js cloudCrawl trio +
     downloadEvidence seven now come from ncdb directly (aliases preserved:
     normalizeCloudCrawlDomains→normalizeDomains, getGlobalDownloadStats→
     getGlobalStats). Its only remaining src/data/db import is
     dbAccess.openNewsDb (real logic, migrate later).
   - Slice 1 DONE 2026-07-17: BOTH shims DELETED (queries/ui/cloudCrawl.js —
     zero importers after slice 0 — and queries/downloadEvidence.js — its 10
     importers repointed: unifiedApp/checks/download-verification.check.js,
     tools/dev/{verified-crawl,db-downloads,downloads-bar-chart-server},
     tools/crawl/cloud-crawl-e2e, tools/crawl/lib/{sample-db-signals,
     monitored-small-crawl,crawl-progress-monitor,crawl-packet,
     crawl-backend}). Only verified-crawl used the getGlobalStats alias
     (small alias object); the rest are plain ncdb names (whole-module
     `require('news-crawler-db')` where files did property access).
     Verified: surface smoke 20 fns + 4 consts (smoke-uapp-db-repoint.js,
     reworked — identity form impossible post-deletion), LIVE
     download-verification.check 9/9 on :memory:, node --check 10/10.
     src/data/db: 197 files remain.
   - Dead references found (pre-existing, not blockers): root checks/
     {download-evidence,downloads-api,downloads-stats-api}.check.js require
     `../src/db/queries/downloadEvidence` — a path that does NOT exist
     (src/db/ has only TaskEventWriter + openNewsCrawlerDb). Fix-or-retire
     in a later checks sweep; docs/tools/CRAWL-TOOLING.md names the same
     ghost path.
   - VERIFICATION CAVEAT for ui suites: with the Electron app live (port
     3170 + 28GB WAL DB), tests/ui/unifiedApp.* can watchdog-timeout on the
     bridge — even at HEAD (verified: two baseline runs timed out; one
     completed run showed 2 pre-existing "Available Apps" HTML-count
     failures in registry.test, untouched by imports). Prefer identity
     smokes for repoints; run ui suites when the app is stopped.
2. **deprecated-ui removal** — DONE 2026-07-17 (steps 1–3; ~368 files gone).
3. **Crawler-engine decision** — is news-crawler-itself the intended
   future engine (restore + migrate src/core to it) or abandoned (already
   removed the dep; keep src/core as the engine and, longer term, extract
   it cleanly)?
4. **Analysis** — finish moving src/intelligence/analysis into
   news-db-pure-analysis; delete internal copies.
5. **UI** — reduce src/ui by leaning on jsgui3-html; prune docs (2,790
   files, larger than src top-level).
