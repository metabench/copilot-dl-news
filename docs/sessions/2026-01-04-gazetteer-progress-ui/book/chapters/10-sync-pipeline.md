# Chapter 10: Syncing PostGIS → SQLite

*Reading time: 12 minutes*

---

## The Sync Problem

We have rich spatial data in PostGIS but need fast lookups at article-processing time. The solution: a batch sync pipeline that periodically extracts data from PostGIS and rebuilds the SQLite cache.

This chapter covers the entire pipeline from query to production swap.

---

## Sync Architecture

```
PostGIS (source of truth)
    ↓
[Extract Script]  ← Runs on schedule or demand
    ↓
SQLite (news.db)  ← Transactional update
    ↓
[Create Temp Tables] ← places_new, etc.
    ↓
[Validation]      ← Check counts in temp tables
    ↓
[Atomic Swap]     ← RENAME TABLE within transaction
    ↓
SQLite (news.db)  ← Updated
```

**Key principles**:
1. **Transactional Safety** — All updates happen in one transaction
2. **Validate before swap** — Reject corrupt builds before they go live
3. **Atomic swap** — Readers see consistent state (old or new)

---

## Phase 1: Extract Countries

Start with the simplest entity.

```javascript
async function extractCountries(pgClient) {
  const result = await pgClient.query(`
    SELECT
      country_code AS source_id,
      'osm_country' AS source,
      'country' AS kind,
      name,
      LOWER(TRIM(name)) AS normalized,
      country_code AS country_iso2,
      name AS country_name,
      ST_Y(ST_PointOnSurface(ST_Transform(geom_wgs84, 4326))) AS lat,
      ST_X(ST_PointOnSurface(ST_Transform(geom_wgs84, 4326))) AS lng,
      ST_Area(ST_Transform(geom_wgs84, 4326)::geography) / 1000000 AS area_km2,
      20 AS priority_score  -- Base priority for countries
    FROM countries
    WHERE country_code IS NOT NULL
      AND name IS NOT NULL
    ORDER BY name
  `);
  
  return result.rows;
}
```

**Notes**:
- `ST_PointOnSurface` finds a point guaranteed inside the polygon
- We get area in km² for priority calculation
- Countries get base priority of 20

---

## Phase 2: Extract Admin Areas

This is where SRID handling matters.

```javascript
async function extractAdminAreas(pgClient) {
  const result = await pgClient.query(`
    SELECT
      osm_id AS source_id,
      'osm_admin' AS source,
      
      -- Map admin_level to kind
      CASE 
        WHEN admin_level = 4 THEN 'adm1'
        WHEN admin_level = 6 THEN 'adm2'
        WHEN admin_level = 8 THEN 'adm3'
        ELSE 'admin_other'
      END AS kind,
      
      name,
      LOWER(TRIM(name)) AS normalized,
      
      -- Representative point (SRID 3857 → 4326)
      ST_Y(ST_Transform(ST_PointOnSurface(way), 4326)) AS lat,
      ST_X(ST_Transform(ST_PointOnSurface(way), 4326)) AS lng,
      
      -- Area in km²
      ST_Area(ST_Transform(way, 4326)::geography) / 1000000 AS area_km2,
      
      admin_level
      
    FROM admin_areas
    WHERE name IS NOT NULL
      AND admin_level IN (4, 6, 8)
    ORDER BY admin_level, name
  `);
  
  return result.rows;
}
```

**SRID handling**:
- `admin_areas.way` is SRID 3857
- `ST_Transform(..., 4326)` converts to WGS84 for lat/lng
- Area calculation uses geography type for accuracy

---

## Phase 3: Assign Countries to Admin Areas

This is the critical step: finding which country contains each admin area.

```javascript
async function assignCountries(pgClient) {
  // Find country for each admin_area using representative points
  const result = await pgClient.query(`
    SELECT 
      a.osm_id,
      c.country_code,
      c.name AS country_name
    FROM admin_areas a
    JOIN countries c ON ST_Contains(
      c.geom_wgs84, 
      ST_Transform(ST_PointOnSurface(a.way), 4326)
    )
    WHERE a.admin_level IN (4, 6, 8)
  `);
  
  // Build lookup map
  const countryMap = {};
  for (const row of result.rows) {
    countryMap[row.osm_id] = {
      iso2: row.country_code,
      name: row.country_name
    };
  }
  
  return countryMap;
}
```

**Why representative points?**
- Polygon-to-polygon intersection is slow and produces slivers
- A point is either inside or not—no ambiguity
- `ST_PointOnSurface` guarantees the point is inside the original polygon

---

## Phase 4: Build Containment Graph

For each admin area, find its direct parent.

```javascript
async function buildContainmentEdges(pgClient) {
  const result = await pgClient.query(`
    WITH admin_points AS (
      SELECT 
        osm_id,
        admin_level,
        ST_PointOnSurface(way) AS pt,
        way
      FROM admin_areas
      WHERE admin_level IN (4, 6, 8)
    )
    SELECT 
      child.osm_id AS child_id,
      parent.osm_id AS parent_id,
      child.admin_level AS child_level,
      parent.admin_level AS parent_level
    FROM admin_points child
    JOIN admin_points parent ON (
      -- Parent must be higher level (lower number)
      parent.admin_level < child.admin_level
      -- Child's point must be inside parent's polygon
      AND ST_Contains(parent.way, child.pt)
    )
    WHERE NOT EXISTS (
      -- No intermediate admin area between them
      SELECT 1 FROM admin_points mid
      WHERE mid.admin_level > parent.admin_level
        AND mid.admin_level < child.admin_level
        AND ST_Contains(mid.way, child.pt)
        AND ST_Contains(parent.way, mid.pt)
    )
  `);
  
  return result.rows;
}
```

This query:
1. Computes representative points for all admin areas
2. Finds parent-child pairs using containment
3. Ensures no intermediate level exists (direct parent only)

---

## Phase 5: Insert into SQLite

Use a transaction for atomicity. We create `_new` tables, populate them, validate them, and then swap.

```javascript
async function populateSQLite(sqliteDb, data) {
  const { countries, adminAreas, countryMap, edges } = data;
  
  // Start transaction
  sqliteDb.exec('BEGIN TRANSACTION');
  
  try {
    // 1. Create temporary tables
    sqliteDb.exec(`
      CREATE TABLE places_new AS SELECT * FROM places WHERE 0;
      CREATE TABLE place_hierarchy_new AS SELECT * FROM place_hierarchy WHERE 0;
      CREATE TABLE place_names_new AS SELECT * FROM place_names WHERE 0;
    `);

    // 2. Insert countries
    const insertPlace = sqliteDb.prepare(`
      INSERT INTO places_new (
        source, osm_id, kind, country_code, 
        lat, lng, area, priority_score, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'current')
    `);
    
    const insertName = sqliteDb.prepare(`
      INSERT INTO place_names_new (
        place_id, name, normalized, lang, name_kind, is_preferred, is_official
      )
      VALUES (?, ?, ?, 'en', 'official', 1, 1)
    `);
    
    const placeIdMap = {}; // source_id → place_id
    
    for (const c of countries) {
      const result = insertPlace.run([
        c.source, c.source_id, c.kind, c.country_iso2,
        c.lat, c.lng, c.area_km2, c.priority_score
      ]);
      const placeId = result.lastInsertRowid;
      placeIdMap[`osm_country:${c.source_id}`] = placeId;
      
      insertName.run([placeId, c.name, c.normalized]);
    }
    
    // 3. Insert admin areas with country assignment
    for (const a of adminAreas) {
      const countryInfo = countryMap[a.source_id] || {};
      const result = insertPlace.run([
        a.source, a.source_id, a.kind, countryInfo.iso2,
        a.lat, a.lng, a.area_km2, 20 // Default priority
      ]);
      const placeId = result.lastInsertRowid;
      placeIdMap[`osm_admin:${a.source_id}`] = placeId;
      
      insertName.run([placeId, a.name, a.normalized]);
    }
    
    // 4. Insert containment edges
    const insertEdge = sqliteDb.prepare(`
      INSERT INTO place_hierarchy_new (child_id, parent_id, relation, depth)
      VALUES (?, ?, 'admin_parent', 1)
    `);
    
    for (const edge of edges) {
      const childId = placeIdMap[`osm_admin:${edge.child_id}`];
      const parentId = placeIdMap[`osm_admin:${edge.parent_id}`];
      if (childId && parentId) {
        insertEdge.run([childId, parentId]);
      }
    }
    
    // 5. Validate BEFORE swap
    const validation = await validateBuild(sqliteDb, 'places_new', 'place_hierarchy_new', 'place_names_new');
    if (!validation.pass) {
      throw new Error(`Validation failed: ${JSON.stringify(validation.checks.filter(c => !c.pass))}`);
    }
    
    // 6. Swap tables
    sqliteDb.exec(`
      DROP TABLE IF EXISTS places_old;
      DROP TABLE IF EXISTS place_hierarchy_old;
      DROP TABLE IF EXISTS place_names_old;
      
      ALTER TABLE places RENAME TO places_old;
      ALTER TABLE place_hierarchy RENAME TO place_hierarchy_old;
      ALTER TABLE place_names RENAME TO place_names_old;
      
      ALTER TABLE places_new RENAME TO places;
      ALTER TABLE place_hierarchy_new RENAME TO place_hierarchy;
      ALTER TABLE place_names_new RENAME TO place_names;
      
      -- Recreate indexes (omitted for brevity)
    `);
    
    // 7. Commit
    sqliteDb.exec('COMMIT');
    console.log('Sync committed successfully.');
    
  } catch (err) {
    sqliteDb.exec('ROLLBACK');
    console.error('Sync rolled back due to error:', err.message);
    throw err;
  }
}
```

---

## Phase 6: Validation

Verify the build tables before swapping.

```javascript
async function validateBuild(sqliteDb, placesTbl, hierarchyTbl, namesTbl) {
  const checks = [];
  
  // 1. Count checks
  const countryCount = sqliteDb.get(`SELECT COUNT(*) AS n FROM ${placesTbl} WHERE kind = ?`, ['country']).n;
  checks.push({
    name: 'country_count',
    expected: '> 190',
    actual: countryCount,
    pass: countryCount > 190
  });
  
  const adm1Count = sqliteDb.get(`SELECT COUNT(*) AS n FROM ${placesTbl} WHERE kind = ?`, ['adm1']).n;
  checks.push({
    name: 'adm1_count',
    expected: '> 3000',
    actual: adm1Count,
    pass: adm1Count > 3000
  });
  
  // 2. Sample query check
  const london = sqliteDb.all(`
    SELECT p.* FROM ${placesTbl} p
    JOIN ${namesTbl} n ON n.place_id = p.id
    WHERE n.normalized = 'london' 
    ORDER BY p.priority_score DESC 
    LIMIT 5
  `);
  checks.push({
    name: 'london_lookup',
    expected: 'at least 2 results',
    actual: london.length,
    pass: london.length >= 2
  });
  
  // 3. Containment check
  const hasParents = sqliteDb.get(`SELECT COUNT(*) AS n FROM ${hierarchyTbl}`).n;
  checks.push({
    name: 'containment_edges',
    expected: '> 1000',
    actual: hasParents,
    pass: hasParents > 1000
  });
  
  // 4. No null coordinates
  const nullCoords = sqliteDb.get(`SELECT COUNT(*) AS n FROM ${placesTbl} WHERE lat IS NULL OR lng IS NULL`).n;
  checks.push({
    name: 'no_null_coords',
    expected: '0',
    actual: nullCoords,
    pass: nullCoords === 0
  });
  
  // Report
  const allPass = checks.every(c => c.pass);
  return { pass: allPass, checks };
}
```

---

## Phase 7: Atomic Swap Strategy

Since we are updating `news.db` in place, the "swap" is handled via table renaming within the transaction in Phase 5.

However, for safety, we should backup `news.db` before running the sync.

```javascript
const fs = require('fs');

function backupDatabase(dbPath) {
  const backupPath = dbPath + '.bak';
  fs.copyFileSync(dbPath, backupPath);
  console.log(`Backed up ${dbPath} to ${backupPath}`);
}

// Usage
backupDatabase('data/news.db');
```

---

## Complete Sync Script

Putting it all together:

```javascript
async function runSync() {
  console.log('Starting gazetteer sync...');
  
  // 1. Connect to PostGIS
  const pgClient = await connectPostgres();
  
  // 2. Extract data
  console.log('Extracting countries...');
  const countries = await extractCountries(pgClient);
  console.log(`  Found ${countries.length} countries`);
  
  console.log('Extracting admin areas...');
  const adminAreas = await extractAdminAreas(pgClient);
  console.log(`  Found ${adminAreas.length} admin areas`);
  
  console.log('Assigning countries...');
  const countryMap = await assignCountries(pgClient);
  console.log(`  Assigned ${Object.keys(countryMap).length} areas to countries`);
  
  console.log('Building containment edges...');
  const edges = await buildContainmentEdges(pgClient);
  console.log(`  Built ${edges.length} containment edges`);
  
  await pgClient.end();
  
  // 3. Connect to SQLite
  const dbPath = 'data/news.db';
  backupDatabase(dbPath);
  const sqliteDb = new Database(dbPath);
  
  // 4. Populate (includes validation and table swap)
  console.log('Populating SQLite...');
  await populateSQLite(sqliteDb, { countries, adminAreas, countryMap, edges });
  
  sqliteDb.close();
  console.log('Sync complete!');
}
```

---

## Scheduling

Run the sync periodically:

```javascript
// cron: 0 3 * * 0  (every Sunday at 3 AM)

// Or with node-cron:
const cron = require('node-cron');
cron.schedule('0 3 * * 0', () => {
  runSync().catch(console.error);
});
```

---

## Performance Expectations

| Phase | Duration | Notes |
|-------|----------|-------|
| Extract countries | 1s | ~200 rows |
| Extract admin areas | 30s | ~50K rows with geometry |
| Assign countries | 60s | Spatial join |
| Build containment | 120s | Nested spatial queries |
| Insert to SQLite | 10s | ~50K inserts |
| Validation | < 1s | Sample queries |
| **Total** | **~4 min** | For full rebuild |

---

## What to Build (This Chapter)

1. **Create the sync script** at `tools/gazetteer-sync.js`

2. **Test extraction queries** in psql first:
   ```sql
   -- Verify representative points
   SELECT name, 
          ST_Y(ST_Transform(ST_PointOnSurface(way), 4326)) AS lat,
          ST_X(ST_Transform(ST_PointOnSurface(way), 4326)) AS lon
   FROM admin_areas
   WHERE admin_level = 4
   LIMIT 5;
   ```

3. **Run a test sync**:
   ```bash
   node tools/gazetteer-sync.js --dry-run
   ```

4. **Validate the output**:
   ```bash
   sqlite3 data/news.db "SELECT kind, COUNT(*) FROM places GROUP BY kind"
   ```

5. **Test lookups**:
   ```bash
   sqlite3 data/news.db "SELECT p.* FROM places p JOIN place_names n ON n.place_id = p.id WHERE n.normalized = 'ontario' ORDER BY p.priority_score DESC"
   ```

---

*Next: [Chapter 11 — Candidate Generation](./11-candidate-generation.md)*
