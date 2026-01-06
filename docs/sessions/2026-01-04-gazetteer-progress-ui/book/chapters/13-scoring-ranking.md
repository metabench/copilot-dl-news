# Chapter 13: Scoring and Ranking

*Reading time: 10 minutes*

---

## From Features to Decisions

We have feature vectors. Now we need to combine them into a single score and pick a winner.

This chapter covers scoring functions, ranking strategies, and when to abstain.

---

## Basic Weighted Sum

The simplest scorer: multiply each feature by a weight and sum.

```javascript
const DEFAULT_WEIGHTS = {
  matchQuality: 0.07,
  priorityScore: 0.12,
  publisherPrior: 0.20,
  coMentionCountry: 0.18,
  hierarchicalContainment: 0.25,
  geographicProximity: 0.03,
  textWindowContext: 0.15
};

function scoreCandidate(features, weights = DEFAULT_WEIGHTS) {
  let score = 0;
  
  for (const [feature, weight] of Object.entries(weights)) {
    if (features[feature] !== undefined) {
      score += features[feature] * weight;
    }
  }
  
  return score;
}
```

---

## Ranking Candidates

Score all candidates and sort:

```javascript
function rankCandidates(db, mention, candidates, context) {
  const scored = candidates.map(candidate => {
    const features = computeFeatureVector({
      ...context,
      mention,
      candidate,
      db
    });
    
    const score = scoreCandidate(features);
    
    return {
      ...candidate,
      features,
      score
    };
  });
  
  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  
  return scored;
}
```

---

## The Winner-Take-All Problem

Simply picking the top scorer is dangerous:

| Candidate | Score | Problem |
|-----------|-------|---------|
| London, UK | 0.72 | ← Winner |
| London, ON | 0.68 | Very close! |
| London, KY | 0.41 | Clear gap |

When top scores are close, confidence should be low.

---

## Score Gap and Confidence

Compute confidence based on the gap between #1 and #2:

```javascript
function computeConfidence(rankedCandidates) {
  if (rankedCandidates.length === 0) {
    return { confidence: 0, reason: 'no_candidates' };
  }
  
  if (rankedCandidates.length === 1) {
    const only = rankedCandidates[0];
    return {
      confidence: only.score > 0.5 ? 0.8 : 0.5,
      reason: 'single_candidate'
    };
  }
  
  const top = rankedCandidates[0];
  const second = rankedCandidates[1];
  
  const gap = top.score - second.score;
  const topScore = top.score;
  
  // Confidence based on gap and absolute score
  let confidence;
  
  if (gap > 0.2 && topScore > 0.7) {
    confidence = 0.95;  // Clear winner with high score
  } else if (gap > 0.15 && topScore > 0.6) {
    confidence = 0.85;
  } else if (gap > 0.1 && topScore > 0.5) {
    confidence = 0.70;
  } else if (gap > 0.05) {
    confidence = 0.50;
  } else {
    confidence = 0.30;  // Too close to call
  }
  
  return {
    confidence,
    gap,
    topScore,
    reason: gap < 0.05 ? 'close_scores' : 'normal'
  };
}
```

---

## Abstention: When Not to Decide

Sometimes the right answer is "I don't know":

```javascript
function shouldAbstain(rankedCandidates, confidenceResult) {
  const { confidence, reason } = confidenceResult;
  
  // Hard abstention cases
  if (confidence < 0.4) return { abstain: true, reason: 'low_confidence' };
  if (reason === 'no_candidates') return { abstain: true, reason: 'no_candidates' };
  
  // Top score too low
  if (rankedCandidates[0]?.score < 0.3) {
    return { abstain: true, reason: 'top_score_too_low' };
  }
  
  // Tie: multiple candidates with essentially equal scores
  if (rankedCandidates.length >= 2) {
    const top = rankedCandidates[0].score;
    const tieCount = rankedCandidates.filter(c => top - c.score < 0.02).length;
    if (tieCount >= 3) {
      return { abstain: true, reason: 'multi_way_tie' };
    }
  }
  
  return { abstain: false };
}
```

---

## The Complete Ranking Pipeline

```javascript
async function disambiguateMention(db, mention, context) {
  // 1. Generate candidates
  const candidates = await generateCandidates(db, mention);
  
  if (candidates.length === 0) {
    return {
      mention,
      resolved: null,
      confidence: 0,
      candidates: [],
      abstained: true,
      abstainReason: 'no_candidates'
    };
  }
  
  // 2. Rank candidates
  const ranked = rankCandidates(db, mention, candidates, context);
  
  // 3. Compute confidence
  const confidenceResult = computeConfidence(ranked);
  
  // 4. Check for abstention
  const abstainCheck = shouldAbstain(ranked, confidenceResult);
  
  if (abstainCheck.abstain) {
    return {
      mention,
      resolved: null,
      confidence: confidenceResult.confidence,
      candidates: ranked.slice(0, 5),  // Return top 5 for review
      abstained: true,
      abstainReason: abstainCheck.reason
    };
  }
  
  // 5. Return winner
  const winner = ranked[0];
  
  return {
    mention,
    resolved: {
      place_id: winner.place_id,
      name: winner.name,
      kind: winner.kind,
      country_iso2: winner.country_iso2,
      country_name: winner.country_name,
      adm1_name: winner.adm1_name,
      lat: winner.lat,
      lng: winner.lng,
      display_label: generateDisplayLabel(winner)
    },
    confidence: confidenceResult.confidence,
    score: winner.score,
    features: winner.features,
    candidates: ranked.slice(0, 5),
    abstained: false
  };
}
```

---

## Multi-Pass Scoring

For better accuracy, use a two-pass approach:

**Pass 1**: Score each mention independently
**Pass 2**: Re-score with resolved context

```javascript
async function disambiguateArticle(db, article) {
  const { mentions, publisher, text } = article;
  
  // Build context
  const context = {
    publisherProfile: getPublisherProfile(publisher),
    resolvedPlaces: [],
    resolvedRegions: [],
    textWindows: extractTextWindows(text, mentions)
  };
  
  // === PASS 1: Independent scoring ===
  const pass1Results = [];
  
  for (const mention of mentions) {
    const result = await disambiguateMention(db, mention.text, {
      ...context,
      textWindow: context.textWindows[mention.position]
    });
    pass1Results.push(result);
    
    // Add high-confidence results to context for subsequent mentions
    if (!result.abstained && result.confidence > 0.7) {
      context.resolvedPlaces.push(result.resolved);
      if (['country', 'adm1', 'adm2'].includes(result.resolved.kind)) {
        context.resolvedRegions.push(result.resolved);
      }
    }
  }
  
  // === PASS 2: Re-score low-confidence with full context ===
  const pass2Results = [];
  
  for (let i = 0; i < pass1Results.length; i++) {
    const pass1 = pass1Results[i];
    const mention = mentions[i];
    
    if (pass1.confidence < 0.7 && !pass1.abstained) {
      // Re-score with full context
      const pass2 = await disambiguateMention(db, mention.text, {
        ...context,
        resolvedPlaces: pass1Results
          .filter(r => !r.abstained && r.confidence > 0.6)
          .map(r => r.resolved),
        textWindow: context.textWindows[mention.position]
      });
      pass2Results.push(pass2);
    } else {
      pass2Results.push(pass1);
    }
  }
  
  return pass2Results;
}
```

---

## Handling Ties

When two candidates are essentially tied:

```javascript
function handleTie(candidate1, candidate2, mention, context) {
  // Tiebreaker 1: More specific wins
  const kindPriority = { locality: 4, adm3: 3, adm2: 2, adm1: 1, country: 0 };
  if (kindPriority[candidate1.kind] !== kindPriority[candidate2.kind]) {
    return kindPriority[candidate1.kind] > kindPriority[candidate2.kind] 
      ? candidate1 : candidate2;
  }
  
  // Tiebreaker 2: Higher priority score wins
  if (Math.abs(candidate1.priority_score - candidate2.priority_score) > 5) {
    return candidate1.priority_score > candidate2.priority_score 
      ? candidate1 : candidate2;
  }
  
  // Tiebreaker 3: Same country as publisher wins
  if (context.publisherProfile) {
    const pubCountry = context.publisherProfile.primaryCountry;
    if (candidate1.country_iso2 === pubCountry) return candidate1;
    if (candidate2.country_iso2 === pubCountry) return candidate2;
  }
  
  // Genuine tie: return both with low confidence
  return null;  // Caller should abstain
}
```

---

## Score Calibration

Raw scores aren't probabilities. Calibrate if you need actual probabilities:

```javascript
// Platt scaling (simple version)
function calibrateScore(rawScore) {
  // Sigmoid: maps any real number to (0, 1)
  // Parameters A and B learned from validation data
  const A = -2.5;
  const B = 1.5;
  return 1 / (1 + Math.exp(A * rawScore + B));
}

// After fitting on labeled data:
// rawScore 0.8 → calibrated 0.92 (high confidence)
// rawScore 0.5 → calibrated 0.55 (moderate)
// rawScore 0.3 → calibrated 0.22 (low)
```

---

## Output Format

The final disambiguation result:

```javascript
{
  // Original mention
  mention: "London",
  position: { start: 45, end: 51 },
  
  // Resolution (null if abstained)
  resolved: {
    place_id: 1234,
    name: "London",
    kind: "locality",
    country_iso2: "GB",
    country_name: "United Kingdom",
    adm1_name: "England",
    lat: 51.5074,
    lng: -0.1278,
    display_label: "London, England, United Kingdom"
  },
  
  // Confidence metrics
  confidence: 0.87,
  score: 0.72,
  
  // For debugging/review
  features: {
    matchQuality: 0.95,
    priorityScore: 0.70,
    publisherPrior: 0.60,
    coMentionCountry: 0.80,
    hierarchicalContainment: 0.50,
    geographicProximity: 0.50,
    textWindowContext: 0.75
  },
  
  // Runner-ups
  candidates: [
    { name: "London", country: "GB", score: 0.72 },
    { name: "London", country: "CA", score: 0.58 },
    { name: "London", country: "US", score: 0.41 }
  ],
  
  // Abstention
  abstained: false,
  abstainReason: null
}
```

---

## What to Build (This Chapter)

1. **Create the scorer module**:
   ```
   src/gazetteer/scorer.js
   ```

2. **Implement scoring functions**:
   - `scoreCandidate()`
   - `rankCandidates()`
   - `computeConfidence()`
   - `shouldAbstain()`

3. **Implement the pipeline**:
   - `disambiguateMention()`
   - `disambiguateArticle()` (multi-pass)

4. **Add weight configuration**:
   ```
   config/disambiguation-weights.json
   ```

5. **Add CLI for testing**:
   ```bash
   node tools/disambiguate.js --text "London announced new rules today"
   node tools/disambiguate.js --url "https://example.com/article" --debug
   ```

6. **Write tests**:
   ```javascript
   test('high gap produces high confidence', () => {
     const ranked = [
       { score: 0.85 },
       { score: 0.45 }
     ];
     const conf = computeConfidence(ranked);
     expect(conf.confidence).toBeGreaterThan(0.8);
   });
   
   test('close scores produce low confidence', () => {
     const ranked = [
       { score: 0.65 },
       { score: 0.63 }
     ];
     const conf = computeConfidence(ranked);
     expect(conf.confidence).toBeLessThan(0.5);
   });
   ```

---

*Next: [Chapter 14 — The Coherence Pass](./14-coherence-pass.md)*
