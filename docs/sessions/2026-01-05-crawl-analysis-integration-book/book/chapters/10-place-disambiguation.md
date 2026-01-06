# Chapter 10: Place Disambiguation

> **Implementation Status**: ✅ Complete — Core detection, coherence, publisher priors, multi-language support, and explain API all implemented.

## Codebase Quick Reference

| Component | File Location | Status |
|-----------|---------------|--------|
| Place extraction | `src/analysis/place-extraction.js` | ✅ 954 lines |
| **Place coherence** | `src/analysis/place-coherence.js` | ✅ **NEW** |
| **Publisher priors** | `src/analysis/publisher-prior.js` | ✅ **NEW** |
| **Multi-language queries** | `src/db/sqlite/v1/queries/multiLanguagePlaces.js` | ✅ **NEW** |
| **Explain API** | `src/api/routes/places.js` | ✅ **NEW** |
| Place Hub Matrix UI | `src/ui/server/placeHubGuessing/server.js` | ✅ Complete |
| Matrix control | `src/ui/server/placeHubGuessing/controls/PlaceHubGuessingMatrixControl.js` | ✅ jsgui3 |
| UI queries | `src/db/sqlite/v1/queries/placeHubGuessingUiQueries.js` | ✅ Complete |
| Hub guessing CLI | `src/tools/guess-place-hubs.js` | ✅ Complete |
| Orchestration | `src/orchestration/placeHubGuessing.js` | ✅ Complete |
| API routes | `src/api/routes/place-hubs.js` | ✅ REST API |

## Implementation Summary (January 2026)

| Feature | Status | Implementation Details |
|---------|--------|------------------------|
| Publisher prior scoring | ✅ **Complete** | `PublisherPrior` class with `getPrior()`, `explain()`, `scoreCandidates()` |
| Multi-language aliases | ✅ **Complete** | `createMultiLanguagePlaceQueries()` with script detection, language expansion |
| Coherence pass | ✅ **Complete** | `PlaceCoherence` class with haversine distance |
| `/explain` API | ✅ **Complete** | `POST /api/places/explain` with full scoring breakdown |

### Check Scripts

- `checks/publisher-prior.check.js` — 25 tests, validates prior calculation and caching
- `checks/multi-language-places.check.js` — 44 tests, validates script detection and queries
- `checks/places-api.check.js` — 19 tests, validates router and scoring logic

## Using the Publisher Prior Module

The new `PublisherPrior` class computes disambiguation priors from actual hub coverage data:

```javascript
const { PublisherPrior } = require('./src/analysis/publisher-prior');

// Initialize with database
const priors = new PublisherPrior(db);

// Get prior for a specific host and country
const prior = priors.getPrior('bbc.com', 'GB');
console.log(prior);  // 0.1-0.8 range

// Get detailed explanation
const explanation = priors.explain('bbc.com', 'GB');
console.log(explanation);
// {
//   host: 'bbc.com',
//   countryCode: 'GB',
//   prior: 0.65,
//   explanation: {
//     hasAnyData: true,
//     totalPlaces: 45,
//     countryPlaces: 30,
//     proportion: 0.667,
//     reason: '30/45 places are in GB'
//   },
//   coverage: {
//     byCountry: { GB: 30, US: 10, ... },
//     byKind: { 'country-hub': 5, 'region-hub': 20, ... }
//   },
//   timestamp: '2026-01-05T...'
// }

// Batch score candidates
const candidates = [
  { place_id: 1, country_code: 'GB' },
  { place_id: 2, country_code: 'US' }
];
const scored = priors.scoreCandidates('bbc.com', candidates);
// Each candidate now has a publisherPrior field
```

## Using the Multi-Language Module

The new `createMultiLanguagePlaceQueries()` factory provides multi-language place lookups:

```javascript
const { createMultiLanguagePlaceQueries } = require('./src/db/sqlite/v1/queries/multiLanguagePlaces');

// Initialize with database
const mlQueries = createMultiLanguagePlaceQueries(db);

// Find place by name with auto language detection
const candidates = mlQueries.findByName('北京');  // Beijing in Chinese
// Automatically detects Hans script, searches with zh-Hans preference

// Detect script/language
const detected = mlQueries.detectScript('Москва');
console.log(detected);  // { script: 'Cyrl', lang: 'ru' }

// Get all names for a place
const names = mlQueries.getPlaceNames(2988507);  // Paris
// Returns names in all available languages

// Get preferred name in specific language
const frenchName = mlQueries.getPreferredName(2988507, 'fr');  // 'Paris'
const germanName = mlQueries.getPreferredName(2988507, 'de');  // 'Paris'

// Expand language to include fallbacks
const expanded = mlQueries.expandLanguage('zh');
// ['zh', 'zh-Hans', 'cmn', 'zh-CN', 'zh-Hant', 'zh-TW', 'zh-HK', 'en', 'und', null]
```

## Using the Explain API

The new `/api/places/explain` endpoint provides transparent disambiguation reasoning:

```bash
# Explain a disambiguation decision
curl -X POST http://localhost:3000/api/places/explain \
  -H "Content-Type: application/json" \
  -d '{
    "mention": "London",
    "context": "The protests in London drew thousands of people",
    "host": "bbc.com",
    "candidates": [
      { "place_id": 123, "name": "London", "country_code": "GB", "population": 8900000, "feature_code": "PPLC" },
      { "place_id": 456, "name": "London", "country_code": "CA", "population": 400000, "feature_code": "PPL" }
    ],
    "otherMentions": [
      { "name": "Manchester", "latitude": 53.48, "longitude": -2.24 }
    ]
  }'
```

Response includes full scoring breakdown:
```json
{
  "mention": "London",
  "host": "bbc.com",
  "selected": {
    "place_id": 123,
    "name": "London",
    "country_code": "GB",
    "scores": {
      "population": 0.85,
      "featureClass": 0.3,
      "publisherPrior": 0.65,
      "contextMatch": 0.0,
      "coherence": 0.8,
      "coherenceDetails": [
        { "otherPlace": "Manchester", "distanceKm": 262, "coherenceContribution": 0.8 }
      ]
    },
    "weights": {
      "population": 0.30,
      "featureClass": 0.15,
      "publisherPrior": 0.20,
      "contextMatch": 0.20,
      "coherence": 0.15
    },
    "totalScore": 0.67,
    "normalizedScore": 1.0,
    "rank": 1
  },
  "confidence": 0.88,
  "reasoning": "Selected London, GB with high confidence (88%). Key factors: London has a large population (score: 0.85); Publisher has coverage of GB (prior: 0.65); Geographic coherence with other mentioned places (score: 0.80); Place is a capital or major administrative center (boost: 0.30)."
}
```

## Using the Coherence Module

The new `PlaceCoherence` class applies multi-mention coherence scoring:

```javascript
const { PlaceCoherence } = require('./src/analysis/place-coherence');

// Initialize with database
const coherence = new PlaceCoherence(db, {
  coherenceWeight: 0.15,  // Weight in final scoring (default: 0.15)
  minMentions: 2          // Minimum mentions to apply coherence
});

// Apply to disambiguation results
const adjustedResults = coherence.applyCoherence(mentionResults);

// Get explanation for a specific result
const explanation = coherence.explain(mentionResult, otherResults);
console.log(explanation);
// {
//   mention_id: 123,
//   coherenceApplied: true,
//   averageCoherence: 0.72,
//   distances: [
//     { otherPlace: 'London', distanceKm: 342, coherenceContribution: 0.8 },
//     { otherPlace: 'Manchester', distanceKm: 267, coherenceContribution: 0.8 }
//   ]
// }
```

## The Challenge

Place names are inherently ambiguous:

- "Paris" → Paris, France? Paris, Texas? Paris, Ontario?
- "London" → London, UK? London, Ontario? London, Ohio?
- "Newcastle" → 30+ places worldwide

The disambiguation engine resolves these mentions to specific geographic entities.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        INPUT: Place Mentions                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Article: "The protests in Paris drew thousands..."                     │
│  Mention: "Paris" at offset 21-26                                       │
│  Context: "protests in Paris drew thousands"                            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      STAGE 1: CANDIDATE LOOKUP                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Query gazetteer + aliases for "Paris":                                 │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ place_id │ name        │ country │ population │ feature        │   │
│  ├──────────┼─────────────┼─────────┼────────────┼────────────────┤   │
│  │ 2988507  │ Paris       │ FR      │ 2,161,000  │ PPLC (capital) │   │
│  │ 4717560  │ Paris       │ US      │ 25,171     │ PPL            │   │
│  │ 6077243  │ Paris       │ CA      │ 12,000     │ PPL            │   │
│  │ ...      │ ...         │ ...     │ ...        │ ...            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      STAGE 2: FEATURE SCORING                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  For each candidate, compute feature scores:                            │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Feature           │ Paris,FR │ Paris,TX │ Paris,CA │ Weight    │   │
│  ├───────────────────┼──────────┼──────────┼──────────┼───────────┤   │
│  │ Population log    │ 6.33     │ 4.40     │ 4.08     │ 0.30      │   │
│  │ Capital boost     │ 1.0      │ 0.0      │ 0.0      │ 0.15      │   │
│  │ Publisher prior   │ 0.8      │ 0.1      │ 0.1      │ 0.20      │   │
│  │ Context match     │ 0.7      │ 0.1      │ 0.1      │ 0.20      │   │
│  │ Containment       │ 0.0      │ 0.0      │ 0.0      │ 0.15      │   │
│  ├───────────────────┼──────────┼──────────┼──────────┼───────────┤   │
│  │ TOTAL SCORE       │ 3.12     │ 0.93     │ 0.82     │           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      STAGE 3: RANKING & SELECTION                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Rank by total score:                                                   │
│  1. Paris, France (score: 3.12, confidence: 0.89)  ◀── SELECTED        │
│  2. Paris, Texas (score: 0.93, confidence: 0.26)                        │
│  3. Paris, Canada (score: 0.82, confidence: 0.23)                       │
│                                                                         │
│  Confidence = score[1] / (score[1] + score[2])                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      OUTPUT: Resolved Place                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  {                                                                       │
│    mention_id: 12345,                                                    │
│    place_id: 2988507,                                                    │
│    name: "Paris",                                                        │
│    country: "France",                                                    │
│    confidence: 0.89,                                                     │
│    method: "weighted-scoring"                                            │
│  }                                                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Scoring Features

### Population

Larger places are more likely to be referenced:

```javascript
function populationScore(population) {
  if (!population || population <= 0) return 0;
  return Math.log10(population) / 7;  // Normalize to 0-1
}

// Examples:
// 10,000,000 → 1.0
// 1,000,000 → 0.86
// 100,000 → 0.71
// 10,000 → 0.57
// 1,000 → 0.43
```

### Feature Class Boost

Capitals and major features get boosted:

```javascript
const featureBoosts = {
  'PPLC': 0.3,  // Capital city
  'PPLA': 0.2,  // First-order admin division capital
  'PPLA2': 0.1, // Second-order admin
  'PPL': 0.0,   // Regular populated place
  'PCLI': 0.4,  // Independent political entity
};
```

### Publisher Prior

News publishers have geographic focuses:

```javascript
const publisherPriors = {
  'bbc.com': { 'GB': 0.6, 'US': 0.15, 'default': 0.05 },
  'nytimes.com': { 'US': 0.7, 'GB': 0.1, 'default': 0.05 },
  'guardian.com': { 'GB': 0.6, 'US': 0.15, 'AU': 0.1 },
  'default': { 'default': 0.1 }
};

function publisherPriorScore(publisher, countryCode) {
  const priors = publisherPriors[publisher] || publisherPriors['default'];
  return priors[countryCode] || priors['default'];
}
```

---

## Place Hub Guessing Matrix Integration

The Place Hub Guessing Matrix is a **coverage discovery tool** that maps which publishers have dedicated pages for which places. This data directly feeds the **Publisher Prior** scoring feature.

### What the Matrix Does

The matrix tracks `place × domain` coverage:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   Place Hub Guessing Matrix                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│          │ bbc.com │ guardian │ reuters │ nytimes │ wapo   │           │
│  ────────┼─────────┼──────────┼─────────┼─────────┼────────┤           │
│  France  │   ✓     │    ✓     │    ✓    │    ✓    │   ✓    │           │
│  Germany │   ✓     │    ✓     │    ✓    │    ✓    │   ✓    │           │
│  UK      │   ✓     │    ✓     │    ✓    │    ○    │   ○    │           │
│  Texas   │   ○     │    ○     │    ✓    │    ✓    │   ✓    │           │
│  Ontario │   ○     │    ○     │    ✓    │    ○    │   ○    │           │
│                                                                          │
│  Legend: ✓ = verified hub exists, ○ = no hub found                      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### How It Feeds Disambiguation

1. **Publisher prior calculation** — If BBC has a UK hub but no Texas hub, BBC articles mentioning "London" get boosted toward London, UK.

2. **Coverage evidence** — The matrix stores URLs and verification status in `place_page_mappings`:
   ```sql
   SELECT host, place_id, url, status, verified_at
   FROM place_page_mappings
   WHERE status = 'verified';
   ```

3. **Gap analysis** — Missing coverage reveals editorial focus:
   - NYT has Texas hub but no Ontario hub → US focus
   - BBC has UK hub but sparse US coverage → UK focus

### Matrix Data Tables

```sql
-- The mapping table feeds the disambiguation prior
CREATE TABLE place_page_mappings (
  id INTEGER PRIMARY KEY,
  place_id INTEGER REFERENCES gazetteer(place_id),
  host TEXT NOT NULL,
  page_kind TEXT,           -- 'country-hub', 'region-hub', 'city-hub'
  url TEXT,
  status TEXT,              -- 'pending', 'verified', 'absent'
  verified_at TEXT,
  last_seen_at TEXT,
  evidence_json TEXT        -- validation details
);

-- Index for fast lookup during scoring
CREATE INDEX idx_ppm_host_place ON place_page_mappings(host, place_id);
CREATE INDEX idx_ppm_status ON place_page_mappings(status);
```

### Computing Publisher Priors from Matrix

```javascript
// Dynamic prior calculation from actual coverage
function computePublisherPrior(host, countryCode, db) {
  // Get total places this host covers
  const totalCovered = db.prepare(`
    SELECT COUNT(DISTINCT place_id) as cnt
    FROM place_page_mappings
    WHERE host = ? AND status = 'verified'
  `).get(host)?.cnt || 0;

  if (totalCovered === 0) return 0.1; // fallback

  // Get places in this country the host covers
  const countryCovered = db.prepare(`
    SELECT COUNT(DISTINCT m.place_id) as cnt
    FROM place_page_mappings m
    JOIN gazetteer g ON m.place_id = g.place_id
    WHERE m.host = ? AND m.status = 'verified' AND g.country_code = ?
  `).get(host, countryCode)?.cnt || 0;

  // Prior = proportion of host's coverage in this country
  return Math.min(0.8, (countryCovered / totalCovered) + 0.1);
}
```

### UI Access

The matrix is accessible in the Unified App:

| Endpoint | Description |
|----------|-------------|
| `/place-hub-guessing` | Interactive matrix UI |
| `/place-hub-guessing/cell?placeId=X&host=Y` | Drilldown for specific cell |
| `POST /api/place-hubs/guess` | Batch hub discovery API |

**Server**: `src/ui/server/placeHubGuessing/server.js`

### Workflow: Improving Disambiguation via Hub Discovery

1. **Run hub discovery** for domains with poor disambiguation accuracy:
   ```bash
   node src/tools/guess-place-hubs.js --domains bbc.com,guardian.com --kinds country,region
   ```

2. **Review in matrix UI** — Verify discovered hubs, mark absent ones

3. **Rebuild priors** — Disambiguation engine pulls updated coverage from `place_page_mappings`

4. **Re-run analysis** — Articles get re-scored with improved priors

### Key Implementation Files

| File | Purpose |
|------|---------|
| `src/ui/server/placeHubGuessing/server.js` | Matrix UI server |
| `src/ui/server/placeHubGuessing/controls/PlaceHubGuessingMatrixControl.js` | Matrix jsgui3 control |
| `src/db/sqlite/v1/queries/placeHubGuessingUiQueries.js` | Matrix data queries |
| `src/tools/guess-place-hubs.js` | Hub discovery CLI |
| `src/orchestration/placeHubGuessing.js` | Hub guessing business logic |
| `src/api/routes/place-hubs.js` | REST API for batch guessing |

### Context Match

Words in the surrounding text that match place metadata:

```javascript
function contextScore(context, candidate) {
  let score = 0;
  const words = context.toLowerCase().split(/\s+/);
  
  // Country name mentioned
  if (words.includes(candidate.country_name.toLowerCase())) {
    score += 0.5;
  }
  
  // Admin division mentioned
  if (candidate.admin1_name && words.includes(candidate.admin1_name.toLowerCase())) {
    score += 0.3;
  }
  
  // Nearby place mentioned
  for (const nearby of candidate.nearbyPlaces) {
    if (words.includes(nearby.name.toLowerCase())) {
      score += 0.2;
    }
  }
  
  return Math.min(score, 1.0);
}
```

### Containment

Explicit containment phrases:

```javascript
function containmentScore(context, candidate) {
  const patterns = [
    new RegExp(`${candidate.name},?\\s+${candidate.admin1_name}`, 'i'),
    new RegExp(`${candidate.name},?\\s+${candidate.country_name}`, 'i'),
    new RegExp(`in\\s+${candidate.country_name}`, 'i')
  ];
  
  for (const pattern of patterns) {
    if (pattern.test(context)) {
      return 1.0;
    }
  }
  
  return 0.0;
}
```

---

## Multi-Mention Coherence

When an article mentions multiple places, they should be geographically coherent:

```javascript
function coherencePass(mentions, candidates) {
  // Build coherence graph
  const graph = buildCoherenceGraph(candidates);
  
  // Score based on spatial clustering
  for (const mention of mentions) {
    for (const candidate of mention.candidates) {
      const coherence = computeCoherence(candidate, graph);
      candidate.score += coherence * COHERENCE_WEIGHT;
    }
  }
  
  // Re-rank after coherence adjustment
  for (const mention of mentions) {
    mention.candidates.sort((a, b) => b.score - a.score);
  }
}

function computeCoherence(candidate, graph) {
  // How well does this candidate fit with other resolved places?
  const neighbors = graph.getNeighbors(candidate.place_id);
  if (neighbors.length === 0) return 0;
  
  let coherenceSum = 0;
  for (const neighbor of neighbors) {
    const distance = haversineDistance(candidate, neighbor);
    // Closer places = higher coherence
    coherenceSum += 1 / (1 + Math.log10(distance + 1));
  }
  
  return coherenceSum / neighbors.length;
}
```

---

## Multi-Language Support

### Alias Lookup

```sql
-- Find all aliases for "París" (Spanish), "巴黎" (Chinese)
SELECT g.place_id, g.name, a.alias_name, a.language
FROM gazetteer g
JOIN aliases a ON g.place_id = a.place_id
WHERE a.alias_name IN ('París', '巴黎', 'Paris')
ORDER BY g.population DESC;
```

### Language Detection

```javascript
function detectMentionLanguage(text, offset) {
  // Check surrounding characters for script
  const sample = text.slice(offset - 20, offset + 20);
  
  if (/[\u4e00-\u9fff]/.test(sample)) return { lang: 'zh', script: 'Hans' };
  if (/[\u0400-\u04FF]/.test(sample)) return { lang: 'ru', script: 'Cyrl' };
  if (/[\u0600-\u06FF]/.test(sample)) return { lang: 'ar', script: 'Arab' };
  
  return { lang: 'en', script: 'Latn' };
}
```

### Transliteration Matching

```javascript
// "Beijing" matches "北京" via pinyin transliteration
const transliterations = {
  '北京': ['Beijing', 'Peking'],
  '東京': ['Tokyo', 'Tōkyō'],
  'Москва': ['Moscow', 'Moskva']
};
```

---

## Database Schema

### Core Tables

```sql
-- Place definitions
CREATE TABLE gazetteer (
  place_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  country_code TEXT,
  admin1_code TEXT,
  population INTEGER,
  latitude REAL,
  longitude REAL,
  feature_class TEXT,
  feature_code TEXT
);

-- Multi-language aliases
CREATE TABLE aliases (
  alias_id INTEGER PRIMARY KEY,
  place_id INTEGER REFERENCES gazetteer(place_id),
  alias_name TEXT NOT NULL,
  language TEXT,
  script TEXT,
  is_preferred INTEGER DEFAULT 0
);

-- Detected mentions
CREATE TABLE place_mentions (
  mention_id INTEGER PRIMARY KEY,
  url TEXT NOT NULL,
  mention_text TEXT NOT NULL,
  start_offset INTEGER,
  context_snippet TEXT,
  detection_method TEXT
);

-- Disambiguation results
CREATE TABLE resolved_places (
  resolution_id INTEGER PRIMARY KEY,
  mention_id INTEGER REFERENCES place_mentions(mention_id),
  place_id INTEGER REFERENCES gazetteer(place_id),
  confidence REAL,
  disambiguation_method TEXT
);
```

### Indexes for Performance

```sql
CREATE INDEX idx_gazetteer_name ON gazetteer(name);
CREATE INDEX idx_aliases_name ON aliases(alias_name);
CREATE INDEX idx_aliases_place ON aliases(place_id);
CREATE INDEX idx_mentions_url ON place_mentions(url);
CREATE INDEX idx_resolved_mention ON resolved_places(mention_id);
```

---

## API Design

```javascript
class DisambiguationEngine {
  // Core disambiguation
  async disambiguate(mentions, context) {
    const results = [];
    
    for (const mention of mentions) {
      const candidates = await this.findCandidates(mention.text);
      const scored = this.scoreCandidates(candidates, mention, context);
      const selected = this.selectBest(scored);
      
      results.push({
        mention_id: mention.id,
        place_id: selected.place_id,
        confidence: selected.confidence,
        method: 'weighted-scoring'
      });
    }
    
    // Apply coherence pass
    this.applyCoherence(results);
    
    return results;
  }
  
  // Candidate lookup
  async findCandidates(nameVariant, options = {}) {
    const sql = `
      SELECT DISTINCT g.*, a.alias_name, a.language
      FROM gazetteer g
      LEFT JOIN aliases a ON g.place_id = a.place_id
      WHERE g.name = ? OR a.alias_name = ?
      ORDER BY g.population DESC
      LIMIT ?
    `;
    return this.db.all(sql, [nameVariant, nameVariant, options.limit || 10]);
  }
  
  // Explain a decision
  explainDisambiguation(result) {
    return {
      mention: result.mention_text,
      selected: result.selected,
      candidates: result.allCandidates.map(c => ({
        name: c.name,
        country: c.country_code,
        score: c.score,
        breakdown: c.featureScores
      })),
      confidence: result.confidence,
      reasoning: this.generateReasoning(result)
    };
  }
}
```

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Accuracy on ground truth | >90% |
| Throughput | >1000 disambiguations/sec |
| P95 latency | <50ms per mention |
| Memory (full gazetteer) | <500MB |

---

## Further Reading

See the full disambiguation book at:
`docs/sessions/2026-01-04-gazetteer-progress-ui/book/`

---

## Next Chapter

[Chapter 11: The Unified Workflow →](11-unified-workflow.md)
