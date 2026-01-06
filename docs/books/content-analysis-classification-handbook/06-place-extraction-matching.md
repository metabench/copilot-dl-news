# Chapter 6: Place Extraction & Matching

## Overview

Place extraction identifies geographic locations in URLs and text using a gazetteer database with hierarchical relationships.

**Files:**
- [src/analysis/place-extraction.js](../../../src/analysis/place-extraction.js) (~800 lines)
- [src/matching/ArticlePlaceMatcher.js](../../../src/matching/ArticlePlaceMatcher.js) (~500 lines)

## Gazetteer Structure

### Database Tables

```sql
-- Places table
CREATE TABLE places (
  id INTEGER PRIMARY KEY,
  kind TEXT,           -- 'country', 'region', 'city'
  country_code TEXT,
  population INTEGER
);

-- Place names (multiple per place)
CREATE TABLE place_names (
  place_id INTEGER,
  name TEXT,
  normalized TEXT,     -- Lowercase, no diacritics
  lang TEXT,           -- 'en', 'fr', etc.
  name_kind TEXT       -- 'common', 'official', 'alias'
);

-- Hierarchy relationships
CREATE TABLE place_hierarchy (
  parent_id INTEGER,
  child_id INTEGER,
  relation TEXT,       -- 'contains', 'capital_of'
  depth INTEGER
);
```

### In-Memory Indices

```javascript
const gazetteer = {
  // Name → Place records
  nameMap: new Map([
    ['united kingdom', [{ place_id: 123, kind: 'country', ... }]],
    ['london', [{ place_id: 456, kind: 'city', ... }]]
  ]),

  // Slug → Place records
  slugMap: new Map([
    ['united-kingdom', [{ place_id: 123, ... }]],
    ['uk', [{ place_id: 123, ... }]]
  ]),

  // ID → Place record
  placeIndex: new Map([
    [123, { id: 123, kind: 'country', name: 'United Kingdom', ... }]
  ]),

  // Parent-child relationships
  hierarchy: new Map([
    [123, [456, 789, ...]]  // UK contains London, etc.
  ])
};
```

## URL Place Extraction

### Segment Analysis

```javascript
function extractPlacesFromUrl(url, options) {
  const { slugMap, placeIndex, hierarchy } = options;

  const parsed = new URL(url);
  const segments = parsed.pathname.split('/').filter(Boolean);

  const segmentAnalyses = [];
  const topicTokens = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const analysis = analyzeSegment(segment, slugMap, i);

    if (analysis.matches.length > 0) {
      segmentAnalyses.push({
        index: i,
        segment,
        matches: analysis.matches
      });
    } else {
      // Non-place token - might be a topic
      topicTokens.push(segment);
    }
  }

  // Build place chains
  const chains = buildChains(segmentAnalyses, hierarchy);

  // Choose best chain
  const bestChain = chooseBestChain(chains);

  return { bestChain, allChains: chains, topicTokens };
}
```

### Segment Matching

```javascript
function analyzeSegment(segment, slugMap, segmentIndex) {
  const tokens = segment.split('-');
  const matches = [];

  // Try full segment
  const fullMatch = slugMap.get(segment);
  if (fullMatch) {
    matches.push(...fullMatch.map(p => ({
      ...p,
      score: calculateMatchScore(p, 'canonical', segmentIndex),
      matchType: 'canonical'
    })));
  }

  // Try tokens
  for (const token of tokens) {
    const tokenMatch = slugMap.get(token);
    if (tokenMatch) {
      matches.push(...tokenMatch.map(p => ({
        ...p,
        score: calculateMatchScore(p, 'token', segmentIndex),
        matchType: 'token'
      })));
    }
  }

  // Try country codes
  if (segment.length === 2) {
    const codeMatch = slugMap.get(segment.toLowerCase());
    if (codeMatch) {
      matches.push(...codeMatch.map(p => ({
        ...p,
        score: calculateMatchScore(p, 'country-code', segmentIndex),
        matchType: 'country-code'
      })));
    }
  }

  return { matches };
}
```

### Match Scoring

```javascript
function calculateMatchScore(place, matchType, segmentIndex) {
  let score = 0;

  // Base score by match type
  const TYPE_SCORES = {
    'canonical': 1.0,
    'alias': 0.95,
    'country-code': 0.90,
    'token': 0.85,
    'synonym': 0.80
  };
  score += TYPE_SCORES[matchType] || 0.7;

  // Population boost
  if (place.population) {
    score += Math.min(0.1, Math.log10(place.population) * 0.02);
  }

  // Position penalty (later segments slightly less reliable)
  score -= segmentIndex * 0.02;

  return Math.max(0, Math.min(1, score));
}
```

### Chain Building

```javascript
function buildChains(segmentAnalyses, hierarchy) {
  const chains = [];

  // Dynamic programming approach
  for (let i = 0; i < segmentAnalyses.length; i++) {
    const { matches } = segmentAnalyses[i];

    for (const match of matches) {
      // Find compatible previous chains
      const compatibleChains = chains.filter(chain =>
        isMatchCompatible(chain, match, hierarchy)
      );

      if (compatibleChains.length > 0) {
        // Extend best compatible chain
        const bestPrev = compatibleChains.sort((a, b) => b.score - a.score)[0];
        chains.push({
          places: [...bestPrev.places, match],
          score: bestPrev.score + match.score + 0.15  // Chain bonus
        });
      } else {
        // Start new chain
        chains.push({
          places: [match],
          score: match.score
        });
      }
    }
  }

  return deduplicateChains(chains);
}
```

### Chain Compatibility

```javascript
function isMatchCompatible(chain, newMatch, hierarchy) {
  const lastPlace = chain.places[chain.places.length - 1];

  // Same place - incompatible
  if (lastPlace.place_id === newMatch.place_id) {
    return false;
  }

  // Check hierarchy
  if (isAncestor(lastPlace.place_id, newMatch.place_id, hierarchy)) {
    return true;  // Parent → Child is valid
  }

  // Check reverse (should not happen in well-formed URLs)
  if (isAncestor(newMatch.place_id, lastPlace.place_id, hierarchy)) {
    return false;  // Child → Parent is invalid
  }

  // Unrelated places - might be valid
  return true;
}
```

## Text Place Extraction

### Gazetteer Matching

```javascript
function extractGazetteerPlacesFromText(text, nameMap, options = {}) {
  const { context = {}, maxMatches = 50 } = options;
  const matches = [];

  // Tokenize
  const tokens = tokenize(text);

  // Sliding window (1-4 tokens)
  for (let windowSize = 4; windowSize >= 1; windowSize--) {
    for (let i = 0; i <= tokens.length - windowSize; i++) {
      if (tokens[i].matched) continue;  // Already matched

      const phrase = tokens.slice(i, i + windowSize).map(t => t.normalized).join(' ');
      const candidates = nameMap.get(phrase);

      if (candidates && candidates.length > 0) {
        // Pick best candidate
        const best = pickBestCandidate(candidates, context);

        matches.push({
          place: best.name,
          place_kind: best.kind,
          method: 'gazetteer',
          source: 'text',
          offset_start: tokens[i].start,
          offset_end: tokens[i + windowSize - 1].end,
          country_code: best.country_code,
          place_id: best.place_id
        });

        // Mark tokens as matched
        for (let j = i; j < i + windowSize; j++) {
          tokens[j].matched = true;
        }

        if (matches.length >= maxMatches) break;
      }
    }
  }

  return matches;
}
```

### Candidate Ranking

```javascript
function pickBestCandidate(candidates, context) {
  let bestScore = -Infinity;
  let best = candidates[0];

  for (const candidate of candidates) {
    let score = 0;

    // Domain country match
    if (context.domainLocale === candidate.country_code) {
      score += 5;
    }

    // TLD match
    if (context.tld === candidate.country_code?.toLowerCase()) {
      score += 3;
    }

    // URL segment country codes
    if (context.urlCountryCodes?.includes(candidate.country_code)) {
      score += 4;
    }

    // Section matching
    if (context.section === 'world' && candidate.kind === 'country') {
      score += 2;
    }

    // Population boost
    if (candidate.population) {
      score += 0.5 * Math.log10(candidate.population);
    }

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}
```

## Article-Place Matching

### Rule Levels

```javascript
const RULE_LEVELS = {
  0: 'no-rules',           // Existing content only
  1: 'basic-string',       // Case-insensitive word boundaries
  2: 'context-aware',      // Position & frequency boosting
  3: 'disambiguation',     // Distinguish places from people
  4: 'nlp-enhanced'        // WinkNLP analysis
};
```

### Matcher Implementation

```javascript
class ArticlePlaceMatcher {
  constructor(options = {}) {
    this.ruleLevel = options.ruleLevel || 1;
    this.confidenceThreshold = options.confidenceThreshold || 0.4;
  }

  findPlaceMentions(text, places, options = {}) {
    const mentions = [];

    for (const place of places) {
      const found = this.findMentionsOfPlace(text, place);

      if (found.count > 0) {
        const confidence = this.calculateConfidence(found, text.length);
        const relationType = this.determineRelationType(found, options);

        if (confidence >= this.confidenceThreshold) {
          mentions.push({
            place_id: place.id,
            name: place.name,
            mentions: found.positions,
            count: found.count,
            confidence,
            relationType
          });
        }
      }
    }

    return mentions;
  }

  findMentionsOfPlace(text, place) {
    const patterns = this.buildPatterns(place);
    const positions = [];

    for (const pattern of patterns) {
      const regex = new RegExp(pattern, 'gi');
      let match;
      while ((match = regex.exec(text)) !== null) {
        positions.push({
          start: match.index,
          end: match.index + match[0].length,
          matchedText: match[0]
        });
      }
    }

    return {
      count: positions.length,
      positions,
      firstPosition: positions[0]?.start ?? null
    };
  }
}
```

### Confidence Calculation

```javascript
calculateConfidence(found, textLength) {
  let confidence = 0.5;  // Base

  // Rule level multiplier
  const LEVEL_MULTIPLIERS = { 1: 1.0, 2: 1.2, 3: 1.4, 4: 1.6 };
  confidence *= LEVEL_MULTIPLIERS[this.ruleLevel] || 1.0;

  // Frequency bonus
  const frequencyBonus = Math.min(0.3, found.count * 0.1);
  confidence += frequencyBonus;

  // Position bonus (earlier = more important)
  if (found.firstPosition !== null) {
    const positionRatio = 1 - (found.firstPosition / textLength);
    confidence += positionRatio * 0.2;
  }

  return Math.max(0, Math.min(1, confidence));
}
```

### Relation Types

```javascript
const RELATION_TYPES = {
  primary: 'Subject of article (≥5 mentions or in headline)',
  secondary: 'Secondary location (≥3 mentions)',
  mentioned: 'Brief mention (1-2 mentions)',
  affected: 'Impacted by events',
  origin: 'Origin of people/events'
};

determineRelationType(found, options = {}) {
  const { inHeadline = false } = options;

  if (inHeadline || found.count >= 5) {
    return 'primary';
  }
  if (found.count >= 3) {
    return 'secondary';
  }
  return 'mentioned';
}
```

## Hierarchy-Aware Matching

### Ancestor Detection

```javascript
function isAncestor(ancestorId, descendantId, hierarchy, maxDepth = 5) {
  const visited = new Set();
  const queue = [descendantId];

  for (let depth = 0; depth < maxDepth; depth++) {
    const nextQueue = [];

    for (const placeId of queue) {
      if (visited.has(placeId)) continue;
      visited.add(placeId);

      const parents = hierarchy.get(placeId) || [];
      for (const parentId of parents) {
        if (parentId === ancestorId) return true;
        nextQueue.push(parentId);
      }
    }

    if (nextQueue.length === 0) break;
    queue.length = 0;
    queue.push(...nextQueue);
  }

  return false;
}
```

## Result Structure

### URL Extraction Result

```javascript
{
  bestChain: [
    { place: 'World', place_id: 1, kind: 'region', score: 0.9 },
    { place: 'United Kingdom', place_id: 123, kind: 'country', score: 0.95 }
  ],
  allChains: [...],
  topicTokens: ['politics', 'elections']
}
```

### Text Extraction Result

```javascript
[
  {
    place: 'London',
    place_kind: 'city',
    method: 'gazetteer',
    source: 'text',
    offset_start: 45,
    offset_end: 51,
    country_code: 'GB',
    place_id: 456
  },
  {
    place: 'Paris',
    place_kind: 'city',
    method: 'gazetteer',
    source: 'text',
    offset_start: 120,
    offset_end: 125,
    country_code: 'FR',
    place_id: 789
  }
]
```

## Next Chapter

Continue to [Chapter 7: Deep Analysis](./07-deep-analysis.md) for sentiment and key phrase extraction.
