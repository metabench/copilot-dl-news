# News Crawler

A web crawler specifically designed for news websites with intelligent navigation detection and article extraction capabilities.

## Features

- **Navigation Detection**: Automatically detects navigation elements (header, nav, footer, menus, breadcrumbs, pagination, [role=navigation]) to find section and index links
- **Article Extraction**: Identifies and extracts article links using smart heuristics
- **robots.txt Compliance**: Respects robots.txt rules to be a good web citizen
- **Rate Limiting**: Built-in rate limiting to avoid overwhelming target servers
- **Domain Restriction**: Stays within the target domain to avoid crawling the entire web
- **Duplicate Prevention**: Maintains a visited set to avoid crawling the same page twice
- **Metadata Extraction**: Extracts article title, date, section, and URL
- **Data Persistence**: Saves articles as JSON files with HTML content and metadata, and optionally into a local SQLite database for querying
- **Analysis & Classification**:
  - Per-URL, per-article, and per-download analysis fields
  - Heuristics to classify pages (article/nav/other) and domains (e.g., news sites)
  - Normalized categories for URLs, pages, and domains

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

# Disable SQLite persistence (JSON files only)
node src/crawl.js https://www.theguardian.com --no-db

# Set crawl depth and custom DB path
node src/crawl.js https://www.theguardian.com --depth=2 --db=./data/news.db

# Limit number of network downloads
node src/crawl.js https://www.theguardian.com --max-pages=50

# Use cached articles if fresh (time units s/m/h/d)
node src/crawl.js https://www.theguardian.com --max-age=6h
### GUI (Express)

A minimal web dashboard is available to run and monitor crawls locally.

Quick start:

1. Start the GUI server:

  npm run gui

2. Open in your browser:

  http://localhost:3000

3. Fill in options (start URL, depth, max pages, max age, concurrency, queue size), then click Start. Use Stop to terminate the current run.

Notes:

- The GUI streams live logs via Server-Sent Events (SSE).
- Only one crawl can run at a time via the dashboard.
- You can still use the CLI in parallel from another terminal if needed.
 - URL details page shows analysis for the URL, the article (if present), and each download (if present).


# Enable concurrent crawling with a bounded priority queue
node src/crawl.js https://www.theguardian.com --depth=1 --concurrency=4 --max-queue=20000

### CLI quick reference

- `--depth=N`           Max crawl depth (default: 2 via CLI)
- `--no-db`             Disable SQLite persistence (JSON only)
- `--db=PATH`           Custom SQLite DB path
- `--max-pages=N`       Limit number of network downloads
- `--max-age=30s|10m|2h|1d` Use cached articles if fresh within window
- `--concurrency=N`      Number of concurrent workers (default: 1)
- `--max-queue=N`        Max items in the bounded request queue (default: 10000)
 - Backfill publication dates: `npm run backfill:dates` (flags: `--redo`, `--limit=N`, `--batch-size=N`, `--no-list-existing`, `--include-nav`, `--url=...`)
 - Analyze domains (news-site heuristic): `npm run analyze:domains`
```

### Programmatic Usage

```javascript
const NewsCrawler = require('./src/crawl.js');

const crawler = new NewsCrawler('https://www.theguardian.com', {
  rateLimitMs: 2000,  // 2 seconds between requests
  maxDepth: 2,        // Maximum crawl depth
  dataDir: './data'   // Directory to save articles
});

crawler.crawl()
  .then(() => console.log('Crawling completed'))
  .catch(err => console.error('Crawling failed:', err));
```

## Configuration Options

- `rateLimitMs`: Delay between requests in milliseconds (default: 1000)
- `maxDepth`: Maximum depth to crawl (default: 3)
- `dataDir`: Directory to save crawled articles (default: './data')
- `enableDb`: Whether to persist to SQLite database (default: true)
- `dbPath`: Path to SQLite database file (default: './data/news.db')
- `maxDownloads` / `--max-pages`: Maximum number of pages to download over the network (default: unlimited)
- `maxAgeMs` / `--max-age`: Freshness window to reuse cached articles without downloading again. Accepts values like `30s`, `10m`, `2h`, `1d`. When provided, the crawler will check the SQLite DB first (if enabled), then JSON files to find a cached article and use it if `crawled_at`/`crawledAt` is within the window.

## Output Format

Articles are saved as JSON files in the data directory with the following structure:

```json
{
  "title": "Article Title",
  "date": "2024-01-15",
  "section": "world",
  "url": "https://example.com/article",
  "html": "Full HTML content of the article",
  "crawledAt": "2024-01-15T10:30:00.000Z"
}
```

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

- When `--max-age` is set, the crawler prefers cached articles (DB first, then JSON files) for pages that look like articles.
- If a cached copy is used, it will NOT update the SQLite record (no resave). The JSON file also won’t be rewritten.
- Freshness is determined from the article’s `crawledAt`/`crawled_at` timestamp.

### Concurrency, priority and backoff

When `--concurrency > 1`, the crawler switches to a bounded priority queue scheduler:

- A min-heap ranks requests favoring likely articles first, then shallower depth.
- The queue is bounded by `--max-queue`; new items are dropped if full.
- A global pacing token enforces `rateLimitMs` spacing across all workers.
- On retriable failures (HTTP 429 or 5xx, or network errors), items are re-queued with exponential backoff and jitter, respecting `Retry-After` when present, up to a small retry limit.
- For `--concurrency=1`, the original FIFO behavior is preserved.

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

This deletes all saved JSON articles and the SQLite database.

## Dependencies

- `cheerio`: Server-side jQuery implementation for HTML parsing
- `better-sqlite3`: Fast SQLite bindings used for local persistence and analysis
- `node-fetch`: HTTP client for making requests
- `robots-parser`: robots.txt parser for compliance checking
- `express`: GUI server

## Domain analysis (news-site heuristic)

The module `src/is_this_a_news_website.js` contains a simple heuristic to determine if a domain looks like a news site based on:

- Count of article-classified fetches
- Number of distinct article sections
- Ratio of article URLs with date patterns (/YYYY/MM/DD/)

The CLI tool `npm run analyze:domains` will compute metrics per domain, write a JSON analysis to the `domains` table, and tag domains with the `news` category when above a threshold.

## License

ISC