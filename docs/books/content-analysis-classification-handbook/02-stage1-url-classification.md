# Chapter 2: Stage 1 URL Classification

## Overview

Stage 1 classifies URLs without downloading content. It uses pattern matching and decision trees to achieve fast classification (~5-50ms).

**File:** [src/classifiers/Stage1UrlClassifier.js](../../../src/classifiers/Stage1UrlClassifier.js)

## Signal Extraction

### URL Signals

```javascript
extractSignals(url) {
  const parsed = new URL(url);
  const pathSegments = parsed.pathname.split('/').filter(Boolean);
  const lastSegment = pathSegments[pathSegments.length - 1] || '';

  return {
    // Basic URL parts
    host: parsed.hostname,
    path: parsed.pathname,
    query: parsed.search,

    // Path analysis
    pathDepth: pathSegments.length,
    segments: pathSegments,

    // Slug analysis
    slug: lastSegment,
    slugLength: lastSegment.length,
    hasHyphenatedSlug: lastSegment.includes('-'),
    hyphenCount: (lastSegment.match(/-/g) || []).length,

    // Pattern detection
    hasDatePath: /\d{4}\/\d{2}\/\d{2}|\d{4}\/[a-z]{3}\/\d{2}/i.test(parsed.pathname),
    hasNumericId: /\/\d{5,}(\/|$)/.test(parsed.pathname),
    hasQueryParams: parsed.search.length > 0,

    // File detection
    extension: path.extname(lastSegment),
    hasExtension: path.extname(lastSegment).length > 0
  };
}
```

### Signal Examples

| URL | Key Signals |
|-----|-------------|
| `/2024/jan/15/article-title` | `hasDatePath: true`, `pathDepth: 4`, `hasHyphenatedSlug: true` |
| `/world/us/politics/` | `pathDepth: 3`, `hasHyphenatedSlug: false`, `slug: ''` |
| `/article/12345678` | `hasNumericId: true`, `pathDepth: 2` |
| `/search?q=term` | `hasQueryParams: true`, `pathDepth: 1` |

## Decision Tree Evaluation

### Classification Flow

```javascript
async classify(url) {
  const signals = this.extractSignals(url);

  // Load decision tree
  const tree = await this.loadDecisionTree('url-classification');

  // Evaluate each category
  const results = {};
  for (const category of ['article', 'hub', 'nav']) {
    results[category] = this.evaluateCategory(tree.categories[category], signals);
  }

  // Select best result
  const best = Object.entries(results)
    .filter(([_, r]) => r.match)
    .sort((a, b) => b[1].confidence - a[1].confidence)[0];

  if (best) {
    return {
      classification: best[0],
      confidence: best[1].confidence,
      reason: best[1].reason,
      signals
    };
  }

  return {
    classification: 'unknown',
    confidence: 0.3,
    reason: 'no-match',
    signals
  };
}
```

### Tree Traversal

```javascript
evaluateCategory(category, signals) {
  let node = category.nodes[0];

  while (node) {
    if (node.type === 'result') {
      return {
        match: node.match,
        confidence: node.confidence,
        reason: node.reason
      };
    }

    if (node.type === 'branch') {
      const result = this.evaluateCondition(node.condition, signals);
      node = result ? this.resolveNode(node.yes) : this.resolveNode(node.no);
    }
  }

  return { match: false, confidence: 0.1, reason: 'tree-exhausted' };
}
```

## Common Patterns

### Guardian Date Pattern

```javascript
// Pattern: /YYYY/mon/DD/slug
{
  type: 'url_matches',
  pattern: '/\\d{4}/[a-z]{3}/\\d{2}/[a-z0-9-]+',
  confidence: 0.95,
  reason: 'guardian-date-pattern'
}

// Matches:
// /2024/jan/15/climate-change-report
// /2023/dec/01/uk-economy-update
```

### ISO Date Pattern

```javascript
// Pattern: /YYYY/MM/DD/...
{
  type: 'url_matches',
  pattern: '/\\d{4}/\\d{2}/\\d{2}/',
  confidence: 0.90,
  reason: 'iso-date-pattern'
}

// Matches:
// /2024/01/15/article-title
// /2023/12/01/breaking-news
```

### Wikipedia Article

```javascript
// Pattern: /wiki/Page (no colon = not special page)
{
  type: 'compound',
  op: 'and',
  conditions: [
    { type: 'text_contains', field: 'host', value: 'wikipedia.org' },
    { type: 'url_matches', pattern: '/wiki/[^:]+$' }
  ],
  confidence: 0.85,
  reason: 'wikipedia-article'
}

// Matches:
// /wiki/United_Kingdom
// NOT: /wiki/Category:Countries
```

### Section Hub

```javascript
// Pattern: Short path with known section
{
  type: 'compound',
  op: 'and',
  conditions: [
    { type: 'compare', field: 'pathDepth', op: 'lte', value: 2 },
    { type: 'url_matches', pattern: '/(world|sport|business|tech|culture)/?$' }
  ],
  confidence: 0.85,
  reason: 'section-hub'
}

// Matches:
// /world/
// /sport
// /business/
```

### Deep Path + Long Slug

```javascript
// Pattern: Deep path with hyphenated slug
{
  type: 'compound',
  op: 'and',
  conditions: [
    { type: 'compare', field: 'pathDepth', op: 'gte', value: 4 },
    { type: 'compare', field: 'slugLength', op: 'gte', value: 20 },
    { type: 'flag', flag: 'hasHyphenatedSlug' }
  ],
  confidence: 0.80,
  reason: 'deep-path-long-slug'
}

// Matches:
// /world/us/politics/2024/president-announces-new-policy
```

## Confidence Calibration

### High Confidence (0.90-0.95)

- Exact domain + specific pattern match
- Date pattern with long hyphenated slug
- Known article URL structure

### Medium Confidence (0.70-0.85)

- Date pattern only
- Path depth + slug characteristics
- Section pattern match

### Low Confidence (0.50-0.65)

- Generic heuristics only
- Ambiguous patterns
- Query parameters present

## Result Structure

```javascript
{
  classification: 'article',    // article | hub | nav | unknown
  confidence: 0.95,             // 0.0 - 1.0
  reason: 'guardian-date-pattern',
  signals: {
    host: 'www.theguardian.com',
    path: '/world/2024/jan/15/article-title',
    pathDepth: 4,
    slug: 'article-title',
    slugLength: 13,
    hasDatePath: true,
    hasHyphenatedSlug: true,
    // ... more signals
  }
}
```

## Integration

### With ArticleSignalsService

```javascript
const signals = new ArticleSignalsService();

// Just URL analysis (no HTML)
const urlSignals = signals.computeUrlSignals(url);

// Classify
const stage1 = await stage1Classifier.classify(url);

if (stage1.confidence >= 0.9) {
  // High confidence - can skip further stages
  return stage1;
}

// Continue to Stage 2 if needed
```

### With Stage Aggregator

```javascript
// Stage 1 result feeds into aggregator
const aggregated = aggregator.aggregate({
  stage1: stage1Result,
  stage2: stage2Result,
  stage3: null  // Optional
});
```

## Testing

```javascript
describe('Stage1UrlClassifier', () => {
  const classifier = new Stage1UrlClassifier();

  it('should classify Guardian articles', async () => {
    const result = await classifier.classify(
      'https://www.theguardian.com/world/2024/jan/15/article-title'
    );

    expect(result.classification).toBe('article');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.signals.hasDatePath).toBe(true);
  });

  it('should classify section hubs', async () => {
    const result = await classifier.classify(
      'https://www.theguardian.com/world/'
    );

    expect(result.classification).toBe('hub');
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });
});
```

## Next Chapter

Continue to [Chapter 3: Stage 2 Content Classification](./03-stage2-content-classification.md) for HTML-based classification.
