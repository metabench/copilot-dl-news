# Chapter 3: Data Sources and Trade-offs

*Reading time: 10 minutes*

---

## The Gazetteer Landscape

A gazetteer is a geographic dictionary—a list of places with their locations, names, and attributes. Several major gazetteers exist, each with different strengths.

---

## Major Data Sources

### 1. OpenStreetMap (OSM)

**What it is**: Crowdsourced global map data.

**Strengths**:
- Free and open
- Detailed administrative boundaries
- Frequent updates
- Good international coverage

**Weaknesses**:
- Inconsistent tagging (admin_level meanings vary by country)
- No canonical "priority" score
- Large data volume (planet file is 60+ GB compressed)

**What we use it for**: Administrative boundaries (countries, states/provinces, counties).

### 2. GeoNames

**What it is**: Geographic database with 12M+ place names.

**Strengths**:
- Clean hierarchy (country → admin1 → admin2 → locality)
- Population data for many cities
- Alternate names / translations
- Free for non-commercial use

**Weaknesses**:
- Less boundary detail than OSM
- Some regions under-represented
- Updates less frequent

**What we could use it for**: Enriching OSM with population data and alternate names.

### 3. Wikidata

**What it is**: Structured data behind Wikipedia.

**Strengths**:
- Rich metadata (population, founding date, coordinates)
- Multilingual names
- Links to Wikipedia articles
- Good for disambiguation signals

**Weaknesses**:
- Query complexity
- Not primarily a gazetteer
- Coverage varies by notability

**What we could use it for**: Supplementary priority signals, alternate names.

### 4. Natural Earth

**What it is**: Public domain map dataset at 1:10m, 1:50m, 1:110m scales.

**Strengths**:
- Clean, simplified geometries
- Good for visualization
- Small file sizes

**Weaknesses**:
- Low detail (no small cities)
- Static (infrequent updates)

**What we use it for**: Potentially country/admin boundaries for display (not for detailed queries).

---

## Our Data Stack

We're using **OSM-derived data via PostGIS** as the primary source:

```
┌─────────────────────────────────────────┐
│            PostGIS (planet1)            │
│  ┌─────────────┐  ┌─────────────────┐  │
│  │  countries  │  │   admin_areas   │  │
│  │  (205 rows) │  │  (873k rows)    │  │
│  └─────────────┘  └─────────────────┘  │
└─────────────────────────────────────────┘
                    ↓
           Batch sync pipeline
                    ↓
┌─────────────────────────────────────────┐
│          SQLite (news.db)               │
│  Fast lookups, normalized hierarchy     │
└─────────────────────────────────────────┘
```

### Why PostGIS + SQLite (Not Just One)

| Task | Best Tool | Why |
|------|-----------|-----|
| Spatial joins (containment) | PostGIS | Native geometry operations |
| Hierarchy construction | PostGIS | ST_Contains, ST_Area, etc. |
| Name → candidates lookup | SQLite | Faster single-row lookups |
| Article-time resolution | SQLite | No network, sub-ms latency |
| Visualization (maps) | PostGIS | GeoJSON export, simplification |

PostGIS does the heavy spatial work *once*. SQLite serves lookups *millions of times*.

---

## What We Have in PostGIS

### `countries` table

| Column | Type | Notes |
|--------|------|-------|
| name | text | English name |
| iso2 | text | 2-letter code (CA, GB, US) |
| iso3 | text | 3-letter code |
| geom_wgs84 | geometry | SRID 4326 polygon |

**Count**: ~205 rows (ISO-coded countries)

### `admin_areas` table

| Column | Type | Notes |
|--------|------|-------|
| osm_id | bigint | OSM identifier |
| name | text | Local name |
| admin_level | integer | OSM admin level (2-11) |
| way | geometry | SRID 3857 polygon |

**Count**: ~873,000 rows

### The SRID Problem

**Critical issue**: countries.geom_wgs84 is SRID 4326. admin_areas.way is SRID 3857.

Mixing SRIDs in spatial queries produces errors or wrong results. Chapter 6 covers this in depth.

---

## Data Quality Realities

### OSM admin_level Is Not Standardized

In OSM, `admin_level` meanings vary by country:

| Country | admin_level 4 | admin_level 6 |
|---------|---------------|---------------|
| USA | State | County |
| Canada | Province/Territory | — |
| UK | Country (Eng/Scot/etc.) | District |
| Germany | State (Land) | District (Kreis) |
| France | Region | Department |

**Implication**: We cannot globally say "admin_level 4 = first-level division". We need a per-country mapping.

### Boundary Artifacts

OSM boundaries sometimes have:
- Slivers at borders (tiny overlapping polygons)
- Disputed territories with multiple representations
- Historical boundaries still in data
- Very detailed coastlines (performance issue)

**Implication**: Naive `ST_Intersects` queries return false positives. We use representative points instead.

### Missing Population Data

OSM doesn't reliably have population. For priority scoring, we need to either:
- Import from GeoNames
- Estimate from area (imperfect)
- Use Wikipedia view counts (complex)

For MVP, we use **area as a proxy**: larger admin regions are more "important".

---

## Data We Need to Derive

The raw data isn't directly usable. We need to derive:

### 1. Normalized Geometry
Transform everything to SRID 4326 for consistent spatial operations.

### 2. Representative Points
For each polygon, compute a point guaranteed to be inside it:
```sql
ST_PointOnSurface(ST_Transform(way, 4326))
```

### 3. Country Membership
For each admin area: which country contains its representative point?

### 4. Admin Role Mapping
Per-country table: OSM admin_level → our role (ADM1, ADM2, LOCALITY).

### 5. Parent Chains
For each place: its parent admin areas up to country.

---

## Trade-off Summary

| Decision | Trade-off |
|----------|-----------|
| OSM over GeoNames | Better boundaries, but less clean hierarchy |
| PostGIS + SQLite | More complexity, but optimal performance |
| Area for priority | Simple, but population would be more accurate |
| Representative point | Avoids slivers, but loses polygon-level precision |
| Per-country role mapping | Manual work, but necessary for correctness |

---

## What to Build (This Chapter)

1. **Verify your PostGIS tables exist**:
   ```sql
   SELECT COUNT(*) FROM countries;  -- ~205
   SELECT COUNT(*) FROM admin_areas;  -- ~873k
   ```

2. **Check SRID reality**:
   ```sql
   SELECT ST_SRID(geom_wgs84) FROM countries LIMIT 1;  -- 4326
   SELECT ST_SRID(way) FROM admin_areas LIMIT 1;  -- 3857
   ```

3. **Sample a few admin areas**:
   ```sql
   SELECT name, admin_level, ST_Area(ST_Transform(way, 4326)::geography)/1e6 AS area_km2
   FROM admin_areas
   WHERE name = 'Ontario'
   ORDER BY area_km2 DESC
   LIMIT 5;
   ```

This confirms your baseline and surfaces any surprises before building derived tables.

---

*Next: [Chapter 4 — PostGIS Fundamentals for Gazetteer Work](./04-postgis-fundamentals.md)*
