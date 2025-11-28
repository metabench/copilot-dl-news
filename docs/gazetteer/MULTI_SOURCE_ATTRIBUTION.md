# Multi-Source Attribution System

> **Purpose**: Track data provenance per attribute, handle conflicts, and maintain trust in data quality when combining multiple sources.

## The Problem

When the same place exists in multiple sources, we get conflicting data:

```
Manchester, UK:
┌────────────────┬────────────┬────────────┬────────────┐
│ Attribute      │ GeoNames   │ Wikidata   │ OSM        │
├────────────────┼────────────┼────────────┼────────────┤
│ Name           │ Manchester │ Manchester │ Manchester │
│ Population     │ 510,746    │ 552,000    │ 545,500    │
│ Coordinates    │ 53.48,-2.24│ 53.48,-2.23│ 53.48,-2.24│
│ Timezone       │ Europe/Lon │ —          │ —          │
│ Admin region   │ ENG        │ Q23436     │ relation/X │
│ Boundary       │ —          │ —          │ polygon    │
└────────────────┴────────────┴────────────┴────────────┘
```

**Questions we must answer:**
1. Which population value do we display?
2. How do we know where each value came from?
3. When a source updates, which attributes change?
4. Can we show users the data provenance?

## Core Concept: Attributed Values

Instead of storing a single value per attribute, we store **attributed values**:

```javascript
// Traditional (single value)
place.population = 510746;

// Multi-source attributed
place.population = {
  value: 510746,
  source: 'geonames',
  sourceId: '2643123',
  confidence: 0.95,
  updatedAt: '2025-11-28',
  alternatives: [
    { value: 552000, source: 'wikidata', sourceId: 'Q18125' },
    { value: 545500, source: 'osm', sourceId: 'node/123456' }
  ]
};
```

## Schema Design

### Option A: Attributes Table (Recommended)

Store each attribute as a separate row with full provenance.

```sql
-- Existing tables remain unchanged
-- places, place_names, place_external_ids

-- New: Attribute-level tracking
CREATE TABLE place_attributes (
    id INTEGER PRIMARY KEY,
    place_id INTEGER NOT NULL,
    attr TEXT NOT NULL,           -- 'population', 'elevation', 'timezone', etc.
    value TEXT NOT NULL,          -- JSON or string value
    value_type TEXT DEFAULT 'string',  -- 'string', 'number', 'json'
    source TEXT NOT NULL,         -- 'geonames', 'wikidata', 'osm'
    source_id TEXT,               -- External ID at source
    confidence REAL DEFAULT 1.0,  -- 0.0 to 1.0
    is_preferred INTEGER DEFAULT 0,  -- Currently displayed value
    fetched_at TEXT NOT NULL,     -- When we got this value
    source_updated_at TEXT,       -- When source last changed it
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE
);

-- Indexes for common queries
CREATE INDEX idx_place_attrs_place ON place_attributes(place_id);
CREATE INDEX idx_place_attrs_attr ON place_attributes(attr);
CREATE INDEX idx_place_attrs_source ON place_attributes(source);
CREATE INDEX idx_place_attrs_preferred ON place_attributes(place_id, attr, is_preferred);
```

### Option B: JSON Column (Simpler)

Store attribution metadata inline in the places table.

```sql
-- Modify places table
ALTER TABLE places ADD COLUMN attributions TEXT;  -- JSON blob

-- Example JSON structure
{
  "population": {
    "value": 510746,
    "sources": {
      "geonames": { "value": 510746, "id": "2643123", "at": "2025-11-28" },
      "wikidata": { "value": 552000, "id": "Q18125", "at": "2025-11-27" }
    },
    "preferred": "geonames"
  },
  "timezone": {
    "value": "Europe/London",
    "sources": {
      "geonames": { "value": "Europe/London", "id": "2643123", "at": "2025-11-28" }
    },
    "preferred": "geonames"
  }
}
```

### Recommendation: Start with Option A

- More queryable (find all places where sources disagree)
- Easier to audit (full history possible)
- Cleaner separation of concerns
- Can always denormalize later for performance

## Conflict Resolution Policies

### Policy 1: Source Priority (Default)

Configure a global priority order per attribute type.

```javascript
const SOURCE_PRIORITY = {
  // Population: Trust official sources first
  population: ['census', 'geonames', 'wikidata', 'osm'],
  
  // Coordinates: Trust surveyed data
  coordinates: ['osm', 'geonames', 'wikidata'],
  
  // Names: Trust local/official sources
  name_official: ['osm', 'geonames', 'wikidata'],
  name_english: ['geonames', 'wikidata', 'osm'],
  
  // Timezone: Only GeoNames has reliable data
  timezone: ['geonames'],
  
  // Boundaries: Only OSM has polygons
  boundary: ['osm'],
  
  // Default fallback
  default: ['geonames', 'osm', 'wikidata']
};
```

### Policy 2: Recency Preference

For attributes that change frequently, prefer the most recent value.

```javascript
function resolveByRecency(attribute, values) {
  // Sort by source update time, most recent first
  return values.sort((a, b) => 
    new Date(b.source_updated_at) - new Date(a.source_updated_at)
  )[0];
}
```

### Policy 3: Confidence Weighting

Assign confidence scores based on source reliability and data freshness.

```javascript
function calculateConfidence(attr, source, value, metadata) {
  let confidence = SOURCE_BASE_CONFIDENCE[source] || 0.5;
  
  // Boost for recent updates
  const daysSinceUpdate = daysBetween(metadata.updatedAt, new Date());
  if (daysSinceUpdate < 30) confidence += 0.1;
  if (daysSinceUpdate < 7) confidence += 0.1;
  
  // Boost for matching other sources
  if (metadata.matchesOtherSources) confidence += 0.15;
  
  // Penalty for outliers
  if (metadata.isOutlier) confidence -= 0.3;
  
  return Math.max(0, Math.min(1, confidence));
}

const SOURCE_BASE_CONFIDENCE = {
  'census': 0.95,
  'geonames': 0.85,
  'osm': 0.80,
  'wikidata': 0.75,
  'user': 0.50
};
```

### Policy 4: Manual Override

Allow explicit preference setting for specific places.

```sql
-- Mark a specific attribute value as manually verified
UPDATE place_attributes 
SET is_preferred = 1, confidence = 1.0
WHERE place_id = 12345 
  AND attr = 'population' 
  AND source = 'census';

-- Log the override
INSERT INTO place_attribute_overrides (
    place_id, attr, chosen_source, reason, overridden_by, overridden_at
) VALUES (
    12345, 'population', 'census', 
    'Verified against 2024 census data', 
    'admin', CURRENT_TIMESTAMP
);
```

## Implementation

### AttributedValue Class

```javascript
/**
 * Represents a value with provenance information
 */
class AttributedValue {
  constructor({ value, source, sourceId, confidence, updatedAt }) {
    this.value = value;
    this.source = source;
    this.sourceId = sourceId;
    this.confidence = confidence ?? 1.0;
    this.updatedAt = updatedAt ?? new Date().toISOString();
  }
  
  toJSON() {
    return {
      value: this.value,
      source: this.source,
      sourceId: this.sourceId,
      confidence: this.confidence,
      updatedAt: this.updatedAt
    };
  }
}
```

### AttributionManager Class

```javascript
/**
 * Manages multi-source attribution for place attributes
 */
class AttributionManager {
  constructor(db, policies = {}) {
    this.db = db;
    this.policies = { ...DEFAULT_POLICIES, ...policies };
    this._prepareStatements();
  }
  
  /**
   * Record an attribute value from a source
   */
  recordAttribute(placeId, attr, value, source, metadata = {}) {
    const confidence = this._calculateConfidence(attr, source, value, metadata);
    
    this.stmts.insertAttr.run({
      place_id: placeId,
      attr,
      value: typeof value === 'object' ? JSON.stringify(value) : String(value),
      value_type: typeof value === 'number' ? 'number' : 
                  typeof value === 'object' ? 'json' : 'string',
      source,
      source_id: metadata.sourceId,
      confidence,
      fetched_at: new Date().toISOString(),
      source_updated_at: metadata.updatedAt
    });
    
    // Re-evaluate preferred value
    this._updatePreferred(placeId, attr);
  }
  
  /**
   * Get the preferred value for an attribute
   */
  getPreferred(placeId, attr) {
    const row = this.stmts.getPreferred.get(placeId, attr);
    if (!row) return null;
    return this._parseValue(row);
  }
  
  /**
   * Get all values for an attribute (for display/comparison)
   */
  getAllValues(placeId, attr) {
    const rows = this.stmts.getAllValues.all(placeId, attr);
    return rows.map(r => this._parseValue(r));
  }
  
  /**
   * Find places where sources disagree
   */
  findConflicts(attr, threshold = 0.1) {
    // Find places with multiple values that differ significantly
    const sql = `
      SELECT pa.place_id, 
             GROUP_CONCAT(pa.value || ':' || pa.source) as values,
             COUNT(DISTINCT pa.value) as distinct_values
      FROM place_attributes pa
      WHERE pa.attr = ?
      GROUP BY pa.place_id
      HAVING distinct_values > 1
    `;
    return this.db.prepare(sql).all(attr);
  }
  
  /**
   * Re-evaluate which value should be preferred
   */
  _updatePreferred(placeId, attr) {
    // Get all values for this attribute
    const values = this.stmts.getAllValues.all(placeId, attr);
    if (values.length === 0) return;
    
    // Apply resolution policy
    const policy = this.policies[attr] || this.policies.default;
    let preferred;
    
    if (policy.type === 'priority') {
      preferred = this._resolveByPriority(values, policy.order);
    } else if (policy.type === 'recency') {
      preferred = this._resolveByRecency(values);
    } else if (policy.type === 'confidence') {
      preferred = this._resolveByConfidence(values);
    } else {
      preferred = values[0]; // Fallback: first value
    }
    
    // Update is_preferred flags
    this.db.prepare(`
      UPDATE place_attributes 
      SET is_preferred = (id = ?)
      WHERE place_id = ? AND attr = ?
    `).run(preferred.id, placeId, attr);
  }
  
  _resolveByPriority(values, priorityOrder) {
    for (const source of priorityOrder) {
      const match = values.find(v => v.source === source);
      if (match) return match;
    }
    return values[0];
  }
  
  _resolveByRecency(values) {
    return values.sort((a, b) => 
      new Date(b.source_updated_at || b.fetched_at) - 
      new Date(a.source_updated_at || a.fetched_at)
    )[0];
  }
  
  _resolveByConfidence(values) {
    return values.sort((a, b) => b.confidence - a.confidence)[0];
  }
}
```

## Usage Examples

### Recording Attributes During Ingestion

```javascript
const attrib = new AttributionManager(db);

// From GeoNames loader
attrib.recordAttribute(placeId, 'population', 510746, 'geonames', {
  sourceId: '2643123',
  updatedAt: '2025-11-28'
});

// From Wikidata enrichment
attrib.recordAttribute(placeId, 'population', 552000, 'wikidata', {
  sourceId: 'Q18125',
  updatedAt: '2025-11-27'
});

// From OSM/PostGIS
attrib.recordAttribute(placeId, 'population', 545500, 'osm', {
  sourceId: 'node/123456',
  updatedAt: '2025-11-20'
});
```

### Querying with Attribution

```javascript
// Get preferred population
const pop = attrib.getPreferred(placeId, 'population');
console.log(pop);
// { value: 510746, source: 'geonames', confidence: 0.85 }

// Get all population values
const allPops = attrib.getAllValues(placeId, 'population');
console.log(allPops);
// [
//   { value: 510746, source: 'geonames', confidence: 0.85, isPreferred: true },
//   { value: 552000, source: 'wikidata', confidence: 0.75, isPreferred: false },
//   { value: 545500, source: 'osm', confidence: 0.80, isPreferred: false }
// ]

// Find conflicts to review
const conflicts = attrib.findConflicts('population');
console.log(`Found ${conflicts.length} places with conflicting population data`);
```

### Displaying Attribution in UI

```html
<!-- Population display with source indicator -->
<div class="attributed-value">
  <span class="value">510,746</span>
  <span class="source" title="GeoNames (2025-11-28)">
    <img src="/icons/geonames.svg" alt="GeoNames" />
  </span>
  <button class="show-alternatives" aria-label="Show other sources">
    +2 sources
  </button>
</div>

<!-- Expanded view showing all sources -->
<div class="attribution-details">
  <table>
    <tr class="preferred">
      <td>510,746</td>
      <td><img src="/icons/geonames.svg" /> GeoNames</td>
      <td>Nov 28, 2025</td>
      <td>✓ Preferred</td>
    </tr>
    <tr>
      <td>552,000</td>
      <td><img src="/icons/wikidata.svg" /> Wikidata</td>
      <td>Nov 27, 2025</td>
      <td></td>
    </tr>
    <tr>
      <td>545,500</td>
      <td><img src="/icons/osm.svg" /> OpenStreetMap</td>
      <td>Nov 20, 2025</td>
      <td></td>
    </tr>
  </table>
</div>
```

## Migration Path

### Phase 1: Add Infrastructure (No Breaking Changes)
1. Create `place_attributes` table
2. Add `AttributionManager` class
3. Modify ingestors to optionally record attributes

### Phase 2: Dual-Write
1. Continue writing to existing columns
2. Also write to `place_attributes`
3. Verify data consistency

### Phase 3: Migrate Reads
1. Update `PlaceLookup` to read from `place_attributes`
2. Update API endpoints to include attribution
3. Add UI for displaying sources

### Phase 4: Deprecate Old Columns
1. Stop writing to old columns
2. Add migration to move historical data
3. Eventually drop redundant columns

## Benefits

1. **Transparency**: Users know where data comes from
2. **Quality control**: Easy to identify and fix bad data
3. **Conflict detection**: Automatic flagging of disagreements
4. **Auditability**: Full history of data changes
5. **Flexibility**: Easy to add new sources
6. **Trust**: Clear provenance builds user confidence
