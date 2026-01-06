# POSTGIS_HIERARCHY_DESIGN.md

Date: 2026-01-04
Scope: Designing a reliable administrative hierarchy + containment model on top of OSM-derived PostGIS data (countries + admin areas), suitable for fast, deterministic place resolution and UI queries.

## Context & constraints (facts learned so far)
- `countries.geom_wgs84` is SRID 4326 (WGS84 lon/lat).
- `admin_areas.way` is SRID 3857 (Web Mercator).
- Naive `ST_Intersects(admin_areas.way, countries.geom_wgs84)` fails (SRID mismatch) or yields wrong results when transformed incorrectly.
- Even after SRID fixes, naive “ADM1 inside country” queries can return cross-border/admin artifacts (e.g., Alaska/Idaho/Greenland showing up for Canada), meaning we need stronger hierarchy logic than just intersects.

## Goal
Provide a **stable, queryable hierarchy**:
- Given a place (point or polygon), quickly find its country and admin parents.
- Given a country, list its “ADM1-ish” regions reliably.
- Keep it deterministic, explainable, and index-friendly.

## Design overview
We should treat hierarchy construction as a **derived dataset** built from raw OSM admin boundaries.

Core idea:
1) Normalize geometry SRIDs into a common working SRID (prefer 4326 for geography semantics).
2) Derive a **containment graph** using point-in-polygon (centroid or representative point) rather than polygon intersects.
3) Layer in **role mapping** (what counts as ADM1/ADM2 varies per country).

### Why point-in-polygon, not polygon intersects
Polygon intersects is too permissive: any overlap yields a match.
Point-in-polygon (using a representative point) captures “the region that contains this feature” and avoids many cross-border slivers.

Recommended primitive:
- `ST_Contains(country.geom_wgs84, ST_Transform(admin.way, 4326))` is expensive and still polygon-vs-polygon.
- Prefer: `ST_Contains(country.geom_wgs84, admin.repr_pt_4326)` where `repr_pt_4326 = ST_PointOnSurface(ST_Transform(admin.way, 4326))`.

`ST_PointOnSurface` guarantees the point lies within the geometry (unlike centroid for concave shapes).

## Proposed derived tables / materialized views
These are conceptual; implementation can be a materialized view or a persisted table depending on refresh strategy.

### 1) `admin_areas_4326` (normalized geometry + representative point)
Fields (conceptual):
- `admin_osm_id` (stable identifier if present)
- `name`
- `admin_level` (OSM)
- `way_4326` (geometry)
- `repr_pt_4326` (POINT)
- `area_km2` (computed)

Key computations:
- `way_4326 = ST_Transform(way, 4326)`
- `repr_pt_4326 = ST_PointOnSurface(way_4326)`
- `area_km2 = ST_Area(way_4326::geography) / 1e6`

Indexes:
- GIST on `way_4326`
- GIST on `repr_pt_4326`
- BTree on `(admin_level)`
- Optional: `(lower(name))` for lookup.

### 2) `admin_parents` (containment edges)
Goal: parent pointers for each admin area.

Fields:
- `child_admin_id`
- `parent_admin_id`
- `parent_kind` (e.g., `country`, `admin_area`)
- `relationship` (`contains_repr_pt`, `contains_bbox_then_pt`, etc.)
- `confidence` (small integer 0–100, if we want)

Construction strategy:
- For each admin area, find containing country using repr_pt.
- For each admin area, find containing *next-higher* admin area:
  - Candidate parents are admin areas with smaller admin_level (numerically smaller often means larger region, but country-specific exceptions exist).
  - Choose the minimal-area containing candidate among plausible parent levels.

This produces a DAG/forest per country.

### 3) `country_admin_roles` (country-specific admin mapping)
OSM `admin_level` meanings vary. We need a per-country mapping to interpret levels as “ADM1/ADM2/ADM3 …” in our system.

Fields:
- `country_iso2`
- `osm_admin_level`
- `role` (e.g., `ADM1`, `ADM2`, `LOCALITY`, `UNKNOWN`)
- `notes`

How to populate initially:
- Default mapping heuristics per region (e.g., many countries use 4 for ADM1).
- Then refine per country where it diverges.

This mapping is what lets us answer “ADM1 list for country” reliably.

## Query patterns
### A) List ADM1 for country (robust)
Instead of “intersects country polygon”, use:
1) Determine which OSM `admin_level` corresponds to `ADM1` for that country (from `country_admin_roles`).
2) Select admin areas whose repr_pt lies within the country polygon and whose level matches.

Pseudo-SQL:
```sql
SELECT a.*
FROM admin_areas_4326 a
JOIN country_admin_roles r
  ON r.country_iso2 = $1 AND r.role = 'ADM1' AND r.osm_admin_level = a.admin_level
JOIN countries c
  ON c.iso2 = r.country_iso2
WHERE ST_Contains(c.geom_wgs84, a.repr_pt_4326)
ORDER BY a.area_km2 DESC;
```

### B) Resolve a point to country + parents
```sql
-- given lng/lat
WITH p AS (
  SELECT ST_SetSRID(ST_MakePoint($lng, $lat), 4326) AS pt
)
SELECT c.iso2, c.name
FROM countries c, p
WHERE ST_Contains(c.geom_wgs84, p.pt);
```

Then resolve parent admin chain by selecting containing admins with decreasing area.

### C) Resolve a name (fast)
Name lookup should be served from SQLite cache (see GAZETTEER_SYNC_STRATEGY.md), but PostGIS can be used for backstop:
- BTree on `lower(name)`
- Optional trigram index if available.

## Handling problematic cross-border artifacts (Canada example)
Why Alaska/Idaho/Greenland can appear:
- “Intersects” matches slivers or topological artifacts.
- Some admin polygons are large and touch borders.
- Some datasets include disputed/overlapping boundaries.

Mitigations (ranked):
1) Use `repr_pt` containment instead of intersects.
2) Require that `repr_pt` is within country AND that `ST_Area(ST_Intersection(country, admin)) / ST_Area(admin)` exceeds a threshold (e.g., > 0.80) when you must do polygon intersection.
3) Use `ST_Covers` vs `ST_Contains` depending on boundary inclusivity.
4) As a safety valve, add a `country_hint` column derived from best match during build time.

## Refresh strategy
Two viable options:
- **Materialized views** refreshed periodically (simple, but refresh can be heavy).
- **Persisted derived tables** updated in a batch job (more control; preferred for large data).

Given size (~873k admin areas), plan for incremental/batched refresh:
- Recompute normalized geometry + repr_pt once.
- Build containment edges per country.

## What success looks like
- `ADM1` list for a country returns only that country’s first-level regions.
- Any query that joins country/admin uses consistent SRID and avoids polygon-intersects as the primary membership test.
- Hierarchy edges are reproducible and can be regenerated deterministically from a given data snapshot.
