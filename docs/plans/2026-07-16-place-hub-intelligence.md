# Place-hub intelligence: review, design, and slice 1

Date: 2026-07-16. Place-keyed archiving/retrieval is a headline feature;
this document reviews how place hubs are recognized and categorized
today, designs the target system, and records what landed in slice 1.

## Part 1 — Review findings (code + live DB)

### The pipeline that exists
Discovery/guessing flows through `guess-place-hubs` →
`core/orchestration/DomainProcessor` (per-domain loop: candidate URLs →
cache check → HEAD probe → persist). Candidate prediction lives in
`services/CountryHubGapAnalyzer` (+Region/City/Topic variants). Content
verification is `geo/hub-validation/HubValidator` (+ a second, near-
duplicate validator under `core/crawler/hub-discovery/`). Storage spans
`place_hubs`, `place_hub_candidates`, `place_page_mappings`,
`place_hub_determinations`, `place_hub_unknown_terms`, `hub_validations`,
`site_url_patterns`, plus DSPL JSON files under `data/dspls/`.

### What the live DB said (2026-07-16)
- place_hubs: 428 rows across **only two hosts** (theguardian.com 233,
  aljazeera.com 195); 416 country-kind, 7 city, 3 region.
- place_hub_candidates: 512 fetched-404 vs 29 fetched-ok — guessing
  burns fetches; 29 fetched-ok rows never got a validation verdict.
- hub_validations: **0 rows** — the only table with validated_at /
  expires_at / confidence had no writer.
- place_hub_url_patterns: **did not exist** in the live DB (its ensure
  function had never run there).
- place_hub_unknown_terms top entries were real places: united-kingdom
  (460), london (112), andorra (121), gibraltar (85), cook-islands (77)
  — collateral of the stale-gazetteer bug fixed earlier today
  (PlaceLookup was loading a 508-place copy instead of 13,688).
- article_place_relations: 1,034 rows / 630 places — thin but present.

### Structural problems
1. **Four parallel URL-pattern mechanisms, mutually unaware**: DSPL JSON
   files (drive guessing, hand-maintained, auto-learn unwired),
   `place_hub_url_patterns` (crawler-runtime learner, never created
   live), `site_url_patterns` (written only by dev tools, junk hosts,
   www-prefixed), `planner_patterns` (planner-only). The guess pipeline
   reads none of the DB ones.
2. **No cold-start for new websites**: every learner keys on its own
   host's verified hubs; a new site falls back to hard-coded
   `/world/{slug}` guesses. Nothing generalizes across sites.
3. **Verification ignores content age**: cached-article lookup returned
   the newest fetch with no age bound; DomainProcessor's inline check
   validates on **title only**; verdicts scatter across three tables
   with different vocabularies; `hub_validations` dormant.
4. **No structure-drift response**: `layout_signatures`/`layout_masks`
   exist but nothing diffs them; nothing invalidates learned knowledge
   when a site redesigns.
5. **Search by place is second-class**: hub retrieval is host/kind-keyed;
   place-keyed retrieval exists only for mappings coverage and
   (deprecated UI) article relations.

### Sites as place hubs
Correct instinct: a news website is itself a place-scoped object
(nation.africa ⇒ Kenya, lemonde.fr ⇒ France). The DB already carries
this after today's geo-sync: `domain_locales` (host → country_code,
langs) + `news_websites.metadata.country`. Slice 2 will surface sites as
first-class "site-hubs" in place search (place → national outlets +
their hub pages + articles), rather than duplicating rows in place_hubs.

## Part 2 — Target design (all state in news.db)

**Canonical classification surface**: `place_hub_url_patterns`
- scope='host' rows: learned per-site (provenance
  'learned-from-verified-hubs', accuracy tracked by verification).
- scope='global' rows (domain='*'): cross-site GOFAI priors
  ('gofai-prior-v1') giving NEW sites immediate URL classification.
- Bayesian-ish accuracy updates on verification; drift reset zeroes host
  rows (priors survive) forcing re-learn.

**Classifier** (`PlaceHubUrlIndex.classifyUrl`): pattern match (host >
global) + gazetteer terminal-slug resolution (news.db place_names) +
non_geo_topic_slugs veto + article-shape (date path) rejection →
{candidate, confidence, place, provenance, reasons}. Pure DB + memory;
no network; usable at crawl-decision speed.

**Verification ledger**: `hub_validations` woken as the single verdict
store: validation_status, classification_confidence, validation_method
('cached-content' | 'live-fetch' | 'title-url'), content_indicators,
validated_at, **expires_at = validated_at + 2y** (configurable TTL).
Content comes cache-first via `getHubValidationCachedArticle` which now
enforces a **2-year freshness window** (override per call; `null`
restores unbounded); expired verdicts surface through
`listHubsNeedingRevalidation` for scheduled re-checks.

**Drift detection** (`assessStructureHealth`): bulk-404 of previously
verified hubs (≥50% dead of ≥5 checked) ⇒ reset host patterns + record
`place_hub_determinations` row 'structure-changed' ⇒ re-learn from next
verification wave. Phase 2: layout_signatures drift comparison and
pattern hit-rate collapse as additional detectors.

**Search**: `findHubsForPlace(placeId)` / `findHubsForPlaceSlug(slug)` —
one query joining place_page_mappings × place_hubs × hub_validations
with freshness filtering (`requireFresh`). Phase 2: fold in
article_place_relations (articles by place) and site-hubs
(domain_locales), plus an HTTP endpoint + UI panel.

### Phases
- **Slice 1 (landed, below)**: canonical pattern surface + priors +
  classifier + learner + freshness rule + validation ledger + place
  search queries + drift v1.
- Slice 2: wire classifier into DomainProcessor (candidate pre-filter →
  fewer 404 fetches) and CountryHubGapAnalyzer (persist Strategy-0
  inferences); content verification writes hub_validations everywhere;
  site-as-hub search; revalidation scheduler task.
- Slice 3: layout-signature drift detector; DSPL retirement (migrate
  JSON pattern libraries into the DB surface); place search API + UI;
  extend beyond countries (cities/regions at scale).

## Part 3 — Slice 1: what landed (all verified on the target machine)

news-crawler-db:
- `placeHubUrlPatternsStore`: +scope/provenance columns (ensure-style),
  global-prior seeding (`seedGlobalPriors`, 8 priors), host+global reads
  (`getPatternsForHost`/`matchUrlForHost`), drift reset
  (`resetHostPatterns`).
- `placeHubValidations.ts` (new): recordHubValidation (2y TTL default,
  unique-index ensure), getLatestHubValidation,
  listHubsNeedingRevalidation, findHubsForPlace, findHubsForPlaceSlug.
- `legacy-placeHubUtilityTools`: getHubValidationCachedArticle enforces
  the 2-year window (default on; fetchedAt stamped; legacy articles-table
  fallback only when the window is explicitly disabled).
- Tests: placeHubIntelligence.test.ts — 11 cases, green (vitest).

copilot-dl-news:
- `src/services/placeHubs/PlaceHubUrlIndex.js` (new): classifyUrl /
  learnFromVerifiedHubs / assessStructureHealth / open().
- Tests: PlaceHubUrlIndex.test.js — 8 cases, green (jest, on-machine).

Live exercise against news.db:
- Priors seeded (8). Learned host patterns: guardian `/world/{slug}`
  (172 hubs, acc .95), `/uk/{slug}`, `/australia-news/{slug}`;
  aljazeera `/where/{slug}` (164, .95), `/where/middle-east/{slug}` (19).
- `theguardian.com/world/andorra` and `/world/gibraltar` — previously
  the top *unknown terms* — now classify at 0.99 with places resolved.
- NEW-site cold start: `lemonde.fr/world/france` → 0.75 via global
  prior + gazetteer; `bbc.com/news/world/europe` → 0.60 via prior.
- Drift check on both hosts: guardian 27/168 dead (16%, healthy-ish —
  watch), aljazeera 0% — no false positives.
