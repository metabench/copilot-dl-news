# Analysis Precursors System

## Overview

The **Analysis Precursors** stage is a preparatory layer that assembles all decision-relevant information **before** classification occurs. Unlike the full analysis pipeline which produces conclusions (article/nav/hub, category matches), the precursors stage only gathers, normalizes, and structures raw signals.

This separation provides:
- **Transparency**: See exactly what data feeds into decisions
- **Debugging**: Identify which signal caused a misclassification
- **Replayability**: Re-run classification with new rules on cached precursors
- **Testing**: Validate precursor extraction independently of decision logic

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         RAW INPUTS                                  │
│  URL · HTML · HTTP Response · Database Context                      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    PRECURSOR EXTRACTORS                             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│  │ URL Analyzer │ │Content Parse │ │ Meta Extract │ │ DB Context │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘ │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    PRECURSOR BUNDLE                                 │
│  Structured collection of all extracted signals                     │
│  (No decisions, just data)                                          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CLASSIFICATION LAYER                             │
│  DecisionTreeEngine · ArticleDetection · HubDetection               │
│  (Consumes precursors, produces conclusions)                        │
└─────────────────────────────────────────────────────────────────────┘
```

## Precursor Categories

### 1. URL Precursors

Signals extracted purely from the URL string.

```javascript
{
  url: {
    raw: "https://example.com/news/series/climate-deep-dive?ref=home",
    normalized: "https://example.com/news/series/climate-deep-dive",
    
    // Structural analysis
    host: "example.com",
    domain: "example.com",
    subdomain: null,
    path: "/news/series/climate-deep-dive",
    pathSegments: ["news", "series", "climate-deep-dive"],
    pathDepth: 3,
    
    // Query analysis
    hasQuery: true,
    queryParams: { ref: "home" },
    queryClassification: "tracking",  // tracking|essential|mixed
    
    // Pattern detection
    patterns: {
      hasDateSegment: false,
      hasNumericId: false,
      hasSlugPattern: true,        // "climate-deep-dive" looks like slug
      hasSeriesIndicator: true,    // "series" segment
      hasListIndicator: false,
      hasCategorySegment: true,    // "news" is category-like
      hasPaginationParam: false,
      hasSearchParam: false
    },
    
    // Keyword presence
    keywords: {
      article: ["news"],
      hub: [],
      list: [],
      series: ["series"]
    }
  }
}
```

### 2. Content Precursors

Signals extracted from HTML content analysis.

```javascript
{
  content: {
    // Text metrics
    text: {
      wordCount: 4500,
      characterCount: 28000,
      paragraphCount: 24,
      sentenceCount: 180,
      avgWordsPerParagraph: 187,
      avgWordsPerSentence: 25
    },
    
    // Structure metrics
    structure: {
      headingCount: { h1: 1, h2: 5, h3: 8, h4: 2 },
      linkCount: 45,
      imageCount: 8,
      listCount: 3,
      tableCount: 0,
      blockquoteCount: 2
    },
    
    // Computed ratios
    ratios: {
      linkDensity: 0.02,          // links / words
      headingDensity: 0.004,      // headings / words
      imageDensity: 0.002,        // images / words
      textToHtmlRatio: 0.35       // text bytes / html bytes
    },
    
    // Readability extraction
    readability: {
      extracted: true,
      title: "Climate Crisis: A Deep Dive Analysis",
      excerpt: "A comprehensive multi-part investigation...",
      byline: "Jane Smith",
      siteName: "Example News",
      length: 4500,
      lang: "en"
    }
  }
}
```

### 3. Metadata Precursors

Signals from HTML meta tags and structured data.

```javascript
{
  metadata: {
    // Basic meta
    basic: {
      title: "Climate Crisis: A Deep Dive Analysis | Example News",
      description: "A comprehensive multi-part investigation into...",
      author: "Jane Smith",
      publishedTime: "2025-11-15T10:00:00Z",
      modifiedTime: "2025-11-20T14:30:00Z",
      section: "Environment",
      keywords: ["climate", "environment", "investigation"]
    },
    
    // Open Graph
    openGraph: {
      type: "article",
      title: "Climate Crisis: A Deep Dive Analysis",
      description: "A comprehensive multi-part investigation...",
      image: "https://example.com/images/climate-hero.jpg",
      siteName: "Example News",
      locale: "en_US"
    },
    
    // Twitter Card
    twitterCard: {
      card: "summary_large_image",
      site: "@examplenews",
      creator: "@janesmith"
    },
    
    // Schema.org / JSON-LD
    schema: {
      hasStructuredData: true,
      types: ["NewsArticle", "WebPage"],
      hasArticleType: true,
      hasArticleBody: true,
      hasAuthor: true,
      hasDatePublished: true,
      score: 7.5,           // Computed schema quality score
      strength: "strong"    // weak|medium|strong
    },
    
    // Canonical & alternates
    canonical: {
      url: "https://example.com/news/series/climate-deep-dive",
      isCanonical: true,    // Current URL matches canonical
      hasAmpVersion: true,
      hasMobileVersion: false
    }
  }
}
```

### 4. Link Precursors

Signals from link analysis within the page.

```javascript
{
  links: {
    // Counts
    counts: {
      total: 145,
      internal: 120,
      external: 25,
      navigation: 45,
      article: 35,
      social: 8,
      utility: 12,
      unknown: 45
    },
    
    // Link classification breakdown
    classification: {
      navLinks: 45,           // Header, footer, sidebar nav
      articleLinks: 35,       // Links to other articles
      relatedLinks: 12,       // "Related articles" section
      paginationLinks: 0,     // Next/prev page
      categoryLinks: 8,       // Links to category pages
      authorLinks: 2,         // Links to author pages
      tagLinks: 15            // Links to tag pages
    },
    
    // Pattern detection
    patterns: {
      hasHubLikeStructure: false,    // Many article links in list
      hasPagination: false,
      hasInfiniteScroll: false,
      hasLoadMore: false
    }
  }
}
```

### 5. Database Context Precursors

Historical and contextual signals from database.

```javascript
{
  context: {
    // Domain statistics
    domain: {
      host: "example.com",
      avgWordCount: 1200,
      medianWordCount: 850,
      totalUrls: 15000,
      articleCount: 12000,
      navCount: 3000,
      categories: ["news", "opinion", "sports"]
    },
    
    // Section statistics (if section known)
    section: {
      name: "Environment",
      avgWordCount: 2500,      // Higher for investigative
      medianWordCount: 1800,
      urlCount: 450
    },
    
    // URL history
    history: {
      previouslyCrawled: true,
      previousClassification: "article",
      fetchCount: 3,
      lastFetched: "2025-11-20T14:30:00Z"
    },
    
    // Sibling analysis
    siblings: {
      sameSection: 45,
      avgWordCount: 2200,
      commonPatterns: ["series", "investigation"]
    }
  }
}
```

### 6. HTTP Response Precursors

Signals from the HTTP response itself.

```javascript
{
  http: {
    status: 200,
    contentType: "text/html",
    contentLength: 85000,
    
    // Timing
    timing: {
      ttfb: 245,              // Time to first byte (ms)
      downloadTime: 380       // Total download time (ms)
    },
    
    // Headers of interest
    headers: {
      cacheControl: "max-age=3600",
      lastModified: "2025-11-20T14:30:00Z",
      etag: '"abc123"',
      xRobotTag: null,
      contentLanguage: "en"
    },
    
    // Redirect chain
    redirects: {
      count: 0,
      chain: []
    }
  }
}
```

## Complete Precursor Bundle

```javascript
/**
 * @typedef {Object} PrecursorBundle
 * @property {string} version - Precursor schema version
 * @property {string} extractedAt - ISO timestamp
 * @property {UrlPrecursors} url
 * @property {ContentPrecursors} content
 * @property {MetadataPrecursors} metadata
 * @property {LinkPrecursors} links
 * @property {ContextPrecursors} context
 * @property {HttpPrecursors} http
 * @property {ExtractionMeta} _meta - Extraction metadata
 */

const bundle = {
  version: "1.0.0",
  extractedAt: "2025-11-27T10:30:00Z",
  
  url: { /* ... */ },
  content: { /* ... */ },
  metadata: { /* ... */ },
  links: { /* ... */ },
  context: { /* ... */ },
  http: { /* ... */ },
  
  _meta: {
    extractionTimeMs: 45,
    extractorsRun: ["url", "content", "metadata", "links", "context", "http"],
    warnings: [],
    errors: []
  }
};
```

## Implementation

### File Structure

```
src/analysis/precursors/
├── index.js                    # Main exports
├── PrecursorExtractor.js       # Orchestrator class
├── extractors/
│   ├── UrlExtractor.js         # URL signal extraction
│   ├── ContentExtractor.js     # HTML content extraction
│   ├── MetadataExtractor.js    # Meta tag extraction
│   ├── LinkExtractor.js        # Link analysis
│   ├── ContextExtractor.js     # Database context
│   └── HttpExtractor.js        # HTTP response extraction
├── normalizers/
│   ├── UrlNormalizer.js        # URL normalization
│   └── TextNormalizer.js       # Text cleaning
├── __tests__/
│   ├── PrecursorExtractor.test.js
│   ├── UrlExtractor.test.js
│   └── ...
└── schemas/
    └── precursor-bundle.schema.json
```

### Core API

```javascript
const { PrecursorExtractor } = require('./analysis/precursors');

// Create extractor
const extractor = new PrecursorExtractor({
  db,                           // Optional: for context extraction
  extractors: ['url', 'content', 'metadata', 'links']  // Optional: subset
});

// Extract precursors
const bundle = await extractor.extract({
  url: 'https://example.com/news/series/climate-deep-dive',
  html: '<html>...</html>',
  httpResponse: { status: 200, headers: {...} }
});

// Precursors are now available for any classifier
const { DecisionTreeEngine } = require('./analysis/decisionTreeEngine');
const engine = DecisionTreeEngine.loadPageCategories();

// Convert bundle to decision tree context
const context = extractor.toDecisionContext(bundle);
const results = engine.evaluateAll(context);
```

### Extractor Interface

```javascript
/**
 * Base interface for all extractors
 */
class BaseExtractor {
  /**
   * Extract signals from inputs
   * @param {Object} inputs - Raw inputs (url, html, etc.)
   * @returns {Object} Extracted signals
   */
  extract(inputs) {
    throw new Error('Not implemented');
  }
  
  /**
   * Get extractor name
   * @returns {string}
   */
  get name() {
    throw new Error('Not implemented');
  }
  
  /**
   * Get schema for this extractor's output
   * @returns {Object} JSON Schema
   */
  get schema() {
    return null;
  }
}
```

### URL Extractor Example

```javascript
class UrlExtractor extends BaseExtractor {
  get name() { return 'url'; }
  
  extract({ url }) {
    if (!url) return null;
    
    const parsed = new URL(url);
    const pathSegments = parsed.pathname.split('/').filter(Boolean);
    
    return {
      raw: url,
      normalized: this._normalize(url),
      host: parsed.host,
      domain: this._extractDomain(parsed.host),
      subdomain: this._extractSubdomain(parsed.host),
      path: parsed.pathname,
      pathSegments,
      pathDepth: pathSegments.length,
      hasQuery: parsed.search.length > 1,
      queryParams: Object.fromEntries(parsed.searchParams),
      queryClassification: this._classifyQuery(parsed.searchParams),
      patterns: this._detectPatterns(parsed),
      keywords: this._extractKeywords(pathSegments)
    };
  }
  
  _detectPatterns(parsed) {
    const path = parsed.pathname.toLowerCase();
    const segments = path.split('/').filter(Boolean);
    
    return {
      hasDateSegment: /\/\d{4}\/\d{2}\//.test(path),
      hasNumericId: /\/\d{5,}(\/|$)/.test(path),
      hasSlugPattern: segments.some(s => /^[a-z]+-[a-z]+-/.test(s)),
      hasSeriesIndicator: segments.includes('series'),
      hasListIndicator: segments.some(s => /^(top|best|list|\d+-)/i.test(s)),
      hasCategorySegment: segments.length > 1 && segments[0].length < 20,
      hasPaginationParam: parsed.searchParams.has('page'),
      hasSearchParam: parsed.searchParams.has('q') || parsed.searchParams.has('search')
    };
  }
  
  _extractKeywords(segments) {
    const keywords = { article: [], hub: [], list: [], series: [] };
    
    const articleTerms = ['article', 'story', 'news', 'post', 'blog'];
    const hubTerms = ['category', 'section', 'topic', 'tag', 'archive'];
    const listTerms = ['list', 'top', 'best', 'ranking', 'roundup'];
    const seriesTerms = ['series', 'part', 'episode', 'chapter'];
    
    for (const seg of segments) {
      const lower = seg.toLowerCase();
      if (articleTerms.some(t => lower.includes(t))) keywords.article.push(seg);
      if (hubTerms.some(t => lower.includes(t))) keywords.hub.push(seg);
      if (listTerms.some(t => lower.includes(t))) keywords.list.push(seg);
      if (seriesTerms.some(t => lower.includes(t))) keywords.series.push(seg);
    }
    
    return keywords;
  }
}
```

## Integration with Decision Trees

The precursor bundle maps to `EvaluationContext` for the decision tree engine:

```javascript
class PrecursorExtractor {
  /**
   * Convert precursor bundle to decision tree context
   */
  toDecisionContext(bundle) {
    return {
      // From URL precursors
      url: bundle.url.raw,
      
      // From content precursors
      word_count: bundle.content?.text?.wordCount ?? null,
      link_density: bundle.content?.ratios?.linkDensity ?? null,
      paragraph_count: bundle.content?.text?.paragraphCount ?? null,
      
      // From metadata precursors
      title: bundle.metadata?.basic?.title ?? null,
      description: bundle.metadata?.basic?.description ?? null,
      has_author: !!bundle.metadata?.basic?.author,
      has_date: !!bundle.metadata?.basic?.publishedTime,
      og_type: bundle.metadata?.openGraph?.type ?? null,
      schema_score: bundle.metadata?.schema?.score ?? null,
      
      // From link precursors
      nav_links_count: bundle.links?.counts?.navigation ?? null,
      article_links_count: bundle.links?.classification?.articleLinks ?? null,
      
      // From context precursors
      domain_avg_word_count: bundle.context?.domain?.avgWordCount ?? null,
      section_avg_word_count: bundle.context?.section?.avgWordCount ?? null,
      previous_classification: bundle.context?.history?.previousClassification ?? null
    };
  }
}
```

## Storage

### Database Schema

```sql
-- Precursor bundles stored as JSON blobs
CREATE TABLE IF NOT EXISTS precursor_bundles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url_id INTEGER NOT NULL REFERENCES urls(id),
  content_id INTEGER REFERENCES content_storage(id),
  
  version TEXT NOT NULL,
  extracted_at TEXT NOT NULL,
  
  -- Individual precursor sections (nullable, allow partial extraction)
  url_precursors TEXT,        -- JSON
  content_precursors TEXT,    -- JSON
  metadata_precursors TEXT,   -- JSON
  link_precursors TEXT,       -- JSON
  context_precursors TEXT,    -- JSON
  http_precursors TEXT,       -- JSON
  
  -- Extraction metadata
  extraction_time_ms INTEGER,
  warnings TEXT,              -- JSON array
  errors TEXT,                -- JSON array
  
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_precursor_bundles_url_id ON precursor_bundles(url_id);
CREATE INDEX idx_precursor_bundles_extracted_at ON precursor_bundles(extracted_at);
```

### Compact Storage

For high-volume scenarios, use a flattened format:

```javascript
class PrecursorBundle {
  /**
   * Compress bundle for storage
   */
  static toCompact(bundle) {
    return {
      v: bundle.version,
      t: bundle.extractedAt,
      u: bundle.url ? {
        p: bundle.url.path,
        d: bundle.url.pathDepth,
        q: bundle.url.hasQuery ? 1 : 0,
        pt: this._encodePatterns(bundle.url.patterns)
      } : null,
      c: bundle.content ? {
        w: bundle.content.text?.wordCount,
        p: bundle.content.text?.paragraphCount,
        ld: Math.round((bundle.content.ratios?.linkDensity ?? 0) * 1000)
      } : null,
      m: bundle.metadata ? {
        ss: Math.round(bundle.metadata.schema?.score ?? 0),
        ha: bundle.metadata.basic?.author ? 1 : 0,
        hd: bundle.metadata.basic?.publishedTime ? 1 : 0,
        og: bundle.metadata.openGraph?.type?.charAt(0)
      } : null
    };
  }
  
  static fromCompact(compact) {
    // Expand back to full structure
  }
}
```

## Testing

### Unit Tests

```javascript
describe('UrlExtractor', () => {
  const extractor = new UrlExtractor();
  
  it('detects series indicator in URL', () => {
    const result = extractor.extract({
      url: 'https://example.com/news/series/climate-analysis'
    });
    
    expect(result.patterns.hasSeriesIndicator).toBe(true);
    expect(result.pathSegments).toEqual(['news', 'series', 'climate-analysis']);
  });
  
  it('classifies tracking query parameters', () => {
    const result = extractor.extract({
      url: 'https://example.com/article?utm_source=twitter&ref=home'
    });
    
    expect(result.queryClassification).toBe('tracking');
  });
});

describe('ContentExtractor', () => {
  const extractor = new ContentExtractor();
  
  it('computes link density correctly', () => {
    const html = `
      <article>
        <p>This is a test paragraph with some words.</p>
        <p>Another paragraph with <a href="#">one link</a>.</p>
      </article>
    `;
    
    const result = extractor.extract({ html });
    
    expect(result.text.wordCount).toBeGreaterThan(0);
    expect(result.ratios.linkDensity).toBeLessThan(0.1);
  });
});
```

### Integration Tests

```javascript
describe('PrecursorExtractor integration', () => {
  it('extracts complete bundle from real page', async () => {
    const html = fs.readFileSync('fixtures/sample-article.html', 'utf8');
    const extractor = new PrecursorExtractor();
    
    const bundle = await extractor.extract({
      url: 'https://example.com/news/article',
      html
    });
    
    expect(bundle.url).toBeDefined();
    expect(bundle.content).toBeDefined();
    expect(bundle.metadata).toBeDefined();
    expect(bundle._meta.errors).toHaveLength(0);
  });
  
  it('produces valid decision context', async () => {
    const bundle = await extractor.extract({ url, html });
    const context = extractor.toDecisionContext(bundle);
    
    const engine = DecisionTreeEngine.loadPageCategories();
    expect(() => engine.evaluateAll(context)).not.toThrow();
  });
});
```

## Development Phases

### Phase 1: Core Extractors (Week 1)
- [ ] `UrlExtractor` - URL pattern detection
- [ ] `ContentExtractor` - Text/structure metrics
- [ ] `MetadataExtractor` - Meta tags and schema.org
- [ ] `PrecursorExtractor` orchestrator
- [ ] Unit tests for each extractor

### Phase 2: Integration (Week 2)
- [ ] `LinkExtractor` - Link classification
- [ ] `ContextExtractor` - Database context
- [ ] `HttpExtractor` - Response metadata
- [ ] Integration with existing `page-analyzer.js`
- [ ] `toDecisionContext()` mapping

### Phase 3: Storage & Tooling (Week 3)
- [ ] Database schema for precursor storage
- [ ] Compact serialization format
- [ ] CLI tool: `npm run precursors:extract <url>`
- [ ] Integration with Decision Tree Studio

### Phase 4: Migration (Week 4)
- [ ] Refactor `buildAnalysis()` to use precursors
- [ ] Update `evaluateArticleCandidate()` to consume precursors
- [ ] Performance benchmarks
- [ ] Documentation

## Success Metrics

| Metric | Target |
|--------|--------|
| Extraction time | < 50ms per page |
| Bundle size (JSON) | < 5KB typical |
| Bundle size (compact) | < 1KB typical |
| Coverage | 100% of decision tree fields |
| Test coverage | > 90% |

## Future Extensions

- **Incremental extraction**: Only re-extract changed sections
- **Streaming extraction**: Process HTML in chunks
- **ML features**: Pre-compute embeddings for text
- **Caching**: LRU cache for repeated extractions
- **Batch extraction**: Parallel extraction for multiple URLs
