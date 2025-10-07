# Refactoring Plan: Intelligent Navigation-First Crawling

**Status**: 🔮 **FUTURE VISION** — Not yet implemented  
**Created**: October 3, 2025  
**Last Reviewed**: October 7, 2025  
**Dependencies**: Requires Phase 3 service layer foundation (✅ Complete Oct 7, 2025)

> **⚠️ Important**: This document describes a **planned architectural evolution**, not the current system state.  
> For current architecture, see:
> - `SERVICE_LAYER_ARCHITECTURE.md` — Current service layer architecture (Phase 3, complete)
> - `PHASE_3_REFACTORING_COMPLETE.md` — Recent refactoring completion summary
> - `ARCHITECTURE_ANALYSIS_AND_IMPROVEMENTS.md` — Overall improvement roadmap

---

## Vision

Transform the crawler from a monolithic "fetch everything" approach into a phased, intelligent system:

1. **Discovery Phase**: Navigate and map the site structure without downloading full content
2. **Planning Phase**: Analyze discovered URLs, prioritize targets
3. **Acquisition Phase**: Selectively fetch only high-value articles

This separation enables:
- Faster site mapping (archive pages, category hubs)
- Better resource allocation (skip low-value pages)
- Incremental crawling (discover URLs today, fetch articles tomorrow)
- Knowledge reuse (learned patterns guide future crawls)

---

## Current Architecture Problems

### 1. **Tight Coupling: Discovery + Acquisition**

**Problem**: `PageExecutionService.processPage()` does both:
```javascript
// Lines 62-410 in PageExecutionService.js
const fetchResult = await this.fetchPipeline.fetch({ url });  // Downloads full page
// ... then extracts links
// ... then processes as article
```

**Impact**: 
- Cannot traverse archive listings without fetching full HTML
- Wastes bandwidth on navigation pages
- Cannot defer article acquisition

**Refactor**: Create separate services:
```javascript
// NEW: NavigationDiscoveryService
class NavigationDiscoveryService {
  async discoverLinks({ url, depth, strategy }) {
    // Fetch ONLY if needed (could use HEAD, partial fetch, or cache)
    // Extract links without processing content
    // Classify URL types (archive, hub, article, etc.)
    return { links, classification, needsFullFetch: false };
  }
}

// NEW: ContentAcquisitionService  
class ContentAcquisitionService {
  async acquireArticle({ url, signals, priority }) {
    // Only called for confirmed article URLs
    // Full HTML fetch, extraction, storage
    return { article, metadata };
  }
}
```

---

### 2. **Resume Endpoint: Hardcoded Strategies**

**Problem**: `api.resume-all.js` lines 140-160 hardcode args building:
```javascript
if (!args.length && queue.url) {
  args = buildArgs({ url: queue.url });  // Always same strategy
}
```

**Impact**:
- Cannot resume with different crawl strategies
- No way to resume "discovery-only" or "acquisition-only" phases
- Mixed queue types all use same approach

**Refactor**: Strategy pattern for resume behavior:
```javascript
// NEW: ResumeStrategy interface
class ResumeStrategy {
  canResumeQueue(queue) { /* check if this strategy applies */ }
  buildResumeArgs(queue) { /* strategy-specific args */ }
}

class DiscoveryResumeStrategy extends ResumeStrategy {
  buildResumeArgs(queue) {
    return [...baseArgs, '--mode=discovery', '--no-article-fetch'];
  }
}

class AcquisitionResumeStrategy extends ResumeStrategy {
  buildResumeArgs(queue) {
    return [...baseArgs, '--mode=acquisition', '--url-list', queue.discoveredUrls];
  }
}

// In api.resume-all.js
const strategy = selectResumeStrategy(queue);
args = strategy.buildResumeArgs(queue);
```

---

### 3. **URL Eligibility: Implicit Classification**

**Problem**: `UrlEligibilityService` (lines 1-500+) mixes:
- Robots.txt checks
- URL normalization  
- Article vs hub detection
- Queue type decisions

**Impact**:
- Hard to add new URL classifications (archive, gallery, etc.)
- Cannot separate "should visit" from "should fetch fully"
- Navigation logic scattered across multiple files

**Refactor**: Explicit classification pipeline:
```javascript
// NEW: UrlClassificationPipeline
class UrlClassificationPipeline {
  async classify(url, context) {
    const stages = [
      new RobotsClassifier(),      // allowed/disallowed
      new StructureClassifier(),   // hub/article/archive/other
      new PriorityClassifier(),    // high/medium/low value
      new FetchStrategyClassifier() // full/partial/head-only
    ];
    
    let classification = { url };
    for (const stage of stages) {
      classification = await stage.process(classification, context);
    }
    return classification;
  }
}

// Usage
const cls = await pipeline.classify(url);
if (cls.type === 'archive') {
  await discoveryService.discoverLinks({ url, fetchStrategy: 'partial' });
} else if (cls.type === 'article' && cls.priority === 'high') {
  await acquisitionService.acquireArticle({ url });
}
```

---

### 4. **Queue Management: Single Queue Type**

**Problem**: `QueueManager.js` treats all URLs the same:
```javascript
enqueue(url, priority) {
  // All URLs go into same processing pipeline
}
```

**Impact**:
- Cannot separate discovery queue from acquisition queue
- Cannot prioritize "map the site" vs "fetch articles"
- Mixed concerns in worker loop

**Refactor**: Multiple specialized queues:
```javascript
class MultiQueueManager {
  constructor() {
    this.queues = {
      discovery: new DiscoveryQueue(),    // Archive/hub URLs to explore
      acquisition: new AcquisitionQueue(), // Articles to fetch
      validation: new ValidationQueue()    // Hubs to verify
    };
  }
  
  enqueue(url, queueType, priority) {
    this.queues[queueType].add(url, priority);
  }
  
  async dequeue(queueType) {
    return this.queues[queueType].next();
  }
  
  getQueueStats() {
    return {
      discovery: this.queues.discovery.size,
      acquisition: this.queues.acquisition.size,
      validation: this.queues.validation.size
    };
  }
}
```

---

### 5. **Domain Extraction: Copy-Pasted Logic**

**Problem**: Same domain extraction in multiple files:
- `api.resume-all.js` lines 95-102
- `DomainThrottleManager.js`
- `UrlPolicy.js`
- Others

**Impact**:
- Inconsistent handling of edge cases
- Duplicate error handling
- Hard to extend (e.g., subdomain grouping)

**Refactor**: Centralized domain utilities:
```javascript
// NEW: src/utils/domainUtils.js
class DomainUtils {
  static extractDomain(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname.toLowerCase();
    } catch {
      return null;
    }
  }
  
  static groupByDomain(urls) {
    const groups = new Map();
    for (const url of urls) {
      const domain = this.extractDomain(url);
      if (!domain) continue;
      if (!groups.has(domain)) groups.set(domain, []);
      groups.get(domain).push(url);
    }
    return groups;
  }
  
  static isSameDomain(url1, url2) {
    return this.extractDomain(url1) === this.extractDomain(url2);
  }
}
```

---

## Refactoring Roadmap

### Phase 1: Extract Utilities (Low Risk)

**Goal**: Remove duplication, no behavior change

1. **Create `src/utils/domainUtils.js`**
   - Move domain extraction logic
   - Add comprehensive tests
   - Replace all usages

2. **Create `src/utils/urlClassification.js`**  
   - Extract URL type detection (hub, article, archive)
   - Centralize pattern matching
   - Unit test all classifications

3. **Update all consumers**
   - `api.resume-all.js` → use `DomainUtils.extractDomain()`
   - `DomainThrottleManager` → use `DomainUtils`
   - `UrlPolicy` → use shared utils

**Verification**: All existing tests pass, no behavior change

---

### Phase 2: Separate Discovery from Acquisition (Medium Risk)

**Goal**: Enable navigation without full fetches

1. **Create `NavigationDiscoveryService`**
   ```javascript
   // src/crawler/NavigationDiscoveryService.js
   class NavigationDiscoveryService {
     constructor({ fetchPipeline, linkExtractor, classifier }) {
       this.fetchPipeline = fetchPipeline;
       this.linkExtractor = linkExtractor;
       this.classifier = classifier;
     }
     
     async discover({ url, depth, fetchStrategy = 'full' }) {
       // Strategy: full, partial, head-only, cached-only
       const content = await this.fetchContent(url, fetchStrategy);
       const links = this.linkExtractor.extract(content, url);
       const classification = await this.classifier.classify(url, { links });
       
       return {
         url,
         links: links.map(link => ({
           url: link,
           discoveredFrom: url,
           depth: depth + 1
         })),
         classification,
         fetchedAt: Date.now(),
         fetchStrategy
       };
     }
     
     async fetchContent(url, strategy) {
       switch (strategy) {
         case 'head-only':
           return this.fetchPipeline.head(url);
         case 'partial':
           return this.fetchPipeline.fetchPartial(url, { maxBytes: 50000 });
         case 'cached-only':
           return this.fetchPipeline.getFromCache(url);
         default:
           return this.fetchPipeline.fetch(url);
       }
     }
   }
   ```

2. **Create `ContentAcquisitionService`**
   ```javascript
   // src/crawler/ContentAcquisitionService.js
   class ContentAcquisitionService {
     constructor({ fetchPipeline, articleProcessor, storage }) {
       this.fetchPipeline = fetchPipeline;
       this.articleProcessor = articleProcessor;
       this.storage = storage;
     }
     
     async acquire({ url, priority, signals }) {
       // Always full fetch for articles
       const fetchResult = await this.fetchPipeline.fetch({ url, priority });
       
       if (!fetchResult.ok) {
         return { success: false, error: fetchResult.error };
       }
       
       const article = await this.articleProcessor.process({
         url,
         html: fetchResult.body,
         signals
       });
       
       if (article) {
         await this.storage.saveArticle(article);
       }
       
       return { success: true, article };
     }
   }
   ```

3. **Update `PageExecutionService` to use both**
   - Determine URL type first
   - Delegate to discovery or acquisition
   - Track phase in telemetry

**Verification**: 
- Can traverse archive pages without full fetches
- Article acquisition still works
- Metrics track both phases

---

### Phase 3: Multi-Queue System (Medium Risk)

**Goal**: Separate concerns, better prioritization

1. **Create specialized queue types**
   ```javascript
   // src/crawler/queues/DiscoveryQueue.js
   class DiscoveryQueue {
     // Optimized for breadth-first site mapping
     // Lower priority than acquisition
   }
   
   // src/crawler/queues/AcquisitionQueue.js  
   class AcquisitionQueue {
     // High priority, article fetching
     // Rate-limited per domain
   }
   ```

2. **Update `QueueManager` to coordinate**
   - Route URLs to appropriate queue
   - Balance dequeue between queues
   - Track separate metrics

3. **Add queue type to database schema**
   ```sql
   ALTER TABLE crawl_jobs ADD COLUMN queue_type TEXT DEFAULT 'mixed';
   -- 'discovery', 'acquisition', 'mixed'
   ```

**Verification**:
- Queue stats show separate counts
- Worker can pull from specific queues
- Migration handles old jobs

---

### Phase 4: Pluggable Resume Strategies (Low Risk)

**Goal**: Support different resume behaviors

1. **Create `ResumeStrategy` interface**
   ```javascript
   // src/ui/express/services/ResumeStrategy.js
   class ResumeStrategy {
     canHandle(queue) { throw new Error('Not implemented'); }
     buildArgs(queue, options) { throw new Error('Not implemented'); }
   }
   ```

2. **Implement concrete strategies**
   - `BasicResumeStrategy` (current behavior)
   - `DiscoveryResumeStrategy` (navigation only)
   - `AcquisitionResumeStrategy` (article fetching only)
   - `IntelligentResumeStrategy` (planner-guided)

3. **Update `api.resume-all.js`**
   ```javascript
   const strategies = [
     new IntelligentResumeStrategy(),
     new DiscoveryResumeStrategy(),
     new BasicResumeStrategy() // fallback
   ];
   
   for (const queue of toResume) {
     const strategy = strategies.find(s => s.canHandle(queue));
     args = strategy.buildArgs(queue, { maxConcurrent, dbPath });
     // ... resume with strategy-specific args
   }
   ```

**Verification**:
- Can resume different crawl types correctly
- Backward compatible with existing queues
- Tests cover each strategy

---

### Phase 5: Explicit Classification Pipeline (High Value)

**Goal**: Make URL decision-making transparent

1. **Create classification stages**
   ```javascript
   // src/crawler/classification/RobotsClassifier.js
   class RobotsClassifier {
     async process(classification, context) {
       const allowed = await this.checkRobots(classification.url);
       return { ...classification, robotsAllowed: allowed };
     }
   }
   
   // src/crawler/classification/StructureClassifier.js
   class StructureClassifier {
     async process(classification, context) {
       const type = this.detectType(classification.url);
       return { ...classification, type }; // 'article', 'hub', 'archive'
     }
   }
   ```

2. **Pipeline coordinator**
   ```javascript
   // src/crawler/classification/UrlClassificationPipeline.js
   class UrlClassificationPipeline {
     constructor(stages = []) {
       this.stages = stages;
     }
     
     async classify(url, context = {}) {
       let classification = { url, timestamp: Date.now() };
       
       for (const stage of this.stages) {
         classification = await stage.process(classification, context);
         
         // Short-circuit if definitive decision
         if (classification.decision === 'reject') {
           return classification;
         }
       }
       
       return classification;
     }
   }
   ```

3. **Integration points**
   - `UrlEligibilityService` becomes thin wrapper
   - `PageExecutionService` uses classifications
   - Telemetry logs classification decisions

**Verification**:
- All URL decisions logged with reasons
- Easy to add new classification types
- Performance acceptable (caching helps)

---

## Migration Strategy

### For Existing Code

1. **Gradual migration**: New code uses new services, old code works as-is
2. **Feature flags**: Enable new behavior progressively
3. **Dual logging**: Compare old vs new decisions in metrics
4. **Rollback plan**: Keep old code paths until fully validated

### For Database

1. **Additive changes only**: New columns, not destructive alterations
2. **Default values**: Ensure old data works with new schema
3. **Migration scripts**: Backfill classifications for existing URLs

### For Tests

1. **Parallel test suites**: New tests for new services
2. **Integration tests**: Verify old and new paths work
3. **Performance benchmarks**: Ensure refactor doesn't slow crawls

---

## Immediate Next Steps

### Step 1: Domain Utilities (1-2 hours)

- [ ] Create `src/utils/domainUtils.js`
- [ ] Write comprehensive tests
- [ ] Update `api.resume-all.js` to use it
- [ ] Update `DomainThrottleManager` to use it

### Step 2: URL Classification Utils (2-3 hours)

- [ ] Extract classification logic from `UrlEligibilityService`
- [ ] Create `src/utils/urlClassification.js`
- [ ] Add unit tests for all patterns
- [ ] Document classification criteria

### Step 3: Navigation Discovery Service (4-6 hours)

- [ ] Create `NavigationDiscoveryService` class
- [ ] Implement fetch strategies (full, partial, head-only)
- [ ] Add tests for discovery without full fetch
- [ ] Integrate into `PageExecutionService` (feature flag)

### Step 4: Resume Strategy Pattern (2-3 hours)

- [ ] Create `ResumeStrategy` base class
- [ ] Implement `BasicResumeStrategy` (current behavior)
- [ ] Implement `DiscoveryResumeStrategy`
- [ ] Update `api.resume-all.js` to use strategies

---

## Success Metrics

### Code Quality
- ✅ Reduced duplication (DRY violations < 5)
- ✅ Clear separation of concerns (one class = one responsibility)
- ✅ Testability improved (unit test coverage > 80%)

### Feature Enablement  
- ✅ Can traverse archive listings without fetching articles
- ✅ Can resume discovery-only crawls
- ✅ Can defer article acquisition to later phase

### Performance
- ✅ Archive traversal 3-5x faster (no article fetches)
- ✅ Bandwidth savings 40-60% during discovery phase
- ✅ Better prioritization (fetch high-value articles first)

### Maintainability
- ✅ New crawl strategies added without touching core
- ✅ URL classification logic in one place
- ✅ Clear extension points documented

---

## Open Questions

1. **Partial fetch implementation**: Use Range headers? Puppeteer navigation timeout?
2. **Queue balancing**: What ratio of discovery:acquisition dequeues?
3. **State management**: How to track "discovered but not fetched" URLs?
4. **Backward compatibility**: Support mixed-mode crawls indefinitely?

---

## References

- `AGENTS.md` - Current modularization rules
- `ENHANCED_FEATURES.md` - Feature flag system
- `src/crawler/PageExecutionService.js` - Current monolithic approach
- `src/crawler/PlannerKnowledgeService.js` - Pattern learning (can be reused)
- `src/tools/placeHubDetector.js` - Hub classification example

---

_This document is a living plan. Update as refactoring progresses._
