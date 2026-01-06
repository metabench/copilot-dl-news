# Chapter 5: Classification Cascade

## Overview

The Classification Cascade is a three-stage pipeline for classifying URLs as articles, hubs, or navigation pages. Each stage provides increasing accuracy at increasing cost.

```
Stage 1: URL              Stage 2: Content         Stage 3: Puppeteer
─────────────────────    ─────────────────────    ──────────────────
[No download required]   [HTML analysis]          [Browser rendering]
5-50ms                   50-200ms                 1-5 seconds
Confidence: 0.6-0.95     Confidence: 0.7-0.95     Confidence: 0.85-0.99
                                    ↓
                              StageAggregator
                              ──────────────
                              Combines results
                              Provenance tracking
                              Final classification
```

## Key Files

- [src/classifiers/Stage1UrlClassifier.js](../../../src/classifiers/Stage1UrlClassifier.js)
- [src/classifiers/Stage2ContentClassifier.js](../../../src/classifiers/Stage2ContentClassifier.js)
- [src/classifiers/Stage3PuppeteerClassifier.js](../../../src/classifiers/Stage3PuppeteerClassifier.js)
- [src/classifiers/StageAggregator.js](../../../src/classifiers/StageAggregator.js)
- [config/decision-trees/url-classification.json](../../../config/decision-trees/url-classification.json)

## Stage 1: URL Classification

Classifies URLs without downloading content using decision trees and URL pattern analysis.

### Signal Extraction

```javascript
extractSignals(url) {
  const parsed = new URL(url);
  const pathSegments = parsed.pathname.split('/').filter(Boolean);
  const lastSegment = pathSegments[pathSegments.length - 1] || '';

  return {
    host: parsed.hostname,
    path: parsed.pathname,
    pathDepth: pathSegments.length,
    slug: lastSegment,
    slugLength: lastSegment.length,
    hasHyphenatedSlug: lastSegment.includes('-'),
    hasDatePath: /\d{4}\/\d{2}\/\d{2}|\d{4}\/[a-z]{3}\/\d{2}/i.test(parsed.pathname),
    hasQueryParams: parsed.search.length > 0,
    hasNumericId: /\/\d{5,}(\/|$)/.test(parsed.pathname),
    extension: path.extname(lastSegment)
  };
}
```

### Decision Tree Evaluation

```javascript
async classify(url) {
  const signals = this.extractSignals(url);

  // Load decision tree
  const tree = await this.loadDecisionTree('url-classification');

  // Evaluate against each category
  const results = {};
  for (const category of ['article', 'hub', 'nav']) {
    const result = this.evaluateTree(tree.categories[category], signals);
    results[category] = result;
  }

  // Return highest confidence
  const best = Object.entries(results)
    .sort((a, b) => b[1].confidence - a[1].confidence)[0];

  return {
    classification: best[0],
    confidence: best[1].confidence,
    reason: best[1].reason,
    signals
  };
}
```

### Example Patterns

| Pattern | Classification | Confidence |
|---------|----------------|------------|
| `/2024/jan/15/article-slug` | article | 0.95 |
| `/2024/01/15/...` | article | 0.90 |
| `/wiki/Page_Title` | article | 0.85 |
| `/category/` | hub | 0.80 |
| `/world/` | hub | 0.85 |
| `/navigation/menu` | nav | 0.75 |

## Stage 2: Content Classification

Analyzes HTML structure without browser rendering.

### Signal Extraction

```javascript
extractSignals(html, url) {
  const $ = cheerio.load(html);

  // Word count
  const text = $('body').text();
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;

  // Paragraph count
  const paragraphs = $('p').length;

  // Link density
  const links = $('a').length;
  const linkDensity = links / Math.max(wordCount, 1);

  // Heading structure
  const h2Count = $('h2').length;
  const h3Count = $('h3').length;

  // Schema.org signals
  const hasArticleSchema = $('[itemtype*="Article"]').length > 0 ||
                           $('[itemtype*="NewsArticle"]').length > 0;
  const hasArticleBody = $('[itemprop="articleBody"]').length > 0;

  // Navigation indicators
  const navLinks = $('nav a, .nav a, .navigation a').length;

  return {
    wordCount,
    paragraphs,
    linkDensity,
    h2Count,
    h3Count,
    hasArticleSchema,
    hasArticleBody,
    navLinks,
    hasMainContent: $('main, article, .content, #content').length > 0
  };
}
```

### Classification Logic

```javascript
classify(html, url) {
  const signals = this.extractSignals(html, url);

  // Article indicators
  if (signals.wordCount >= this.thresholds.minArticleWordCount &&
      signals.paragraphs >= this.thresholds.minArticleParagraphs &&
      signals.linkDensity <= this.thresholds.maxArticleLinkDensity) {

    let confidence = 0.7;

    // Boost for schema.org
    if (signals.hasArticleSchema) confidence += 0.15;
    if (signals.hasArticleBody) confidence += 0.1;

    // Boost for high word count
    if (signals.wordCount >= this.thresholds.highWordCount) confidence += 0.05;

    return { classification: 'article', confidence, signals };
  }

  // Navigation indicators
  if (signals.linkDensity >= this.thresholds.minNavLinkDensity) {
    return { classification: 'nav', confidence: 0.75, signals };
  }

  // Hub indicators
  if (signals.navLinks > 20 && signals.wordCount < 500) {
    return { classification: 'hub', confidence: 0.7, signals };
  }

  return { classification: 'unknown', confidence: 0.3, signals };
}
```

### Default Thresholds

```javascript
const DEFAULT_THRESHOLDS = {
  minArticleWordCount: 180,
  highWordCount: 350,
  minArticleParagraphs: 4,
  maxArticleLinkDensity: 0.2,
  minNavLinkDensity: 0.35
};
```

## Stage 3: Puppeteer Classification

Most accurate but expensive - requires browser rendering.

### When to Use

- Low confidence from Stage 1 + Stage 2 (< 0.7)
- JavaScript-heavy sites
- Verification of high-value URLs
- Sites with complex DOM manipulation

### Classification

```javascript
async classify(url, options = {}) {
  const { timeout = 30000, extraWait = 1000 } = options;

  const browser = await this.getBrowser();
  const page = await browser.newPage();

  try {
    // Navigate with DOMContentLoaded wait
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });

    // Extra wait for JS rendering
    await page.waitForTimeout(extraWait);

    // Extract rendered content
    const html = await page.content();
    const signals = await this.extractRenderedSignals(page);

    // Use Stage 2 logic on rendered content
    const baseResult = this.contentClassifier.classify(html, url);

    // Apply Puppeteer-specific boosts
    if (signals.hasVisibleArticle) {
      baseResult.confidence = Math.min(0.99, baseResult.confidence + 0.1);
    }

    return {
      ...baseResult,
      source: 'puppeteer',
      renderTimeMs: signals.renderTimeMs
    };

  } finally {
    await page.close();
  }
}

async extractRenderedSignals(page) {
  return page.evaluate(() => {
    // Check for visible article content
    const article = document.querySelector('article, [role="article"], .article');
    const hasVisibleArticle = article && article.offsetHeight > 100;

    // Check for lazy-loaded content
    const images = document.querySelectorAll('img[data-src], img[loading="lazy"]');

    return {
      hasVisibleArticle,
      lazyImages: images.length,
      viewportHeight: window.innerHeight,
      documentHeight: document.body.scrollHeight
    };
  });
}
```

## Stage Aggregator

Combines results from all stages with provenance tracking.

### Aggregation Logic

```javascript
aggregate(results) {
  const { stage1, stage2, stage3 } = results;

  // Weights for each stage
  const weights = {
    url: 1.0,
    content: 1.2,
    puppeteer: 1.5
  };

  // High confidence threshold (trust single stage)
  const HIGH_CONFIDENCE = 0.9;

  // If any stage has very high confidence, trust it
  if (stage3?.confidence >= HIGH_CONFIDENCE) {
    return this._buildResult(stage3, 'puppeteer-high-confidence');
  }
  if (stage2?.confidence >= HIGH_CONFIDENCE) {
    return this._buildResult(stage2, 'content-high-confidence');
  }
  if (stage1?.confidence >= HIGH_CONFIDENCE) {
    return this._buildResult(stage1, 'url-high-confidence');
  }

  // Calculate weighted scores per classification
  const scores = { article: 0, hub: 0, nav: 0, unknown: 0 };

  if (stage1) {
    scores[stage1.classification] += stage1.confidence * weights.url;
  }
  if (stage2) {
    scores[stage2.classification] += stage2.confidence * weights.content;
  }
  if (stage3) {
    scores[stage3.classification] += stage3.confidence * weights.puppeteer;
  }

  // Find winner
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [classification, score] = sorted[0];

  // Calculate aggregate confidence
  const totalWeight = (stage1 ? weights.url : 0) +
                      (stage2 ? weights.content : 0) +
                      (stage3 ? weights.puppeteer : 0);
  const confidence = score / totalWeight;

  return {
    classification,
    confidence,
    provenance: this._buildProvenance(results),
    stageResults: { stage1, stage2, stage3 }
  };
}
```

### Provenance Tracking

```javascript
_buildProvenance(results) {
  const { stage1, stage2, stage3 } = results;
  const stages = [];

  if (stage1) stages.push({ stage: 1, classification: stage1.classification, confidence: stage1.confidence });
  if (stage2) stages.push({ stage: 2, classification: stage2.classification, confidence: stage2.confidence });
  if (stage3) stages.push({ stage: 3, classification: stage3.classification, confidence: stage3.confidence });

  // Check for disagreements
  const classifications = stages.map(s => s.classification);
  const hasDisagreement = new Set(classifications).size > 1;

  return {
    stages,
    hasDisagreement,
    dominantStage: stages.sort((a, b) => b.confidence - a.confidence)[0].stage,
    aggregationMethod: hasDisagreement ? 'weighted-vote' : 'unanimous'
  };
}
```

### Classification Priority (Tie-Breaking)

```javascript
const CLASSIFICATION_PRIORITY = {
  unknown: 0,
  nav: 1,
  hub: 2,
  article: 3
};

// When scores are equal, prefer higher priority classification
```

## Integration with Crawler

### ArticleSignalsService

```javascript
class ArticleSignalsService {
  constructor(classifierCascade) {
    this.cascade = classifierCascade;
  }

  async analyze(url, html = null) {
    // Stage 1: Always run
    const stage1 = await this.cascade.stage1.classify(url);

    // Stage 2: Only if we have HTML
    let stage2 = null;
    if (html) {
      stage2 = await this.cascade.stage2.classify(html, url);
    }

    // Stage 3: Only if low confidence
    let stage3 = null;
    if (this._needsPuppeteer(stage1, stage2)) {
      stage3 = await this.cascade.stage3.classify(url);
    }

    // Aggregate
    return this.cascade.aggregator.aggregate({ stage1, stage2, stage3 });
  }

  _needsPuppeteer(stage1, stage2) {
    const maxConfidence = Math.max(
      stage1?.confidence || 0,
      stage2?.confidence || 0
    );
    return maxConfidence < 0.7;
  }
}
```

### Usage in PageExecutionService

```javascript
async processPage({ url, depth, context }) {
  // Fetch page
  const { html, fetchMeta } = await this.fetchPipeline.fetch({ url, context });

  // Classify
  const classification = await this.articleSignalsService.analyze(url, html);

  if (classification.classification === 'article' && classification.confidence >= 0.6) {
    // Process as article
    await this.articleProcessor.process({ url, html, fetchMeta, classification });
  } else if (classification.classification === 'hub') {
    // Discover links from hub
    await this.navigationDiscoveryService.discover({ url, html, depth });
  }

  return { classification, url };
}
```

## Configuration

### Decision Tree Schema

**File:** [config/decision-trees/decision-tree.schema.json](../../../config/decision-trees/decision-tree.schema.json)

```json
{
  "categories": {
    "article": {
      "nodes": [
        {
          "type": "branch",
          "condition": {
            "type": "url_matches",
            "pattern": "\\d{4}/\\d{2}/\\d{2}"
          },
          "yes": { "type": "result", "match": true, "confidence": 0.9 },
          "no": { "ref": "next-check" }
        }
      ]
    }
  }
}
```

### Condition Types

| Type | Description | Example |
|------|-------------|---------|
| `url_matches` | Regex on URL | `"\\d{4}/\\d{2}/\\d{2}"` |
| `text_contains` | Field contains text | `{ "field": "slug", "value": "article" }` |
| `compare` | Numeric comparison | `{ "field": "pathDepth", "op": "gte", "value": 3 }` |
| `compound` | AND/OR combinations | `{ "op": "and", "conditions": [...] }` |
| `flag` | Boolean flag | `{ "flag": "hasDatePath" }` |

## Key Method Signatures

| Class | Method | Signature |
|-------|--------|-----------|
| Stage1UrlClassifier | classify | `async classify(url)` |
| Stage1UrlClassifier | extractSignals | `extractSignals(url)` |
| Stage2ContentClassifier | classify | `classify(html, url)` |
| Stage2ContentClassifier | extractSignals | `extractSignals(html, url)` |
| Stage3PuppeteerClassifier | classify | `async classify(url, options)` |
| StageAggregator | aggregate | `aggregate({ stage1, stage2, stage3 })` |

## Next Chapter

Continue to [Chapter 6: Decision Tree Configuration](./06-decision-tree-configuration.md) to learn how to write and test custom classification rules.
