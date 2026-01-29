# Chapter 8: Crawler Integration Architecture

This chapter documents the integration between the Place Hub system and the Intelligent Crawl Server, enabling systematic historical archiving of news articles organized by place.

## Overview

The Place Hub system creates a **geographic map** of news coverage. The crawler integration transforms this map into **actionable crawl tasks**:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PLACE HUB ARCHIVE PIPELINE                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │   Discovery  │───▶│    Depth     │───▶│    Task Generation   │  │
│  │   (Guess)    │    │   Probing    │    │                      │  │
│  └──────────────┘    └──────────────┘    └──────────────────────┘  │
│         │                   │                      │                │
│         ▼                   ▼                      ▼                │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │ place_page_  │    │ max_page_    │    │    crawl_tasks       │  │
│  │ mappings     │    │ depth        │    │    (pending)         │  │
│  └──────────────┘    └──────────────┘    └──────────────────────┘  │
│                                                    │                │
│                                                    ▼                │
│                                          ┌──────────────────────┐  │
│                                          │  Archive Crawler     │  │
│                                          │  (paginated fetch)   │  │
│                                          └──────────────────────┘  │
│                                                    │                │
│                                                    ▼                │
│                                          ┌──────────────────────┐  │
│                                          │  content_storage +   │  │
│                                          │  content_analysis    │  │
│                                          └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. HubTaskGenerator Service

**Location**: `src/services/HubTaskGenerator.js`

The HubTaskGenerator bridges place hub discovery with the crawler:

```javascript
const { HubTaskGenerator } = require('./services/HubTaskGenerator');

const generator = new HubTaskGenerator({
  db: database,
  fetcher: nodeFetch,
  logger: console
});

// Probe depth for verified hubs
const results = await generator.runDepthProbe({
  host: 'theguardian.com',
  hubLimit: 50,
  probeDelayMs: 500
});

// Generate crawl tasks for deep hubs
const tasks = await generator.generateAndPersistTasks({
  host: 'theguardian.com',
  minDepth: 10,
  pagesPerHub: 100
});
```

#### Depth Probing Algorithm

The depth probe uses a two-phase algorithm:

1. **Exponential Search**: Double page numbers (2, 4, 8, 16...) until failure
2. **Binary Search**: Narrow down the exact boundary

**Loopback Detection**:
- Many sites redirect high page numbers back to page 1
- We detect this via:
  - **Time Travel**: If page 2048's oldest date is newer than page 1024's
  - **Signature Match**: If article links on page N match page 1

```javascript
// Time travel detection
if (pageResult.oldestDate > lastGood.oldestDate) {
  const daysDiff = (new Date(pageResult.oldestDate) - new Date(lastGood.oldestDate)) / DAY_MS;
  if (daysDiff > 7) {
    // This is a loopback - stop searching
    break;
  }
}
```

### 2. Database Queries

**Location**: `src/db/sqlite/v1/queries/placePageMappings.js`

New functions added for archive support:

| Function | Purpose |
|----------|---------|
| `getVerifiedHubsForArchive()` | Get hubs ready for archiving |
| `updateHubDepthCheck()` | Update depth metadata after probing |
| `getArchiveCrawlStats()` | Get archive coverage statistics |
| `getHubsNeedingArchive()` | Get hubs with depth > N needing crawl |

**Schema Columns** (in `place_page_mappings`):
```sql
max_page_depth INTEGER,        -- Maximum pagination depth discovered
oldest_content_date TEXT,      -- ISO date of oldest article found
last_depth_check_at TEXT,      -- When depth was last probed
depth_check_error TEXT         -- Error message if probe failed
```

### 3. Crawl Operations

**Location**: `src/crawler/operations/HubArchiveCrawlOperation.js`

Two new operations:

1. **HubArchiveCrawlOperation** (`hubArchiveCrawl`)
   - Crawls historical pages from verified hubs
   - Configurable pages per hub, rate limiting, prioritization

2. **HubDepthProbeOperation** (`hubDepthProbe`)
   - Probes hubs for pagination depth without crawling content
   - Useful for planning before committing to full archive

### 4. IntelligentCrawlServer Integration

**Location**: `src/services/IntelligentCrawlServer.js`

New HTTP endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/hub-archive/probe` | POST | Start depth probing for hubs |
| `/api/hub-archive/tasks` | POST | Generate crawl tasks |
| `/api/hub-archive/stats` | GET | Archive coverage statistics |
| `/api/hub-archive/hubs` | GET | List verified hubs |

**SSE Events** (streamed via `/events`):
- `hub-probe:start` - Probe session started
- `hub-probe:hub-start` - Individual hub probe started
- `hub-probe:page` - Page checked during exponential search
- `hub-probe:hub-complete` - Hub probe finished
- `hub-probe:finish` - All hubs probed
- `hub-archive:tasks-generated` - Crawl tasks created

## Workflow

### Step 1: Discover Hubs

Run place hub guessing for a domain:

```bash
# Via CLI
node tools/dev/guess-place-hubs.js --domain=theguardian.com --kinds=country

# Via API
curl -X POST http://localhost:3150/api/crawl/start \
  -H "Content-Type: application/json" \
  -d '{"operation": "guessPlaceHubs", "options": {"domain": "theguardian.com"}}'
```

### Step 2: Probe Depth

Determine how deep each hub's archive goes:

```bash
# Via API
curl -X POST http://localhost:3150/api/hub-archive/probe \
  -H "Content-Type: application/json" \
  -d '{"host": "theguardian.com", "hubLimit": 50}'

# Via CLI (standalone)
node tools/dev/probe-hub-depth.js --limit=50
```

### Step 3: Generate Tasks

Create crawl tasks for deep hubs:

```bash
curl -X POST http://localhost:3150/api/hub-archive/tasks \
  -H "Content-Type: application/json" \
  -d '{"host": "theguardian.com", "minDepth": 10, "pagesPerHub": 100}'
```

### Step 4: Execute Archive Crawl

Tasks are queued in `crawl_tasks`. The crawler processes them:

```bash
# Start the intelligent crawl server
node src/services/IntelligentCrawlServer.js --port=3150

# Monitor via SSE
curl -N http://localhost:3150/events
```

## Priority Calculation

Archive tasks are prioritized based on:

1. **Recency** (30%): Earlier pages (more recent content) get higher priority
2. **Population** (20%): High-population places prioritized
3. **Base Priority** (50%): Configurable high/normal/low

```javascript
// Priority formula
const recencyBoost = Math.max(0, 1 - (page / maxPageDepth));
const populationBoost = Math.log10(population + 1) / 10;
const priority = basePriority + (recencyBoost * 30) + (populationBoost * 20);
```

## Rate Limiting

The system respects site rate limits:

| Setting | Default | Description |
|---------|---------|-------------|
| `probeDelayMs` | 500ms | Delay between probe requests |
| `requestDelayMs` | 1000ms | Delay between archive page requests |
| `concurrency` | 1 | Concurrent requests per domain |

The `domain_rate_limits` table tracks learned limits per domain.

## The "Forever Archive" Model

Once a hub's historical pages are crawled:

1. Mark pages as `status='archived'` in tracking
2. Future crawls only check page 1
3. If new articles appear (date > last_seen), crawl forward until overlap

This creates a **complete timeline** for each place with minimal redundant fetching.

## Monitoring

### Stats Endpoint

```bash
curl http://localhost:3150/api/hub-archive/stats | jq
```

Returns:
```json
{
  "totals": {
    "totalHubs": 264,
    "depthChecked": 180,
    "hasMultiplePages": 156,
    "avgMaxDepth": 847
  },
  "byHost": [
    {
      "host": "theguardian.com",
      "hubCount": 264,
      "verifiedPresent": 248,
      "verifiedAbsent": 16,
      "depthChecked": 180,
      "maxPageDepth": 1924,
      "oldestContent": "2000-01-01"
    }
  ]
}
```

### List Hubs

```bash
# Verified hubs ordered by priority
curl "http://localhost:3150/api/hub-archive/hubs?host=theguardian.com&limit=10"

# Hubs needing archive (have depth, not yet crawled)
curl "http://localhost:3150/api/hub-archive/hubs?mode=needs-archive&minDepth=10"
```

## Integration with Place Disambiguation

The archived articles feed the disambiguation system:

1. **Ground Truth**: Articles from `/world/georgia` are definitively about Georgia (country)
2. **Publisher Prior**: Coverage data informs publisher geographic bias
3. **Training Data**: Verified place-article links train NLP classifiers

See [Chapter 10: Place Disambiguation](../../2026-01-05-crawl-analysis-integration-book/book/chapters/10-place-disambiguation.md) for details.

## Next Steps

1. **UI Integration**: Show depth/archive status in Matrix cells
2. **Scheduling**: Automatic periodic archive updates
3. **Cross-Domain Patterns**: Share discovered patterns between similar publishers
4. **Quality Metrics**: Track article yield per page, content freshness
