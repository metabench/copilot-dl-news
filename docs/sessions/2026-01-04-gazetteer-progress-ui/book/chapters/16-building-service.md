# Chapter 16: Building the Disambiguation Service

*Reading time: 12 minutes*

> ⚠️ **Architectural Reminder**: All SQL lives in the adapter layer. This chapter shows services consuming adapters, never raw database connections. See [Chapter 0 — Architectural Principles](./00-architectural-principles.md).

---

## Architecture Overview

The disambiguation service is the glue that connects all the pieces:

```
Article Text
    ↓
[NER/Mention Extraction]
    ↓
[Disambiguation Service]
    ├── GazetteerAdapter (all SQL here)
    ├── PublisherAdapter (all SQL here)
    ├── Candidate Generator
    ├── Feature Engine
    ├── Scorer
    ├── Coherence Pass
    └── Explanation Generator
    ↓
Resolved Places with Explanations
```

---

## Module Structure

```
src/
├── db/
│   └── adapters/
│       ├── GazetteerAdapter.js   # ALL gazetteer SQL lives here
│       └── PublisherAdapter.js   # ALL publisher SQL lives here
│
└── gazetteer/
    ├── index.js                  # Service entry point
    ├── DisambiguationService.js  # Business logic (NO SQL)
    ├── CandidateGenerator.js     # Uses adapter (NO SQL)
    ├── FeatureEngine.js          # Uses adapter (NO SQL)
    ├── Scorer.js                 # Pure computation (NO SQL)
    ├── CoherencePass.js          # Uses adapter (NO SQL)
    ├── ExplanationGenerator.js   # Chapter 15
    ├── normalize.js              # Text normalization
    └── factory.js                # Wires adapters to services
```

---

## The Adapter Layer

First, define the adapters that encapsulate all SQL:

```javascript
// src/db/adapters/GazetteerAdapter.js

class GazetteerAdapter {
  constructor(db) {
    this.db = db;
    this._prepareStatements();
  }
  
  _prepareStatements() {
    this._stmts = {
      exactName: this.db.prepare(`
        SELECT p.place_id, p.name, p.name_norm, p.kind,
               p.country_iso2, p.adm1_id, p.population, p.priority_score,
               p.lat, p.lng,
               c.name AS country_name,
               a1.name AS adm1_name
        FROM places p
        LEFT JOIN places c ON c.place_id = p.country_id
        LEFT JOIN places a1 ON a1.place_id = p.adm1_id
        WHERE p.name_norm = ?
        ORDER BY p.priority_score DESC
        LIMIT ?
      `),
      
      byAlias: this.db.prepare(`
        SELECT p.place_id, p.name, p.name_norm, p.kind,
               p.country_iso2, p.adm1_id, p.population, p.priority_score,
               p.lat, p.lng, n.normalized AS alias_norm, n.language AS alias_lang
        FROM place_names n
        JOIN places p ON p.id = n.place_id
        WHERE n.normalized = ?
        ORDER BY p.priority_score DESC
        LIMIT ?
      `),
      
      checkContainment: this.db.prepare(`
        SELECT 1 FROM place_hierarchy
        WHERE child_id = ? AND parent_id = ?
      `)
    };
  }
  
  findCandidatesByExactName(nameNorm, limit = 50) {
    return this._stmts.exactName.all(nameNorm, limit).map(this._toCandidate);
  }
  
  findCandidatesByAlias(nameNorm, limit = 50) {
    return this._stmts.byAlias.all(nameNorm, limit).map(row => ({
      ...this._toCandidate(row),
      matchType: 'alias',
      aliasNorm: row.alias_norm,
      aliasLang: row.alias_lang
    }));
  }
  
  checkContainment(childId, parentId) {
    return !!this._stmts.checkContainment.get(childId, parentId);
  }
  
  _toCandidate(row) {
    return {
      placeId: row.place_id,
      name: row.name,
      nameNorm: row.name_norm,
      kind: row.kind,
      countryIso2: row.country_iso2,
      countryName: row.country_name,
      adm1Id: row.adm1_id,
      adm1Name: row.adm1_name,
      population: row.population,
      priorityScore: row.priority_score,
      lat: row.lat,
      lng: row.lng,
      matchType: 'exact'
    };
  }
  
  close() {
    // Finalize prepared statements if needed
  }
}

module.exports = { GazetteerAdapter };
```

```javascript
// src/db/adapters/PublisherAdapter.js

class PublisherAdapter {
  constructor(db) {
    this.db = db;
    this._prepareStatements();
  }
  
  _prepareStatements() {
    this._stmts = {
      profile: this.db.prepare(`
        SELECT domain, display_name, primary_country, publisher_type
        FROM publisher_profiles
        WHERE domain = ?
      `),
      
      weights: this.db.prepare(`
        SELECT country_iso2, weight
        FROM publisher_country_weights
        WHERE publisher_domain = ?
      `)
    };
  }
  
  getPublisherProfile(domain) {
    // Try exact match
    let profile = this._stmts.profile.get(domain);
    let weights = this._stmts.weights.all(domain);
    
    // Try parent domain
    if (!profile) {
      const parts = domain.split('.');
      if (parts.length > 2) {
        const parent = parts.slice(-2).join('.');
        profile = this._stmts.profile.get(parent);
        weights = this._stmts.weights.all(parent);
      }
    }
    
    if (!profile) {
      return { domain, unknown: true, countryWeights: {} };
    }
    
    return {
      domain: profile.domain,
      displayName: profile.display_name,
      primaryCountry: profile.primary_country,
      publisherType: profile.publisher_type,
      countryWeights: Object.fromEntries(weights.map(w => [w.country_iso2, w.weight])),
      unknown: false
    };
  }
  
  close() { }
}

module.exports = { PublisherAdapter };
```

---

## The Service Class

The service receives adapters via dependency injection — no raw database access:

```javascript
// src/gazetteer/DisambiguationService.js

const { generateCandidates, batchGenerateCandidates } = require('./CandidateGenerator');
const { computeFeatureVector } = require('./FeatureEngine');
const { rankCandidates, computeConfidence, shouldAbstain } = require('./Scorer');
const { coherencePass } = require('./CoherencePass');
const { generateStructuredExplanation } = require('./ExplanationGenerator');
const { normalizePlace } = require('./normalize');

class DisambiguationService {
  constructor(gazetteerAdapter, publisherAdapter, options = {}) {
    // Adapters injected — NO raw database connection
    this.gazetteer = gazetteerAdapter;
    this.publisher = publisherAdapter;
    
    // Caches
    this.candidateCache = new Map();
    this.profileCache = new Map();
    
    // Configuration
    this.config = {
      maxCandidates: options.maxCandidates || 50,
      confidenceThreshold: options.confidenceThreshold || 0.4,
      enableCoherence: options.enableCoherence !== false,
      enableExplanations: options.enableExplanations !== false,
      cacheSize: options.cacheSize || 10000
    };
  }
  
  // Cleanup
  shutdown() {
    this.gazetteer.close();
    this.publisher.close();
    this.candidateCache.clear();
    this.profileCache.clear();
  }
}
```

---

## Single Mention API

```javascript
class DisambiguationService {
  // ... constructor ...
  
  disambiguate(mention, options = {}) {
    const {
      publisher,
      resolvedPlaces = [],
      resolvedRegions = [],
      textWindow = ''
    } = options;
    
    // Check cache
    const cacheKey = this.getCacheKey(mention, options);
    if (this.candidateCache.has(cacheKey)) {
      return this.candidateCache.get(cacheKey);
    }
    
    // Generate candidates using adapter (NO SQL in this method)
    const candidates = generateCandidates(
      this.gazetteer,  // Pass adapter, not db
      mention, 
      { maxCandidates: this.config.maxCandidates }
    );
    
    if (candidates.length === 0) {
      return this.buildAbstainResult(mention, 'no_candidates');
    }
    
    // Build context
    const context = {
      publisherProfile: this.getPublisherProfile(publisher),
      resolvedPlaces,
      resolvedRegions,
      textWindow
    };
    
    // Rank candidates (adapter passed through for containment checks)
    const ranked = rankCandidates(this.gazetteer, mention, candidates, context);
    
    // Compute confidence
    const confidenceResult = computeConfidence(ranked);
    
    // Check abstention
    const abstainCheck = shouldAbstain(ranked, confidenceResult);
    
    if (abstainCheck.abstain) {
      return this.buildAbstainResult(mention, abstainCheck.reason, ranked);
    }
    
    // Build result
    const result = this.buildSuccessResult(mention, ranked, confidenceResult);
    
    // Add explanation if enabled
    if (this.config.enableExplanations) {
      result.explanation = generateStructuredExplanation(result);
    }
    
    // Cache
    this.cacheResult(cacheKey, result);
    
    return result;
  }
}
```

---

## Article-Level API

```javascript
class DisambiguationService {
  // ... previous methods ...
  
  disambiguateArticle(article) {
    const {
      mentions,        // Array of { text, position }
      publisher,
      fullText = ''
    } = article;
    
    // Extract text windows for each mention
    const textWindows = this.extractTextWindows(fullText, mentions);
    
    // Context that evolves as we resolve mentions
    const context = {
      publisherProfile: this.getPublisherProfile(publisher),
      resolvedPlaces: [],
      resolvedRegions: [],
      textWindows
    };
    
    // === PASS 1: Initial disambiguation ===
    const pass1Results = [];
    
    for (let i = 0; i < mentions.length; i++) {
      const mention = mentions[i];
      
      const result = this.disambiguate(mention.text, {
        publisher,
        resolvedPlaces: context.resolvedPlaces,
        resolvedRegions: context.resolvedRegions,
        textWindow: textWindows[i]
      });
      
      pass1Results.push(result);
      
      // Add high-confidence results to context
      if (!result.abstained && result.confidence > 0.7) {
        context.resolvedPlaces.push(result.resolved);
        if (['country', 'adm1', 'adm2'].includes(result.resolved.kind)) {
          context.resolvedRegions.push(result.resolved);
        }
      }
    }
    
    // === PASS 2: Coherence ===
    let finalResults;
    
    if (this.config.enableCoherence) {
      // Pass adapter for containment checks (NO SQL in service)
      finalResults = coherencePass(this.gazetteer, pass1Results);
    } else {
      finalResults = pass1Results;
    }
    
    // Add explanations
    if (this.config.enableExplanations) {
      for (const result of finalResults) {
        result.explanation = generateStructuredExplanation(result);
      }
    }
    
    // Article-level summary
    return {
      mentions: finalResults,
      summary: this.buildArticleSummary(finalResults),
      metadata: {
        publisher,
        mentionCount: mentions.length,
        resolvedCount: finalResults.filter(r => !r.abstained).length,
        avgConfidence: this.computeAvgConfidence(finalResults)
      }
    };
  }
}
```

---

## Helper Methods

```javascript
class DisambiguationService {
  // ... previous methods ...
  
  extractTextWindows(fullText, mentions, windowSize = 100) {
    return mentions.map(m => {
      const start = Math.max(0, m.position - windowSize);
      const end = Math.min(fullText.length, m.position + m.text.length + windowSize);
      return fullText.slice(start, end);
    });
  }
  
  getPublisherProfile(publisher) {
    if (!publisher) return null;
    
    if (this.profileCache.has(publisher)) {
      return this.profileCache.get(publisher);
    }
    
    const profile = getPublisherProfile(publisher);
    this.profileCache.set(publisher, profile);
    return profile;
  }
  
  getCacheKey(mention, options) {
    const norm = normalizePlace(mention);
    const publisher = options.publisher || '';
    const region = options.resolvedRegions?.[0]?.place_id || '';
    return `${norm}|${publisher}|${region}`;
  }
  
  cacheResult(key, result) {
    if (this.candidateCache.size >= this.config.cacheSize) {
      // Simple LRU: delete oldest entries
      const keysToDelete = [...this.candidateCache.keys()].slice(0, 1000);
      for (const k of keysToDelete) {
        this.candidateCache.delete(k);
      }
    }
    this.candidateCache.set(key, result);
  }
  
  buildAbstainResult(mention, reason, candidates = []) {
    return {
      mention,
      resolved: null,
      confidence: 0,
      score: 0,
      candidates: candidates.slice(0, 5),
      abstained: true,
      abstainReason: reason
    };
  }
  
  buildSuccessResult(mention, ranked, confidenceResult) {
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
        display_label: this.generateDisplayLabel(winner)
      },
      confidence: confidenceResult.confidence,
      score: winner.score,
      features: winner.features,
      candidates: ranked.slice(0, 5),
      abstained: false
    };
  }
  
  generateDisplayLabel(place) {
    const parts = [place.name];
    if (place.adm1_name && place.adm1_name !== place.name) {
      parts.push(place.adm1_name);
    }
    if (place.country_name) {
      parts.push(place.country_name);
    }
    return parts.join(', ');
  }
  
  buildArticleSummary(results) {
    const countries = {};
    const kinds = {};
    
    for (const r of results) {
      if (r.abstained) continue;
      
      const country = r.resolved.country_iso2;
      const kind = r.resolved.kind;
      
      countries[country] = (countries[country] || 0) + 1;
      kinds[kind] = (kinds[kind] || 0) + 1;
    }
    
    return {
      countriesFound: Object.keys(countries),
      countryDistribution: countries,
      kindDistribution: kinds
    };
  }
  
  computeAvgConfidence(results) {
    const resolved = results.filter(r => !r.abstained);
    if (resolved.length === 0) return 0;
    
    const sum = resolved.reduce((acc, r) => acc + r.confidence, 0);
    return sum / resolved.length;
  }
}

module.exports = { DisambiguationService };
```

---

## Factory for Dependency Injection

The factory wires adapters to services, keeping SQL isolated:

```javascript
// src/gazetteer/factory.js

const Database = require('better-sqlite3');
const { GazetteerAdapter } = require('../db/adapters/GazetteerAdapter');
const { PublisherAdapter } = require('../db/adapters/PublisherAdapter');
const { DisambiguationService } = require('./DisambiguationService');

function createDisambiguationService(options = {}) {
  const dbPath = options.dbPath || 'data/news.db';
  
  // Create database connection
  const db = new Database(dbPath, { readonly: true });
  db.pragma('journal_mode = WAL');
  
  // Create adapters (ALL SQL lives in these)
  const gazetteerAdapter = new GazetteerAdapter(db);
  const publisherAdapter = new PublisherAdapter(db);
  
  // Create service with injected adapters
  return new DisambiguationService(gazetteerAdapter, publisherAdapter, options);
}

module.exports = { createDisambiguationService };
```

---

## Usage Examples

### Single Mention

```javascript
const { createDisambiguationService } = require('./src/gazetteer/factory');

// Factory handles adapter wiring
const service = createDisambiguationService({
  dbPath: 'data/news.db'
});

// Single mention
const result = service.disambiguate('London', {
  publisher: 'theguardian.com'
});

console.log(result.resolved.display_label);  // "London, England, United Kingdom"
console.log(result.confidence);              // 0.87

// Cleanup
service.shutdown();
```

### Full Article

```javascript
const { createDisambiguationService } = require('./src/gazetteer/factory');

const service = createDisambiguationService();

const article = {
  mentions: [
    { text: 'London', position: 45 },
    { text: 'Ontario', position: 120 },
    { text: 'Toronto', position: 180 }
  ],
  publisher: 'cbc.ca',
  fullText: '...'
};

const results = service.disambiguateArticle(article);

for (const r of results.mentions) {
  if (!r.abstained) {
    console.log(`${r.mention} → ${r.resolved.display_label} (${r.confidence})`);
  } else {
    console.log(`${r.mention} → ABSTAINED (${r.abstainReason})`);
  }
}

console.log('Countries found:', results.summary.countriesFound);
```

---

## Express API Integration

```javascript
const express = require('express');
const { createDisambiguationService } = require('./src/gazetteer/factory');

const app = express();
app.use(express.json());

// Factory creates service with proper adapter injection
const service = createDisambiguationService();

app.post('/api/disambiguate', (req, res) => {
  try {
    const { mention, publisher, context } = req.body;
    
    const result = service.disambiguate(mention, {
      publisher,
      ...context
    });
    
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/disambiguate/article', (req, res) => {
  try {
    const article = req.body;
    const results = service.disambiguateArticle(article);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  service.shutdown();
  process.exit(0);
});
```

---

## Configuration File

```javascript
// config/disambiguation.json
{
  "dbPath": "data/news.db",
  "maxCandidates": 50,
  "confidenceThreshold": 0.4,
  "enableCoherence": true,
  "enableExplanations": true,
  "cacheSize": 10000,
  
  "weights": {
    "matchQuality": 0.07,
    "priorityScore": 0.12,
    "publisherPrior": 0.20,
    "coMentionCountry": 0.18,
    "hierarchicalContainment": 0.25,
    "geographicProximity": 0.03,
    "textWindowContext": 0.15
  },
  
  "coherence": {
    "dominantCountryThreshold": 0.5,
    "countryBonus": 0.15,
    "containmentBonus": 0.20,
    "maxIterations": 3
  }
}
```

---

## What to Build (This Chapter)

> ⚠️ **Remember**: All SQL lives in adapters. Services consume adapters via dependency injection.

1. **Create the adapter layer first** (before services):
   ```
   src/db/adapters/GazetteerAdapter.js   # All gazetteer SQL
   src/db/adapters/PublisherAdapter.js   # All publisher SQL
   ```

2. **Create the service class** (NO SQL here):
   ```
   src/gazetteer/DisambiguationService.js
   ```

3. **Create the factory**:
   ```javascript
   // src/gazetteer/factory.js
   const { createDisambiguationService } = require('./factory');
   const service = createDisambiguationService(config);
   ```

4. **Add Express endpoints**:
   - `POST /api/disambiguate`
   - `POST /api/disambiguate/article`

5. **Add CLI for testing**:
   ```bash
   node tools/disambiguate-cli.js "London" --publisher theguardian.com
   node tools/disambiguate-cli.js --article article.json --output results.json
   ```

6. **Write tests with mock adapters** (no database needed):
   ```javascript
   test('disambiguates with mock adapter', () => {
     const mockGazetteer = {
       findCandidatesByExactName: jest.fn().mockReturnValue([
         { placeId: 1, name: 'London', countryIso2: 'GB' }
       ])
     };
     const mockPublisher = { getPublisherProfile: jest.fn() };
     
     const service = new DisambiguationService(mockGazetteer, mockPublisher);
     const result = service.disambiguate('London');
     
     expect(result.resolved.countryIso2).toBe('GB');
   });
   ```

7. **Write adapter integration tests** (with real database):
   ```javascript
   test('GazetteerAdapter finds London candidates', () => {
     const adapter = new GazetteerAdapter(testDb);
     const candidates = adapter.findCandidatesByExactName('london');
     
     expect(candidates.length).toBeGreaterThan(0);
     expect(candidates[0]).toHaveProperty('placeId');
   });
   ```

---

*Next: [Chapter 17 — Testing and Validation](./17-testing-validation.md)*
