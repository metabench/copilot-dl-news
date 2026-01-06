# Chapter 3: Database Schema

> **Implementation Status**: ✅ Schema fully implemented. Run `npm run schema:check` to verify.

## Codebase Quick Reference

| Component | File Location | Status |
|-----------|---------------|--------|
| Schema definitions | `src/db/sqlite/v1/schema-definitions.js` | ✅ Auto-generated |
| Schema sync tool | `tools/schema-sync.js` | ✅ Complete |
| Database file | `data/news.db` | ✅ Active |
| Schema stats | `docs/database/_artifacts/news_db_stats.json` | ✅ Auto-updated |
| Schema docs | `docs/database/schema/main.md` | ✅ Manual |

## Core Tables Overview

The system uses SQLite with a schema designed for:
- **Efficient storage** — Compressed content, normalized references
- **Version tracking** — Analysis versions for incremental updates
- **Extensibility** — Fact tables, plugin support

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            CONTENT LAYER                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐    ┌──────────────────┐    ┌────────────────────┐    │
│  │   articles   │◄───│   content_cache  │    │  crawl_evidence    │    │
│  │              │    │                  │    │                    │    │
│  │ • url        │    │ • url            │    │ • url              │    │
│  │ • title      │    │ • compressed_html│    │ • crawl_timestamp  │    │
│  │ • body       │    │ • compress_algo  │    │ • http_status      │    │
│  │ • host       │    │ • original_size  │    │ • evidence_type    │    │
│  │ • pub_date   │    │ • fetch_date     │    │ • job_id           │    │
│  └──────────────┘    └──────────────────┘    └────────────────────┘    │
│         │                                                               │
└─────────┼───────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           ANALYSIS LAYER                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────┐    ┌──────────────┐    ┌─────────────────────┐   │
│  │ content_analysis │    │ article_facts│    │   place_mentions    │   │
│  │                  │    │              │    │                     │   │
│  │ • url            │    │ • url        │    │ • mention_id        │   │
│  │ • analysis_ver   │◄───│ • fact_type  │    │ • url               │   │
│  │ • word_count     │    │ • fact_value │    │ • mention_text      │   │
│  │ • categories     │    │ • confidence │    │ • start_offset      │   │
│  │ • sentiment      │    │              │    │ • context_snippet   │   │
│  └──────────────────┘    └──────────────┘    └─────────────────────┘   │
│                                                       │                 │
└───────────────────────────────────────────────────────┼─────────────────┘
                                                        │
                                                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          GAZETTEER LAYER                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌─────────────────────────┐   │
│  │   gazetteer  │◄───│   aliases    │    │    resolved_places      │   │
│  │              │    │              │    │                         │   │
│  │ • place_id   │    │ • alias_id   │    │ • mention_id ──────────────▶│
│  │ • name       │    │ • place_id   │    │ • place_id              │   │
│  │ • country    │    │ • alias_name │    │ • confidence            │   │
│  │ • population │    │ • language   │    │ • disambiguation_method │   │
│  │ • lat/lon    │    │ • script     │    │                         │   │
│  │ • feature    │    │              │    │                         │   │
│  └──────────────┘    └──────────────┘    └─────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Table Definitions

### articles

The core article table with extracted content.

```sql
CREATE TABLE articles (
  url TEXT PRIMARY KEY,
  title TEXT,
  body TEXT,
  host TEXT,
  pub_date TEXT,
  author TEXT,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_articles_host ON articles(host);
CREATE INDEX idx_articles_pub_date ON articles(pub_date);
```

### content_cache

Compressed HTML storage for re-extraction.

```sql
CREATE TABLE content_cache (
  url TEXT PRIMARY KEY,
  compressed_html BLOB,
  compress_algo TEXT DEFAULT 'zstd',
  original_size INTEGER,
  compressed_size INTEGER,
  fetch_date TEXT,
  http_status INTEGER,
  content_type TEXT,
  encoding TEXT
);

CREATE INDEX idx_content_cache_fetch_date ON content_cache(fetch_date);
```

**Compression Strategy:**
- Zstd level 3 (fast compression, good ratio)
- Typical ratio: 5-10x for HTML
- 500KB page → 50-100KB stored

### content_analysis

Analysis results with version tracking.

```sql
CREATE TABLE content_analysis (
  url TEXT PRIMARY KEY,
  analysis_version INTEGER DEFAULT 1,
  word_count INTEGER,
  reading_time_min REAL,
  language TEXT,
  categories TEXT,  -- JSON array
  topics TEXT,      -- JSON array
  sentiment_score REAL,
  quality_score REAL,
  analyzed_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (url) REFERENCES articles(url)
);

CREATE INDEX idx_analysis_version ON content_analysis(analysis_version);
```

**Version Tracking Pattern:**
```sql
-- Find pages needing re-analysis
SELECT a.url 
FROM articles a
LEFT JOIN content_analysis ca ON a.url = ca.url
WHERE ca.analysis_version IS NULL 
   OR ca.analysis_version < ?;
```

### article_facts

Boolean facts extracted from articles.

```sql
CREATE TABLE article_facts (
  fact_id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  fact_type TEXT NOT NULL,
  fact_value INTEGER NOT NULL,  -- 0 or 1
  confidence REAL,
  evidence TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (url) REFERENCES articles(url)
);

CREATE INDEX idx_facts_url ON article_facts(url);
CREATE INDEX idx_facts_type ON article_facts(fact_type);
CREATE UNIQUE INDEX idx_facts_url_type ON article_facts(url, fact_type);
```

**Fact Types:**
- `has_byline` — Author attribution present
- `has_dateline` — Date/location header
- `is_opinion` — Opinion piece
- `is_breaking` — Breaking news
- `mentions_uk` — UK geographic reference
- `mentions_us` — US geographic reference

### place_mentions

Detected place name references.

```sql
CREATE TABLE place_mentions (
  mention_id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  mention_text TEXT NOT NULL,
  start_offset INTEGER,
  end_offset INTEGER,
  context_snippet TEXT,
  detection_method TEXT,
  confidence REAL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (url) REFERENCES articles(url)
);

CREATE INDEX idx_mentions_url ON place_mentions(url);
CREATE INDEX idx_mentions_text ON place_mentions(mention_text);
```

### gazetteer

Master place definitions (see disambiguation book for full schema).

```sql
CREATE TABLE gazetteer (
  place_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  country_code TEXT,
  admin1_code TEXT,
  admin2_code TEXT,
  feature_class TEXT,
  feature_code TEXT,
  population INTEGER,
  elevation INTEGER,
  timezone TEXT,
  latitude REAL,
  longitude REAL,
  source TEXT,  -- 'geonames', 'osm', etc.
  updated_at TEXT
);

CREATE INDEX idx_gazetteer_name ON gazetteer(name);
CREATE INDEX idx_gazetteer_country ON gazetteer(country_code);
CREATE INDEX idx_gazetteer_population ON gazetteer(population DESC);
```

### aliases

Multi-language place name aliases.

```sql
CREATE TABLE aliases (
  alias_id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id INTEGER NOT NULL,
  alias_name TEXT NOT NULL,
  language TEXT,        -- ISO 639-1: 'en', 'de', 'zh'
  script TEXT,          -- ISO 15924: 'Latn', 'Hans'
  transliteration TEXT, -- 'pinyin', 'wade-giles'
  is_preferred INTEGER DEFAULT 0,
  source TEXT,
  FOREIGN KEY (place_id) REFERENCES gazetteer(place_id)
);

CREATE INDEX idx_aliases_name ON aliases(alias_name);
CREATE INDEX idx_aliases_place ON aliases(place_id);
CREATE INDEX idx_aliases_lang ON aliases(language);
```

### resolved_places

Final disambiguation results.

```sql
CREATE TABLE resolved_places (
  resolution_id INTEGER PRIMARY KEY AUTOINCREMENT,
  mention_id INTEGER NOT NULL,
  place_id INTEGER NOT NULL,
  confidence REAL,
  disambiguation_method TEXT,  -- 'population', 'coherence', 'publisher'
  resolved_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (mention_id) REFERENCES place_mentions(mention_id),
  FOREIGN KEY (place_id) REFERENCES gazetteer(place_id)
);

CREATE INDEX idx_resolved_mention ON resolved_places(mention_id);
CREATE INDEX idx_resolved_place ON resolved_places(place_id);
```

---

## Query Patterns

### Get Analysis Status

```sql
-- Analysis coverage by version
SELECT 
  analysis_version,
  COUNT(*) as count
FROM content_analysis
GROUP BY analysis_version
ORDER BY analysis_version;

-- Pages needing analysis (version < current)
SELECT COUNT(*) FROM articles a
LEFT JOIN content_analysis ca ON a.url = ca.url
WHERE ca.analysis_version IS NULL OR ca.analysis_version < 1022;
```

### Get Place Disambiguation Status

```sql
-- Unresolved mentions
SELECT pm.mention_text, COUNT(*) as count
FROM place_mentions pm
LEFT JOIN resolved_places rp ON pm.mention_id = rp.mention_id
WHERE rp.resolution_id IS NULL
GROUP BY pm.mention_text
ORDER BY count DESC
LIMIT 20;

-- Resolution rate
SELECT 
  COUNT(DISTINCT pm.mention_id) as total_mentions,
  COUNT(DISTINCT rp.mention_id) as resolved,
  ROUND(100.0 * COUNT(DISTINCT rp.mention_id) / COUNT(DISTINCT pm.mention_id), 1) as pct
FROM place_mentions pm
LEFT JOIN resolved_places rp ON pm.mention_id = rp.mention_id;
```

### Get Content Cache Metrics

```sql
-- Compression efficiency
SELECT 
  COUNT(*) as pages,
  SUM(original_size) / 1024 / 1024 as original_mb,
  SUM(compressed_size) / 1024 / 1024 as compressed_mb,
  ROUND(1.0 * SUM(original_size) / SUM(compressed_size), 2) as ratio
FROM content_cache;
```

---

## Migration Strategy

### Adding New Analysis Fields

```sql
-- 1. Add column with default
ALTER TABLE content_analysis ADD COLUMN new_field TEXT DEFAULT NULL;

-- 2. Increment analysis version target
-- (in code: bump CURRENT_ANALYSIS_VERSION)

-- 3. Re-run analysis pipeline
-- Pages with older versions will be re-analyzed
```

### Schema Sync Tool

After schema changes, regenerate definitions:

```bash
npm run schema:sync    # Regenerate schema-definitions.js
npm run schema:check   # Verify sync (CI/pre-commit)
npm run schema:stats   # Update table statistics
```

---

## Next Chapter

[Chapter 4: Crawl Architecture →](04-crawl-architecture.md)
