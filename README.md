# News Crawler

**When to Read**: This is the main README for the project. Read this first to get a high-level overview of the project's features, how to install and run it, and the available configuration options. It's the best starting point for new developers.

A focused crawler for news sites: detects navigation, finds articles, and saves structured data to SQLite with a live UI.

## Testing

**GOLDEN RULE**: Tests must never hang silently. All async tests require explicit timeouts and progress logging.

See [AGENTS.md Testing Guidelines](./AGENTS.md#testing-guidelines) and [Testing Async Cleanup Guide](./docs/TESTING_ASYNC_CLEANUP_GUIDE.md) for comprehensive patterns.

## Features

- Navigation detection for menus, breadcrumbs, pagination (header/nav/footer/[role=navigation])
- Article discovery via URL and DOM heuristics; Readability-based extraction and metadata
- robots.txt aware; stays on-domain; duplicate-visit prevention
- Persistence: SQLite-only (no JSON files); articles, fetches, links, domains, categories
- Concurrency with a bounded priority queue and per-URL exponential backoff
- Rate limiting & 429 handling:
  - 5s blackout after 429; ramped per-domain cap: start 20/min, +10/min each minute
  - Even token spacing across the minute; small pacer jitter (defaults 25–50ms)
- Networking safety: request timeout (default 10s), keep-alive agents
- Live UI (Express): streaming logs (SSE), real-time metrics (req/s, dl/s ≤15s avg, MB/s), ETA, recent errors and domains, per-host “RATE LIMITED” badges
- Multi-job capable UI (opt-in via `UI_ALLOW_MULTI_JOBS=1`) with job-scoped controls and `/events?job=` filtering
- Queue event tracking (enqueued / dequeued / retry / drop) with real-time `queue` SSE events & SSR queue pages
- Intelligent crawl (planner) that seeds hubs, detects expectation gaps (Problems) and achievements (Milestones)
- Problems & Milestones history pages with keyset pagination
- Crawl type presets (basic / sitemap-only / basic-with-sitemap / intelligent / discover-structure) via `/api/crawl-types`
- Gazetteer-enhanced page analysis (places + hub detection) & per-place hub inference
- Observability: Prometheus `/metrics`, health endpoints, and a system health strip (CPU/memory and SQLite WAL info)

**Database Migration**: Schema is actively evolving. See `docs/DATABASE_MIGRATION_GUIDE_FOR_AGENTS.md` for current state and migration procedures.

## Installation

```bash
npm install
```

Prerequisites:

- Node.js 18+ is recommended
- Native build tools are required for `better-sqlite3` on first install
  - Ubuntu/Debian: `build-essential python3 make g++`
  - macOS: Xcode Command Line Tools
  - Windows: Visual Studio Build Tools (or prebuilt binaries)

## Usage

### Command Line Interface

**Standard Web Crawls:**
```bash
# Crawl The Guardian (default)
node src/crawl.js

# Crawl a specific URL
node src/crawl.js https://www.theguardian.com

# Disable SQLite persistence (not recommended)
node src/crawl.js https://www.theguardian.com --no-db

# Set crawl depth and custom DB path
node src/crawl.js https://www.theguardian.com --depth=2 --db=./data/news.db

# Limit number of network downloads
node src/crawl.js https://www.theguardian.com --max-pages=50

# Use cached articles if fresh (time units s/m/h/d)
node src/crawl.js https://www.theguardian.com --max-age=6h

# Enable concurrent crawling with a bounded priority queue
node src/crawl.js https://www.theguardian.com --depth=1 --concurrency=4 --max-queue=20000
```

**Geography/Gazetteer Crawls** (fetch geographic data from Wikidata, no URL needed):
```bash
# Geography crawl (countries + regions + cities + boundaries)
node src/crawl.js --crawl-type=geography

# Wikidata-only crawl (subset of geography)
node src/crawl.js --crawl-type=wikidata

# With custom database and download limits
node src/crawl.js --crawl-type=geography --db=./data/geography.db --max-pages=1000

# With concurrency (respects API rate limits internally)
node src/crawl.js --crawl-type=geography --concurrency=4
```

**Note:** Geography, wikidata, and gazetteer crawl types don't require a URL argument. If you provide one, it will be ignored and replaced with a placeholder.

### CLI quick reference

**Core Options:**
- `--depth=N`           Max crawl depth (default: 2 via CLI)
- `--no-db`             Disable SQLite persistence (no data saved)
- `--db=PATH`           Custom SQLite DB path
- `--max-pages=N`       Limit number of network downloads (alias: `--max-downloads`)
- `--crawl-type=<name>` Pick a crawl preset. Options:
  - `basic`, `sitemap-only`, `basic-with-sitemap`, `intelligent` - Web crawls (require URL)
  - `geography`, `wikidata`, `gazetteer` - Geographic data crawls (no URL needed)
- `--job-id=ID`         Set custom job ID (useful for tracking in multi-job environments)

**Caching & Freshness:**
- `--max-age=30s|10m|2h|1d` Prefer cached articles when fresh within window (alias: `--refetch-if-older-than`)
- `--no-prefer-cache`   Force network fetches even when cache is fresh
- `--refetch-article-if-older-than=7d` Article-specific freshness window (alias: `--max-age-article`)
- `--refetch-hub-if-older-than=1h` Hub/navigation page freshness window (alias: `--max-age-hub`)

**Concurrency & Queue:**
- `--concurrency=N`     Number of parallel workers (default: 1). For specialized crawls (gazetteer, geography), this sets the maximum allowed concurrency; actual parallelism may be less due to API limits.
- `--max-queue=N`       Bounded queue size (default: 10000)
- `--fast-start` / `--no-fast-start`  Fast-start is now the default (skips heavy DB sampling). Use `--no-fast-start` to run the full initialization.
- `--newdb`             Allocate a fresh database in `data/` named `news_<number>.db` (ignored when `--db` is supplied)

**Sitemap Options:**
- `--no-sitemap`        Disable sitemap discovery/seed (GUI: uncheck "Use sitemap")
- `--sitemap-only`      Crawl only sitemap URLs (don't seed start URL)
- `--sitemap-max=N`     Cap number of sitemap URLs (default: 5000). In the GUI, this mirrors Max Pages.

**Intelligent Crawl Options** (forwarded only when provided):
- `--hub-max-pages=N`      Limit pages considered per detected hub
- `--hub-max-days=N`       Limit age (days) for hub seeding
- `--int-max-seeds=N`      Cap initial hub seeds (default internal 50)
- `--int-target-hosts=host1,host2` Activate planner only if start host matches suffix
- `--planner-verbosity=0..3` Planner diagnostic verbosity

**Networking & Rate Limiting:**
- `--request-timeout-ms=MS`  Per-request timeout (default: 10000)
- `--rate-limit-ms=MS`       Global rate limit between requests in milliseconds
- `--slow` / `--slow-mode`   Enable slow crawling mode with stricter rate limiting
- `--pacer-jitter-min-ms=MS` Small jitter min between paced tokens (default: 25)
- `--pacer-jitter-max-ms=MS` Small jitter max (default: 50)

**URL Filtering:**
- `--allow-query-urls`  Allow crawling URLs with query parameters (default: skip query URLs)

Backfill publication dates: `npm run backfill:dates` (flags: `--redo`, `--limit=N`, `--batch-size=N`, `--no-list-existing`, `--include-nav`, `--url=...`)

Analyze domains (news-site heuristic): `npm run analyze:domains`

### Gazetteer utilities

- `node tools/gazetteer/gazetteer-summary.js` — Print a country-by-country table of current city and region counts (use `--db=` to override the database, `--json` for machine-readable output)

### Benchmark crawl SQL performance

Measure the latency of the crawler's most common database queries to spot slow indexes before a crawl starts:

```
node src/tools/crawl-query-benchmark.js --iterations=10
```

By default the script opens `data/news.db`. Use `--db=PATH` to benchmark a different database, `--only=id1,id2` to restrict the query set, or `--list` to print the available identifiers. Set `--json=true` to emit machine-readable output (helpful for CI checks and historical tracking).

### UI (Data Explorer)

The active UI is the Data Explorer, served by `src/ui/server/dataExplorerServer.js`.

1) Start the server:

```bash
npm run ui:data-explorer
```

2) Open `http://localhost:3001`.

For development notes (SSR vs hydration, control checks, E2E workflow), see `src/ui/README.md`.

### Deprecated UI (Express)

The legacy Express dashboard is deprecated as of October 2025 and kept for reference.

Start it directly:

```bash
node src/deprecated-ui/express/server.js
```

Or detached:

```bash
node src/deprecated-ui/express/server.js --detached
```

Watch the console for the `GUI server listening on http://localhost:<port>` message and open that URL. The server auto-selects a high-numbered free port (defaults to the 41000+ range) unless you override it with `PORT`.

What you’ll see:

- Start/Stop/Pause/Resume controls; sitemap toggles & crawl type selector
- Live logs via Server-Sent Events (SSE), unbuffered with heartbeats
- Metrics: req/s, dl/s (≤15s avg), MB/s; queue sparkline; ETA
- Badges: robots/sitemap status, global and per-host rate‑limited indicators
- Panels: Recent Errors, Recent Domains; URLs and Domain pages with details; Queues, Problems, Milestones, Gazetteer
- Analysis pipeline card that streams `ANALYSIS_PROGRESS` updates (stage, processed counts, highlights) with quick links to the latest run
- Intelligent pipeline summary that reflects planner-stage telemetry and live coverage/goal insights
- Health strip: DB size, disk free, CPU %, memory (RSS), SQLite journal mode and WAL autocheckpoint

### Styling workflow (deprecated UI)

Deprecated Express dashboard styles originate from `src/deprecated-ui/express/public/styles/crawler.scss` and compile to `src/deprecated-ui/express/public/crawler.css`.

#### Sitemap options

- Use sitemap: When enabled, the crawler discovers and enqueues URLs from the site’s sitemap (linked from robots.txt or common paths) in addition to the Start URL. This accelerates finding articles without deep link traversal. Respects robots.txt and same‑domain rules.
- Sitemap only: Only enqueue URLs from the sitemap and skip seeding from the Start URL/link graph. Useful with Depth=0 for a quick sample directly from the publisher’s index.

Notes:
- In the GUI, the sitemap URL cap follows Max Pages automatically (no separate field). The crawler won’t enqueue more sitemap URLs than Max Pages.
- By default, sitemap discovery is ON. Disable it by unchecking “Use sitemap” (equivalent to `--no-sitemap`).
- Crawl type presets auto-adjust sitemap flags; manual checkboxes still respected if you change them after selecting a preset.

### Intelligent crawl & diagnostics

When run with `--crawl-type=intelligent` (or selecting the Intelligent crawl type in the UI), a lightweight planner:

- Seeds candidate hub pages (sections, countries, topics) early to accelerate coverage
- Emits `problem` events (expectation gaps: missing hubs, weak classification patterns, etc.)
- Emits `milestone` events (positive learnings: patterns learned, hubs seeded, classifier calibrated)

These are streamed over SSE (`event: problem` / `event: milestone`) and persisted for SSR history pages if the DB is writable.

The helper CLI `node tools/intelligent-crawl.js` wires these planner stages together. It now downloads article content by default so capped runs like `--max-downloads 100` actually persist pages. Pass `--hub-exclusive` when you want the previous structure-only behavior (hub validation without article fetches).

### Problems & Milestones pages

- `/problems/ssr` newest-first list with filters (`job`, `kind`, `scope`) & cursor pagination (`before`, `after`).
- `/milestones/ssr` similar layout for achievements.
- Both use keyset pagination (no OFFSET) for scalability.

### Queue events

Structured crawler output lines prefixed with `QUEUE ` are relayed as SSE `queue` events and persisted:

- Actions: `enqueued`, `dequeued`, `retry`, `drop` (with reason: `max-depth`, `off-domain`, `robots-disallow`, `visited`, `duplicate`, `overflow`, `bad-url`, `retriable-error` etc.)
- SSR pages: `/queues/ssr` (list) and `/queues/:id/ssr` (details with filters & cursors).

### Freshness policy (refetch windows)

Refetch logic allows different freshness for articles vs hubs/navigation pages, reducing bandwidth:

- Global fallback `--refetch-if-older-than`
- Article-specific `--refetch-article-if-older-than`
- Hub/navigation-specific `--refetch-hub-if-older-than`

Effective decision combines classification heuristics + provided windows. If no specific window matches, the global fallback (if any) is used.

### Multi-job mode

By default only one active crawl is allowed. Set `UI_ALLOW_MULTI_JOBS=1` before starting the UI server to permit multiple concurrent jobs. SSE `/events?job=<id>` filters events for a specific job. Control endpoints require `jobId` when multiple jobs are running.

### Crawl types

The server seeds a small catalog (`basic`, `sitemap-only`, `basic-with-sitemap`, `intelligent`, `discover-structure`) exposed via `GET /api/crawl-types`. Selecting a type in the UI sets baseline flags; manual overrides (checkboxes / inputs) still apply after selection. Choosing `intelligent` enables the planner pipeline, hub seeding, and additional coverage insights in the dashboard. The `discover-structure` preset reuses the same planner stages but suppresses article fetch/persistence, focusing the crawl on mapping navigation hubs, history archives, and URL patterns while keeping network usage minimal. Structure-only runs now auto-scale to four concurrent workers and keep the priority queue enabled so nav scaffolding is mapped quickly; the dashboard surfaces a dedicated **Structure discovery** panel (navigation pages mapped, skipped article counts, top path prefixes, and freshness) so it’s easy to track progress without scanning raw logs.

### Page analysis & gazetteer

Run the canonical analysis script (places extraction + hub detection):

```bash
node src/tools/analyse-pages.js --db=./data/news.db --analysis-version=1 --limit=5000
```

Useful flags:

- `--dry-run` Skip database writes while reporting how many articles, places, and hubs would be updated.
- `--list` Emit a human-readable summary of hub assignments (combine with `--list-limit=<n>` to control output size).
- `--include-evidence` Attach the JSON evidence payload for each listed hub (pairs well with `--list`).

All flags work together, so `--dry-run --list --list-limit=25` lets you preview new hub rows without mutating the database.

Run the combined analysis + milestone refresh (pages + domains + milestone backfill):

```bash
npm run analysis:run
# or: node src/tools/analysis-run.js --db=./data/news.db --analysis-version=1
```

The runner keeps page/domain analysis current and inserts any missing milestone prerequisites (`downloads-1k`, `depth2-coverage`, `articles-identified-*`) under job id `analysis-run`.

The legacy `src/analyse-pages.js` now prints a deprecation warning and forwards here; it will be removed in a future release.

### Programmatic Usage

```javascript
const NewsCrawler = require('./src/crawl.js');

const crawler = new NewsCrawler('https://www.theguardian.com', {
  rateLimitMs: 2000,  // 2 seconds between requests
  maxDepth: 2,        // Maximum crawl depth
  dataDir: './data'   // Base directory (DB and temp files)
});

crawler.crawl()
  .then(() => console.log('Crawling completed'))
  .catch(err => console.error('Crawling failed:', err));
```

### Telemetry API

`NewsCrawler` exposes structured events through a `telemetry` facade. To observe queue drops, problems, or milestones in your own tooling or tests, spy on or override the telemetry methods instead of relying on previous `crawler.emit*` helpers:

```javascript
const queueSpy = jest.spyOn(crawler.telemetry, 'queueEvent');
const milestoneSpy = jest.spyOn(crawler.telemetry, 'milestone');

crawler._emitIntelligentCompletionMilestone({ outcomeErr: null });

expect(queueSpy).toHaveBeenCalled();
expect(milestoneSpy).toHaveBeenCalledWith(expect.objectContaining({ kind: 'intelligent-completion' }));
```

Available methods include `progress`, `queueEvent`, `enhancedQueueEvent`, `problem`, `milestone`, `milestoneOnce`, and `plannerStage`. Each forwards to the underlying `CrawlerEvents` instance. The legacy `crawler.emitQueueEvent`, `crawler.emitProblem`, and `crawler.emitMilestone` instance methods have been removed.

## Scripts

This project includes several npm scripts for common tasks. Scripts are organized by category:

### Testing Scripts
```bash
# Run full test suite (excludes expensive E2E tests)
npm test

# Run specific test suites
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only  
npm run test:e2e           # End-to-end tests
npm run test:e2e-quick     # Quick E2E smoke tests
npm run test:all           # All test suites

# Development testing
npm run test:dev-geography        # Geography-specific tests
npm run test:dev-geography-monitor # Geography tests with monitoring

# Legacy test commands (may be deprecated)
npm run test:legacy:fast          # Fast unit tests (legacy)
npm run test:legacy:quick         # Quick tests (legacy)
npm run test:legacy:geography-full # Full geography E2E (legacy)
npm run test:legacy:online        # Online tests (legacy)
npm run test:legacy:all           # All tests (legacy)

# Test utilities
npm run tests:review              # Review test status and failures
npm run test:file "pattern"       # Run tests matching pattern
npm run test:timing               # Run tests with timing reports
```

### Data Analysis & Processing Scripts
```bash
# Backfill missing publication dates
npm run backfill:dates
npm run backfill:dates:redo       # Re-run date backfill

# Analyze domains for news site characteristics
npm run analyze:domains

# Run page analysis (places extraction + hub detection)
npm run analyze:pages
npm run analysis:run              # Combined analysis + milestone refresh
```

### Gazetteer Scripts
```bash
# Populate gazetteer with geographic data
npm run populate:gazetteer

# Export gazetteer data to data/exports directory
npm run export:gazetteer

# Validate gazetteer integrity
npm run validate:gazetteer
```

### Build & Development Scripts
```bash
# Start crawler (same as npm start)
npm run start

# Data Explorer UI (active)
npm run ui:data-explorer

# Diagram Atlas (UI)
npm run diagram:server

# Docs viewer (UI)
npm run ui:docs

# Client bundle for interactive controls (Data Explorer)
npm run ui:client-build
```

### Benchmarking Scripts
```bash
# Run performance benchmarks
npm run benchmarks
```

### Screen Capture (DEPRECATED)
```bash
# UI screen capture (deprecated)
npm run ui:capture-screens
```

**Note**: The legacy Express dashboard is deprecated as of October 2025; see `src/deprecated-ui/express/server.js` and `src/ui/README.md`.

## Background Tasks

The crawler supports long-running background tasks for data processing, compression, analysis, and maintenance. These tasks run asynchronously and can be monitored through the web UI.

### Available Background Tasks

#### Article Compression (`article-compression`)
Compress article content to reduce storage space and improve performance.

**Parameters:**
- **Quality**: Brotli compression level (0-11, default: 10)
- **Window Size**: Compression window size (10-24, default: 24)
- **Compression Method**: Algorithm to use (Brotli/Gzip/Zstandard)
- **Target Articles**: Which articles to compress (uncompressed/all/age-based)
- **Batch Size**: Articles per processing batch (default: 100)
- **Enable Bucket Compression**: Group similar articles for better compression

**Use Cases:**
- Reduce database size by 60-80% with Brotli level 10-11
- Archive old articles with maximum compression
- Enable bucket compression for 20x+ compression ratios on similar content

#### Database Export (`database-export`)
Export database tables to JSON/NDJSON/CSV formats for backup or analysis.

**Parameters:**
- **Output Path**: File path for export (default: `data/exports/`)
- **Format**: Export format (NDJSON/JSON/CSV)
- **Tables**: Which tables to export (articles/fetches/sitemaps/domains/gazetteer)
- **Compress**: Gzip compress output file
- **Row Limit**: Maximum rows per table (0 = unlimited)

**Use Cases:**
- Create backups before major changes
- Export data for analysis in other tools
- Migrate data between databases
- Share datasets with compressed NDJSON format

#### Gazetteer Import (`gazetteer-import`)
Import geographic place data from external sources.

**Parameters:**
- **Source File**: Path to NDJSON place data file
- **Import Mode**: How to handle existing data (merge/replace/append)
- **Batch Size**: Places per import batch (default: 500)
- **Validate Data**: Check data integrity before import

**Use Cases:**
- Import Wikidata place data
- Update gazetteer with new geographic information
- Merge data from multiple sources
- Validate data quality during import

#### Database Vacuum (`database-vacuum`)
Reclaim disk space and optimize database performance.

**Parameters:**
- **Vacuum Mode**: Operation type (full/incremental/analyze-only)
- **Backup Before Vacuum**: Create backup before operation

**Use Cases:**
- Reclaim space after deleting many articles
- Optimize query performance with updated statistics
- Maintenance after large data operations
- Safe vacuuming with automatic backup

#### Content Analysis (`analysis-run`)
Analyze article content for places, topics, and quality metrics.

**Parameters:**
- **Analysis Version**: Algorithm version (default: 1)
- **Page Limit**: Max pages to analyze (0 = unlimited)
- **Domain Limit**: Max domains to analyze (0 = unlimited)
- **Skip Options**: Skip page/domain/milestone/place analysis
- **Place Matching Rule Level**: Accuracy vs speed trade-off (1-4)
- **Verbose Logging**: Enable detailed progress output

**Use Cases:**
- Extract place mentions from articles
- Award achievement milestones
- Update domain analysis for news site detection
- Perform place-article matching with gazetteer data

#### Site Crawling (`crawl-site`)
Crawl a news website as a background task.

**Parameters:**
- **Start URL**: Website to crawl
- **Max Pages**: Page limit for crawl
- **Concurrency**: Parallel request workers
- **Rate Limit**: Delay between requests
- **Respect robots.txt**: Honor exclusion rules
- **User Agent**: HTTP User-Agent header

**Use Cases:**
- Crawl sites without blocking the main process
- Schedule regular crawls of multiple sites
- Monitor crawl progress through web UI
- Automated crawling workflows

### Running Background Tasks

#### Via Web UI
1. Navigate to `/background-tasks.html`
2. Click "New Task"
3. Select task type and configure parameters
4. Monitor progress with real-time updates

#### Via API
```bash
# Start a compression task
curl -X POST http://localhost:3000/api/background-tasks \
  -H "Content-Type: application/json" \
  -d '{
    "taskType": "article-compression",
    "parameters": {
      "quality": 10,
      "targetArticles": "uncompressed",
      "batchSize": 100
    }
  }'

# Check task status
curl http://localhost:3000/api/background-tasks/{taskId}
```

#### Via Command Line (Future)
Background tasks are currently managed through the web UI. CLI support may be added in future versions.

### Task Monitoring

All background tasks provide:
- **Real-time Progress**: SSE updates with completion percentages
- **Structured Logging**: Detailed operation logs
- **Error Handling**: Automatic retry and failure reporting
- **Cancellation Support**: Stop long-running tasks safely
- **Result Persistence**: Task results saved to database

### Compression Workflows

#### Standard Compression Pipeline
1. **Initial Compression**: Compress new articles during crawl (Brotli 6)
2. **Batch Compression**: Compress existing uncompressed articles
3. **Archival Compression**: Maximum compression for old articles (Brotli 11)
4. **Bucket Compression**: Group similar articles for 20x+ compression ratios

#### Compression Best Practices
- Use Brotli level 6-8 for active content (good balance)
- Use Brotli level 10-11 for archival (maximum compression)
- Enable bucket compression for news articles (significant space savings)
- Compress by age: recent articles with moderate compression, old with maximum

#### Storage Tiers
- **Hot**: Recently crawled articles (Brotli 6, fast access)
- **Warm**: Articles < 30 days (Brotli 8, balanced)
- **Cold**: Articles > 90 days (Brotli 11, maximum compression)

### Analysis Workflows

#### Content Analysis Pipeline
1. **Page Analysis**: Extract places, topics, and quality metrics
2. **Domain Analysis**: Aggregate statistics per news site
3. **Place Matching**: Link articles to geographic locations
4. **Milestone Awards**: Recognize crawling achievements

#### Analysis Configuration
- Use rule level 1-2 for fast processing
- Use rule level 3-4 for maximum accuracy
- Skip place matching if gazetteer data is incomplete
- Enable verbose logging for debugging

### Maintenance Workflows

#### Database Maintenance
1. **Regular Vacuum**: Reclaim space weekly/monthly
2. **Export Backups**: Before major operations
3. **Statistics Update**: After schema changes
4. **Integrity Checks**: Periodic validation

#### Automated Maintenance
```javascript
// Example maintenance schedule
const maintenanceTasks = [
  { task: 'database-vacuum', schedule: 'weekly', mode: 'incremental' },
  { task: 'database-export', schedule: 'daily', tables: ['articles'] },
  { task: 'analysis-run', schedule: 'daily', skipPages: true }
];
```

### Task Dependencies

Some tasks have dependencies or recommended execution order:

- **Gazetteer Import** → **Analysis Run** (place data needed for matching)
- **Site Crawling** → **Article Compression** (compress newly crawled content)
- **Analysis Run** → **Database Export** (updated analysis data in exports)
- **Database Vacuum** → Run after large deletions or imports

### Performance Considerations

- **Compression Tasks**: CPU-intensive, run during off-peak hours
- **Analysis Tasks**: I/O intensive, may take hours for large datasets
- **Export Tasks**: Disk I/O intensive, ensure sufficient storage space
- **Import Tasks**: Memory intensive for large datasets, monitor RAM usage

### Error Handling

Background tasks include comprehensive error handling:
- **Automatic Retries**: Failed operations retry with exponential backoff
- **Partial Success**: Tasks continue processing after individual failures
- **Detailed Logging**: Error context preserved for debugging
- **Graceful Shutdown**: Tasks can be cancelled safely at any point

### Task History

All completed tasks are stored in the database with:
- Execution parameters and results
- Start/end timestamps and duration
- Success/failure status and error details
- Performance metrics (rows processed, compression ratios, etc.)

Access task history through `/api/background-tasks` or the web UI.

### Common Crawler Issues

**Crawler not showing up in UI**
- **Cause**: Crawls are internal processes, not directly visible in UI
- **Solution**: Check `/api/crawls` endpoint or logs for active crawls
- **See**: `docs/ARCHITECTURE_QUEUES_ARE_INTERNAL.md` - Queues are internal to crawls

**Tests hanging or timing out**
- **Cause**: Async operations without proper cleanup or timeouts
- **Solution**: Add explicit timeouts (`test('name', async () => {...}, 30000)`)
- **See**: `docs/TEST_TIMEOUT_GUARDS_IMPLEMENTATION.md`

**Database connection issues**
- **Cause**: Multiple connections in WAL mode cause isolation
- **Solution**: Use single shared DB connection from app instance
- **See**: AGENTS.md "How to Get a Database Handle"

**High memory usage**
- **Cause**: Large result sets or unclosed database connections
- **Solution**: Use LIMIT clauses, close connections, enable streaming
- **See**: `docs/DATABASE_ACCESS_PATTERNS.md`

**Rate limiting errors (429)**
- **Cause**: Too many requests to same domain
- **Solution**: Increase `--rate-limit-ms` or use `--slow` mode
- **See**: CLI options in Usage section

**Sitemap discovery failing**
- **Cause**: Missing or malformed robots.txt/sitemap
- **Solution**: Use `--no-sitemap` flag or manual URL seeding
- **See**: Sitemap options in Usage section

**Article extraction poor**
- **Cause**: Non-standard page structure
- **Solution**: Check Readability.js compatibility or custom extraction
- **See**: Article Detection section

### Debug Tools

**Child process debugging**
```bash
node tools/debug/child-process-monitor.js
```
- Monitors crawler child processes
- Shows SSE events and MILESTONE markers
- **See**: `docs/DEBUGGING_CHILD_PROCESSES.md`

**Database inspection**
```bash
node tools/db-schema.js tables     # List all tables
node tools/db-schema.js describe <table>  # Table structure
node tools/db-query.js <query>     # Execute custom queries
```

**Test failure analysis**
```bash
node tests/analyze-test-logs.js --summary  # Current test status
node tests/get-failing-tests.js           # List failing tests
```

### Performance Issues

**Slow database queries**
- **Check**: Run `node src/tools/crawl-query-benchmark.js`
- **Common fixes**: Add indexes, use LIMIT, optimize JOINs
- **See**: `docs/DATABASE_ACCESS_PATTERNS.md`

**High CPU usage**
- **Cause**: Complex regex or DOM parsing
- **Solution**: Profile with Node.js inspector, optimize selectors
- **See**: Performance investigation guide

**Network timeouts**
- **Cause**: Slow sites or network issues
- **Solution**: Increase `--request-timeout-ms` (default 10s)
- **See**: Networking options in CLI reference

## Advanced Crawler Configuration

The crawler supports advanced configuration options for fine-tuning behavior, enabling experimental features, and optimizing performance. These options are configured through JSON files and command-line parameters.

### Priority Configuration (`config/priority-config.json`)

The priority system determines which URLs are crawled first. Configure bonuses, weights, and clustering in `config/priority-config.json`:

```json
{
  "queue": {
    "bonuses": {
      "adaptive-seed": { "value": 20, "description": "URLs from intelligent planning" },
      "gap-prediction": { "value": 15, "description": "URLs filling coverage gaps" },
      "country-hub-discovery": { "value": 100, "description": "Country hub pages" }
    },
    "weights": {
      "article": { "value": 0, "description": "Highest priority - articles" },
      "hub-seed": { "value": 4, "description": "Hub pages from planner" },
      "nav": { "value": 10, "description": "Navigation pages" },
      "refresh": { "value": 25, "description": "Lowest priority - cached refreshes" }
    },
    "clustering": {
      "problemThreshold": 5,
      "timeWindowMinutes": 30,
      "maxClusterSize": 100,
      "boostFactorPerCluster": 2.5
    }
  },
  "coverage": {
    "telemetryIntervalSeconds": 30,
    "milestoneThresholds": {
      "hubDiscoveryMinimum": 10,
      "coveragePercentageTargets": [25, 50, 75, 90]
    }
  },
  "features": {
    "advancedPlanningSuite": true,
    "gapDrivenPrioritization": true,
    "plannerKnowledgeReuse": true,
    "realTimeCoverageAnalytics": true,
    "problemClustering": true
  }
}
```

**Priority Bonuses:**
- `adaptive-seed`: URLs discovered by intelligent planning (+20 priority)
- `gap-prediction`: URLs predicted to fill coverage gaps (+15 priority)  
- `country-hub-discovery`: Country hub pages (TOTAL priority +1000)
- `country-hub-article`: Article links on country hubs (+90 priority)

**Content Type Weights:**
- `article`: 0 (highest priority)
- `hub-seed`: 4 (intelligent planner hubs)
- `history`: 6 (archive content)
- `nav`: 10 (navigation pages)
- `refresh`: 25 (lowest priority - cached content refreshes)

**Problem Clustering:**
- Groups similar issues to avoid duplicate problem reports
- `problemThreshold`: Minimum problems to trigger clustering (5)
- `timeWindowMinutes`: Time window for clustering (30 minutes)
- `boostFactorPerCluster`: Priority boost per cluster member (2.5x)

### Enhanced Features Configuration

Advanced features are enabled through the `features` section:

```json
{
  "features": {
    "advancedPlanningSuite": true,           // Full AI planning suite
    "gapDrivenPrioritization": true,         // Prioritize gap-filling URLs
    "plannerKnowledgeReuse": true,           // Learn from previous crawls
    "realTimeCoverageAnalytics": true,       // Live coverage tracking
    "problemClustering": true,               // Group similar issues
    "problemResolution": true,               // Auto-resolve known issues
    "graphReasonerPlugin": true,             // Graph-based reasoning
    "gazetteerAwareReasoner": true,          // Geography-aware planning
    "gap-driven-prioritization": true,       // Prioritize coverage gaps
    "costAwarePriority": false,              // Experimental cost weighting
    "patternDiscovery": true,                // Auto-discover URL patterns
    "adaptiveBranching": false,              // Experimental adaptive depth
    "realTimePlanAdjustment": false,         // Live planning adjustments
    "dynamicReplanning": false,              // Replan during execution
    "crossDomainSharing": false,             // Share knowledge across domains
    "totalPrioritisation": true              // Use total priority scoring
  }
}
```

**Core Features:**
- **Advanced Planning Suite**: Full AI-driven crawl planning and execution
- **Gap-Driven Prioritization**: Focus on filling coverage gaps first
- **Planner Knowledge Reuse**: Learn patterns from previous crawls
- **Real-Time Coverage Analytics**: Live tracking of crawl coverage
- **Problem Clustering**: Group and prioritize similar issues

**Experimental Features:**
- **Cost-Aware Priority**: Weight URLs by estimated processing cost
- **Adaptive Branching**: Dynamically adjust crawl depth
- **Real-Time Plan Adjustment**: Modify plan during execution
- **Dynamic Replanning**: Complete replanning mid-crawl
- **Cross-Domain Sharing**: Share knowledge between different sites

### Intelligent Crawl Options

Advanced options for intelligent crawl types (`--crawl-type=intelligent`):

```bash
# Hub discovery limits
--hub-max-pages=100          # Max pages per hub (default: unlimited)
--hub-max-days=30            # Max age for hub seeding in days (default: unlimited)
--int-max-seeds=50           # Max initial hub seeds (default: 50)

# Target specific hosts
--int-target-hosts=bbc.com,cnn.com  # Only plan for these domains

# Planner verbosity
--planner-verbosity=3        # Debug level 0-3 (default: 0)
```

**Hub Discovery:**
- `hub-max-pages`: Limit pages analyzed per detected hub
- `hub-max-days`: Only consider hubs updated within N days
- `int-max-seeds`: Maximum initial hubs to seed from start URL

**Target Filtering:**
- `int-target-hosts`: Comma-separated list of domains to focus planning on
- Useful for multi-domain sites or focused crawling

### Gazetteer/Geography Crawl Configuration

Specialized options for geographic data crawls:

```bash
# Country limits
--limit-countries=50         # Max countries to process
--target-countries=US,CA,GB  # Specific countries to crawl

# Stage filtering
--gazetteer-stages=countries,cities  # Only run specific stages

# Performance tuning
--concurrency=2              # Parallel workers (max allowed)
```

**Geography Options:**
- `limit-countries`: Maximum countries to fetch (unlimited by default)
- `target-countries`: Specific country codes to process
- `gazetteer-stages`: Run only selected stages (countries, adm1, cities, boundaries)

**Performance Notes:**
- Gazetteer crawls are sequential by default due to API rate limits
- `concurrency` sets maximum allowed parallelism, not requirement
- External APIs (Wikidata, Overpass) have built-in rate limiting

### Queue and Concurrency Configuration

Advanced queue management options:

```bash
# Queue sizing
--max-queue=50000           # Maximum queue size (default: 10000)
--concurrency=8             # Parallel workers (default: 1)

# Priority queue control
--use-priority-queue        # Enable priority-based scheduling (auto-enabled if concurrency > 1)
```

**Queue Behavior:**
- `max-queue`: Bounded queue prevents memory issues
- `concurrency`: Number of parallel page processors
- Priority queue automatically enabled for concurrent crawls

### Rate Limiting and Networking

Fine-tune network behavior:

```bash
# Global rate limiting
--rate-limit-ms=1000        # Min ms between requests (default: 1000 in slow mode, 0 otherwise)
--slow-mode                 # Enable conservative rate limiting

# Per-domain pacing
--pacer-jitter-min-ms=25    # Min jitter between paced requests (default: 25)
--pacer-jitter-max-ms=50    # Max jitter (default: 50)

# Timeouts and retries
--request-timeout-ms=15000  # Request timeout (default: 10000)
--retry-limit=5             # Max retries per URL (default: 3)
--backoff-base-ms=1000      # Initial backoff (default: 500)
--backoff-max-ms=300000     # Max backoff (default: 300000)
```

**429 Handling:**
- Automatic detection and 5-second blackout per domain
- Ramped limiter: starts at 20/min, increases by 10/min each minute
- Even spacing with configurable jitter to avoid alignment

### Caching and Freshness Policies

Advanced caching configuration:

```bash
# Freshness windows
--refetch-if-older-than=6h              # Global freshness (default: unlimited)
--refetch-article-if-older-than=24h     # Article-specific freshness
--refetch-hub-if-older-than=1h          # Hub/navigation freshness

# Cache behavior
--prefer-cache                         # Use cached content when fresh (default: true)
--no-prefer-cache                      # Force network fetches
--fast-start                           # Skip heavy DB sampling (default: true)
```

**Freshness Policy:**
- Separate freshness windows for articles vs navigation
- `refetch-if-older-than`: Global fallback for unspecified content types
- `prefer-cache`: Whether to use cached content when within freshness window

### Database and Persistence

Database-specific options:

```bash
# Database configuration
--db=./data/custom.db       # Custom database path
--no-db                     # Disable persistence (testing only)
--fast-start                # Skip DB sampling on startup (default: true)

# WAL mode settings (SQLite)
# Automatic WAL mode with checkpointing
# Connection pooling and prepared statements
```

**Database Features:**
- Automatic WAL mode for concurrent access
- Connection pooling for performance
- Prepared statements for query efficiency
- Optional enhanced database adapter for analytics

### Experimental and Debug Options

Advanced debugging and experimental features:

```bash
# Debug output
--planner-verbosity=2       # Planner debug level 0-3
--verbose                   # General verbosity

# Experimental modes
--structure-only            # Map navigation without fetching articles
--country-hub-exclusive     # Only crawl country hub content
--hub-exclusive             # Helper alias (intelligent-crawl.js) for structure-only hub audits
--exhaustive-country-hub    # Comprehensive country hub discovery

# Connection handling
--connection-reset-window-ms=120000    # Connection reset detection window
--connection-reset-threshold=5         # Failures before reset
```

**Debug Features:**
- `structure-only`: Map site navigation without content fetching
- `country-hub-exclusive`: Focus exclusively on geographic hubs
- Connection reset detection for unreliable networks

### Configuration File Examples

**Minimal Intelligent Crawl:**
```json
{
  "features": {
    "advancedPlanningSuite": true,
    "gapDrivenPrioritization": true
  }
}
```

**High-Performance Gazetteer Crawl:**
```json
{
  "features": {
    "gazetteerAwareReasoner": true
  }
}
```

**Debug Configuration:**
```json
{
  "features": {
    "advancedPlanningSuite": true,
    "realTimeCoverageAnalytics": true
  },
  "coverage": {
    "telemetryIntervalSeconds": 10
  }
}
```

### Performance Tuning Guidelines

**For Large Sites:**
- Increase `concurrency` to 4-8
- Set `max-queue` to 50000+
- Use `hub-max-pages` to limit analysis scope
- Enable `fast-start` to skip DB sampling

**For Rate-Limited Sites:**
- Set `rate-limit-ms` to 2000+ 
- Use `--slow-mode` for conservative defaults
- Enable `prefer-cache` to reduce requests

**For Geography Crawls:**
- Set `concurrency` to 1-2 (API limits)
- Use `limit-countries` for testing
- Enable caching for repeated runs

**For Debug/Development:**
- Set `planner-verbosity` to 2-3
- Use `structure-only` for navigation mapping
- Enable all `features` for full diagnostics

## Output Format

Articles are stored in SQLite tables. Use the SQLite section below for schema and examples.

## SQLite Database

When enabled (default), the crawler also stores each article in a SQLite database located at `./data/news.db`.

Schema:

- `articles`
  - `id` INTEGER PRIMARY KEY
  - `url` TEXT UNIQUE
  - `title` TEXT
  - `date` TEXT
  - `section` TEXT
  - `html` TEXT
  - `crawled_at` TEXT (ISO 8601)
  - `canonical_url` TEXT (from <link rel=canonical>)
  - `referrer_url` TEXT (where this page was discovered)
  - `discovered_at` TEXT (when link was discovered)
  - `crawl_depth` INTEGER (depth when processed)
  - `fetched_at` TEXT (when HTTP fetch completed)
  - `request_started_at` TEXT (when HTTP request initiated)
  - `http_status` INTEGER (HTTP status)
  - `content_type` TEXT
  - `content_length` INTEGER
  - `etag` TEXT
  - `last_modified` TEXT
  - `redirect_chain` TEXT (JSON array)
  - `ttfb_ms` INTEGER (time to first byte)
  - `download_ms` INTEGER (time to download body)
  - `total_ms` INTEGER (total request time)
  - `bytes_downloaded` INTEGER (payload size in bytes)
  - `transfer_kbps` REAL (approx transfer speed in KB/s)
  - `html_sha256` TEXT (hash of HTML)
  - `text` TEXT (extracted readable content)
  - `word_count` INTEGER
  - `language` TEXT (best-effort)
  - `article_xpath` TEXT (XPath of detected article container)
  - `analysis` TEXT (JSON or text)

- `links` (links graph)
- `fetches` (per-download records)
   - `id` INTEGER PRIMARY KEY
   - `url` TEXT
   - `request_started_at`, `fetched_at`
   - `http_status`, `content_type`, `content_length`, `content_encoding`
   - `bytes_downloaded`, `transfer_kbps`, `ttfb_ms`, `download_ms`, `total_ms`
   - `saved_to_db`, `saved_to_file`, `file_path`, `file_size`
   - `classification` TEXT ('article' | 'nav' | 'other')
   - `nav_links_count`, `article_links_count`, `word_count`
   - `analysis` TEXT (JSON or text)

- `urls` (normalized URL catalog)
   - `id`, `url` (unique), `canonical_url`, `created_at`, `last_seen_at`, `analysis`

- `domains` (normalized domains)
   - `id`, `host` (unique), `tld`, `created_at`, `last_seen_at`, `analysis`

- Category tables (normalized)
   - `url_categories`, `page_categories`, `domain_categories`
   - Mapping tables: `url_category_map` (url_id↔category_id), `page_category_map` (fetch_id↔category_id), `domain_category_map` (domain_id↔category_id)
  - `id` INTEGER PRIMARY KEY
  - `src_url` TEXT (source page)
  - `dst_url` TEXT (destination page)
  - `anchor` TEXT (anchor text if available)
  - `rel` TEXT (rel attribute if available)
  - `type` TEXT ('nav' | 'article')
  - `depth` INTEGER (depth at which dst was queued)
  - `on_domain` INTEGER (1 if same domain)
  - `discovered_at` TEXT (ISO 8601)

You can inspect the DB with any SQLite client:

```bash
sqlite3 data/news.db "SELECT id, substr(title,1,60) AS title, date, section FROM articles ORDER BY id DESC LIMIT 10;"
```

To inspect the links graph:

```bash
sqlite3 data/news.db "SELECT COUNT(*) AS edges FROM links;"
sqlite3 data/news.db "SELECT substr(src_url,1,60) AS src, '->', substr(dst_url,1,60) AS dst, type FROM links ORDER BY id DESC LIMIT 10;"
```

### Caching behavior

- When `--max-age` is set, the crawler prefers cached articles from the SQLite DB for pages that look like articles.
- If a cached copy is used, it will NOT update the SQLite record (no resave).
- Freshness is determined from the article’s `crawled_at` timestamp.

### Concurrency, priority and backoff

When `--concurrency > 1`, the crawler switches to a bounded priority queue scheduler:

- A min-heap ranks requests favoring likely articles first, then shallower depth.
- The queue is bounded by `--max-queue`; new items are dropped if full.
- A global pacing token enforces `rateLimitMs` spacing across all workers.
- On retriable failures (HTTP 429 or 5xx, or network errors), items are re-queued with exponential backoff and jitter, respecting `Retry-After` when present, up to a small retry limit.
- For `--concurrency=1`, the original FIFO behavior is preserved.

#### 429 handling and per-domain pacing

- On 429, a 5s blackout is applied for that host, and a ramped limiter activates: 20/min initially, increasing by 10/min each minute.
- Tokens are evenly spaced across the minute to avoid bursts, with a small configurable jitter to avoid alignment across workers.
- Per-URL exponential backoff remains separate from per-domain pacing.

## Observability

- GUI exposes: `/urls`, `/url?url=…`, `/domain?host=…`, `/errors`
- GUI exposes: `/urls`, `/url?url=…`, `/domain?host=…`, `/errors`, `/queues/ssr`, `/problems/ssr`, `/milestones/ssr`, `/gazetteer` (when tables present)
- Health endpoints:
  - `/health`: lightweight status
  - `/api/system-health`: DB size, disk free, CPU, memory, SQLite journal mode and `wal_autocheckpoint`
- Prometheus metrics at `/metrics` (text format), including:
- Prometheus metrics at `/metrics` (text format), including:
  - `crawler_requests_total`, `crawler_downloads_total`, `crawler_errors_total`
  - `crawler_requests_per_second`, `crawler_downloads_per_second`, `crawler_bytes_per_second`
  - `crawler_queue_size`, `crawler_error_rate_per_min`, `crawler_running`, `crawler_paused`
  - `crawler_cache_hit_ratio` (placeholder; UI shows rolling 1m/5m cache gauges)
  - Request timing logs (stdout only): `[req] METHOD URL -> STATUS D.ms`
  - Planner diagnostics surface as problem/milestone counters (internal aggregation + SSE stream consumers)

## Navigation Detection

The crawler automatically detects navigation elements using these selectors:

- `header a` - Header navigation links
- `nav a` - Navigation menu links  
- `footer a` - Footer links
- `[role="navigation"] a` - ARIA navigation links
- `.menu a, .nav a, .navigation a` - Common navigation class names
- `.breadcrumb a, .breadcrumbs a` - Breadcrumb navigation
- `.pagination a, .pager a` - Pagination links

## Article Detection

Articles are identified using intelligent heuristics:

- Links within `article`, `.article`, `.story` elements
- Links containing URL patterns like `/article`, `/story`, `/news`, `/world`, `/politics`, etc.
- Headlines (h1, h2, h3) that link to content
- Date-based URL patterns (YYYY/MM/DD)

The crawler avoids non-article pages like search, login, admin, RSS feeds, and media files.

## Ethical Crawling

This crawler is designed to be respectful:

- **Robots.txt compliance**: Checks and follows robots.txt rules
- **Rate limiting**: Configurable delays between requests
- **Domain boundaries**: Never leaves the target domain
- **User-Agent**: Identifies itself as a bot with a proper User-Agent header

Note: Always comply with each site’s terms of service and robots policy. Don’t attempt to bypass paywalls or access disallowed areas.

## Reset / cleanup

To start fresh (remove cached files and DB):

```bash
rm -rf data/
```

This deletes the SQLite database and related working files.

## Dependencies

- `cheerio`: Server-side jQuery implementation for HTML parsing
- `better-sqlite3`: Fast SQLite bindings used for local persistence and analysis
- `node-fetch`: HTTP client for making requests
- `robots-parser`: robots.txt parser for compliance checking
- `express`: GUI server
 - `fast-xml-parser`: Sitemap XML parser (optional; a simple regex fallback is used if unavailable)
- `express`: GUI server
- `fast-xml-parser`: Sitemap XML parser (optional; a simple regex fallback is used if unavailable)
- `jsdom` + `@mozilla/readability`: Article text & word count inference (page analysis)

## Domain analysis (news-site heuristic)

The module `src/is_this_a_news_website.js` contains a simple heuristic to determine if a domain looks like a news site based on:

- Count of article-classified fetches
- Number of distinct article sections
- Ratio of article URLs with date patterns (/YYYY/MM/DD/)

The CLI tool `npm run analyze:domains` will compute metrics per domain, write a JSON analysis to the `domains` table, and tag domains with the `news` category when above a threshold.

## Tests

Run the test suite:

```bash
# List all tests (safe, no execution)
npm run test:list

# Run specific test files (safest)
npm run test:by-path -- path/to/test.js

# Run tests related to changed files
npm run test:related -- src/changed-file.js

# Run tests by name pattern
npm run test:name -- "test name pattern"

# Full test suite (excludes expensive E2E tests)
npm run test:unit

# Basic E2E tests (quick smoke tests)
npm run test:e2e-quick

# Full geography E2E (5-15 min, requires network)
npm run test:dev-geography
```

**See**: `docs/tests/FOCUSED_TESTS.md` for canonical focused test commands.  
**See**: `docs/tests/JEST_PITFALLS.md` for common mistakes to avoid.  
**See**: `docs/GEOGRAPHY_E2E_TESTING.md` for detailed E2E test documentation.

## License

ISC