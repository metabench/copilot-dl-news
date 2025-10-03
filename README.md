# News Crawler

A focused crawler for news sites: detects navigation, finds articles, and saves structured data to SQLite with a live UI.

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
- Live UI (Express): streaming logs (SSE), real-time metrics (req/s, dl/s ≤15s avg, MB/s), ETA, recent errors and domains, per-host “RATE LIMITED” badges
- Multi-job capable UI (opt-in via `UI_ALLOW_MULTI_JOBS=1`) with job-scoped controls and `/events?job=` filtering
- Queue event tracking (enqueued / dequeued / retry / drop) with real-time `queue` SSE events & SSR queue pages
- Intelligent crawl (planner) that seeds hubs, detects expectation gaps (Problems) and achievements (Milestones)
- Problems & Milestones history pages with keyset pagination
- Crawl type presets (basic / sitemap-only / basic-with-sitemap / intelligent) via `/api/crawl-types`
- Gazetteer-enhanced page analysis (places + hub detection) & per-place hub inference
- Observability: Prometheus `/metrics`, health endpoints, and a system health strip (CPU/memory and SQLite WAL info)

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

### CLI quick reference

- `--depth=N`           Max crawl depth (default: 2 via CLI)
- `--no-db`             Disable SQLite persistence (no data saved)
- `--db=PATH`           Custom SQLite DB path
- `--max-pages=N`       Limit number of network downloads
- `--max-age=30s|10m|2h|1d` Prefer cached articles when fresh within window
- `--no-prefer-cache`   Force network fetches even when cache is fresh
- `--concurrency=N`     Number of workers (default: 1)
- `--max-queue=N`       Bounded queue size (default: 10000)
- `--no-sitemap`        Disable sitemap discovery/seed (GUI: uncheck “Use sitemap”)
- `--sitemap-only`      Crawl only sitemap URLs (don’t seed start URL)
- `--sitemap-max=N`     Cap number of sitemap URLs (default: 5000). In the GUI, this mirrors Max Pages.
- `--no-sitemap`        Disable sitemap discovery/seed (GUI: uncheck “Use sitemap”)
- `--sitemap-only`      Crawl only sitemap URLs (don’t seed start URL)
- `--sitemap-max=N`     Cap number of sitemap URLs (default: 5000). In the GUI, this mirrors Max Pages.
- `--crawl-type=<name>`  Pick a crawl preset (`basic`, `sitemap-only`, `basic-with-sitemap`, `intelligent`). Planner features activate automatically when the type starts with `intelligent`.
- Intelligent crawl flags (forwarded only when provided):
  - `--hub-max-pages=N`      Limit pages considered per detected hub
  - `--hub-max-days=N`       Limit age (days) for hub seeding
  - `--int-max-seeds=N`      Cap initial hub seeds (default internal 50)
  - `--int-target-hosts=host1,host2` Activate planner only if start host matches suffix
  - `--planner-verbosity=0..3` Planner diagnostic verbosity
- Freshness / refetch policy:
  - `--refetch-if-older-than=1d` Global fallback freshness window
  - `--refetch-article-if-older-than=7d` Article-specific window
  - `--refetch-hub-if-older-than=1h` Hub/navigation page window (kept fresh more aggressively)
- Networking & pacing:
  - `--request-timeout-ms=MS`  Per-request timeout (default: 10000)
  - `--pacer-jitter-min-ms=MS` Small jitter min between paced tokens (default: 25)
  - `--pacer-jitter-max-ms=MS` Small jitter max (default: 50)

Backfill publication dates: `npm run backfill:dates` (flags: `--redo`, `--limit=N`, `--batch-size=N`, `--no-list-existing`, `--include-nav`, `--url=...`)

Analyze domains (news-site heuristic): `npm run analyze:domains`

### Benchmark crawl SQL performance

Measure the latency of the crawler's most common database queries to spot slow indexes before a crawl starts:

```
node src/tools/crawl-query-benchmark.js --iterations=10
```

By default the script opens `data/news.db`. Use `--db=PATH` to benchmark a different database, `--only=id1,id2` to restrict the query set, or `--list` to print the available identifiers. Set `--json=true` to emit machine-readable output (helpful for CI checks and historical tracking).

### GUI (Express)

A minimal dashboard to run and monitor crawls locally.

1) Start the GUI server:

```bash
npm run gui
```

2) Watch the console for the `GUI server listening on http://localhost:<port>` message and open that URL. The server auto-selects a high-numbered free port (defaults to the 41000+ range) unless you override it with `PORT`.

What you’ll see:

- Start/Stop/Pause/Resume controls; sitemap toggles
- Start/Stop/Pause/Resume controls; sitemap toggles & crawl type selector
- Live logs via Server-Sent Events (SSE), unbuffered with heartbeats
- Metrics: req/s, dl/s (≤15s avg), MB/s; queue sparkline; ETA
- Badges: robots/sitemap status, global and per-host rate‑limited indicators
- Panels: Recent Errors, Recent Domains; URLs and Domain pages with details
- Panels: Recent Errors, Recent Domains; URLs and Domain pages with details; Queues, Problems, Milestones, Gazetteer
- Analysis pipeline card that streams `ANALYSIS_PROGRESS` updates (stage, processed counts, highlights) with quick links to the latest run
- Intelligent pipeline summary that reflects planner-stage telemetry and live coverage/goal insights
- Health strip: DB size, disk free, CPU %, memory (RSS), SQLite journal mode and WAL autocheckpoint

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

The server seeds a small catalog (`basic`, `sitemap-only`, `basic-with-sitemap`, `intelligent`) exposed via `GET /api/crawl-types`. Selecting a type in the UI sets baseline flags; manual overrides (checkboxes / inputs) still apply after selection. Choosing `intelligent` enables the planner pipeline, hub seeding, and additional coverage insights in the dashboard.

### Page analysis & gazetteer

Run the canonical analysis script (places extraction + hub detection):

```bash
node src/tools/analyse-pages.js --db=./data/news.db --analysis-version=1 --limit=5000
```

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

## Configuration Options

- `rateLimitMs`: Global spacing between requests in milliseconds (default: 1000 in slow mode; 0 otherwise)
- `maxDepth`: Maximum depth to crawl (default: 3)
- `dataDir`: Base directory used for the SQLite DB and working files (default: './data')
- `enableDb`: Whether to persist to SQLite database (default: true)
- `dbPath`: Path to SQLite database file (default: './data/news.db')
- `maxDownloads` / `--max-pages`: Maximum number of pages to download over the network (default: unlimited)
- `maxAgeMs` / `--max-age`: Freshness window to reuse cached articles without downloading again. Accepts values like `30s`, `10m`, `2h`, `1d`. When provided, the crawler will check the SQLite DB and use it if `crawled_at` is within the window.
- `maxAgeMs` / `--max-age`: (Legacy) Freshness window to reuse cached articles. For finer control prefer new refetch flags (`--refetch-*`).
- Refetch windows (SSE/DB-friendly freshness policy):
  - `refetchIfOlderThan` / `--refetch-if-older-than`
  - `refetchArticleIfOlderThan` / `--refetch-article-if-older-than`
  - `refetchHubIfOlderThan` / `--refetch-hub-if-older-than`
- `requestTimeoutMs`: Per-request timeout in ms (default: 10000)
- `pacerJitterMinMs`/`pacerJitterMaxMs`: Small jitter added to per-domain pacing (defaults 25–50ms)

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
npm test --silent
```

## License

ISC