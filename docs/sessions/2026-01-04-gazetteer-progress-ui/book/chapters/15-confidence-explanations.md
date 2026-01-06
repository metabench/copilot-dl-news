# Chapter 15: Confidence and Explanations

*Reading time: 8 minutes*

---

## Why Explanations Matter

Disambiguation is often a black box. Users see a result but don't know why. Explanations build trust and enable debugging.

```
Before: "London" → London, UK

After:  "London" → London, UK
        Confidence: 87%
        Why: Publisher (The Guardian) typically covers UK news.
             No other countries mentioned in article.
             "Parliament" appears near mention.
```

---

## Confidence Breakdown

Show which factors contributed to confidence:

```javascript
function generateConfidenceBreakdown(result) {
  const { features, score, confidence, candidates } = result;
  
  const breakdown = [];
  
  // Match quality
  if (features.matchQuality > 0.9) {
    breakdown.push({ factor: 'Exact name match', impact: 'positive' });
  }
  
  // Publisher prior
  if (features.publisherPrior > 0.6) {
    breakdown.push({ 
      factor: 'Publisher typically covers this country', 
      impact: 'positive',
      detail: `Publisher prior: ${(features.publisherPrior * 100).toFixed(0)}%`
    });
  }
  
  // Co-mention country
  if (features.coMentionCountry > 0.7) {
    breakdown.push({ 
      factor: 'Other places in article are in same country',
      impact: 'positive'
    });
  }
  
  // Containment
  if (features.hierarchicalContainment > 0.8) {
    breakdown.push({ 
      factor: 'Place is inside a mentioned region',
      impact: 'positive'
    });
  }
  
  // Text context
  if (features.textWindowContext > 0.7) {
    breakdown.push({ 
      factor: 'Country/region name appears near mention',
      impact: 'positive'
    });
  }
  
  // Gap (negative if small)
  if (candidates.length >= 2) {
    const gap = candidates[0].score - candidates[1].score;
    if (gap < 0.1) {
      breakdown.push({
        factor: 'Runner-up has similar score',
        impact: 'negative',
        detail: `Score gap: ${(gap * 100).toFixed(1)}%`
      });
    }
  }
  
  // Priority differential
  if (features.priorityScore > 0.5) {
    breakdown.push({
      factor: 'This is a major place (high priority)',
      impact: 'positive'
    });
  }
  
  return breakdown;
}
```

---

## Human-Readable Explanations

Generate natural language explanations:

```javascript
function generateExplanation(result) {
  const { resolved, candidates, features, coherenceChange } = result;
  
  if (result.abstained) {
    return generateAbstentionExplanation(result);
  }
  
  const parts = [];
  
  // Opening
  parts.push(`Resolved "${result.mention}" to ${resolved.display_label}.`);
  
  // Confidence level
  if (result.confidence > 0.85) {
    parts.push(`High confidence (${(result.confidence * 100).toFixed(0)}%).`);
  } else if (result.confidence > 0.6) {
    parts.push(`Moderate confidence (${(result.confidence * 100).toFixed(0)}%).`);
  } else {
    parts.push(`Low confidence (${(result.confidence * 100).toFixed(0)}%).`);
  }
  
  // Key reasons
  const reasons = [];
  
  if (features.publisherPrior > 0.6) {
    reasons.push('publisher typically covers this region');
  }
  
  if (features.coMentionCountry > 0.7) {
    reasons.push('other places in article are in the same country');
  }
  
  if (features.hierarchicalContainment > 0.8) {
    reasons.push('place is contained within a mentioned region');
  }
  
  if (features.textWindowContext > 0.7) {
    reasons.push('contextual keywords support this location');
  }
  
  if (features.priorityScore > 0.6 && candidates.length > 1) {
    reasons.push('this is the most prominent place with this name');
  }
  
  if (reasons.length > 0) {
    parts.push(`Key factors: ${reasons.join('; ')}.`);
  }
  
  // Coherence explanation
  if (coherenceChange) {
    parts.push(`Note: Initially considered ${coherenceChange.from}, ` +
               `but ${coherenceChange.reason}.`);
  }
  
  // Runner-up mention
  if (candidates.length >= 2) {
    const runnerUp = candidates[1];
    const gap = candidates[0].score - runnerUp.score;
    if (gap < 0.15) {
      parts.push(`Also considered: ${runnerUp.name}, ${runnerUp.country_name} ` +
                 `(score gap: ${(gap * 100).toFixed(1)}%).`);
    }
  }
  
  return parts.join(' ');
}
```

---

## Abstention Explanations

When we can't decide, explain why:

```javascript
function generateAbstentionExplanation(result) {
  const parts = [`Could not resolve "${result.mention}".`];
  
  switch (result.abstainReason) {
    case 'no_candidates':
      parts.push('No matching places found in gazetteer.');
      break;
      
    case 'low_confidence':
      parts.push('Multiple candidates with similar scores.');
      if (result.candidates?.length >= 2) {
        const top2 = result.candidates.slice(0, 2);
        parts.push(`Top candidates: ${top2.map(c => 
          `${c.name}, ${c.country_name} (${(c.score * 100).toFixed(0)}%)`
        ).join(' vs ')}.`);
      }
      break;
      
    case 'multi_way_tie':
      parts.push('Three or more candidates with nearly identical scores.');
      break;
      
    case 'top_score_too_low':
      parts.push('Best candidate has low confidence. May not be a place name.');
      break;
      
    case 'close_scores':
      parts.push('Top two candidates are too close to distinguish.');
      break;
      
    default:
      parts.push('Insufficient evidence to choose between candidates.');
  }
  
  parts.push('Manual review recommended.');
  
  return parts.join(' ');
}
```

---

## Structured Explanation Object

For UI rendering:

```javascript
function generateStructuredExplanation(result) {
  return {
    // Summary
    summary: result.abstained 
      ? `Could not resolve "${result.mention}"` 
      : `Resolved to ${result.resolved.display_label}`,
    
    // Confidence
    confidence: {
      value: result.confidence,
      level: result.confidence > 0.85 ? 'high' : 
             result.confidence > 0.6 ? 'moderate' : 'low',
      color: result.confidence > 0.85 ? 'green' :
             result.confidence > 0.6 ? 'yellow' : 'red'
    },
    
    // Factor breakdown
    factors: generateConfidenceBreakdown(result),
    
    // Candidates
    alternatives: result.candidates?.slice(0, 5).map(c => ({
      name: c.name,
      country: c.country_name,
      adm1: c.adm1_name,
      score: c.score,
      scorePercent: (c.score * 100).toFixed(0) + '%'
    })),
    
    // Narrative
    narrative: generateExplanation(result),
    
    // Debug info
    debug: {
      features: result.features,
      coherenceApplied: result.coherenceApplied,
      coherenceChange: result.coherenceChange
    }
  };
}
```

---

## UI Presentation

### Inline Explanation

```html
<span class="mention" data-confidence="high">
  London
  <span class="tooltip">
    London, England, United Kingdom
    <br>Confidence: 87%
    <br>Publisher covers UK
  </span>
</span>
```

### Detailed Panel

```html
<div class="disambiguation-detail">
  <h3>"London" → London, England, United Kingdom</h3>
  
  <div class="confidence-meter" style="--level: 87%">
    <span class="level">87%</span>
  </div>
  
  <h4>Why this place?</h4>
  <ul class="factors">
    <li class="positive">✓ Publisher (The Guardian) typically covers UK</li>
    <li class="positive">✓ Other mentions in article are UK places</li>
    <li class="positive">✓ "Parliament" appears near mention</li>
  </ul>
  
  <h4>Also considered</h4>
  <table class="alternatives">
    <tr><td>London, Ontario, Canada</td><td>58%</td></tr>
    <tr><td>London, Kentucky, USA</td><td>41%</td></tr>
  </table>
</div>
```

---

## Confidence Thresholds

Define actionable thresholds:

| Confidence | Level | UI Treatment | Action |
|------------|-------|--------------|--------|
| 90-100% | Very High | ✓ Green | Auto-accept |
| 75-89% | High | ✓ Green | Auto-accept, log |
| 60-74% | Moderate | ⚠ Yellow | Flag for review |
| 40-59% | Low | ⚠ Orange | Require confirmation |
| 0-39% | Very Low | ✗ Red | Abstain or manual |

```javascript
function getConfidenceAction(confidence) {
  if (confidence >= 0.75) return 'accept';
  if (confidence >= 0.60) return 'flag';
  if (confidence >= 0.40) return 'confirm';
  return 'abstain';
}
```

---

## Logging for Analysis

Log decisions for later analysis:

```javascript
function logDisambiguation(result, context) {
  const entry = {
    timestamp: new Date().toISOString(),
    
    // Input
    mention: result.mention,
    articleId: context.articleId,
    publisher: context.publisher,
    
    // Output
    resolved: result.resolved,
    abstained: result.abstained,
    confidence: result.confidence,
    
    // Decision factors
    features: result.features,
    topCandidates: result.candidates?.slice(0, 3),
    coherenceApplied: result.coherenceApplied,
    
    // For training
    score: result.score,
    gap: result.candidates?.[1] 
      ? result.score - result.candidates[1].score 
      : null
  };
  
  // Append to log file
  appendLog('disambiguation-decisions.jsonl', entry);
}
```

---

## What to Build (This Chapter)

1. **Create the explanation module**:
   ```
   src/gazetteer/explanation.js
   ```

2. **Implement functions**:
   - `generateConfidenceBreakdown()`
   - `generateExplanation()`
   - `generateAbstentionExplanation()`
   - `generateStructuredExplanation()`

3. **Add to disambiguation pipeline**:
   ```javascript
   // In disambiguateMention():
   return {
     ...result,
     explanation: generateStructuredExplanation(result)
   };
   ```

4. **Add logging**:
   - `logDisambiguation()`
   - Configure log rotation

5. **Add UI components** (later):
   - Inline tooltips
   - Detail panels
   - Confidence meters

6. **Write tests**:
   ```javascript
   test('high confidence generates positive explanation', () => {
     const result = {
       confidence: 0.9,
       resolved: { display_label: 'London, UK' },
       features: { publisherPrior: 0.8 }
     };
     
     const explanation = generateExplanation(result);
     expect(explanation).toContain('High confidence');
     expect(explanation).toContain('publisher');
   });
   ```

---

*Next: [Chapter 16 — Building the Disambiguation Service](./16-building-service.md)*
