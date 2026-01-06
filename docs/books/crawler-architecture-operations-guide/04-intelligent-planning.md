# Chapter 4: Intelligent Planning

## Overview

The Intelligent Planning system is a sophisticated multi-component architecture for strategic crawl planning with learning, problem detection, clustering, and knowledge reuse.

## Key Files

- [src/crawler/HierarchicalPlanner.js](../../../src/crawler/HierarchicalPlanner.js) (683 lines)
- [src/crawler/IntelligentPlanRunner.js](../../../src/crawler/IntelligentPlanRunner.js) (952 lines)
- [src/crawler/ProblemResolutionService.js](../../../src/crawler/ProblemResolutionService.js) (470 lines)
- [src/crawler/ProblemClusteringService.js](../../../src/crawler/ProblemClusteringService.js) (610 lines)
- [src/crawler/PlannerKnowledgeService.js](../../../src/crawler/PlannerKnowledgeService.js) (547 lines)

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    IntelligentPlanRunner                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Stages: bootstrap → patterns → navigation → hub-plan  │   │
│  │           → verification → seeding → analysis          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│       ┌──────────────────────┼──────────────────────┐          │
│       ▼                      ▼                      ▼          │
│  ┌──────────┐        ┌──────────────┐      ┌──────────────┐   │
│  │Hierarchic│        │PlannerKnowled│      │ProblemCluster│   │
│  │alPlanner │        │geService     │      │ingService    │   │
│  └──────────┘        └──────────────┘      └──────────────┘   │
│       │                      │                      │          │
│       └──────────────────────┼──────────────────────┘          │
│                              ▼                                   │
│                   ┌──────────────────┐                          │
│                   │ProblemResolution │                          │
│                   │Service           │                          │
│                   └──────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

## Hierarchical Planner

### Plan Generation

```javascript
async generatePlan(initialState, goal, context = {}) {
  const { domain } = context;

  // Adaptive parameters based on domain profile
  const profile = await this._analyzeDomainProfile(domain);
  const lookahead = this._calculateOptimalLookahead(profile);
  const branching = this._calculateOptimalBranching(profile);

  // Branch-and-bound search
  const root = this._createNode(initialState, null, null, 0);
  const plan = await this._branchAndBound(root, goal, lookahead, branching, context);

  // Record for learning
  if (domain) {
    await this._recordPlan(domain, plan);
  }

  return plan;
}
```

### Plan Structure

```javascript
{
  steps: [
    { action: 'visit-hub', url: '/world/', estimatedArticles: 50 },
    { action: 'visit-hub', url: '/sport/', estimatedArticles: 30 },
    { action: 'discover-links', depth: 2, maxLinks: 100 }
  ],
  totalValue: 80,           // Expected articles
  totalCost: 15,            // Resource cost
  probability: 0.85,        // Success probability
  length: 3                 // Step count
}
```

### Branch-and-Bound Algorithm (Lines 268-349)

```javascript
async _branchAndBound(root, goal, lookahead, maxBranches, context) {
  const queue = new PriorityQueue((a, b) => b.estimatedValue - a.estimatedValue);
  queue.push(root);

  let bestPlan = null;
  let bestValue = -Infinity;
  let explored = 0;

  while (!queue.isEmpty() && explored < maxBranches * lookahead) {
    const node = queue.pop();
    explored++;

    // Check if goal reached
    if (this._goalSatisfied(node.state, goal)) {
      const plan = this._extractPlan(node);
      if (plan.totalValue > bestValue) {
        bestPlan = plan;
        bestValue = plan.totalValue;
      }
      continue;
    }

    // Prune if not promising (< 50% of best)
    if (bestPlan && node.estimatedValue < bestValue * 0.5) {
      continue;
    }

    // Expand children
    if (node.depth < lookahead) {
      const actions = await this._generateCandidateActions(node.state, context);
      for (const action of actions.slice(0, maxBranches)) {
        const prediction = await this._predictOutcome(action, node.state, context);
        const child = this._createNode(prediction.nextState, action, node, node.depth + 1);
        child.estimatedValue = prediction.value;
        child.probability = prediction.confidence;
        queue.push(child);
      }
    }
  }

  return bestPlan || this._extractPartialPlan(root);
}
```

### Outcome Prediction (Lines 351-376)

```javascript
async _predictOutcome(action, currentState, context) {
  const baseValue = action.estimatedArticles ?? 50;
  const stateBonus = currentState.momentum ?? 0;
  const adjustedValue = baseValue * (1 + stateBonus * 0.1);

  const nextState = {
    hubsDiscovered: currentState.hubsDiscovered + 1,
    articlesCollected: currentState.articlesCollected + adjustedValue,
    requestsMade: currentState.requestsMade + this._estimateCost(action),
    momentum: this._decayMomentum(currentState.momentum) + this._signalFromValue(adjustedValue)
  };

  return {
    nextState,
    value: adjustedValue,
    confidence: 0.7  // Default confidence
  };
}
```

### Adaptive Parameters

**Domain Profile Analysis (Lines 505-527):**
```javascript
async _analyzeDomainProfile(domain) {
  const pageCount = await this._countPages(domain);
  const hubTypes = await this._identifyHubTypes(domain);

  return {
    pageCount,
    hubTypeCount: hubTypes.length,
    complexity: Math.log10(pageCount + 10) * hubTypes.length / 5
  };
}
```

**Optimal Lookahead (Lines 533-544):**
```javascript
_calculateOptimalLookahead(profile) {
  if (profile.pageCount < 1000) return 3;       // Small sites
  if (profile.pageCount < 10000) return 5;      // Medium sites
  return 7;                                       // Large sites
}
```

**Optimal Branching (Lines 550-561):**
```javascript
_calculateOptimalBranching(profile) {
  if (profile.hubTypeCount < 5 && profile.complexity < 3) return 5;    // Simple
  if (profile.hubTypeCount < 15 && profile.complexity < 8) return 10;  // Medium
  return 15;                                                             // Complex
}
```

### Heuristic Learning (Lines 186-251)

```javascript
async learnHeuristics(domain, planOutcomes) {
  // Filter successful outcomes (actual >= expected * 0.7)
  const successes = planOutcomes.filter(o => o.actual >= o.expected * 0.7);

  // Extract patterns
  const patterns = this._extractPatterns(successes.map(o => o.sequence));

  // Compute optimal parameters
  const avgLookahead = average(successes.map(o => o.sequence.length));
  const avgBranching = average(successes.map(o => o.branchingUsed));

  // Cross-domain sharing (if enabled)
  if (this.crossDomainEnabled) {
    const similar = await this._findSimilarDomains(domain);
    for (const d of similar) {
      await this._sharePatterns(d, patterns, { confidence: 0.8 * 0.7 });
    }
  }

  // Persist
  await this._saveHeuristic(domain, { patterns, avgLookahead, avgBranching });
}
```

## Intelligent Plan Runner

### Execution Stages

The runner orchestrates 7 stages:

| Stage | Purpose | Lines |
|-------|---------|-------|
| bootstrap | Validate domain suitability | 181-207 |
| infer-patterns | Learn section patterns | 231-264 |
| navigation-discovery | Map navigation links | 272-309 |
| country-hub-planning | Generate country hub candidates | 311-335 |
| verification | Verify hubs against cache | 341-450 |
| hub-seeding | Seed plan with hubs | 473-519 |
| targeted-analysis | Deep analysis of samples | 523-554 |

### Stage 1: Bootstrap (Lines 181-207)

```javascript
const bootstrapResult = await orchestrator.runStage('bootstrap', {}, async () => {
  return plannerBootstrap.run({
    domain,
    host,
    baseUrl,
    startUrl
  });
});

if (!bootstrapResult.suitable) {
  return { skipped: true, reason: bootstrapResult.reason };
}
```

### Stage 2: Pattern Inference (Lines 231-264)

```javascript
const patternsResult = await orchestrator.runStage('infer-patterns', {}, async () => {
  return patternInference.run({
    url: homepage,
    html: homepageHtml,
    domain
  });
});

// Output: { sections: ['world', 'sport', 'business'], articleHints: ['/article/123'] }
```

### Stage 3: Navigation Discovery (Lines 272-309)

```javascript
const navResult = await orchestrator.runStage('navigation-discovery', {}, async () => {
  return navigationRunner.run({
    seeds: this._buildNavigationSeeds({ startUrl, sectionSlugs, articleHints }),
    maxPages: 5,
    maxLinksPerPage: 80
  });
});

// Output: { links: [...], totalDiscovered: 500 }
```

### Stage 4: Country Hub Planning (Lines 311-335)

```javascript
const hubCandidates = await countryHubPlanner.computeCandidates(host);
// Output: ['/world/us/', '/world/uk/', '/world/france/', ...]
```

### Stage 5: Hub Verification (Lines 341-450)

```javascript
for (const candidate of hubCandidates) {
  const status = await this._verifyHubStatus(candidate);

  if (status === 'verified') {
    verified.push(candidate);
  } else if (status === 'missing') {
    // Enqueue with maximum priority
    enqueueRequest({ url: candidate, priority: 250, type: 'hub-verification' });
    missing.push(candidate);
  } else if (status === 'known-404') {
    skipped.push(candidate);
  }
}
```

### Stage 6: Hub Seeding (Lines 473-519)

```javascript
const seedResult = await hubSeeder.seedPlan({
  host,
  sectionSlugs,
  countryCandidates,
  maxSeeds: intMaxSeeds,
  navigationLinks: navResult.links,
  costEstimates
});

// Output: { seeded: 50, requested: 100, samples: [...] }
```

## Problem Clustering Service

### Problem Processing (Lines 26-83)

```javascript
processProblem({ jobId, kind, scope, target, message, details, timestamp }) {
  const clusterId = this._generateClusterId(kind, scope, target);
  // Format: "kind:scope:target[0:50]"

  let cluster = this.activeClusters.get(clusterId);
  if (!cluster) {
    cluster = this._createNewCluster({ id: clusterId, jobId, kind, scope, target });
    this.activeClusters.set(clusterId, cluster);
  }

  // Update cluster
  cluster.lastSeen = timestamp;
  cluster.occurrenceCount += 1;
  cluster.recentProblems.push({ message, details, timestamp });
  if (cluster.recentProblems.length > 10) cluster.recentProblems.shift();

  // Recalculate boost
  cluster.priorityBoost = this._calculatePriorityBoost(cluster);

  // Generate gap predictions if threshold reached
  if (cluster.occurrenceCount >= this.problemThreshold) {
    this._analyzeClusterForPredictions(cluster);
  }

  return cluster;
}
```

### Priority Boost Calculation (Lines 563-574)

```javascript
_calculatePriorityBoost(cluster) {
  // Logarithmic scaling prevents dominance
  return Math.min(
    Math.log2(cluster.occurrenceCount) * this.boostFactorPerCluster,
    20  // Maximum boost
  );
}

// Example:
// 2 occurrences → log2(2) * 2.5 = 2.5 boost
// 8 occurrences → log2(8) * 2.5 = 7.5 boost
// 64 occurrences → log2(64) * 2.5 = 15 boost
// 1000+ occurrences → capped at 20 boost
```

### Gap Prediction Generation (Lines 314-417)

```javascript
_analyzeClusterForPredictions(cluster) {
  const predictions = [];

  if (cluster.kind === 'missing-hub') {
    // Generate hub URL variations
    const baseUrls = this._extractBaseUrls(cluster.recentProblems);
    for (const base of baseUrls) {
      predictions.push({
        type: 'hub',
        url: `${base}/`,
        confidence: this._calculatePredictionConfidence(cluster, 'hub') * 0.8,
        expectedCoverageLift: 0.1
      });
    }
  }

  if (cluster.kind === 'coverage-gap') {
    // Fill coverage gaps by area
    const areas = this._extractAreas(cluster.recentProblems);
    for (const area of areas) {
      predictions.push(
        { url: `${baseUrl}/${area}`, lift: 0.08 },
        { url: `${baseUrl}/${area}/latest`, lift: 0.06 }
      );
    }
  }

  this._storePredictions(predictions);
}
```

## Problem Resolution Service

### Resolution Candidate Building (Lines 196-213)

```javascript
buildResolutionCandidates({ host, sourceUrl, urlPlaceAnalysis, hubCandidate }) {
  // 1. Build place chain
  const placeChain = this.buildPlaceChain(urlPlaceAnalysis);
  // Example: [{ slug: 'us', kind: 'country' }, { slug: 'california', kind: 'state' }]

  // 2. Build topic candidates
  const topics = this.buildTopicCandidates(urlPlaceAnalysis, hubCandidate);
  // Example: ['politics', 'business', 'sport']

  // 3. Compute confidence
  const confidence = this.computeConfidence({ placeChain, topics, hubCandidate });

  // 4. Generate candidate URLs
  const urls = this.buildCandidateUrls({ host, placeChain, topics, sourceUrl });

  return { placeChain, topics, confidence, urls };
}
```

### Confidence Computation (Lines 87-96)

```javascript
computeConfidence({ placeChain, topics, hubCandidate }) {
  let confidence = 0.4;  // Base

  // Place chain quality
  if (placeChain.length >= 2) confidence += 0.2;
  else if (placeChain.length === 1) confidence += 0.1;

  // Topic presence
  if (topics.length > 0) confidence += 0.1;

  // Hub signals
  if (hubCandidate?.navLinksCount >= 10) confidence += 0.1;
  if (hubCandidate?.articleLinksCount >= 4) confidence += 0.05;

  return Math.max(0.2, Math.min(0.95, confidence));
}
```

### URL Generation Patterns (Lines 98-149)

```javascript
buildCandidateUrls({ host, placeChain, topics, sourceUrl }) {
  const candidates = [];
  const base = `https://${host}`;

  // Pattern 1: Full place chain
  if (placeChain.length > 0) {
    const path = placeChain.map(p => p.slug).join('/');
    candidates.push({ url: `${base}/${path}/`, variant: 'place-chain' });
  }

  // Pattern 2: Topic + place
  for (const topic of topics) {
    for (const place of placeChain) {
      candidates.push({ url: `${base}/${topic}/${place.slug}/`, variant: 'topic+place' });
    }
  }

  // Pattern 3: Topic only
  for (const topic of topics) {
    candidates.push({ url: `${base}/${topic}/`, variant: 'topic-only' });
  }

  // Pattern 4: Last 2 places (tail)
  if (placeChain.length >= 2) {
    const tail = placeChain.slice(-2).map(p => p.slug).join('/');
    candidates.push({ url: `${base}/${tail}/`, variant: 'place-tail' });
  }

  // Pattern 5: Source URL prefix
  const sourcePath = new URL(sourceUrl).pathname;
  const prefix = sourcePath.split('/').slice(0, 3).join('/');
  candidates.push({ url: `${base}${prefix}/`, variant: 'source-prefix' });

  return candidates;
}
```

## Planner Knowledge Service

### Learning from Discovery (Lines 22-69)

```javascript
async learnFromHubDiscovery({ domain, hubUrl, discoveryMethod, success, metadata = {} }) {
  // Extract pattern from URL
  const pattern = this._extractPattern(hubUrl, discoveryMethod);

  // Record in database
  await this.plannerDb.recordPattern({
    domain,
    pattern: pattern.regex,
    successIncrement: success ? 1 : 0,
    failureIncrement: success ? 0 : 1,
    metadata: {
      discoveryMethod,
      learnedFrom: hubUrl,
      learnedAt: new Date().toISOString()
    }
  });

  // Clear cache
  this.patternCache.delete(`patterns:${domain}:*`);
}
```

### Pattern Types

**Structural Pattern (Lines 320-334):**
```javascript
// Input: /world/us/politics/
// Output: ^/(?:world)/([a-z]{2,3})/([a-z-]+)/?$
```

**Semantic Pattern (Lines 336-353):**
```javascript
// Input: /news/world/france/economy/
// Output: ^/(?:news)/(?:world)/([a-z-]+)/([a-z-]+)/?$
// Keeps literals: world, news, sport, business, tech, culture
```

### Hub Validation (Lines 106-206)

```javascript
async validateHubUrl({ domain, hubUrl, hubType, force = false }) {
  // 1. Check cache
  const cached = this.hubValidationCache.get(`hub:${hubUrl}`);
  if (cached && !force) return cached;

  // 2. Check database for existing validation
  const existing = await this.plannerDb.getValidatedHub(hubUrl);
  if (existing && existing.expiresAt > Date.now()) {
    this.hubValidationCache.set(`hub:${hubUrl}`, existing);
    return existing;
  }

  // 3. Pattern-based validation
  const patterns = await this.getLearnedPatterns(domain, 0.5);
  let confidence = 0.3;  // Base for unknown

  for (const pattern of patterns) {
    if (new RegExp(pattern.regex).test(hubUrl)) {
      confidence += pattern.confidence_score * 0.3;
    }
  }

  // 4. URL structure heuristics
  const heuristics = this._analyzeUrlStructure(hubUrl);
  confidence += heuristics.boost;

  // 5. Record validation
  const status = confidence >= 0.6 ? 'valid' : 'uncertain';
  await this.plannerDb.recordHubValidation({
    domain, hubUrl, hubType,
    validationStatus: status,
    classificationConfidence: confidence,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000  // 7 days
  });

  return { status, confidence };
}
```

### URL Structure Heuristics (Lines 417-464)

```javascript
_analyzeUrlStructure(hubUrl) {
  const parsed = new URL(hubUrl);
  const segments = parsed.pathname.split('/').filter(Boolean);
  let boost = 0;

  // Positive indicators
  if (segments.length >= 1 && segments.length <= 3) boost += 0.1;  // Good depth
  if (KNOWN_SECTIONS.includes(segments[0])) boost += 0.2;          // Known section
  if (segments[segments.length - 1] === '' || !segments[segments.length - 1].includes('.')) {
    boost += 0.1;  // Hub-like ending
  }

  // Negative indicators
  if (/article|story|post/i.test(parsed.pathname)) boost -= 0.3;   // Article path
  if (/\d{4}\/\d{2}\/\d{2}/.test(parsed.pathname)) boost -= 0.2;   // Date pattern
  if (parsed.search) boost -= 0.1;                                   // Query params

  return { boost: Math.max(-0.5, Math.min(0.5, boost)) };
}

const KNOWN_SECTIONS = ['world', 'news', 'sport', 'business', 'tech', 'culture', 'opinion'];
```

## Key Method Signatures

| Component | Method | Signature |
|-----------|--------|-----------|
| HierarchicalPlanner | generatePlan | `async generatePlan(initialState, goal, context)` |
| HierarchicalPlanner | learnHeuristics | `async learnHeuristics(domain, planOutcomes)` |
| IntelligentPlanRunner | run | `async run()` |
| ProblemClusteringService | processProblem | `processProblem({ jobId, kind, scope, ... })` |
| ProblemClusteringService | getPriorityBoostForUrl | `getPriorityBoostForUrl(url, jobId)` |
| ProblemResolutionService | buildResolutionCandidates | `buildResolutionCandidates({ host, sourceUrl, ... })` |
| ProblemResolutionService | resolveMissingHub | `resolveMissingHub({ jobId, host, ... })` |
| PlannerKnowledgeService | learnFromHubDiscovery | `async learnFromHubDiscovery({ domain, hubUrl, ... })` |
| PlannerKnowledgeService | validateHubUrl | `async validateHubUrl({ domain, hubUrl, ... })` |

## Next Chapter

Continue to [Chapter 5: Classification Cascade](./05-classification-cascade.md) to learn about the three-stage classification system.
