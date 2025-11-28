# Gazetteer Troubleshooting Guide

> **Purpose**: Diagnose and resolve common gazetteer issues.

## Quick Diagnostics

### Check Gazetteer Health

```bash
# Quick stats
node -e "
const { PlaceLookup } = require('./src/knowledge/PlaceLookup');
const lookup = PlaceLookup.getInstance();
lookup.load().then(() => console.log(JSON.stringify(lookup.getStats(), null, 2)));
"
```

Expected healthy output:
```json
{
  "placeCount": 25000,
  "nameCount": 150000,
  "slugCount": 80000,
  "loadTimeMs": 150
}
```

### Check Database

```bash
sqlite3 data/gazetteer.db "
  SELECT 
    (SELECT COUNT(*) FROM places) as places,
    (SELECT COUNT(*) FROM place_names) as names,
    (SELECT COUNT(*) FROM place_external_ids) as external_ids,
    (SELECT COUNT(DISTINCT source) FROM place_external_ids) as sources
"
```

---

## Common Issues

### Issue: "Place not found" for known city

**Symptoms**: `PlaceLookup.find('chicago')` returns `null` even though Chicago should exist.

**Diagnosis**:
```javascript
const { PlaceLookup } = require('./src/knowledge/PlaceLookup');
const lookup = PlaceLookup.getInstance();
await lookup.load();

// Check exact match
console.log(lookup.find('chicago'));

// Check slug match
console.log(lookup.findBySlug('chicago'));

// Check database directly
const db = require('better-sqlite3')('./data/gazetteer.db');
console.log(db.prepare("SELECT * FROM place_names WHERE name_text LIKE '%chicago%' COLLATE NOCASE").all());
```

**Causes**:
1. **Place not in database**: GeoNames import may have filtered it out
2. **Name variant missing**: "Chicago" vs "City of Chicago"
3. **Slug collision**: Another place claimed the slug first

**Solutions**:

```javascript
// Add missing place manually
const db = require('better-sqlite3')('./data/gazetteer.db');

const result = db.prepare(`
  INSERT INTO places (kind, country_code, population, lat, lng, source, place_type)
  VALUES ('city', 'US', 2700000, 41.8781, -87.6298, 'manual', 'city')
`).run();

const placeId = result.lastInsertRowid;

db.prepare(`
  INSERT INTO place_names (place_id, name_text, lang, kind, is_preferred, source)
  VALUES (?, 'Chicago', 'en', 'official', 1, 'manual')
`).run(placeId);

db.prepare(`
  UPDATE places SET canonical_name_id = (
    SELECT id FROM place_names WHERE place_id = ?
  ) WHERE id = ?
`).run(placeId, placeId);
```

---

### Issue: Wrong place returned (disambiguation failure)

**Symptoms**: `PlaceLookup.find('birmingham')` returns Birmingham, Alabama instead of Birmingham, UK.

**Diagnosis**:
```javascript
// Get all matches
const matches = lookup.findAll('birmingham');
console.log(matches.map(p => ({
  name: p.canonicalName,
  country: p.countryCode,
  population: p.population
})));
```

**Cause**: Both places exist, but US version has higher population in database.

**Solutions**:

1. **Use `findBest()` with country hint**:
```javascript
const result = lookup.findBest('birmingham', { countryCode: 'GB' });
```

2. **Use full name with country**:
```javascript
const result = lookup.find('birmingham, uk');
// or
const result = lookup.find('birmingham england');
```

3. **Add alias that disambiguates**:
```sql
INSERT INTO alias_mappings (alias_text, alias_slug, canonical_name, target_place_id, is_active)
SELECT 'birmingham uk', 'birmingham-uk', 'Birmingham', id, 1
FROM places WHERE kind = 'city' AND country_code = 'GB' 
AND id IN (SELECT place_id FROM place_names WHERE name_text = 'Birmingham');
```

---

### Issue: PlaceLookup slow to load

**Symptoms**: `lookup.load()` takes >500ms

**Diagnosis**:
```javascript
console.time('load');
await lookup.load();
console.timeEnd('load');

// Check what's slow
console.log(lookup.getStats());
```

**Causes**:
1. Too many places (>100K)
2. Too many names per place
3. Database not indexed
4. Cold cache

**Solutions**:

1. **Add indexes**:
```sql
CREATE INDEX IF NOT EXISTS idx_place_names_place ON place_names(place_id);
CREATE INDEX IF NOT EXISTS idx_places_kind ON places(kind);
```

2. **Filter places at load time**:
```javascript
// Only load cities with population > 10000
const lookup = PlaceLookup.getInstance({ minPopulation: 10000 });
```

3. **Warm cache on startup**:
```javascript
// In your app init
const { PlaceLookup } = require('./src/knowledge/PlaceLookup');
PlaceLookup.getInstance().load(); // Fire and forget
```

---

### Issue: Duplicate places in database

**Symptoms**: Same city appears multiple times with different IDs.

**Diagnosis**:
```sql
-- Find duplicates by name + country
SELECT name_text, country_code, COUNT(*) as cnt
FROM place_names pn
JOIN places p ON pn.place_id = p.id
WHERE pn.is_preferred = 1
GROUP BY name_text, country_code
HAVING cnt > 1
ORDER BY cnt DESC;
```

**Cause**: Multiple sources imported the same place without deduplication.

**Solutions**:

1. **Use Wikidata as dedup key**:
```sql
-- Find places that share a Wikidata ID
SELECT wikidata, GROUP_CONCAT(place_id) as place_ids
FROM place_external_ids
WHERE source = 'wikidata'
GROUP BY wikidata
HAVING COUNT(*) > 1;
```

2. **Merge duplicates**:
```javascript
async function mergePlaces(db, keepId, removeId) {
  // Move names
  db.prepare('UPDATE place_names SET place_id = ? WHERE place_id = ?').run(keepId, removeId);
  
  // Move external IDs
  db.prepare('UPDATE OR IGNORE place_external_ids SET place_id = ? WHERE place_id = ?').run(keepId, removeId);
  
  // Move attributes
  db.prepare('UPDATE OR IGNORE place_attributes SET place_id = ? WHERE place_id = ?').run(keepId, removeId);
  
  // Delete duplicate
  db.prepare('DELETE FROM places WHERE id = ?').run(removeId);
}
```

---

### Issue: Schema migration failed

**Symptoms**: Error messages about missing columns or tables.

**Diagnosis**:
```bash
node scripts/gazetteer/verify-schema.js
```

**Solutions**:

1. **Re-run migration**:
```bash
node scripts/gazetteer/migrate-schema.js
```

2. **Manual fix** (if migration script fails):
```sql
-- Add missing column
ALTER TABLE places ADD COLUMN place_type TEXT DEFAULT 'city';

-- Create missing table
CREATE TABLE IF NOT EXISTS alias_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alias_text TEXT NOT NULL,
  alias_slug TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  target_place_id INTEGER NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (target_place_id) REFERENCES places(id)
);

-- Create missing indexes
CREATE INDEX IF NOT EXISTS idx_alias_slug ON alias_mappings(alias_slug);
```

---

### Issue: GeoNames import failed

**Symptoms**: Import script crashes or imports 0 records.

**Diagnosis**:
```bash
# Check file exists
ls -la data/geonames/cities15000.txt

# Check file format (should be tab-separated)
head -1 data/geonames/cities15000.txt | cat -A

# Count lines
wc -l data/geonames/cities15000.txt
```

**Common causes**:
1. **File not downloaded**: Run `curl -O https://download.geonames.org/export/dump/cities15000.zip`
2. **File not extracted**: Run `unzip cities15000.zip`
3. **Wrong encoding**: Should be UTF-8
4. **Disk full**: Check disk space

**Solutions**:
```bash
# Re-download and extract
cd data/geonames
rm -f cities15000.txt cities15000.zip
curl -O https://download.geonames.org/export/dump/cities15000.zip
unzip cities15000.zip
```

---

### Issue: PostGIS connection refused

**Symptoms**: `ECONNREFUSED` or `connection refused` errors.

**Diagnosis**:
```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Check you can connect
psql -h localhost -p 5432 -U osm -d osm -c "SELECT 1"

# Check PostGIS extension
psql -h localhost -p 5432 -U osm -d osm -c "SELECT PostGIS_Version()"
```

**Solutions**:

1. **Start PostgreSQL**:
```bash
# Windows
net start postgresql-x64-15

# Linux
sudo systemctl start postgresql
```

2. **Check config file**:
```bash
cat config/postgis.json
# Verify host, port, database, user, password
```

3. **Check pg_hba.conf allows connections**:
```
# In pg_hba.conf, add:
host    osm    osm    127.0.0.1/32    md5
```

---

### Issue: Memory pressure with large gazetteer

**Symptoms**: Node.js crashes with `FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory`

**Diagnosis**:
```bash
# Check current memory limit
node -e "console.log(v8.getHeapStatistics().heap_size_limit / 1024 / 1024, 'MB')"

# Check PlaceLookup memory usage
node --expose-gc -e "
const { PlaceLookup } = require('./src/knowledge/PlaceLookup');
global.gc();
const before = process.memoryUsage().heapUsed;
PlaceLookup.getInstance().load().then(() => {
  global.gc();
  const after = process.memoryUsage().heapUsed;
  console.log('PlaceLookup uses', (after - before) / 1024 / 1024, 'MB');
});
"
```

**Solutions**:

1. **Increase memory limit**:
```bash
node --max-old-space-size=4096 your-script.js
```

2. **Filter places at load**:
```javascript
// Only load what you need
const lookup = PlaceLookup.getInstance({
  minPopulation: 50000,  // Skip small towns
  kinds: ['city', 'capital']  // Skip villages
});
```

3. **Use lazy loading**:
```javascript
// Don't load all at once - load on demand
class LazyPlaceLookup {
  constructor() {
    this.loaded = new Map();
  }
  
  find(name) {
    const slug = toUrlSlug(name);
    if (!this.loaded.has(slug)) {
      // Load from DB on demand
      this.loaded.set(slug, this._loadFromDb(slug));
    }
    return this.loaded.get(slug);
  }
}
```

---

## Verification Scripts

### Verify Coverage

```bash
node -e "
const { PlaceLookup } = require('./src/knowledge/PlaceLookup');
const lookup = PlaceLookup.getInstance();
lookup.load().then(() => {
  const cities = ['chicago', 'new york', 'manchester', 'birmingham', 'tokyo', 'paris'];
  for (const city of cities) {
    const found = lookup.find(city);
    console.log(city + ':', found ? '✅ ' + found.canonicalName : '❌ NOT FOUND');
  }
});
"
```

### Verify Slug Uniqueness

```bash
node -e "
const { PlaceLookup } = require('./src/knowledge/PlaceLookup');
const lookup = PlaceLookup.getInstance();
lookup.load().then(() => {
  const stats = lookup.getStats();
  const slugCollisionRate = 1 - (stats.slugCount / stats.nameCount);
  console.log('Slug collision rate:', (slugCollisionRate * 100).toFixed(1) + '%');
  console.log('(Lower is better, <10% is acceptable)');
});
"
```

### Verify Sources

```sql
-- Check sources are being tracked
SELECT source, COUNT(*) as places
FROM places
GROUP BY source
ORDER BY places DESC;

-- Check external IDs by source
SELECT source, COUNT(*) as ids
FROM place_external_ids
GROUP BY source
ORDER BY ids DESC;
```

---

## Getting Help

1. **Check logs**: `data/logs/gazetteer-*.log`
2. **Check schema**: `sqlite3 data/gazetteer.db ".schema"`
3. **Check stats**: `node scripts/gazetteer/stats.js`
4. **Check coverage**: `node scripts/gazetteer/coverage-report.js`

If still stuck, document:
- Exact error message
- Steps to reproduce
- Output of diagnostic commands above
