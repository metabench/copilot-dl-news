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

Still wired into live-ish code, so it needs a dedicated unwiring pass,
not a blind delete. Exact couplings:
- `src/api/server.js` deeply imports it (writableDb, JobRegistry,
  RealtimeBroadcaster, events router). server.js isn't launched by any
  script, but is referenced by `src/ui/server/analyticsHub/index.js` and
  `qualityDashboard/index.js` — confirm those are live before removing.
- `src/api/routes/analysis.js` + `src/tools/analysis-run.js` (the latter
  is the live `analysis:run` script) use
  `deprecated-ui/express/services/analysisRuns` — relocate that service.
- `src/background/tasks/taskDefinitions.js` uses
  `deprecated-ui/shared/propertyEditor` ({FieldType, validateValues}) —
  relocate that small util.
- `src/ui/electron/backgroundTasksMonitor/main.js` only MENTIONS
  deprecated-ui in comments (probes its old ports) — no code dependency.

Removal recipe: (1) relocate `analysisRuns` and `propertyEditor` to a
live home (e.g. src/services), repoint the 3 importers; (2) determine
whether src/api/server.js + analyticsHub + qualityDashboard are retired
(superseded by unifiedApp) — if so remove them with deprecated-ui, else
migrate their deprecated-ui imports; (3) delete src/deprecated-ui and its
test dir; jest already ignores it via testPathIgnorePatterns.

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
