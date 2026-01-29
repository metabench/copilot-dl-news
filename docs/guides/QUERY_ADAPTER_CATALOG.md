# Query Adapter Catalog

> A comprehensive index of all database query adapters in the copilot-dl-news codebase.

## Overview

All SQL queries live in the **database adapter layer** (`src/db/sqlite/v1/queries/`), never in UI controls or services. This separation ensures:

- **Single source of truth** for database interactions
- **Easier testing** through mock adapters
- **Clear responsibility** boundaries
- **Consistent patterns** across the codebase

## Adapter Categories

### 1. UI-Specific Query Adapters

These adapters serve specific UI components and are named with a `UiQueries` suffix.

| Adapter | File | Purpose | Primary UI Consumer |
|---------|------|---------|---------------------|
| placeHubGuessingUiQueries | `placeHubGuessingUiQueries.js` | Place hub matrix data, cell details | PlaceHubGuessingMatrixControl |
| topicHubGuessingUiQueries | `topicHubGuessingUiQueries.js` | Topic hub matrix data | TopicHubGuessingMatrixControl |
| nonGeoTopicSlugsUiQueries | `nonGeoTopicSlugsUiQueries.js` | Non-geographic topic slugs | NonGeoTopicSlugsControl |
| crawlObserverUiQueries | `crawlObserverUiQueries.js` | Crawl monitoring dashboard | CrawlObserverControl |
| articleViewer | `ui/articleViewer.js` | Article detail views | ArticleViewerControl |

### 2. Core Data Adapters

Named with an `Adapter` suffix, these provide CRUD operations for core entities.

| Adapter | File | Purpose | Key Functions |
|---------|------|---------|---------------|
| articlesAdapter | `articlesAdapter.js` | Article storage/retrieval | getById, getByUrl, upsert |
| adminAdapter | `adminAdapter.js` | Admin operations | getStats, cleanup |
| alertAdapter | `alertAdapter.js` | Alert management | create, dismiss, list |
| apiKeyAdapter | `apiKeyAdapter.js` | API key management | validate, rotate |
| billingAdapter | `billingAdapter.js` | Usage billing | recordUsage, getUsage |
| coverageAdapter | `coverageAdapter.js` | Coverage tracking | getCoverage, updateCoverage |
| healingAdapter | `healingAdapter.js` | Self-healing operations | recordFailure, heal |
| integrationAdapter | `integrationAdapter.js` | External integrations | sync, getStatus |
| layoutAdapter | `layoutAdapter.js` | Page layout analysis | getLayout, saveLayout |
| pushAdapter | `pushAdapter.js` | Push notifications | send, register |
| recommendationAdapter | `recommendationAdapter.js` | Content recommendations | getRecommendations |
| scheduleAdapter | `scheduleAdapter.js` | Scheduled tasks | schedule, getNext |
| searchAdapter | `searchAdapter.js` | Full-text search | search, index |
| sentimentAdapter | `sentimentAdapter.js` | Sentiment analysis | analyze, getScores |
| similarityAdapter | `similarityAdapter.js` | Content similarity | findSimilar |
| summaryAdapter | `summaryAdapter.js` | Article summaries | summarize, getSummary |
| tagAdapter | `tagAdapter.js` | Tag management | tag, getTags |
| templateReviewAdapter | `templateReviewAdapter.js` | Template review queue | queue, review |
| topicAdapter | `topicAdapter.js` | Topic classification | classify, getTopics |
| trustAdapter | `trustAdapter.js` | Source trust scores | getScore, updateScore |
| userAdapter | `userAdapter.js` | User management | create, authenticate |
| workspaceAdapter | `workspaceAdapter.js` | Workspace config | get, save |

### 3. Feature-Specific Adapters

Adapters for specific features or subsystems.

| Adapter | File | Purpose | Key Functions |
|---------|------|---------|---------------|
| placePageMappings | `placePageMappings.js` | Place-URL mappings | upsert, getVerifiedHubs, updateHubDepthCheck |
| placeHubs | `placeHubs.js` | Place hub operations | getHub, createHub |
| placeHubs.crawlTool | `placeHubs.crawlTool.js` | Crawl tool integration | getCrawlTargets |
| patternLearning | `patternLearning.js` | URL pattern learning | learn, getPatterns |
| layoutMasks | `layoutMasks.js` | Layout extraction masks | getMask, saveMask |
| layoutSignatures | `layoutSignatures.js` | Layout fingerprinting | getSignature, compare |
| layoutTemplates | `layoutTemplates.js` | Template definitions | getTemplate, save |
| articleXPathPatterns | `articleXPathPatterns.js` | XPath extraction | getPatterns, save |
| multiLanguagePlaces | `multiLanguagePlaces.js` | Multi-language place names | getNames, translate |
| multiModalCrawl | `multiModalCrawl.js` | Multi-modal crawling | schedule, getStatus |

### 4. Gazetteer Adapters

Specialized adapters for geographic data.

| Adapter | File | Purpose | Key Functions |
|---------|------|---------|---------------|
| gazetteer.places | `gazetteer.places.js` | Place CRUD | getPlace, upsert |
| gazetteer.names | `gazetteer.names.js` | Place name variants | getNames, addName |
| gazetteer.search | `gazetteer.search.js` | Place search | search, fuzzyMatch |
| gazetteer.attributes | `gazetteer.attributes.js` | Place attributes | getPopulation, getAdmin |
| gazetteer.progress | `gazetteer.progress.js` | Import progress | getProgress, update |
| gazetteer.utils | `gazetteer.utils.js` | Utility functions | normalizeSlug |
| gazetteer.ingest | `gazetteer.ingest.js` | Data ingestion | ingest, validate |
| gazetteer.export | `gazetteer.export.js` | Data export | export, stream |
| gazetteer.osm | `gazetteer.osm.js` | OSM integration | import, sync |
| gazetteer.deduplication | `gazetteer.deduplication.js` | Duplicate detection | findDupes, merge |
| gazetteer.duplicates | `gazetteer.duplicates.js` | Duplicate management | list, resolve |
| gazetteer.populateTool | `gazetteer.populateTool.js` | Population tool | populate |
| gazetteerPlaceNames | `gazetteerPlaceNames.js` | Place name queries | getByLanguage |

### 5. Analysis Adapters

Adapters for content analysis workflows.

| Adapter | File | Purpose | Key Functions |
|---------|------|---------|---------------|
| analysisRuns | `analysisRuns.js` | Analysis job tracking | start, complete, getStatus |
| analysis.analysePagesCore | `analysis.analysePagesCore.js` | Core page analysis | analyze, getResults |
| analysis.showAnalysis | `analysis.showAnalysis.js` | Analysis visualization | getForDisplay |
| guessPlaceHubsQueries | `guessPlaceHubsQueries.js` | Hub guessing logic | guess, confirm |

### 6. Infrastructure Adapters

Adapters for system infrastructure.

| Adapter | File | Purpose | Key Functions |
|---------|------|---------|---------------|
| backgroundTasks | `backgroundTasks.js` | Background job queue | enqueue, getNext, complete |
| crawlSkipTerms | `crawlSkipTerms.js` | URL skip patterns | getSkipTerms, add |
| maintenance | `maintenance.js` | Database maintenance | vacuum, analyze |
| telemetry | `telemetry.js` | Usage telemetry | record, getMetrics |
| compression | `compression.js` | Content compression | compress, decompress |
| schema | `schema.js` | Schema management | migrate, getVersion |
| common | `common.js` | Shared utilities | paginate, escape |
| helpers | `helpers.js` | Query helpers | formatDate, buildWhere |
| pages.export | `pages.export.js` | Page export | export, stream |
| articles.backfillDates | `articles.backfillDates.js` | Date backfill | backfill, getNeeding |

## Usage Patterns

### Correct: Query in Adapter

```javascript
// src/db/sqlite/v1/queries/placeHubGuessingUiQueries.js
function getMatrixData(db, { parentPlaceId, hostIds, limit }) {
  const rows = db.prepare(`
    SELECT m.id, m.host, m.path, m.status, m.max_page_depth,
           p.name as place_name, p.admin1_code
    FROM place_page_mappings m
    JOIN places p ON p.id = m.place_id
    WHERE m.parent_place_id = ?
      AND m.host IN (${hostIds.map(() => '?').join(',')})
    ORDER BY p.population DESC
    LIMIT ?
  `).all(parentPlaceId, ...hostIds, limit);

  return rows;
}

module.exports = { getMatrixData };
```

### Correct: UI Control Uses Adapter

```javascript
// src/ui/server/placeHubGuessing/controls/PlaceHubGuessingMatrixControl.js
const { getMatrixData } = require('../../../db/sqlite/v1/queries/placeHubGuessingUiQueries');

class PlaceHubGuessingMatrixControl extends jsgui.Control {
  constructor(spec) {
    super(spec);
    this.db = spec.db;
    this._loadData();
    this.compose();
  }

  _loadData() {
    // Query through adapter - NO SQL in control
    this._matrixData = getMatrixData(this.db, {
      parentPlaceId: this._parentPlaceId,
      hostIds: this._hostIds,
      limit: 500
    });
  }
}
```

### Wrong: SQL in UI Control

```javascript
// ❌ DON'T DO THIS
class BadControl extends jsgui.Control {
  _loadData() {
    // SQL directly in control - violates adapter pattern!
    this._data = this.db.prepare(`
      SELECT * FROM articles WHERE host = ?
    `).all(this._host);
  }
}
```

## Creating New Adapters

### Naming Convention

| Type | Pattern | Example |
|------|---------|---------|
| UI queries | `{feature}UiQueries.js` | `articleListUiQueries.js` |
| Core entity | `{entity}Adapter.js` | `commentAdapter.js` |
| Feature | `{feature}.js` | `contentFiltering.js` |
| Subsystem | `{subsystem}.{feature}.js` | `gazetteer.validation.js` |

### Template

```javascript
/**
 * @file {featureName}Adapter.js
 * @description Database adapter for {feature description}
 */
'use strict';

/**
 * Get {entity} by ID
 * @param {Database} db - SQLite database instance
 * @param {number} id - Entity ID
 * @returns {Object|undefined} Entity or undefined
 */
function getById(db, id) {
  return db.prepare(`
    SELECT * FROM {table} WHERE id = ?
  `).get(id);
}

/**
 * List {entities} with pagination
 * @param {Database} db - SQLite database instance
 * @param {Object} options - Query options
 * @param {number} [options.limit=50] - Max results
 * @param {number} [options.offset=0] - Offset for pagination
 * @returns {Object[]} Array of entities
 */
function list(db, { limit = 50, offset = 0 } = {}) {
  return db.prepare(`
    SELECT * FROM {table}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
}

/**
 * Upsert {entity}
 * @param {Database} db - SQLite database instance
 * @param {Object} data - Entity data
 * @returns {Object} Upsert result with lastInsertRowid
 */
function upsert(db, data) {
  return db.prepare(`
    INSERT INTO {table} (col1, col2, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(unique_col) DO UPDATE SET
      col1 = excluded.col1,
      col2 = excluded.col2,
      updated_at = datetime('now')
  `).run(data.col1, data.col2);
}

module.exports = {
  getById,
  list,
  upsert
};
```

## Testing Adapters

```javascript
// tests/db/adapters/myAdapter.test.js
const Database = require('better-sqlite3');
const { getById, upsert } = require('../../../src/db/sqlite/v1/queries/myAdapter');

describe('myAdapter', () => {
  let db;

  beforeAll(() => {
    db = new Database(':memory:');
    // Apply schema
    db.exec(`CREATE TABLE mytable (...)`);
  });

  afterAll(() => {
    db.close();
  });

  test('upsert creates new record', () => {
    const result = upsert(db, { col1: 'value1', col2: 'value2' });
    expect(result.changes).toBe(1);

    const row = getById(db, result.lastInsertRowid);
    expect(row.col1).toBe('value1');
  });
});
```

## Hub Archive Queries

Special queries for the hub archive system:

| Function | File | Purpose |
|----------|------|---------|
| `getVerifiedHubsForArchive` | placePageMappings.js | Get hubs ready for archive |
| `updateHubDepthCheck` | placePageMappings.js | Update depth probe results |
| `getArchiveCrawlStats` | placePageMappings.js | Get archive coverage stats |
| `getHubsNeedingArchive` | placePageMappings.js | Get hubs with depth but no crawl |

Example usage:

```javascript
const { getVerifiedHubsForArchive, updateHubDepthCheck } = require('./queries/placePageMappings');

// Get hubs needing depth check
const hubs = getVerifiedHubsForArchive(db, {
  host: 'theguardian.com',
  needsDepthCheck: true,
  depthCheckMaxAgeHours: 168,
  limit: 50
});

// Update after probing
updateHubDepthCheck(db, {
  id: hub.id,
  maxPageDepth: 1924,
  oldestContentDate: '2000-01-15'
});
```

---

*This catalog is part of the copilot-dl-news documentation. For updates, see the project repository.*
