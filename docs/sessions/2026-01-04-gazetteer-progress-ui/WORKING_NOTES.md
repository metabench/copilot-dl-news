# Working Notes – Gazetteer Import Progress Visualization

- 2026-01-04 — Session created via CLI. Add incremental notes here.

- 2026-01-04 02:08 — 

## PostGIS CLI Tools & Lab Development

### What was built

1. **postgis-explore.js** - Full CLI tool for PostGIS database exploration
   - `--stats` - Show database statistics ✅
   - `--countries` - List all countries with area, vertices, wikidata ✅
   - `--country <code>` - Get detailed country info ✅
   - `--geojson <code>` - Export country as GeoJSON ✅
   - `--search <term>` - Search places by name ✅
   - `--adm1 <code>` - List ADM1 regions (provinces/states) 🔄 (needs refinement)

2. **lab-060-postgis-world-map.js** - Interactive Leaflet map lab (created but not tested due to background process limitations)

### Key PostGIS Findings

- **Database**: `planet1` with PostGIS 3.5.3
- **SRID Mismatch**: Countries view is SRID 4326 (WGS84), admin_areas is SRID 3857 (Web Mercator)
- **Data Volume**: 205 countries with ISO codes, 872,991 admin areas (levels 2-11)
- **Admin Levels**: Level 4 = provinces/states, Level 6 = counties, Level 8 = cities

### ADM1 Query Challenge

The query to find provinces within a country is complex because:
1. SRID transformation needed (4326 → 3857 for ST_Intersects)
2. Cross-border regions show up (Alaska, Idaho show for Canada query)
3. OSM admin_level=4 doesn't have explicit country parent reference
4. Natural Earth boundaries may not align perfectly with OSM

**Current approach**: Use ST_Contains with centroid instead of ST_Intersects, but still imperfect.

**Better approach for future**: 
- Filter by area > 1000 km² to exclude small islands
- Use OSM hstore tags (e.g., `ISO3166-1:alpha2`) if available
- Cross-reference with country_admin_areas table if it has parent relationships

### Files Created

- `tools/dev/postgis-explore.js` - Main CLI tool
- `labs/lab-060-postgis-world-map.js` - Leaflet map lab
- `tmp/postgis-check.js`, `tmp/pg-schema.js`, etc. - Test scripts
- `tmp/canada.geojson` - Exported Canada geometry (68.4 KB)

## Background Tasks “Distance Monitor” (Electron)

- 2026-01-04 — Added a lightweight Electron entrypoint that starts the existing background-tasks UI server in-process and opens `/background-tasks` in a large window (for long-running, multi-stage jobs).
- New file: `src/ui/electron/backgroundTasksMonitor/main.js`
- New script: `npm run electron:background-tasks`

## Gazetteer Import Simulation Lab

- 2026-01-04 — Created `labs/gazetteer-import-simulation/` to prototype the import UI and agent logging.
- **Goal**: Simulate adding Canadian places to the gazetteer with a visual dashboard and machine-readable logs.
- **Components**:
  - `simulation.js`: Emits events and writes NDJSON logs to `docs/agi/logs/`.
  - `server.js`: Express server with SSE endpoint `/events`.
  - `index.html`: Dashboard with progress bar, item list, and raw log view.
- **Agent Observability**: The lab writes structured logs (`IMP` app code) that agents can read via `docs_memory_getLogs` or by parsing the NDJSON file. This allows agents to "watch" the import process and verify it's working correctly.

## 2026-01-06 Place Hub Guessing Fixes

### Issues Resolved
1. **Matrix Crash**: placeHubGuessingUiQueries.js was querying place_hubs for url column, which doesn't exist (it is in place_hubs_with_urls VIEW).
   - *Fix*: Switched selectCandidates to use place_hubs_with_urls.
2. **Missing Countries in Matrix**: Suriname and Tuvalu were missing from the matrix despite being in the DB.
   - *Root Cause*: uildMatrixModel clamped placeLimit to max 200. There are ~249 countries.
   - *Fix*: Increased max clamp to 500 in placeHubGuessingUiQueries.js.
3. **Check Script Failures**: placeHubGuessing.guardian.check.js failed on regex for stats and missing places.
   - *Fix*: Updated script to look for matrix-stats class and increased check limit to 300.

### Verification
- **Backend**: Verified guessPlaceHubsForDomain correctly identifies 200/404 URLs and caches results.
- **UI**: Verified enderPlaceHubGuessingMatrixHtml renders 18/18 checks green in placeHubGuessing.guardian.check.js.

