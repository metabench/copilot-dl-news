# Place-name search & display: an English-primary, multilingual design

**Date:** 2026-07-23 · **Context:** written after a cycle-85 display bug (a place rendered
as its Chinese name 加薩 instead of "Gaza City") exposed how the gazetteer's name system is
(mis)used. All figures below were measured read-only against the live `data/news.db`.

## 1. The requirement

We want place-name handling where:

1. **English is the primary key for display and retrieval** — lists, typeahead, and the
   default search index all speak English.
2. **Names in any language are still findable** — an article or query in Arabic, Chinese,
   Russian, etc. resolves to the right place, with correct translations / cross-references.
3. **The store is well-normalized** — it doesn't bloat the DB or make searches slow.

The good news: **the schema already supports all three. The bug was in how we *used* it,
not in the design.** This report documents what exists, what's wrong, and the concrete
shape to standardize on.

## 2. What exists today (measured)

Two tables carry the gazetteer:

- **`places`** — 14,544 rows, one per real place. Key columns: `id`, `kind`
  (country/region/city/…), `country_code`, `population`, `wikidata_qid`, `osm_id`, and
  crucially **`canonical_name_id`** → a FK into `place_names.id`.
- **`place_names`** — **810,278 rows** (avg **~55 names per place**). Columns: `id`,
  `place_id`, `name`, `normalized`, `lang`, `script`, `name_kind`, `is_preferred`,
  `is_official`, `source`. Indexes: a UNIQUE `(place_id, normalized, lang, name_kind)` plus
  non-unique indexes on `place_id`, `normalized`, `name`, and `lang`. The **max names for a
  single place is 713** (place 1252, "Flemish Community" — genuinely many languages). *(An
  apparent outlier of 12,438 belongs to the synthetic sentinel `place_id=999999` — see §2.1;
  it is NOT a real place.)*

Also present and useful: **`place_external_ids`** (geonames / osm / wikidata / restcountries
ids — authority cross-references) and `place_hierarchy` (parent/child containment).

### The parts that already do the right thing

- **`places.canonical_name_id` IS the English-primary anchor.** It is populated for
  **14,520 / 14,544 places (99.8%)**, and the name it points at is **English for 14,181
  places (97.5%)** (98% counting `und`/`eng`). Examples: place 10200 → **"Gaza City" (en)**,
  place 21 → **"London" (en)**. *This is the field display and English retrieval should use.*
- **`place_names` IS the translation / alias table.** Every language variant of a place is a
  row keyed by the same `place_id`, so "London"/"Londres"/"Лондон"/"伦敦" all fold to place 21.
  This is what makes non-English input resolvable.
- **`normalized`** is a lowercased (and, in the ingest module, script-/accent-folded) search
  key, and it is indexed — so a lookup by any-language surface form is O(log n).
- **English coverage is excellent**: **14,335 / 14,544 places (98.6%)** have an English or
  `und` name, so an English-primary policy leaves almost nothing unnamed.

### The part that is a footgun — `is_preferred`

`is_preferred` looks like "the preferred display name" but is **not**:

- **565,501 of 810,278 rows (70%)** have `is_preferred = 1`.
- That is an average of **38.9 preferred names *per place***, up to **533** for one place.

So `is_preferred` actually means *"a preferred spelling **within its language**"* (roughly one
per language), **not** "the one canonical name for the place." Selecting a display name with
`WHERE is_preferred = 1 LIMIT 1` therefore returns an **arbitrary language** — which is exactly
how a place surfaced as 加薩 (Chinese) instead of "Gaza City". **`is_preferred` must never be
used as a place-level display key.** Use `canonical_name_id`.

### Is it bloated / slow? Not yet — but the growth vector is real

- Names are short (avg **9.4** chars; `normalized` avg **9.0**). At 810k rows across the table
  plus its four secondary indexes, `place_names` is on the order of ~100–150 MB — roughly
  **0.5%** of the 28 GB database. **It is not a space problem today, and `normalized`-indexed
  lookups are fast.**
- The average of ~55 names/place is high because the gazetteer ingested *every* OSM/Wikidata
  `name:xx` tag, including obscure dialects a news system will never search. That is uncurated
  recall the index still has to carry. It is cheap now; it would matter if the gazetteer grows
  an order of magnitude. (The real per-place max is 713 — see §2.1 for the one apparent outlier.)

### 2.1 The one "12,438-name place" is a duplication bug on a sentinel — not a real place

Investigating the apparent max surfaced a separate data-quality defect worth recording:

- `place_id=999999` (`kind='planet'`, no `country_code`, no `canonical_name_id`,
  `population=8,000,000,000`) is a **synthetic catch-all sentinel** — the "Earth/World" bucket
  that unmatched place references were assigned to (it is the same 999999 the legacy
  `basic_string_match` matcher dumped the common word "world" onto).
- Its 12,438 `place_names` rows are only **3 distinct strings** — **"Earth" ×6,219, "World"
  ×6,218, "world" ×1**, all `lang='en'`. It is the same two words re-inserted ~6,200 times,
  almost certainly by a bootstrap/ingest step that ran repeatedly.
- **Why the UNIQUE index didn't dedupe them:** every one of those rows has `normalized = NULL`,
  and SQLite treats `NULL` as *distinct* in a UNIQUE index (`NULL ≠ NULL`), so no two rows ever
  collided on `(place_id, normalized, lang, name_kind)`. This is the same NULL-key semantics the
  http_responses dedup had to work around.
- **Impact:** ~12,436 pure-duplicate rows. Harmless to search correctness, and the cycle-84
  enrichment references 999999 **zero times** (the tier/confidence filter excludes it).
- **FIXED (2026-07-23).** Root cause: `seedBootstrapData` (ncdb
  `src/db/sqlite/access/legacy-bootstrapSeed.ts`) inserts the planet names with
  `INSERT OR IGNORE` but **omitted `normalized`** — so with `normalized=NULL` the OR IGNORE never
  saw a conflict and re-inserted "Earth"/"World" on every DB open (it runs per connection). The
  fix sets `normalized = normalizeName(name)` on insert, which makes the OR IGNORE genuinely
  idempotent (verified: seeding 3× yields 2 rows; a restart no longer grows the sentinel).
  The accumulated rows were swept via `tools/db/cleanup-place-names.js` (copy-verify-swap for the
  main 12,436; in-place transaction for the 2-row residual), leaving the sentinel at 2 clean rows,
  `null_normalized=0`, `quick_check ok`. **Lesson: a NULL in a UNIQUE-index column silently defeats
  both the index AND `INSERT OR IGNORE` — always set every column of a unique key.**

## 3. Recommended design (standardize on this)

The model is **"resolve wide, display narrow"**: match against every language, display and
index in English.

### A. Display & English retrieval → always `canonical_name_id`

- One authoritative English name per place, via `places.canonical_name_id → place_names.name`.
- Fallback only for the ~24 places whose `canonical_name_id` is NULL: pick an English-ranked
  name (`ORDER BY lang IN ('en',…) DESC, lang='und' DESC, is_official DESC, …`).
- This is now implemented in `tools/intelligence/place-articles.js` (`enDisplayName`) and is
  the pattern any UI/endpoint should copy. **Deprecate `is_preferred` for display.**

### B. Multilingual recall → resolve via `place_names.normalized`

- Normalize the incoming query/mention the *same way* the stored `normalized` was produced
  (lowercase + Unicode accent/script fold), then look it up on the `idx_place_names_norm`
  index to get `place_id`. This resolves Arabic/Chinese/Russian/… input to the right place.
- Then display via (A). This gives "find in any language, show in English" for free.

### C. Keep it fast at the hot English path → a slim display projection

- For English typeahead / list rendering, reading the 810k-row `place_names` (even indexed) is
  more work than needed. Add a slim materialized projection, one row per place:
  `place_display(place_id PK, en_name, normalized_en, kind, country_code, population)` — 14,544
  rows, tiny, covers the common path without touching the big table. Rebuild it from
  `canonical_name_id` on gazetteer change. (Optional; only if the English path shows up hot.)
- For fuzzy/prefix English search, an FTS5 index over `en_name` on that slim table is cheap.

### D. Anti-bloat levers (apply if/when `place_names` grows)

1. **Language-tier the alias set.** Keep English + the languages the crawler actually ingests
   (the top ~20 by article volume) + `official`/`preferred-per-lang`; move the long tail of
   dialect exonyms to a cold `place_names_archive` (or gate them behind a `name_kind` /
   `priority` column excluded from the hot search index). The places-intelligence module
   already tiers *by population*; tier names *by language relevance* the same way.
2. **Don't over-index.** `idx_place_names_name` (raw `name`) largely duplicates
   `idx_place_names_norm`; searches should go through `normalized`, so the raw-`name` index is
   a candidate to drop (measure query plans first).
3. **Redefine or rename `is_preferred`** → `is_preferred_in_lang`, so nobody mistakes it for a
   place-level canonical flag again. The place-level canonical truth is `canonical_name_id`.
4. Names are already short; a `name`/`normalized` split is worth keeping (the search key is
   distinct from the display string). Deduplicating identical cross-language strings
   (London=London=London) is **not** worth the join complexity at current scale.

### E. Cross-references / translations — already modeled, just surface them

- **Translations**: `place_names` rows sharing a `place_id` *are* the translation set — no new
  structure needed. "Give me this place in language X" = `WHERE place_id=? AND lang=?`.
- **Authority cross-refs**: `place_external_ids` (geonames/osm/wikidata) and
  `places.wikidata_qid` link each place to external canonical datasets — use `wikidata_qid` if
  you ever need to re-derive or reconcile the multilingual label set from Wikidata.

## 4. Summary

| Need | Field to use | Status |
| --- | --- | --- |
| English display / primary key | `places.canonical_name_id` | ✅ exists (99.8% pop, 97.5% en) |
| Find a place from any language | `place_names.normalized` (indexed) | ✅ exists |
| Translations of a place | `place_names` rows by `place_id` + `lang` | ✅ exists |
| Authority cross-references | `place_external_ids`, `places.wikidata_qid` | ✅ exists |
| Fast English hot path | slim `place_display` projection | ➕ optional, recommended |
| Avoid bloat as it grows | language-tier the alias index; drop dup `name` index | ➕ future, when it grows |
| **Anti-pattern to stop** | **`is_preferred` as a display key** | ❌ misleading — use `canonical_name_id` |

**Bottom line:** the database already implements an English-primary, multilingual, normalized
place-name model correctly — the canonical English name is one FK hop away (`canonical_name_id`)
and every-language recall is one indexed lookup away (`normalized`). The only real defects are
(1) code that reached for the junk `is_preferred` flag instead of `canonical_name_id` (now
fixed in place-articles.js), and (2) an uncurated long tail of dialect names that is harmless at
today's 0.5%-of-DB size but should be language-tiered before the gazetteer grows large.
