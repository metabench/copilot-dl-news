# Chapter 7: Building Containment Graphs

*Reading time: 12 minutes*

---

## What is a Containment Graph?

A containment graph represents "contains" relationships between geographic entities:

```
Canada ──contains──> Ontario ──contains──> Middlesex County ──contains──> London
```

This graph enables:
- Fast "is X inside Y?" queries (walk the graph, not spatial operations)
- Parent lookups ("what county is this city in?")
- Hierarchy traversal (list all ancestors/descendants)

---

## Graph Structure

### Nodes

Every geographic entity is a node:
- Countries (from `countries` table)
- Admin areas (from `admin_areas` table)
- Future: localities, POIs, etc.

### Edges

An edge from A to B means "A contains B":
- `Canada` → `Ontario`
- `Ontario` → `Middlesex County`
- `Middlesex County` → `London`

We store edges in a table, not compute them at query time.

---

## Building the Graph

### Step 1: Country Membership

First, link each admin area to its containing country.

```sql
-- Add country link column
ALTER TABLE admin_areas ADD COLUMN IF NOT EXISTS country_iso2 TEXT;

-- Populate using representative point
UPDATE admin_areas a
SET country_iso2 = (
  SELECT c.iso2
  FROM countries c
  WHERE ST_Contains(c.geom_wgs84, a.repr_pt)
  ORDER BY ST_Area(c.geom_wgs84::geography) ASC  -- smallest containing country
  LIMIT 1
);
```

Why `ORDER BY ST_Area ASC`?
- Some regions might technically be inside multiple overlapping polygons
- Prefer the most specific match

### Step 2: Admin Parent Edges

For each admin area, find its immediate parent (the smallest containing higher-level area).

```sql
-- Create edge table
CREATE TABLE IF NOT EXISTS admin_containment (
  child_id BIGINT,
  parent_id BIGINT,
  parent_type TEXT,  -- 'admin' or 'country'
  confidence INTEGER DEFAULT 100,
  PRIMARY KEY (child_id)
);

-- First, link ADM1 regions to countries
INSERT INTO admin_containment (child_id, parent_id, parent_type)
SELECT a.osm_id, NULL, 'country'  -- parent_id NULL means country is parent
FROM admin_areas a
JOIN country_admin_roles r ON r.country_iso2 = a.country_iso2 
                           AND r.osm_admin_level = a.admin_level
WHERE r.role = 'ADM1'
ON CONFLICT DO NOTHING;
```

For deeper levels (ADM2, ADM3, localities), find the containing admin area:

```sql
-- Link deeper levels to their parent admin areas
INSERT INTO admin_containment (child_id, parent_id, parent_type)
SELECT DISTINCT ON (child.osm_id)
  child.osm_id,
  parent.osm_id,
  'admin'
FROM admin_areas child
JOIN admin_areas parent ON (
  child.country_iso2 = parent.country_iso2
  AND parent.admin_level < child.admin_level
  AND ST_Contains(parent.way_4326, child.repr_pt)
)
WHERE child.admin_level > 4
ORDER BY child.osm_id, parent.admin_level DESC, parent.area_km2 ASC;
```

**Key decisions**:
- `parent.admin_level < child.admin_level`: Parent must be higher in hierarchy
- `ST_Contains(parent.way_4326, child.repr_pt)`: Use representative point, not polygon
- `ORDER BY parent.admin_level DESC`: Prefer the closest parent (highest level that's still less than child)
- `ORDER BY parent.area_km2 ASC`: Among same-level parents, prefer smaller (more specific)

---

## Handling Edge Cases

### Case 1: No Parent Found

Some admin areas might not find a containing parent:
- Data gaps (parent polygon doesn't exist in OSM)
- Orphaned regions (islands, special territories)

```sql
-- Find orphans
SELECT osm_id, name, admin_level, country_iso2
FROM admin_areas
WHERE osm_id NOT IN (SELECT child_id FROM admin_containment)
  AND admin_level > 4;
```

Strategy: Leave these unlinked; handle in application layer.

### Case 2: Multiple Possible Parents

When `ST_Contains` matches multiple candidates:
- Use `DISTINCT ON` with proper ordering (as shown above)
- Or, store all possible parents with confidence scores

### Case 3: Cross-Border Regions

A region near a border might have its representative point inside a neighbor:

```sql
-- Sanity check: child and parent should be same country
SELECT c.osm_id, c.name, c.country_iso2 AS child_country,
       p.country_iso2 AS parent_country
FROM admin_containment ac
JOIN admin_areas c ON c.osm_id = ac.child_id
JOIN admin_areas p ON p.osm_id = ac.parent_id
WHERE c.country_iso2 != p.country_iso2;
-- Should return 0 rows
```

If this returns rows, something is wrong. Fix by filtering:

```sql
-- Require same country
AND child.country_iso2 = parent.country_iso2
```

---

## Querying the Graph

### Query 1: Get Parent Chain

```sql
-- Recursive CTE to walk up the tree
WITH RECURSIVE ancestors AS (
  -- Start with target node
  SELECT p.id, n.name, p.kind, p.country_code, 0 AS depth
  FROM places p
  JOIN place_names n ON n.place_id = p.id AND n.is_preferred = 1
  WHERE n.normalized = 'london' AND p.country_code = 'CA'
  LIMIT 1
  
  UNION ALL
  
  -- Walk to parent
  SELECT p.id, n.name, p.kind, p.country_code, a.depth + 1
  FROM ancestors a
  JOIN place_hierarchy h ON h.child_id = a.id
  JOIN places p ON p.id = h.parent_id
  JOIN place_names n ON n.place_id = p.id AND n.is_preferred = 1
  WHERE a.depth < 10
)
SELECT * FROM ancestors ORDER BY depth;
```

Expected output:
```
id     | name             | kind   | depth
-------|------------------|--------|------
123    | London           | city   | 0
456    | Middlesex County | region | 1
789    | Ontario          | region | 2
```

### Query 2: Is A Inside B?

```sql
-- Check if London is inside Ontario
WITH RECURSIVE ancestors AS (
  SELECT p.id FROM places p
  JOIN place_names n ON n.place_id = p.id
  WHERE n.normalized = 'london' AND p.country_code = 'CA'
  UNION
  SELECT h.parent_id FROM ancestors a 
  JOIN place_hierarchy h ON h.child_id = a.id
)
SELECT EXISTS (
  SELECT 1 FROM ancestors a
  JOIN places ont ON ont.id = a.id
  JOIN place_names n ON n.place_id = ont.id
  WHERE n.normalized = 'ontario'
);
```

### Query 3: List Children of a Region

```sql
-- All places directly inside Ontario
SELECT n.name, c.kind, c.area
FROM place_hierarchy h
JOIN places p ON p.id = h.parent_id
JOIN place_names pn ON pn.place_id = p.id
JOIN places c ON c.id = h.child_id
JOIN place_names n ON n.place_id = c.id AND n.is_preferred = 1
WHERE pn.normalized = 'ontario' AND p.country_code = 'CA'
ORDER BY c.area DESC
LIMIT 20;
```

---

## Performance Optimizations

### Index the Edge Table

```sql
CREATE INDEX IF NOT EXISTS idx_hierarchy_child ON place_hierarchy (child_id);
CREATE INDEX IF NOT EXISTS idx_hierarchy_parent ON place_hierarchy (parent_id);
```

### Materialize Full Ancestry

For very fast "is X inside Y?" queries, precompute transitive closure:

```sql
-- All ancestor relationships (not just immediate parent)
CREATE TABLE place_ancestors AS
WITH RECURSIVE ancestors AS (
  SELECT child_id, parent_id, 1 AS distance
  FROM place_hierarchy
  UNION
  SELECT a.child_id, h.parent_id, a.distance + 1
  FROM ancestors a
  JOIN place_hierarchy h ON h.child_id = a.parent_id
  WHERE a.distance < 10
)
SELECT * FROM ancestors;

CREATE INDEX idx_ancestors_child ON place_ancestors (child_id);
CREATE INDEX idx_ancestors_parent ON place_ancestors (parent_id);
```

Now "is X inside Y?" is a simple lookup:
```sql
SELECT EXISTS (
  SELECT 1 FROM place_ancestors
  WHERE child_id = $x AND parent_id = $y
);
```

---

## Why This Beats Spatial Queries

| Query Type | Spatial Approach | Graph Approach |
|------------|------------------|----------------|
| Is X inside Y? | ST_Contains (slow) | Table lookup (fast) |
| Get parent | ST_Contains + filter | Single join |
| List children | ST_Contains inverse | Single join |
| Full ancestry | Recursive spatial | Materialized view |

The graph approach:
- Is deterministic (same answer every time)
- Is fast (no geometry computation)
- Is explainable (you can see the edges)
- Survives geometry errors (once built, independent of polygons)

---

## What to Build (This Chapter)

1. **Verify `place_hierarchy` table**:
   Ensure it exists and is populated in `news.db`.

2. **Run sample queries**:
   Execute the recursive CTE queries above to verify the hierarchy structure.

3. **Check for orphans**:
   ```sql
   SELECT COUNT(*) FROM places p
   LEFT JOIN place_hierarchy h ON h.child_id = p.id
   WHERE h.parent_id IS NULL AND p.kind != 'country';
   ```

---

*Next: [Chapter 8 — SQLite as a Gazetteer Cache](./08-sqlite-cache.md)*
