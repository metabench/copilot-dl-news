# Database Schema - Entity Relationship Diagram

**When to Read**: Read this when understanding the database structure, implementing queries, planning schema changes, or normalizing data.

**Last Updated**: October 28, 2025
**Schema Version**: 8 (via schema_migrations table)
**Total Tables**: 74 tables (normalized architecture)

---

## Overview

This document provides a visual representation and detailed explanation of the SQLite database schema used by the news crawler application. The schema has been normalized from the original denormalized design, separating content storage, HTTP metadata, and analysis into dedicated tables.

**Key Changes Since Previous Version**:
- **Normalization Complete**: Articles table simplified from 30+ columns to 7 columns
- **Content Separation**: HTML/text content moved to `content_storage` with compression
- **HTTP Metadata**: Request/response data extracted to `http_responses`
- **Analysis Separation**: Content analysis moved to `content_analysis`
- **Schema Versioning**: Implemented via `schema_migrations` table (version 8)
- **74 Tables**: Expanded from ~40 tables to support advanced features

---

## Table of Contents

1. [Core Content System](#core-content-system)
2. [HTTP Response System](#http-response-system)
3. [Content Storage System](#content-storage-system)
4. [Content Analysis System](#content-analysis-system)
5. [Crawl Management System](#crawl-management-system)
6. [Gazetteer (Geography) System](#gazetteer-geography-system)
7. [Background Task System](#background-task-system)
8. [Advanced Analytics System](#advanced-analytics-system)
9. [Relationships & Foreign Keys](#relationships--foreign-keys)
10. [Schema Evolution](#schema-evolution)

---

## Core Content System

### articles

**Purpose**: Core article metadata (normalized from 30+ columns to 7).

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment primary key |
| `url` | TEXT UNIQUE | Article URL |
| `title` | TEXT | Article title |
| `html` | TEXT | Raw HTML (legacy - being migrated) |
| `text` | TEXT | Extracted text content |
| `created_at` | TEXT | Creation timestamp |
| `updated_at` | TEXT | Last update timestamp |

**Notes**:
- URL field used for lookups (not normalized to urls table yet)
- HTML/text content being migrated to content_storage
- Relationships established through url-based joins

### urls

**Purpose**: URL normalization and canonicalization.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment primary key |
| `url` | TEXT UNIQUE | Full URL |
| `canonical_url` | TEXT | Canonical version |
| `created_at` | TEXT | First seen |
| `last_seen_at` | TEXT | Last seen |
| `analysis` | TEXT | JSON analysis |
| `host` | TEXT | Domain name |

---

## HTTP Response System

### http_responses

**Purpose**: HTTP request/response metadata (extracted from articles).

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment primary key |
| `url_id` | INTEGER FK | References urls(id) |
| `request_started_at` | TEXT | Request start time |
| `fetched_at` | TEXT | Response received time |
| `http_status` | INTEGER | HTTP status code |
| `content_type` | TEXT | Content-Type header |
| `content_encoding` | TEXT | Content-Encoding header |
| `etag` | TEXT | ETag header |
| `last_modified` | TEXT | Last-Modified header |
| `redirect_chain` | TEXT | JSON redirect chain |
| `ttfb_ms` | INTEGER | Time to first byte (ms) |
| `download_ms` | INTEGER | Download time (ms) |
| `total_ms` | INTEGER | Total request time (ms) |
| `bytes_downloaded` | INTEGER | Response size |
| `transfer_kbps` | REAL | Transfer speed |

**Relationships**:
- → `urls` (url_id)

---

## Content Storage System

### content_storage

**Purpose**: Compressed content storage (extracted from articles).

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment primary key |
| `storage_type` | TEXT | Storage type (blob, compressed, etc.) |
| `compression_type_id` | INTEGER FK | References compression_types |
| `compression_bucket_id` | INTEGER FK | References compression_buckets |
| `bucket_entry_key` | TEXT | Key within bucket |
| `content_blob` | BLOB | Actual content |
| `content_sha256` | TEXT | Content hash |
| `uncompressed_size` | INTEGER | Original size |
| `compressed_size` | INTEGER | Compressed size |
| `compression_ratio` | REAL | Compression ratio |
| `created_at` | TEXT | Creation timestamp |
| `http_response_id` | INTEGER FK | References http_responses |

**Relationships**:
- → `compression_types` (compression_type_id)
- → `compression_buckets` (compression_bucket_id)
- → `http_responses` (http_response_id)

### compression_types

**Purpose**: Registry of compression algorithms.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment primary key |
| `name` | TEXT UNIQUE | Algorithm name (gzip, brotli, zstd) |
| `level` | INTEGER | Compression level |
| `description` | TEXT | Description |

### compression_buckets

**Purpose**: Shared compression buckets.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment primary key |
| `name` | TEXT UNIQUE | Bucket name |
| `compression_type_id` | INTEGER FK | References compression_types |
| `compressed_data` | BLOB | Bucket content |
| `original_size` | INTEGER | Total original size |
| `compressed_size` | INTEGER | Total compressed size |
| `item_count` | INTEGER | Items in bucket |
| `created_at` | TEXT | Creation timestamp |
| `last_accessed_at` | TEXT | Last access timestamp |

---

## Content Analysis System

### content_analysis

**Purpose**: Content analysis results (extracted from articles).

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment primary key |
| `content_id` | INTEGER FK | References content_storage(id) |
| `analysis_version` | INTEGER | Analysis version |
| `classification` | TEXT | Content classification |
| `title` | TEXT | Extracted title |
| `date` | TEXT | Publication date |
| `section` | TEXT | Site section |
| `word_count` | INTEGER | Word count |
| `language` | TEXT | Detected language |
| `article_xpath` | TEXT | Content XPath |
| `nav_links_count` | INTEGER | Navigation links |
| `article_links_count` | INTEGER | Article links |
| `analysis_json` | TEXT | Full analysis JSON |
| `analyzed_at` | TEXT | Analysis timestamp |

**Relationships**:
- → `content_storage` (content_id)

### article_place_relations

**Purpose**: Links articles to geographic places.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment primary key |
| `article_id` | INTEGER FK | References http_responses(id) |
| `place_id` | INTEGER FK | References places(id) |
| `relation_type` | TEXT | Relation type |
| `confidence` | REAL | Confidence score |
| `matching_rule_level` | INTEGER | Rule version |
| `evidence` | TEXT | Matching evidence |
| `created_at` | TEXT | Creation timestamp |
| `updated_at` | TEXT | Update timestamp |

**Relationships**:
- → `http_responses` (article_id) - Note: links via HTTP response, not articles table
- → `places` (place_id)

---

## Crawl Management System

### crawl_jobs

**Purpose**: Crawl job execution tracking.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | Job ID (UUID) |
| `args` | TEXT | JSON CLI arguments |
| `pid` | INTEGER | Process ID |
| `started_at` | TEXT | Start timestamp |
| `ended_at` | TEXT | End timestamp |
| `status` | TEXT | Status |
| `crawl_type_id` | INTEGER FK | References crawl_types |
| `url_id` | INTEGER FK | References urls(id) |

**Relationships**:
- → `crawl_types` (crawl_type_id)
- → `urls` (url_id)

### crawl_types

**Purpose**: Registry of available crawl types.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment primary key |
| `name` | TEXT UNIQUE | Type name |
| `description` | TEXT | Description |
| `declaration` | TEXT | JSON type declaration |

### queue_events

**Purpose**: Crawl queue telemetry.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment primary key |
| `job_id` | TEXT FK | References crawl_jobs(id) |
| `ts` | TEXT | Timestamp |
| `action` | TEXT | Action |
| `url` | TEXT | URL |
| `depth` | INTEGER | Depth |
| `host` | TEXT | Domain |
| `reason` | TEXT | Reason |
| `queue_size` | INTEGER | Queue size |
| `alias` | TEXT | Queue alias |
| `queue_origin` | TEXT | Origin |
| `queue_role` | TEXT | Role |
| `queue_depth_bucket` | TEXT | Depth bucket |

**Relationships**:
- → `crawl_jobs` (job_id)

---

## Gazetteer (Geography) System

### places

**Purpose**: Geographic entities.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment primary key |
| `kind` | TEXT | Type (country, city, region, etc.) |
| `country_code` | TEXT | ISO country code |
| `adm1_code` | TEXT | Admin level 1 code |
| `adm2_code` | TEXT | Admin level 2 code |
| `population` | INTEGER | Population |
| `timezone` | TEXT | Timezone |
| `lat` | REAL | Latitude |
| `lng` | REAL | Longitude |
| `bbox` | TEXT | Bounding box |
| `canonical_name_id` | INTEGER FK | References place_names |
| `source` | TEXT | Data source |
| `extra` | JSON | Source data |
| `status` | TEXT | Status |
| `valid_from` | TEXT | Valid from date |
| `valid_to` | TEXT | Valid to date |
| `wikidata_qid` | TEXT | Wikidata ID |
| `osm_type` | TEXT | OpenStreetMap type |
| `osm_id` | TEXT | OpenStreetMap ID |
| `area` | REAL | Area |
| `gdp_usd` | REAL | GDP |
| `wikidata_admin_level` | INTEGER | Admin level |
| `wikidata_props` | JSON | Wikidata properties |
| `osm_tags` | JSON | OSM tags |
| `crawl_depth` | INTEGER | Crawl depth |
| `priority_score` | REAL | Priority |
| `last_crawled_at` | INTEGER | Last crawl |

**Relationships**:
- → `place_names` (canonical_name_id)

### place_names

**Purpose**: Multilingual place names.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment primary key |
| `place_id` | INTEGER FK | References places(id) |
| `name` | TEXT | Name |
| `normalized` | TEXT | Normalized name |
| `lang` | TEXT | Language code |
| `script` | TEXT | Script code |
| `name_kind` | TEXT | Kind (endonym, exonym, etc.) |
| `is_preferred` | INTEGER | Preferred flag |
| `is_official` | INTEGER | Official flag |
| `source` | TEXT | Data source |
| `valid_from` | TEXT | Valid from date (ISO 8601) |
| `valid_to` | TEXT | Valid to date (ISO 8601) |

**Relationships**:
- → `places` (place_id)

### place_hierarchy

**Purpose**: Geographic hierarchies.

| Column | Type | Description |
|--------|------|-------------|
| `parent_id` | INTEGER PK FK | Parent place |
| `child_id` | INTEGER PK FK | Child place |
| `relation` | TEXT | Relation type |
| `depth` | INTEGER | Hierarchy depth |

**Primary Key**: Composite (parent_id, child_id)

---

## Background Task System

### background_tasks

**Purpose**: Long-running background operations.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment primary key |
| `task_type` | TEXT | Task type |
| `status` | TEXT | Status |
| `progress_current` | INTEGER | Progress current |
| `progress_total` | INTEGER | Progress total |
| `progress_message` | TEXT | Progress message |
| `config` | TEXT | JSON config |
| `metadata` | TEXT | JSON metadata |
| `error_message` | TEXT | Error message |
| `created_at` | TEXT | Creation time |
| `started_at` | TEXT | Start time |
| `updated_at` | TEXT | Update time |
| `completed_at` | TEXT | Completion time |
| `resume_started_at` | TEXT | Resume time |

### analysis_runs

**Purpose**: Analysis execution tracking.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | Analysis run ID |
| `started_at` | TEXT | Start time |
| `ended_at` | TEXT | End time |
| `status` | TEXT | Status |
| `stage` | TEXT | Current stage |
| `analysis_version` | INTEGER | Version |
| `page_limit` | INTEGER | Page limit |
| `domain_limit` | INTEGER | Domain limit |
| `skip_pages` | INTEGER | Pages to skip |
| `skip_domains` | INTEGER | Domains to skip |
| `dry_run` | INTEGER | Dry run flag |
| `verbose` | INTEGER | Verbose flag |
| `summary` | TEXT | Summary |
| `last_progress` | TEXT | Last progress |
| `error` | TEXT | Error message |
| `background_task_id` | INTEGER FK | References background_tasks |
| `background_task_status` | TEXT | Task status |

**Relationships**:
- → `background_tasks` (background_task_id)

---

## Advanced Analytics System

### Coverage & Planning Tables

- `coverage_snapshots` - Coverage analytics
- `coverage_gaps` - Gap analysis
- `gap_predictions` - Gap predictions
- `planner_patterns` - Planning patterns
- `cross_crawl_knowledge` - Knowledge reuse
- `hub_discoveries` - Hub discovery tracking
- `problem_clusters` - Problem analysis
- `priority_config_changes` - Configuration tracking

### Enhanced Queue Events

- `queue_events_enhanced` - Enhanced telemetry

### Knowledge & Learning

- `knowledge_reuse_events` - Knowledge reuse tracking
- `planner_stage_events` - Planning events
- `discovery_events` - Discovery tracking

---

## Relationships & Foreign Keys

### Core Content Flow

```
articles (url)
    ↓
urls (url) ← http_responses (url_id)
    ↓
http_responses (id) ← content_storage (http_response_id)
    ↓
content_storage (id) ← content_analysis (content_id)
    ↓
content_analysis (id) → article_place_relations (article_id → http_responses.id)
    ↓
places (id)
```

### Crawl System

```
crawl_types ← crawl_jobs → urls
    ↓
queue_events → crawl_jobs
```

### Gazetteer System

```
places → place_names
places ↔ place_hierarchy
places → place_external_ids
places → place_attribute_values
```

### Background Tasks

```
background_tasks ← analysis_runs
```

---

## Schema Evolution

### Migration History

**Version 1**: Initial denormalized schema (articles table with 30+ columns)
**Version 2**: Add normalized tables (http_responses, content_storage, content_analysis)
**Version 3**: Enable dual-write mode
**Version 8**: Article-place relations with confidence scoring

### Current State

- ✅ **Normalization Complete**: Content separated from metadata
- ✅ **Compression Infrastructure**: Brotli compression with bucketing
- ✅ **Schema Versioning**: Via schema_migrations table
- ✅ **Foreign Keys**: Comprehensive referential integrity
- ⚠️ **Migration In Progress**: Some legacy data still in articles.html/text

### Future Plans

- Complete migration of content from articles to content_storage
- Implement URL normalization (articles.url → urls.id)
- Add more advanced analytics tables
- Implement data retention policies

---

## Usage Examples

### Query: Get article with full content

```sql
SELECT
  a.title,
  ca.title as analyzed_title,
  ca.classification,
  cs.content_blob,
  hr.http_status,
  hr.total_ms
FROM articles a
LEFT JOIN urls u ON a.url = u.url
LEFT JOIN http_responses hr ON hr.url_id = u.id
LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
LEFT JOIN content_analysis ca ON ca.content_id = cs.id
WHERE a.id = ?
```

### Query: Get place relationships for article

```sql
SELECT
  p.canonical_name,
  apr.relation_type,
  apr.confidence,
  apr.evidence
FROM article_place_relations apr
JOIN places p ON apr.place_id = p.id
WHERE apr.article_id = ?
ORDER BY apr.confidence DESC
```

### Query: Get crawl job with queue stats

```sql
SELECT
  cj.*,
  COUNT(qe.id) as event_count,
  AVG(qe.depth) as avg_depth
FROM crawl_jobs cj
LEFT JOIN queue_events qe ON cj.id = qe.job_id
WHERE cj.id = ?
GROUP BY cj.id
```

---

## Related Documentation

- `docs/DATABASE_QUICK_REFERENCE.md` - Common patterns and API
- `docs/DATABASE_SCHEMA_VERSION_1.md` - Schema versioning details
- `docs/DATABASE_MIGRATION_GUIDE_FOR_AGENTS.md` - Migration workflow
- `docs/DATABASE_NORMALIZATION_PLAN.md` - Normalization design
- `AGENTS.md` - "How to Get a Database Handle" section

---

*Last Updated: October 28, 2025*
*Schema Version: 8*

**Indexes**:
- `idx_articles_url` - Fast URL lookup
- `idx_articles_date` - Chronological queries
- `idx_articles_section` - Section filtering
- `idx_articles_host` - Domain filtering
- `idx_articles_canonical` - Canonical URL lookup

**Relationships**:
- → `compression_types` (compression_type_id)
- → `compression_buckets` (compression_bucket_id)

---

### fetches

**Purpose**: HTTP request/response log for all URLs fetched.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment primary key |
| `url` | TEXT | Fetched URL |
| `fetched_at` | TEXT | Fetch timestamp |
| `http_status` | INTEGER | HTTP status code |
| `headers` | TEXT | JSON response headers |
| `body` | BLOB | Response body |
| `analysis` | TEXT | JSON analysis |
| `classification` | TEXT | Content classification |
| `host` | TEXT | Domain name |

**Indexes**:
- `idx_fetches_url` - URL lookup
- `idx_fetches_status` - Status code filtering
- `idx_fetches_host` - Domain filtering

---

### links

**Purpose**: Hyperlink graph between pages.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment primary key |
| `src_url` | TEXT | Source page URL |
| `dst_url` | TEXT | Destination URL |
| `anchor` | TEXT | Link text |
| `rel` | TEXT | Rel attribute |
| `type` | TEXT | Link type |
| `depth` | INTEGER | Crawl depth |
| `on_domain` | INTEGER | Boolean (same domain?) |
| `discovered_at` | TEXT | Discovery timestamp |

**Indexes**:
- `idx_links_src` - Outbound links from page
- `idx_links_dst` - Inbound links to page

---

### urls

**Purpose**: URL metadata and normalization.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment primary key |
| `url` | TEXT UNIQUE | URL |
| `canonical_url` | TEXT | Canonical version |
| `created_at` | TEXT | First seen timestamp |
| `last_seen_at` | TEXT | Last seen timestamp |
| `analysis` | TEXT | JSON analysis |
| `host` | TEXT | Domain name |

**Indexes**:
- `idx_urls_host` - Domain filtering

---

### domains

**Purpose**: Domain-level metadata.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment primary key |
| `host` | TEXT UNIQUE | Domain name |
| `tld` | TEXT | Top-level domain |
| `created_at` | TEXT | First seen timestamp |
| `last_seen_at` | TEXT | Last seen timestamp |
| `analysis` | TEXT | JSON analysis |

---

## Crawl Management Tables

### crawl_jobs

**Purpose**: Tracks crawl job execution (foreground system).

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | Job ID (UUID) |
| `url` | TEXT | Starting URL |
| `args` | TEXT | JSON CLI arguments |
| `pid` | INTEGER | Process ID |
| `started_at` | TEXT | Start timestamp |
| `ended_at` | TEXT | End timestamp |
| `status` | TEXT | Status (running, completed, failed) |
| `crawl_type_id` | INTEGER FK | References crawl_types |

**Relationships**:
- → `crawl_types` (crawl_type_id)
- ← `queue_events` (job_id)
- ← `crawl_problems` (job_id)
- ← `crawl_milestones` (job_id)

---

### crawl_types

**Purpose**: Registry of available crawl types.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment primary key |
| `name` | TEXT UNIQUE | Type name (e.g., "standard", "gazetteer") |
| `description` | TEXT | Human-readable description |
| `declaration` | TEXT | JSON type declaration |

---

### queue_events

**Purpose**: Telemetry for crawl queue operations.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment primary key |
| `job_id` | TEXT FK | References crawl_jobs(id) |
| `ts` | TEXT | Timestamp |
| `action` | TEXT | Action (enqueue, dequeue, skip) |
| `url` | TEXT | URL affected |
| `depth` | INTEGER | Crawl depth |
| `host` | TEXT | Domain |
| `reason` | TEXT | Reason for action |
| `queue_size` | INTEGER | Queue size after action |
| `alias` | TEXT | Queue alias |
| `queue_origin` | TEXT | Queue origin |
| `queue_role` | TEXT | Queue role |
| `queue_depth_bucket` | TEXT | Depth bucket |

**Indexes**:
- `idx_queue_events_job` - Filter by job

---

### crawl_problems

**Purpose**: Error and problem tracking during crawls.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment primary key |
| `job_id` | TEXT FK | References crawl_jobs(id) |
| `ts` | TEXT | Timestamp |
| `kind` | TEXT | Problem kind (network-error, parse-error) |
| `scope` | TEXT | Scope (url, host, crawl) |
| `target` | TEXT | Affected target |
| `message` | TEXT | Error message |
| `details` | TEXT | JSON details |

**Indexes**:
- `idx_crawl_problems_job` - Filter by job

---

### crawl_milestones

**Purpose**: Significant events during crawl execution.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment primary key |
| `job_id` | TEXT FK | References crawl_jobs(id) |
| `ts` | TEXT | Timestamp |
| `kind` | TEXT | Milestone kind (discovery, threshold) |
| `scope` | TEXT | Scope |
| `target` | TEXT | Target |
| `message` | TEXT | Milestone message |
| `details` | TEXT | JSON details |

**Indexes**:
- `idx_crawl_milestones_job` - Filter by job

---

### crawl_tasks

**Purpose**: Task queue for crawl operations.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment primary key |
| `job_id` | TEXT FK | References crawl_jobs(id) |
| `host` | TEXT | Target domain |
| `kind` | TEXT | Task kind |
| `status` | TEXT | Status (pending, running, completed) |
| `url` | TEXT | Target URL |
| `payload` | TEXT | JSON task payload |
| `note` | TEXT | Notes |
| `created_at` | TEXT | Creation timestamp |
| `updated_at` | TEXT | Update timestamp |

**Indexes**:
- `idx_crawl_tasks_job_status` - Composite (job_id, status)

---

## Gazetteer (Geography) Tables

### places

**Purpose**: Geographic entities (countries, cities, regions).

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment primary key |
| `kind` | TEXT | Type (country, city, region, poi, supranational) |
| `country_code` | TEXT | ISO-3166 alpha-2 code |
| `adm1_code` | TEXT | First-level admin code |
| `adm2_code` | TEXT | Second-level admin code |
| `population` | INTEGER | Population count |
| `timezone` | TEXT | Timezone identifier |
| `lat` | REAL | Latitude |
| `lng` | REAL | Longitude |
| `bbox` | TEXT | Bounding box JSON [W,S,E,N] |
| `canonical_name_id` | INTEGER FK | References place_names(id) |
| `source` | TEXT | Data source provenance |
| `extra` | JSON | Source-specific data |
| `wikidata_qid` | TEXT | Wikidata QID (e.g., Q30) |
| `osm_type` | TEXT | OpenStreetMap type |
| `osm_id` | TEXT | OpenStreetMap ID |
| `area` | REAL | Area (km²) |
| `gdp_usd` | REAL | GDP in USD |
| `wikidata_admin_level` | INTEGER | Wikidata admin level |
| `wikidata_props` | JSON | Comprehensive Wikidata properties |
| `osm_tags` | JSON | OpenStreetMap tags |
| `crawl_depth` | INTEGER | Crawl depth (0=country, 1=ADM1, 2=ADM2, 3=city) |
| `priority_score` | REAL | Breadth-first scheduling priority |
| `last_crawled_at` | INTEGER | Last data fetch timestamp |

**Indexes**:
- `idx_places_kind` - Type filtering
- `idx_places_country` - Country filtering
- `idx_places_adm1` - ADM1 filtering
- `idx_places_adm2` - ADM2 filtering
- `idx_places_canonical_name` - Name lookup
- `idx_places_kind_country` - Composite filtering
- `idx_places_population` - Population sorting
- `idx_places_wikidata_qid` - Wikidata lookup
- `idx_places_crawl_depth` - Depth filtering
- `idx_places_priority_score` - Priority scheduling
- `idx_places_osm` - OpenStreetMap lookup

**Relationships**:
- → `place_names` (canonical_name_id)
- ← `place_names` (place_id)
- ← `place_hierarchy` (parent_id, child_id)
- ← `place_external_ids` (place_id)
- ← `place_attribute_values` (place_id)

---

### place_names

**Purpose**: Multilingual names for places.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment primary key |
| `place_id` | INTEGER FK | References places(id) |
| `name` | TEXT | Name |
| `normalized` | TEXT | Normalized (lowercase, no diacritics) |
| `lang` | TEXT | BCP-47 language code |
| `script` | TEXT | ISO 15924 script code |
| `name_kind` | TEXT | Kind (endonym, exonym, alias, official, common) |
| `is_preferred` | INTEGER | Boolean (0/1) |
| `is_official` | INTEGER | Boolean (0/1) |
| `source` | TEXT | Data source |

**Indexes**:
- `idx_place_names_place` - Filter by place
- `idx_place_names_norm` - Normalized name search
- `idx_place_names_lang` - Language filtering
- `idx_place_names_name` - Name search

---

### place_hierarchy

**Purpose**: Parent-child relationships between places.

| Column | Type | Description |
|--------|------|-------------|
| `parent_id` | INTEGER PK FK | References places(id) |
| `child_id` | INTEGER PK FK | References places(id) |
| `relation` | TEXT | Relation type (admin_parent, contains, member_of) |
| `depth` | INTEGER | Hierarchy depth |

**Primary Key**: Composite (parent_id, child_id)

---

### place_external_ids

**Purpose**: External identifiers for places.

| Column | Type | Description |
|--------|------|-------------|
| `source` | TEXT PK | Source system (geonames, osm, wikidata) |
| `ext_id` | TEXT PK | External ID |
| `place_id` | INTEGER FK | References places(id) |

**Primary Key**: Composite (source, ext_id)

**Indexes**:
- `idx_place_external_place` - Filter by place

---

### place_attribute_values

**Purpose**: Flexible attribute storage for places.

| Column | Type | Description |
|--------|------|-------------|
| `place_id` | INTEGER PK FK | References places(id) |
| `attr` | TEXT PK | Attribute name |
| `source` | TEXT PK | Data source |
| `value_json` | TEXT | JSON value |
| `confidence` | REAL | Confidence score (0-1) |
| `fetched_at` | INTEGER | Fetch timestamp |
| `metadata` | JSON | Additional metadata |

**Primary Key**: Composite (place_id, attr, source)

**Indexes**:
- `idx_place_attr_attr` - Attribute filtering
- `idx_place_attr_source` - Source filtering

---

### gazetteer_crawl_state

**Purpose**: Tracks gazetteer ingestion progress.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment primary key |
| `stage` | TEXT | Stage (countries, adm1, adm2, cities, osm_boundaries) |
| `status` | TEXT | Status (pending, in_progress, completed, failed) |
| `started_at` | INTEGER | Start timestamp |
| `completed_at` | INTEGER | Completion timestamp |
| `records_total` | INTEGER | Total records |
| `records_processed` | INTEGER | Records processed |
| `records_upserted` | INTEGER | Records inserted/updated |
| `errors` | INTEGER | Error count |
| `error_message` | TEXT | Error message |
| `metadata` | JSON | Stage metadata |

**Indexes**:
- `idx_crawl_state_stage` - Stage filtering
- `idx_crawl_state_status` - Status filtering

---

## Background Task Tables

### background_tasks

**Purpose**: Long-running background tasks (compression, analysis, etc.).

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | Task ID (UUID) |
| `type` | TEXT | Task type (compression, analysis, export) |
| `config` | TEXT | JSON configuration |
| `status` | TEXT | Status (pending, running, paused, completed, failed) |
| `progress` | TEXT | JSON progress object |
| `created_at` | TEXT | Creation timestamp |
| `started_at` | TEXT | Start timestamp |
| `ended_at` | TEXT | End timestamp |
| `error` | TEXT | Error message |
| `result` | TEXT | JSON result |

**Indexes**:
- `idx_background_tasks_type` - Type filtering
- `idx_background_tasks_status` - Status filtering
- `idx_background_tasks_created` - Chronological queries

---

## Categorization & Metadata Tables

### domain_categories, domain_category_map

**Purpose**: Domain categorization system.

**domain_categories**:
- `id` - Category ID
- `name` - Category name (unique)
- `description` - Description

**domain_category_map**:
- `domain_id` → domains(id)
- `category_id` → domain_categories(id)
- Primary key: (domain_id, category_id)

---

### url_categories, url_category_map

**Purpose**: URL categorization system.

Similar structure to domain categories.

---

### page_categories, page_category_map

**Purpose**: Page content categorization system.

Similar structure to domain categories.

---

### news_websites

**Purpose**: Registry of tracked news websites.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment primary key |
| `url` | TEXT UNIQUE | Website URL |
| `label` | TEXT | Display label |
| `parent_domain` | TEXT | Parent domain |
| `url_pattern` | TEXT | URL pattern regex |
| `website_type` | TEXT | Type classification |
| `added_at` | TEXT | Addition timestamp |
| `added_by` | TEXT | Added by (user/system) |
| `enabled` | INTEGER | Boolean (0/1) |
| `metadata` | TEXT | JSON metadata |

---

### news_websites_stats_cache

**Purpose**: Cached statistics for news websites.

| Column | Type | Description |
|--------|------|-------------|
| `website_id` | INTEGER PK FK | References news_websites(id) |
| `article_count` | INTEGER | Total articles |
| `fetch_count` | INTEGER | Total fetches |
| `fetch_ok_count` | INTEGER | Successful fetches |
| `fetch_error_count` | INTEGER | Failed fetches |
| `fetch_last_at` | TEXT | Last fetch timestamp |
| `article_latest_date` | TEXT | Latest article date |
| `last_updated_at` | TEXT | Cache update timestamp |

---

## Compression Infrastructure Tables

### compression_types

**Purpose**: Registry of compression algorithms.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment primary key |
| `name` | TEXT UNIQUE | Algorithm name (gzip, brotli, zstd) |
| `level` | INTEGER | Compression level |
| `description` | TEXT | Description |

---

### compression_buckets

**Purpose**: Shared compression buckets for similar content.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment primary key |
| `name` | TEXT UNIQUE | Bucket name |
| `compression_type_id` | INTEGER FK | References compression_types(id) |
| `compressed_data` | BLOB | Compressed bucket content |
| `original_size` | INTEGER | Total original size |
| `compressed_size` | INTEGER | Total compressed size |
| `item_count` | INTEGER | Number of items |
| `created_at` | TEXT | Creation timestamp |
| `last_accessed_at` | TEXT | Last access timestamp |

**Relationships**:
- → `compression_types` (compression_type_id)
- ← `articles` (compression_bucket_id)

---

## Relationships & Foreign Keys

### Primary Relationships

```
articles
  ├─→ compression_types (compression_type_id)
  └─→ compression_buckets (compression_bucket_id)

crawl_jobs
  ├─→ crawl_types (crawl_type_id)
  ├─← queue_events (job_id)
  ├─← crawl_problems (job_id)
  ├─← crawl_milestones (job_id)
  └─← crawl_tasks (job_id)

places
  ├─→ place_names (canonical_name_id)
  ├─← place_names (place_id)
  ├─← place_hierarchy (parent_id, child_id)
  ├─← place_external_ids (place_id)
  └─← place_attribute_values (place_id)

domains
  ├─← domain_category_map (domain_id)
  └─→ domain_categories (via domain_category_map)

urls
  ├─← url_category_map (url_id)
  └─→ url_categories (via url_category_map)

fetches
  ├─← page_category_map (fetch_id)
  └─→ page_categories (via page_category_map)

news_websites
  └─← news_websites_stats_cache (website_id)

compression_buckets
  ├─→ compression_types (compression_type_id)
  └─← articles (compression_bucket_id)
```

---

## Indexes & Performance

### Critical Indexes

**High-Traffic Queries**:
1. `idx_articles_host` - Domain filtering (used in domain summary queries)
2. `idx_places_wikidata_qid` - Wikidata lookup (geography crawl)
3. `idx_queue_events_job` - Job telemetry queries
4. `idx_place_names_norm` - Name search (autocomplete)

**Composite Indexes**:
1. `idx_places_kind_country` - Filtering by type and country
2. `idx_crawl_tasks_job_status` - Task queue queries

**Covering Indexes**:
- Most indexes are simple single-column indexes
- Could benefit from covering indexes for common SELECT columns

---

## Schema Evolution

### Migration History

**Version 1**: Initial denormalized schema (articles table with 30+ columns)
**Version 2**: Add normalized tables (http_responses, content_storage, content_analysis)
**Version 3**: Enable dual-write mode
**Version 8**: Article-place relations with confidence scoring

### Current State

- ✅ **Normalization Complete**: Content separated from metadata
- ✅ **Compression Infrastructure**: Brotli compression with bucketing
- ✅ **Schema Versioning**: Via schema_migrations table
- ✅ **Foreign Keys**: Comprehensive referential integrity
- ⚠️ **Migration In Progress**: Some legacy data still in articles.html/text

### Future Plans

- Complete migration of remaining legacy data
- Add compression operation tracking
- Optimize indexes for common query patterns

---

## Visual Reference

**See**: `docs/DATABASE_SCHEMA_ERD.svg` - Interactive SVG diagram showing all 74 tables and relationships

---

## Related Documentation

- **docs/DATABASE_SCHEMA_ERD.svg** ⭐ Visual SVG diagram
- **docs/DATABASE_QUICK_REFERENCE.md** ⭐ Quick lookup guide
- **docs/DATABASE_MIGRATION_GUIDE_FOR_AGENTS.md** ⭐ Migration workflow
- **docs/DATABASE_NORMALIZATION_PLAN.md** - Normalization implementation
- **AGENTS.md** - Database access patterns

---

*Last Updated: October 28, 2025*
*Schema Version: 8 (74 tables, normalized)*
