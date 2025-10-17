# Database Schema - Entity Relationship Diagram

**When to Read**: Read this when understanding the database structure, implementing queries, planning schema changes, or normalizing data.

---

## Overview

This document provides a visual representation and detailed explanation of the SQLite database schema used by the news crawler application. The schema supports web crawling, content storage, gazetteer (geography) data, background task management, and compression infrastructure.

**Total Tables**: 40+ tables across 6 functional domains

---

## Table of Contents

1. [Core Content Tables](#core-content-tables)
2. [Crawl Management Tables](#crawl-management-tables)
3. [Gazetteer (Geography) Tables](#gazetteer-geography-tables)
4. [Background Task Tables](#background-task-tables)
5. [Categorization & Metadata Tables](#categorization--metadata-tables)
6. [Compression Infrastructure Tables](#compression-infrastructure-tables)
7. [Relationships & Foreign Keys](#relationships--foreign-keys)
8. [Indexes & Performance](#indexes--performance)

---

## Core Content Tables

### articles

**Purpose**: Main table for article content.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment primary key |
| `url` | TEXT UNIQUE | Article URL (unique) |
| `host` | TEXT | Domain name |
| `title` | TEXT | Article title |
| `date` | TEXT | Publication date (ISO 8601) |
| `section` | TEXT | Site section/category |
| `html` | BLOB | Raw HTML content |
| `crawled_at` | TEXT | Timestamp of crawl |
| `article_xpath` | TEXT | XPath to article content |
| `analysis` | TEXT | JSON analysis results |
| `canonical_url` | TEXT | Canonical URL |
| `compressed_html` | BLOB | Compressed content |
| `compression_type_id` | INTEGER FK | References compression_types |
| `compression_bucket_id` | INTEGER FK | References compression_buckets |
| `compression_bucket_key` | TEXT | Key within bucket |
| `original_size` | INTEGER | Bytes before compression |
| `compressed_size` | INTEGER | Bytes after compression |
| `compression_ratio` | REAL | Ratio (original/compressed) |

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

### Current State

- **Denormalized**: `articles` table mixes content, metadata, and compression info
- **Compression-Ready**: Columns for compression infrastructure exist
- **Normalization Plan**: See `docs/DATABASE_NORMALIZATION_PLAN.md` (1660 lines)

### Future Improvements (Planned)

1. **Normalize articles table**:
   - Extract HTTP metadata → `http_responses`
   - Extract content → `content_storage`
   - Extract analysis → `content_analysis`

2. **Add compression tracking**:
   - `compression_operations` - Track compression jobs
   - `compression_stats` - Aggregate statistics

3. **Gazetteer normalization**:
   - Split `places.extra` → dedicated tables
   - Normalize provenance tracking

**See**: `docs/DATABASE_NORMALIZATION_PLAN.md` for complete roadmap

---

## Visual ERD (ASCII)

```
┌─────────────┐
│   articles  │
├─────────────┤
│ id [PK]     │───┐
│ url         │   │
│ host        │   │
│ html        │   │
│ compressed_ │   │
│   html      │   │
│ compression_│   │
│   type_id   │───┼───→ ┌──────────────────┐
│ compression_│   │     │ compression_types│
│   bucket_id │───┼─┐   ├──────────────────┤
└─────────────┘   │ │   │ id [PK]          │
                  │ │   │ name             │
                  │ │   │ level            │
                  │ │   └──────────────────┘
                  │ │
                  │ └──→ ┌────────────────────┐
                  │     │ compression_buckets│
                  │     ├────────────────────┤
                  │     │ id [PK]            │
                  │     │ compressed_data    │
                  │     │ compression_type_id│─┐
                  │     └────────────────────┘ │
                  │                            │
                  └────────────────────────────┘

┌─────────────┐
│ crawl_jobs  │
├─────────────┤
│ id [PK]     │───┐
│ url         │   │
│ args        │   │
│ status      │   │
│ crawl_type_ │   │
│   id        │───┼──→ ┌────────────┐
└─────────────┘   │    │ crawl_types│
                  │    ├────────────┤
                  │    │ id [PK]    │
                  │    │ name       │
                  │    └────────────┘
                  │
                  ├──← ┌──────────────┐
                  │    │ queue_events │
                  │    ├──────────────┤
                  │    │ id [PK]      │
                  │    │ job_id [FK]  │
                  │    │ action       │
                  │    │ url          │
                  │    └──────────────┘
                  │
                  ├──← ┌────────────────┐
                  │    │ crawl_problems │
                  │    ├────────────────┤
                  │    │ id [PK]        │
                  │    │ job_id [FK]    │
                  │    │ kind           │
                  │    └────────────────┘
                  │
                  └──← ┌──────────────────┐
                       │ crawl_milestones │
                       ├──────────────────┤
                       │ id [PK]          │
                       │ job_id [FK]      │
                       │ kind             │
                       └──────────────────┘

┌─────────────┐
│   places    │
├─────────────┤
│ id [PK]     │───┬───← ┌──────────────┐
│ kind        │   │     │ place_names  │
│ country_code│   │     ├──────────────┤
│ wikidata_qid│   │     │ id [PK]      │
│ lat, lng    │   │     │ place_id [FK]│
│ population  │   │     │ name         │
│ canonical_  │   │     │ lang         │
│   name_id   │───┘     └──────────────┘
└─────────────┘
     │  │
     │  └──────← ┌────────────────┐
     │          │ place_hierarchy│
     │          ├────────────────┤
     │          │ parent_id [FK] │
     │          │ child_id [FK]  │
     │          │ relation       │
     │          └────────────────┘
     │
     └──────────← ┌──────────────────────┐
                  │ place_external_ids   │
                  ├──────────────────────┤
                  │ source [PK]          │
                  │ ext_id [PK]          │
                  │ place_id [FK]        │
                  └──────────────────────┘
```

---

## Usage Examples

### Query: Get articles with compression info

```sql
SELECT 
  a.url,
  a.title,
  a.original_size,
  a.compressed_size,
  a.compression_ratio,
  ct.name AS compression_method,
  ct.level AS compression_level
FROM articles a
LEFT JOIN compression_types ct ON a.compression_type_id = ct.id
WHERE a.compressed_html IS NOT NULL
ORDER BY a.compression_ratio DESC
LIMIT 10;
```

### Query: Get place hierarchy

```sql
SELECT 
  parent.name AS parent_name,
  child.name AS child_name,
  ph.relation,
  ph.depth
FROM place_hierarchy ph
JOIN places parent ON ph.parent_id = parent.id
JOIN places child ON ph.child_id = child.id
WHERE parent.kind = 'country'
  AND child.kind = 'city'
LIMIT 20;
```

### Query: Get crawl job telemetry

```sql
SELECT 
  cj.id,
  cj.url,
  cj.status,
  COUNT(qe.id) AS event_count,
  COUNT(CASE WHEN qe.action = 'enqueue' THEN 1 END) AS enqueued,
  COUNT(CASE WHEN qe.action = 'skip' THEN 1 END) AS skipped
FROM crawl_jobs cj
LEFT JOIN queue_events qe ON cj.id = qe.job_id
WHERE cj.started_at > datetime('now', '-1 day')
GROUP BY cj.id
ORDER BY cj.started_at DESC;
```

---

## Related Documentation

- **docs/DATABASE_NORMALIZATION_PLAN.md** - Comprehensive normalization roadmap (1660 lines)
- **docs/PHASE_0_IMPLEMENTATION.md** - Migration infrastructure
- **docs/COMPRESSION_IMPLEMENTATION_FULL.md** - Compression system architecture
- **docs/GAZETTEER_BREADTH_FIRST_IMPLEMENTATION.md** - Geography crawl implementation
- **AGENTS.md** - "How to Get a Database Handle" section

---

*Last Updated: October 10, 2025*
*Version: 1.0*
