# Multi-Stage Classification Architecture

## The Core Question (Clarified)

You're asking about **separation of concerns** in classification:

1. **URL-only classification** (current decision tree) — fast, works before downloading
2. **Content-based classification** — uses word count, link density, schema.org, paragraphs
3. **Puppeteer-based analysis** — rendered DOM, visual structure, JavaScript-generated content

**Your concern**: Don't conflate these into one system. Each stage has different inputs and should run independently, with results that can be combined intelligently.

---

## Current State Assessment

### What Exists Today

| Stage | System | Inputs | Where |
|-------|--------|--------|-------|
| **1. URL-Only** | Decision Tree | URL patterns, path depth, slug length | `config/decision-trees/url-classification.json` |
| **2. Content Signals** | ArticleSignalsService | Word count, link density, schema.org, paragraphs | `src/analysis/articleDetection.js` |
| **3. Content Extraction** | ContentConfidenceScorer | Readability output, metadata completeness | `src/analysis/ContentConfidenceScorer.js` |
| **4. Combined** | `evaluateArticleCandidate()` | Merges URL + content signals | `src/analysis/articleDetection.js` |

### What's Missing

1. **Puppeteer-based classification** — not integrated into the pipeline
2. **Clear stage boundaries** — `evaluateArticleCandidate()` mixes URL and content signals
3. **Measurement infrastructure** — no unified way to compare stage accuracy
4. **Confidence aggregation** — no principled way to combine multi-stage results

---

## Proposed Architecture: Classification Cascade

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CLASSIFICATION CASCADE                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  STAGE 1: URL-ONLY (Pre-Download)                                  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Input: URL string                                            │  │
│  │ System: Decision Tree (url-classification.json)              │  │
│  │ Output: { classification, confidence, reason, signals }      │  │
│  │ Use: Crawl prioritization, queue ordering                    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              ↓                                      │
│  STAGE 2: CONTENT-SIGNALS (Post-Download, HTML only)               │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Input: Raw HTML + Stage 1 result                             │  │
│  │ System: ContentSignalsClassifier (NEW)                       │  │
│  │ Signals: word count, link density, schema.org, p/h2/h3 ratio│  │
│  │ Output: { classification, confidence, signals }              │  │
│  │ Use: Most articles, fast extraction                          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              ↓                                      │
│  STAGE 3: PUPPETEER (Low-confidence or JS-heavy sites)             │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Input: URL (re-fetched with browser) + Stage 1/2 results     │  │
│  │ System: PuppeteerClassifier (NEW)                            │  │
│  │ Signals: Rendered DOM, visual structure, main content area   │  │
│  │ Output: { classification, confidence, signals }              │  │
│  │ Use: SPA sites, JS-rendered content, ambiguous cases         │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              ↓                                      │
│  AGGREGATOR: Combine all stage results                              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Input: Stage 1 + Stage 2 + Stage 3 (optional) results        │  │
│  │ Logic: Weighted voting, confidence thresholds, overrides     │  │
│  │ Output: Final { classification, confidence, provenance }     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Design Principles

### 1. Stage Independence
Each classifier is a **standalone module** with:
- Clear input interface
- Standard output format: `{ classification, confidence, reason, signals }`
- No dependencies on other stages (can run alone)

### 2. Progressive Refinement
- Stage 1 runs on ALL URLs (cheap)
- Stage 2 runs on downloaded content (medium cost)
- Stage 3 runs only when:
  - Stage 2 confidence < threshold
  - Site known to be JS-heavy
  - Explicit request for verification

### 3. Provenance Tracking
Store which stages contributed to final classification:
```javascript
{
  classification: "article",
  confidence: 0.92,
  provenance: {
    url: { classification: "hub", confidence: 0.75, reason: "depth2-topic-page" },
    content: { classification: "article", confidence: 0.95, reason: "high-word-count+schema" },
    puppeteer: null,  // not run
    aggregator: { decision: "content-override", reason: "content-confidence > url-confidence + 0.15" }
  }
}
```

### 4. Measurement Infrastructure
Each stage should:
- Log its decisions to `task_events`
- Support A/B comparison mode
- Have ground-truth validation against labeled samples

---

## Implementation Plan

### Phase 1: Refactor Existing Systems (Day 1-2)

**1.1 Extract URL-Only Classifier**
```javascript
// src/classifiers/UrlClassifier.js
class UrlClassifier {
  constructor(decisionTree) { ... }
  classify(url) → { classification, confidence, reason, signals }
}
```

**1.2 Extract Content Signals Classifier**
```javascript
// src/classifiers/ContentSignalsClassifier.js
class ContentSignalsClassifier {
  constructor(options) { ... }
  classify(html, url, metadata = {}) → { classification, confidence, signals }
}
```
- Move logic from `articleDetection.js` into standalone class
- Remove URL pattern checks (those belong in Stage 1)
- Focus purely on content: word count, link density, schema, structure

**1.3 Create Aggregator**
```javascript
// src/classifiers/ClassificationAggregator.js
class ClassificationAggregator {
  aggregate(urlResult, contentResult, puppeteerResult = null) → {
    classification, confidence, provenance
  }
}
```

### Phase 2: Add Puppeteer Classifier (Day 3-4)

**2.1 Create PuppeteerClassifier**
```javascript
// src/classifiers/PuppeteerClassifier.js
class PuppeteerClassifier {
  constructor(browserPool) { ... }
  async classify(url) → { classification, confidence, signals }
}
```
Signals to extract:
- Main content area dimensions (large = article)
- Number of article-like elements in rendered DOM
- Presence of comments section
- Ad density (high = hub)
- Scroll depth of main content

**2.2 Integration Points**
- Crawl pipeline: automatic fallback when Stage 2 low-confidence
- CLI tool: `node tools/dev/classify-url.js --puppeteer <url>`
- Backfill task: re-classify low-confidence items with Puppeteer

### Phase 3: Measurement & Ground Truth (Day 5-6)

**3.1 Labeled Sample Set**
Create `config/classification-samples.json`:
```json
[
  { "url": "https://...", "actual": "article", "source": "manual" },
  { "url": "https://...", "actual": "hub", "source": "manual" }
]
```

**3.2 Accuracy Dashboard**
- Compare Stage 1 vs Stage 2 vs Combined
- Track confidence calibration (are 90% confidence predictions right 90% of time?)
- Identify patterns where stages disagree

---

## Done When

- [x] `src/classifiers/Stage1UrlClassifier.js` wraps existing decision tree
- [x] `src/classifiers/Stage2ContentClassifier.js` extracts content-only logic
- [x] `src/classifiers/StageAggregator.js` combines stage results
- [x] `src/classifiers/Stage3PuppeteerClassifier.js` for rendered DOM analysis
- [x] Classification cascade check script passes
- [x] Puppeteer classifier check script works
- [x] Provenance tracking shows stage contributions
- [x] Existing `evaluateArticleCandidate()` still works (backward compatible)
- [x] New `classifyWithCascade()` function provides enhanced API
- [x] New `classifyWithFullCascade()` async function supports all 3 stages

## Change Set

```
src/classifiers/
├── index.js                      # Exports all classifiers (UPDATED)
├── Stage1UrlClassifier.js        # Stage 1: URL-only (NEW)
├── Stage2ContentClassifier.js    # Stage 2: Content signals (NEW)
├── Stage3PuppeteerClassifier.js  # Stage 3: Puppeteer/rendered DOM (NEW)
├── StageAggregator.js            # Combine stages (NEW)
├── boolean/                      # Existing boolean classifiers (unchanged)
└── __tests__/

src/analysis/
├── articleDetection.js           # Updated with classifyWithCascade() (UPDATED)

checks/
├── classification-cascade.check.js  # Integration test (NEW)
├── puppeteer-classifier.check.js    # Stage 3 test (NEW)

docs/diagrams/
├── classification-cascade.svg    # Architecture diagram (NEW)
```

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing classification | Keep `evaluateArticleCandidate()` as facade during migration |
| Puppeteer overhead | Only invoke on low-confidence cases |
| Stage disagreement | Clear aggregation rules with provenance logging |

## Tests / Validation

- [ ] `checks/url-classifier.check.js` — Stage 1 isolation test
- [ ] `checks/content-signals-classifier.check.js` — Stage 2 isolation test
- [ ] `checks/classification-aggregator.check.js` — Aggregation logic
- [ ] Accuracy comparison on labeled samples

---

## Answers to Your Questions

### "Has Puppeteer-based analysis been incorporated?"
**No.** There is visual analysis code (`VisualAnalyzer`) but it's not integrated into the classification pipeline. The Puppeteer fallback in the crawler is for *fetching*, not classifying.

### "Is content being used to determine if pages are articles?"
**Yes, partially.** `articleDetection.js` uses:
- Word count
- Link density
- Schema.org signals
- Paragraph count

But it's **mixed with URL patterns** in `evaluateArticleCandidate()`. This should be separated.

### "How to make multiple systems work together?"
**The Aggregator pattern.** Each classifier runs independently, produces a standard result, and the aggregator combines them with explicit logic:
- High-confidence from any stage can override
- Conflicting results trigger Stage 3
- All decisions are logged with provenance

---

## Immediate Next Steps

1. [x] Review and approve this architecture
2. [x] Create `src/classifiers/Stage1UrlClassifier.js` (wrap existing decision tree)
3. [x] Create `src/classifiers/Stage2ContentClassifier.js` (extract from articleDetection)
4. [x] Create `src/classifiers/StageAggregator.js`
5. [x] Add checks for each new classifier (integration check)
6. [x] Create `src/classifiers/Stage3PuppeteerClassifier.js` (rendered DOM analysis)
7. [x] Add `classifyWithFullCascade()` async function for all 3 stages
8. [ ] Create accuracy comparison dashboard (Phase 3)
9. [ ] Create ground truth labeled samples

---

## Implementation Summary (Phase 1 Complete)

### Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `src/classifiers/Stage1UrlClassifier.js` | 356 | URL-only classification using decision tree |
| `src/classifiers/Stage2ContentClassifier.js` | 468 | Content-only analysis (word count, schema.org, etc.) |
| `src/classifiers/StageAggregator.js` | 277 | Combines stage results with weighted voting |
| `checks/classification-cascade.check.js` | 150 | Integration test (10/10 tests pass) |

### API Examples

**URL-only (pre-download):**
```javascript
const { Stage1UrlClassifier } = require('./src/classifiers');
const classifier = new Stage1UrlClassifier();
const result = classifier.classify('https://www.theguardian.com/uk-news/2024/jan/15/story');
// { classification: 'article', confidence: 0.95, reason: 'guardian-date-pattern', signals: {...} }
```

**Content-only (post-download):**
```javascript
const { Stage2ContentClassifier } = require('./src/classifiers');
const classifier = new Stage2ContentClassifier();
const result = classifier.classify(htmlContent);
// { classification: 'article', confidence: 0.85, reason: 'high-word-count+schema', signals: {...} }
```

**Full cascade with provenance:**
```javascript
const { classifyWithCascade } = require('./src/analysis/articleDetection');
const result = classifyWithCascade(url, html);
// {
//   classification: 'article',
//   confidence: 0.92,
//   isArticle: true,
//   provenance: {
//     url: { classification: 'article', confidence: 0.95, reason: '...' },
//     content: { classification: 'article', confidence: 0.85, reason: '...' },
//     aggregator: { decision: 'url-high-confidence', reason: '...' }
//   }
// }
```

### Backward Compatibility

The original `evaluateArticleCandidate()` function remains unchanged and all existing tests pass.
