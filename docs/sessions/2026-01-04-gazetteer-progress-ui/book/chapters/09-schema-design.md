# Chapter 9: Schema Design for Fast Lookups

*Reading time: 10 minutes*

---

## Design Goals

The SQLite schema must support:
1. **Fast name → candidates lookup** (< 1ms)
2. **Hierarchy navigation** (parent chains, containment checks)
3. **Disambiguation signals** (priority, country, kind)
4. **Auditability** (where did this data come from?)

This chapter provides the complete, production-ready schema.

---

## Complete Schema

### `places` — The Core Entity Table

```sql
CREATE TABLE places (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,                  -- country | region | city | poi | supranational
  country_code TEXT,                   -- ISO-3166 alpha-2 when applicable
  adm1_code TEXT,                      -- first-level admin code when applicable
  adm2_code TEXT,                      -- second-level admin code when applicable
  population INTEGER,
  timezone TEXT,
  lat REAL,
  lng REAL,
  bbox TEXT,                           -- JSON [west,south,east,north] when available
  canonical_name_id INTEGER,           -- references place_names.id (optional)
  source TEXT,                         -- provenance (e.g., restcountries@v3)
  extra JSON,                          -- JSON blob for source-specific data
  status TEXT DEFAULT 'current', 
  valid_from TEXT, 
  valid_to TEXT, 
  wikidata_qid TEXT, 
  osm_type TEXT, 
  osm_id TEXT, 
  area REAL, 
  gdp_usd REAL, 
  wikidata_admin_level INTEGER, 
  wikidata_props JSON, 
  osm_tags JSON, 
  crawl_depth INTEGER DEFAULT 0, 
  priority_score REAL, 
  last_crawled_at INTEGER
);
```

### `place_names` — Alternate Names (Multi-Language)

```sql
CREATE TABLE place_names (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  normalized TEXT,                     -- lowercased/diacritics-free for matching
  lang TEXT,                           -- BCP-47 (e.g., en, fr, zh-Hans)
  script TEXT,                         -- optional ISO 15924
  name_kind TEXT,                      -- endonym | exonym | alias | abbrev | official | common | demonym
  is_preferred INTEGER,                -- 0/1
  is_official INTEGER,                 -- 0/1
  source TEXT,
  FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE
);
```

### `place_hierarchy` — Transitive Containment

```sql
CREATE TABLE place_hierarchy (
  parent_id INTEGER NOT NULL,
  child_id INTEGER NOT NULL,
  relation TEXT,                       -- admin_parent | contains | member_of
  depth INTEGER,
  PRIMARY KEY (parent_id, child_id),
  FOREIGN KEY (parent_id) REFERENCES places(id) ON DELETE CASCADE,
  FOREIGN KEY (child_id) REFERENCES places(id) ON DELETE CASCADE
);
```

### `article_place_relations` — Disambiguation Results

```sql
CREATE TABLE article_place_relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL,
  place_id INTEGER NOT NULL,
  relation_type TEXT NOT NULL CHECK(relation_type IN ('primary', 'secondary', 'mentioned', 'affected', 'origin')),
  confidence REAL NOT NULL CHECK(confidence >= 0.0 AND confidence <= 1.0),
  matching_rule_level INTEGER NOT NULL DEFAULT 0,
  evidence TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (article_id) REFERENCES http_responses(id) ON DELETE CASCADE,
  FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE,
  UNIQUE(article_id, place_id, matching_rule_level)
);
```

---

## Planned Schema Extensions

The following tables are designed but not yet implemented in the production database.

### `languages` — Supported Languages

```sql
CREATE TABLE languages (
  lang_code TEXT PRIMARY KEY,          -- ISO 639-1: 'en', 'zh', 'ar', 'ru'
  lang_name TEXT NOT NULL,             -- 'English', 'Chinese', 'Arabic', 'Russian'
  native_name TEXT,                    -- '中文', 'العربية', 'Русский'
  default_script TEXT,                 -- ISO 15924: 'Latn', 'Hans', 'Arab', 'Cyrl'
  text_direction TEXT DEFAULT 'ltr',   -- 'ltr' or 'rtl'
  normalization_rules TEXT,            -- JSON: language-specific normalization
  active INTEGER DEFAULT 1
);
```

### `transliterations` — Cross-Script Mappings

```sql
CREATE TABLE transliterations (
  translit_id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  place_id INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  
  source_lang TEXT NOT NULL,           -- Original language
  source_script TEXT NOT NULL,         -- Original script
  target_lang TEXT NOT NULL,           -- Target language
  target_script TEXT NOT NULL,         -- Target script
  
  source_text TEXT NOT NULL,           -- '北京'
  target_text TEXT NOT NULL,           -- 'Beijing' (romanization)
  target_norm TEXT NOT NULL,           -- 'beijing' (normalized for lookup)
  
  translit_system TEXT,                -- 'pinyin', 'wade-giles', 'bgn-pcgn', etc.
  is_standard INTEGER DEFAULT 0,       -- 1 if official/standard romanization
  
  UNIQUE (place_id, source_lang, target_lang, translit_system)
);

CREATE INDEX idx_translit_target ON transliterations(target_norm, target_lang);
```

### `normalization_rules` — Language-Specific Normalization

```sql
CREATE TABLE normalization_rules (
  rule_id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  lang_code TEXT,                      -- NULL for universal rules
  script_code TEXT,                    -- NULL for all scripts
  
  rule_type TEXT NOT NULL,             -- 'char_map', 'prefix_strip', 'suffix_strip', 'regex'
  rule_order INTEGER DEFAULT 0,        -- Execution order
  
  pattern TEXT NOT NULL,               -- Input pattern
  replacement TEXT NOT NULL,           -- Output replacement
  
  description TEXT,
  active INTEGER DEFAULT 1
);

CREATE INDEX idx_norm_rules ON normalization_rules(lang_code, rule_order);
```

### `snapshots` — Build Metadata

```sql
CREATE TABLE snapshots (
  snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  built_at TEXT NOT NULL,              -- ISO timestamp
  source_signature TEXT,               -- Hash of source data state
  
  -- Counts for verification
  country_count INTEGER,
  adm1_count INTEGER,
  adm2_count INTEGER,
  locality_count INTEGER,
  alias_count INTEGER,
  
  builder_version TEXT,                -- Version of build script
  notes TEXT
);
```

---

## Indexes

### Primary Lookups

```sql
-- The main lookup: normalized name to places
CREATE INDEX idx_place_names_normalized ON place_names(normalized);

-- Place lookups
CREATE INDEX idx_place_names_place_id ON place_names(place_id);
```

### Filtering

```sql
-- Filter by country and kind
CREATE INDEX idx_places_country ON places(country_code);
CREATE INDEX idx_places_kind ON places(kind);
CREATE INDEX idx_places_country_kind ON places(country_code, kind);

-- Priority for sorting
CREATE INDEX idx_places_priority ON places(priority_score DESC);
```

### Hierarchy

```sql
-- Parent lookups
CREATE INDEX idx_hierarchy_child ON place_hierarchy(child_id);
CREATE INDEX idx_hierarchy_parent ON place_hierarchy(parent_id);
```

---

## Normalization Function (Database-Driven)

Normalization rules are stored in the database, not hardcoded. This allows:
- Language-specific rules (Chinese pinyin, Arabic romanization)
- Easy updates without code changes
- Auditability of normalization decisions

```javascript
class PlaceNormalizer {
  constructor(db) {
    this.db = db;
    this.rulesCache = null;
  }
  
  async loadRules() {
    if (this.rulesCache) return this.rulesCache;
    
    this.rulesCache = this.db.all(`
      SELECT lang_code, script_code, rule_type, pattern, replacement
      FROM normalization_rules
      WHERE active = 1
      ORDER BY lang_code NULLS FIRST, rule_order
    `);
    
    return this.rulesCache;
  }
  
  async normalize(name, langCode = null) {
    const rules = await this.loadRules();
    
    // Start with Unicode normalization
    let result = name.normalize('NFD');
    
    // Apply universal rules (lang_code IS NULL)
    for (const rule of rules.filter(r => r.lang_code === null)) {
      result = this.applyRule(result, rule);
    }
    
    // Apply language-specific rules
    if (langCode) {
      for (const rule of rules.filter(r => r.lang_code === langCode)) {
        result = this.applyRule(result, rule);
      }
    }
    
    return result.toLowerCase().trim();
  }
  
  applyRule(text, rule) {
    switch (rule.rule_type) {
      case 'char_map':
        return text.replace(new RegExp(rule.pattern, 'g'), rule.replacement);
      case 'regex':
        return text.replace(new RegExp(rule.pattern, 'g'), rule.replacement);
      case 'prefix_strip':
        return text.startsWith(rule.pattern) ? text.slice(rule.pattern.length) : text;
      default:
        return text;
    }
  }
}

// Examples with database rules:
// "São Paulo" → "sao paulo" (universal accent removal)
// "北京" → "beijing" (Chinese pinyin transliteration lookup)
// "Côte d'Ivoire" → "cote divoire" (French accent handling)
// "القاهرة" → "alqahira" or "cairo" (Arabic with transliteration lookup)
```

**Seed normalization_rules table**:
```sql
-- Universal rules (apply to all languages)
INSERT INTO normalization_rules (lang_code, rule_type, rule_order, pattern, replacement, description)
VALUES
  (NULL, 'char_map', 1, '[\u0300-\u036f]', '', 'Remove combining diacritical marks'),
  (NULL, 'char_map', 2, '[''`´]', '', 'Remove apostrophes'),
  (NULL, 'regex', 3, '\s+', ' ', 'Collapse whitespace'),
  (NULL, 'regex', 4, '[^\w\s]', '', 'Remove punctuation');

-- German-specific
INSERT INTO normalization_rules (lang_code, rule_type, rule_order, pattern, replacement, description)
VALUES
  ('de', 'char_map', 1, 'ß', 'ss', 'German eszett'),
  ('de', 'char_map', 2, 'ä', 'ae', 'German umlaut a'),
  ('de', 'char_map', 3, 'ö', 'oe', 'German umlaut o'),
  ('de', 'char_map', 4, 'ü', 'ue', 'German umlaut u');

-- French-specific
INSERT INTO normalization_rules (lang_code, rule_type, rule_order, pattern, replacement, description)
VALUES
  ('fr', 'prefix_strip', 1, 'le ', '', 'Strip French article le'),
  ('fr', 'prefix_strip', 2, 'la ', '', 'Strip French article la'),
  ('fr', 'prefix_strip', 3, 'les ', '', 'Strip French article les');
```

Store the normalized result in `normalized`.

---

## Priority Scoring

Priority helps rank candidates when names collide.

### Sources of Priority

| Source | Weight | Notes |
|--------|--------|-------|
| Population | 0-50 | Log scale: log10(pop) * 10 |
| Area (admin) | 0-30 | Log scale: log10(area_km2) * 5 |
| Admin level | 0-20 | Higher level = more important |

### Example Formula

```javascript
function computePriority(place) {
  let score = 0;
  
  // Population (if available)
  if (place.population > 0) {
    score += Math.min(50, Math.log10(place.population) * 10);
  }
  
  // Area for admin regions
  if (place.area_km2 > 0) {
    score += Math.min(30, Math.log10(place.area_km2) * 5);
  }
  
  // Kind bonus
  const kindBonus = {
    country: 20,
    adm1: 15,
    adm2: 10,
    locality: 5,
    poi: 0
  };
  score += kindBonus[place.kind] || 0;
  
  return Math.min(100, score);
}
```

### Result

| Place | Population | Area | Kind | Priority |
|-------|------------|------|------|------------|
| London, UK | 9,000,000 | — | locality | 70 |
| London, ON | 400,000 | — | locality | 56 |
| London, KY | 8,000 | — | locality | 39 |
| Ontario | — | 1,076,000 km² | adm1 | 45 |

London UK naturally ranks higher, but context signals can override this.

---

## Alias Kinds

Standardize alias types for downstream use:

| Kind | Description | Example |
|------|-------------|---------|
| `official` | Official alternate name | "United Kingdom of Great Britain..." |
| `abbrev` | Abbreviation | UK, US, CA |
| `common` | Common informal name | America, Britain |
| `local` | Local language name | Deutschland, España |
| `historic` | Historical name | Bombay, Peking |
| `misspelling` | Common misspelling | Syndey (for Sydney) |

---

## Query Optimization Tips

### Use Covering Indexes

When you query by `normalized` and only need `place_id` and `priority_score`:

```sql
-- This index "covers" the query (no table lookup needed)
CREATE INDEX idx_places_name_priority 
  ON place_names(normalized, place_id);
```

### Batch Alias Lookups

For multiple mentions in one article, batch the lookups:

```sql
-- Instead of N queries, do 1
SELECT p.*, pn.normalized
FROM place_names pn
JOIN places p ON p.id = pn.place_id
WHERE pn.normalized IN ('london', 'ontario', 'toronto')
ORDER BY pn.normalized, p.priority_score DESC;
```

### Precompute Common Queries

If you always need "ADM1 list by country":

```sql
CREATE INDEX idx_adm1_by_country 
  ON places(country_code, priority_score DESC) 
  WHERE kind = 'adm1';
```

---

## Data Quality Constraints

Add constraints to catch issues at insert time:

```sql
-- Every place needs a location
ALTER TABLE places ADD CONSTRAINT chk_location 
  CHECK (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180);

-- Kind must be valid
ALTER TABLE places ADD CONSTRAINT chk_kind 
  CHECK (kind IN ('country', 'adm1', 'adm2', 'adm3', 'locality', 'poi'));

-- Priority range
ALTER TABLE places ADD CONSTRAINT chk_priority 
  CHECK (priority_score >= 0 AND priority_score <= 100);
```

---

## What to Build (This Chapter)

1. **Create the complete schema**:
   ```sql
   -- Execute all CREATE TABLE statements above
   ```

2. **Add all indexes**:
   ```sql
   -- Execute all CREATE INDEX statements above
   ```

3. **Add constraints**:
   ```sql
   -- Add CHECK constraints
   ```

4. **Test with sample data**:
   ```sql
   -- Insert a test place
   INSERT INTO places (source, kind, country_code, lat, lng, priority_score)
   VALUES ('test', 'locality', 'GB', 51.5074, -0.1278, 70);
   
   -- Insert name
   INSERT INTO place_names (place_id, name, normalized, lang, name_kind, is_preferred, is_official)
   VALUES (last_insert_rowid(), 'London', 'london', 'en', 'endonym', 1, 1);
   
   -- Query it back
   SELECT p.*, pn.name 
   FROM places p
   JOIN place_names pn ON pn.place_id = p.id
   WHERE pn.normalized = 'london';
   ```

5. **Benchmark**:
   ```sql
   -- Time a lookup (should be < 1ms with index)
   .timer on
   SELECT * FROM place_names WHERE normalized = 'london';
   ```

---

*Next: [Chapter 10 — Syncing PostGIS → SQLite](./10-sync-pipeline.md)*
