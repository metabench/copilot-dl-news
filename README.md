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
- **Data Persistence**: Saves articles as JSON files with HTML content and metadata

## Installation

```bash
npm install
```

## Usage

### Command Line Interface

```bash
# Crawl The Guardian (default)
node src/crawl.js

# Crawl a specific URL
node src/crawl.js https://www.theguardian.com

# Crawl any news website
node src/crawl.js https://example-news-site.com
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

## Dependencies

- `cheerio`: Server-side jQuery implementation for HTML parsing
- `node-fetch`: HTTP client for making requests
- `robots-parser`: robots.txt parser for compliance checking

## License

ISC