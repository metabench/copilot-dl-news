# Place-hub subsystem assessment — 2026-07-17

Scope: detection → storage → indexing → search → UI representation.
Method: schema read (ncdb drizzle), read-only DB probe
(checks/probe-placehub-assessment.js), live API probes on :3170, UI
code audit. App was running throughout; no writes made.

## What works well

- **Data model**: `place_hubs` (host, place_slug, place_kind, topic_*
  dual-use, evidence JSON, url_id) indexed on host/place/topic/url plus
  uq_place_hubs_url_id + uq_place_hubs_entity. Gazetteer `places` richly
  typed (kind, country/adm codes, population, wikidata+osm provenance,
  15 indexes). `place_page_mappings` (753 rows) is the placeId-FK'd
  layer; `hub_validations` ledger has TTL + method + confidence;
  `place_hub_audit` records agent writes. Slug hygiene good: 0 null
  slugs, only 2 slug→gazetteer misses.
- **Detection loop**: learn→predict→prefilter→verify→ledger runs
  unattended (4 new guardian hubs verified TODAY via policy-aware
  puppeteer fetch; aljazeera prefilter live).
- **Search/review API** (`/api/v1/place-hubs/*`): review-queue honest
  (8 open items incl. united-kingdom 460-occurrence unknown-term);
  `search?place=` returns placeId-keyed multi-host results with
  validation status/confidence/expiry. All writes require agent+reason.
  `docs/agents/PLACE_HUB_REVIEW_API.md` is an excellent operating spec.
- **Table UI exists**: dataExplorer `/place-hubs` renders exactly the
  requested view — host filter, **kind filter**, text search,
  pagination, stat cards — over ncdb's listPlaceHubs/countPlaceHubs/
  getPlaceHubsByKind/getPlaceHubHosts.

## Gaps (ranked)

1. **The table view is unreachable from the live app.** dataExplorer is
   a standalone server (`ui:data-explorer`); the unified Electron shell
   mounts only the place×host guessing MATRIX at `/place-hubs`. Nothing
   in the registry links the browsable table. Fix: mount/iframe the
   dataExplorer place-hubs view (or port renderPlaceHubsView) into the
   unified shell.
   → **FIXED same day (chunk A1)**: new composition-only sub-app
   `src/ui/server/placeHubsTable/server.js` (all queries from ncdb;
   no src/data/db imports) mounted at `/place-hubs-table` + registry
   tile "Place Hubs" 📍; links to the matrix and review queue; JSON
   twin at `/place-hubs-table/api/list`. Verified live: HTTP 200 page +
   API (search=andorra → 2 hubs), ui-screenshot shows the table in the
   shell. Screenshot also caught fresh data-quality examples: quebec
   place_kind='country'; one hub row with no URL (null url_id join).
   Remaining nicety: a link FROM the matrix page back to the table
   (matrix HTML lives in jsgui controls; left for a later chunk).
2. **No village granularity.** Gazetteer kinds today: city 7,325,
   region 6,113, country 249, planet 1. Hub kinds: country 416, city 7,
   region 3, subcontinent 2. "Filter by village" cannot work until
   populate-gazetteer ingests finer kinds (config caps cities/country
   at 50; no village/town kind exists). Kind filter itself works.
3. **Coverage narrow**: 428 hubs on 2 hosts (guardian 233, aljazeera
   195) of ~15 seeded hosts.
4. **Validation thin**: 11 hub_validations vs 428 hubs (ledger 3 days
   old); backfill validations for legacy hubs or age them out.
5. **Data quality**: duplicate (host,slug) rows (andorra ×2 —
   uq_place_hubs_entity tolerates url_id/www variants); ISO-code junk
   mappings (independent.co.uk/topic/**ad**, semana.com/news/**ad** ↦
   Andorra — semana's is "verified"); pageKind vocabulary drift
   ('country' vs 'country-hub') yields duplicate search rows.
6. **Slug-keyed hubs**: place_hubs has no place_id FK; only
   place_page_mappings is id-keyed. Ambiguous slugs (london) rely on
   mappings + classify evidence.
7. **Docs**: behavioral spec is strong; a schema reference for the
   place_hub_* tables is missing (my probe guessed 3 column names wrong
   — narrative and schema have drifted).
