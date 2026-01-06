# Appendix B: Weight Tuning Cookbook

*Practical guide to adjusting disambiguation weights for your use case*

---

## Default Weights

Start with these baseline weights:

```json
{
  "matchQuality": 0.07,
  "priorityScore": 0.12,
  "publisherPrior": 0.20,
  "coMentionCountry": 0.18,
  "hierarchicalContainment": 0.25,
  "geographicProximity": 0.03,
  "textWindowContext": 0.15
}
```

These weights sum to 1.0, making scores directly interpretable as a weighted average.

---

## Tuning Principles

1. **Weights reflect trust** — Higher weight = more trust in that signal
2. **Balance local vs global** — Local signals (text context) vs global (publisher, priority)
3. **Test on representative data** — Tune on your actual article distribution
4. **Small changes** — Adjust by 0.02–0.05 at a time
5. **Re-normalize** — Keep weights summing to 1.0

---

## Scenario: Publisher-Heavy Corpus

If your articles come from publishers with strong geographic focus (BBC → UK, CBC → Canada):

```json
{
  "matchQuality": 0.05,
  "priorityScore": 0.08,
  "publisherPrior": 0.35,      // Increased significantly
  "coMentionCountry": 0.15,
  "hierarchicalContainment": 0.20,
  "geographicProximity": 0.02,
  "textWindowContext": 0.15
}
```

**When to use**: News aggregator with known publishers.

---

## Scenario: Mixed/Unknown Publishers

If publisher identity is unreliable or missing:

```json
{
  "matchQuality": 0.08,
  "priorityScore": 0.15,
  "publisherPrior": 0.05,      // Reduced to near-zero
  "coMentionCountry": 0.25,    // Increased
  "hierarchicalContainment": 0.25,
  "geographicProximity": 0.05,
  "textWindowContext": 0.17
}
```

**When to use**: Social media, user-generated content, unknown sources.

---

## Scenario: Strong Context Available

If articles have rich text with country/region names near mentions:

```json
{
  "matchQuality": 0.05,
  "priorityScore": 0.10,
  "publisherPrior": 0.15,
  "coMentionCountry": 0.15,
  "hierarchicalContainment": 0.25,
  "geographicProximity": 0.03,
  "textWindowContext": 0.27      // Increased significantly
}
```

**When to use**: Long-form journalism, well-structured articles.

---

## Scenario: Short Texts / Headlines

If working with headlines or tweets where context is minimal:

```json
{
  "matchQuality": 0.10,
  "priorityScore": 0.25,          // Priority matters more
  "publisherPrior": 0.30,      // Publisher is key signal
  "coMentionCountry": 0.15,
  "hierarchicalContainment": 0.10,
  "geographicProximity": 0.05,
  "textWindowContext": 0.05     // Little text to analyze
}
```

**When to use**: Twitter, headlines, brief mentions.

---

## Scenario: Geographic Clustering Important

If articles typically cover a single region (local news):

```json
{
  "matchQuality": 0.05,
  "priorityScore": 0.10,
  "publisherPrior": 0.15,
  "coMentionCountry": 0.25,    // Increased
  "hierarchicalContainment": 0.30,  // Increased
  "geographicProximity": 0.07,
  "textWindowContext": 0.08
}
```

**When to use**: Local newspapers, regional coverage.

---

## Tuning Workflow

### Step 1: Establish Baseline

```bash
node tools/evaluate.js --eval-set data/eval/baseline.json
# Accuracy: 85.2%, Coverage: 88.0%
```

### Step 2: Identify Failure Patterns

```javascript
// Analyze errors
const errors = evalResults.errors;
const patterns = {};

for (const e of errors) {
  const key = `${e.expected} vs ${e.got}`;
  patterns[key] = (patterns[key] || 0) + 1;
}

console.log('Common errors:', Object.entries(patterns).sort((a,b) => b[1] - a[1]).slice(0, 5));
```

### Step 3: Hypothesize and Adjust

Common patterns and fixes:

| Error Pattern | Likely Cause | Weight Adjustment |
|--------------|--------------|-------------------|
| UK instead of CA for CBC articles | Publisher prior too weak | ↑ publisherPrior |
| Small city beats large city | Priority too low | ↑ priorityScore |
| Wrong country despite explicit mention | Text context too weak | ↑ textWindowContext |
| Ignores mentioned region | Containment too weak | ↑ hierarchicalContainment |

### Step 4: Test and Iterate

```bash
# Test with new weights
node tools/evaluate.js --eval-set data/eval/baseline.json --weights config/weights-v2.json

# Compare
# Before: Accuracy: 85.2%
# After:  Accuracy: 87.8%
```

### Step 5: Validate on Hold-Out Set

```bash
# Never tune on this set, only validate
node tools/evaluate.js --eval-set data/eval/holdout.json --weights config/weights-v2.json
```

---

## A/B Testing Weights

In production, test weight changes gradually:

```javascript
function getWeights(userId) {
  // 10% of users get experimental weights
  if (hashUserId(userId) % 10 === 0) {
    return experimentalWeights;
  }
  return productionWeights;
}

// Log which weights were used
logger.info('disambiguation', {
  ...result,
  weightsVersion: isExperimental ? 'v2' : 'v1'
});
```

---

## Confidence Thresholds

Adjust confidence thresholds alongside weights:

```json
{
  "abstainThreshold": 0.4,       // Below this, abstain
  "lowConfidenceThreshold": 0.6, // Below this, flag for review
  "highConfidenceThreshold": 0.85 // Above this, auto-accept
}
```

**Trade-off**: Lower thresholds → more coverage, less accuracy.

---

## Weight Sensitivity Analysis

Test how sensitive your system is to each weight:

```javascript
async function sensitivityAnalysis(baseWeights, evalSet) {
  const results = {};
  
  for (const feature of Object.keys(baseWeights)) {
    // Test +0.1 and -0.1 variations
    for (const delta of [-0.1, 0, +0.1]) {
      const testWeights = { ...baseWeights };
      testWeights[feature] += delta;
      
      // Renormalize
      const sum = Object.values(testWeights).reduce((a, b) => a + b, 0);
      for (const k of Object.keys(testWeights)) {
        testWeights[k] /= sum;
      }
      
      const accuracy = await evaluateAccuracy(service, evalSet, testWeights);
      results[`${feature}:${delta > 0 ? '+' : ''}${delta}`] = accuracy;
    }
  }
  
  return results;
}
```

Output:
```
publisherPrior:-0.1  → 82.1%
publisherPrior:0     → 85.2%
publisherPrior:+0.1  → 86.8%  ← Sensitive, increase helps

priorityScore:-0.1   → 85.0%
priorityScore:0      → 85.2%
priorityScore:+0.1   → 85.3%  ← Not very sensitive
```

---

## Quick Reference: Weight Adjustments

| Problem | Adjust |
|---------|--------|
| Wrong country for known publishers | ↑ publisherPrior |
| Big city loses to small city | ↑ priorityScore |
| Ignores "London, Ontario" qualifier | ↑ matchQuality |
| Ignores nearby mentioned places | ↑ hierarchicalContainment |
| Ignores text clues like "parliament" | ↑ textWindowContext |
| Picks distant places | ↑ geographicProximity |
| Ignores co-mentioned countries | ↑ coMentionCountry |

---

*Next: [Appendix C — Publisher Priors Table](./appendix-c-publisher-priors.md)*
