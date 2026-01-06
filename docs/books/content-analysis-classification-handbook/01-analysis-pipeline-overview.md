# Chapter 1: Analysis Pipeline Overview

## Introduction

The analysis pipeline transforms raw HTML into structured findings about articles and places. It orchestrates five phases with performance tracking.

**File:** [src/analysis/page-analyzer.js](../../../src/analysis/page-analyzer.js)

## Pipeline Phases

### Phase 1: Context Inference (~5ms)

Extracts context from URL and domain:

```javascript
const context = inferContext(url, options);
// Returns: { tld, domainLocale, segments, section }
```

**Outputs:**
- `tld` - Top-level domain (e.g., 'com', 'co.uk')
- `domainLocale` - Domain's primary country (from database)
- `segments` - URL path segments
- `section` - First path segment (e.g., 'world', 'sport')

### Phase 2: Content Preparation (~100-500ms)

Extracts article text using XPath or Readability:

```javascript
const preparation = await prepareArticleContent({
  url, html, existing, xpathService, logger
});
// Returns: { text, wordCount, extraction, xpathLearned }
```

**Extraction Methods:**
1. **XPath-based** - Uses learned patterns for the domain
2. **Readability** - Mozilla's algorithm as fallback

**Performance Note:** This is the slowest phase due to DOM parsing.

### Phase 3: Analysis Building (~20-50ms)

Runs gazetteer matching and builds detection records:

```javascript
const analysis = buildAnalysis({
  url, context, preparation, gazetteer, options
});
// Returns: { findings, meta, signals }
```

**Detection Sources:**
- URL segments → `source: 'url'`
- Article text → `source: 'text'`
- Title → `source: 'title'`

### Phase 4: Hub Detection (~10-30ms)

Classifies page as hub, article, or navigation:

```javascript
const hubCandidate = detectPlaceHub({
  url, analysis, signals
});
// Returns: { isHub, hubType, confidence, placeChain }
```

### Phase 5: Deep Analysis (~5-20ms)

Performs sentiment analysis and key phrase extraction:

```javascript
const deepAnalysis = performDeepAnalysis({
  text: preparation.text,
  title: article.title
});
// Returns: { sentiment, keyPhrases, entities }
```

## Result Structure

```javascript
{
  // Main findings
  analysis: {
    findings: {
      places: [...],           // Place detections
      topics: [...],           // Topic tokens
      classification: 'article'
    },
    meta: {
      urlPlaceAnalysis: {...}, // URL segment analysis
      preparation: {...},       // Extraction metadata
      articleEvaluation: {...}  // Classification signals
    },
    signals: {...}             // Numeric signals
  },

  // Extracted places (deduplicated)
  places: [
    {
      place: 'United Kingdom',
      place_kind: 'country',
      method: 'gazetteer',
      source: 'text',
      offset_start: 150,
      offset_end: 164,
      country_code: 'GB',
      place_id: 12345
    }
  ],

  // Hub classification
  hubCandidate: {
    isHub: false,
    hubType: null,
    confidence: 0.85,
    placeChain: ['world', 'uk']
  },

  // Deep analysis results
  deepAnalysis: {
    sentiment: 'neutral',
    keyPhrases: ['climate change', 'government policy'],
    entities: []
  },

  // Performance metrics
  timings: {
    contextInference: 5,
    contentPreparation: 250,
    analysisBuilding: 35,
    hubDetection: 15,
    deepAnalysis: 10,
    total: 315
  }
}
```

## Content Preparation Details

### XPath Extraction (Lines 339-372)

```javascript
async function extractWithXPath(html, domain, xpathService) {
  // Get existing patterns for domain
  const patterns = await xpathService.getPatternsForDomain(domain);

  if (patterns.length > 0) {
    // Try each pattern
    for (const pattern of patterns) {
      const result = extractWithPattern(html, pattern.xpath);
      if (result.text && result.wordCount >= 100) {
        await xpathService.recordUsage(domain, pattern.xpath);
        return result;
      }
    }
  }

  // Learn new pattern
  const newPattern = await learnXPathPattern(html);
  if (newPattern) {
    await xpathService.upsertPattern(domain, newPattern);
    return extractWithPattern(html, newPattern);
  }

  return null;
}
```

### Readability Fallback (Lines 374-413)

```javascript
function extractWithReadability(html, url) {
  // Parse HTML to DOM
  const dom = new JSDOM(html, { url });

  // Run Readability
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article) return null;

  return {
    text: article.textContent,
    title: article.title,
    excerpt: article.excerpt,
    wordCount: countWords(article.textContent)
  };
}
```

## Analysis Building Details

### URL Place Analysis (Lines 171-185)

```javascript
const urlAnalysis = extractPlacesFromUrl(url, {
  slugMap: gazetteer.slugMap,
  placeIndex: gazetteer.placeIndex,
  hierarchy: gazetteer.hierarchy
});

// Returns:
{
  bestChain: [
    { place: 'World', score: 0.9 },
    { place: 'United Kingdom', score: 0.95 }
  ],
  allChains: [...],
  topicTokens: ['politics', 'elections']
}
```

### Text Place Detection (Lines 194-222)

```javascript
const textPlaces = extractGazetteerPlacesFromText(
  preparation.text,
  gazetteer.nameMap,
  {
    context,
    maxMatches: 50
  }
);

// Returns:
[
  {
    place: 'London',
    place_kind: 'city',
    offset_start: 45,
    offset_end: 51,
    country_code: 'GB',
    place_id: 67890
  }
]
```

## Performance Tracking

```javascript
const timings = {};

const startPhase = (name) => {
  timings[`${name}Start`] = Date.now();
};

const endPhase = (name) => {
  timings[name] = Date.now() - timings[`${name}Start`];
  delete timings[`${name}Start`];
};

// Usage in pipeline
startPhase('contextInference');
const context = inferContext(url, options);
endPhase('contextInference');
```

## Integration Points

### With Crawler

```javascript
// In PageExecutionService
const analysisResult = await analyzePage({
  url,
  html: fetchResult.html,
  gazetteer: this.gazetteer,
  xpathService: this.xpathService
});

// Use classification
if (analysisResult.analysis.findings.classification === 'article') {
  await this.articleProcessor.process({
    url,
    html,
    analysis: analysisResult
  });
}
```

### With Database

```javascript
// Store analysis results
await db.updateArticleAnalysis(url, {
  classification: analysisResult.analysis.findings.classification,
  places: analysisResult.places,
  sentiment: analysisResult.deepAnalysis?.sentiment,
  wordCount: analysisResult.preparation.wordCount
});
```

## Next Chapter

Continue to [Chapter 2: Stage 1 URL Classification](./02-stage1-url-classification.md) for details on URL-based classification.
