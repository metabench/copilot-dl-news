# Gazetteer Improvement Implementation Plan

> **Purpose**: Phased roadmap for transforming the gazetteer from ~500 places to comprehensive global coverage.

## Executive Summary

| Phase | Duration | Outcome |
|-------|----------|---------|
| 0: Stabilization | 1-2 days | Schema ready, existing data preserved |
| 1: GeoNames Import | 2-3 days | +25K cities, 10x coverage |
| 2: PostGIS Integration | 3-5 days | Boundaries, spatial queries |
| 3: Multi-Source Attribution | 2-3 days | Conflict resolution live |
| 4: Quality & Monitoring | Ongoing | Accuracy metrics, dashboards |

**Total Estimated Effort**: 2-3 weeks to full coverage

## Phase 0: Stabilization (Now)

### 0.1 Backup Current Data
```bash
# Create timestamped backup
cp data/gazetteer.db "data/backups/gazetteer.db.$(date +%Y%m%d)"
```

### 0.2 Verify Schema Migration
Run schema checks to ensure migration is complete:

```bash
node scripts/gazetteer/verify-schema.js
```

Expected output:
- ✅ `alias_mappings` table exists
- ✅ `place_type` column on `places`
- ✅ `canonical_name_id` references valid
- ✅ Indexes created

### 0.3 Document Current State
Update `CURRENT_STATE.md` with latest statistics:

```bash
node scripts/gazetteer/stats.js > docs/gazetteer/_artifacts/stats-$(date +%Y%m%d).json
```

### Deliverables
- [ ] Backup created
- [ ] Schema verified
- [ ] Stats captured
- [ ] Known gaps documented

---

## Phase 1: GeoNames Import (Priority)

### 1.1 Download GeoNames Files

```bash
mkdir -p data/geonames
cd data/geonames

# Main cities file (~25K records)
curl -O https://download.geonames.org/export/dump/cities15000.zip
unzip cities15000.zip

# Admin divisions (states/provinces)
curl -O https://download.geonames.org/export/dump/admin1CodesASCII.txt

# Alternate names (optional, large)
# curl -O https://download.geonames.org/export/dump/alternateNamesV2.zip

# Country info
curl -O https://download.geonames.org/export/dump/countryInfo.txt
```

### 1.2 Create GeoNames Loader

**File**: `scripts/gazetteer/load-geonames.js`

```javascript
'use strict';

const fs = require('fs');
const readline = require('readline');
const path = require('path');
const Database = require('better-sqlite3');

const GEONAMES_DIR = path.join(__dirname, '../../data/geonames');
const DB_PATH = path.join(__dirname, '../../data/gazetteer.db');

// GeoNames cities15000.txt columns
const COLUMNS = {
  geonameid: 0,      // integer
  name: 1,           // utf8
  asciiname: 2,      // ascii
  alternatenames: 3, // comma-separated
  latitude: 4,
  longitude: 5,
  feature_class: 6,  // P = populated place
  feature_code: 7,   // PPL, PPLA, PPLC, etc
  country_code: 8,   // ISO-3166 2-letter
  cc2: 9,            // alternate country codes
  admin1_code: 10,   // state/province
  admin2_code: 11,
  admin3_code: 12,
  admin4_code: 13,
  population: 14,
  elevation: 15,
  dem: 16,
  timezone: 17,
  modification_date: 18
};

async function loadCities(db, filePath) {
  const stmts = {
    insertPlace: db.prepare(`
      INSERT INTO places (kind, country_code, population, lat, lng, source, place_type)
      VALUES (?, ?, ?, ?, ?, 'geonames', ?)
    `),
    insertName: db.prepare(`
      INSERT INTO place_names (place_id, name_text, lang, kind, is_preferred, source)
      VALUES (?, ?, ?, ?, ?, 'geonames')
    `),
    insertExternalId: db.prepare(`
      INSERT OR IGNORE INTO place_external_ids (place_id, source, ext_id)
      VALUES (?, 'geonames', ?)
    `),
    findByGeonameId: db.prepare(`
      SELECT place_id FROM place_external_ids WHERE source = 'geonames' AND ext_id = ?
    `)
  };
  
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity
  });
  
  let processed = 0;
  let inserted = 0;
  let skipped = 0;
  
  const insertMany = db.transaction((batch) => {
    for (const row of batch) {
      const cols = row.split('\t');
      
      const geonameId = cols[COLUMNS.geonameid];
      const name = cols[COLUMNS.name];
      const asciiName = cols[COLUMNS.asciiname];
      const altNames = cols[COLUMNS.alternatenames] ? cols[COLUMNS.alternatenames].split(',') : [];
      const lat = parseFloat(cols[COLUMNS.latitude]);
      const lng = parseFloat(cols[COLUMNS.longitude]);
      const countryCode = cols[COLUMNS.country_code];
      const featureCode = cols[COLUMNS.feature_code];
      const population = parseInt(cols[COLUMNS.population], 10) || 0;
      
      // Check if already imported
      const existing = stmts.findByGeonameId.get(geonameId);
      if (existing) {
        skipped++;
        continue;
      }
      
      // Determine place type from feature code
      const placeType = mapFeatureCode(featureCode);
      
      // Insert place
      const result = stmts.insertPlace.run('city', countryCode, population, lat, lng, placeType);
      const placeId = result.lastInsertRowid;
      
      // Insert external ID
      stmts.insertExternalId.run(placeId, geonameId);
      
      // Insert names
      stmts.insertName.run(placeId, name, 'und', 'official', 1);
      
      if (asciiName && asciiName !== name) {
        stmts.insertName.run(placeId, asciiName, 'en', 'ascii', 0);
      }
      
      // Insert unique alternate names (limit to avoid explosion)
      const uniqueAlts = [...new Set(altNames.filter(n => n && n !== name && n !== asciiName))].slice(0, 20);
      for (const alt of uniqueAlts) {
        stmts.insertName.run(placeId, alt, 'und', 'alternate', 0);
      }
      
      inserted++;
    }
  });
  
  const BATCH_SIZE = 1000;
  let batch = [];
  
  for await (const line of rl) {
    if (!line.trim()) continue;
    batch.push(line);
    
    if (batch.length >= BATCH_SIZE) {
      insertMany(batch);
      processed += batch.length;
      console.log(`Processed ${processed} rows, inserted ${inserted}, skipped ${skipped}`);
      batch = [];
    }
  }
  
  // Final batch
  if (batch.length > 0) {
    insertMany(batch);
    processed += batch.length;
  }
  
  console.log(`\nComplete: ${processed} rows, ${inserted} inserted, ${skipped} skipped`);
  return { processed, inserted, skipped };
}

function mapFeatureCode(code) {
  const map = {
    'PPLC': 'capital',
    'PPLA': 'admin_capital',
    'PPLA2': 'admin2_capital',
    'PPL': 'city',
    'PPLX': 'section',
    'PPLL': 'village'
  };
  return map[code] || 'city';
}

async function main() {
  const citiesFile = path.join(GEONAMES_DIR, 'cities15000.txt');
  
  if (!fs.existsSync(citiesFile)) {
    console.error('Error: cities15000.txt not found. Download from GeoNames first.');
    console.error('  curl -O https://download.geonames.org/export/dump/cities15000.zip');
    process.exit(1);
  }
  
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  
  console.log('Loading cities15000.txt...');
  const stats = await loadCities(db, citiesFile);
  
  // Update canonical names
  console.log('\nUpdating canonical names...');
  db.exec(`
    UPDATE places SET canonical_name_id = (
      SELECT pn.id FROM place_names pn
      WHERE pn.place_id = places.id AND pn.is_preferred = 1
      LIMIT 1
    )
    WHERE canonical_name_id IS NULL
  `);
  
  db.close();
  console.log('\nDone!');
}

main().catch(console.error);
```

### 1.3 Run Import

```bash
# Download GeoNames (if not done)
node scripts/gazetteer/download-geonames.js

# Import cities
node scripts/gazetteer/load-geonames.js

# Verify import
node scripts/gazetteer/stats.js
```

### 1.4 Reload PlaceLookup

```javascript
// After import, PlaceLookup will automatically pick up new places
const { PlaceLookup } = require('./src/knowledge/PlaceLookup');
const lookup = PlaceLookup.getInstance();
await lookup.load();
console.log(lookup.getStats());
// Should show ~25,000+ places now
```

### Deliverables
- [ ] GeoNames files downloaded
- [ ] `load-geonames.js` script created
- [ ] Import complete (~25K cities)
- [ ] PlaceLookup verified with new data
- [ ] Coverage test: Chicago ✓, Manchester ✓, Birmingham ✓

---

## Phase 2: PostGIS Integration

### 2.1 Configure PostGIS Connection

```bash
# Create config file
cat > config/postgis.json << 'EOF'
{
  "host": "localhost",
  "port": 5432,
  "database": "osm",
  "user": "osm",
  "password": "osm"
}
EOF
```

### 2.2 Create PostGIS Adapter

**File**: `src/db/postgis/index.js`

See `POSTGIS_INTEGRATION.md` for full implementation.

### 2.3 Create OSM Ingestor

**File**: `src/crawler/gazetteer/ingestors/OsmIngestor.js`

Key features:
- Match existing places by Wikidata ID
- Add boundary polygons
- Add OSM-specific alternate names
- Fill coverage gaps

### 2.4 Boundary Enrichment

```bash
# Add boundaries to existing places
node scripts/gazetteer/enrich-boundaries.js

# Verify boundaries
sqlite3 data/gazetteer.db "SELECT COUNT(*) FROM places WHERE bbox IS NOT NULL"
```

### Deliverables
- [ ] PostGIS adapter created
- [ ] OSM ingestor created
- [ ] Boundary enrichment complete
- [ ] Spatial queries working

---

## Phase 3: Multi-Source Attribution

### 3.1 Create Attribute Tracking

The `place_attributes` table is already in schema. Begin using it:

```javascript
// When updating a place from a new source
function setAttribute(db, placeId, attrName, value, source, confidence = 1.0) {
  db.prepare(`
    INSERT INTO place_attributes (place_id, attr_name, attr_value, source, confidence, last_verified)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT (place_id, attr_name, source) DO UPDATE SET
      attr_value = excluded.attr_value,
      confidence = excluded.confidence,
      last_verified = excluded.last_verified
  `).run(placeId, attrName, JSON.stringify(value), source, confidence);
}
```

### 3.2 Conflict Resolution

```javascript
// Get best value for an attribute (highest confidence)
function getAttribute(db, placeId, attrName) {
  return db.prepare(`
    SELECT attr_value, source, confidence
    FROM place_attributes
    WHERE place_id = ? AND attr_name = ?
    ORDER BY confidence DESC
    LIMIT 1
  `).get(placeId, attrName);
}
```

### 3.3 Trust Hierarchy

Configure source trust levels:

```javascript
// config/source-trust.json
{
  "manual": 1.0,
  "osm": 0.8,
  "geonames": 0.7,
  "wikidata": 0.6,
  "rest_countries": 0.5,
  "inferred": 0.3
}
```

### Deliverables
- [ ] `setAttribute` / `getAttribute` functions
- [ ] Trust hierarchy configured
- [ ] Conflict resolution tested

---

## Phase 4: Quality & Monitoring

### 4.1 Coverage Dashboard

```bash
# Generate coverage report
node scripts/gazetteer/coverage-report.js
```

Output:
```
Countries: 195/195 (100%)
Cities >100K: 4,037/4,500 (90%)
Cities >15K: 24,687/25,000 (99%)

Coverage by continent:
  Europe:     98%
  N. America: 97%
  Asia:       95%
  S. America: 94%
  Africa:     89%
  Oceania:    91%
```

### 4.2 Quality Metrics

Track:
- Name matching accuracy
- Coordinate precision
- Population data freshness
- Source attribution completeness

### 4.3 Automated Updates

Schedule periodic updates:

```bash
# Cron: Weekly GeoNames update
0 3 * * 0 node scripts/gazetteer/update-geonames.js

# Cron: Monthly OSM sync
0 4 1 * * node scripts/gazetteer/sync-osm.js
```

### Deliverables
- [ ] Coverage report script
- [ ] Quality metrics dashboard
- [ ] Update automation

---

## Timeline

```
Week 1:
  Mon-Tue: Phase 0 (Stabilization)
  Wed-Fri: Phase 1 (GeoNames Import)

Week 2:
  Mon-Thu: Phase 2 (PostGIS Integration)
  Fri: Testing & debugging

Week 3:
  Mon-Wed: Phase 3 (Multi-Source Attribution)
  Thu-Fri: Phase 4 (Quality & Monitoring)
```

## Success Criteria

| Metric | Before | Target |
|--------|--------|--------|
| Total places | ~500 | 25,000+ |
| US cities covered | ~10 | 3,000+ |
| UK cities covered | ~5 | 500+ |
| Places with boundaries | 0 | 5,000+ |
| Source attribution | None | All places |
| Name lookup latency | 40ms | <50ms |

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| GeoNames download fails | Low | Medium | Mirror files locally, retry logic |
| PostGIS connection issues | Medium | High | Fallback to GeoNames-only mode |
| Memory pressure from 25K places | Medium | Medium | Lazy loading, pagination |
| Duplicate places | High | Medium | Deduplication via Wikidata QID |
| Coordinate mismatches | Medium | Low | Use OSM as truth for boundaries |

## Rollback Plan

If any phase fails:

1. **Restore from backup**: `cp data/backups/gazetteer.db.{timestamp} data/gazetteer.db`
2. **Clear PlaceLookup cache**: `PlaceLookup.getInstance().invalidate()`
3. **Document failure**: Add to `TROUBLESHOOTING.md`
4. **Investigate offline**: Don't block on live data

---

## Next Actions

1. **Immediate**: Download GeoNames files
2. **This week**: Complete Phase 1 (GeoNames import)
3. **Next week**: PostGIS integration
4. **Ongoing**: Monitor coverage, handle edge cases
