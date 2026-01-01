# Place Hub Guessing — Implementation Plan (UI + Testable Subsystems)

## Acceptance criteria
- A new Unified App sub-app exists: **Place Hub Guessing**.
- The UI shows a basic matrix (places × domains) with 3-state cells:
  - unchecked (no mapping)
  - checked-missing (mapping exists, status != verified)
  - checked-present (status == verified)
- Data comes from authoritative tables:
  - `places` (+ canonical name)
  - `domains` (host list)
  - `place_page_mappings` (status, last_seen_at, verified_at, url, hub_id)
  - optionally `place_hubs` (article_links_count/nav_links_count)
- A small check script exists to render the page deterministically.

## Subsystems (contracts + tests)
1) **Place inventory**
   - Input: `places`, `place_names`
   - Output: ordered list of place rows (filterable by kind)
   - Test: deterministic query returns stable fields; no null canonical names.

2) **Domain inventory**
   - Input: `domains` (and/or observed hosts from `place_page_mappings`)
   - Output: ordered list of host strings
   - Test: query returns only lowercase hosts; deduped.

3) **Coverage matrix materialization**
   - Input: selected places + selected domains
   - Output: mapping grid keyed by `place_id` + `host` with status/freshness fields
   - Test: given seeded DB, matrix correctly reflects mapping statuses.

4) **Guessing pipeline (existing)**
   - Input: places + domain + analyzer strategies
   - Output: candidates + validations + persistence
   - Test: keep existing Jest coverage; add regression tests for persistence invariants.

5) **UI rendering**
   - Input: matrix payload
   - Output: HTML table with CSS classes reflecting statuses
   - Test: check script asserts presence of legend + at least one row/column.

## Phases
### Phase 1 (this slice): Read-only matrix UI
- Add a router `createPlaceHubGuessingRouter()` that renders a matrix page.
- Mount it in Unified App and add a new sub-app entry.
- Add a `checks/` script for deterministic render.

### Phase 2: Filters + drilldown
- Add query params: kind, limit, host filter.
- Add drilldown endpoint: `/api/place/:id` or `/api/cell?placeId&host`.

### Phase 3: Actions
- Queue checks for unchecked cells.
- Re-check stale verified hubs.

## Validation commands
- `npm run test:by-path src/tools/__tests__/guess-place-hubs.test.js`
- `node src/ui/server/unifiedApp/server.js --check` (or the existing unified server check script)
- `node src/ui/server/placeHubGuessing/checks/placeHubGuessing.matrix.check.js`
