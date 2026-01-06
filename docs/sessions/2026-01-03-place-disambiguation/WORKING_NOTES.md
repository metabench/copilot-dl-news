# Working Notes – Place Name Disambiguation Strategy

- 2026-01-03 — Session created via CLI. Add incremental notes here.

- 2026-01-03 23:48 — 

## Newspaper Research Complete (2026-01-03)

### London, Ontario Newspapers
1. **The London Free Press** - Founded 1849, largest circulation in Southwestern Ontario
   - Owner: Postmedia Network
   - Website: www.lfpress.com
   - Circulation: 59,841 weekdays, 63,348 Saturdays (2015 data)
   - Weekly reach: 468,978
   - Format: Daily broadsheet, Mon-Sat
   - Notable: Founded by William Sutherland, purchased by Josiah Blackburn in 1852

### Ontario Province - Largest Daily Newspapers (by weekly circulation)
1. **Toronto Star** - 2,523,608 weekly (Mon-Sun)
   - Owner: Torstar
   - Founded: 1892
   - Website: www.thestar.com
   - Circulation drop: 22% from 2009-2015 (from ~400K to ~320K daily)

2. **The Globe and Mail** - 2,139,363 weekly (Mon-Sat, national)
   - Owner: The Woodbridge Company (Thomson family)
   - Founded: 1844
   - Website: www.theglobeandmail.com
   - Self-styled "Canada's National Newspaper"
   
3. **Toronto Sun** - 1,076,623 weekly (Mon-Sun)
   - Owner: Postmedia
   - Tabloid format

4. **The London Free Press** - 468,978 weekly (Mon-Sat)
   - Owner: Postmedia
   - Regional leader for Southwestern Ontario

### Key Insight for Disambiguation
If we're crawling articles from:
- `www.lfpress.com` → Source is definitively **London, Ontario**
- `www.thestar.com` → Source is definitively **Toronto/Ontario, Canada**
- `www.theglobeandmail.com` → Source is **national Canadian**

This is a STRONG disambiguation signal - source URL geography can override population-based tiebreakers.

### Critical Gap Confirmed
The gazetteer currently has only 2 Canadian places:
- Canada (country)
- Ottawa (city)

Missing entirely:
- Ontario (province)
- London, Ontario (population 422,324)
- Toronto (population 2.73M)
- All other Canadian cities and provinces

**Before any disambiguation logic can work for Canadian places, we must populate the gazetteer with Canadian geographic data.**

- 2026-01-04 01:20 — 

---

## Gazetteer Import Progress Visualization Brainstorm

### Context Discovered

**PostGIS `planet1` Database** (localhost, password: pg1234)
- PostGIS 3.5.3 installed
- `countries` view with `geom_wgs84` geometry columns
- `admin_areas`: 872,991 rows
- `sub_country_admin_areas`: 871,995 rows
- `country_admin_areas`: 996 rows

**Existing Infrastructure:**
- `StagedGazetteerCoordinator.js` (671 lines) - Sequential stage processing
- `geoImportServer.js` (834 lines) - Express + SSE at port 4900
- `ScanningIndicatorControl` - Green progress bar control
- Progress-tree telemetry: `crawl:progress-tree:updated|completed` events

**Historical Issue:** Dec 2025 session noted "confirm Electron widget Nested Progress panel updates live via SSE" as **never completed**.

### User Requirements
1. Progress bars (multiple levels)
2. World map visualization showing import progress
3. Country map visualization for sub-regions
4. "Really nice and informative UI"


- 2026-01-04 01:25 — 

### SVG Diagrams Created

1. **gazetteer-dashboard-concept.svg** - Full dashboard mockup with:
   - World map with country fill colors (complete/in-progress/pending)
   - Multi-level progress bar stack (Overall, Countries, ADM1, ADM2, Cities)
   - Statistics panel (records, rate, ETA, current region)
   - Activity log panel with timestamped entries

2. **gazetteer-pipeline-architecture.svg** - Technical architecture showing:
   - 4-stage pipeline (Countries → ADM1 → ADM2 → Cities)
   - Telemetry events (SSE) structure
   - UI components breakdown

3. **gazetteer-country-focus-view.svg** - Drill-down view showing:
   - France map with ADM1 regions colored by status
   - Currently processing region highlighted with glow
   - Department-level progress bars
   - Current activity details (commune being processed)

### Key Technical Discoveries

**PostGIS planet1 Database:**
- PostGIS 3.5.3 installed ✓
- `countries` view with `geom_wgs84` geometry
- 872,991 admin_areas rows
- 996 country_admin_areas
- Can export GeoJSON via `ST_AsGeoJSON(ST_Simplify(geom_wgs84, 0.01))`

**Data Flow:**
```
PostGIS (planet1)
    ↓ ST_AsGeoJSON
GeoJSON
    ↓ transform
SVG Paths
    ↓ SSE events
Dynamic color fills
```

