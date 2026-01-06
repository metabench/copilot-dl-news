# Content Analysis & Classification Handbook

**Version:** 1.0
**Audience:** Developers tuning article detection and place extraction
**Last Updated:** January 2026

## Overview

This handbook documents the content analysis and classification systems used to identify articles, extract places, and analyze content in the copilot-dl-news crawler.

## Table of Contents

1. [Analysis Pipeline Overview](./01-analysis-pipeline-overview.md) - page-analyzer → articleDetection → place-extraction
2. [Stage 1: URL Classification](./02-stage1-url-classification.md) - Signals, decision trees, confidence scoring
3. [Stage 2: Content Classification](./03-stage2-content-classification.md) - HTML analysis, word count, link density, schema.org
4. [Stage 3: Puppeteer Classification](./04-stage3-puppeteer-classification.md) - When to use, timeout tuning, cost tradeoffs
5. [Stage Aggregator](./05-stage-aggregator.md) - Confidence aggregation, provenance tracking, tie-breaking
6. [Place Extraction & Matching](./06-place-extraction-matching.md) - Gazetteer matchers, ArticlePlaceMatcher
7. [Deep Analysis](./07-deep-analysis.md) - Sentiment, key phrases, similarity detection
8. [Decision Tree Pattern Library](./08-decision-tree-patterns.md) - Examples for Guardian, Wikipedia, custom sites
9. [Tuning & Debugging](./09-tuning-debugging.md) - How to diagnose misclassifications

## Quick Start

```javascript
const { analyzePage } = require('./src/analysis/page-analyzer');

const result = await analyzePage({
  url: 'https://www.theguardian.com/world/2024/jan/15/article-title',
  html: articleHtml,
  gazetteer: gazetteerInstance,
  options: { enableDeepAnalysis: true }
});

// Result structure
{
  analysis: { ... },      // Main findings
  places: [...],          // Extracted places
  hubCandidate: { ... },  // Hub classification
  deepAnalysis: { ... },  // Sentiment & keywords
  timings: { ... }        // Performance metrics
}
```

## Pipeline Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        analyzePage()                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Phase 1: Context Inference (~5ms)                          │  │
│  │   → TLD, domain locale, URL segments                       │  │
│  └───────────────────────────────────────────────────────────┘  │
│                            ↓                                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Phase 2: Content Preparation (~100-500ms)                  │  │
│  │   → Text extraction, XPath learning, readability           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                            ↓                                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Phase 3: Analysis Building (~20-50ms)                      │  │
│  │   → Gazetteer matching, place detection                    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                            ↓                                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Phase 4: Hub Detection (~10-30ms)                          │  │
│  │   → Classify as hub/article/nav                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                            ↓                                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Phase 5: Deep Analysis (~5-20ms)                           │  │
│  │   → Sentiment, key phrases                                 │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Classification Cascade

```
Stage 1: URL        Stage 2: Content      Stage 3: Puppeteer
─────────────       ─────────────────     ──────────────────
5-50ms              50-200ms              1-5 seconds
No download         HTML analysis         Browser rendering

         └──────────────┴───────────────────┘
                         ↓
                  StageAggregator
                  ───────────────
                  Weighted voting
                  Provenance tracking
                  Final classification
```

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Signal Extraction** | Numeric features from URLs and HTML |
| **Confidence Score** | 0-1 probability of correct classification |
| **Gazetteer** | Database of place names with hierarchy |
| **Place Chain** | Hierarchical sequence of places from URL |
| **Provenance** | Tracking which stage determined classification |

## File Structure

```
src/analysis/
├── page-analyzer.js           # Main orchestrator
├── articleDetection.js        # Article classification
├── place-extraction.js        # Place extraction (~800 lines)
├── deep-analyzer.js           # Sentiment & key phrases
├── ContentConfidenceScorer.js # Confidence scoring
└── gazetteer-serialization.js # Gazetteer data handling

src/classifiers/
├── Stage1UrlClassifier.js     # URL-based classification
├── Stage2ContentClassifier.js # HTML-based classification
├── Stage3PuppeteerClassifier.js # Browser-based classification
├── StageAggregator.js         # Result aggregation
└── index.js                   # Public API

src/matching/
├── ArticlePlaceMatcher.js     # Place-article matching
├── BasicStringMatcher.js      # Simple string matching
└── ContextAnalysisMatcher.js  # Context-aware matching

config/decision-trees/
├── url-classification.json    # URL classification rules
└── decision-tree.schema.json  # JSON Schema
```

## Related Documentation

- [Crawler Architecture & Operations Guide](../crawler-architecture-operations-guide/README.md)
- [Database Quick Reference](../../DATABASE_QUICK_REFERENCE.md)
- [Testing Quick Reference](../../TESTING_QUICK_REFERENCE.md)
