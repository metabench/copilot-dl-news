# Fact-Based Classification System

## Executive Summary

This document outlines a **fact-based classification system** for URLs and documents. The system separates **objective observations (Facts)** from **subjective decisions (Classifications)**, enabling:

1. **Reproducibility** — Same input always produces same facts
2. **Debuggability** — See exactly which facts led to a classification
3. **Efficiency** — Facts computed once, stored, reused
4. **Flexibility** — Change classification rules without recomputing facts
5. **Auditability** — Track why any URL was classified a certain way

---

## Core Principles

### 1. Facts Are Objective Observations

A Fact answers a yes/no question about observable properties:
- ✅ "Does the URL contain a date segment?" — Verifiable
- ✅ "Does the document have an `<article>` element?" — Verifiable
- ❌ "Does this look like an article?" — Subjective judgment

### 2. Facts Are Computed Once and Stored

Facts are derived from raw data (URL string, HTML, HTTP headers) and persisted in the database. Once computed, they are never recomputed unless the source data changes.

### 3. Classifications Consume Facts

Classification rules operate on stored facts using pure boolean logic (AND, OR, NOT). They do not access raw data directly.

### 4. No Weighted Signals

The system uses strict boolean logic. There are no scores, weights, or confidence levels in the core fact/classification layer. This keeps the system predictable and debuggable.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        RAW DATA                                  │
│  URL string, HTML document, HTTP headers, Schema.org JSON-LD    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FACT EXTRACTORS                              │
│  UrlFactExtractor, DocumentFactExtractor, SchemaFactExtractor   │
│  • Parse raw data                                                │
│  • Compute boolean facts                                         │
│  • Store results in database                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      FACT STORAGE                                │
│  Database tables: facts, url_facts, document_facts              │
│  • Normalized schema                                             │
│  • Efficient querying                                            │
│  • Audit trail                                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CLASSIFICATION ENGINE                          │
│  Decision trees defined in JSON/config                          │
│  • Queries stored facts                                          │
│  • Applies boolean logic                                         │
│  • Outputs classification label                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  CLASSIFICATION STORAGE                          │
│  Database tables: classifications, url_classifications          │
│  • Final labels (article, hub, error-page, etc.)                │
│  • Links back to facts used                                      │
│  • Versioned by rule set                                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Fact Categories

### URL Facts

Facts derived from URL string analysis only. No network access required.

| Fact Name | Description | Example True | Example False |
|-----------|-------------|--------------|---------------|
| `url.hasDateSegment` | Path contains `/YYYY/MM/DD/` pattern | `/2024/11/28/story` | `/news/latest` |
| `url.hasSlugPattern` | Path ends with hyphenated slug | `/this-is-a-slug` | `/article?id=123` |
| `url.hasArticleKeyword` | Path contains article/story/news/post | `/article/foo` | `/category/bar` |
| `url.hasCategoryKeyword` | Path contains category/tag/topic/section | `/category/tech` | `/2024/story` |
| `url.hasPaginationPattern` | Has page parameter or /page/N pattern | `?page=2`, `/page/3` | `/news/story` |
| `url.isTopLevelPath` | Single path segment (e.g., `/news/`) | `/world/` | `/world/uk/london` |
| `url.hasNumericId` | Path contains numeric ID segment | `/article/12345` | `/article/slug` |
| `url.hasFileExtension` | Path ends with file extension | `.html`, `.php` | `/clean/path` |
| `url.hasQueryParams` | URL has query string | `?id=123` | `/clean/path` |
| `url.pathDepth` | Number of path segments (can be queried as pathDepth.eq2, etc.) | — | — |

### Document Facts

Facts derived from parsed HTML/DOM. Requires fetched content.

| Fact Name | Description | Example True |
|-----------|-------------|--------------|
| `doc.hasArticleElement` | Contains `<article>` semantic tag | `<article>...</article>` |
| `doc.hasMainElement` | Contains `<main>` semantic tag | `<main>...</main>` |
| `doc.hasTimeElement` | Contains `<time>` with datetime | `<time datetime="...">` |
| `doc.hasBylinePattern` | Contains "By [Author]" pattern | "By Jane Smith" |
| `doc.hasBlockquote` | Contains `<blockquote>` element | `<blockquote>...</blockquote>` |
| `doc.hasStructuredHeadings` | Has h1 followed by h2/h3 hierarchy | h1 → h2 → h3 |
| `doc.hasNavElement` | Contains `<nav>` element | `<nav>...</nav>` |
| `doc.hasAsideElement` | Contains `<aside>` element | `<aside>...</aside>` |
| `doc.hasFormElement` | Contains `<form>` element | Login/search forms |
| `doc.hasVideoEmbed` | Contains video iframe/element | YouTube, Vimeo embeds |
| `doc.hasImageGallery` | Multiple images in gallery pattern | Slideshow markup |

### Schema Facts

Facts derived from JSON-LD, Microdata, or RDFa structured data.

| Fact Name | Description |
|-----------|-------------|
| `schema.hasArticleType` | @type is NewsArticle, BlogPosting, Article, etc. |
| `schema.hasArticleBody` | articleBody property present |
| `schema.hasDatePublished` | datePublished property present |
| `schema.hasDateModified` | dateModified property present |
| `schema.hasAuthor` | author property present |
| `schema.hasPublisher` | publisher property present |
| `schema.hasHeadline` | headline property present |
| `schema.hasImage` | image property present |
| `schema.hasWebPageType` | @type is WebPage, CollectionPage, etc. |
| `schema.hasOrganizationType` | @type is Organization, NewsMediaOrganization |
| `schema.hasBreadcrumb` | BreadcrumbList present |

### Meta Facts

Facts derived from HTML `<meta>` tags and `<link>` elements.

| Fact Name | Description |
|-----------|-------------|
| `meta.hasOgTypeArticle` | og:type is "article" |
| `meta.hasOgTitle` | og:title present |
| `meta.hasOgDescription` | og:description present |
| `meta.hasCanonicalUrl` | `<link rel="canonical">` present |
| `meta.hasAmpLink` | `<link rel="amphtml">` present |
| `meta.hasRssLink` | `<link rel="alternate" type="application/rss+xml">` present |
| `meta.hasTwitterCard` | twitter:card meta present |
| `meta.hasRobotsMeta` | robots meta tag present |
| `meta.hasNoIndex` | robots contains noindex |

### Response Facts

Facts derived from HTTP response characteristics.

| Fact Name | Description |
|-----------|-------------|
| `response.isRedirect` | HTTP 3xx status code |
| `response.is4xx` | HTTP 4xx status code |
| `response.is5xx` | HTTP 5xx status code |
| `response.hasContentType` | Content-Type header present |
| `response.isHtml` | Content-Type indicates HTML |

### Page Structure Facts

Facts about page structure that may inform classification decisions later.

| Fact Name | Description |
|-----------|-------------|
| `page.hasLoginForm` | Form with password field present |
| `page.hasSearchForm` | Search input form present |
| `page.hasPaywallMarker` | Subscription/paywall indicators present |
| `page.hasCaptcha` | CAPTCHA element present |
| `page.hasErrorTitle` | Title contains error-related words |
| `page.hasMinimalContent` | Very little text content in body |

---

## Database Schema

### Fact Definitions Table

```sql
CREATE TABLE fact_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,              -- 'url.hasDateSegment'
    category TEXT NOT NULL,                  -- 'url', 'document', 'schema', 'meta', 'response', 'page'
    description TEXT,                        -- Human-readable description
    extractor TEXT,                          -- Class/function that computes this fact
    requires TEXT,                           -- 'url' | 'document' | 'schema' | 'headers'
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_fact_definitions_category ON fact_definitions(category);
```

### URL Facts Table

```sql
CREATE TABLE url_facts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url_id INTEGER NOT NULL,                 -- FK to urls table
    fact_id INTEGER NOT NULL,                -- FK to fact_definitions
    value INTEGER NOT NULL,                  -- 0 = false, 1 = true
    computed_at TEXT DEFAULT CURRENT_TIMESTAMP,
    source_hash TEXT,                        -- Hash of input data (for cache invalidation)
    
    FOREIGN KEY (url_id) REFERENCES urls(id) ON DELETE CASCADE,
    FOREIGN KEY (fact_id) REFERENCES fact_definitions(id),
    UNIQUE(url_id, fact_id)
);

CREATE INDEX idx_url_facts_url ON url_facts(url_id);
CREATE INDEX idx_url_facts_fact ON url_facts(fact_id);
CREATE INDEX idx_url_facts_value ON url_facts(fact_id, value);
```

### Classification Definitions Table

```sql
CREATE TABLE classification_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,              -- 'article', 'hub', 'error-page'
    description TEXT,
    color TEXT,                             -- For UI display
    priority INTEGER DEFAULT 0,             -- For ordering in UI
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Classification Rules Table

```sql
CREATE TABLE classification_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_set_id INTEGER NOT NULL,           -- FK to rule_sets (version grouping)
    classification_id INTEGER NOT NULL,      -- FK to classification_definitions
    rule_order INTEGER NOT NULL,            -- Evaluation order (first match wins)
    rule_expression TEXT NOT NULL,          -- JSON boolean expression
    description TEXT,                        -- Human explanation
    
    FOREIGN KEY (classification_id) REFERENCES classification_definitions(id),
    UNIQUE(rule_set_id, rule_order)
);

-- Example rule_expression:
-- {"and": ["url.hasDateSegment", "schema.hasArticleType"]}
-- {"or": ["negative.hasErrorTitle", "negative.isEmpty"]}
-- {"and": ["url.isTopLevelSection", {"not": "schema.hasArticleType"}]}
```

### URL Classifications Table

```sql
CREATE TABLE url_classifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url_id INTEGER NOT NULL,
    classification_id INTEGER NOT NULL,
    rule_set_id INTEGER NOT NULL,           -- Which version of rules produced this
    rule_id INTEGER,                        -- Which specific rule matched
    classified_at TEXT DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (url_id) REFERENCES urls(id) ON DELETE CASCADE,
    FOREIGN KEY (classification_id) REFERENCES classification_definitions(id),
    UNIQUE(url_id, rule_set_id)
);

CREATE INDEX idx_url_classifications_url ON url_classifications(url_id);
CREATE INDEX idx_url_classifications_class ON url_classifications(classification_id);
```

---

## Code Structure

```
src/facts/
├── index.js                    # Main exports
├── FactBase.js                 # Abstract base class for all facts
├── FactRegistry.js             # Registry of all fact definitions
├── FactStore.js                # Database operations for facts
├── FactExtractor.js            # Orchestrates fact extraction
│
├── url/
│   ├── UrlFact.js              # Base class for URL facts
│   ├── HasDateSegment.js       # url.hasDateSegment
│   ├── HasSlugPattern.js       # url.hasSlugPattern
│   ├── HasArticleKeyword.js    # url.hasArticleKeyword
│   ├── HasPaginationParam.js   # url.hasPaginationParam
│   ├── IsTopLevelSection.js    # url.isTopLevelSection
│   └── index.js                # Exports all URL facts
│
├── document/
│   ├── DocumentFact.js         # Base class for document facts
│   ├── HasArticleElement.js    # doc.hasArticleElement
│   ├── HasTimeElement.js       # doc.hasTimeElement
│   ├── HasBylinePattern.js     # doc.hasBylinePattern
│   ├── HasBlockquote.js        # doc.hasBlockquote
│   └── index.js                # Exports all document facts
│
├── schema/
│   ├── SchemaFact.js           # Base class for schema facts
│   ├── HasArticleType.js       # schema.hasArticleType
│   ├── HasDatePublished.js     # schema.hasDatePublished
│   ├── HasAuthor.js            # schema.hasAuthor
│   └── index.js                # Exports all schema facts
│
├── meta/
│   ├── MetaFact.js             # Base class for meta tag facts
│   ├── HasOgTypeArticle.js     # meta.hasOgTypeArticle
│   ├── HasCanonicalUrl.js      # meta.hasCanonicalUrl
│   └── index.js                # Exports all meta facts
│
├── response/
│   ├── ResponseFact.js         # Base class for HTTP response facts
│   ├── IsRedirect.js           # response.isRedirect
│   ├── Is4xx.js                # response.is4xx
│   └── index.js                # Exports all response facts
│
└── page/
    ├── PageFact.js             # Base class for page structure facts
    ├── HasLoginForm.js         # page.hasLoginForm
    ├── HasSearchForm.js        # page.hasSearchForm
    └── index.js                # Exports all page facts

src/classifications/
├── index.js                    # Main exports
├── ClassificationEngine.js     # Evaluates rules against facts
├── ClassificationStore.js      # Database operations
├── RuleParser.js               # Parses JSON rule expressions
├── DecisionTreeRunner.js       # Executes decision trees
└── rules/                      # Rule set definitions (JSON)
    ├── v1.json                 # Initial rule set
    └── v2.json                 # Updated rules (versioned)
```

---

## Fact Base Class

```javascript
// src/facts/FactBase.js
'use strict';

/**
 * Abstract base class for all Facts.
 * 
 * A Fact is an objective, boolean observation about a URL or document.
 * Facts are computed once and stored in the database for reuse.
 */
class FactBase {
  /**
   * @param {Object} options
   * @param {string} options.name - Unique fact identifier (e.g., 'url.hasDateSegment')
   * @param {string} options.category - Fact category ('url', 'document', 'schema', 'meta', 'response', 'page')
   * @param {string} options.description - Human-readable description
   * @param {string} options.requires - Input requirement ('url', 'document', 'schema', 'headers')
   */
  constructor({ name, category, description, requires }) {
    if (!name) throw new Error('Fact requires a name');
    if (!category) throw new Error('Fact requires a category');
    if (!requires) throw new Error('Fact requires input specification');
    
    this.name = name;
    this.category = category;
    this.description = description || '';
    this.requires = requires;
  }

  /**
   * Compute the fact value for given input.
   * 
   * @abstract
   * @param {Object} input - Input data (shape depends on `requires`)
   * @returns {boolean}
   */
  compute(input) {
    throw new Error(`${this.constructor.name}.compute() must be implemented`);
  }

  /**
   * Get metadata for this fact.
   * @returns {Object}
   */
  getDefinition() {
    return {
      name: this.name,
      category: this.category,
      description: this.description,
      requires: this.requires,
      className: this.constructor.name
    };
  }
}

module.exports = { FactBase };
```

---

## URL Fact Base Class

```javascript
// src/facts/url/UrlFact.js
'use strict';

const { FactBase } = require('../FactBase');

/**
 * Base class for URL-based facts.
 * 
 * URL facts operate on the URL string only — no network access required.
 * They are very fast to compute.
 */
class UrlFact extends FactBase {
  constructor(options) {
    super({
      ...options,
      category: 'url',
      requires: 'url'
    });
  }

  /**
   * Parse URL into components.
   * @protected
   * @param {Object} input
   * @returns {Object|null}
   */
  parseUrl(input) {
    const urlString = input?.url;
    if (!urlString || typeof urlString !== 'string') {
      return null;
    }

    try {
      const parsed = new URL(urlString);
      return {
        url: urlString,
        protocol: parsed.protocol,
        host: parsed.hostname.toLowerCase(),
        port: parsed.port,
        path: parsed.pathname,
        segments: parsed.pathname.split('/').filter(Boolean),
        query: parsed.search,
        queryParams: Object.fromEntries(parsed.searchParams),
        hash: parsed.hash
      };
    } catch (e) {
      return null;
    }
  }
}

module.exports = { UrlFact };
```

---

## Example Concrete Fact

```javascript
// src/facts/url/HasDateSegment.js
'use strict';

const { UrlFact } = require('./UrlFact');

/**
 * Fact: URL path contains a date segment pattern (YYYY/MM/DD).
 * 
 * Examples:
 *   /2024/11/28/story-slug  → true
 *   /news/2024/11/28/       → true
 *   /news/latest            → false
 *   /article?date=2024-11-28 → false (date in query, not path)
 */
class HasDateSegment extends UrlFact {
  constructor() {
    super({
      name: 'url.hasDateSegment',
      description: 'URL path contains /YYYY/MM/DD/ date pattern'
    });
    
    // Matches /2024/11/28/ or /2024/11/28
    this.pattern = /\/\d{4}\/\d{2}\/\d{2}(?:\/|$)/;
  }

  compute(input) {
    const parsed = this.parseUrl(input);
    if (!parsed) return false;
    
    return this.pattern.test(parsed.path);
  }
}

module.exports = { HasDateSegment };
```

---

## Classification Rule Format

Rules are defined as JSON with boolean expressions:

```json
{
  "id": "rule-set-v1",
  "version": 1,
  "created": "2024-11-28",
  "rules": [
    {
      "order": 1,
      "classification": "error-page",
      "description": "Pages with error response or error indicators",
      "expression": {
        "or": [
          "response.is4xx",
          "page.hasErrorTitle"
        ]
      }
    },
    {
      "order": 2,
      "classification": "login-page",
      "description": "Authentication pages",
      "expression": "page.hasLoginForm"
    },
    {
      "order": 3,
      "classification": "article",
      "description": "Strong article signals from schema",
      "expression": {
        "and": [
          "schema.hasArticleType",
          "schema.hasArticleBody"
        ]
      }
    },
    {
      "order": 4,
      "classification": "article",
      "description": "Article pattern from URL + document structure",
      "expression": {
        "and": [
          "url.hasDateSegment",
          "doc.hasArticleElement",
          {"not": "page.hasLoginForm"}
        ]
      }
    },
    {
      "order": 5,
      "classification": "hub",
      "description": "Top-level section without article markers",
      "expression": {
        "and": [
          "url.isTopLevelSection",
          {"not": "schema.hasArticleType"},
          {"not": "url.hasDateSegment"}
        ]
      }
    },
    {
      "order": 99,
      "classification": "unknown",
      "description": "Default when no rules match",
      "expression": true
    }
  ]
}
```

---

## Classification Engine

```javascript
// src/classifications/ClassificationEngine.js
'use strict';

/**
 * Evaluates classification rules against stored facts.
 */
class ClassificationEngine {
  constructor({ factStore, ruleSet }) {
    this.factStore = factStore;
    this.ruleSet = ruleSet;
  }

  /**
   * Classify a URL based on its stored facts.
   * 
   * @param {number} urlId - URL ID in database
   * @returns {Promise<{classification: string, rule: object, facts: object}>}
   */
  async classify(urlId) {
    // Load all facts for this URL
    const facts = await this.factStore.getFactsForUrl(urlId);
    
    // Evaluate rules in order
    for (const rule of this.ruleSet.rules) {
      const matches = this.evaluateExpression(rule.expression, facts);
      if (matches) {
        return {
          classification: rule.classification,
          rule: rule,
          facts: facts
        };
      }
    }
    
    return {
      classification: 'unknown',
      rule: null,
      facts: facts
    };
  }

  /**
   * Evaluate a boolean expression against facts.
   * 
   * @param {string|object|boolean} expr - Expression to evaluate
   * @param {Object} facts - Map of fact name → boolean value
   * @returns {boolean}
   */
  evaluateExpression(expr, facts) {
    // Literal true/false
    if (typeof expr === 'boolean') {
      return expr;
    }
    
    // Fact name reference
    if (typeof expr === 'string') {
      return facts[expr] === true;
    }
    
    // Compound expression
    if (typeof expr === 'object') {
      if ('and' in expr) {
        return expr.and.every(sub => this.evaluateExpression(sub, facts));
      }
      if ('or' in expr) {
        return expr.or.some(sub => this.evaluateExpression(sub, facts));
      }
      if ('not' in expr) {
        return !this.evaluateExpression(expr.not, facts);
      }
    }
    
    return false;
  }
}

module.exports = { ClassificationEngine };
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)

1. **Database Migration**
   - Create `fact_definitions` table
   - Create `url_facts` table
   - Create `classification_definitions` table
   - Create `classification_rules` table
   - Create `url_classifications` table

2. **Core Classes**
   - `FactBase` abstract class
   - `UrlFact` base class
   - `FactRegistry` for registration
   - `FactStore` for database operations

3. **Initial URL Facts**
   - `url.hasDateSegment`
   - `url.hasSlugPattern`
   - `url.hasArticleKeyword`
   - `url.hasPaginationParam`
   - `url.isTopLevelSection`

### Phase 2: Document & Schema Facts (Week 2)

1. **Document Facts**
   - `DocumentFact` base class
   - `doc.hasArticleElement`
   - `doc.hasTimeElement`
   - `doc.hasBylinePattern`
   - `doc.hasBlockquote`

2. **Schema Facts**
   - `SchemaFact` base class
   - `schema.hasArticleType`
   - `schema.hasDatePublished`
   - `schema.hasAuthor`
   - `schema.hasArticleBody`

3. **Meta Facts**
   - `MetaFact` base class
   - `meta.hasOgTypeArticle`
   - `meta.hasCanonicalUrl`

### Phase 3: Classification Engine (Week 3)

1. **Rule System**
   - `RuleParser` for JSON expressions
   - `ClassificationEngine` evaluation
   - `ClassificationStore` for results

2. **Initial Rule Set**
   - Define v1 rules in JSON
   - Error page detection
   - Article detection
   - Hub detection

3. **Integration**
   - Hook into existing crawl pipeline
   - Backfill facts for existing URLs
   - Migrate from old classification system

### Phase 4: Boolean Classifier Studio (Week 4)

1. **Studio UI**
   - Fact browser (list all facts)
   - URL fact viewer (facts for specific URL)
   - Rule editor (create/modify rules)
   - Classification tester (test rules against URLs)

2. **Analytics**
   - Fact coverage reports
   - Classification distribution
   - Rule effectiveness metrics

3. **Debugging Tools**
   - "Why was this classified as X?" explainer
   - Fact computation tracer
   - Rule evaluation stepper

---

## Migration Strategy

### Preserving Existing Work

The current `schemaSignals.js` and `ArticleSignalsService.js` contain valuable extraction logic. We will:

1. **Extract** fact computation from existing code
2. **Wrap** existing functions as Fact classes
3. **Store** results in new fact tables
4. **Deprecate** inline signal usage gradually

### Parallel Running

1. Run new fact system alongside existing classification
2. Compare results, identify discrepancies
3. Tune rules until parity achieved
4. Switch over, keep old system for rollback

---

## Success Criteria

1. **All facts are boolean** — No scores, weights, or fuzzy values
2. **Facts are reusable** — Computed once, stored, queried many times
3. **Rules are data** — Classification logic in JSON, not code
4. **Full audit trail** — Can explain any classification
5. **Studio enables iteration** — Non-developers can tweak rules
6. **Performance** — Classification from stored facts < 10ms

---

## Open Questions

1. **Fact versioning** — When a fact definition changes, do we recompute all historical values?
2. **Compound facts** — Should we allow facts that depend on other facts, or keep them all atomic?
3. **Confidence** — Do we need a "unknown/null" state for facts where input is missing?
4. **Bulk operations** — How to efficiently compute all facts for 100k URLs?

---

## Appendix: Relationship to Existing Code

| Existing | New Equivalent |
|----------|----------------|
| `schemaSignals.hasArticleType` | `schema.hasArticleType` fact |
| `ArticleSignalsService.looksLikeArticle()` | Compound rule in classification engine |
| `evaluateArticleCandidate()` | Classification engine with article rules |
| `placeHubDetector.shouldScreenByArticle` | Rule: `schema.hasArticleType AND schema.hasArticleBody` |

The new system doesn't replace the existing code immediately — it provides a cleaner abstraction that we migrate to incrementally.
