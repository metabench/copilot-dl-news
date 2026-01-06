# Chapter 14: The Coherence Pass

*Reading time: 10 minutes*

---

## Why Coherence Matters

Individual mention disambiguation can produce inconsistent results:

```
Article: "The Mayor of London met with Ontario Premier Doug Ford in Toronto"

Without coherence:
  "London"  → London, UK (highest importance)
  "Ontario" → Ontario, Canada
  "Toronto" → Toronto, Canada

Problem: London UK doesn't make sense when Ontario and Toronto are Canada.
```

The coherence pass enforces geographic consistency across all mentions.

---

## Coherence Constraints

**Constraint 1: Country Clustering**
Mentions in the same article should prefer the same country when possible.

**Constraint 2: Containment Consistency**
If we resolve "Ontario" and "London", London should be inside Ontario.

**Constraint 3: Proximity Clustering**
Resolved places should be geographically plausible (not scattered globally).

---

## The Coherence Algorithm

```javascript
async function coherencePass(db, initialResults) {
  // 1. Find the dominant country
  const countryVotes = countCountries(initialResults);
  const dominantCountry = findDominantCountry(countryVotes);
  
  // 2. Find resolved regions (for containment)
  const resolvedRegions = initialResults
    .filter(r => !r.abstained && ['country', 'adm1', 'adm2'].includes(r.resolved?.kind))
    .map(r => r.resolved);
  
  // 3. Re-evaluate low-confidence results
  const revisedResults = [];
  
  for (const result of initialResults) {
    if (result.abstained || result.confidence > 0.85) {
      // Keep high-confidence and abstained as-is
      revisedResults.push(result);
      continue;
    }
    
    // Check if re-ranking could improve coherence
    const revised = applyCoherenceConstraints(
      db, result, dominantCountry, resolvedRegions
    );
    revisedResults.push(revised);
  }
  
  return revisedResults;
}
```

---

## Finding the Dominant Country

```javascript
function countCountries(results) {
  const votes = {};
  
  for (const result of results) {
    if (result.abstained || !result.resolved) continue;
    
    const country = result.resolved.country_iso2;
    if (!country) continue;
    
    // Weight by confidence
    votes[country] = (votes[country] || 0) + result.confidence;
  }
  
  return votes;
}

function findDominantCountry(votes) {
  let maxVotes = 0;
  let dominant = null;
  
  for (const [country, voteCount] of Object.entries(votes)) {
    if (voteCount > maxVotes) {
      maxVotes = voteCount;
      dominant = country;
    }
  }
  
  // Only return if there's a clear winner
  const totalVotes = Object.values(votes).reduce((a, b) => a + b, 0);
  if (maxVotes / totalVotes > 0.5) {
    return { country: dominant, strength: maxVotes / totalVotes };
  }
  
  return null;  // No clear dominant country
}
```

---

## Applying Coherence Constraints

```javascript
function applyCoherenceConstraints(db, result, dominantCountry, resolvedRegions) {
  const candidates = result.candidates;
  if (!candidates || candidates.length < 2) return result;
  
  // Re-score candidates with coherence bonus
  const rescored = candidates.map(candidate => {
    let coherenceBonus = 0;
    
    // Bonus for matching dominant country
    if (dominantCountry && candidate.country_iso2 === dominantCountry.country) {
      coherenceBonus += 0.15 * dominantCountry.strength;
    }
    
    // Bonus for being contained in a resolved region
    for (const region of resolvedRegions) {
      if (isContainedIn(db, candidate.place_id, region.place_id)) {
        coherenceBonus += 0.20;
        break;  // One containment match is enough
      }
    }
    
    return {
      ...candidate,
      coherenceBonus,
      adjustedScore: candidate.score + coherenceBonus
    };
  });
  
  // Re-rank by adjusted score
  rescored.sort((a, b) => b.adjustedScore - a.adjustedScore);
  
  // Check if ranking changed
  const newWinner = rescored[0];
  const originalWinner = candidates[0];
  
  if (newWinner.place_id !== originalWinner.place_id) {
    // Ranking changed! Update result
    return {
      ...result,
      resolved: {
        place_id: newWinner.place_id,
        name: newWinner.name,
        kind: newWinner.kind,
        country_iso2: newWinner.country_iso2,
        country_name: newWinner.country_name,
        adm1_name: newWinner.adm1_name,
        lat: newWinner.lat,
        lng: newWinner.lng,
        display_label: generateDisplayLabel(newWinner)
      },
      score: newWinner.adjustedScore,
      confidence: computeConfidence(rescored).confidence,
      candidates: rescored,
      coherenceApplied: true,
      coherenceChange: {
        from: originalWinner.name + ', ' + originalWinner.country_iso2,
        to: newWinner.name + ', ' + newWinner.country_iso2,
        reason: coherenceBonusReason(newWinner, dominantCountry, resolvedRegions)
      }
    };
  }
  
  // No change
  return { ...result, coherenceApplied: true };
}
```

---

## Containment Check

```javascript
function isContainedIn(db, childPlaceId, parentPlaceId) {
  // Check direct parent pointers first (fast)
  const child = db.get('SELECT adm1_id, adm2_id FROM places WHERE id = ?', [childPlaceId]);
  if (child.adm1_id === parentPlaceId || child.adm2_id === parentPlaceId) {
    return true;
  }
  
  // Check transitive closure (if built)
  const edge = db.get(`
    SELECT 1 FROM place_hierarchy 
    WHERE child_id = ? AND parent_id = ?
  `, [childPlaceId, parentPlaceId]);
  
  return !!edge;
}
```

---

## Example: Coherence in Action

**Input Article**: "London Mayor Sadiq Khan announced... Ontario Premier Ford... visiting Toronto..."

**After Pass 1 (Independent Scoring)**:

| Mention | Resolved | Score | Confidence |
|---------|----------|-------|------------|
| London | London, UK | 0.72 | 0.65 |
| Ontario | Ontario, CA | 0.85 | 0.90 |
| Toronto | Toronto, CA | 0.88 | 0.92 |

**Coherence Analysis**:
- Country votes: `{ CA: 1.82, GB: 0.65 }`
- Dominant: Canada (68%)
- Resolved regions: Ontario (adm1)

**After Coherence Pass**:

| Mention | Resolved | Original | Adjusted | Confidence | Changed |
|---------|----------|----------|----------|------------|---------|
| London | London, ON | 0.58 | 0.78 | 0.75 | YES |
| Ontario | Ontario, CA | 0.85 | 0.85 | 0.90 | No |
| Toronto | Toronto, CA | 0.88 | 0.88 | 0.92 | No |

London, Ontario now wins because:
- Dominant country bonus: +0.10
- Contained in Ontario bonus: +0.20
- Total: 0.58 + 0.30 = 0.88 (beats UK's 0.72)

---

## Conflict Detection

Sometimes coherence reveals true ambiguity:

```javascript
function detectCoherenceConflict(results) {
  const countries = new Set();
  
  for (const r of results) {
    if (r.resolved && r.confidence > 0.8) {
      countries.add(r.resolved.country_iso2);
    }
  }
  
  // More than 2 high-confidence countries = international article
  if (countries.size > 2) {
    return { 
      isInternational: true, 
      countries: [...countries],
      reason: 'multiple_high_confidence_countries'
    };
  }
  
  return { isInternational: false };
}
```

International articles (UN meetings, trade negotiations) legitimately mention multiple countries. Don't force coherence on them.

---

## Iterative Coherence

For complex articles, iterate until stable:

```javascript
async function iterativeCoherence(db, initialResults, maxIterations = 3) {
  let results = initialResults;
  let changed = true;
  let iteration = 0;
  
  while (changed && iteration < maxIterations) {
    iteration++;
    
    const before = results.map(r => r.resolved?.place_id).join(',');
    results = await coherencePass(db, results);
    const after = results.map(r => r.resolved?.place_id).join(',');
    
    changed = before !== after;
  }
  
  return {
    results,
    iterations: iteration,
    converged: !changed
  };
}
```

---

## Coherence Debugging

When coherence changes a result unexpectedly:

```javascript
function debugCoherence(result) {
  if (!result.coherenceApplied) {
    console.log(`${result.mention}: No coherence applied`);
    return;
  }
  
  if (result.coherenceChange) {
    console.log(`${result.mention}: CHANGED`);
    console.log(`  From: ${result.coherenceChange.from}`);
    console.log(`  To:   ${result.coherenceChange.to}`);
    console.log(`  Reason: ${result.coherenceChange.reason}`);
    console.log(`  Original scores:`);
    for (const c of result.candidates.slice(0, 3)) {
      console.log(`    ${c.name}, ${c.country_iso2}: ` +
                  `base=${c.score.toFixed(3)} + ` +
                  `bonus=${c.coherenceBonus.toFixed(3)} = ` +
                  `${c.adjustedScore.toFixed(3)}`);
    }
  } else {
    console.log(`${result.mention}: Coherence applied, no change`);
  }
}
```

---

## Edge Cases

### Multi-Country Articles

```javascript
// Don't apply coherence to explicit international coverage
const INTERNATIONAL_KEYWORDS = [
  'summit', 'treaty', 'bilateral', 'trade war', 'delegation',
  'ambassador', 'UN', 'NATO', 'EU meeting'
];

function isInternationalArticle(articleText) {
  const lower = articleText.toLowerCase();
  return INTERNATIONAL_KEYWORDS.some(kw => lower.includes(kw));
}
```

### Same-Name Regions in Different Countries

```
"Victoria announced..." 
- Victoria (Australian state)
- Victoria (Canadian city)
- Victoria (Texas town)

If article mentions "Australia", coherence correctly picks the state.
```

### Non-Geographic Londons

Some "Londons" aren't places:
- "Jack London" (author)
- "London Calling" (song)
- "London School of Economics"

These require NER filtering before disambiguation.

---

## What to Build (This Chapter)

1. **Create the coherence module**:
   ```
   src/gazetteer/coherence.js
   ```

2. **Implement core functions**:
   - `countCountries()`
   - `findDominantCountry()`
   - `applyCoherenceConstraints()`
   - `isContainedIn()`
   - `coherencePass()`

3. **Add iteration support**:
   - `iterativeCoherence()`

4. **Add debugging**:
   - `debugCoherence()`

5. **Add configuration**:
   ```javascript
   // config/coherence-config.json
   {
     "dominantCountryThreshold": 0.5,
     "countryBonus": 0.15,
     "containmentBonus": 0.20,
     "maxIterations": 3
   }
   ```

6. **Write tests**:
   ```javascript
   test('coherence switches London to Canada when Ontario mentioned', () => {
     const results = [
       { mention: 'London', resolved: { country_iso2: 'GB' }, confidence: 0.65, candidates: [...] },
       { mention: 'Ontario', resolved: { country_iso2: 'CA', kind: 'adm1' }, confidence: 0.90 }
     ];
     
     const coherent = coherencePass(db, results);
     expect(coherent[0].resolved.country_iso2).toBe('CA');
   });
   ```

---

*Next: [Chapter 15 — Confidence and Explanations](./15-confidence-explanations.md)*
