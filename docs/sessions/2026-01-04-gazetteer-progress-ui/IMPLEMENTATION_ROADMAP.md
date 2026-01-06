# IMPLEMENTATION_ROADMAP.md

Date: 2026-01-04
Scope: Concrete phased roadmap to implement a PostGIS-backed gazetteer + deterministic place disambiguation, with validation steps.

## North-star objective
Resolve place mentions in news articles deterministically (with explanations), backed by a PostGIS hierarchy build and a fast local SQLite gazetteer cache.

## Phase 0 — Baseline inventory + invariants (0.5–1 day)
Deliverables:
- Confirm source tables and SRIDs.
- Decide on canonical SRID for derived data (recommend 4326).
- Write down invariants:
  - no SRID mismatch in spatial predicates
  - no polygon-intersects for membership without repr_pt gate

Validation:
- A small “spatial sanity” check script that:
  - prints SRIDs
  - confirms representative point containment works for a few known regions

## Phase 1 — Build normalized admin dataset (1–2 days)
Deliverables:
- In PostGIS, create derived dataset (materialized view or table):
  - `admin_areas_4326` with `way_4326`, `repr_pt_4326`, `area_km2`
- Add indexes (GIST on geometry + repr_pt).

Validation:
- Query for known entities (e.g., Ontario) returns expected geometry and nonzero area.
- Sampling: 100 random admins produce repr_pt within their own polygon.

## Phase 2 — Country membership + ADM role mapping (2–4 days)
Deliverables:
- Membership: `country_iso2` for each admin area using `ST_Contains(country.geom_wgs84, repr_pt_4326)`.
- `country_admin_roles` mapping (start with heuristics + spot checks).
- A robust “list ADM1 for country” query.

Validation:
- Canada ADM1 list contains provinces/territories and excludes Alaska/Idaho/Greenland.
- Spot-check 5 countries across continents.

## Phase 3 — Parent chain construction (2–5 days)
Deliverables:
- `admin_parents` edges for admin areas (within the same country):
  - choose smallest-area containing parent among plausible levels.
- Export parent pointers into SQLite.

Validation:
- Parent chains terminate at ADM1/country.
- No cycles.
- Random sampling shows child repr_pt is contained by parent polygon.

## Phase 4 — SQLite gazetteer snapshot builder (2–4 days)
Deliverables:
- Node-based builder script that:
  - extracts required fields from PostGIS
  - builds a SQLite DB with indexes
  - emits build report JSON
  - swaps DB atomically

Validation:
- Snapshot build completes in acceptable time (track baseline).
- Simple lookup queries return expected candidates.

## Phase 5 — Disambiguation MVP (2–4 days)
Deliverables:
- Deterministic resolver implementation per DISAMBIGUATION_ALGORITHM_SPEC.md.
- Publisher priors table (host → country/adm1).
- CLI tool to run resolver on text fixtures and print JSON.

Validation:
- Fixed fixture suite passes (London UK vs London ON etc.).
- Confidence/explanation output is stable and readable.

## Phase 6 — UI integration (optional, 2–5 days)
Deliverables:
- Data Explorer views:
  - place lookup
  - candidate inspection
  - per-article resolution trace
- Admin hierarchy browser (country → ADM1 → ADM2).

Validation:
- UI queries remain <100ms after warm cache.

## Phase 7 — Quality hardening (ongoing)
Deliverables:
- Drift detection:
  - snapshot versioning
  - regression fixtures
- Operational metrics:
  - resolution rate
  - ambiguity rate
  - top unresolved names

## Risks / unknowns
- OSM admin_level inconsistency: requires ongoing role mapping improvements.
- Boundary disputes/overlaps: may need special-casing or confidence reductions.
- Performance: parent-chain construction can be expensive; batch carefully.

## Recommended ownership / handoffs
- PostGIS hierarchy build: DB-focused agent (or DB Guardian).
- SQLite snapshot builder + CLI: CLI Toolsmith / Crawler specialist.
- Disambiguation implementation: Crawler specialist + QA tests agent.
- UI: UI Singularity.
