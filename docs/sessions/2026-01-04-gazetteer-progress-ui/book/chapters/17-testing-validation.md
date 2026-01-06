# Chapter 17: Testing and Validation

*Reading time: 12 minutes*

---

## Testing Philosophy

Disambiguation is hard to test because "correct" is often subjective. Our testing strategy:

1. **Unit tests** — Verify individual components work correctly
2. **Integration tests** — Verify the pipeline produces expected outputs
3. **Golden tests** — Verify known articles produce stable results
4. **Evaluation sets** — Measure accuracy on labeled data

---

## Unit Testing Components

### Testing Candidate Generation

```javascript
describe('candidateGenerator', () => {
  let db;
  
  beforeAll(() => {
    db = new Database('data/test-gazetteer.db', { readonly: true });
  });
  
  afterAll(() => {
    db.close();
  });
  
  test('exact match finds London UK first by priority', () => {
    const candidates = generateCandidates(db, 'London');
    
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].name).toBe('London');
    expect(candidates[0].country_iso2).toBe('GB');
  });
  
  test('qualified match finds London Ontario', () => {
    const candidates = generateCandidates(db, 'London, Ontario');
    
    expect(candidates.length).toBeGreaterThan(0);
    // In new schema, we check if the candidate is contained in Ontario
    expect(candidates[0].country_iso2).toBe('CA');
    expect(candidates[0].kind).toBe('city');
  });
  
  test('alias match finds UK for United Kingdom', () => {
    const candidates = generateCandidates(db, 'UK');
    
    expect(candidates.some(c => c.name === 'United Kingdom')).toBe(true);
  });
  
  test('returns empty for nonsense input', () => {
    const candidates = generateCandidates(db, 'xyzzy123notaplace');
    
    expect(candidates.length).toBe(0);
  });
  
  test('handles unicode correctly', () => {
    const candidates = generateCandidates(db, 'São Paulo');
    
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].name).toBe('São Paulo');
  });
});
```

### Testing Feature Computation

```javascript
describe('features', () => {
  test('matchQuality is 1.0 for exact match', () => {
    const feature = featureMatchQuality('london', { 
      name_norm: 'london', 
      match_type: 'exact' 
    });
    
    expect(feature).toBeCloseTo(1.0, 2);
  });
  
  test('publisherPrior is high for matching country', () => {
    const profile = { countryWeights: { GB: 0.8 } };
    const candidate = { country_iso2: 'GB' };
    
    const feature = featurePublisherPrior(candidate, profile);
    
    expect(feature).toBeCloseTo(0.8, 2);
  });
  
  test('containment returns 1.0 when inside parent', () => {
    // Setup: London ON (id=100) is child of Ontario (id=50) in place_hierarchy
    const candidate = { id: 100 };
    const regions = [{ id: 50, kind: 'region' }];
    
    // Mock DB or hierarchy check
    const feature = featureHierarchicalContainment(db, candidate, regions);
    
    expect(feature).toBeCloseTo(1.0, 2);
  });
});
```

### Testing Scoring

```javascript
describe('scorer', () => {
  test('higher priority increases score', () => {
    const lowPriority = { priorityScore: 30 };
    const highPriority = { priorityScore: 80 };
    
    const context = {}; // Minimal context
    
    const lowFeatures = computeFeatureVector({ candidate: lowPriority, ...context });
    const highFeatures = computeFeatureVector({ candidate: highPriority, ...context });
    
    const lowScore = scoreCandidate(lowFeatures);
    const highScore = scoreCandidate(highFeatures);
    
    expect(highScore).toBeGreaterThan(lowScore);
  });
  
  test('confidence is high when gap is large', () => {
    const ranked = [
      { score: 0.85 },
      { score: 0.45 }
    ];
    
    const result = computeConfidence(ranked);
    
    expect(result.confidence).toBeGreaterThan(0.8);
  });
  
  test('should abstain on multi-way tie', () => {
    const ranked = [
      { score: 0.50 },
      { score: 0.49 },
      { score: 0.48 }
    ];
    
    const confidenceResult = computeConfidence(ranked);
    const abstain = shouldAbstain(ranked, confidenceResult);
    
    expect(abstain.abstain).toBe(true);
  });
});
```

---

## Integration Testing

Test the full pipeline:

```javascript
describe('DisambiguationService', () => {
  let service;
  
  beforeAll(async () => {
    service = new DisambiguationService({
      dbPath: 'data/test-gazetteer.db'
    });
    await service.initialize();
  });
  
  afterAll(async () => {
    await service.shutdown();
  });
  
  test('disambiguates unambiguous mention', async () => {
    const result = await service.disambiguate('Tokyo');
    
    expect(result.abstained).toBe(false);
    expect(result.resolved.name).toBe('Tokyo');
    expect(result.resolved.country_iso2).toBe('JP');
    expect(result.confidence).toBeGreaterThan(0.8);
  });
  
  test('uses publisher prior for ambiguous mention', async () => {
    const guardianResult = await service.disambiguate('London', {
      publisher: 'theguardian.com'
    });
    
    const cbcResult = await service.disambiguate('London', {
      publisher: 'cbc.ca'
    });
    
    // Guardian should prefer UK
    expect(guardianResult.resolved.country_iso2).toBe('GB');
    
    // CBC might still pick UK (higher priority) but with lower confidence
    // Or with enough coherence context, might pick Canada
  });
  
  test('coherence switches London to Canada when Ontario mentioned', async () => {
    const article = {
      mentions: [
        { text: 'London', position: 0 },
        { text: 'Ontario', position: 50 },
        { text: 'Toronto', position: 100 }
      ],
      publisher: 'cbc.ca',
      fullText: 'London is a city in Ontario. Toronto is nearby.'
    };
    
    const results = await service.disambiguateArticle(article);
    
    // London should be resolved to Canada due to coherence
    expect(results.mentions[0].resolved.country_iso2).toBe('CA');
    expect(results.mentions[1].resolved.country_iso2).toBe('CA');
    expect(results.mentions[2].resolved.country_iso2).toBe('CA');
  });
  
  test('abstains on genuinely ambiguous mention', async () => {
    const result = await service.disambiguate('Springfield');
    
    // Springfield exists in many US states with similar priority
    // Should either abstain or have low confidence
    expect(result.confidence).toBeLessThan(0.7);
  });
});
```

---

## Golden Tests

Capture known-good outputs and detect regressions:

```javascript
// tests/golden/articles.json
[
  {
    "id": "test-001",
    "description": "Guardian article about London UK",
    "input": {
      "mentions": [{ "text": "London", "position": 0 }],
      "publisher": "theguardian.com"
    },
    "expected": {
      "mentions": [{
        "resolved": {
          "name": "London",
          "country_iso2": "GB"
        },
        "abstained": false
      }]
    }
  },
  {
    "id": "test-002",
    "description": "CBC article with London Ontario context",
    "input": {
      "mentions": [
        { "text": "London", "position": 0 },
        { "text": "Ontario", "position": 50 }
      ],
      "publisher": "cbc.ca"
    },
    "expected": {
      "mentions": [
        { "resolved": { "country_iso2": "CA" } },
        { "resolved": { "country_iso2": "CA" } }
      ]
    }
  }
]

// tests/golden.test.js
const goldenCases = require('./golden/articles.json');

describe('golden tests', () => {
  let service;
  
  beforeAll(async () => {
    service = new DisambiguationService();
    await service.initialize();
  });
  
  for (const testCase of goldenCases) {
    test(testCase.description, async () => {
      const results = await service.disambiguateArticle(testCase.input);
      
      for (let i = 0; i < testCase.expected.mentions.length; i++) {
        const expected = testCase.expected.mentions[i];
        const actual = results.mentions[i];
        
        if (expected.resolved) {
          expect(actual.abstained).toBe(false);
          
          if (expected.resolved.name) {
            expect(actual.resolved.name).toBe(expected.resolved.name);
          }
          if (expected.resolved.country_iso2) {
            expect(actual.resolved.country_iso2).toBe(expected.resolved.country_iso2);
          }
        }
        
        if (expected.abstained) {
          expect(actual.abstained).toBe(true);
        }
      }
    });
  }
});
```

---

## Evaluation Sets

For measuring accuracy, create labeled datasets:

```javascript
// data/evaluation/labeled-mentions.json
[
  {
    "text": "London",
    "context": "The Mayor of London announced new congestion charges",
    "publisher": "bbc.co.uk",
    "correct_place_id": 1234,
    "correct_country": "GB",
    "notes": "London UK, political context"
  },
  {
    "text": "London",
    "context": "London, Ontario is home to Western University",
    "publisher": "cbc.ca",
    "correct_place_id": 5678,
    "correct_country": "CA",
    "notes": "London Ontario, explicit qualifier"
  }
]

// tools/evaluate.js
async function evaluateAccuracy(service, evalSet) {
  let correct = 0;
  let incorrect = 0;
  let abstained = 0;
  const errors = [];
  
  for (const item of evalSet) {
    const result = await service.disambiguate(item.text, {
      publisher: item.publisher,
      textWindow: item.context
    });
    
    if (result.abstained) {
      abstained++;
      continue;
    }
    
    const isCorrect = 
      result.resolved.place_id === item.correct_place_id ||
      result.resolved.country_iso2 === item.correct_country;
    
    if (isCorrect) {
      correct++;
    } else {
      incorrect++;
      errors.push({
        mention: item.text,
        expected: item.correct_country,
        got: result.resolved.country_iso2,
        confidence: result.confidence,
        notes: item.notes
      });
    }
  }
  
  const total = evalSet.length;
  const accuracy = correct / (correct + incorrect);
  const coverage = (correct + incorrect) / total;
  
  return {
    correct,
    incorrect,
    abstained,
    total,
    accuracy: (accuracy * 100).toFixed(1) + '%',
    coverage: (coverage * 100).toFixed(1) + '%',
    errors
  };
}
```

---

## Metrics to Track

| Metric | Formula | Target |
|--------|---------|--------|
| **Accuracy** | correct / (correct + incorrect) | > 90% |
| **Coverage** | (correct + incorrect) / total | > 85% |
| **Abstention Rate** | abstained / total | < 15% |
| **High-Confidence Accuracy** | correct where conf > 0.8 | > 95% |

---

## Test Data Generation

Generate test cases from production data:

```javascript
async function generateTestCases(db, count = 100) {
  const testCases = [];
  
  // Sample articles with resolved places
  // Using article_place_relations for resolved entities
  // and article_places for the raw mention text
  const articles = await db.all(`
    SELECT 
      u.host AS publisher,
      ca.body_text AS text,
      ap.place AS mention,
      apr.place_id AS resolved_place_id
    FROM article_place_relations apr
    JOIN article_places ap ON ap.article_url_id = apr.article_id 
      AND ap.place = (SELECT name FROM place_names WHERE place_id = apr.place_id LIMIT 1) -- Approximate match for demo
    JOIN urls u ON u.id = apr.article_id
    JOIN http_responses hr ON hr.url_id = u.id
    JOIN content_storage cs ON cs.http_response_id = hr.id
    JOIN content_analysis ca ON ca.content_id = cs.id
    WHERE apr.confidence > 0.8
    ORDER BY RANDOM()
    LIMIT ?
  `, [count]);
  
  for (const row of articles) {
    testCases.push({
      text: row.mention,
      context: extractContext(row.text, row.mention),
      publisher: row.publisher,
      correct_place_id: row.resolved_place_id
    });
  }
  
  return testCases;
}
```

---

## Regression Testing Workflow

```bash
# 1. Run unit tests
npm test -- --testPathPattern=gazetteer

# 2. Run integration tests
npm test -- --testPathPattern=disambiguation.integration

# 3. Run golden tests
npm test -- --testPathPattern=golden

# 4. Run evaluation
node tools/evaluate.js --eval-set data/evaluation/labeled-mentions.json

# 5. Compare to baseline
node tools/evaluate.js --compare baseline-2024-01.json
```

---

## Debugging Failed Tests

When a test fails:

```javascript
test('debug failing case', async () => {
  const service = new DisambiguationService();
  await service.initialize();
  
  const result = await service.disambiguate('London', {
    publisher: 'cbc.ca',
    resolvedRegions: [{ place_id: 50, kind: 'adm1', name: 'Ontario' }]
  });
  
  // Print detailed debug info
  console.log('Result:', JSON.stringify(result, null, 2));
  
  // Check each candidate's features
  for (const c of result.candidates.slice(0, 3)) {
    console.log(`\n${c.name}, ${c.country_iso2}:`);
    console.log('  Score:', c.score);
    console.log('  Features:', c.features);
  }
  
  // Check coherence
  console.log('\nCoherence applied:', result.coherenceApplied);
  if (result.coherenceChange) {
    console.log('Coherence change:', result.coherenceChange);
  }
});
```

---

## Performance Benchmarking

Performance matters for disambiguation—we need to process articles in real-time.

**See the benchmark lab**: `labs/db-access-patterns/README.md`

### Key Benchmarks

```bash
# Run all benchmarks
node labs/db-access-patterns/run-benchmarks.js

# Just candidate generation
node labs/db-access-patterns/benchmarks/candidate-generation.bench.js
```

### Performance Targets

| Metric | Target | Rationale |
|--------|--------|-----------|
| Candidate lookup | <2ms per mention | Real-time processing |
| Full disambiguation | <10ms per mention | With hierarchy + scoring |
| Articles/second | >1000 | Handle news feed volume |
| Memory (loaded cache) | <100MB | Reasonable footprint |

### Validated Findings (2026-01-04)

From `labs/db-access-patterns/`:

- **Prepared statements**: 1.5x faster than ad-hoc queries
- **Normalized column**: 1.85x faster than exact name lookup
- **Single lookups beat batch IN**: SQLite prefers indexed single-key lookups
- **Full pipeline**: ~2,500 articles/second sustainable

---

## What to Build (This Chapter)

1. **Create test fixtures**:
   ```
   data/test-gazetteer.db     # Small test database
   tests/fixtures/articles/   # Sample articles
   tests/golden/articles.json # Golden test cases
   ```

2. **Create unit tests**:
   ```
   tests/gazetteer/candidateGenerator.test.js
   tests/gazetteer/features.test.js
   tests/gazetteer/scorer.test.js
   tests/gazetteer/coherence.test.js
   ```

3. **Create integration tests**:
   ```
   tests/gazetteer/disambiguation.integration.test.js
   ```

4. **Create golden tests**:
   ```
   tests/golden.test.js
   ```

5. **Create evaluation tooling**:
   ```
   tools/evaluate.js
   data/evaluation/labeled-mentions.json
   ```

6. **Add to CI**:
   ```yaml
   # .github/workflows/test.yml
   - run: npm test -- --testPathPattern=gazetteer
   - run: node tools/evaluate.js --ci --threshold 85
   ```

---

*Next: [Chapter 18 — Debugging and Troubleshooting](./18-debugging.md)*
