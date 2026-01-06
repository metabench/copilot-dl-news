# Chapter 12: Feature Engineering for Scoring

*Reading time: 12 minutes*

---

## From Candidates to Signals

We have candidates. Now we need features that predict which candidate is correct. Each feature transforms raw data into a numeric signal.

This chapter covers the feature engineering that powers disambiguation.

---

## Feature Categories

| Category | What It Measures | Example |
|----------|------------------|---------|
| **Textual** | Match quality | "London" vs "Greater London" |
| **Geographic** | Spatial signals | Candidate near other mentions |
| **Hierarchical** | Containment | Place inside mentioned admin region |
| **Statistical** | Prior probabilities | Base importance, publisher patterns |
| **Contextual** | Co-occurrence | Other places mentioned nearby |

---

## Feature: Match Quality

How well does the candidate name match the mention?

```javascript
function featureMatchQuality(mention, candidate) {
  const mentionNorm = normalizePlace(mention);
  const candidateNorm = candidate.name_norm;
  
  // Exact match
  if (mentionNorm === candidateNorm) {
    return 1.0;
  }
  
  // Qualified match (mention has qualifier that matches)
  if (candidate.match_type.startsWith('qualified')) {
    return 0.95;
  }
  
  // Alias match
  if (candidate.match_type === 'alias') {
    const aliasPenalty = {
      'official': 0.0,
      'common': 0.05,
      'abbrev': 0.05,
      'local': 0.1,
      'historic': 0.15,
      'misspelling': 0.2
    };
    return 0.9 - (aliasPenalty[candidate.alias_kind] || 0.1);
  }
  
  // Prefix match (partial)
  if (candidate.match_type === 'prefix') {
    const ratio = mentionNorm.length / candidateNorm.length;
    return 0.3 + (0.4 * ratio);  // 0.3 to 0.7
  }
  
  // Fallback
  return 0.1;
}
```

---

## Feature: Priority Score (Prior)

The base priority of the place, independent of context.

```javascript
function featurePriorityScore(candidate) {
  // Priority score is 0-100, normalize to 0-1
  return candidate.priority_score / 100;
}
```

This gives London, UK an edge over London, Kentucky even before looking at context.

---

## Feature: Kind Match

Does the expected kind match?

```javascript
function featureKindMatch(candidate, expectedKind) {
  if (!expectedKind) return 0.5;  // Neutral if no expectation
  
  if (candidate.kind === expectedKind) {
    return 1.0;
  }
  
  // Partial credit for related kinds
  const kindGroups = {
    administrative: ['country', 'adm1', 'adm2', 'adm3'],
    settlement: ['locality', 'city', 'town', 'village']
  };
  
  for (const group of Object.values(kindGroups)) {
    if (group.includes(candidate.kind) && group.includes(expectedKind)) {
      return 0.7;
    }
  }
  
  return 0.2;  // Mismatch penalty
}
```

---

## Feature: Publisher Prior (Database-Driven)

Publisher priors are stored in the database, not in code or JSON files. This enables:
- Easy updates without deployments
- Historical tracking of profile changes
- Learning from actual disambiguation outcomes

```sql
-- Publisher profiles table
CREATE TABLE publisher_profiles (
  profile_id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT UNIQUE NOT NULL,         -- 'theguardian.com'
  display_name TEXT,                    -- 'The Guardian'
  primary_country TEXT,                 -- 'GB'
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  sample_size INTEGER DEFAULT 0,        -- Articles used to build profile
  notes TEXT
);

-- Country weights per publisher
CREATE TABLE publisher_country_weights (
  publisher_domain TEXT NOT NULL,
  country_iso2 TEXT NOT NULL,
  weight REAL NOT NULL,                 -- 0.0 to 1.0
  confidence REAL DEFAULT 0.5,          -- Confidence in this weight
  source TEXT,                          -- 'manual', 'learned', 'inferred'
  PRIMARY KEY (publisher_domain, country_iso2)
);

CREATE INDEX idx_pub_weights ON publisher_country_weights(publisher_domain);
```

```javascript
class PublisherPriorFeature {
  constructor(db) {
    this.db = db;
    this.cache = new Map();
  }
  
  async getProfile(domain) {
    if (this.cache.has(domain)) {
      return this.cache.get(domain);
    }
    
    // Try exact match
    let weights = this.db.all(`
      SELECT country_iso2, weight
      FROM publisher_country_weights
      WHERE publisher_domain = ?
    `, [domain]);
    
    // Try parent domain if no match
    if (weights.length === 0) {
      const parts = domain.split('.');
      if (parts.length > 2) {
        const parent = parts.slice(-2).join('.');
        weights = this.db.all(`
          SELECT country_iso2, weight
          FROM publisher_country_weights
          WHERE publisher_domain = ?
        `, [parent]);
      }
    }
    
    const profile = {
      domain,
      countryWeights: Object.fromEntries(weights.map(w => [w.country_iso2, w.weight])),
      unknown: weights.length === 0
    };
    
    this.cache.set(domain, profile);
    return profile;
  }
  
  async compute(candidate, publisherDomain) {
    if (!publisherDomain || !candidate.country_iso2) {
      return 0.5;  // Neutral
    }
    
    const profile = await this.getProfile(publisherDomain);
    
    if (profile.unknown) {
      return 0.5;  // Unknown publisher = neutral
    }
    
    const weight = profile.countryWeights[candidate.country_iso2];
    if (weight !== undefined) {
      return weight;
    }
    
    // Check 'other' bucket
    if (profile.countryWeights.other !== undefined) {
      return profile.countryWeights.other;
    }
    
    return 0.1;  // Not in profile = low prior
  }
}

// Seed example data
// INSERT INTO publisher_profiles (domain, display_name, primary_country)
// VALUES ('theguardian.com', 'The Guardian', 'GB');
//
// INSERT INTO publisher_country_weights (publisher_domain, country_iso2, weight, source)
// VALUES ('theguardian.com', 'GB', 0.65, 'manual'),
//        ('theguardian.com', 'US', 0.15, 'manual'),
//        ('theguardian.com', 'AU', 0.08, 'manual'),
//        ('theguardian.com', 'other', 0.12, 'manual');
```

---

## Feature: Co-Mention Country

If the article mentions other places, are they in the same country?

```javascript
function featureCoMentionCountry(candidate, otherMentions) {
  if (!otherMentions || otherMentions.length === 0) return 0.5;
  
  // Count how many other mentions are in the same country
  let sameCountry = 0;
  let resolved = 0;
  
  for (const other of otherMentions) {
    if (other.resolved && other.country_iso2) {
      resolved++;
      if (other.country_iso2 === candidate.country_iso2) {
        sameCountry++;
      }
    }
  }
  
  if (resolved === 0) return 0.5;
  
  return sameCountry / resolved;
}
```

**Example**: Article mentions "Ontario" and "Toronto". When disambiguating "London", the Canadian London gets a boost because Ontario and Toronto are both in Canada.

---

## Feature: Hierarchical Containment

Is the candidate contained within a mentioned admin region?

```javascript
function featureHierarchicalContainment(db, candidate, resolvedRegions) {
  if (!resolvedRegions || resolvedRegions.length === 0) return 0.5;
  
  // Check if candidate is contained in any resolved region
  for (const region of resolvedRegions) {
    // Direct parent check (cached in places table)
    if (candidate.adm1_id === region.place_id) return 1.0;
    if (candidate.adm2_id === region.place_id) return 1.0;
    if (candidate.country_iso2 === region.country_iso2 && region.kind === 'country') return 0.9;
    
    // Transitive check via place_hierarchy
    const contained = db.get(`
      SELECT 1 FROM place_hierarchy
      WHERE child_id = ? AND parent_id = ?
    `, [candidate.place_id, region.place_id]);
    
    if (contained) return 1.0;
  }
  
  return 0.3;  // Not contained in any mentioned region
}
```

**Example**: Article mentions "Ontario" (resolved to Canada/Ontario). When disambiguating "London", the candidate "London, Ontario" gets maximum score because it's contained within Ontario.

---

## Feature: Geographic Proximity

If we have resolved places, is this candidate near them?

```javascript
function featureGeographicProximity(candidate, resolvedPlaces) {
  if (!resolvedPlaces || resolvedPlaces.length === 0) return 0.5;
  
  // Find minimum distance to any resolved place
  let minDistance = Infinity;
  
  for (const place of resolvedPlaces) {
    const dist = haversineDistance(
      candidate.lat, candidate.lng,
      place.lat, place.lng
    );
    if (dist < minDistance) {
      minDistance = dist;
    }
  }
  
  // Convert distance to score (closer = better)
  // 0 km → 1.0, 1000 km → 0.5, 5000 km → 0.2
  if (minDistance < 100) return 1.0;
  if (minDistance < 500) return 0.8;
  if (minDistance < 1000) return 0.6;
  if (minDistance < 3000) return 0.4;
  return 0.2;
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;  // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
```

---

## Feature: Text Window Context (Database-Driven)

Context keywords and signals are stored in the database, enabling:
- Easy addition of new disambiguation signals
- Language-specific context keywords
- Learning from successful disambiguations

```sql
-- Context keywords that signal specific places
CREATE TABLE context_keywords (
  keyword_id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  place_id INTEGER REFERENCES places(place_id),
  country_iso2 TEXT,                    -- Can signal country instead of specific place
  adm1_id INTEGER,                      -- Or specific region
  
  keyword TEXT NOT NULL,                -- 'parliament', 'thames', 'westminster'
  keyword_norm TEXT NOT NULL,           -- Normalized for matching
  keyword_lang TEXT DEFAULT 'en',       -- Language of keyword
  
  signal_strength REAL DEFAULT 0.2,     -- How strong this signal is (0-1)
  keyword_type TEXT,                    -- 'landmark', 'institution', 'geography', 'culture'
  
  source TEXT,                          -- 'manual', 'learned', 'wikipedia'
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_context_kw ON context_keywords(keyword_norm);
CREATE INDEX idx_context_place ON context_keywords(place_id);
CREATE INDEX idx_context_country ON context_keywords(country_iso2);

-- Seed examples
INSERT INTO context_keywords (place_id, keyword, keyword_norm, keyword_type, signal_strength, source)
SELECT place_id, 'parliament', 'parliament', 'institution', 0.3, 'manual'
FROM places WHERE name = 'London' AND country_iso2 = 'GB';

INSERT INTO context_keywords (place_id, keyword, keyword_norm, keyword_type, signal_strength, source)
SELECT place_id, 'thames', 'thames', 'geography', 0.4, 'manual'
FROM places WHERE name = 'London' AND country_iso2 = 'GB';

INSERT INTO context_keywords (place_id, keyword, keyword_norm, keyword_type, signal_strength, source)
SELECT place_id, 'western university', 'western university', 'institution', 0.5, 'manual'
FROM places WHERE name = 'London' AND country_iso2 = 'CA';
```

```javascript
class TextContextFeature {
  constructor(db) {
    this.db = db;
  }
  
  async compute(mention, textWindow, candidate) {
    const windowNorm = textWindow.toLowerCase();
    let score = 0.3;  // Base score
    
    // Check for country name in window
    if (candidate.country_name && windowNorm.includes(candidate.country_name.toLowerCase())) {
      score += 0.3;
    }
    
    // Check for ADM1 name in window
    if (candidate.adm1_name && windowNorm.includes(candidate.adm1_name.toLowerCase())) {
      score += 0.25;
    }
    
    // Check for country code
    if (candidate.country_iso2 && windowNorm.includes(candidate.country_iso2.toLowerCase())) {
      score += 0.15;
    }
    
    // Check database keywords for this place
    const placeKeywords = this.db.all(`
      SELECT keyword_norm, signal_strength
      FROM context_keywords
      WHERE place_id = ? OR country_iso2 = ?
    `, [candidate.place_id, candidate.country_iso2]);
    
    for (const kw of placeKeywords) {
      if (windowNorm.includes(kw.keyword_norm)) {
        score += kw.signal_strength;
      }
    }
    
    return Math.min(1.0, score);
  }
}
```

---

## Feature Vector Assembly

Combine all features into a vector:

```javascript
function computeFeatureVector(context) {
  const { 
    mention, 
    candidate, 
    publisherProfile, 
    resolvedPlaces, 
    resolvedRegions,
    textWindow,
    db
  } = context;
  
  return {
    matchQuality: featureMatchQuality(mention, candidate),
    priorityScore: featurePriorityScore(candidate),
    publisherPrior: featurePublisherPrior(candidate, publisherProfile),
    coMentionCountry: featureCoMentionCountry(candidate, resolvedPlaces),
    hierarchicalContainment: featureHierarchicalContainment(db, candidate, resolvedRegions),
    geographicProximity: featureGeographicProximity(candidate, resolvedPlaces),
    textWindowContext: featureTextWindowContext(mention, textWindow, candidate)
  };
}
```

---

## Feature Normalization

Ensure all features are on the same scale:

```javascript
function normalizeFeatures(features) {
  // All our features are already 0-1 by design
  // But if you add new features with different scales:
  
  return {
    ...features,
    // Example: population might need log scaling
    // population: Math.min(1, Math.log10(features.population + 1) / 8)
  };
}
```

---

## Feature Importance (Which Features Matter Most)

Typical learned weights from disambiguation systems:

| Feature | Weight | Why |
|---------|--------|-----|
| Hierarchical containment | 0.25 | Strong signal when regions are mentioned |
| Publisher prior | 0.20 | Consistent across articles |
| Co-mention country | 0.18 | Geographic coherence |
| Text window context | 0.15 | Local evidence |
| Priority Score | 0.12 | Base prior |
| Match quality | 0.07 | Mostly 1.0 for exact matches |
| Geographic proximity | 0.03 | Helpful but noisy |

Start with these weights, then tune based on your data.

---

## Feature Debugging

When disambiguation fails, inspect the feature vectors:

```javascript
function debugFeatures(mention, candidates, context) {
  console.log(`\n=== Disambiguating: "${mention}" ===\n`);
  
  for (const c of candidates.slice(0, 5)) {
    const features = computeFeatureVector({ ...context, candidate: c });
    
    console.log(`${c.name}, ${c.adm1_name}, ${c.country_name}`);
    console.log(`  Match Quality:    ${features.matchQuality.toFixed(3)}`);
    console.log(`  Priority Score:   ${features.priorityScore.toFixed(3)}`);
    console.log(`  Publisher Prior:  ${features.publisherPrior.toFixed(3)}`);
    console.log(`  CoMention Country:${features.coMentionCountry.toFixed(3)}`);
    console.log(`  Containment:      ${features.hierarchicalContainment.toFixed(3)}`);
    console.log(`  Proximity:        ${features.geographicProximity.toFixed(3)}`);
    console.log(`  Text Context:     ${features.textWindowContext.toFixed(3)}`);
    console.log();
  }
}
```

---

## Sparse vs Dense Features

**Dense features** (used above): Always have a value (0-1 scale).

**Sparse features** (useful for ML models):
- Binary indicators: `is_capital`, `is_in_eu`, `publisher_is_cbc`
- Categorical: `kind=adm1`, `country=CA`

For a rule-based scorer, dense features are simpler. For ML, both work.

---

## What to Build (This Chapter)

1. **Create the feature module**:
   ```
   src/gazetteer/features.js
   ```

2. **Implement each feature function**:
   - `featureMatchQuality()`
   - `featurePriorityScore()`
   - `featurePublisherPrior()`
   - `featureCoMentionCountry()`
   - `featureHierarchicalContainment()`
   - `featureGeographicProximity()`
   - `featureTextWindowContext()`

3. **Implement vector assembly**:
   - `computeFeatureVector()`
   - `debugFeatures()`

4. **Add publisher profiles**:
   ```
   config/publisher-priors.json
   ```

5. **Write tests**:
   ```javascript
   test('containment feature high when inside mentioned region', () => {
     const ontario = { place_id: 1, kind: 'adm1' };
     const londonOn = { place_id: 2, adm1_id: 1 };
     
     const score = featureHierarchicalContainment(db, londonOn, [ontario]);
     expect(score).toBeGreaterThan(0.9);
   });
   ```

---

*Next: [Chapter 13 — Scoring and Ranking](./13-scoring-ranking.md)*
