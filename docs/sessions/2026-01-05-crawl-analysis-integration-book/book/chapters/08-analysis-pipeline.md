# Chapter 8: Analysis Pipeline

> **Implementation Status**: ✅ Core pipeline implemented. XPath patterns available for major domains.

## Codebase Quick Reference

| Component | File Location | Status |
|-----------|---------------|--------|
| Core analysis | `src/modules/analyse-pages-core.js` | ✅ Complete |
| HTML extractor | `src/utils/HtmlArticleExtractor.js` | ✅ Complete |
| XPath analyzer | `src/utils/ArticleXPathAnalyzer.js` | ✅ Complete |
| Place extraction | `src/analysis/place-extraction.js` | ✅ 954 lines |
| Fact definitions | `src/facts/` | ✅ Modular |
| Compression utils | `src/utils/compression.js` | ✅ Zstd |
| Topics module | `src/analysis/topics.js` | ✅ Complete |

## Purpose

The analysis pipeline transforms raw HTML into structured, searchable data:

1. **Extract** readable text from HTML
2. **Classify** content (categories, topics)
3. **Extract facts** (boolean attributes)
4. **Detect places** mentioned in text
5. **Version** results for incremental updates

---

## Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ANALYSIS ORCHESTRATION                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────┐                                               │
│  │  analyse-pages-core │  ◀──── Entry point for batch analysis         │
│  └──────────┬──────────┘                                               │
│             │                                                           │
│             ▼                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      Per-Page Analysis Loop                       │  │
│  │                                                                   │  │
│  │   ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────┐ │  │
│  │   │ Decompress │──▶│  Extract   │──▶│  Classify  │──▶│  Facts │ │  │
│  │   │    HTML    │   │   Text     │   │  Content   │   │Extract │ │  │
│  │   └────────────┘   └────────────┘   └────────────┘   └────────┘ │  │
│  │         │                │                │               │      │  │
│  │         │                ▼                │               │      │  │
│  │         │         ┌────────────┐          │               │      │  │
│  │         │         │   Place    │          │               │      │  │
│  │         │         │ Detection  │          │               │      │  │
│  │         │         └────────────┘          │               │      │  │
│  │         │                │                │               │      │  │
│  │         └────────────────┴────────────────┴───────────────┘      │  │
│  │                                   │                               │  │
│  └───────────────────────────────────┼───────────────────────────────┘  │
│                                      ▼                                  │
│                             ┌──────────────┐                           │
│                             │   Database   │                           │
│                             │    Writes    │                           │
│                             └──────────────┘                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Multi-Modal Integration

The multi-modal crawl orchestrator consumes this pipeline through the **analysis observable**
(`labs/analysis-observable/analysis-observable.js`) so it can stream `analysis-progress` events
and trigger re-analysis when patterns improve. Pending analysis counts and re-analysis candidates
are resolved via db adapter queries (`src/db/sqlite/v1/queries/multiModalCrawl.js`) to keep SQL
out of orchestration code.

---

## Stage 1: Decompression

### Reading from Cache

```javascript
async function decompressContent(url) {
  const cached = await db.query(
    'SELECT compressed_html, compress_algo FROM content_cache WHERE url = ?',
    [url]
  );
  
  if (!cached) return null;
  
  if (cached.compress_algo === 'zstd') {
    return zstd.decompress(cached.compressed_html);
  }
  
  return cached.compressed_html;
}
```

### Compression Stats

| Metric | Typical Value |
|--------|---------------|
| Original HTML | 200-800 KB |
| Compressed | 30-100 KB |
| Ratio | 5-10x |
| Decompress time | 2-10 ms |

---

## Stage 2: Text Extraction

### The Two-Path Strategy

```
                    ┌─────────────────────┐
                    │   Extraction Path   │
                    │      Decision       │
                    └──────────┬──────────┘
                               │
          ┌────────────────────┴────────────────────┐
          │                                         │
          ▼                                         ▼
┌─────────────────────┐               ┌─────────────────────┐
│   XPath Fast Path   │               │   JSDOM Slow Path   │
│                     │               │                     │
│ • Cached pattern    │               │ • Full DOM parse    │
│ • Direct extraction │               │ • Readability lib   │
│ • 50-200ms          │               │ • 10-30 seconds     │
└─────────────────────┘               └─────────────────────┘
```

### XPath Pattern Cache

Domains with known content selectors:

```javascript
const xpathPatterns = {
  'bbc.com': {
    title: '//h1[@id="main-heading"]',
    body: '//article//div[contains(@class, "article__body")]',
    author: '//div[contains(@class, "byline")]//a',
    date: '//time/@datetime'
  },
  'theguardian.com': {
    title: '//h1',
    body: '//div[@id="maincontent"]',
    author: '//a[@rel="author"]',
    date: '//meta[@property="article:published_time"]/@content'
  }
  // ... more domains
};
```

### Extraction Decision

```javascript
async function extractArticle(html, url) {
  const domain = new URL(url).hostname.replace('www.', '');
  const pattern = xpathPatterns[domain];
  
  if (pattern) {
    // Fast path: XPath
    const result = await xpathExtract(html, pattern);
    if (result.body && result.body.length > 100) {
      return { ...result, method: 'xpath' };
    }
  }
  
  // Slow path: JSDOM + Readability
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  
  return {
    title: article.title,
    body: article.textContent,
    author: article.byline,
    method: 'readability'
  };
}
```

### Performance Impact

| Method | Time | When Used |
|--------|------|-----------|
| XPath | 50-200ms | Pattern cached |
| Readability | 10-30s | No pattern / fallback |

**Optimization Priority:** Add XPath patterns for high-volume domains.

---

## Stage 3: Classification

### Category Assignment

```javascript
const categoryKeywords = {
  politics: ['election', 'parliament', 'minister', 'government', 'vote'],
  business: ['market', 'stock', 'economy', 'company', 'revenue'],
  sport: ['football', 'match', 'championship', 'score', 'team'],
  technology: ['software', 'app', 'digital', 'computer', 'startup'],
  health: ['hospital', 'doctor', 'disease', 'treatment', 'medicine']
};

function classifyArticle(text) {
  const words = text.toLowerCase().split(/\s+/);
  const scores = {};
  
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    scores[category] = keywords.filter(kw => words.includes(kw)).length;
  }
  
  const sorted = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .filter(([_, score]) => score > 0);
  
  return sorted.slice(0, 3).map(([cat]) => cat);
}
```

### Topic Extraction

```javascript
function extractTopics(text, maxTopics = 5) {
  // Named entity recognition for topics
  const entities = extractNamedEntities(text);
  
  // Filter to significant entities
  const topics = entities
    .filter(e => e.type === 'TOPIC' || e.type === 'ORG' || e.type === 'EVENT')
    .filter(e => e.confidence > 0.7)
    .slice(0, maxTopics)
    .map(e => e.text);
  
  return topics;
}
```

---

## Stage 4: Fact Extraction

### Boolean Facts

Facts are yes/no properties extracted from content:

```javascript
const factExtractors = {
  has_byline: (article) => {
    return article.author && article.author.length > 0;
  },
  
  has_dateline: (article) => {
    return /^[A-Z]{2,}[\s,]/.test(article.body);
  },
  
  is_opinion: (article) => {
    const markers = ['opinion', 'comment', 'editorial', 'view'];
    return markers.some(m => 
      article.title.toLowerCase().includes(m) ||
      article.url.toLowerCase().includes(m)
    );
  },
  
  is_breaking: (article) => {
    const markers = ['breaking', 'just in', 'developing'];
    return markers.some(m => 
      article.title.toLowerCase().includes(m)
    );
  },
  
  mentions_uk: (article) => {
    const ukTerms = ['uk', 'britain', 'british', 'england', 'scotland', 'wales'];
    const text = (article.title + ' ' + article.body).toLowerCase();
    return ukTerms.some(t => text.includes(t));
  }
};

function extractFacts(article) {
  const facts = [];
  
  for (const [factType, extractor] of Object.entries(factExtractors)) {
    const value = extractor(article);
    facts.push({
      fact_type: factType,
      fact_value: value ? 1 : 0,
      confidence: 0.9
    });
  }
  
  return facts;
}
```

### Database Storage

```sql
INSERT INTO article_facts (url, fact_type, fact_value, confidence)
VALUES 
  ('https://example.com/article1', 'has_byline', 1, 0.9),
  ('https://example.com/article1', 'is_opinion', 0, 0.9),
  ('https://example.com/article1', 'mentions_uk', 1, 0.9)
ON CONFLICT (url, fact_type) DO UPDATE SET 
  fact_value = excluded.fact_value,
  confidence = excluded.confidence;
```

---

## Stage 5: Place Detection

### Named Entity Recognition

```javascript
function detectPlaces(text) {
  const mentions = [];
  
  // Gazetteer lookup
  const gazetteerMatches = matchGazetteer(text);
  mentions.push(...gazetteerMatches);
  
  // Pattern-based detection
  const patternMatches = matchPlacePatterns(text);
  mentions.push(...patternMatches);
  
  // Deduplicate overlapping mentions
  return deduplicateMentions(mentions);
}

function matchGazetteer(text) {
  const results = [];
  
  // Get all place names from gazetteer
  const placeNames = await db.query(
    'SELECT name, place_id FROM gazetteer ORDER BY length(name) DESC'
  );
  
  for (const { name, place_id } of placeNames) {
    const regex = new RegExp(`\\b${escapeRegex(name)}\\b`, 'gi');
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      results.push({
        mention_text: match[0],
        start_offset: match.index,
        end_offset: match.index + match[0].length,
        context_snippet: text.slice(
          Math.max(0, match.index - 50),
          Math.min(text.length, match.index + match[0].length + 50)
        ),
        detection_method: 'gazetteer',
        candidate_place_id: place_id
      });
    }
  }
  
  return results;
}
```

---

## Version Tracking

### Analysis Versions

Each analysis run targets a version number:

```javascript
const CURRENT_ANALYSIS_VERSION = 1022;

async function needsAnalysis(url) {
  const result = await db.query(
    'SELECT analysis_version FROM content_analysis WHERE url = ?',
    [url]
  );
  
  if (!result) return true;  // Never analyzed
  return result.analysis_version < CURRENT_ANALYSIS_VERSION;
}
```

### Incremental Updates

```sql
-- Find pages needing re-analysis
SELECT a.url
FROM articles a
LEFT JOIN content_analysis ca ON a.url = ca.url
WHERE ca.analysis_version IS NULL 
   OR ca.analysis_version < 1022;

-- Update with new version
INSERT INTO content_analysis (url, analysis_version, word_count, ...)
VALUES (?, 1022, ?, ...)
ON CONFLICT (url) DO UPDATE SET
  analysis_version = excluded.analysis_version,
  word_count = excluded.word_count,
  analyzed_at = datetime('now');
```

### Version Bumping

When to bump the version:

| Change | Bump? | Reason |
|--------|-------|--------|
| New fact type added | Yes | Need to extract new fact |
| Classification improved | Yes | Want better categories |
| Bug fix in extractor | Yes | Re-extract with fix |
| Performance optimization | No | Same results, faster |

---

## Observable Wrapper

### labs/analysis-observable

Wraps the core pipeline with progress streaming:

```javascript
// run-lab.js
const { Observable } = require('rxjs');

function createAnalysisObservable(options) {
  return new Observable(subscriber => {
    const startTime = Date.now();
    let processed = 0;
    
    async function* analyzePages() {
      const pages = await getPendingPages(options.analysisVersion);
      const total = pages.length;
      
      for (const page of pages) {
        const result = await analyzePage(page);
        processed++;
        
        subscriber.next({
          type: 'progress',
          current: processed,
          total,
          page: result,
          elapsed: Date.now() - startTime
        });
        
        yield result;
      }
    }
    
    // Run the analysis
    (async () => {
      try {
        for await (const result of analyzePages()) {
          // Results streamed via subscriber.next()
        }
        subscriber.complete();
      } catch (error) {
        subscriber.error(error);
      }
    })();
  });
}
```

### SSE Progress Streaming

```javascript
app.get('/progress', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  
  const observable = createAnalysisObservable({
    analysisVersion: 1022,
    limit: req.query.limit
  });
  
  const subscription = observable.subscribe({
    next: (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    },
    complete: () => {
      res.write('data: {"type":"complete"}\n\n');
      res.end();
    },
    error: (err) => {
      res.write(`data: {"type":"error","message":"${err.message}"}\n\n`);
      res.end();
    }
  });
  
  req.on('close', () => {
    subscription.unsubscribe();
  });
});
```

---

## Timing Breakdown

### Per-Page Metrics

```javascript
const timings = {
  decompression: { jsdomMs: 0, xpathMs: 0 },
  extraction: { readabilityMs: 0, textCleanMs: 0 },
  classification: { categoryMs: 0, topicMs: 0 },
  facts: { extractMs: 0 },
  places: { detectMs: 0 },
  database: { writeMs: 0 }
};

// Emit with progress
subscriber.next({
  type: 'progress',
  timings: { ...timings },
  averages: calculateAverages(allTimings)
});
```

### Bottleneck Detection

```javascript
function detectBottleneck(timings) {
  const avg = timings.averages;
  
  if (avg.extraction.jsdomMs > 5000) {
    return {
      component: 'jsdom',
      severity: 'high',
      suggestion: 'Add XPath pattern for this domain'
    };
  }
  
  if (avg.database.writeMs > 100) {
    return {
      component: 'database',
      severity: 'medium',
      suggestion: 'Check index on content_analysis'
    };
  }
  
  return null;
}
```

---

## Next Chapter

[Chapter 9: The Analysis Observable →](09-analysis-observable.md)
