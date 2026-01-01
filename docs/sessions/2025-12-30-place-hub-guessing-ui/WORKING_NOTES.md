# 2025-12-30 — Place Hub Guessing UI + Schema Fix

## Jest regression: legacy `fetches` table

### Symptom
- `npm run test:by-path src/tools/__tests__/guess-place-hubs.test.js`
- Failure: `SqliteError: no such table: fetches` (from `createGuessPlaceHubsQueries` preparing `SELECT ... FROM fetches`)

### Fix
- Migrated `createGuessPlaceHubsQueries` off legacy `fetches`.
	- Reads latest fetch from `http_responses`.
	- Writes fetches via `http_responses` and updates `urls.host` when available.
	- Coverage metric counts now join `http_responses` → `urls`.
- Updated tests to assert against:
	- `place_hubs_with_urls` (instead of selecting `url` from `place_hubs`)
	- `http_responses` (instead of `fetches`)

### Evidence
- PASS: `npm run test:by-path src/tools/__tests__/guess-place-hubs.test.js` (4/4)

## Broader tests (place hubs API)

### Evidence
- PASS: `npm run test:by-path tests/server/api/place-hubs.test.js` (6/6)

## Place Hub Guessing UI v1

### Changes
- Matrix now has a filter form (kind/pageKind/placeLimit/hostLimit + place/host substring filters)
- Cells are clickable: drilldown at `/place-hubs/cell?placeId=...&host=...`
- Drilldown supports marking a cell verified via POST `/place-hubs/cell/verify`
	- Writes an UPSERT into `place_page_mappings`
	- Stores `evidence` JSON with `presence: present|absent` (keeps `status='verified'` for compatibility)
	- Updates `verified_at` / `last_seen_at` to now

### Evidence
- PASS: `node src/ui/server/placeHubGuessing/checks/placeHubGuessing.matrix.check.js` (7/7)

# Working Notes – Place Hub Guessing UI + Testable Subsystems

- 2025-12-30 — Session created via CLI. Add incremental notes here.
