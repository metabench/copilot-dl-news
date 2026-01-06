# Plan – Multi-Modal Intelligent Crawl System

## Objective
Design and implement a continuous crawl mode that alternates between downloading batches, analyzing patterns, and re-analyzing content with new learnings. The system should run indefinitely, balancing historical backfill with newest article acquisition while discovering new hub structures.

## Done When
- [x] Multi-modal crawl orchestrator exists with batch → analyze → learn → repeat cycle
- [x] UI dashboard shows multi-modal crawl progress with phase indicators
- [x] CLI command supports starting/stopping multi-modal crawl
- [x] System learns new hub structures and URL patterns between batches
- [x] Re-analysis triggers when significant new patterns are discovered
- [x] Configurable batch sizes, analysis thresholds, and stop conditions

## Core Concepts

### 1. Crawl Phases (Multi-Modal)
```
┌─────────────────────────────────────────────────────────────────────────┐
│                     MULTI-MODAL INTELLIGENT CRAWL                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌────────────┐     ┌────────────┐     ┌────────────┐                 │
│   │  DOWNLOAD  │────▶│  ANALYZE   │────▶│   LEARN    │                 │
│   │   BATCH    │     │  CONTENT   │     │  PATTERNS  │                 │
│   │  (1000)    │     │            │     │            │                 │
│   └────────────┘     └────────────┘     └────────────┘                 │
│         ▲                                      │                        │
│         │                                      ▼                        │
│         │              ┌────────────┐   ┌────────────┐                 │
│         │              │ RE-ANALYZE │◀──│  NEW HUB   │                 │
│         └──────────────│  IF NEEDED │   │ DISCOVERY  │                 │
│                        └────────────┘   └────────────┘                 │
│                                                                          │
│   Balance: Historical backfill ←────────→ Newest articles              │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2. Existing Infrastructure to Leverage
| Component | Purpose | Status |
|-----------|---------|--------|
| `TemporalPatternLearner` | Learn visit patterns, predict optimal times | ✅ Exists |
| `CrawlPlaybookService` | Domain-level intelligence, pattern learning | ✅ Exists |
| `SkeletonHash` + `layout_signatures` | Page structure fingerprinting | ✅ Exists |
| `UpdatePatternAnalyzer` | Domain update frequency analysis | ✅ Exists |
| `HubValidator` | Validate hub structures | ✅ Exists |
| `CountryHubGapService` | Discover missing country hubs | ✅ Exists |
| `PlaceHubPatternLearningService` | Learn place hub URL patterns | ✅ Exists |
| `CrawlOperations` + `SequenceRunner` | Orchestrate crawl sequences | ✅ Exists |
| `analysis-observable` lab | Observable-based analysis with UI | ✅ Exists |

### 3. New Components Needed
| Component | Purpose |
|-----------|---------|
| `MultiModalCrawlOrchestrator` | Coordinate batch → analyze → learn cycle |
| `PatternDeltaTracker` | Track which patterns changed since last analysis |
| `ReanalysisQueue` | Queue pages for re-analysis when patterns improve |
| `CrawlBalancer` | Balance historical vs newest article acquisition |
| Multi-modal UI dashboard | Visualize phase, progress, learnings |
| CLI `crawl:multi-modal` command | Start/stop multi-modal crawl |

## Change Set (Files to Create/Modify)

### New Files
- `src/crawler/multimodal/MultiModalCrawlOrchestrator.js` - Core orchestrator
- `src/crawler/multimodal/PatternDeltaTracker.js` - Track pattern changes
- `src/crawler/multimodal/CrawlBalancer.js` - Balance historical vs newest
- `src/crawler/multimodal/index.js` - Module exports
- `tools/crawl-multi-modal.js` - CLI tool
- `labs/multi-modal-crawl/` - Lab experiment with UI

### Modified Files
- `src/ui/server/dataExplorerServer.js` - Add multi-modal dashboard view
- `src/ui/controls/` - New controls for multi-modal progress
- `tools/dev/README.md` - Document CLI tool

## Configuration Schema
```javascript
const multiModalConfig = {
  // Batch settings
  batchSize: 1000,              // Pages per batch
  maxBatchDuration: 30 * 60,    // 30 minutes max per batch
  
  // Balance settings  
  historicalRatio: 0.3,         // 30% historical, 70% newest
  hubRefreshInterval: 60 * 60,  // Re-check hubs hourly
  
  // Analysis triggers
  minNewSignatures: 3,          // Trigger learning when 3+ new signatures
  reanalysisThreshold: 0.8,     // Re-analyze when confidence improves > 80%
  
  // Stop conditions
  maxTotalBatches: null,        // null = run indefinitely
  maxTotalPages: null,          // null = no limit
  stopOnExhaustion: false,      // Don't stop when queue empties
  
  // Learning settings
  hubDiscoveryPerBatch: true,   // Run hub discovery after each batch
  learnLayoutMasks: true,       // Generate layout masks when patterns stabilize
};
```

## Risks & Mitigations
- **Risk**: Re-analysis queue could grow unbounded if patterns keep changing
  - **Mitigation**: Cap re-analysis queue, prioritize by impact
- **Risk**: Memory pressure from long-running process
  - **Mitigation**: Periodic state persistence, graceful restart capability
- **Risk**: Layout signature computation overhead
  - **Mitigation**: Batch SkeletonHash computation during analysis phase
- **Risk**: Process interruption loses state
  - **Mitigation**: Checkpoint after each batch, support resume

## Tests / Validation
- Unit tests for `MultiModalCrawlOrchestrator` phase transitions
- Integration test for full batch → analyze → learn cycle
- Test re-analysis triggering when new patterns discovered
- Test balance ratio adjustment based on discoveries
- CLI smoke tests for start/stop/resume

## Implementation Phases

### Phase 1: Core Orchestrator (Priority: HIGH) ✅ COMPLETE
- [x] Create `src/crawler/multimodal/MultiModalCrawlOrchestrator.js`
- [x] Implement batch → analyze → learn cycle
- [x] Integrate with existing `CrawlOperations`
- [x] Add observable pattern for progress events

### Phase 2: Pattern Learning Integration (Priority: HIGH) ✅ COMPLETE
- [x] Create `PatternDeltaTracker` to detect changed patterns
- [ ] Wire `SkeletonHash` computation into analysis phase
- [x] Implement re-analysis triggering logic
- [ ] Connect to `CrawlPlaybookService.learnFromDiscovery()`

### Phase 3: Balancing Logic (Priority: MEDIUM) ✅ COMPLETE
- [x] Create `CrawlBalancer` for historical vs newest
- [x] Implement adaptive ratio based on discovered content
- [ ] Track hub staleness and refresh priorities

### Phase 4: UI Integration (Priority: MEDIUM) ✅ COMPLETE
- [x] Add multi-modal view to Data Explorer (unified app panel)
- [x] Create SSE endpoint for multi-modal progress (`/sse/multi-modal/progress`)
- [x] Design phase indicators and learning insights panel

### Phase 5: CLI Tool (Priority: MEDIUM) ✅ COMPLETE
- [x] Create `tools/crawl-multi-modal.js`
- [x] Support start/stop/resume
- [ ] Add Electron wrapper option
