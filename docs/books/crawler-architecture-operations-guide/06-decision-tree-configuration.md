# Chapter 6: Decision Tree Configuration

## Overview

Decision trees provide declarative URL classification rules. They're evaluated by the Stage 1 classifier to determine URL types without downloading content.

## Key Files

- [config/decision-trees/url-classification.json](../../../config/decision-trees/url-classification.json) (~20KB)
- [config/decision-trees/decision-tree.schema.json](../../../config/decision-trees/decision-tree.schema.json)
- [src/analysis/decisionTreeEngine.js](../../../src/analysis/decisionTreeEngine.js)

## Tree Structure

```json
{
  "version": "1.0",
  "metadata": {
    "description": "URL classification decision tree",
    "lastUpdated": "2026-01-05"
  },
  "categories": {
    "article": {
      "description": "Article page detection",
      "nodes": [ ... ]
    },
    "hub": {
      "description": "Hub/index page detection",
      "nodes": [ ... ]
    },
    "nav": {
      "description": "Navigation page detection",
      "nodes": [ ... ]
    }
  }
}
```

## Node Types

### Branch Node

Evaluates a condition and follows yes/no paths:

```json
{
  "id": "check-date-pattern",
  "type": "branch",
  "condition": {
    "type": "url_matches",
    "pattern": "\\d{4}/\\d{2}/\\d{2}"
  },
  "yes": {
    "type": "result",
    "match": true,
    "confidence": 0.9,
    "reason": "date-pattern-match"
  },
  "no": {
    "ref": "check-slug-length"
  }
}
```

### Result Node

Terminal node returning classification result:

```json
{
  "type": "result",
  "match": true,
  "confidence": 0.85,
  "reason": "guardian-article-pattern"
}
```

### Reference Node

Jumps to another node by ID:

```json
{
  "ref": "check-next-condition"
}
```

## Condition Types

### url_matches

Regex pattern matching on URL:

```json
{
  "type": "url_matches",
  "pattern": "/\\d{4}/[a-z]{3}/\\d{2}/",
  "flags": "i"
}
```

**Examples:**
- `/2024/jan/15/` - Guardian date pattern
- `/article/\d+` - Numeric article ID
- `/wiki/[^:]+$` - Wikipedia article (no colon = not special page)

### text_contains

Field contains specific text:

```json
{
  "type": "text_contains",
  "field": "slug",
  "value": "article",
  "caseSensitive": false
}
```

**Available fields:**
- `host` - Hostname
- `path` - Full pathname
- `slug` - Last path segment
- `query` - Query string

### compare

Numeric/string comparison:

```json
{
  "type": "compare",
  "field": "pathDepth",
  "op": "gte",
  "value": 3
}
```

**Operators:**
- `eq` - Equal
- `ne` - Not equal
- `gt` - Greater than
- `gte` - Greater than or equal
- `lt` - Less than
- `lte` - Less than or equal

**Numeric fields:**
- `pathDepth` - Number of path segments
- `slugLength` - Length of last segment

### flag

Boolean flag check:

```json
{
  "type": "flag",
  "flag": "hasDatePath"
}
```

**Available flags:**
- `hasDatePath` - Contains date pattern in path
- `hasHyphenatedSlug` - Slug contains hyphens
- `hasQueryParams` - Has query string
- `hasNumericId` - Contains numeric ID

### compound

Combine multiple conditions:

```json
{
  "type": "compound",
  "op": "and",
  "conditions": [
    { "type": "flag", "flag": "hasDatePath" },
    { "type": "compare", "field": "pathDepth", "op": "gte", "value": 4 }
  ]
}
```

**Operators:** `and`, `or`

## Writing Rules

### Example: Guardian Article Detection

```json
{
  "id": "guardian-article",
  "type": "branch",
  "description": "Match Guardian article URL pattern",
  "condition": {
    "type": "compound",
    "op": "and",
    "conditions": [
      {
        "type": "text_contains",
        "field": "host",
        "value": "theguardian.com"
      },
      {
        "type": "url_matches",
        "pattern": "/\\d{4}/[a-z]{3}/\\d{2}/[a-z0-9-]+"
      }
    ]
  },
  "yes": {
    "type": "result",
    "match": true,
    "confidence": 0.95,
    "reason": "guardian-date-pattern"
  },
  "no": {
    "ref": "generic-article-check"
  }
}
```

### Example: Wikipedia Article Detection

```json
{
  "id": "wikipedia-article",
  "type": "branch",
  "description": "Match Wikipedia article (exclude special pages)",
  "condition": {
    "type": "compound",
    "op": "and",
    "conditions": [
      {
        "type": "text_contains",
        "field": "host",
        "value": "wikipedia.org"
      },
      {
        "type": "url_matches",
        "pattern": "/wiki/[^:]+$"
      }
    ]
  },
  "yes": {
    "type": "result",
    "match": true,
    "confidence": 0.85,
    "reason": "wikipedia-article"
  },
  "no": {
    "ref": "next-check"
  }
}
```

### Example: Hub Page Detection

```json
{
  "id": "section-hub",
  "type": "branch",
  "description": "Match section index pages",
  "condition": {
    "type": "compound",
    "op": "and",
    "conditions": [
      {
        "type": "compare",
        "field": "pathDepth",
        "op": "lte",
        "value": 2
      },
      {
        "type": "url_matches",
        "pattern": "/(world|sport|business|tech|culture)/?$"
      }
    ]
  },
  "yes": {
    "type": "result",
    "match": true,
    "confidence": 0.85,
    "reason": "section-hub"
  },
  "no": {
    "ref": "next-check"
  }
}
```

## Testing Rules

### CLI Testing Tool

```bash
# Test single URL
node src/tools/url-classify.js "https://www.theguardian.com/world/2024/jan/15/article-title"

# Output:
# Classification: article
# Confidence: 0.95
# Reason: guardian-date-pattern
# Signals: { pathDepth: 5, hasDatePath: true, ... }
```

### Batch Testing

```javascript
const { Stage1UrlClassifier } = require('./src/classifiers');

const classifier = new Stage1UrlClassifier();
await classifier.loadTree('url-classification');

const testCases = [
  { url: 'https://www.bbc.com/news/world-12345678', expected: 'article' },
  { url: 'https://www.bbc.com/news/', expected: 'hub' },
  { url: 'https://www.bbc.com/navigation', expected: 'nav' }
];

for (const { url, expected } of testCases) {
  const result = await classifier.classify(url);
  console.log(`${url}: ${result.classification} (expected: ${expected}) ${result.classification === expected ? '✓' : '✗'}`);
}
```

### Unit Test Pattern

```javascript
describe('URL Classification', () => {
  it('should classify Guardian articles', async () => {
    const result = await classifier.classify(
      'https://www.theguardian.com/world/2024/jan/15/article-title'
    );
    expect(result.classification).toBe('article');
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it('should classify section hubs', async () => {
    const result = await classifier.classify(
      'https://www.theguardian.com/world/'
    );
    expect(result.classification).toBe('hub');
  });
});
```

## Decision Tree Engine

**File:** [src/analysis/decisionTreeEngine.js](../../../src/analysis/decisionTreeEngine.js)

### Tree Loading

```javascript
async loadTree(name) {
  const treePath = path.join(CONFIG_DIR, 'decision-trees', `${name}.json`);
  const tree = JSON.parse(await fs.readFile(treePath, 'utf8'));

  // Validate against schema
  this.validateTree(tree);

  // Build node index for fast lookups
  this.nodeIndex = this._buildNodeIndex(tree);

  return tree;
}
```

### Tree Evaluation

```javascript
evaluateTree(category, signals) {
  let node = category.nodes[0];  // Start at first node

  while (node) {
    if (node.type === 'result') {
      return {
        match: node.match,
        confidence: node.confidence,
        reason: node.reason
      };
    }

    if (node.type === 'branch') {
      const conditionResult = this._evaluateCondition(node.condition, signals);

      if (conditionResult) {
        node = this._resolveNode(node.yes);
      } else {
        node = this._resolveNode(node.no);
      }
    }
  }

  // No match found
  return { match: false, confidence: 0.1, reason: 'no-match' };
}
```

### Condition Evaluation

```javascript
_evaluateCondition(condition, signals) {
  switch (condition.type) {
    case 'url_matches':
      const regex = new RegExp(condition.pattern, condition.flags || '');
      return regex.test(signals.url);

    case 'text_contains':
      const fieldValue = signals[condition.field] || '';
      const searchValue = condition.caseSensitive
        ? condition.value
        : condition.value.toLowerCase();
      const targetValue = condition.caseSensitive
        ? fieldValue
        : fieldValue.toLowerCase();
      return targetValue.includes(searchValue);

    case 'compare':
      const value = signals[condition.field];
      switch (condition.op) {
        case 'eq': return value === condition.value;
        case 'ne': return value !== condition.value;
        case 'gt': return value > condition.value;
        case 'gte': return value >= condition.value;
        case 'lt': return value < condition.value;
        case 'lte': return value <= condition.value;
      }
      break;

    case 'flag':
      return signals[condition.flag] === true;

    case 'compound':
      const results = condition.conditions.map(c => this._evaluateCondition(c, signals));
      return condition.op === 'and'
        ? results.every(r => r)
        : results.some(r => r);
  }

  return false;
}
```

## Best Practices

### 1. Order Matters

Place specific rules before generic ones:

```json
{
  "nodes": [
    { "id": "guardian-specific", ... },
    { "id": "bbc-specific", ... },
    { "id": "generic-date-pattern", ... },
    { "id": "generic-fallback", ... }
  ]
}
```

### 2. Use Descriptive IDs

```json
{
  "id": "guardian-world-section-article",
  "description": "Guardian articles in world section with date pattern"
}
```

### 3. Set Appropriate Confidence

| Pattern Type | Confidence |
|-------------|------------|
| Exact domain + date pattern | 0.95 |
| Date pattern only | 0.85-0.90 |
| Path depth + slug length | 0.70-0.80 |
| Generic fallback | 0.50-0.60 |

### 4. Test Edge Cases

```javascript
// Test edge cases
const edgeCases = [
  'https://example.com/',                    // Root
  'https://example.com/?param=value',        // Query only
  'https://example.com/a/b/c/d/e/f/g/h',     // Deep path
  'https://example.com/2024/01/01/',         // Date-like hub
  'https://example.com/article-title-123',   // Ambiguous
];
```

### 5. Document Reasoning

```json
{
  "id": "numeric-id-article",
  "description": "URLs with numeric IDs are often articles (CMS pattern)",
  "notes": "Common in WordPress, Drupal, and custom CMS systems",
  "condition": { ... }
}
```

## Schema Validation

The decision tree schema enforces:

1. **Required fields:** Each node must have `type`
2. **Valid node types:** `branch`, `result`, or `ref`
3. **Valid condition types:** `url_matches`, `text_contains`, `compare`, `flag`, `compound`
4. **Valid operators:** `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `and`, `or`
5. **Confidence range:** 0.0 to 1.0

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "definitions": {
    "node": {
      "oneOf": [
        { "$ref": "#/definitions/branchNode" },
        { "$ref": "#/definitions/resultNode" },
        { "$ref": "#/definitions/refNode" }
      ]
    },
    "resultNode": {
      "type": "object",
      "required": ["type", "match", "confidence"],
      "properties": {
        "type": { "const": "result" },
        "match": { "type": "boolean" },
        "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
        "reason": { "type": "string" }
      }
    }
  }
}
```

## Next Chapter

Continue to [Chapter 7: Telemetry & Monitoring](./07-telemetry-monitoring.md) to learn about real-time event streaming.
