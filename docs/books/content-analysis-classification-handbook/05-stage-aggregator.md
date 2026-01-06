# Chapter 5: Stage Aggregator

## Overview

The Stage Aggregator combines results from all classification stages using weighted voting and tracks provenance for debugging.

**File:** [src/classifiers/StageAggregator.js](../../../src/classifiers/StageAggregator.js)

## Aggregation Strategy

### Stage Weights

```javascript
const STAGE_WEIGHTS = {
  url: 1.0,        // Stage 1: URL classification
  content: 1.2,    // Stage 2: Content classification
  puppeteer: 1.5   // Stage 3: Puppeteer classification
};
```

**Rationale:**
- URL is fastest but least accurate
- Content adds significant signal
- Puppeteer is most accurate but expensive

### High Confidence Bypass

```javascript
const HIGH_CONFIDENCE_THRESHOLD = 0.9;

function aggregate({ stage1, stage2, stage3 }) {
  // Single-stage high confidence wins
  if (stage3?.confidence >= HIGH_CONFIDENCE_THRESHOLD) {
    return buildResult(stage3, 'puppeteer-high-confidence');
  }
  if (stage2?.confidence >= HIGH_CONFIDENCE_THRESHOLD) {
    return buildResult(stage2, 'content-high-confidence');
  }
  if (stage1?.confidence >= HIGH_CONFIDENCE_THRESHOLD) {
    return buildResult(stage1, 'url-high-confidence');
  }

  // Fall through to weighted voting
  return weightedVote({ stage1, stage2, stage3 });
}
```

## Weighted Voting

### Vote Calculation

```javascript
function weightedVote({ stage1, stage2, stage3 }) {
  const scores = {
    article: 0,
    hub: 0,
    nav: 0,
    unknown: 0
  };

  // Accumulate weighted scores
  if (stage1) {
    scores[stage1.classification] += stage1.confidence * STAGE_WEIGHTS.url;
  }
  if (stage2) {
    scores[stage2.classification] += stage2.confidence * STAGE_WEIGHTS.content;
  }
  if (stage3) {
    scores[stage3.classification] += stage3.confidence * STAGE_WEIGHTS.puppeteer;
  }

  // Find winner
  const sorted = Object.entries(scores)
    .sort((a, b) => b[1] - a[1]);

  const [classification, score] = sorted[0];
  const [runnerUp, runnerUpScore] = sorted[1];

  // Calculate aggregate confidence
  const totalWeight = calculateTotalWeight({ stage1, stage2, stage3 });
  const confidence = score / totalWeight;

  // Reduce confidence if close race
  const margin = score - runnerUpScore;
  const adjustedConfidence = margin < 0.2 * score
    ? confidence * 0.85
    : confidence;

  return {
    classification,
    confidence: Math.min(1, adjustedConfidence),
    aggregationMethod: 'weighted-vote',
    margin,
    runnerUp
  };
}
```

### Total Weight Calculation

```javascript
function calculateTotalWeight({ stage1, stage2, stage3 }) {
  let total = 0;
  if (stage1) total += STAGE_WEIGHTS.url;
  if (stage2) total += STAGE_WEIGHTS.content;
  if (stage3) total += STAGE_WEIGHTS.puppeteer;
  return total;
}
```

## Tie-Breaking

### Classification Priority

When scores are equal, use classification priority:

```javascript
const CLASSIFICATION_PRIORITY = {
  unknown: 0,
  nav: 1,
  hub: 2,
  article: 3
};

function breakTie(candidates) {
  return candidates.sort((a, b) => {
    // First by score
    if (a.score !== b.score) return b.score - a.score;
    // Then by priority
    return CLASSIFICATION_PRIORITY[b.classification] - CLASSIFICATION_PRIORITY[a.classification];
  })[0];
}
```

### Override Rules

```javascript
function applyOverrides({ stage1, stage2, stage3, preliminary }) {
  // Content override margin: if content strongly disagrees
  const CONTENT_OVERRIDE_MARGIN = 0.15;

  if (stage2 && stage1) {
    const stage2Score = stage2.confidence;
    const stage1Score = stage1.confidence;

    if (stage2.classification !== stage1.classification &&
        stage2Score > stage1Score + CONTENT_OVERRIDE_MARGIN) {
      return {
        classification: stage2.classification,
        confidence: stage2Score * 0.95,
        overrideReason: 'content-override'
      };
    }
  }

  return preliminary;
}
```

## Provenance Tracking

### Building Provenance

```javascript
function buildProvenance({ stage1, stage2, stage3 }) {
  const stages = [];

  if (stage1) {
    stages.push({
      stage: 1,
      name: 'url',
      classification: stage1.classification,
      confidence: stage1.confidence,
      reason: stage1.reason,
      weight: STAGE_WEIGHTS.url
    });
  }

  if (stage2) {
    stages.push({
      stage: 2,
      name: 'content',
      classification: stage2.classification,
      confidence: stage2.confidence,
      reasons: stage2.reasons,
      weight: STAGE_WEIGHTS.content
    });
  }

  if (stage3) {
    stages.push({
      stage: 3,
      name: 'puppeteer',
      classification: stage3.classification,
      confidence: stage3.confidence,
      renderTimeMs: stage3.renderTimeMs,
      weight: STAGE_WEIGHTS.puppeteer
    });
  }

  // Analyze agreement
  const classifications = stages.map(s => s.classification);
  const uniqueClassifications = new Set(classifications);
  const hasDisagreement = uniqueClassifications.size > 1;

  // Find dominant stage
  const dominantStage = stages.sort((a, b) =>
    (b.confidence * b.weight) - (a.confidence * a.weight)
  )[0];

  return {
    stages,
    hasDisagreement,
    unanimousClassification: hasDisagreement ? null : classifications[0],
    dominantStage: dominantStage.name,
    dominantConfidence: dominantStage.confidence,
    aggregationMethod: hasDisagreement ? 'weighted-vote' : 'unanimous'
  };
}
```

### Provenance Example

```javascript
{
  stages: [
    {
      stage: 1,
      name: 'url',
      classification: 'article',
      confidence: 0.85,
      reason: 'date-pattern-match',
      weight: 1.0
    },
    {
      stage: 2,
      name: 'content',
      classification: 'article',
      confidence: 0.90,
      reasons: ['high-word-count', 'article-schema'],
      weight: 1.2
    }
  ],
  hasDisagreement: false,
  unanimousClassification: 'article',
  dominantStage: 'content',
  dominantConfidence: 0.90,
  aggregationMethod: 'unanimous'
}
```

## Complete Aggregation Flow

```javascript
function aggregate({ stage1, stage2, stage3 }) {
  // 1. Check for high confidence bypass
  const highConfidence = checkHighConfidence({ stage1, stage2, stage3 });
  if (highConfidence) return highConfidence;

  // 2. Perform weighted voting
  const voted = weightedVote({ stage1, stage2, stage3 });

  // 3. Apply override rules
  const overridden = applyOverrides({ stage1, stage2, stage3, preliminary: voted });

  // 4. Build provenance
  const provenance = buildProvenance({ stage1, stage2, stage3 });

  // 5. Construct final result
  return {
    classification: overridden.classification,
    confidence: overridden.confidence,
    provenance,
    stageResults: { stage1, stage2, stage3 },
    overrideApplied: overridden.overrideReason || null
  };
}
```

## Result Structure

```javascript
{
  // Final classification
  classification: 'article',
  confidence: 0.88,

  // How we got here
  provenance: {
    stages: [...],
    hasDisagreement: false,
    unanimousClassification: 'article',
    dominantStage: 'content',
    aggregationMethod: 'unanimous'
  },

  // Raw stage results
  stageResults: {
    stage1: { classification: 'article', confidence: 0.85, ... },
    stage2: { classification: 'article', confidence: 0.90, ... },
    stage3: null
  },

  // Override info
  overrideApplied: null
}
```

## Edge Cases

### Single Stage Available

```javascript
if (!stage1 && !stage2 && !stage3) {
  return { classification: 'unknown', confidence: 0, provenance: { stages: [] } };
}

if (!stage2 && !stage3) {
  return buildResult(stage1, 'url-only');
}
```

### All Stages Disagree

```javascript
// stage1: article (0.7), stage2: hub (0.6), stage3: nav (0.65)
// Uses weighted voting - puppeteer has highest weight
// nav: 0.65 * 1.5 = 0.975
// article: 0.7 * 1.0 = 0.70
// hub: 0.6 * 1.2 = 0.72

// Result: nav with reduced confidence due to disagreement
```

### Very Low Confidence

```javascript
function handleLowConfidence(result) {
  if (result.confidence < 0.4) {
    return {
      ...result,
      classification: 'unknown',
      originalClassification: result.classification,
      lowConfidenceReason: 'below-threshold'
    };
  }
  return result;
}
```

## Debugging Aggregation

```javascript
function explainAggregation({ stage1, stage2, stage3 }) {
  console.log('Stage 1 (URL):', stage1?.classification, '@', stage1?.confidence);
  console.log('Stage 2 (Content):', stage2?.classification, '@', stage2?.confidence);
  console.log('Stage 3 (Puppeteer):', stage3?.classification, '@', stage3?.confidence);

  const result = aggregate({ stage1, stage2, stage3 });

  console.log('Final:', result.classification, '@', result.confidence);
  console.log('Method:', result.provenance.aggregationMethod);
  console.log('Dominant:', result.provenance.dominantStage);
  console.log('Disagreement:', result.provenance.hasDisagreement);

  return result;
}
```

## Next Chapter

Continue to [Chapter 6: Place Extraction & Matching](./06-place-extraction-matching.md) for gazetteer-based place detection.
