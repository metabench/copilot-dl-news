# Phase 1-3 Production Monitoring Guide

**Date**: October 14, 2025  
**Purpose**: Telemetry and monitoring strategy for intelligent crawl Phase 1-3 features

## Overview

This guide provides specific metrics, thresholds, and monitoring strategies for Phase 1-3 features in production. Use this when enabling features in staging/production to validate expected behavior and identify issues early.

## Quick Reference: Key Metrics

| Feature | Primary Metric | Target Value | Alert Threshold |
|---------|---------------|--------------|-----------------|
| Cost-Aware Priority | Query cost reduction | -30% to -40% | <-10% |
| Pattern Discovery | Pattern hit rate | 30-50% | <10% |
| Adaptive Branching | Lookahead distribution | 40%/40%/20% (3/5/7) | >80% at one level |
| Real-Time Adjustment | Adjustment frequency | 10-20% of steps | >50% |
| Dynamic Re-Planning | Replan frequency | 1-3% of crawls | >10% |
| Cross-Domain Sharing | Transfer success rate | 40-60% | <20% |

---

## Phase 1: Cost-Aware Priority Scoring

### What to Monitor

**1. Cost Reduction**
- **Metric**: Average query cost before/after enabling feature
- **Collection**: Track `durationMs` from step results
- **Target**: 30-40% reduction in average cost
- **Alert**: <10% reduction (feature not working as expected)

**Query**:
```sql
-- Average cost per crawl before/after feature enable
SELECT 
  date(timestamp) as day,
  AVG(duration_ms) as avg_cost_ms,
  COUNT(*) as query_count
FROM query_telemetry
WHERE timestamp > datetime('now', '-7 days')
GROUP BY date(timestamp)
ORDER BY day DESC;
```

**2. Cost Prediction Accuracy**
- **Metric**: Mean absolute percentage error (MAPE)
- **Collection**: `IntelligentCrawlerManager._recordCostObservation()`
- **Target**: <30% average error after 7 days of learning
- **Alert**: >50% error after 14 days

**Code Location**: `src/ui/express/services/IntelligentCrawlerManager.js:606-654`

**Query from exec.costObservations**:
```javascript
const costObservations = exec.costObservations || [];
const mape = costObservations.reduce((sum, obs) => {
  const error = Math.abs((obs.actualCost - obs.expectedCost) / obs.expectedCost);
  return sum + error;
}, 0) / costObservations.length;

console.log(`Cost prediction MAPE: ${(mape * 100).toFixed(1)}%`);
```

**3. Priority Score Distribution**
- **Metric**: Distribution of priority scores (0-100 range)
- **Target**: Normal distribution centered around 50-60
- **Alert**: >80% of candidates at one extreme (0-20 or 80-100)

---

## Phase 1: Pattern-Based Hub Discovery

### What to Monitor

**1. Pattern Hit Rate**
- **Metric**: % of candidates generated from learned patterns
- **Collection**: Count candidates with `source: 'pattern-learning'`
- **Target**: 30-50% of candidates from patterns
- **Alert**: <10% hit rate (patterns not being used)

**Query**:
```sql
SELECT 
  ph.domain,
  COUNT(pp.id) as pattern_count,
  AVG(pp.success_count) as avg_success,
  AVG(pp.avg_value) as avg_value
FROM planning_heuristics ph
JOIN pattern_performance pp ON pp.heuristic_id = ph.id
WHERE pp.success_count >= 3
GROUP BY ph.domain
ORDER BY avg_value DESC
LIMIT 20;
```

**2. Pattern Success Rate**
- **Metric**: Success rate of pattern-generated candidates vs manual candidates
- **Target**: Pattern candidates should be ≥90% as successful as manual
- **Alert**: <70% success rate compared to manual candidates

**3. Pattern Confidence Distribution**
- **Metric**: Average confidence of pattern-based candidates
- **Target**: 0.6-0.8 average confidence
- **Alert**: <0.4 (low confidence patterns)

---

## Phase 2: Adaptive Branching

### What to Monitor

**1. Lookahead Distribution**
- **Metric**: % of crawls using each lookahead depth (3, 5, 7)
- **Collection**: Log lookahead value from `_calculateOptimalLookahead()`
- **Target**: ~40% at lookahead=5, ~40% at lookahead=7, ~20% at lookahead=3
- **Alert**: >80% of crawls using same lookahead (feature not adapting)

**Code Location**: `src/crawler/HierarchicalPlanner.js:570-589`

**Telemetry**:
```javascript
// In HierarchicalPlanner.generatePlan()
if (this.features?.adaptiveBranching && domain && this.db) {
  const profile = await this._analyzeDomainProfile(domain);
  lookahead = this._calculateOptimalLookahead(profile, goal);
  maxBranches = this._calculateOptimalBranching(profile);
  
  this.logger.log?.(`[Adaptive Branching] Domain: ${domain}, Lookahead: ${lookahead}, Branches: ${maxBranches}`);
  
  // Record for monitoring
  telemetry.record('adaptive_branching', {
    domain,
    lookahead,
    maxBranches,
    articleCount: profile.articleCount
  });
}
```

**2. Branching Factor Distribution**
- **Metric**: % of crawls using each branching factor (5, 10, 15)
- **Target**: ~30% at 5, ~50% at 10, ~20% at 15
- **Alert**: >90% using default value (feature not triggered)

**3. Domain Profile Accuracy**
- **Metric**: Correlation between predicted complexity and actual discovery rate
- **Target**: R² > 0.7 (strong correlation)
- **Alert**: R² < 0.4 (poor predictions)

---

## Phase 2: Real-Time Plan Adjustment

### What to Monitor

**1. Adjustment Frequency**
- **Metric**: % of steps that trigger priority adjustments
- **Collection**: Count `_adjustSimilarSteps()` calls
- **Target**: 10-20% of steps adjusted
- **Alert**: <5% (not adjusting) or >50% (over-adjusting)

**Code Location**: `src/ui/express/services/IntelligentCrawlerManager.js:343-370`

**Telemetry**:
```javascript
// In IntelligentCrawlerManager.recordPlanStep()
if (this.features.realTimePlanAdjustment) {
  const performanceRatio = result.expectedValue > 0 
    ? result.value / result.expectedValue 
    : 1.0;

  if (performanceRatio > 1.5 || performanceRatio < 0.5) {
    telemetry.record('plan_adjustment', {
      jobId,
      stepIdx,
      performanceRatio,
      adjustment: performanceRatio > 1.5 ? 'boost' : 'penalize',
      magnitude: performanceRatio > 1.5 ? 20 : -15
    });
  }
}
```

**2. Adjustment Effectiveness**
- **Metric**: Performance of adjusted vs non-adjusted steps
- **Target**: Boosted steps perform 10-20% better, penalized steps 10-20% worse
- **Alert**: <5% difference (adjustments not effective)

**3. Overperformance Rate**
- **Metric**: % of steps exceeding expectations by >20%
- **Target**: 15-25% overperformance rate
- **Alert**: <5% (overly pessimistic planning) or >50% (unrealistic expectations)

---

## Phase 3: Dynamic Re-Planning

### What to Monitor

**1. Replan Frequency**
- **Metric**: % of crawls that trigger re-planning
- **Collection**: `exec.replanCount` in plan executions
- **Target**: 1-3% of crawls replan at least once
- **Alert**: <0.5% (too conservative) or >10% (thrashing)

**Code Location**: `src/ui/express/services/IntelligentCrawlerManager.js:468-498`

**Query from Milestones**:
```javascript
// Count replan events across all jobs
const replanEvents = jobRegistry.getJobs()
  .map(job => manager.getRecentAchievements(job.id))
  .flat()
  .filter(m => m.kind === 'plan-replan');

const replanRate = replanEvents.length / jobRegistry.getJobs().length;
console.log(`Replan rate: ${(replanRate * 100).toFixed(2)}%`);
```

**2. Replan Triggers**
- **Metric**: Distribution of replan triggers (periodic, performance, backtracks)
- **Collection**: Log trigger type in `_shouldReplan()`
- **Target**: ~60% performance deviation, ~30% periodic, ~10% backtracks
- **Alert**: >80% from one trigger (imbalanced)

**Telemetry**:
```javascript
// In IntelligentCrawlerManager._shouldReplan()
if (condition met) {
  this.logger?.log?.(`[Dynamic Re-Planning] Trigger: ${triggerType}`);
  telemetry.record('replan_trigger', { triggerType, jobId, requestsProcessed });
  return true;
}
```

**3. Replan Effectiveness**
- **Metric**: Performance improvement after replan
- **Collection**: Compare avgPerformance before/after replan
- **Target**: 15-30% improvement in performance ratio
- **Alert**: <5% improvement or negative impact

**4. Safeguard Activation**
- **Metric**: % of replan attempts blocked by 60s safeguard
- **Target**: <10% of replan attempts blocked
- **Alert**: >30% blocked (thrashing detected)

---

## Phase 3: Cross-Domain Knowledge Sharing

### What to Monitor

**1. Transfer Success Rate**
- **Metric**: % of transferred patterns that lead to successful discoveries
- **Collection**: Track patterns with `shared: true` metadata
- **Target**: 40-60% success rate
- **Alert**: <20% (poor transfers) or >80% (overly conservative)

**Code Location**: `src/crawler/HierarchicalPlanner.js:244-266`

**Query**:
```sql
SELECT 
  ph.domain,
  ph.confidence,
  ph.sample_size,
  COUNT(pp.id) as pattern_count,
  AVG(pp.success_count) as avg_success,
  AVG(pp.failure_count) as avg_failure
FROM planning_heuristics ph
JOIN pattern_performance pp ON pp.heuristic_id = ph.id
WHERE ph.confidence BETWEEN 0.5 AND 0.6  -- Transferred patterns (70% reduction from 0.8)
GROUP BY ph.domain
ORDER BY avg_success DESC;
```

**2. Transfer Volume**
- **Metric**: Average number of patterns transferred per source domain
- **Target**: 5-10 patterns transferred per learned domain
- **Alert**: <2 (too selective) or >20 (not selective enough)

**3. Confidence Reduction Accuracy**
- **Metric**: Comparison of transferred pattern confidence vs actual performance
- **Target**: Transferred patterns perform within ±15% of predicted confidence
- **Alert**: >30% deviation (confidence reduction too aggressive or too lenient)

**4. Cold-Start Improvement**
- **Metric**: Time to first successful hub discovery for new domains
- **Collection**: Track time from crawl start to first hub with >10 articles
- **Target**: 60% reduction in cold-start time vs non-sharing
- **Alert**: <30% improvement (feature not helping)

---

## Combined Monitoring Dashboard

### Recommended Grafana Panels

**Panel 1: Feature Adoption**
```
- Cost-Aware Priority: ON/OFF indicator + cost reduction %
- Pattern Discovery: ON/OFF + hit rate %
- Adaptive Branching: ON/OFF + lookahead distribution
- Real-Time Adjustment: ON/OFF + adjustment frequency %
- Dynamic Re-Planning: ON/OFF + replan rate %
- Cross-Domain Sharing: ON/OFF + transfer success rate %
```

**Panel 2: Performance Impact**
```
Time series (7 days):
- Average crawl duration (minutes)
- Average articles per crawl
- Average hubs discovered per crawl
- Cost per article discovered (ms/article)
```

**Panel 3: Feature Health**
```
Alert indicators:
- Cost prediction error > 50%
- Pattern hit rate < 10%
- Replan rate > 10%
- Transfer success < 20%
- Adjustment frequency > 50%
```

### Alerting Rules

**Critical Alerts** (page on-call):
```
- Replan rate > 10% for >1 hour (thrashing)
- Cost prediction error > 80% after 7 days (learning failure)
- Pattern hit rate = 0% for >24 hours (pattern discovery broken)
```

**Warning Alerts** (Slack notification):
```
- Any metric outside target range for >6 hours
- Safeguard activation rate > 30%
- Transfer success rate < 30%
```

---

## Gradual Rollout Strategy

### Week 1: Phase 1 Features (Staging)
**Enable**: `costAwarePriority: true`, `patternDiscovery: true`

**Monitor**:
- Cost reduction: expect -20% to -30% within 3 days
- Pattern hit rate: expect 15-25% within 5 days
- Cost prediction accuracy: improving daily

**Success Criteria**: 
- ✅ Cost reduction ≥20%
- ✅ Pattern hit rate ≥15%
- ✅ No critical alerts for 48 hours

### Week 2: Phase 2 Features (Staging)
**Enable**: `adaptiveBranching: true`, `realTimePlanAdjustment: true`

**Monitor**:
- Lookahead distribution: expect 40%/40%/20% split within 2 days
- Adjustment frequency: expect 10-15% within 3 days
- Crawl speed: expect 3-4x improvement in hub discovery

**Success Criteria**:
- ✅ Adaptive branching shows variation (not all at one level)
- ✅ Real-time adjustments improving performance by ≥10%
- ✅ No degradation in quality (articles per hub)

### Week 3: Phase 3 Features (Staging)
**Enable**: `dynamicReplanning: true`, `crossDomainSharing: true`

**Monitor**:
- Replan rate: expect 1-2% within 1 day
- Transfer success: expect 35-45% within 5 days
- Cold-start time: expect 40-50% reduction within 7 days

**Success Criteria**:
- ✅ Replan rate 1-3%
- ✅ Transfer success ≥35%
- ✅ No thrashing (safeguard activation <10%)

### Week 4-5: Production Rollout
**Gradual Enablement**:
1. Day 1-2: 10% of production crawls
2. Day 3-5: 50% of production crawls
3. Day 6-7: 100% of production crawls

**Rollback Criteria**:
- ❌ Any critical alert
- ❌ >20% increase in failed crawls
- ❌ >50% increase in average crawl duration
- ❌ User complaints about crawl quality

---

## Debug Commands

**Check current feature flags**:
```bash
node -e "const cfg = require('./config/priority-config.json'); console.log(JSON.stringify(cfg.features, null, 2))"
```

**Enable feature temporarily**:
```bash
# Edit config/priority-config.json
# Set "featureName": true
# Restart server
```

**Check plan execution state**:
```bash
node -e "
const app = require('./src/ui/express/server.js');
const manager = app.locals.crawlerManager;
const exec = manager.planExecutions.get('job-id-here');
console.log(JSON.stringify({
  currentStep: exec.currentStep,
  replanCount: exec.replanCount,
  performance: exec.stepResults.map(r => r.result.value / r.result.expectedValue),
  costObservations: exec.costObservations
}, null, 2));
"
```

**Query pattern performance**:
```bash
sqlite3 urls.db "
SELECT 
  domain, 
  pattern_signature, 
  success_count, 
  avg_value 
FROM pattern_performance 
WHERE success_count >= 3 
ORDER BY avg_value DESC 
LIMIT 20;
"
```

---

## Troubleshooting Guide

### Issue: Feature not activating

**Symptoms**: Feature flag enabled but metrics show no change

**Check**:
1. Verify config loaded: Check server startup logs for "Enhanced features enabled"
2. Verify feature flag: `node -e "require('./config/priority-config.json').features"`
3. Check constructor: Manager/Planner receives `features` parameter
4. Add debug logs: Temporary console.log in feature code paths

### Issue: Cost predictions inaccurate

**Symptoms**: Cost prediction error >50% after 7 days

**Check**:
1. Verify `_recordCostObservation()` being called
2. Check `exec.costObservations` array populated
3. Verify `result.durationMs` passed in step results
4. Check QueryCostEstimatorPlugin has sufficient telemetry data

### Issue: Excessive replanning (thrashing)

**Symptoms**: Replan rate >10%, safeguard blocks >30% attempts

**Check**:
1. Verify 60s safeguard working: Check `exec.lastReplanAt` timestamps
2. Review trigger distribution: Which trigger fires most?
3. Check performance calculations: `_calculateAvgPerformance()` values
4. Consider raising thresholds: 40% → 50% deviation, 100 → 150 requests

### Issue: Pattern discovery not generating candidates

**Symptoms**: Pattern hit rate = 0%

**Check**:
1. Verify `planning_heuristics` table has data
2. Check `pattern_performance` records with FK to heuristics
3. Verify success_count ≥3 and avg_value >20 threshold met
4. Check `_generateCandidatesFromPatterns()` query results
5. Review pattern_signature format: Must match "type:path" (e.g., "explore:/news/")

---

## Success Metrics (Combined)

**After 30 Days with All Features Enabled**:

| Metric | Baseline (No Features) | Target (All Features) | Actual |
|--------|------------------------|----------------------|--------|
| Average crawl duration | 45 min | 15 min (-67%) | ___ |
| Average articles/crawl | 800 | 1200 (+50%) | ___ |
| Average cost/article | 150ms | 50ms (-67%) | ___ |
| Failed crawls | 8% | 3% (-62%) | ___ |
| Cold-start time (new domains) | 30 min | 12 min (-60%) | ___ |
| Hub discovery rate | 2 hubs/min | 8 hubs/min (+300%) | ___ |

**Overall Efficiency Target**: 70-80% improvement in articles discovered per unit time and cost.

---

## Next Steps

1. **Implement Telemetry Collection**: Add `telemetry.record()` calls to key decision points
2. **Create Grafana Dashboard**: Use metrics above to build monitoring dashboard
3. **Set Up Alerts**: Configure PagerDuty/Slack alerts for critical thresholds
4. **Document Runbook**: Create incident response procedures for each alert
5. **Weekly Review**: Analyze metrics trends, adjust thresholds as needed

**Contact**: For questions about monitoring setup or metric interpretation, see `PHASE_123_INTEGRATION_STATUS.md` for integration details.
