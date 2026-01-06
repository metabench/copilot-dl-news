# Appendix A: SQL Recipes

*Reference collection of useful queries for the gazetteer system*

---

## PostGIS Queries

### Find Countries

```sql
-- List all countries with codes
SELECT country_code, name, 
       ST_Area(ST_Transform(geom_wgs84, 4326)::geography) / 1000000 AS area_km2
FROM countries
WHERE country_code IS NOT NULL
ORDER BY name;
```

### Find Admin Areas by Country

```sql
-- Admin areas in Canada using representative point containment
SELECT a.osm_id, a.name, a.admin_level
FROM admin_areas a
JOIN countries c ON ST_Contains(
  c.geom_wgs84,
  ST_Transform(ST_PointOnSurface(a.way), 4326)
)
WHERE c.country_code = 'CA'
  AND a.admin_level = 4
ORDER BY a.name;
```

### Build Containment Edges

```sql
-- Find direct parent for each admin area
WITH admin_points AS (
  SELECT 
    osm_id,
    admin_level,
    ST_PointOnSurface(way) AS pt
  FROM admin_areas
  WHERE admin_level IN (4, 6, 8)
)
SELECT 
  child.osm_id AS child_id,
  child.admin_level AS child_level,
  parent.osm_id AS parent_id,
  parent.admin_level AS parent_level
FROM admin_points child
JOIN admin_points parent ON (
  parent.admin_level < child.admin_level
  AND ST_Contains(
    (SELECT way FROM admin_areas WHERE osm_id = parent.osm_id),
    child.pt
  )
)
WHERE NOT EXISTS (
  SELECT 1 FROM admin_points mid
  WHERE mid.admin_level > parent.admin_level
    AND mid.admin_level < child.admin_level
    AND ST_Contains(
      (SELECT way FROM admin_areas WHERE osm_id = mid.osm_id),
      child.pt
    )
);
```

### Representative Point Extraction

```sql
-- Get representative points for all admin areas
SELECT 
  osm_id,
  name,
  admin_level,
  ST_Y(ST_Transform(ST_PointOnSurface(way), 4326)) AS lat,
  ST_X(ST_Transform(ST_PointOnSurface(way), 4326)) AS lng
FROM admin_areas
WHERE admin_level IN (4, 6, 8)
ORDER BY admin_level, name;
```

### Bounding Box Extraction

```sql
-- Get bounding boxes for all countries
SELECT 
  country_code,
  name,
  ST_XMin(ST_Transform(geom_wgs84, 4326)) AS min_lng,
  ST_YMin(ST_Transform(geom_wgs84, 4326)) AS min_lat,
  ST_XMax(ST_Transform(geom_wgs84, 4326)) AS max_lng,
  ST_YMax(ST_Transform(geom_wgs84, 4326)) AS max_lat
FROM countries;
```

### Area Calculation

```sql
-- Calculate area in km² using geography type
SELECT 
  name,
  ST_Area(ST_Transform(geom_wgs84, 4326)::geography) / 1000000 AS area_km2
FROM countries
ORDER BY area_km2 DESC
LIMIT 20;
```

---

## SQLite Queries

### Place Lookup

```sql
-- Basic name lookup (via place_names)
SELECT p.*, pn.name AS matched_name
FROM place_names pn
JOIN places p ON p.id = pn.place_id
WHERE pn.normalized = 'london'
ORDER BY p.priority_score DESC;

-- With country filter
SELECT p.*, pn.name AS matched_name
FROM place_names pn
JOIN places p ON p.id = pn.place_id
WHERE pn.normalized = 'london' 
  AND p.country_code = 'CA'
ORDER BY p.priority_score DESC;
```

### Alias Lookup

```sql
-- Find place by alias (same table now)
SELECT p.*, pn.name, pn.is_preferred
FROM place_names pn
JOIN places p ON p.id = pn.place_id
WHERE pn.normalized = 'uk';
```

### Parent Chain

```sql
-- Get all ancestors of a place
SELECT parent.*, ph.depth
FROM place_hierarchy ph
JOIN places parent ON parent.id = ph.parent_id
WHERE ph.child_id = ?  -- Starting place_id
ORDER BY ph.depth;
```

### Descendant Count

```sql
-- Count descendants at each level
SELECT 
  parent.id AS parent_id,
  parent.kind AS parent_kind,
  COUNT(*) AS descendant_count
FROM place_hierarchy ph
JOIN places parent ON parent.id = ph.parent_id
WHERE parent.kind = 'adm1'
GROUP BY ph.parent_id
ORDER BY descendant_count DESC
LIMIT 20;
```

### Statistics

```sql
-- Gazetteer statistics
SELECT 
  kind,
  COUNT(*) AS count,
  AVG(priority_score) AS avg_priority,
  COUNT(DISTINCT country_code) AS countries
FROM places
GROUP BY kind
ORDER BY count DESC;
```

### Duplicate Detection

```sql
-- Find potential duplicates (same name, same country, different place_id)
SELECT 
  pn.normalized,
  p.country_code,
  COUNT(DISTINCT p.id) AS count,
  GROUP_CONCAT(p.id) AS place_ids
FROM place_names pn
JOIN places p ON p.id = pn.place_id
WHERE p.kind = 'locality'
GROUP BY pn.normalized, p.country_code
HAVING COUNT(DISTINCT p.id) > 1
ORDER BY count DESC
LIMIT 20;
```

### Missing Parents

```sql
-- Find places without parent edges (orphans)
SELECT p.*
FROM places p
LEFT JOIN place_hierarchy ph ON ph.child_id = p.id
WHERE p.kind NOT IN ('country')
  AND ph.child_id IS NULL;
```

### Index Verification

```sql
-- Check indexes exist
SELECT name, tbl_name FROM sqlite_master 
WHERE type = 'index' AND tbl_name = 'place_names';

-- Analyze query plan
EXPLAIN QUERY PLAN
SELECT * FROM place_names WHERE normalized = 'london';
-- Should show: USING INDEX idx_place_names_normalized
```

---

## Data Quality Queries

### Coverage Check

```sql
-- Countries with no ADM1 children
SELECT c.country_code, pn.name
FROM places c
JOIN place_names pn ON pn.place_id = c.id AND pn.is_preferred = 1
LEFT JOIN places p ON p.country_code = c.country_code AND p.kind = 'adm1'
WHERE c.kind = 'country' AND p.id IS NULL;
```

### Orphaned Admin Areas

```sql
-- Admin areas not assigned to any country
SELECT a.osm_id, a.name, a.admin_level
FROM admin_areas a
LEFT JOIN countries c ON ST_Contains(
  c.geom_wgs84,
  ST_Transform(ST_PointOnSurface(a.way), 4326)
)
WHERE c.country_code IS NULL
  AND a.admin_level IN (4, 6, 8);
```

### Name Quality

```sql
-- Places with very short names (potential data issues)
SELECT pn.name, p.kind 
FROM place_names pn
JOIN places p ON p.id = pn.place_id
WHERE LENGTH(pn.name) < 2
ORDER BY p.kind, pn.name;

-- Places with missing coordinates
SELECT * FROM places
WHERE lat IS NULL OR lng IS NULL;
```

---

## Performance Queries

### Slow Query Detection

```sql
-- SQLite: Enable query timing
.timer on

-- Test lookup performance
SELECT p.* 
FROM place_names pn
JOIN places p ON p.id = pn.place_id
WHERE pn.normalized = 'london' 
ORDER BY p.priority_score DESC 
LIMIT 10;
-- Should be < 1ms with index
```

### Index Usage

```sql
-- Verify index is being used
EXPLAIN QUERY PLAN
SELECT p.* 
FROM place_names pn
JOIN places p ON p.id = pn.place_id
WHERE pn.normalized = ? AND p.country_code = ?;
-- Should show: USING INDEX idx_place_names_normalized
```

---

## Maintenance Queries

### Snapshot Verification

```sql
-- Check snapshot integrity (if using snapshots table)
SELECT 
  s.snapshot_id,
  s.built_at,
  s.country_count AS expected_countries,
  (SELECT COUNT(*) FROM places WHERE kind = 'country') AS actual_countries
FROM snapshots s
ORDER BY s.built_at DESC
LIMIT 5;
```

### Cleanup

```sql
-- Vacuum after deletions
VACUUM;
```

---

## Quick Reference

| Task | Query Start |
|------|-------------|
| Find place by name | `SELECT * FROM place_names WHERE normalized = ?` |
| Find by alias | `SELECT * FROM place_names WHERE normalized = ?` |
| Get parent chain | `SELECT * FROM place_hierarchy WHERE child_id = ?` |
| Check containment | `SELECT 1 FROM place_hierarchy WHERE child_id = ? AND parent_id = ?` |
| Country's ADM1s | `SELECT * FROM places WHERE country_code = ? AND kind = 'adm1'` |
| Priority ranking | `ORDER BY priority_score DESC` |

---

*Next: [Appendix B — Weight Tuning Cookbook](./appendix-b-weight-tuning.md)*
