# Phase 8: Analytics, Intelligence & API

> **Goal**: Transform crawl data into actionable insights with powerful analytics, expose crawler capabilities through APIs, and enable intelligent content curation.

## Overview

With production infrastructure in place (Phase 7), Phase 8 focuses on:
1. **Analytics**: Understanding what we've crawled, trends, and patterns
2. **Intelligence**: Smart content recommendations and similarity detection
3. **API**: RESTful and streaming APIs for external consumers
4. **Curation**: Tools for curating and organizing collected articles

## Item 1: Historical Analytics Dashboard (6h)

### Objective
Aggregate view of crawl history with trends, patterns, and insights.

### Components

```
src/ui/server/analyticsHub/
├── server.js                  # Express server (port 3101)
├── AnalyticsService.js        # Time-series aggregation
└── controls/
    ├── TrendChart.js          # Article count over time
    ├── DomainLeaderboard.js   # Top domains by volume
    ├── HourlyHeatmap.js       # Activity by hour/day
    └── GrowthMetrics.js       # Week-over-week growth
```

### Metrics Tracked
- Articles per day/week/month
- Unique domains discovered
- Extraction success rates over time
- Content volume by category/domain
- Peak crawl hours

### API Endpoints
```
GET /api/analytics/trends?period=7d|30d|90d
GET /api/analytics/leaderboard?limit=50
GET /api/analytics/heatmap
GET /api/analytics/growth
```

---

## Item 2: Content Similarity Engine (8h)

### Objective
Detect duplicate/similar articles across domains for deduplication and cross-referencing.

### Components

```
src/analysis/similarity/
├── SimilarityEngine.js        # Main orchestration
├── MinHasher.js               # MinHash for near-duplicate detection
├── SimHasher.js               # SimHash for content fingerprinting
├── SimilarityIndex.js         # LSH index for fast lookup
└── DuplicateDetector.js       # Exact and near-duplicate detection
```

### Features
- **Exact duplicates**: SHA-256 content hash
- **Near duplicates**: MinHash with Jaccard similarity >0.85
- **Similar content**: SimHash with Hamming distance <3
- **Cross-domain tracking**: Same story from different sources

### Database Schema
```sql
CREATE TABLE content_fingerprints (
  article_id INTEGER PRIMARY KEY,
  content_hash TEXT,           -- SHA-256
  minhash_signature BLOB,      -- 128 32-bit hashes
  simhash BLOB,                -- 64-bit fingerprint
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE similar_articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_a INTEGER NOT NULL,
  article_b INTEGER NOT NULL,
  similarity_score REAL,
  similarity_type TEXT,        -- exact, near, similar
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

---

## Item 3: REST API Gateway (8h)

### Objective
Expose crawler data and operations through a versioned REST API.

### Components

```
src/api/
├── server.js                  # Express API server (port 4000)
├── v1/
│   ├── articles.js            # Article CRUD + search
│   ├── domains.js             # Domain management
│   ├── crawls.js              # Crawl operations
│   └── analytics.js           # Analytics endpoints
├── middleware/
│   ├── auth.js                # API key authentication
│   ├── rateLimit.js           # Per-key rate limiting
│   └── validation.js          # Request validation
└── openapi.yaml               # OpenAPI 3.0 spec
```

### Endpoints (v1)
```
# Articles
GET    /api/v1/articles          # List with filters
GET    /api/v1/articles/:id      # Get single article
POST   /api/v1/articles/search   # Full-text search
GET    /api/v1/articles/:id/similar  # Get similar articles

# Domains
GET    /api/v1/domains           # List crawled domains
GET    /api/v1/domains/:domain   # Domain stats
POST   /api/v1/domains           # Add domain to crawl
DELETE /api/v1/domains/:domain   # Remove domain

# Crawls
GET    /api/v1/crawls            # List crawl jobs
POST   /api/v1/crawls            # Start new crawl
GET    /api/v1/crawls/:id        # Crawl status
DELETE /api/v1/crawls/:id        # Cancel crawl

# Analytics
GET    /api/v1/analytics/summary
GET    /api/v1/analytics/trends
GET    /api/v1/analytics/domains/:domain
```

### Authentication
- API keys stored in `api_keys` table
- Rate limiting: 100 req/min (free), 1000 req/min (premium)
- JWT tokens for session-based access

---

## Item 4: Real-Time Event Stream (6h)

### Objective
WebSocket and SSE streams for live crawl events.

### Components

```
src/api/streaming/
├── EventBroadcaster.js        # Pub/sub for crawl events
├── WebSocketServer.js         # WS server for bidirectional
├── SSEController.js           # SSE for unidirectional
└── EventFilter.js             # Client-side filtering
```

### Event Types
```javascript
{
  "type": "article.discovered",
  "data": { "url": "...", "title": "...", "domain": "..." },
  "timestamp": "2025-12-25T10:00:00Z"
}

{
  "type": "crawl.progress",
  "data": { "jobId": "...", "fetched": 150, "queued": 500, "errors": 2 }
}

{
  "type": "crawl.completed",
  "data": { "jobId": "...", "articles": 342, "duration": 3600 }
}

{
  "type": "domain.ratelimited",
  "data": { "domain": "...", "retryAfter": 60 }
}
```

### Subscription
```javascript
// WebSocket
ws.send(JSON.stringify({ 
  action: "subscribe", 
  channels: ["article.discovered", "crawl.*"],
  filters: { domain: "example.com" }
}));

// SSE
GET /api/v1/stream?channels=article.*&domain=example.com
```

---

## Item 5: Content Tagging & Categorization (8h)

### Objective
Automatic categorization of articles using keyword extraction and topic modeling.

### Components

```
src/analysis/tagging/
├── TaggingService.js          # Main orchestration
├── KeywordExtractor.js        # TF-IDF based extraction
├── CategoryClassifier.js      # Rule-based + ML classification
├── EntityRecognizer.js        # Named entity extraction
└── TagStore.js                # Tag persistence
```

### Categories
- **Topics**: Politics, Technology, Sports, Business, Entertainment, Science, Health
- **Entities**: People, Organizations, Locations (from gazetteer)
- **Keywords**: Top 10 TF-IDF terms per article
- **Sentiment**: Positive, Neutral, Negative (rule-based)

### Database Schema
```sql
CREATE TABLE article_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL,
  tag_type TEXT,               -- topic, entity, keyword, sentiment
  tag_value TEXT,
  confidence REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_article_tags_article ON article_tags(article_id);
CREATE INDEX idx_article_tags_type_value ON article_tags(tag_type, tag_value);
```

---

## Item 6: Article Recommendation Engine (8h)

### Objective
Recommend related articles based on content, tags, and user behavior.

### Components

```
src/analysis/recommendations/
├── RecommendationEngine.js    # Main orchestration
├── ContentBasedRecommender.js # Similarity-based
├── TagBasedRecommender.js     # Tag overlap
├── TrendingCalculator.js      # Recency + popularity
└── RecommendationCache.js     # Redis/memory cache
```

### Recommendation Strategies
1. **Content-based**: SimHash similarity + shared entities
2. **Tag-based**: Jaccard overlap on tags
3. **Trending**: Recent articles with high engagement signals
4. **Domain-related**: Other articles from same domain

### API
```
GET /api/v1/articles/:id/recommendations?strategy=content&limit=10
GET /api/v1/recommendations/trending?period=24h&limit=20
GET /api/v1/recommendations/for-you?tags=technology,ai&limit=20
```

---

## Item 7: Search & Full-Text Index (8h)

### Objective
Fast full-text search across all articles with faceted filtering.

### Components

```
src/search/
├── SearchService.js           # Query orchestration
├── FullTextIndex.js           # SQLite FTS5 wrapper
├── FacetCalculator.js         # Aggregations for filters
├── QueryParser.js             # Advanced query syntax
└── SearchHighlighter.js       # Result snippet highlighting
```

### Query Syntax
```
# Simple search
"climate change"

# Field-specific
title:election domain:bbc.com

# Date range
published:2025-12-01..2025-12-25

# Boolean
(technology OR science) AND NOT sports

# Fuzzy
climat~  (matches climate, climatic, etc.)
```

### Features
- FTS5 index with BM25 ranking
- Facets: domain, date, category, author
- Highlighting with <mark> tags
- Spelling suggestions
- Query autocomplete

---

## Item 8: Data Export & Syndication (6h)

### Objective
Export articles in multiple formats for downstream consumption.

### Components

```
src/export/
├── ExportService.js           # Main orchestration
├── formatters/
│   ├── JsonFormatter.js       # JSON/JSONL export
│   ├── CsvFormatter.js        # CSV with configurable columns
│   ├── RssFormatter.js        # RSS 2.0 feed
│   ├── AtomFormatter.js       # Atom feed
│   └── SitemapFormatter.js    # XML sitemap
└── ScheduledExporter.js       # Cron-based exports
```

### Export Formats
- **JSON/JSONL**: Full article data with metadata
- **CSV**: Tabular export with column selection
- **RSS/Atom**: Feed format for readers
- **Sitemap**: For SEO/indexing

### API Endpoints
```
GET /api/v1/export/articles.json?domain=example.com&limit=1000
GET /api/v1/export/articles.csv?columns=title,url,published
GET /api/v1/feeds/rss?domain=example.com
GET /api/v1/feeds/atom?category=technology
GET /api/v1/sitemap.xml
```

### Scheduled Exports
```json
{
  "exports": [
    {
      "name": "daily-dump",
      "format": "jsonl",
      "schedule": "0 0 * * *",
      "destination": "s3://bucket/exports/",
      "filters": { "published": "last-24h" }
    }
  ]
}
```

---

## Success Criteria

| Item | Metric | Target |
|------|--------|--------|
| Analytics Dashboard | Page load | <2s with 1M articles |
| Similarity Engine | Duplicate detection | >95% recall, <1% false positive |
| REST API | Response time | p95 <200ms |
| Event Stream | Latency | <500ms from event to client |
| Tagging | Categorization accuracy | >80% on labeled set |
| Recommendations | Click-through rate | >15% on recommended articles |
| Search | Query latency | p95 <100ms |
| Export | Throughput | >10k articles/sec |

## Implementation Order

1. **Search & Full-Text Index** (8h) - Foundation for all querying
2. **REST API Gateway** (8h) - External access layer
3. **Content Similarity Engine** (8h) - Deduplication and clustering
4. **Content Tagging** (8h) - Enrichment pipeline
5. **Historical Analytics** (6h) - Insights dashboard
6. **Real-Time Stream** (6h) - Live events
7. **Recommendations** (8h) - Discovery features
8. **Export & Syndication** (6h) - Data distribution

**Total: 58 hours**
