# Gazetteer Ingestion Deduplication Strategy

## Current Problems (October 2025)

### 1. Duplicate Capital Cities
- **GB (United Kingdom)**: 4 entries for London with slight coordinate variations
- **IE (Ireland)**: 4 entries for Dublin with slight coordinate variations  
- **ZA (South Africa)**: 3 capitals with identical (incorrect) coordinates

### 2. Root Causes
1. **No ingestion run tracking**: Running the script multiple times creates duplicates
2. **Weak deduplication**: Only checks normalized name + country_code
3. **No coordinate-based matching**: Slight coordinate differences not detected
4. **No source+identifier tracking**: Can't detect re-ingestion from same source
5. **Batch coordinate assignment**: South Africa's multiple capitals all get the same coordinates from `capitalInfo.latlng`

## Proposed Solutions

### Solution 1: Add Ingestion Run Tracking (Minimal Change)

**New table: `ingestion_runs`**
```sql
CREATE TABLE IF NOT EXISTS ingestion_runs (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,              -- 'restcountries', 'wikidata', etc.
  source_version TEXT,                -- 'v3.1', etc.
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  status TEXT DEFAULT 'running',      -- 'running', 'completed', 'failed'
  countries_processed INTEGER,
  places_created INTEGER,
  places_updated INTEGER,
  names_added INTEGER,
  error_message TEXT,
  metadata JSON                       -- Additional run info
);

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_source_status 
  ON ingestion_runs(source, status);
```

**Modified ingestion logic:**
```javascript
// At start of ingestion
const runId = raw.prepare(`
  INSERT INTO ingestion_runs(source, source_version, started_at, status)
  VALUES (?, ?, ?, 'running')
`).run('restcountries', 'v3.1', Date.now()).lastInsertRowid;

// Check if this source was already fully ingested
const lastCompleted = raw.prepare(`
  SELECT completed_at FROM ingestion_runs 
  WHERE source = ? AND source_version = ? AND status = 'completed'
  ORDER BY completed_at DESC LIMIT 1
`).get('restcountries', 'v3.1');

if (lastCompleted && !force) {
  log(`Source already ingested at ${new Date(lastCompleted.completed_at)}`);
  log(`Use --force=1 to re-ingest`);
  process.exit(0);
}

// At end of ingestion
raw.prepare(`
  UPDATE ingestion_runs 
  SET completed_at = ?, status = 'completed',
      countries_processed = ?, places_created = ?, names_added = ?
  WHERE id = ?
`).run(Date.now(), countries, capitals + cityCount, names, runId);
```

### Solution 2: Enhanced Deduplication Using External IDs (Recommended)

**Leverage existing `place_external_ids` table:**
```javascript
// For each capital city, create a stable external ID
function getCapitalExternalId(countryCode, capitalName) {
  return `restcountries:capital:${countryCode}:${normalizeName(capitalName)}`;
}

// Before creating capital city
const extId = getCapitalExternalId(cc2, cap);
let cid = getByExternalId.get('restcountries', extId)?.id || null;

if (!cid) {
  // Create new city
  const res = insPlace.run({ 
    kind: 'city', 
    country_code: cc2, 
    population: null, 
    timezone: primTz, 
    lat: capInfo?capInfo[0]:null, 
    lng: capInfo?capInfo[1]:null, 
    bbox: null, 
    source: 'restcountries@v3.1', 
    extra: JSON.stringify({ role: 'capital' }) 
  });
  cid = res.lastInsertRowid;
  
  // Record external ID to prevent duplicates
  insertExternalId.run('restcountries', extId, cid);
  capitals++;
} else {
  // Update existing city (coordinates may have improved)
  raw.prepare(`
    UPDATE places 
    SET timezone = COALESCE(?, timezone),
        lat = COALESCE(?, lat),
        lng = COALESCE(?, lng),
        source = 'restcountries@v3.1'
    WHERE id = ?
  `).run(primTz, capInfo?.[0], capInfo?.[1], cid);
}
```

### Solution 3: Coordinate-Based Proximity Matching (Advanced)

For detecting duplicates with slight coordinate differences:

```javascript
// Find existing capitals within ~5km (0.05 degrees ≈ 5.5km)
const findNearbyCapital = raw.prepare(`
  SELECT p.id, p.lat, p.lng,
         ABS(p.lat - @lat) as lat_diff,
         ABS(p.lng - @lng) as lng_diff
  FROM places p
  WHERE p.kind = 'city' 
    AND p.country_code = @country_code
    AND json_extract(p.extra, '$.role') = 'capital'
    AND ABS(p.lat - @lat) < 0.05
    AND ABS(p.lng - @lng) < 0.05
  ORDER BY lat_diff + lng_diff
  LIMIT 1
`);

// Before creating capital
const nearby = capInfo ? findNearbyCapital.get({
  lat: capInfo[0],
  lng: capInfo[1],
  country_code: cc2
}) : null;

if (nearby) {
  cid = nearby.id;
  // Update with better coordinates if available
  // Merge names instead of creating duplicate
} else {
  // Create new city as before
}
```

### Solution 4: Fix South Africa Multiple Capitals Issue

**Problem**: REST Countries API only provides one `capitalInfo.latlng` but returns array of capitals.

**Solution**: Add special handling for known multi-capital countries:

```javascript
// Special cases for countries with multiple capitals
const MULTI_CAPITAL_COORDS = {
  'ZA': {
    'pretoria': [-25.7461, 28.1881],
    'cape town': [-33.9249, 18.4241],
    'bloemfontein': [-29.1211, 26.2140]
  },
  'BO': {
    'la paz': [-16.4897, -68.1193],  // Administrative capital
    'sucre': [-19.0332, -65.2627]     // Constitutional capital
  },
  'MY': {
    'kuala lumpur': [3.1390, 101.6869],
    'putrajaya': [2.9264, 101.6964]
  }
};

// In capital processing loop
for (let i = 0; i < capList.length; i++) {
  const cap = capList[i];
  const normCap = normalizeName(cap);
  
  // Try to get country-specific coordinates
  let coords = null;
  const multiCapital = MULTI_CAPITAL_COORDS[cc2];
  if (multiCapital && multiCapital[normCap]) {
    coords = multiCapital[normCap];
  } else if (capList.length === 1 && capInfo) {
    // Single capital - use provided coordinates
    coords = capInfo;
  } else if (capList.length > 1 && i === 0 && capInfo) {
    // Multiple capitals, only first one gets provided coordinates
    coords = capInfo;
  }
  // else coords remains null - will be enriched later from Wikidata
  
  // Use coords in place creation...
}
```

### Solution 5: Cleanup Tool for Existing Duplicates

**Create `tools/corrections/fix-duplicate-capitals.js`:**

```javascript
#!/usr/bin/env node
/**
 * Deduplicate capital cities by merging duplicate records
 * Strategy:
 * 1. Identify duplicates (same country + same normalized name)
 * 2. Choose best record (best coordinates, most names, most recent)
 * 3. Merge place_names, place_hierarchy, attributes to best record
 * 4. Delete inferior duplicates
 */

const { ensureDatabase } = require('../src/db/sqlite');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'news.db');
const db = ensureDatabase(dbPath);

// Find duplicate capital cities
const duplicates = db.prepare(`
  SELECT 
    p.country_code,
    pn.normalized,
    GROUP_CONCAT(p.id) as ids,
    COUNT(*) as count
  FROM places p
  JOIN place_names pn ON p.canonical_name_id = pn.id
  WHERE p.kind = 'city' 
    AND json_extract(p.extra, '$.role') = 'capital'
  GROUP BY p.country_code, pn.normalized
  HAVING COUNT(*) > 1
`).all();

console.log(`Found ${duplicates.length} sets of duplicate capitals`);

// For each set, merge to best record
for (const dup of duplicates) {
  const ids = dup.ids.split(',').map(Number);
  console.log(`\\nMerging ${dup.country_code} ${dup.normalized}: ${ids.length} records`);
  
  // Choose best record (most complete)
  const records = db.prepare(`
    SELECT id, lat, lng, population, 
           (lat IS NOT NULL AND lng IS NOT NULL) as has_coords,
           (population IS NOT NULL) as has_pop
    FROM places WHERE id IN (${ids.join(',')})
    ORDER BY has_coords DESC, has_pop DESC, id ASC
  `).all();
  
  const keepId = records[0].id;
  const deleteIds = ids.filter(id => id !== keepId);
  
  console.log(`  Keeping: ${keepId}, Deleting: ${deleteIds.join(', ')}`);
  
  db.transaction(() => {
    // Merge place_names
    db.prepare(`
      UPDATE place_names SET place_id = ? 
      WHERE place_id IN (${deleteIds.join(',')})
    `).run(keepId);
    
    // Merge place_hierarchy
    db.prepare(`
      UPDATE OR IGNORE place_hierarchy SET child_id = ?
      WHERE child_id IN (${deleteIds.join(',')})
    `).run(keepId);
    
    // Merge place_attribute_values
    db.prepare(`
      UPDATE OR IGNORE place_attribute_values SET place_id = ?
      WHERE place_id IN (${deleteIds.join(',')})
    `).run(keepId);
    
    // Delete duplicates
    db.prepare(`
      DELETE FROM places WHERE id IN (${deleteIds.join(',')})
    `).run();
  })();
  
  console.log(`  ✓ Merged successfully`);
}

console.log(`\\n✓ Deduplication complete`);
```

## Implementation Priority

1. **Immediate** (today): Solution 5 - Run cleanup tool to fix existing duplicates
2. **Short-term** (this week): Solution 2 - Add external ID tracking to prevent future duplicates
3. **Short-term** (this week): Solution 1 - Add ingestion run tracking
4. **Medium-term** (next sprint): Solution 4 - Fix multi-capital coordinate handling
5. **Future**: Solution 3 - Coordinate-based proximity matching (complex, low priority)

## Testing Strategy

1. **Before cleanup**: Take database backup
2. **Test on small dataset**: Run with `--countries=GB,IE,ZA` first
3. **Verify results**: Check that only one capital per city remains
4. **Full cleanup**: Run on complete dataset
5. **Re-ingest protection**: Verify `--force=1` is required for re-ingestion

## Related Issues

- See `list-capital-cities` tool output for current duplicate count
- South Africa capitals need manual coordinate correction after deduplication
- Consider adding Wikidata enrichment for missing coordinates
