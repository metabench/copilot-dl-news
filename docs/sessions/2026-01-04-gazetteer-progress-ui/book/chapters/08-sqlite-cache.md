# Chapter 8: SQLite as the Runtime Gazetteer

*Reading time: 10 minutes*

---

## Why SQLite?

At article-processing time, we need to resolve place names **fast**. PostGIS is powerful but:
- Connection overhead adds latency
- Spatial operations are expensive
- Network round-trips add up

We use SQLite (`news.db`) as the runtime store because:
- Zero network latency (local file)
- Sub-millisecond simple lookups
- Unified data model (articles + places in one DB)
- Easy to backup and replicate

---

## Architecture: PostGIS Source, SQLite Serving

```
┌─────────────────────────────────────────────────────┐
│                   Build Time                        │
│                                                     │
│  PostGIS ───────> Sync Pipeline ────> SQLite       │
│  (source)         (Node.js)           (news.db)    │
│                                                     │
│  • Spatial joins                 • Fast name lookup │
│  • Hierarchy build               • Parent pointers  │
│  • Area computation              • Aliases          │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                  Runtime                            │
│                                                     │
│  Article ───────> Resolver ───────> SQLite         │
│                      │               (news.db)      │
│                      └───────> Resolved places      │
│                                                     │
│  • No PostGIS needed at runtime                    │
│  • All lookups are local                           │
└─────────────────────────────────────────────────────┘
```

---

## Core Tables

The gazetteer lives in `news.db` alongside article data.

| Table | Purpose | Rows (estimated) |
|-------|---------|------------------|
| `places` | All resolvable entities | 100k–1M |
| `place_names` | Names, aliases, exonyms | 200k–2M |
| `place_hierarchy` | Graph edges (parent/child) | 100k–1M |
| `gazetteer_crawl_state` | Sync metadata | 10–100 |

---

## The `places` Table

Each row is a resolvable geographic entity.

```sql
CREATE TABLE places (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Type
  kind TEXT NOT NULL,            -- 'country', 'region', 'city', 'poi'
  
  -- Hierarchy shortcuts
  country_code TEXT,             -- ISO-3166 alpha-2
  adm1_code TEXT,                -- First-level admin code
  adm2_code TEXT,                -- Second-level admin code
  
  -- Location
  lat REAL,
  lng REAL,
  bbox TEXT,                     -- JSON [west,south,east,north]
  
  -- Priority/Disambiguation
  priority_score REAL,           -- 0-100 scale
  population INTEGER,
  
  -- Metadata
  source TEXT,                   -- 'osm', 'geonames'
  status TEXT DEFAULT 'current'
);
```

### Key Design Decisions

**`priority_score`**: A 0-100 score for ranking candidates. Derived from:
- Population
- Admin level (Capital > City > Village)
- Wikipedia prominence

**`country_code`**: Direct filter for fast scoping.

---

## The `place_names` Table

Maps all names (normalized and display) to places.

```sql
CREATE TABLE place_names (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id INTEGER NOT NULL,
  
  name TEXT NOT NULL,            -- Display name
  normalized TEXT,               -- Lowercase, no diacritics
  
  lang TEXT,                     -- 'en', 'fr', 'zh'
  script TEXT,                   -- 'Latn', 'Hans', 'Arab'
  name_kind TEXT,                -- 'endonym', 'exonym', 'alias', 'abbr'
  
  is_preferred INTEGER,          -- 1 if this is the primary name
  
  FOREIGN KEY (place_id) REFERENCES places(id)
);
```

Examples:

| normalized | place_id | name_kind | lang |
|------------|----------|-----------|------|
| uk | 1 | abbr | en |
| united kingdom | 1 | endonym | en |
| royaume uni | 1 | exonym | fr |
| london | 123 | endonym | en |
| londres | 123 | exonym | es |

---

## The `place_hierarchy` Table

Stores the containment graph.

```sql
CREATE TABLE place_hierarchy (
  parent_id INTEGER NOT NULL,
  child_id INTEGER NOT NULL,
  relation TEXT,                 -- 'admin_parent', 'contains'
  depth INTEGER,                 -- 1 = direct, >1 = ancestor
  
  PRIMARY KEY (parent_id, child_id)
);
```

This allows queries like "is London inside Ontario?" without recursion.

---

## Indexes (Critical for Performance)

```sql
-- Primary lookup: name → candidates
CREATE INDEX idx_place_names_norm ON place_names(normalized);

-- Filter by country/kind
CREATE INDEX idx_places_kind_country ON places(kind, country_code);

-- Parent lookups
CREATE INDEX idx_place_hierarchy_child ON place_hierarchy(child_id);
CREATE INDEX idx_place_hierarchy_parent ON place_hierarchy(parent_id);
```

---

## Query Patterns

### Pattern 1: Lookup Candidates for a Mention

```sql
-- Find all places matching "London"
SELECT p.*, pn.name
FROM places p
JOIN place_names pn ON pn.place_id = p.id
WHERE pn.normalized = 'london'
ORDER BY p.priority_score DESC
LIMIT 25;
```

### Pattern 2: Get Parent Chain

```sql
-- Ancestors of London, ON
SELECT p.id, pn.name, p.kind
FROM place_hierarchy ph
JOIN places p ON p.id = ph.parent_id
JOIN place_names pn ON pn.place_id = p.id AND pn.is_preferred = 1
WHERE ph.child_id = $london_on_id
ORDER BY ph.depth ASC;
```

### Pattern 3: Check Containment

```sql
-- Is child_id inside parent_id?
SELECT EXISTS (
  SELECT 1 FROM place_hierarchy
  WHERE child_id = $child_id
    AND parent_id = $parent_id
);
```

### Pattern 4: List Regions for Country

```sql
SELECT p.id, pn.name, p.priority_score
FROM places p
JOIN place_names pn ON pn.place_id = p.id AND pn.is_preferred = 1
WHERE p.country_code = 'CA' AND p.kind = 'region'
ORDER BY p.priority_score DESC;
```

---

## Performance Expectations

With proper indexes, on a modern machine:

| Query Type | Expected Latency |
|------------|------------------|
| Name → candidates | < 1ms |
| Get parent chain | < 1ms |
| Check containment | < 0.5ms |
| List Regions | < 1ms |

SQLite is remarkably fast for read-heavy workloads.

---

## Sync Strategy

The `sync-pipeline.js` tool handles populating these tables from the source (PostGIS or raw data). It ensures:
1. **Atomic Updates**: Uses table swapping (build `places_new` → swap to `places`) for zero-downtime updates.
2. **Hierarchy Integrity**: Parent/child links are maintained.
3. **Normalization**: Names are normalized consistently.

See [Chapter 10 — Syncing PostGIS → SQLite](./10-sync-pipeline.md) for the full implementation.

---

## What to Build (This Chapter)

1. **Verify the schema**:
   ```bash
   npm run schema:check
   ```

2. **Inspect the tables**:
   ```sql
   SELECT count(*) FROM places;
   SELECT count(*) FROM place_names;
   ```

3. **Test performance**:
   ```bash
   node labs/db-access-patterns/benchmarks/candidate-generation.bench.js
   ```

The next chapter covers schema design in more detail.

---

*Next: [Chapter 9 — Schema Design for Fast Lookups](./09-schema-design.md)*
