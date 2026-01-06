# Gazetteer Import Progress Visualization Brainstorm

## Problem Statement
When importing gazetteer data, the system "got stuck" previously and users had no visibility into progress. Progress bars "never got working." We need a "really nice and informative UI" that shows:
- Overall import progress
- Per-stage progress (countries → ADM1 → ADM2 → cities)
- Geographic visualization on world/country maps

## Known Infrastructure

| Component | Location | Role |
|-----------|----------|------|
| StagedGazetteerCoordinator | `src/crawler/gazetteer/` | Sequential stage orchestration |
| geoImportServer | `src/ui/server/geoImportServer.js` | Express + SSE, port 4900 |
| PostGIS planet1 | localhost | 872K+ admin areas with geometries |
| ScanningIndicatorControl | jsgui3 control | Green progress bar |

## Brainstorm Options

### Option 1: Multi-Level Progress Bar Stack
**Impact:** Clear hierarchical progress visibility  
**Effort:** M  
**Risk:** UI clutter if too many bars  
**Domains:** UI

A vertical stack of progress bars showing:
```
┌─ Overall Import ─────────────────────────────── 45% ─┐
│ ██████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
└──────────────────────────────────────────────────────┘
┌─ Stage: Countries ────────────────────────── COMPLETE ─┐
│ ████████████████████████████████████████████████████ │
└────────────────────────────────────────────────────────┘
┌─ Stage: ADM1 Regions ──────────────────────────── 78% ─┐
│ ██████████████████████████████████████░░░░░░░░░░░░░░ │
└────────────────────────────────────────────────────────┘
┌─ Current: France - Île-de-France ─────────────────────┐
│ Processing: Paris, Versailles, Créteil...             │
└────────────────────────────────────────────────────────┘
```

### Option 2: World Map Heat-Fill Visualization
**Impact:** Highly informative geographic context  
**Effort:** L  
**Risk:** Requires good map rendering; polygon complexity  
**Domains:** UI, Data

World map where countries fill in as imported:
- **Gray:** Not started
- **Yellow:** In progress (current stage)  
- **Green:** Complete
- **Red:** Failed/error

Uses PostGIS `countries` view geometry for fills.

### Option 3: Tree View with Live Updates
**Impact:** Detailed hierarchical view  
**Effort:** M  
**Risk:** Can become overwhelming at ADM2 level  
**Domains:** UI

Collapsible tree structure:
```
▼ 🌍 World Import (45%)
  ▼ 🇬🇧 United Kingdom ✓
    ▼ England ✓
      ▼ Greater London ✓
        ├ City of London ✓
        ├ Westminster ✓
        └ Camden ✓
  ▼ 🇫🇷 France (78%)
    ▼ Île-de-France (60%)
      ├ Paris ✓
      ├ Versailles ⏳
      └ Créteil ○
    ○ Normandy
    ○ Brittany
```

### Option 4: Dashboard with Map + Metrics + Log
**Impact:** Comprehensive single-pane view  
**Effort:** L  
**Risk:** Layout complexity  
**Domains:** UI, Tooling

Three-panel layout:
1. **Left:** World map with colored fills
2. **Right-Top:** Progress bars + statistics
3. **Right-Bottom:** Live activity log

### Option 5: Animated Progress Timeline
**Impact:** Shows velocity and ETA  
**Effort:** M  
**Risk:** Animation performance  
**Domains:** UI

Timeline showing:
- X-axis: Time elapsed
- Y-axis: Records imported
- Live cursor showing current position
- Projected line showing ETA

## Recommended Approach: Hybrid Option 4 + Option 1

Combine the dashboard layout with multi-level progress bars:

**Layout:**
```
┌────────────────────────────────────────────────────────────┐
│                    GAZETTEER IMPORT                         │
├─────────────────────────────┬──────────────────────────────┤
│                             │  ┌─ Overall ────── 45% ─┐    │
│                             │  │ █████████░░░░░░░░░░░ │    │
│         WORLD MAP           │  └──────────────────────┘    │
│                             │  ┌─ Countries ──── 100% ─┐   │
│    (countries fill green    │  │ ████████████████████ │    │
│     as they complete)       │  └──────────────────────┘    │
│                             │  ┌─ ADM1 ─────────── 78% ─┐  │
│                             │  │ ████████████████░░░░ │    │
│                             │  └──────────────────────┘    │
├─────────────────────────────┼──────────────────────────────┤
│  🇫🇷 France - Processing    │  📊 Statistics               │
│  └ Île-de-France           │  Records: 12,456 / 27,800    │
│    └ Paris ✓ Versailles ⏳  │  Rate: 42/sec                │
│                             │  ETA: 6m 23s                 │
├─────────────────────────────┴──────────────────────────────┤
│  [Activity Log - scrolling]                                 │
│  01:23:45 ✓ Imported: France > Île-de-France > Paris       │
│  01:23:46 ⏳ Processing: France > Île-de-France > Versailles│
└────────────────────────────────────────────────────────────┘
```

## Technical Implementation Notes

### Map Rendering Options
1. **SVG with PostGIS GeoJSON export** - Export country shapes as GeoJSON, convert to SVG paths
2. **Leaflet/MapLibre** - Use existing map library with tile layer
3. **Pre-baked world SVG** - Use Natural Earth simplified world map, color-code countries by data-* attributes

### SSE Event Structure
```javascript
// crawl:progress-tree:updated
{
  type: 'progress',
  stage: 'adm1',
  current: { country: 'FR', region: 'Île-de-France' },
  stats: {
    total: 27800,
    completed: 12456,
    rate: 42,
    eta: 383 // seconds
  },
  countries: {
    'GB': 'complete',
    'FR': 'in-progress',
    'DE': 'pending'
  }
}
```

### PostGIS Query for Country Shapes
```sql
SELECT 
  osm_id,
  name,
  ST_AsGeoJSON(ST_Simplify(geom_wgs84, 0.01)) as geojson
FROM countries
ORDER BY name;
```

## Coverage Checklist
- [x] UI - Progress bars, map, tree view
- [x] Data - PostGIS integration, GeoJSON export
- [x] Tooling - SSE events, telemetry
- [ ] Operations - Logging, error handling

## Next Steps
1. Create SVG diagrams illustrating the UI concepts
2. Build prototype using existing geoImportServer.js
3. Wire SSE events to update map fills in real-time
4. Add ETA calculation based on observed rate

