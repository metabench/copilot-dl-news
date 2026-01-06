# Chapter 8: Crawl Modes

## Overview

The crawler supports multiple modes optimized for different use cases. Each mode configures services, planning, and prioritization differently.

## Available Modes

| Mode | Purpose | Planning | Priority Focus |
|------|---------|----------|----------------|
| `basic` | Simple breadth-first crawl | None | Depth-based |
| `intelligent` | Strategic crawl with learning | HierarchicalPlanner | Gap-driven |
| `gazetteer` | Geographic coverage | CountryHubPlanner | Place hubs |
| `structure-only` | Site structure discovery | PatternInference | Navigation |

## Basic Mode

Simple breadth-first crawl without intelligent planning.

### Configuration

```javascript
const crawler = new NewsCrawler('https://example.com', {
  crawlType: 'basic',
  maxDownloads: 1000,
  maxDepth: 5,
  concurrency: 3
});
```

### Characteristics

- **Queue:** FIFO or simple priority (depth-based)
- **Planning:** None - follows links as discovered
- **Priority:** `basePriority = typeWeight + depth`
- **Best for:** Small sites, quick scans, testing

### Data Flow

```
Start URL → Fetch → Extract Links → Enqueue → Repeat
                                       ↓
                              (depth-limited)
```

## Intelligent Mode

Strategic crawl with learning, gap analysis, and problem clustering.

### Configuration

```javascript
const crawler = new NewsCrawler('https://theguardian.com', {
  crawlType: 'intelligent',
  maxDownloads: 10000,
  usePriorityQueue: true,
  features: {
    gapDrivenPrioritization: true,
    plannerKnowledgeReuse: true,
    problemClustering: true
  }
});
```

### Characteristics

- **Queue:** Min-heap priority queue
- **Planning:** HierarchicalPlanner with IntelligentPlanRunner
- **Priority:** Enhanced scoring with bonuses and gap predictions
- **Best for:** Large news sites, comprehensive coverage

### Initialization Stages

```
1. Bootstrap      → Validate domain suitability
2. Infer Patterns → Learn section patterns from homepage
3. Nav Discovery  → Map navigation structure (max 5 pages)
4. Hub Planning   → Generate country hub candidates
5. Verification   → Check hubs against cache
6. Hub Seeding    → Seed plan with priority hubs
7. Analysis       → Deep analysis of samples
```

### Priority Scoring

```javascript
priority = basePriority
         - discoveryBonus        // +20 for adaptive-seed
         - gapPredictionBonus    // +15 for gap coverage
         - clusterBoost          // Up to +20 for problem clusters
         - knowledgeReuseBonus   // Patterns from learning
```

## Gazetteer Mode

Geographic coverage with place hub discovery.

### Configuration

```javascript
const crawler = new NewsCrawler('https://theguardian.com', {
  crawlType: 'gazetteer',
  gazetteerPath: './data/gazetteer.db',
  maxDownloads: 50000,
  features: {
    placeHubGuessing: true,
    coverageTracking: true
  }
});
```

### Characteristics

- **Queue:** Priority queue with country/place weighting
- **Planning:** CountryHubPlanner + place hub guessing
- **Priority:** Strong bias toward country hubs
- **Best for:** Building geographic news coverage

### Place Hub Discovery

```javascript
// CountryHubPlanner generates candidates
const candidates = await countryHubPlanner.computeCandidates(host);
// Output: ['/world/us/', '/world/uk/', '/world/france/', ...]

// PlaceHubGuesser finds additional place hubs
const guesses = await placeHubGuesser.guess(host, {
  gazetteer,
  existingHubs: candidates
});
```

### Total Prioritisation

```javascript
// Priority floors for focused country crawls
const FLOORS = {
  'country': -5000,           // Highest priority
  'country-related': -3000,   // High priority
  'other': 5000000            // Effectively dropped
};
```

### Coverage Tracking

```javascript
// Track coverage by country
const coverage = {
  'us': { found: 150, total: 200, percentage: 75 },
  'uk': { found: 120, total: 180, percentage: 67 },
  'france': { found: 80, total: 150, percentage: 53 }
};

// Gap predictions fill coverage gaps
gapPredictions = [
  { url: '/world/germany/', confidence: 0.8, lift: 0.1 },
  { url: '/world/spain/', confidence: 0.75, lift: 0.08 }
];
```

## Structure-Only Mode

Discovers site structure without full article extraction.

### Configuration

```javascript
const crawler = new NewsCrawler('https://example.com', {
  crawlType: 'structure-only',
  maxDownloads: 500,
  skipArticleProcessing: true,
  extractLinksOnly: true
});
```

### Characteristics

- **Queue:** FIFO with hub preference
- **Planning:** PatternInference only
- **Priority:** Navigation pages prioritized
- **Best for:** Site mapping, structure analysis, pre-crawl reconnaissance

### Output

```javascript
{
  structure: {
    sections: ['world', 'sport', 'business', 'tech'],
    hubUrls: ['/world/', '/sport/', '/business/'],
    articlePatterns: ['/YYYY/MM/DD/', '/article/'],
    navigationDepth: 3
  },
  links: {
    total: 1500,
    internal: 1200,
    external: 300,
    bySection: { world: 400, sport: 350, business: 250, tech: 200 }
  }
}
```

## Mode Selection

### Automatic Mode Detection

```javascript
// Based on options, the crawler may auto-select mode
function selectCrawlMode(options) {
  if (options.gazetteerPath) {
    return 'gazetteer';
  }

  if (options.structureOnly || options.extractLinksOnly) {
    return 'structure-only';
  }

  if (options.usePriorityQueue && options.maxDownloads > 1000) {
    return 'intelligent';
  }

  return 'basic';
}
```

### Mode Switching

Modes can be changed mid-crawl in some cases:

```javascript
// Switch from basic to intelligent after warm-up
crawler.on('milestone', (milestone) => {
  if (milestone.type === 'articles-100' && crawler.crawlType === 'basic') {
    crawler.enableIntelligentMode();
  }
});
```

## Feature Flags by Mode

| Feature | Basic | Intelligent | Gazetteer | Structure |
|---------|-------|-------------|-----------|-----------|
| Priority Queue | ○ | ● | ● | ○ |
| HierarchicalPlanner | ○ | ● | ○ | ○ |
| CountryHubPlanner | ○ | ○ | ● | ○ |
| Gap Prediction | ○ | ● | ● | ○ |
| Problem Clustering | ○ | ● | ● | ○ |
| Knowledge Reuse | ○ | ● | ● | ○ |
| Coverage Tracking | ○ | ○ | ● | ○ |
| Pattern Inference | ○ | ● | ● | ● |
| Article Processing | ● | ● | ● | ○ |

## Configuration Reference

### Common Options

```javascript
{
  // Core
  startUrl: 'https://example.com',
  crawlType: 'intelligent',         // Mode selection

  // Limits
  maxDownloads: 10000,
  maxDepth: 10,
  maxQueue: 50000,
  concurrency: 5,

  // Rate limiting
  rateLimitMs: 500,
  slowMode: false,

  // Database
  dbPath: './data/news.db',
  enableDb: true,

  // Caching
  preferCache: false,
  maxAgeMs: -1,

  // Output
  outputVerbosity: 1,
  dataDir: './data'
}
```

### Intelligent Mode Options

```javascript
{
  crawlType: 'intelligent',
  usePriorityQueue: true,

  // Planning
  enablePlanner: true,
  plannerMaxSeeds: 100,
  adaptiveBranching: true,

  // Features
  features: {
    gapDrivenPrioritization: true,
    plannerKnowledgeReuse: true,
    problemClustering: true,
    costAwarePriority: false
  },

  // Priority bonuses
  bonuses: {
    'adaptive-seed': 20,
    'gap-prediction': 15,
    'sitemap': 10
  }
}
```

### Gazetteer Mode Options

```javascript
{
  crawlType: 'gazetteer',
  gazetteerPath: './data/gazetteer.db',

  // Place hub discovery
  placeHubGuessing: true,
  countryHubPlanning: true,

  // Coverage
  coverageTracking: true,
  targetCountries: ['us', 'uk', 'fr', 'de'],

  // Total prioritisation (focus on countries)
  totalPrioritisationEnabled: true
}
```

## Mode Comparison Example

For `https://www.theguardian.com` with target of 10,000 articles:

| Metric | Basic | Intelligent | Gazetteer |
|--------|-------|-------------|-----------|
| Time to 1000 articles | ~2 hours | ~45 min | ~1 hour |
| Coverage uniformity | Low | Medium | High |
| Country coverage | Random | Good | Excellent |
| Duplicate avoidance | Low | High | High |
| Planning overhead | None | ~5 min | ~3 min |

## Next Chapter

Continue to [Chapter 9: Operations Runbook](./09-operations-runbook.md) for practical guidance on running and monitoring crawls.
