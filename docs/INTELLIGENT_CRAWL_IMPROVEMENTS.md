# Intelligent Crawl Improvements: Leveraging Existing Infrastructure

**Status**: Planned Enhancement Proposals  
**Date**: October 14, 2025  
**When to Read**: Before implementing next-generation intelligent crawl features

## Executive Summary

The intelligent crawl system has extensive well-tested infrastructure that can be leveraged for significant improvements:

1. **Cost-Aware Priority Scoring** - Integrate QueryCostEstimatorPlugin with PriorityScorer
2. **Dynamic Re-Planning** - Trigger new strategic plans during crawl execution
3. **Pattern-Based Hub Discovery** - Use learned heuristics to predict undiscovered hubs
4. **Adaptive Branching** - Dynamically adjust lookahead depth based on domain complexity
5. **Cross-Domain Knowledge Sharing** - Apply patterns from similar domains
6. **Real-Time Plan Adjustment** - Update plan based on actual vs predicted performance

---

## Improvement 1: Cost-Aware Priority Scoring

### Current State

**PriorityScorer** (`src/crawler/PriorityScorer.js`):
- Well-tested priority calculation with configurable bonuses
- Supports gap-driven prioritization and discovery method weighting
- Used by 25+ tests, proven stable

**QueryCostEstimatorPlugin** (`src/planner/plugins/QueryCostEstimatorPlugin.js`):
- Analyzes historical query telemetry to estimate operation costs
- Builds cost models from `query_telemetry` table
- Identifies high-cost operations (>500ms threshold)

**Gap**: These systems don't communicate. Priority scorer doesn't consider cost estimates.

### Proposed Enhancement

Integrate cost estimates into priority calculation:

```javascript
// In PriorityScorer.calculateEnhancedPriority()
const costAdjustment = this._calculateCostAdjustment(url, metadata);
const costWeight = this.priorityWeights['cost-efficiency'] || 0;
const costBonus = costAdjustment * costWeight;

finalPriority = finalPriority + costBonus;
```

**Cost Adjustment Logic**:
- Low-cost hubs (< 100ms): +15 priority bonus
- Medium-cost hubs (100-500ms): 0 adjustment
- High-cost hubs (> 500ms): -10 priority penalty

**Implementation**:
1. Add `costEstimates` parameter to `calculateEnhancedPriority()`
2. Create `_calculateCostAdjustment()` helper method
3. Add `cost-efficiency` to priority weights configuration
4. Pass cost estimates from HierarchicalPlanner to PriorityScorer

**Expected Impact**:
- 15-20% faster crawls by prioritizing low-cost operations
- Reduced timeout failures from expensive operations
- Better resource utilization (CPU/network balanced)

**Test Coverage**: Extend existing PriorityScorer tests with cost scenarios

---

## Improvement 2: Dynamic Re-Planning

### Current State

**Strategic Planning**: Happens once during preview phase  
**Execution**: Follows initial plan without updates

**Problem**: Plans become stale as crawl progresses:
- New hubs discovered that weren't in original plan
- Assumptions proven wrong (hub had 10 articles, not 500)
- Domain structure reveals unexpected patterns

### Proposed Enhancement

Trigger re-planning periodically during crawl:

```javascript
// In IntelligentCrawlerManager
recordPlanStep(jobId, stepIdx, result) {
  const exec = this.planExecutions.get(jobId);
  if (!exec) return;

  exec.stepResults.push({ stepIdx, result, timestamp: Date.now() });
  exec.currentStep = stepIdx + 1;

  // Check if re-planning needed
  const shouldReplan = this._shouldReplan(exec);
  if (shouldReplan) {
    this._triggerReplan(jobId, exec);
  }
}

_shouldReplan(exec) {
  // Re-plan every 100 requests
  if (exec.requestsProcessed % 100 === 0) return true;
  
  // Re-plan if performance deviates >40%
  const avgPerformance = this._calculateAvgPerformance(exec);
  if (Math.abs(avgPerformance - 1.0) > 0.4) return true;
  
  // Re-plan if too many backtracks (>5)
  if (exec.backtracks > 5) return true;
  
  return false;
}

async _triggerReplan(jobId, exec) {
  // Generate new plan with updated state
  const currentState = {
    hubsDiscovered: exec.actualHubsDiscovered,
    articlesCollected: exec.actualArticlesCollected,
    requestsMade: exec.requestsProcessed,
    momentum: exec.currentMomentum
  };

  const newPlan = await this.hierarchicalPlanner.generatePlan(
    currentState,
    exec.originalGoal,
    { 
      domain: exec.domain,
      candidates: exec.newHubsDiscovered,
      lookahead: 5 
    }
  );

  // Merge new plan with remaining steps
  exec.plan = this._mergePlans(exec.plan, newPlan, exec.currentStep);
  
  this.recordMilestone(jobId, {
    kind: 'plan-recomputed',
    message: `Updated plan based on actual progress (${exec.currentStep} steps completed)`,
    details: { newSteps: newPlan.steps.length }
  });
}
```

**Triggers for Re-Planning**:
1. **Periodic** (every 100 requests)
2. **Performance deviation** (actual vs predicted >40%)
3. **Excessive backtracks** (>5 backtracks)
4. **Major discovery** (hub with >1000 articles found)

**Expected Impact**:
- 30-50% better adaptation to unexpected domain patterns
- Reduced wasted effort on unproductive branches
- Faster convergence when high-value hubs discovered

**Challenges**: Need to merge new plans with partially-executed old plans

---

## Improvement 3: Pattern-Based Hub Discovery

### Current State

**Learned Heuristics** (`planning_heuristics` table):
- Stores successful action patterns per domain
- Tracks confidence scores and success rates
- Currently unused during crawl execution

**Pattern Performance** (`pattern_performance` table):
- Tracks pattern signatures like "explore-hub→explore-hub→explore-hub"
- Records success/failure counts and average value
- Ready for querying but not integrated

### Proposed Enhancement

Use learned patterns to predict undiscovered hubs:

```javascript
// In HierarchicalPlanner
async _generateCandidatesFromPatterns(domain, currentState) {
  // Load learned patterns for this domain
  const heuristics = await this._loadHeuristics(domain);
  if (!heuristics || heuristics.patterns.length === 0) {
    return [];
  }

  // Find high-confidence patterns
  const goodPatterns = heuristics.patterns.filter(p => {
    const perf = this._lookupPatternPerformance(p.signature);
    return perf.successRate > 0.7 && perf.avgValue > 50;
  });

  // Generate candidate URLs from patterns
  const candidates = [];
  for (const pattern of goodPatterns) {
    // Pattern: "explore-hub→explore-hub" suggests exploring similar hubs
    if (pattern.signature.includes('explore-hub')) {
      const similarHubs = this._findSimilarHubs(currentState, pattern);
      candidates.push(...similarHubs);
    }
  }

  return candidates;
}

_findSimilarHubs(state, pattern) {
  // Extract structural features from successful hubs
  const features = this._extractFeatures(pattern);
  
  // Generate candidate URLs matching those features
  const candidates = [];
  for (const section of ['news', 'sports', 'business', 'tech']) {
    if (features.sections.includes(section)) continue; // Already explored
    
    const hubUrl = `${state.baseUrl}/${section}/`;
    candidates.push({
      type: 'explore-hub',
      url: hubUrl,
      estimatedArticles: features.avgArticles,
      estimatedRequests: 10,
      confidence: pattern.confidence,
      source: 'pattern-learned'
    });
  }
  
  return candidates;
}
```

**Pattern Signatures to Leverage**:
- `explore-hub→explore-hub→explore-hub`: Breadth-first hub exploration works
- `explore-hub→history→explore-hub`: Mix hubs with archive paths
- `adaptive-seed→adaptive-seed`: Reactive seeding from articles is productive

**Expected Impact**:
- Discover 20-30% more hubs without exhaustive searching
- Reduce "missing-hub" problems by 50%+
- Cold-start domains benefit from similar domain patterns

---

## Improvement 4: Adaptive Branching

### Current State

**Fixed Parameters**:
- `maxLookahead: 5` - Same for all domains
- `maxBranches: 10` - Same for all domains

**Problem**: Domains vary widely:
- Small sites (100 pages): 5-step lookahead is overkill
- Large sites (100k pages): 5-step lookahead may be insufficient
- Complex structures need more branches, simple ones don't

### Proposed Enhancement

Adjust lookahead depth and branching factor based on domain characteristics:

```javascript
// In HierarchicalPlanner
async generatePlan(initialState, goal, context) {
  const domainProfile = await this._analyzeDomainProfile(context.domain);
  
  // Adaptive lookahead
  const lookahead = this._calculateOptimalLookahead(domainProfile, goal);
  
  // Adaptive branching
  const maxBranches = this._calculateOptimalBranching(domainProfile);
  
  return this._branchAndBound(root, goal, lookahead, maxBranches, context);
}

_calculateOptimalLookahead(profile, goal) {
  // Small domains (< 1000 pages): 3 steps sufficient
  if (goal.articlesTarget < 1000) return 3;
  
  // Medium domains (1000-10000): 5 steps optimal
  if (goal.articlesTarget < 10000) return 5;
  
  // Large domains (> 10000): 7 steps needed
  return 7;
}

_calculateOptimalBranching(profile) {
  // Simple structure (few hub types): 5 branches
  if (profile.hubTypeCount < 5) return 5;
  
  // Medium complexity: 10 branches
  if (profile.hubTypeCount < 15) return 10;
  
  // High complexity: 15 branches
  return 15;
}

async _analyzeDomainProfile(domain) {
  // Query database for historical crawls
  const stmt = this.db.prepare(`
    SELECT 
      COUNT(DISTINCT url) as pageCount,
      COUNT(DISTINCT section) as hubTypeCount,
      AVG(json_array_length(links)) as avgLinksPerPage
    FROM articles
    WHERE domain = ?
  `);
  
  const row = stmt.get(domain);
  
  return {
    pageCount: row?.pageCount || 0,
    hubTypeCount: row?.hubTypeCount || 1,
    avgLinksPerPage: row?.avgLinksPerPage || 50,
    complexity: this._calculateComplexity(row)
  };
}
```

**Complexity Heuristics**:
- **Simple** (complexity < 3): News blog, single section
- **Medium** (complexity 3-8): Multi-section news site
- **Complex** (complexity > 8): Large portal with many subsections

**Expected Impact**:
- 40% faster planning for small domains (3-step vs 5-step)
- 25% better coverage for large domains (7-step vs 5-step)
- Reduced computational waste on unnecessary branches

---

## Improvement 5: Cross-Domain Knowledge Sharing

### Current State

**Isolated Learning**: Each domain learns independently  
**Problem**: Wastes discoveries across similar domains

### Proposed Enhancement

Share learned patterns across domain clusters:

```javascript
// In HierarchicalPlanner
async learnHeuristics(domain, planOutcomes) {
  // Update domain-specific heuristics (existing logic)
  await this._saveHeuristic(domain, heuristic);
  
  // NEW: Identify similar domains
  const similarDomains = await this._findSimilarDomains(domain);
  
  // Share successful patterns with similar domains
  for (const similarDomain of similarDomains) {
    await this._sharePattern(similarDomain, heuristic, {
      sourceConfidence: heuristic.confidence,
      transferConfidence: heuristic.confidence * 0.7, // Reduce for transfer
      shared: true
    });
  }
}

async _findSimilarDomains(domain) {
  // Domain similarity criteria:
  // 1. Same TLD (.com, .org, .edu)
  // 2. Similar structure (hub count, depth)
  // 3. Similar content type (news, blog, academic)
  
  const stmt = this.db.prepare(`
    SELECT DISTINCT h2.domain
    FROM planning_heuristics h1
    JOIN planning_heuristics h2 ON h2.id != h1.id
    WHERE h1.domain = ?
      AND ABS(h1.avg_lookahead - h2.avg_lookahead) < 2
      AND ABS(h1.branching_factor - h2.branching_factor) < 3
    LIMIT 5
  `);
  
  return stmt.all(domain).map(row => row.domain);
}

async _sharePattern(targetDomain, pattern, metadata) {
  const stmt = this.db.prepare(`
    INSERT INTO planning_heuristics (
      domain,
      patterns,
      confidence,
      sample_size,
      updated_at
    ) VALUES (?, ?, ?, 0, datetime('now'))
    ON CONFLICT(domain) DO UPDATE SET
      patterns = json_insert(patterns, '$[#]', json(?)),
      updated_at = datetime('now')
  `);
  
  stmt.run(targetDomain, JSON.stringify([pattern]), metadata.transferConfidence, JSON.stringify(pattern));
}
```

**Domain Clustering Strategy**:
1. **News sites**: bbc.com, cnn.com, theguardian.com → Share /news, /world patterns
2. **Blogs**: wordpress.com sites → Share /category, /tag patterns
3. **Academic**: .edu domains → Share /research, /publications patterns

**Expected Impact**:
- 60% faster initial plans for new domains (bootstrap from similar domains)
- Reduced cold-start penalty
- Better global knowledge accumulation

**Safeguards**:
- Transfer confidence reduced to 70% of source confidence
- Limit to 5 most similar domains
- Patterns marked as "shared" for transparency

---

## Improvement 6: Real-Time Plan Adjustment

### Current State

**Static Execution**: Plan steps executed regardless of intermediate results  
**Problem**: Can't capitalize on unexpected discoveries or avoid known failures

### Proposed Enhancement

Adjust plan weights and priorities based on real-time feedback:

```javascript
// In HierarchicalPlanner.executePlan()
async executePlan(plan, context) {
  const adjustedPlan = { ...plan };
  
  for (let i = 0; i < adjustedPlan.steps.length; i++) {
    const step = adjustedPlan.steps[i];
    
    // Execute with real-time monitoring
    const result = await context.onStep(step.action, i);
    
    // Analyze result quality
    const quality = this._assessStepQuality(step, result);
    
    if (quality === 'excellent') {
      // Boost priority of similar steps
      this._boostSimilarSteps(adjustedPlan, step, +20);
      
      // Generate additional steps like this one
      const similarSteps = this._generateSimilarSteps(step, 2);
      adjustedPlan.steps.splice(i + 1, 0, ...similarSteps);
    } else if (quality === 'poor') {
      // Reduce priority of similar steps
      this._reduceSimilarSteps(adjustedPlan, step, -15);
      
      // Consider backtracking
      if (result.value < step.expectedValue * 0.3) {
        await context.onBacktrack(i, this.backtracks);
        i = Math.max(0, i - 2); // Go back 2 steps
        continue;
      }
    }
  }
  
  return adjustedPlan;
}

_assessStepQuality(step, result) {
  const ratio = result.value / step.expectedValue;
  
  if (ratio > 1.5) return 'excellent';  // 50%+ better than expected
  if (ratio > 0.8) return 'good';       // Within 20% of expected
  if (ratio > 0.5) return 'acceptable'; // Within 50% of expected
  return 'poor';                         // < 50% of expected
}

_boostSimilarSteps(plan, referenceStep, bonus) {
  for (const step of plan.steps) {
    if (this._isSimilarStep(step, referenceStep)) {
      step.priority = (step.priority || 50) + bonus;
    }
  }
}

_generateSimilarSteps(referenceStep, count) {
  // Extract pattern from successful step
  const pattern = this._extractStepPattern(referenceStep);
  
  // Generate similar steps
  const newSteps = [];
  for (let i = 0; i < count; i++) {
    const similarUrl = this._applyPattern(pattern, i);
    newSteps.push({
      action: {
        type: referenceStep.action.type,
        url: similarUrl,
        estimatedArticles: referenceStep.action.estimatedArticles,
        estimatedRequests: referenceStep.action.estimatedRequests
      },
      expectedValue: referenceStep.expectedValue,
      priority: referenceStep.priority + 10
    });
  }
  
  return newSteps;
}
```

**Adjustment Strategies**:
- **Excellent performance (>150%)**: Generate 2 more similar steps, +20 priority
- **Good performance (80-150%)**: No adjustment
- **Acceptable performance (50-80%)**: Continue but watch
- **Poor performance (<50%)**: -15 priority to similar steps, consider backtrack

**Expected Impact**:
- 35% faster exploitation of productive patterns
- 20% reduction in time wasted on unproductive branches
- More responsive to domain idiosyncrasies

---

## Implementation Priorities

### Phase 1: Foundation (Week 1-2)
1. ✅ **Cost-Aware Priority Scoring** - Lowest risk, immediate value
2. ✅ **Pattern-Based Hub Discovery** - Uses existing tables, no new infrastructure

**Effort**: 2-3 days development, 1 day testing  
**Risk**: Low (extends existing systems)  
**Value**: High (15-20% faster crawls)

### Phase 2: Adaptation (Week 3-4)
3. **Adaptive Branching** - Medium complexity, clear benefits
4. **Real-Time Plan Adjustment** - Higher complexity, high value

**Effort**: 4-5 days development, 2 days testing  
**Risk**: Medium (changes execution flow)  
**Value**: Very High (30-40% better adaptation)

### Phase 3: Advanced (Week 5-6)
5. **Dynamic Re-Planning** - Complex merge logic required
6. **Cross-Domain Knowledge Sharing** - Requires domain clustering

**Effort**: 5-7 days development, 3 days testing  
**Risk**: Medium-High (complex state management)  
**Value**: High (60% faster for new domains)

---

## Success Metrics

| Metric | Baseline | Target | Measurement |
|--------|----------|--------|-------------|
| **Time to 80% coverage** | 100 min | 40-60 min | Crawl duration tracking |
| **Wasted requests** | 30-40% | 10-15% | Requests to unproductive hubs |
| **Coverage per request** | 1.0x | 1.5-2.0x | Articles discovered / requests made |
| **Plan accuracy** | ~60% | 80-85% | Actual value / estimated value |
| **Cold-start performance** | Baseline | +60% | First-crawl coverage improvement |
| **Backtrack frequency** | 8-12 per crawl | 3-5 per crawl | Backtrack events count |

---

## Technical Considerations

### Database Impact

**New Queries**:
- Domain profile analysis: 1 query per planning session (~50ms)
- Pattern lookup: 5-10 queries per crawl (~10ms each)
- Similar domain search: 1 query per learning cycle (~30ms)

**Storage Growth**:
- Patterns: ~1KB per domain
- Heuristics: ~5KB per domain with history
- Cross-domain links: ~2KB per domain cluster

**Total**: ~50MB for 1000 domains (negligible)

### Performance Impact

**Planning Overhead**:
- Adaptive branching: +50ms per planning session
- Pattern generation: +100ms per planning session
- Re-planning: 3.5s every 100 requests (acceptable)

**Execution Overhead**:
- Cost lookup: +5ms per URL enqueued
- Real-time adjustment: +20ms per step execution
- Pattern matching: +10ms per hub discovered

**Total**: <1% of total crawl time (acceptable)

### Testing Strategy

1. **Unit Tests**: Extend existing PriorityScorer, HierarchicalPlanner tests
2. **Integration Tests**: New tests for pattern discovery, re-planning
3. **E2E Tests**: Compare baseline vs improved intelligent crawl
4. **A/B Testing**: Run 50% of crawls with improvements, 50% baseline
5. **Regression Monitoring**: Track all success metrics for 2 weeks

---

## Rollout Plan

### Week 1: Cost-Aware Priority Scoring
- Implement `_calculateCostAdjustment()` in PriorityScorer
- Add tests for cost-based adjustments
- Deploy behind feature flag: `features.costAwarePriority`
- Monitor impact on small set of domains (10-20 crawls)

### Week 2: Pattern-Based Hub Discovery
- Implement `_generateCandidatesFromPatterns()` in HierarchicalPlanner
- Add tests for pattern matching and candidate generation
- Deploy behind feature flag: `features.patternDiscovery`
- Monitor hub discovery rate improvement

### Week 3-4: Adaptive Systems
- Implement adaptive branching and real-time adjustment
- Add comprehensive tests for dynamic behavior
- Deploy behind combined flag: `features.adaptivePlanning`
- Monitor plan accuracy and backtrack frequency

### Week 5-6: Advanced Features
- Implement dynamic re-planning and cross-domain sharing
- Add tests for complex state management
- Deploy behind flag: `features.advancedPlanning`
- Monitor cold-start performance and cross-domain benefits

### Week 7: Gradual Rollout
- Enable for 10% of crawls → Monitor for 2 days
- Enable for 50% of crawls → Monitor for 3 days
- Enable for 100% of crawls → Monitor for 1 week
- Make default if metrics meet targets

---

## Risk Mitigation

### Risk 1: Plan Staleness During Re-Planning
**Mitigation**: Track last re-plan timestamp, prevent re-planning more than once per 50 requests

### Risk 2: Pattern Overfitting
**Mitigation**: Require minimum sample size (5 plans) before using patterns, track false positive rate

### Risk 3: Cross-Domain Pollution
**Mitigation**: Limit transfer confidence to 70%, require similarity threshold >0.8

### Risk 4: Computational Overhead
**Mitigation**: Cache pattern lookups, limit re-planning frequency, profile all additions

### Risk 5: Database Contention
**Mitigation**: Use read-only queries for hot paths, batch writes during learning

---

## Alternative Approaches Considered

### Approach A: Machine Learning-Based Planning
**Pros**: Potentially better predictions  
**Cons**: Requires training data, harder to debug, less explainable  
**Decision**: Not chosen - GOFAI approach more maintainable and interpretable

### Approach B: Full STRIPS/HTN Planning
**Pros**: More powerful planning primitives  
**Cons**: Much higher complexity, slower planning  
**Decision**: Deferred - current approach sufficient for now

### Approach C: Distributed Planning
**Pros**: Scale to multiple crawls  
**Cons**: Adds coordination complexity  
**Decision**: Not needed - single-instance performance adequate

---

## Conclusion

These improvements leverage existing, well-tested infrastructure to deliver significant enhancements:

- **15-20% faster crawls** from cost-aware prioritization
- **30-50% better adaptation** from dynamic systems
- **60% cold-start boost** from cross-domain knowledge
- **50% fewer missing hubs** from pattern discovery

All improvements are incremental, testable, and can be rolled out gradually with feature flags. The proposed implementation is conservative (6 weeks) but delivers high-impact results with manageable risk.

**Recommendation**: Proceed with Phase 1 immediately, evaluate results, then advance to Phase 2-3 based on measured impact.

---

## References

- **HierarchicalPlanner**: `src/crawler/HierarchicalPlanner.js` (400 lines, tested)
- **PriorityScorer**: `src/crawler/PriorityScorer.js` (555 lines, 25+ tests)
- **QueryCostEstimatorPlugin**: `src/planner/plugins/QueryCostEstimatorPlugin.js` (tested)
- **GraphReasonerPlugin**: `src/planner/plugins/GraphReasonerPlugin.js` (simple, reliable)
- **IntelligentCrawlerManager**: `src/ui/express/services/IntelligentCrawlerManager.js` (plan tracking)
- **Database Schema**: `src/db/migrations/006-hierarchical-planning.sql` (ready)

**Status**: Ready for implementation. All required infrastructure exists and is tested.
