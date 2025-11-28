# Decision Tree Engine - Complete Technical Reference

## Overview

The **Decision Tree Engine** is a configurable boolean classification system for categorizing web pages. It executes JSON-configured decision trees with full audit trails, enabling human and AI-editable rules with complete transparency into classification decisions.

**Source File:** `src/analysis/decisionTreeEngine.js`  
**Config Location:** `config/decision-trees/page-categories.json`  
**Lines of Code:** ~280 lines  
**Version:** 1.0.0

---

## Architecture Philosophy

### Core Principles

1. **Boolean-Only Decisions** - Every node evaluates to `true` or `false`. No weighted scores, no fuzzy logic. This ensures decisions are explainable and auditable.

2. **Full Audit Trail** - Every classification stores the complete path taken through the tree, enabling debugging and review of any decision.

3. **JSON Configuration** - Trees are defined in JSON, making them editable by humans (via text editors) and AI (via structured modifications).

4. **Compact Storage** - Results are encoded efficiently for database storage while remaining decodable for review.

5. **Multi-Category Evaluation** - A single page can be evaluated against all categories simultaneously, with each returning an independent result.

---

## Class: DecisionTreeEngine

### Constructor

```javascript
constructor(config) {
  this.config = config;
  this.version = config.version;
  this.name = config.name;
  this.categories = config.categories;
}
```

**Parameters:**
- `config` - Decision tree configuration object loaded from JSON

### Static Factory Methods

#### `DecisionTreeEngine.fromFile(configPath)`
Load configuration from a JSON file path.

```javascript
const engine = DecisionTreeEngine.fromFile('./config/decision-trees/page-categories.json');
```

#### `DecisionTreeEngine.loadPageCategories()`
Load the default page-categories configuration from the standard location.

```javascript
const engine = DecisionTreeEngine.loadPageCategories();
```

---

## Public API Methods

### `getCategoryIds()`
Returns an array of available category slugs.

```javascript
const categories = engine.getCategoryIds();
// ['in-depth', 'opinion', 'live', 'explainer', 'multimedia']
```

### `evaluate(categoryId, context)`
Evaluate a single category against page data.

**Parameters:**
- `categoryId` - Category slug to evaluate (e.g., `'in-depth'`)
- `context` - EvaluationContext object with page data

**Returns:** `EvaluationResult` object

```javascript
const result = engine.evaluate('in-depth', {
  url: 'https://example.com/long-read/article-slug',
  title: 'An In-Depth Investigation',
  classification: 'nav',
  article_links_count: 12,
  section_avg_word_count: 2500,
  domain_avg_word_count: 800
});

// Result:
{
  categoryId: 'in-depth',
  categoryName: 'In-Depth',
  match: true,
  confidence: 0.9,
  reason: 'url-pattern-long-read',
  path: [
    { nodeId: 'in-depth-root', condition: 'url matches [long-read, long-form, longform]', result: true, branch: 'yes' }
  ],
  encodedPath: 'root:Y'
}
```

### `evaluateAll(context)`
Evaluate all categories against page data. Returns array of `EvaluationResult` objects.

```javascript
const results = engine.evaluateAll(pageData);
// Array of 5 results (one per category)
```

### `getMatches(context)`
Get only matching categories (where `match === true`).

```javascript
const matches = engine.getMatches(pageData);
// Array of matching categories only
```

---

## Type Definitions

### EvaluationContext

The input data for tree evaluation:

```typescript
interface EvaluationContext {
  url: string;                    // Required: URL being evaluated
  title?: string;                 // Page title
  description?: string;           // Page description/meta
  classification?: string;        // Page classification ('nav', 'article', etc.)
  article_links_count?: number;   // Number of article links on page
  section_avg_word_count?: number; // Avg word count for this section
  domain_avg_word_count?: number;  // Avg word count for entire domain
  max_linked_word_count?: number;  // Max word count among linked articles
}
```

### PathStep

A single step in the decision path:

```typescript
interface PathStep {
  nodeId: string;      // ID of the node evaluated
  condition: string;   // Human-readable condition description
  result: boolean;     // Result of condition evaluation
  branch: 'yes' | 'no'; // Which branch was taken
}
```

### EvaluationResult

The complete result of evaluating one category:

```typescript
interface EvaluationResult {
  categoryId: string;     // Category slug
  categoryName: string;   // Display name
  match: boolean;         // Whether category matched
  confidence: number;     // Confidence score (0.0-1.0)
  reason: string;         // Compact reason code
  path: PathStep[];       // Full audit trail
  encodedPath: string;    // Compact encoded path for storage
}
```

---

## Condition Types

The engine supports 5 condition types:

### 1. `url_matches`

Match URL against pattern list.

```json
{
  "type": "url_matches",
  "patterns": ["long-read", "long-form", "longform"],
  "matchType": "segment"  // 'segment' (default), 'contains', or 'regex'
}
```

**Match Types:**
- `segment` - Pattern must appear as path segment (between `/` or at boundaries)
- `contains` - Pattern can appear anywhere in URL
- `regex` - Pattern is treated as regular expression

**Implementation:**
```javascript
_evalUrlMatches(condition, context) {
  const url = (context.url || '').toLowerCase();
  const matchType = condition.matchType || 'segment';
  
  for (const pattern of condition.patterns) {
    const pat = pattern.toLowerCase();
    
    if (matchType === 'segment') {
      // Match as path segment (between slashes or at boundaries)
      const regex = new RegExp(`(^|/)${this._escapeRegex(pat)}(/|$|\\?|#)`, 'i');
      if (regex.test(url)) return true;
      // Also check hyphen boundaries
      const hyphenRegex = new RegExp(`[-/]${this._escapeRegex(pat)}[-/]`, 'i');
      if (hyphenRegex.test(url)) return true;
    }
    // ... other match types
  }
  return false;
}
```

### 2. `text_contains`

Check if a text field contains any of the patterns.

```json
{
  "type": "text_contains",
  "field": "title",
  "patterns": ["live:", "live |", "- live", "live updates"]
}
```

### 3. `compare`

Numeric or string comparison operations.

```json
{
  "type": "compare",
  "field": "article_links_count",
  "operator": "gte",
  "value": 5
}
```

**Operators:**
- `eq` - Equal
- `ne` - Not equal
- `gt` - Greater than
- `gte` - Greater than or equal
- `lt` - Less than
- `lte` - Less than or equal

**Dynamic Field References:**
```json
{
  "type": "compare",
  "field": "section_avg_word_count",
  "operator": "gt",
  "value": { "field": "domain_avg_word_count", "multiplier": 1.3 }
}
```

### 4. `compound`

Combine multiple conditions with AND/OR logic.

```json
{
  "type": "compound",
  "operator": "AND",
  "conditions": [
    { "type": "compare", "field": "classification", "operator": "eq", "value": "nav" },
    { "type": "compare", "field": "article_links_count", "operator": "gte", "value": 5 }
  ]
}
```

### 5. `flag`

Check boolean flag value.

```json
{
  "type": "flag",
  "flag": "is_homepage",
  "expected": false
}
```

---

## JSON Configuration Schema

### Tree Structure

```json
{
  "$schema": "./decision-tree.schema.json",
  "version": "1.0.0",
  "name": "page-category-classifier",
  "description": "Decision tree for classifying page content categories",
  "categories": {
    "category-slug": {
      "displayName": "Display Name",
      "description": "Category description",
      "tree": { /* decision tree */ }
    }
  },
  "metadata": {
    "author": "system",
    "created": "2025-11-27",
    "lastModified": "2025-11-27"
  }
}
```

### Decision Node Structure

**Branch Node (has condition):**
```json
{
  "id": "node-unique-id",
  "condition": { /* condition object */ },
  "yes": { /* branch taken if true */ },
  "no": { /* branch taken if false */ }
}
```

**Leaf Node (has result):**
```json
{
  "result": "match",        // or "no-match"
  "confidence": 0.85,       // 0.0 to 1.0
  "reason": "reason-code"   // compact reason for storage
}
```

---

## Current Categories

### 1. In-Depth
**Slug:** `in-depth`  
**Description:** Hub pages linking to long-form articles, features, and investigative pieces

**URL Patterns:** `long-read`, `long-form`, `longform`, `the-long-read`, `series`, `feature`, `features`, `investigation`, `special-report`

**Decision Flow:**
1. Check for explicit long-read URL patterns → Match (0.9 confidence)
2. Check for series/feature URL patterns → Check word count signals
3. If series + high word count → Match (0.85 confidence)
4. If series only → Match (0.7 confidence)
5. Check if nav hub with article links + high word count articles → Match (0.75 confidence)
6. Otherwise → No match

### 2. Opinion
**Slug:** `opinion`  
**Description:** Editorial and opinion section hubs

**URL Patterns:** `opinion`, `opinions`, `comment`, `commentisfree`, `editorial`, `editorials`, `op-ed`, `oped`, `columnist`, `voices`, `perspective`, `viewpoint`

**Decision Flow:**
1. Check for opinion URL patterns
2. If matched, check for hub signals (nav classification OR 3+ article links)
3. With hub signals → Match (0.85 confidence)
4. Without hub signals → Match (0.6 confidence)

### 3. Live Coverage
**Slug:** `live`  
**Description:** Live event coverage and live blogs

**URL Patterns:** `live`, `liveblog`, `live-blog`, `as-it-happened`, `live-updates`, `live-coverage`, `breaking`

**Title Patterns:** `live:`, `live |`, `- live`, `live updates`, `as it happened`

**Decision Flow:**
1. Check URL patterns → Match (0.9 confidence)
2. Check title patterns → Match (0.8 confidence)
3. Otherwise → No match

### 4. Explainer
**Slug:** `explainer`  
**Description:** Explainer and educational content hubs

**URL Patterns:** `explainer`, `explainers`, `explained`, `guide`, `guides`, `what-is`, `how-to`, `faq`, `101`, `understand`

**Decision Flow:**
1. Check URL patterns → Match (0.85 confidence)
2. Otherwise → No match

### 5. Multimedia
**Slug:** `multimedia`  
**Description:** Video, audio, and interactive content hubs

**URL Patterns:** `video`, `videos`, `audio`, `podcast`, `podcasts`, `interactive`, `interactives`, `multimedia`, `gallery`, `galleries`, `photos`, `graphics`, `visuals`

**Decision Flow:**
1. Check URL patterns → Match (0.85 confidence)
2. Otherwise → No match

---

## Class: DecisionJustification

Compact storage format for decision results, designed for efficient database storage.

### `DecisionJustification.toCompact(result)`

Convert full result to compact storage format:

```javascript
const compact = DecisionJustification.toCompact(result);
// {
//   cat: 'in-depth',      // Category slug
//   m: 1,                 // Match flag (0/1)
//   c: 85,                // Confidence as integer 0-100
//   r: 'url-pattern-series+high-word-count',  // Reason code
//   p: 'root:N,series:Y,word:Y'  // Encoded path
// }
```

### `DecisionJustification.fromCompact(compact)`

Expand compact format back to full result:

```javascript
const result = DecisionJustification.fromCompact(compact);
// {
//   categoryId: 'in-depth',
//   match: true,
//   confidence: 0.85,
//   reason: 'url-pattern-series+high-word-count',
//   encodedPath: 'root:N,series:Y,word:Y'
// }
```

### `DecisionJustification.encodeMultiple(results)`

Encode multiple results as single JSON string (only matching categories):

```javascript
const encoded = DecisionJustification.encodeMultiple(results);
// '[{"cat":"in-depth","m":1,"c":85,"r":"...","p":"..."}]'
```

---

## Path Encoding

Decision paths are encoded compactly for storage:

**Format:** `nodeId:branch,nodeId:branch,...`

**Example:**
- Full path: `[{nodeId: 'in-depth-root', branch: 'no'}, {nodeId: 'in-depth-series-check', branch: 'yes'}]`
- Encoded: `root:N,series-ch:Y`

**Encoding Rules:**
1. Node ID prefix (category name) is stripped
2. Node ID is truncated to 8 characters
3. Branch is encoded as `Y` (yes) or `N` (no)
4. Steps are comma-separated

---

## Integration Points

### With Page Analyzer
```javascript
// In page-analyzer.js
const { DecisionTreeEngine } = require('./decisionTreeEngine');

async function analyzePage(page) {
  const engine = DecisionTreeEngine.loadPageCategories();
  const categoryResults = engine.getMatches({
    url: page.url,
    title: page.title,
    classification: page.classification,
    article_links_count: page.articleLinks?.length || 0,
    // ... other fields
  });
  
  return {
    ...page,
    categories: categoryResults.map(r => r.categoryId),
    categoryDetails: categoryResults
  };
}
```

### With Database Storage
```javascript
// Store compact format
const compact = DecisionJustification.encodeMultiple(results);
await db.run(
  'UPDATE pages SET category_decisions = ? WHERE id = ?',
  [compact, pageId]
);

// Retrieve and expand
const row = await db.get('SELECT category_decisions FROM pages WHERE id = ?', [pageId]);
const results = JSON.parse(row.category_decisions).map(DecisionJustification.fromCompact);
```

---

## Performance Characteristics

- **Tree Depth:** Typically 3-5 levels deep
- **Evaluation Time:** < 1ms per category
- **Memory:** Minimal (trees held in memory)
- **Storage Overhead:** ~50-100 bytes per classification decision

---

## Future Enhancements

1. **Visual Tree Editor** - UI in Data Explorer for editing trees
2. **A/B Testing** - Compare rule changes side-by-side
3. **Auto-Suggest Rules** - AI analysis of patterns to suggest new rules
4. **Performance Metrics** - Track rule hit rates and confidence distributions
5. **Tree Versioning** - Full version history with rollback capability
6. **Export/Import** - Share trees between crawlers

---

## File References

| File | Purpose |
|------|---------|
| `src/analysis/decisionTreeEngine.js` | Main engine implementation |
| `config/decision-trees/page-categories.json` | Category classification trees |
| `config/decision-trees/decision-tree.schema.json` | JSON schema for validation |
| `src/analysis/test-decision-tree.js` | Test script |
| `docs/diagrams/decision-tree-engine-deep-dive.svg` | Visual architecture diagram |

---

*Document generated: November 27, 2025*  
*Engine Version: 1.0.0*
