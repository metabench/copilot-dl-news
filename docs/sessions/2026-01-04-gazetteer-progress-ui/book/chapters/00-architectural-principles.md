# Chapter 0: Architectural Principles

*Reading time: 8 minutes*

---

## The Adapter Layer Rule

**ALL SQL LIVES IN THE DATABASE ADAPTER LAYER.**

This is the foundational architectural constraint for the disambiguation system. No service, controller, or feature module should contain raw SQL queries. All database access flows through a dedicated adapter layer with clearly defined interfaces.

---

## Why This Matters

### 1. Testability
Adapters can be mocked or stubbed for unit tests. Services don't need database connections to verify their logic.

### 2. Swappability
Today we use SQLite for the gazetteer cache. Tomorrow we might use PostgreSQL, DuckDB, or an in-memory store. The adapter interface stays the same.

### 3. Query Optimization
All queries live in one place. When performance tuning, you know exactly where to look.

### 4. Security
SQL injection risks are contained. Parameterized queries are enforced at the adapter boundary.

### 5. Maintainability
When schema changes, you update adapters and their tests. Services remain unchanged.

---

## The Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                         SERVICE LAYER                            │
│  (DisambiguationService, CoherencePass, FeatureEngine, etc.)    │
│                                                                  │
│  • Business logic only                                           │
│  • Calls adapter methods, never raw SQL                          │
│  • Receives/returns plain JavaScript objects                     │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                │ Adapter Interface
                                │ (findCandidatesByName, getPlaceById, etc.)
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        ADAPTER LAYER                             │
│              (GazetteerAdapter, PublisherAdapter, etc.)          │
│                                                                  │
│  • ALL SQL lives here                                            │
│  • Parameterized queries only                                    │
│  • Returns plain objects, not DB rows                            │
│  • Handles connection lifecycle                                  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       DATABASE ENGINE                            │
│                    (SQLite, PostgreSQL, etc.)                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Adapter Interface Design

Each adapter exposes a focused set of methods. Here's the pattern for the gazetteer:

```javascript
// src/db/adapters/GazetteerAdapter.js

class GazetteerAdapter {
  constructor(db) {
    this.db = db;
    this._prepareStatements();
  }
  
  // === CANDIDATE LOOKUP ===
  
  findCandidatesByExactName(nameNorm, options = {}) { }
  findCandidatesByAlias(nameNorm, options = {}) { }
  findCandidatesByPrefix(prefix, options = {}) { }
  findCandidatesByFuzzy(name, maxDistance, options = {}) { }
  
  // === PLACE RETRIEVAL ===
  
  getPlaceById(placeId) { }
  getPlacesByIds(placeIds) { }
  getPlaceWithHierarchy(placeId) { }
  
  // === HIERARCHY ===
  
  getParentChain(placeId) { }
  getChildren(placeId, kind = null) { }
  checkContainment(childId, potentialParentId) { }
  
  // === ALIASES & LANGUAGES ===
  
  getAliasesForPlace(placeId, lang = null) { }
  findTransliterations(name, fromScript, toScript) { }
  getNormalizationRules(lang = null) { }
  
  // === PUBLISHER PROFILES ===
  
  getPublisherProfile(domain) { }
  getPublisherCountryWeights(domain) { }
  upsertPublisherProfile(domain, profile) { }
  
  // === CONTEXT KEYWORDS ===
  
  getContextKeywords(placeId) { }
  getContextKeywordsByCountry(countryIso2) { }
  findKeywordsInText(textNorm) { }
  
  // === MAINTENANCE ===
  
  close() { }
}
```

---

## Implementation Pattern

Each method encapsulates a single query or small transaction:

```javascript
class GazetteerAdapter {
  constructor(db) {
    this.db = db;
    this._prepareStatements();
  }
  
  _prepareStatements() {
    // Prepare statements for performance
    this._stmts = {
      exactName: this.db.prepare(`
        SELECT p.id AS place_id, pn.name, pn.normalized AS name_norm, p.kind,
               p.country_code AS country_iso2, p.adm1_code, p.population, p.priority_score,
               p.lat, p.lng
        FROM place_names pn
        JOIN places p ON p.id = pn.place_id
        WHERE pn.normalized = ? AND pn.is_preferred = 1
        ORDER BY p.priority_score DESC
        LIMIT ?
      `),
      
      byAlias: this.db.prepare(`
        SELECT p.id AS place_id, pn.name, pn.normalized AS name_norm, p.kind,
               p.country_code AS country_iso2, p.adm1_code, p.population, p.priority_score,
               p.lat, p.lng,
               pn.normalized AS alias_norm, pn.lang AS alias_lang, pn.name_kind AS alias_kind
        FROM place_names pn
        JOIN places p ON p.id = pn.place_id
        WHERE pn.normalized = ?
        ORDER BY p.priority_score DESC
        LIMIT ?
      `),
      
      placeById: this.db.prepare(`
        SELECT * FROM places WHERE id = ?
      `),
      
      // ... more prepared statements
    };
  }
  
  findCandidatesByExactName(nameNorm, options = {}) {
    const limit = options.limit || 50;
    const rows = this._stmts.exactName.all(nameNorm, limit);
    
    // Transform to plain objects (never leak DB implementation details)
    return rows.map(row => ({
      placeId: row.place_id,
      name: row.name,
      nameNorm: row.name_norm,
      kind: row.kind,
      countryIso2: row.country_iso2,
      adm1Id: row.adm1_code,
      population: row.population,
      priorityScore: row.priority_score,
      lat: row.lat,
      lng: row.lng,
      matchType: 'exact'
    }));
  }
  
  findCandidatesByAlias(nameNorm, options = {}) {
    const limit = options.limit || 50;
    const rows = this._stmts.byAlias.all(nameNorm, limit);
    
    return rows.map(row => ({
      placeId: row.place_id,
      name: row.name,
      nameNorm: row.name_norm,
      kind: row.kind,
      countryIso2: row.country_iso2,
      adm1Id: row.adm1_code,
      population: row.population,
      priorityScore: row.priority_score,
      lat: row.lat,
      lng: row.lng,
      matchType: 'alias',
      aliasNorm: row.alias_norm,
      aliasLang: row.alias_lang,
      aliasKind: row.alias_kind
    }));
  }
  
  // ... more methods
}

module.exports = { GazetteerAdapter };
```

---

## Service Layer Consumes Adapters

Services receive adapters via dependency injection, never raw database connections:

```javascript
// CORRECT: Service uses adapter methods
class DisambiguationService {
  constructor(gazetteerAdapter, publisherAdapter) {
    this.gazetteer = gazetteerAdapter;
    this.publisher = publisherAdapter;
  }
  
  async findCandidates(mention) {
    const nameNorm = this.normalize(mention);
    
    // Adapter method, not raw SQL
    let candidates = this.gazetteer.findCandidatesByExactName(nameNorm);
    
    if (candidates.length === 0) {
      candidates = this.gazetteer.findCandidatesByAlias(nameNorm);
    }
    
    return candidates;
  }
}

// WRONG: Service contains SQL
class BadDisambiguationService {
  constructor(db) {
    this.db = db;  // ❌ Direct DB access
  }
  
  async findCandidates(mention) {
    // ❌ SQL in service layer - NEVER DO THIS
    return this.db.all(`
      SELECT * FROM places WHERE name_norm = ?
    `, [mention]);
  }
}
```

---

## Factory & Dependency Injection

```javascript
// src/gazetteer/factory.js

const { createDatabase } = require('../db');
const { GazetteerAdapter } = require('../db/adapters/GazetteerAdapter');
const { PublisherAdapter } = require('../db/adapters/PublisherAdapter');
const { DisambiguationService } = require('./DisambiguationService');

function createDisambiguationService(options = {}) {
  const db = createDatabase({
    engine: 'sqlite',
    dbPath: options.dbPath || 'data/gazetteer.db',
    readonly: true
  });
  
  const gazetteerAdapter = new GazetteerAdapter(db);
  const publisherAdapter = new PublisherAdapter(db);
  
  return new DisambiguationService(gazetteerAdapter, publisherAdapter, options);
}

module.exports = { createDisambiguationService };
```

---

## Testing with Mock Adapters

```javascript
// tests/unit/DisambiguationService.test.js

const { DisambiguationService } = require('../../src/gazetteer/DisambiguationService');

describe('DisambiguationService', () => {
  let mockGazetteer;
  let mockPublisher;
  let service;
  
  beforeEach(() => {
    // No database needed - mock the adapter interface
    mockGazetteer = {
      findCandidatesByExactName: jest.fn(),
      findCandidatesByAlias: jest.fn(),
      getPlaceById: jest.fn(),
      checkContainment: jest.fn()
    };
    
    mockPublisher = {
      getPublisherProfile: jest.fn(),
      getPublisherCountryWeights: jest.fn()
    };
    
    service = new DisambiguationService(mockGazetteer, mockPublisher);
  });
  
  test('returns candidates from exact match', async () => {
    mockGazetteer.findCandidatesByExactName.mockReturnValue([
      { placeId: 1, name: 'London', countryIso2: 'GB' },
      { placeId: 2, name: 'London', countryIso2: 'CA' }
    ]);
    
    const result = await service.findCandidates('London');
    
    expect(result).toHaveLength(2);
    expect(mockGazetteer.findCandidatesByExactName).toHaveBeenCalledWith('london');
  });
});
```

---

## Code Examples in This Book

Throughout this book, you'll see code examples that show SQL queries. **These examples illustrate the queries that should be encapsulated inside adapter methods**, not placed in service code.

When you see:
```javascript
const candidates = db.all(`
  SELECT * FROM places WHERE name_norm = ?
`, [nameNorm]);
```

Implement it as:
```javascript
// In GazetteerAdapter
findCandidatesByExactName(nameNorm) {
  return this.db.all(`
    SELECT * FROM places WHERE name_norm = ?
  `, [nameNorm]);
}

// In service
const candidates = this.gazetteer.findCandidatesByExactName(nameNorm);
```

---

## Directory Structure

```
src/
├── db/
│   ├── index.js                    # Database factory
│   ├── adapters/
│   │   ├── GazetteerAdapter.js     # All gazetteer SQL
│   │   ├── PublisherAdapter.js     # All publisher SQL
│   │   └── __tests__/              # Adapter integration tests
│   └── sqlite/
│       └── ...                     # SQLite-specific implementation
│
├── gazetteer/
│   ├── index.js                    # Service exports
│   ├── DisambiguationService.js    # Business logic (NO SQL)
│   ├── CandidateGenerator.js       # Uses adapter (NO SQL)
│   ├── FeatureEngine.js            # Uses adapter (NO SQL)
│   ├── Scorer.js                   # Pure computation (NO SQL)
│   ├── CoherencePass.js            # Uses adapter (NO SQL)
│   ├── factory.js                  # Wires adapters to services
│   └── __tests__/                  # Unit tests with mock adapters
│
└── ...
```

---

## Checklist: Before Committing Code

- [ ] No `db.all()`, `db.run()`, `db.get()` calls in service files
- [ ] All SQL lives in `src/db/adapters/*.js`
- [ ] Adapter methods return plain JavaScript objects
- [ ] Services receive adapters via constructor injection
- [ ] Unit tests use mock adapters, not real databases
- [ ] Integration tests verify adapters against real database

---

*This principle applies to ALL database access in the disambiguation system. When in doubt, add an adapter method.*

---

*Next: [Chapter 1 — Why Place Names Are Hard](./01-why-place-names-are-hard.md)*
