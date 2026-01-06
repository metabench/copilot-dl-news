# GAZETTEER_SYNC_STRATEGY.md

Date: 2026-01-04
Scope: Keep a local, query-fast gazetteer in SQLite that is derived from PostGIS/OSM data, supports deterministic disambiguation, and stays refreshable.

## Goals
- Interactive queries (Data Explorer / UI) should be fast: target <100ms for typical lookups.
- Disambiguation pipeline should avoid repeated PostGIS queries per article.
- Gazetteer snapshot should be versioned and refreshable.
- Data should be explainable: store provenance (OSM id, source table, build timestamp).

## Architecture: PostGIS as source-of-truth, SQLite as serving cache
- **PostGIS**: heavy spatial joins, hierarchy construction, geometry transforms.
- **SQLite**: name → candidate lookup, name expansion, compact geometry payloads (simplified), precomputed parent pointers.

This makes article-time resolution cheap and deterministic.

## What to store in SQLite (recommended schema sketch)
### 1) `places`
Each record is a resolvable entity.

Suggested columns:
- `place_id` (integer PK)
- `source` (e.g., `osm_country`, `osm_admin`, later `geonames`, `wikidata`)
- `source_id` (e.g., osm id)
- `kind` (`country`, `adm1`, `adm2`, `locality`, `poi`)
- `name`
- `name_norm` (lowercased + normalized)
- `country_iso2`
- `adm1_id` (FK to places.place_id)
- `adm2_id` (FK)
- `lat`, `lng` (representative point)
- `priority_score` (numeric; can be derived from area/population proxy)
- `area_km2` (for admin polygons)
- `bbox_min_lng`, `bbox_min_lat`, `bbox_max_lng`, `bbox_max_lat`
- `geom_simplified_geojson` (optional; capped size)
- `updated_at`, `snapshot_id`

Indexes:
- `INDEX places_name_norm ON places(name_norm)`
- `INDEX places_country_kind ON places(country_iso2, kind)`

### 2) `place_names`
Map alternate spellings/abbreviations to `place_id`.
- `name_norm`
- `place_id`
- `kind` (`abbrev`, `historic`, `local`, `misspelling`)

Index:
- `INDEX place_names_name_norm ON place_names(name_norm)`

### 3) `place_parents`
If you want to keep parent pointers separate (or multiple):
- `child_place_id`
- `parent_place_id`
- `parent_kind`
- `confidence`

### 4) `snapshots`
Track build metadata.
- `snapshot_id`
- `source_signature` (e.g., planet extract timestamp/hash)
- `built_at`
- `notes`

## Sync pipeline (batch job)
High-level steps:
1) Extract/normalize from PostGIS:
   - Countries (iso2, name, geom).
   - Admin areas (name, admin_level, normalized geometry, repr_pt).
   - Derived hierarchy edges (country membership + parent admin chains).
2) Map OSM admin_level → `kind` using `country_admin_roles`.
3) Emit a single **snapshot** into SQLite.
4) Swap snapshot atomically (or use `snapshot_id` versioning).

### Snapshot swap strategy
Prefer “build new DB then swap”:
- Build `data/gazetteer.new.db`.
- Verify integrity (counts, indexes, constraints).
- Replace `data/gazetteer.db` atomically.

This ensures readers always see a consistent dataset.

## Refresh strategy
Two cadence tiers:
- **Slow (weekly/monthly)**: refresh admin boundaries/hierarchy from new OSM.
- **Fast (daily)**: refresh small name tables or publisher priors (if stored).

Because OSM boundary updates are heavy, separate them from lightweight “knowledge” refreshes.

## Performance considerations
- Keep geometry payloads optional and small:
  - Store only simplified GeoJSON for display (countries + ADM1).
  - For disambiguation, lat/lng + parent pointers are sufficient.
- Use SQLite FTS5 for name search (optional but recommended):
  - `places_fts(name, name_norm, country_iso2, kind)` with triggers or batch rebuild.

## Data quality checks (must-have)
Run on every snapshot build:
- Every `places` row has `country_iso2` (except maybe global regions).
- Every `adm2` has an `adm1_id` when possible.
- No cross-country parent pointers.
- Sample queries:
  - Top ambiguous names (“london”, “paris”) have >1 candidates.
  - Per-country ADM1 counts are within expected ranges.

## How this fits the disambiguation algorithm
At article time, for each mention:
- Query SQLite: `name_norm` → candidates.
- Use parents/priors to score quickly.
- Only fall back to PostGIS when:
  - new mention not in SQLite
  - debugging mode
  - rebuilding/validating hierarchy

## Operational notes
- Keep the gazetteer builder a Node script (no Python).
- Emit a JSON report artifact per build (counts, timings, worst-case name collisions).
- Store build logs under the current session folder when iterating.
