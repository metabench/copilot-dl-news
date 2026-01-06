# Chapter 4: PostGIS Fundamentals for Gazetteer Work

*Reading time: 15 minutes*

---

## What is PostGIS?

PostGIS is a spatial database extension for PostgreSQL. It adds:
- Geometry types (points, lines, polygons)
- Spatial functions (containment, intersection, distance)
- Spatial indexes (for fast queries)

For gazetteer work, we use PostGIS primarily for:
- Storing country and admin boundaries
- Computing containment relationships
- Exporting simplified geometries for display

---

## Core Concepts

### Geometries vs Geographies

PostGIS has two spatial types:

| Type | Coordinates | Distance Units | Use Case |
|------|-------------|----------------|----------|
| `geometry` | Cartesian (x, y) | Projection units | Most operations |
| `geography` | Lon/lat on sphere | Meters | Accurate area/distance |

**Key rule**: To get area in km², cast to geography:
```sql
ST_Area(geom::geography) / 1000000  -- square km
```

### What is SRID?

SRID = Spatial Reference System Identifier. It tells PostGIS how to interpret coordinates.

| SRID | Name | Coordinates | Common Use |
|------|------|-------------|------------|
| 4326 | WGS84 | Lon/lat degrees | GPS, web maps |
| 3857 | Web Mercator | Meters from 0,0 | OSM tiles, Google Maps |

**Critical**: You cannot mix SRIDs in spatial predicates. This fails or gives wrong results:
```sql
-- BAD: Mixing 4326 and 3857
ST_Contains(country.geom_4326, admin.way_3857)  -- ❌
```

Always transform first:
```sql
-- GOOD: Same SRID
ST_Contains(country.geom_4326, ST_Transform(admin.way, 4326))  -- ✓
```

---

## Essential Functions

### Containment

**ST_Contains(A, B)**: True if B is completely inside A.
```sql
-- Is this point inside Canada?
SELECT ST_Contains(
  (SELECT geom_wgs84 FROM countries WHERE iso2 = 'CA'),
  ST_SetSRID(ST_MakePoint(-79.38, 43.65), 4326)  -- Toronto
);
-- Returns: true
```

**ST_Covers(A, B)**: Like Contains, but also true if B is on boundary of A.

**ST_Within(A, B)**: Inverse of Contains (A is inside B).

### Points from Polygons

**ST_Centroid(geom)**: Geometric center. May fall outside concave polygons!
```sql
-- The centroid of a crescent might be outside the crescent
SELECT ST_Centroid(crescent_geom);  -- Could be in empty space
```

**ST_PointOnSurface(geom)**: A point guaranteed to be inside the geometry.
```sql
-- Always inside, even for weird shapes
SELECT ST_PointOnSurface(crescent_geom);  -- ✓ Inside
```

**For our use case**: Always use `ST_PointOnSurface` for representative points.

### Area and Distance

**ST_Area(geom)**: Area in SRID units.
```sql
-- In SRID 3857 (meters), this gives square meters
SELECT ST_Area(way) FROM admin_areas LIMIT 1;  -- e.g., 123456789012

-- For accurate km², cast to geography (requires 4326)
SELECT ST_Area(ST_Transform(way, 4326)::geography) / 1e6 AS km2
FROM admin_areas LIMIT 1;  -- e.g., 1076395.23
```

**ST_Distance(A, B)**: Distance between geometries.

### Simplification

**ST_Simplify(geom, tolerance)**: Reduce geometry complexity.
```sql
-- Simplify for export (tolerance in SRID units)
SELECT ST_Simplify(geom_wgs84, 0.01) FROM countries;
```

For web display, simplified geometries load faster.

### Export

**ST_AsGeoJSON(geom)**: Export as GeoJSON string.
```sql
SELECT ST_AsGeoJSON(ST_Simplify(geom_wgs84, 0.01))
FROM countries WHERE iso2 = 'CA';
```

---

## Spatial Indexes

PostGIS uses GiST indexes for fast spatial queries.

### Creating Indexes

```sql
-- Index on geometry column
CREATE INDEX idx_admin_way ON admin_areas USING GIST (way);

-- Index on transformed geometry (slower to build, faster to query)
CREATE INDEX idx_admin_way_4326 ON admin_areas 
  USING GIST (ST_Transform(way, 4326));
```

### When Indexes Help

Indexes speed up:
- `ST_Contains(big_polygon, small_point)` — finds containing polygon fast
- `ST_Intersects(A, B)` — finds overlapping geometries
- `ST_DWithin(A, B, distance)` — finds nearby geometries

Indexes don't help if you transform in the query without a functional index.

---

## Practical Query Patterns

### Pattern 1: Find Containing Country

```sql
-- Given a point, find which country contains it
SELECT c.name, c.iso2
FROM countries c
WHERE ST_Contains(c.geom_wgs84, ST_SetSRID(ST_MakePoint($lon, $lat), 4326));
```

### Pattern 2: List Admin Areas in a Country

**Naive (slow, wrong)**:
```sql
-- DON'T: SRID mismatch and uses intersects
SELECT a.name
FROM admin_areas a
JOIN countries c ON ST_Intersects(a.way, c.geom_wgs84)  -- ❌ Mixed SRIDs
WHERE c.iso2 = 'CA';
```

**Better (correct)**:
```sql
-- Use representative point containment
SELECT a.name, a.admin_level
FROM admin_areas a
JOIN countries c ON ST_Contains(
  c.geom_wgs84, 
  ST_Transform(ST_PointOnSurface(a.way), 4326)
)
WHERE c.iso2 = 'CA' AND a.admin_level = 4;
```

### Pattern 3: Compute Area

```sql
-- Area in square kilometers
SELECT 
  name,
  ST_Area(ST_Transform(way, 4326)::geography) / 1e6 AS area_km2
FROM admin_areas
WHERE name ILIKE '%ontario%'
ORDER BY area_km2 DESC
LIMIT 5;
```

### Pattern 4: Export GeoJSON

```sql
-- Simplified GeoJSON for web display
SELECT 
  iso2,
  name,
  ST_AsGeoJSON(ST_Simplify(geom_wgs84, 0.1)) AS geojson
FROM countries
WHERE iso2 IN ('CA', 'US', 'GB');
```

---

## Performance Tips

### 1. Transform Once, Store Result

Instead of transforming in every query:
```sql
-- Create derived column or materialized view
ALTER TABLE admin_areas ADD COLUMN way_4326 geometry;
UPDATE admin_areas SET way_4326 = ST_Transform(way, 4326);
CREATE INDEX idx_way_4326 ON admin_areas USING GIST (way_4326);
```

### 2. Use Representative Points

Point-in-polygon is faster than polygon-in-polygon:
```sql
-- Precompute representative points
ALTER TABLE admin_areas ADD COLUMN repr_pt geometry(Point, 4326);
UPDATE admin_areas SET repr_pt = ST_Transform(ST_PointOnSurface(way), 4326);
CREATE INDEX idx_repr_pt ON admin_areas USING GIST (repr_pt);
```

Now containment checks are fast:
```sql
SELECT a.name
FROM admin_areas a
JOIN countries c ON ST_Contains(c.geom_wgs84, a.repr_pt)
WHERE c.iso2 = 'CA';
```

### 3. Limit Geometry Exports

Don't export full-detail polygons for display:
```sql
-- Cap exported geometry size
SELECT 
  name,
  CASE 
    WHEN ST_NPoints(geom_wgs84) > 10000 
    THEN ST_AsGeoJSON(ST_Simplify(geom_wgs84, 0.05))
    ELSE ST_AsGeoJSON(geom_wgs84)
  END AS geojson
FROM countries;
```

---

## Debugging Spatial Queries

### Check SRID

```sql
SELECT ST_SRID(geom_wgs84) FROM countries LIMIT 1;  -- Should be 4326
SELECT ST_SRID(way) FROM admin_areas LIMIT 1;  -- Probably 3857
```

### Visualize a Geometry

```sql
-- Get bounding box
SELECT ST_Extent(geom_wgs84) FROM countries WHERE iso2 = 'CA';
-- Returns: BOX(-141.00... 41.67..., -52.61... 83.11...)

-- Get WKT (Well-Known Text) for small geometries
SELECT ST_AsText(repr_pt) FROM admin_areas WHERE name = 'Ontario' LIMIT 1;
-- Returns: POINT(-85.123... 50.456...)
```

### Count Points (complexity check)

```sql
SELECT name, ST_NPoints(way) AS complexity
FROM admin_areas
ORDER BY complexity DESC
LIMIT 10;
```

---

## What to Build (This Chapter)

1. **Add normalized geometry column**:
   ```sql
   ALTER TABLE admin_areas ADD COLUMN IF NOT EXISTS way_4326 geometry;
   UPDATE admin_areas SET way_4326 = ST_Transform(way, 4326);
   ```

2. **Add representative point column**:
   ```sql
   ALTER TABLE admin_areas ADD COLUMN IF NOT EXISTS repr_pt geometry(Point, 4326);
   UPDATE admin_areas SET repr_pt = ST_PointOnSurface(way_4326);
   ```

3. **Index both**:
   ```sql
   CREATE INDEX IF NOT EXISTS idx_way_4326 ON admin_areas USING GIST (way_4326);
   CREATE INDEX IF NOT EXISTS idx_repr_pt ON admin_areas USING GIST (repr_pt);
   ```

4. **Test containment**:
   ```sql
   -- Should return Canadian provinces
   SELECT a.name, a.admin_level
   FROM admin_areas a
   JOIN countries c ON ST_Contains(c.geom_wgs84, a.repr_pt)
   WHERE c.iso2 = 'CA' AND a.admin_level = 4
   ORDER BY ST_Area(a.way_4326::geography) DESC;
   ```

---

*Next: [Chapter 5 — Administrative Hierarchies](./05-admin-hierarchies.md)*
