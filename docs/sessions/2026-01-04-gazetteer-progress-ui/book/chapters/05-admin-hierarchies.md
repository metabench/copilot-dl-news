# Chapter 5: Administrative Hierarchies

*Reading time: 12 minutes*

---

## What is an Administrative Hierarchy?

Countries are divided into administrative regions at multiple levels:

```
Canada (country)
├── Ontario (province)
│   ├── Middlesex County
│   │   ├── London (city)
│   │   └── Thames Centre (township)
│   └── York Region
│       ├── Toronto (city)
│       └── Markham (city)
├── Quebec (province)
│   └── ...
└── British Columbia (province)
    └── ...
```

This hierarchy is essential for disambiguation:
- If we know an article is about "Ontario", we can prefer "London, ON" over "London, UK"
- Parent-child relationships define "containment" more reliably than spatial queries

---

## The OSM admin_level System

OpenStreetMap uses `admin_level` tags (2-11) to mark administrative boundaries.

### The Problem: Meanings Vary by Country

| admin_level | USA | Canada | UK | Germany |
|-------------|-----|--------|----|---------| 
| 2 | Country | Country | Country | Country |
| 4 | State | Province | Country (Eng/Scot) | State (Land) |
| 5 | — | — | Region | District (Bezirk) |
| 6 | County | — | County | County (Kreis) |
| 8 | City/Town | City | City | Municipality |
| 10 | Neighborhood | — | Ward | — |

There is no universal rule like "admin_level 4 = first-level division."

### Practical Implications

To answer "What are the provinces of Canada?", we need to know:
1. Canada uses admin_level 4 for provinces
2. Filter by admin_level 4 where country = CA

To answer "What are the states of Germany?", we need:
1. Germany uses admin_level 4 for Länder
2. Same query, different interpretation

---

## Our Role Mapping Approach

We introduce a **role mapping table** that translates per-country:

```sql
CREATE TABLE country_admin_roles (
  country_iso2 TEXT,
  osm_admin_level INTEGER,
  role TEXT,  -- 'ADM1', 'ADM2', 'ADM3', 'LOCALITY', 'UNKNOWN'
  notes TEXT,
  PRIMARY KEY (country_iso2, osm_admin_level)
);
```

Example data:

| country_iso2 | osm_admin_level | role | notes |
|--------------|-----------------|------|-------|
| CA | 4 | ADM1 | Province/Territory |
| CA | 6 | ADM2 | Census division |
| CA | 8 | LOCALITY | City/Town |
| US | 4 | ADM1 | State |
| US | 6 | ADM2 | County |
| US | 8 | LOCALITY | City |
| GB | 4 | ADM1 | Countries (Eng/Scot/Wales/NI) |
| GB | 6 | ADM2 | County/District |
| DE | 4 | ADM1 | Bundesland |
| DE | 6 | ADM2 | Kreis |

### How to Populate

1. **Start with heuristics**: For most countries, admin_level 4 = ADM1
2. **Spot-check major countries**: Verify CA, US, GB, AU, DE, FR, etc.
3. **Refine as issues arise**: When disambiguation fails, check if role mapping is wrong

---

## Building the Hierarchy

### Step 1: Country Membership

Every admin area needs a `country_code`:

```sql
-- Ensure country_code is populated
UPDATE places p
SET country_code = (
  SELECT parent.country_code 
  FROM places parent
  JOIN place_hierarchy h ON h.parent_id = parent.id
  WHERE h.child_id = p.id AND parent.kind = 'country'
  LIMIT 1
)
WHERE p.country_code IS NULL;
```

### Step 2: Parent Identification

For each place, we maintain its relationships in `place_hierarchy`:

```sql
CREATE TABLE place_hierarchy (
  parent_id INTEGER NOT NULL,
  child_id INTEGER NOT NULL,
  relation TEXT,                       -- 'admin_parent' | 'contains' | 'member_of'
  depth INTEGER,
  PRIMARY KEY (parent_id, child_id),
  FOREIGN KEY (parent_id) REFERENCES places(id) ON DELETE CASCADE,
  FOREIGN KEY (child_id) REFERENCES places(id) ON DELETE CASCADE
);
```

This table stores the transitive closure of the hierarchy graph, allowing for fast recursive queries.

---

## Hierarchy Queries

### Query 1: ADM1 List for Country

```sql
-- List provinces of Canada
SELECT n.name, p.osm_id, p.area
FROM places p
JOIN place_names n ON n.place_id = p.id AND n.is_preferred = 1
WHERE p.country_code = 'CA' 
  AND p.kind = 'region'
ORDER BY p.area DESC;
```

### Query 2: Parent Chain for a Place

```sql
-- Get parent chain for London, ON
SELECT parent.id, n.name, h.depth
FROM place_hierarchy h
JOIN places parent ON parent.id = h.parent_id
JOIN place_names n ON n.place_id = parent.id AND n.is_preferred = 1
WHERE h.child_id = (
  SELECT id FROM places p 
  JOIN place_names n ON n.place_id = p.id 
  WHERE n.name = 'London' AND p.country_code = 'CA'
  LIMIT 1
)
ORDER BY h.depth ASC;
```

### Query 3: Is Place Inside Region?

```sql
-- Is London inside Ontario?
SELECT EXISTS (
  SELECT 1 
  FROM place_hierarchy h
  JOIN places child ON child.id = h.child_id
  JOIN place_names cn ON cn.place_id = child.id
  JOIN places parent ON parent.id = h.parent_id
  JOIN place_names pn ON pn.place_id = parent.id
  WHERE cn.name = 'London' 
    AND pn.name = 'Ontario'
    AND h.relation = 'admin_parent'
);
```

---

## Why Not Just Use Spatial Containment?

Spatial queries are expensive and have edge cases:

| Issue | Spatial Query | Hierarchy Table |
|-------|---------------|-----------------|
| Speed | Slow (geometry comparison) | Fast (join) |
| Border overlap | May return multiple | Single parent |
| Consistency | Depends on geometry quality | Stable once built |
| Explainability | "Polygon contains point" | "Parent of" relationship |

For disambiguation, hierarchy tables give reliable, fast answers.

---

## Data Quality Checks

### Check: Every Area Has a Country

```sql
SELECT COUNT(*) AS orphans
FROM places
WHERE country_code IS NULL AND kind != 'country';
-- Should be 0 or very small
```

### Check: Parents Are in Same Country

```sql
SELECT c.id, c.country_code, p.country_code AS parent_country
FROM places c
JOIN place_hierarchy h ON h.child_id = c.id
JOIN places p ON p.id = h.parent_id
WHERE c.country_code != p.country_code
  AND c.country_code IS NOT NULL 
  AND p.country_code IS NOT NULL;
-- Should return 0 rows (mostly)
```

### Check: ADM1 Coverage

```sql
-- Every major country should have regions
SELECT p.country_code, COUNT(r.id) AS region_count
FROM places p
LEFT JOIN places r ON r.country_code = p.country_code AND r.kind = 'region'
WHERE p.kind = 'country'
GROUP BY p.country_code
ORDER BY region_count ASC
LIMIT 20;
```

---

## What to Build (This Chapter)

1. **Verify `place_hierarchy` population**:
   Ensure the table is populated with `admin_parent` relationships.

2. **Run quality checks**:
   Execute the SQL checks above to validate the hierarchy integrity.

---

*Next: [Chapter 6 — The SRID Problem (and How to Solve It)](./06-srid-problem.md)*
