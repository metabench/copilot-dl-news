# Chapter 6: Crawl Operations

> **Implementation Status**: ✅ Fully implemented with 18 operation types.

## Codebase Quick Reference

| Component | File Location | Status |
|-----------|---------------|--------|
| Operations facade | `src/crawler/CrawlOperations.js` | ✅ Complete |
| Operations directory | `src/crawler/operations/` | ✅ 18 files |
| Site Explorer | `src/crawler/operations/SiteExplorerOperation.js` | ✅ Complete |
| Sequence Runner | `src/crawler/operations/SequenceRunner.js` | ✅ Complete |
| Registry | `src/crawler/operations/OperationRegistry.js` | ✅ Complete |
| Config | `config/crawl-runner.json` | ✅ Operation defaults |

## What Are Operations?

Operations are **named crawl configurations** that bundle:
- Purpose and scope
- Default limits (pages, depth)
- Priority rules
- URL filtering patterns
- Post-crawl actions

Instead of specifying 20 parameters, agents select an operation name.

---

## Available Operations

| Operation | Purpose | Max Pages | Max Depth |
|-----------|---------|-----------|-----------|
| `quickDiscovery` | Fast site probe | 10 | 1 |
| `siteExplorer` | Thorough exploration | 500 | 3 |
| `hubRefresh` | Update known hubs | 50 | 1 |
| `newsDiscovery` | Find news articles | 200 | 2 |
| `fullCrawl` | Complete site crawl | 10000 | 5 |
| `basicArticleCrawl` | Simple article fetch | 100 | 2 |

---

## Operation Definitions

### quickDiscovery

```javascript
module.exports = {
  name: 'quickDiscovery',
  description: 'Fast site probe to understand structure',
  
  defaults: {
    maxPages: 10,
    maxDepth: 1,
    respectRobots: true,
    followExternalLinks: false
  },
  
  priorityRules: [
    { pattern: /\/$/,        boost: 2.0, reason: 'root/index' },
    { pattern: /\/news\//,   boost: 1.5, reason: 'news section' },
    { pattern: /\/about\//,  boost: 1.0, reason: 'about pages' }
  ],
  
  urlFilters: {
    exclude: [
      /\.(jpg|png|gif|pdf|zip)$/i,
      /\/wp-admin\//,
      /\/login\//
    ]
  }
};
```

### siteExplorer

```javascript
module.exports = {
  name: 'siteExplorer',
  description: 'Thorough site exploration for content discovery',
  
  defaults: {
    maxPages: 500,
    maxDepth: 3,
    respectRobots: true,
    followExternalLinks: false,
    deduplicateContent: true
  },
  
  priorityRules: [
    { pattern: /\/news\//,     boost: 2.0 },
    { pattern: /\/article\//,  boost: 1.8 },
    { pattern: /\/latest\//,   boost: 1.5 },
    { pattern: /\/\d{4}\//,    boost: 1.2, reason: 'year in path' },
    { pattern: /\/archive\//,  penalty: 0.3 },
    { pattern: /\/tag\//,      penalty: 0.5 },
    { pattern: /\/category\//, penalty: 0.5 }
  ],
  
  urlFilters: {
    exclude: [
      /\.(jpg|png|gif|pdf|zip|mp4|mp3)$/i,
      /\/wp-admin\//,
      /\/feed\//,
      /\/rss\//,
      /[?&]page=\d+$/,  // Pagination
      /[?&]print=/      // Print versions
    ]
  },
  
  contentFilters: {
    minWordCount: 100,
    maxWordCount: 50000,
    requiredElements: ['article', 'main', '.content']
  }
};
```

### hubRefresh

```javascript
module.exports = {
  name: 'hubRefresh',
  description: 'Refresh known hub pages for new content',
  
  defaults: {
    maxPages: 50,
    maxDepth: 1,
    respectRobots: true,
    onlyFollowNewLinks: true
  },
  
  priorityRules: [
    { pattern: /\/$/,         boost: 3.0, reason: 'homepage' },
    { pattern: /\/news\/?$/,  boost: 2.5, reason: 'news index' },
    { pattern: /\/latest\/?$/,boost: 2.5, reason: 'latest page' }
  ],
  
  // Only fetch pages we haven't seen in 24 hours
  freshnessCheck: {
    maxAgeHours: 24,
    skipIfFresh: true
  }
};
```

---

## Operation Selection

### By AI Agent

```powershell
# Agent decides based on goal
$goal = "check for new articles"

if ($goal -match "new articles|refresh") {
    $operation = "hubRefresh"
} elseif ($goal -match "explore|discover") {
    $operation = "siteExplorer"
} else {
    $operation = "quickDiscovery"
}

node tools/dev/crawl-api.js jobs start $operation https://example.com --json
```

### Operation Decision Tree

```
What's the goal?
        │
        ├── Quick site check? ──▶ quickDiscovery
        │
        ├── Find all content? ──▶ siteExplorer
        │
        ├── Update known sites? ──▶ hubRefresh
        │
        ├── News articles only? ──▶ newsDiscovery
        │
        └── Everything? ──▶ fullCrawl
```

---

## Priority Scoring

### How Scoring Works

Each URL gets a priority score:

```
Base score: 1.0

Apply rules in order:
  + boost if pattern matches
  - penalty if pattern matches
  + depth bonus (shallower = higher)
  + freshness bonus (never seen = higher)

Final score: sum of all factors
```

### Example Scoring

```
URL: https://bbc.com/news/world/2026/01/story.html

Base:                    1.0
/news/ boost (2.0):     +2.0
/2026/ year boost:      +1.2
Depth 3 penalty:        -0.3
Never seen bonus:       +0.5
─────────────────────────────
Final score:             4.4
```

### Priority Queue

URLs processed in score order:

```
┌─────────────────────────────────────────────────────────────┐
│ Priority Queue (max-heap by score)                          │
├─────────────────────────────────────────────────────────────┤
│ 4.4  │ https://bbc.com/news/world/2026/01/story.html       │
│ 3.2  │ https://bbc.com/news/uk/latest.html                 │
│ 2.1  │ https://bbc.com/sport/football/results.html         │
│ 0.8  │ https://bbc.com/archive/2020/index.html             │
│ 0.3  │ https://bbc.com/about/careers.html                  │
└─────────────────────────────────────────────────────────────┘
```

---

## URL Filtering

### Exclude Patterns

```javascript
const excludePatterns = [
  // Static assets
  /\.(jpg|jpeg|png|gif|svg|ico|webp)$/i,
  /\.(css|js|woff|woff2|ttf)$/i,
  /\.(pdf|doc|docx|xls|xlsx)$/i,
  /\.(mp4|mp3|avi|mov|wav)$/i,
  /\.(zip|tar|gz|rar)$/i,
  
  // Admin/system
  /\/wp-admin\//,
  /\/wp-includes\//,
  /\/admin\//,
  /\/login\//,
  /\/logout\//,
  /\/register\//,
  
  // Feeds and APIs
  /\/feed\/?$/,
  /\/rss\/?$/,
  /\/api\//,
  /\.xml$/,
  /\.json$/,
  
  // Pagination noise
  /[?&]page=\d+/,
  /[?&]p=\d+/,
  /\/page\/\d+\/?$/,
  
  // Tracking/share
  /[?&]utm_/,
  /[?&]fbclid=/,
  /\/share\//,
  /\/print\//
];
```

### Include Patterns (whitelist mode)

```javascript
const includePatterns = [
  /\/news\//,
  /\/article\//,
  /\/story\//,
  /\/post\//,
  /\/\d{4}\/\d{2}\//  // Date paths
];
```

---

## Depth Management

### Depth Limits

```
Depth 0: Seed URL (e.g., https://bbc.com/)
Depth 1: Links from seed (e.g., https://bbc.com/news/)
Depth 2: Links from depth 1 (e.g., https://bbc.com/news/article1)
Depth 3: Links from depth 2 (e.g., https://bbc.com/news/article1/related)
```

### Depth Strategy by Operation

| Operation | Max Depth | Rationale |
|-----------|-----------|-----------|
| quickDiscovery | 1 | Just see what's linked from home |
| hubRefresh | 1 | Only direct links from hubs |
| siteExplorer | 3 | Deep enough for most content |
| fullCrawl | 5 | Catch everything |

---

## Post-Crawl Actions

Operations can define what happens after crawling:

```javascript
module.exports = {
  name: 'newsDiscovery',
  
  // ... other config ...
  
  postCrawl: {
    // Write evidence file
    writeEvidence: true,
    evidencePath: 'tmp/crawl-evidence',
    
    // Trigger analysis
    triggerAnalysis: true,
    analysisVersion: 'latest',
    
    // Notify
    notify: {
      method: 'log',  // or 'webhook', 'file'
      onComplete: true,
      onError: true
    }
  }
};
```

---

## Custom Operations

### Creating a New Operation

```javascript
// src/crawler/operations/myCustomOp.js

module.exports = {
  name: 'myCustomOp',
  description: 'Custom crawl for specific use case',
  
  defaults: {
    maxPages: 100,
    maxDepth: 2,
    respectRobots: true
  },
  
  priorityRules: [
    { pattern: /\/target-section\//, boost: 3.0 }
  ],
  
  urlFilters: {
    include: [/\/target-section\//],
    exclude: [/\/admin\//]
  },
  
  contentFilters: {
    minWordCount: 200,
    requiredElements: ['.article-body']
  }
};
```

### Registering the Operation

```javascript
// src/crawler/operations/index.js

const operations = {
  quickDiscovery: require('./quickDiscovery'),
  siteExplorer: require('./siteExplorer'),
  hubRefresh: require('./hubRefresh'),
  newsDiscovery: require('./newsDiscovery'),
  myCustomOp: require('./myCustomOp')  // Add here
};

module.exports = operations;
```

---

## API Usage

### List Available Operations

```powershell
node tools/dev/crawl-api.js ops list --json
```

```json
{
  "operations": [
    {
      "name": "quickDiscovery",
      "description": "Fast site probe",
      "defaults": { "maxPages": 10, "maxDepth": 1 }
    },
    {
      "name": "siteExplorer",
      "description": "Thorough exploration",
      "defaults": { "maxPages": 500, "maxDepth": 3 }
    }
  ]
}
```

### Start with Operation

```powershell
# Use operation defaults
node tools/dev/crawl-api.js jobs start siteExplorer https://example.com --json

# Override specific options
node tools/dev/crawl-api.js jobs start siteExplorer https://example.com \
  --max-pages 100 \
  --max-depth 2 \
  --json
```

---

## Next Chapter

[Chapter 7: Telemetry & Events →](07-telemetry-events.md)
