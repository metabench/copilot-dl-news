# Hub Extensibility Implementation Plan

**When to Read**: After reviewing `HUB_EXTENSIBILITY_REVIEW.md`, before implementing topic hubs, place-topic combinations, or place-place relationships.

**Date**: October 31, 2025  
**Purpose**: Detailed implementation plan for extending hub guessing system to support new hub types.

---

## Overview

This document provides concrete implementation steps for extending the place hub guessing system to support:
1. **Topic Hubs** - Pure topic hubs (e.g., `/sport`, `/politics`)
2. **Place-Topic Combinations** - Combined hubs (e.g., `/world/france/politics`, `/sport/iceland`)
3. **Place-Place Relationships** - Hierarchical and cross-location hubs (e.g., `/us/california`, `/us-canada-border`)

**Implementation Strategy**: Phased approach, building on existing infrastructure.

---

## Phase 1: Topic Hub Support

**Objective**: Enable discovery and validation of pure topic hubs.

**Duration**: 8-12 hours  
**Complexity**: Moderate  
**Dependencies**: None  
**Value**: High (expands coverage beyond geography)

### 1.1 Create TopicHubGapAnalyzer Service

**File**: `src/services/TopicHubGapAnalyzer.js` (NEW)

**Implementation**:

```javascript
'use strict';

const HubGapAnalyzerBase = require('./HubGapAnalyzerBase');
const { slugify } = require('../tools/slugify');

/**
 * TopicHubGapAnalyzer - URL prediction for topic hubs
 * 
 * Generates candidate URLs for topic-based hubs like:
 * - /sport, /politics, /culture
 * - /news/politics, /section/opinion
 * 
 * Uses topic_keywords table for entity list and DSPL patterns.
 */
class TopicHubGapAnalyzer extends HubGapAnalyzerBase {
  constructor({ db, logger, dsplDir } = {}) {
    super({ db, logger, dsplDir });
    this.topicCache = null;
    this.cacheExpiry = 0;
    this.cacheDurationMs = 60000; // 1 minute
  }
  
  /**
   * Topic label for DSPL lookups and logging
   */
  getEntityLabel() {
    return 'topic';
  }
  
  /**
   * Fallback patterns for topic hubs
   */
  getFallbackPatterns() {
    return [
      '/{slug}',                    // /sport, /politics
      '/news/{slug}',               // /news/politics
      '/{slug}-news',               // /sport-news
      '/section/{slug}',            // /section/opinion
      '/topics/{slug}',             // /topics/technology
      '/{category}/{slug}',         // /lifestyle/culture
      '/world/{slug}',              // /world/politics (topic-only, not place)
      '/{slug}/all'                 // /sport/all
    ];
  }
  
  /**
   * Build metadata for pattern substitution
   */
  buildEntityMetadata(topic) {
    if (!topic || !topic.slug) return null;
    
    return {
      slug: topic.slug,
      name: topic.name || topic.slug,
      category: topic.category || 'general',
      lang: topic.lang || 'en'
    };
  }
  
  /**
   * Get top topics by importance/frequency
   * @param {number} limit - Maximum topics to return
   * @returns {Array<Object>} Topic entities
   */
  getTopTopics(limit = 20) {
    const now = Date.now();
    if (this.topicCache && now < this.cacheExpiry) {
      return this.topicCache.slice(0, limit);
    }
    
    // Load from topic_keywords table (English topics)
    const rows = this.db.prepare(`
      SELECT DISTINCT term AS name, lang
      FROM topic_keywords
      WHERE lang = 'en'
      ORDER BY term
    `).all();
    
    // Augment with hardcoded categories for common topics
    const categoryMap = {
      'sport': 'news',
      'sports': 'news',
      'politics': 'news',
      'business': 'news',
      'technology': 'news',
      'science': 'news',
      'health': 'lifestyle',
      'culture': 'lifestyle',
      'opinion': 'opinion',
      'commentisfree': 'opinion',
      'lifestyle': 'lifestyle',
      'lifeandstyle': 'lifestyle',
      'environment': 'news',
      'education': 'news',
      'media': 'news',
      'society': 'news',
      'law': 'news',
      'scotland': 'regional',
      'world': 'news',
      'uk-news': 'news',
      'us-news': 'news',
      'australia-news': 'news'
    };
    
    const topics = rows.map(row => {
      const slug = slugify(row.name);
      return {
        name: row.name,
        slug,
        category: categoryMap[slug] || 'general',
        lang: row.lang || 'en'
      };
    });
    
    this.topicCache = topics;
    this.cacheExpiry = now + this.cacheDurationMs;
    
    return topics.slice(0, limit);
  }
  
  /**
   * Predict topic hub URLs for a domain
   * @param {string} domain - Target domain
   * @param {Object} topic - Topic entity
   * @returns {Array<Object>} Predictions with { url, confidence, source, ... }
   */
  predictTopicHubUrls(domain, topic) {
    if (!domain || !topic) return [];
    
    const baseUrls = this.predictHubUrls(domain, topic);
    
    // Convert to prediction objects with metadata
    return baseUrls.map(url => ({
      url,
      confidence: 0.7, // Lower than place hubs (less reliable)
      source: 'topic-analyzer',
      topic: {
        slug: topic.slug,
        name: topic.name,
        category: topic.category
      }
    }));
  }
}

module.exports = TopicHubGapAnalyzer;
```

**Tests**: `src/services/__tests__/TopicHubGapAnalyzer.test.js`

```javascript
const TopicHubGapAnalyzer = require('../TopicHubGapAnalyzer');
const { createTempDb } = require('../../test-utils/tempDb');

describe('TopicHubGapAnalyzer', () => {
  let db, analyzer;
  
  beforeEach(() => {
    db = createTempDb();
    
    // Seed topic_keywords
    db.prepare(`
      INSERT INTO topic_keywords (term, lang, category)
      VALUES ('sport', 'en', 'news'), ('politics', 'en', 'news')
    `).run();
    
    analyzer = new TopicHubGapAnalyzer({ db });
  });
  
  afterEach(() => {
    db.close();
  });
  
  test('getTopTopics returns topic entities', () => {
    const topics = analyzer.getTopTopics(10);
    
    expect(topics.length).toBeGreaterThan(0);
    expect(topics[0]).toHaveProperty('slug');
    expect(topics[0]).toHaveProperty('name');
    expect(topics[0]).toHaveProperty('category');
  });
  
  test('predictTopicHubUrls generates candidate URLs', () => {
    const topic = { slug: 'sport', name: 'Sport', category: 'news' };
    const predictions = analyzer.predictTopicHubUrls('theguardian.com', topic);
    
    expect(predictions.length).toBeGreaterThan(0);
    expect(predictions[0].url).toContain('theguardian.com');
    expect(predictions[0].url).toContain('sport');
    expect(predictions[0].confidence).toBe(0.7);
  });
});
```

### 1.2 Extend Orchestration Layer

**File**: `src/orchestration/placeHubGuessing.js`

**Changes**:

1. **Add topic options parsing** (after line 603):

```javascript
// Current
const kinds = Array.isArray(options.kinds) ? [...options.kinds] : ['country'];

// Add after
const topics = Array.isArray(options.topics) && options.topics.length 
  ? [...options.topics] 
  : [];
const processTopics = topics.length > 0 || options.enableTopicDiscovery || false;
```

2. **Add selectTopics() helper** (after selectPlaces(), around line 405):

```javascript
/**
 * Select topics to evaluate based on analyzer and configuration
 */
function selectTopics(topicAnalyzer, requestedTopics, limit) {
  if (!topicAnalyzer) {
    return { topics: [], unsupported: requestedTopics };
  }
  
  if (!requestedTopics || requestedTopics.length === 0) {
    // Get all topics if none specified
    const allTopics = topicAnalyzer.getTopTopics(limit || 20);
    return { topics: allTopics, unsupported: [] };
  }
  
  // Filter to requested topics
  const allTopics = topicAnalyzer.getTopTopics(100);
  const topicMap = new Map(allTopics.map(t => [t.slug, t]));
  
  const selected = [];
  const unsupported = [];
  
  for (const requestedSlug of requestedTopics) {
    const normalized = slugify(requestedSlug);
    if (topicMap.has(normalized)) {
      selected.push(topicMap.get(normalized));
    } else {
      unsupported.push(requestedSlug);
    }
  }
  
  return { topics: selected, unsupported };
}
```

3. **Add topic processing loop** (after place processing, around line 1080):

```javascript
// After place hub processing completes...

// Process topic hubs if enabled
if (processTopics) {
  const { topics: selectedTopics, unsupported: unsupportedTopics } = selectTopics(
    analyzers.topic,
    topics,
    options.limit
  );
  
  summary.unsupportedTopics = unsupportedTopics;
  summary.totalTopics = selectedTopics.length;
  
  for (const topic of selectedTopics) {
    if (rateLimitTriggered) break;
    
    const predictions = analyzers.topic.predictTopicHubUrls(normalizedDomain.host, topic);
    
    for (const prediction of predictions.slice(0, patternLimit)) {
      if (rateLimitTriggered) break;
      
      const candidateUrl = prediction.url;
      summary.totalUrls += 1;
      
      const attemptId = `topic:${topic.slug}:${++attemptCounter}`;
      const attemptStartedAt = new Date().toISOString();
      
      // Save candidate
      stores.candidates?.saveCandidate?.({
        domain: normalizedDomain.host,
        candidateUrl,
        normalizedUrl: candidateUrl,
        placeKind: null,
        placeName: null,
        placeCode: null,
        analyzer: 'topic',
        strategy: 'topic-hub',
        score: prediction.confidence,
        confidence: prediction.confidence,
        pattern: null,
        signals: JSON.stringify({
          topic: {
            slug: topic.slug,
            name: topic.name,
            category: topic.category
          },
          attempt: { id: attemptId }
        }),
        attemptId,
        attemptStartedAt,
        status: 'pending',
        validationStatus: null,
        source: 'guess-topic-hubs',
        lastSeenAt: attemptStartedAt
      });
      
      // Check cache
      const latestFetch = queries.getLatestFetch(candidateUrl);
      const ageMs = computeAgeMs(latestFetch, nowMs);
      
      if (latestFetch && latestFetch.http_status >= 200 && latestFetch.http_status < 300 && ageMs < maxAgeMs) {
        summary.cached += 1;
        continue;
      }
      
      if (latestFetch && latestFetch.http_status === 404 && ageMs < refresh404Ms) {
        summary.skipped += 1;
        continue;
      }
      
      // Fetch URL
      let result;
      try {
        result = await fetchUrl(candidateUrl, fetchFn, { logger, timeoutMs: 15000 });
        summary.fetched += 1;
        
        const fetchRow = createFetchRow(result, normalizedDomain.host);
        recordFetch(fetchRow, { stage: 'GET', attemptId, cacheHit: false });
        
        stores.candidates?.markStatus?.({
          domain: normalizedDomain.host,
          candidateUrl,
          status: result.ok ? 'fetched-ok' : 'fetched-error',
          httpStatus: result.status,
          lastSeenAt: attemptStartedAt
        });
        
        if (result.status === 404) {
          summary.stored404 += 1;
          continue;
        }
        
        if (result.status === 429) {
          summary.rateLimited += 1;
          rateLimitTriggered = true;
          recordDecision({
            stage: 'FETCH',
            status: 429,
            outcome: 'rate-limited',
            level: 'warn',
            message: `Rate limited on ${candidateUrl}; aborting further fetches.`
          });
          break;
        }
        
        if (!result.ok) {
          summary.errors += 1;
          continue;
        }
        
        // Validate topic hub
        const validationResult = validator.validateTopicHub(result.body, {
          expectedTopic: topic,
          domain: normalizedDomain.host
        });
        
        stores.candidates?.updateValidation?.({
          domain: normalizedDomain.host,
          candidateUrl,
          validationStatus: validationResult.isValid ? 'validated' : 'validation-failed',
          validationScore: validationResult.confidence || null,
          validationDetails: validationResult,
          signals: JSON.stringify({
            topic: {
              slug: topic.slug,
              name: topic.name,
              category: topic.category
            },
            attempt: { id: attemptId },
            validation: validationResult
          }),
          lastSeenAt: attemptStartedAt
        });
        
        if (validationResult.isValid) {
          summary.validationSucceeded += 1;
          
          if (apply) {
            const existingHub = queries.getPlaceHub(normalizedDomain.host, candidateUrl);
            const snapshot = {
              url: candidateUrl,
              domain: normalizedDomain.host,
              placeSlug: null,
              placeKind: null,
              topicSlug: topic.slug,
              topicLabel: topic.name,
              topicKind: topic.category,
              title: extractTitle(result.body),
              navLinksCount: validationResult.navLinkCount || 0,
              articleLinksCount: validationResult.articleLinkCount || 0,
              evidence: JSON.stringify({
                topic: {
                  slug: topic.slug,
                  name: topic.name,
                  category: topic.category
                },
                validation: validationResult
              })
            };
            
            if (!existingHub) {
              queries.insertPlaceHub(snapshot); // Note: table name stays "place_hubs" for now
              summary.insertedHubs += 1;
              summary.diffPreview.inserted.push({
                url: candidateUrl,
                topicSlug: topic.slug,
                topicName: topic.name,
                status: 'validated'
              });
            } else {
              const changes = collectHubChanges(existingHub, snapshot);
              if (changes.length > 0) {
                queries.updatePlaceHub(snapshot);
                summary.updatedHubs += 1;
                summary.diffPreview.updated.push({
                  url: candidateUrl,
                  topicSlug: topic.slug,
                  topicName: topic.name,
                  changes
                });
              }
            }
          }
        } else {
          summary.validationFailed += 1;
          const failureReason = validationResult.reason || 'unknown';
          summary.validationFailureReasons[failureReason] =
            (summary.validationFailureReasons[failureReason] || 0) + 1;
        }
        
      } catch (fetchError) {
        summary.errors += 1;
        stores.candidates?.markStatus?.({
          domain: normalizedDomain.host,
          candidateUrl,
          status: 'fetch-error',
          errorMessage: fetchError.message || String(fetchError),
          lastSeenAt: attemptStartedAt
        });
        
        recordDecision({
          stage: 'FETCH',
          status: null,
          outcome: 'error',
          level: 'error',
          message: `Failed to fetch ${candidateUrl}: ${fetchError.message || fetchError}`
        });
      }
    }
  }
}
```

4. **Update summary structure** (line 617):

```javascript
const summary = {
  domain: normalizedDomain.host,
  totalPlaces: 0,
  totalTopics: 0,  // ADD THIS
  totalUrls: 0,
  // ... rest unchanged
  unsupportedKinds: [],
  unsupportedTopics: [],  // ADD THIS
  // ... rest unchanged
};
```

5. **Update documentation** (JSDoc for `guessPlaceHubsForDomain()`, line 547):

```javascript
/**
 * Guess place hubs and/or topic hubs for a single domain
 * 
 * @param {Object} options - Guessing options
 * @param {string} options.domain - Domain to process
 * @param {string} [options.scheme='https'] - URL scheme
 * @param {string[]} [options.kinds=['country']] - Place kinds
 * @param {string[]} [options.topics=[]] - Topic slugs (empty = all topics if enableTopicDiscovery=true)
 * @param {boolean} [options.enableTopicDiscovery=false] - Enable topic hub discovery
 * @param {number} [options.limit] - Entity limit per kind/topic
 * // ... rest unchanged
 */
```

### 1.3 Update Dependencies Injection

**File**: `src/orchestration/dependencies.js`

**Changes**:

```javascript
// Add import (after line 12)
const TopicHubGapAnalyzer = require('../services/TopicHubGapAnalyzer');

// Update createPlaceHubDependencies() (around line 75)
function createPlaceHubDependencies(options = {}) {
  // ... existing code ...
  
  // Add after existing analyzers (around line 75)
  const topicAnalyzer = options.topicAnalyzer || new TopicHubGapAnalyzer({
    db,
    logger,
    dsplDir: path.join(__dirname, '..', '..', 'data', 'dspls')
  });
  
  return {
    db,
    newsDb,
    queries,
    analyzers: {
      country: countryAnalyzer,
      region: regionAnalyzer,
      city: cityAnalyzer,
      topic: topicAnalyzer  // ADD THIS
    },
    // ... rest unchanged
  };
}
```

### 1.4 Extend HubValidator for Topic Hubs

**File**: `src/hub-validation/HubValidator.js`

**Changes**: Already implemented (lines 397-421)! Just needs minor refinement:

```javascript
/**
 * Validate if a title/URL combination represents a topic hub
 * Extended validation with content checks
 * @param {string|Buffer} html - Page HTML content
 * @param {Object} options - Validation options
 * @param {Object} options.expectedTopic - Expected topic object { slug, name, category }
 * @param {string} options.domain - Domain being validated
 * @returns {Object} - { isValid: boolean, reason: string, navLinkCount?: number, ... }
 */
validateTopicHub(html, options = {}) {
  const { expectedTopic, domain } = options;
  const htmlStr = bufferToString(html);
  
  if (!htmlStr) {
    return {
      isValid: false,
      reason: 'No HTML content provided',
      expectedTopic
    };
  }
  
  // Extract title from HTML
  const title = this.extractTitle(htmlStr);
  if (!title) {
    return {
      isValid: false,
      reason: 'No title found in HTML',
      expectedTopic
    };
  }
  
  // Check if title contains topic name
  const titleLower = title.toLowerCase();
  const topicNameLower = (expectedTopic?.name || expectedTopic?.slug || '').toLowerCase();
  
  if (!titleLower.includes(topicNameLower)) {
    return {
      isValid: false,
      reason: `Title does not contain topic name "${expectedTopic?.name || expectedTopic?.slug}"`,
      title,
      expectedTopic
    };
  }
  
  // Count links (topic hubs should have many article links)
  const navLinkCount = countLinks(htmlStr);
  if (navLinkCount < 10) {
    return {
      isValid: false,
      reason: `Too few links (${navLinkCount}) - likely not a hub page`,
      navLinkCount,
      title,
      expectedTopic
    };
  }
  
  // Check for news-specific indicators in title (good sign for topic hubs)
  const newsIndicators = ['news', 'latest', 'breaking', 'updates'];
  const hasNewsIndicator = newsIndicators.some(indicator => titleLower.includes(indicator));
  
  return {
    isValid: true,
    reason: 'Validated as topic hub',
    title,
    navLinkCount,
    hasNewsIndicator,
    confidence: hasNewsIndicator ? 0.9 : 0.7,
    expectedTopic
  };
}
```

### 1.5 Extend API Layer

**File**: `src/api/routes/place-hubs.js`

**Changes**:

1. **Update request validation** (around line 91):

```javascript
// Current
const validKinds = ['country', 'region', 'city'];
if (Array.isArray(kinds)) {
  const invalidKinds = kinds.filter(k => !validKinds.includes(k));
  if (invalidKinds.length > 0) {
    return res.status(400).json({
      error: 'Invalid kinds',
      invalidKinds,
      validKinds
    });
  }
}

// Add after
const topics = Array.isArray(req.body.topics) ? req.body.topics : [];
const enableTopicDiscovery = Boolean(req.body.enableTopicDiscovery);

if (topics.length > 0 || enableTopicDiscovery) {
  logger.info(`[place-hubs] Topic discovery enabled: ${topics.length} explicit topics, auto-discovery=${enableTopicDiscovery}`);
}
```

2. **Pass topics to orchestration** (around line 115):

```javascript
const result = await guessPlaceHubsBatch({
  domainBatch: entries,
  apply: Boolean(req.body.apply),
  kinds,
  topics,  // ADD THIS
  enableTopicDiscovery,  // ADD THIS
  limit: req.body.limit,
  patternsPerPlace: req.body.patternsPerPlace || 3,
  // ... rest unchanged
}, deps);
```

3. **Update OpenAPI spec** (`src/api/openapi.yaml`):

```yaml
# Add to POST /api/place-hubs/guess request body
topics:
  type: array
  items:
    type: string
  description: "Topic slugs to discover (e.g., ['sport', 'politics']). Empty array means no topics unless enableTopicDiscovery=true."
  example: ["sport", "politics"]
enableTopicDiscovery:
  type: boolean
  description: "Enable automatic topic hub discovery. If true, discovers all available topics."
  default: false
```

### 1.6 Add Integration Tests

**File**: `src/orchestration/__tests__/placeHubGuessing.test.js`

**Add test**:

```javascript
test('discovers topic hubs when enableTopicDiscovery=true', async () => {
  const deps = createPlaceHubDependencies({ dbPath: db.name });
  
  // Seed topic_keywords
  db.prepare(`
    INSERT INTO topic_keywords (term, lang, category)
    VALUES ('sport', 'en', 'news')
  `).run();
  
  const result = await guessPlaceHubsForDomain({
    domain: 'example.com',
    topics: [],
    enableTopicDiscovery: true,
    apply: false,
    limit: 1
  }, deps);
  
  expect(result).toBeTruthy();
  expect(result.totalTopics).toBeGreaterThan(0);
  expect(result.totalUrls).toBeGreaterThan(0);
  expect(result.decisions.length).toBeGreaterThan(0);
}, 30000);
```

### 1.7 Update DSPL Format

**Files**: `data/dspls/*.json`

**Add topic hub patterns**:

```json
{
  "domain": "theguardian.com",
  "verified": true,
  "countryHubPatterns": [
    { "pattern": "/world/{slug}", "verified": true }
  ],
  "regionHubPatterns": [],
  "cityHubPatterns": [],
  "topicHubPatterns": [
    { "pattern": "/{slug}", "verified": true },
    { "pattern": "/news/{slug}", "verified": false }
  ]
}
```

---

## Phase 2: Place-Topic Combination Support

**Objective**: Enable discovery of place+topic combination hubs.

**Duration**: 12-16 hours  
**Complexity**: Moderate-High  
**Dependencies**: Phase 1 (Topic Hub Support)  
**Value**: Very High (common pattern on news sites)

### 2.1 Create PlaceTopicHubGapAnalyzer

**File**: `src/services/PlaceTopicHubGapAnalyzer.js` (NEW)

```javascript
'use strict';

const HubGapAnalyzerBase = require('./HubGapAnalyzerBase');

/**
 * PlaceTopicHubGapAnalyzer - URL prediction for place+topic combinations
 * 
 * Generates candidate URLs for combined hubs like:
 * - /world/france/politics (world context + place + topic)
 * - /sport/iceland (topic context + place)
 * - /us/california/business (hierarchical place + topic)
 */
class PlaceTopicHubGapAnalyzer extends HubGapAnalyzerBase {
  constructor({ db, logger, dsplDir } = {}) {
    super({ db, logger, dsplDir });
  }
  
  getEntityLabel() {
    return 'place-topic';
  }
  
  getFallbackPatterns() {
    return [
      // Topic-first patterns
      '/{topic}/{place}',                    // /sport/iceland
      '/news/{topic}/{place}',               // /news/politics/france
      '/{topic}/news/{place}',               // /sport/news/iceland
      
      // Place-first patterns
      '/world/{place}/{topic}',              // /world/france/politics
      '/news/{place}/{topic}',               // /news/france/politics
      '/{place}/{topic}',                    // /france/politics
      '/{place}-{topic}',                    // /france-politics
      
      // Hierarchical with topic
      '/{parent}/{place}/{topic}',           // /us/california/politics
      '/world/{region}/{place}/{topic}',     // /world/europe/france/business
      
      // Section-based
      '/section/{topic}/{place}',            // /section/sport/australia
      '/{topic}-{place}',                    // /politics-france
      '/{topic}/{place}-news'                // /sport/iceland-news
    ];
  }
  
  buildEntityMetadata(combination) {
    if (!combination || !combination.place || !combination.topic) return null;
    
    const place = combination.place;
    const topic = combination.topic;
    
    return {
      place: place.slug,
      placeSlug: place.slug,
      placeName: place.name,
      placeCode: place.code,
      topic: topic.slug,
      topicSlug: topic.slug,
      topicName: topic.name,
      topicCategory: topic.category,
      parent: place.parent || null,
      region: place.region || null
    };
  }
  
  /**
   * Predict place-topic combination URLs
   * @param {string} domain - Target domain
   * @param {Object} place - Place entity
   * @param {Object} topic - Topic entity
   * @returns {Array<Object>} Predictions with metadata
   */
  predictCombinationUrls(domain, place, topic) {
    if (!domain || !place || !topic) return [];
    
    const combination = { place, topic };
    const baseUrls = this.predictHubUrls(domain, combination);
    
    return baseUrls.map(url => ({
      url,
      confidence: 0.6, // Lower than single-entity hubs (more specific = less common)
      source: 'place-topic-analyzer',
      place: {
        slug: place.slug,
        name: place.name,
        kind: place.kind,
        code: place.code
      },
      topic: {
        slug: topic.slug,
        name: topic.name,
        category: topic.category
      }
    }));
  }
}

module.exports = PlaceTopicHubGapAnalyzer;
```

### 2.2 Integrate placeHubDetector.js into Orchestration

**Context**: `src/tools/placeHubDetector.js` already implements place-topic detection but orchestration doesn't use it.

**Strategy**: Replace inline detection logic with calls to `detectPlaceHub()`.

**File**: `src/orchestration/placeHubGuessing.js`

**Changes**:

1. **Import placeHubDetector** (top of file):

```javascript
const { detectPlaceHub } = require('../tools/placeHubDetector');
const { loadNonGeoTopicSlugs } = require('../tools/nonGeoTopicSlugs');
```

2. **Add detection after fetch** (around line 1020):

```javascript
// After successful fetch and before validation
if (result.ok) {
  // Use placeHubDetector for comprehensive detection
  const gazetteerPlaceNames = queries.getAllPlaceNames ? queries.getAllPlaceNames() : null;
  const nonGeoTopicSlugs = loadNonGeoTopicSlugs(db);
  
  const detection = detectPlaceHub({
    url: candidateUrl,
    title: extractTitle(result.body),
    section: null, // Could extract from metadata
    fetchClassification: 'nav', // Assume navigation page
    navLinksCount: validationMetrics?.navLinkCount,
    articleLinksCount: validationMetrics?.articleLinkCount,
    wordCount: validationMetrics?.wordCount,
    gazetteerPlaceNames,
    nonGeoTopicSlugs: nonGeoTopicSlugs.slugs,
    db
  });
  
  // If detection found a topic, use it
  if (detection && detection.topic) {
    // Update snapshot to include topic
    snapshot.topicSlug = detection.topic.slug;
    snapshot.topicLabel = detection.topic.label;
    snapshot.topicKind = detection.topic.kind;
    
    // Update evidence
    const evidenceObj = JSON.parse(snapshot.evidence || '{}');
    evidenceObj.topic = detection.topic;
    evidenceObj.detection = {
      source: 'placeHubDetector',
      confidence: detection.topic.confidence
    };
    snapshot.evidence = JSON.stringify(evidenceObj);
  }
}
```

3. **Add place-topic combination processing** (new loop after topic processing):

```javascript
// After topic hub processing...

// Process place-topic combinations if enabled
const processCombinations = Boolean(options.includeCombinations);

if (processCombinations && places.length > 0 && selectedTopics.length > 0) {
  summary.totalCombinations = places.length * selectedTopics.length;
  
  for (const place of places) {
    if (rateLimitTriggered) break;
    
    for (const topic of selectedTopics) {
      if (rateLimitTriggered) break;
      
      const predictions = analyzers.placeTopic.predictCombinationUrls(
        normalizedDomain.host,
        place,
        topic
      );
      
      // Process similar to place/topic processing above
      // ... (fetch, validate, store logic)
    }
  }
}
```

### 2.3 Add Combination Validation

**File**: `src/hub-validation/HubValidator.js`

**New method**:

```javascript
/**
 * Validate place-topic combination hub
 * @param {string|Buffer} html - Page HTML content
 * @param {Object} options - Validation options
 * @param {Object} options.expectedPlace - Expected place { name, slug, kind }
 * @param {Object} options.expectedTopic - Expected topic { name, slug, category }
 * @param {string} options.domain - Domain being validated
 * @returns {Object} - { isValid: boolean, reason: string, ... }
 */
validatePlaceTopicHub(html, options = {}) {
  const { expectedPlace, expectedTopic, domain } = options;
  
  // Run both place and topic validation
  const placeResult = this.validatePlaceHub(html, { 
    expectedPlace, 
    domain 
  });
  
  const topicResult = this.validateTopicHub(html, { 
    expectedTopic, 
    domain 
  });
  
  // Both must pass
  if (!placeResult.isValid) {
    return {
      isValid: false,
      reason: `Place validation failed: ${placeResult.reason}`,
      placeResult,
      topicResult,
      combination: { place: expectedPlace, topic: expectedTopic }
    };
  }
  
  if (!topicResult.isValid) {
    return {
      isValid: false,
      reason: `Topic validation failed: ${topicResult.reason}`,
      placeResult,
      topicResult,
      combination: { place: expectedPlace, topic: expectedTopic }
    };
  }
  
  // Additional combination-specific validation
  const htmlStr = bufferToString(html);
  const titleLower = this.extractTitle(htmlStr).toLowerCase();
  
  // Check if both place and topic appear in title
  const placeName = (expectedPlace?.name || '').toLowerCase();
  const topicName = (expectedTopic?.name || expectedTopic?.slug || '').toLowerCase();
  
  const hasPlace = titleLower.includes(placeName);
  const hasTopic = titleLower.includes(topicName);
  
  if (!hasPlace || !hasTopic) {
    return {
      isValid: false,
      reason: `Title missing place or topic (has place: ${hasPlace}, has topic: ${hasTopic})`,
      title: this.extractTitle(htmlStr),
      placeResult,
      topicResult,
      combination: { place: expectedPlace, topic: expectedTopic }
    };
  }
  
  // Check if combination makes semantic sense
  // E.g., /antarctica/local-elections is invalid
  if (this.isInvalidCombination(expectedPlace, expectedTopic)) {
    return {
      isValid: false,
      reason: 'Place-topic combination is semantically invalid',
      invalidReason: this.getInvalidCombinationReason(expectedPlace, expectedTopic),
      placeResult,
      topicResult,
      combination: { place: expectedPlace, topic: expectedTopic }
    };
  }
  
  return {
    isValid: true,
    reason: 'Validated as place-topic combination hub',
    confidence: Math.min(placeResult.confidence || 0.7, topicResult.confidence || 0.7),
    placeResult,
    topicResult,
    combination: { place: expectedPlace, topic: expectedTopic }
  };
}

/**
 * Check if place-topic combination is semantically invalid
 */
isInvalidCombination(place, topic) {
  // Antarctica + local politics = invalid
  if (place?.slug === 'antarctica' && topic?.slug === 'local-elections') {
    return true;
  }
  
  // Add more semantic rules as needed
  // E.g., small islands + national politics, etc.
  
  return false;
}

getInvalidCombinationReason(place, topic) {
  if (place?.slug === 'antarctica' && topic?.slug === 'local-elections') {
    return 'Antarctica has no local elections';
  }
  return 'Combination is semantically implausible';
}
```

### 2.4 Update API and Tests

Similar patterns to Phase 1, adding:
- `includeCombinations` parameter to API
- Integration tests for place-topic combinations
- DSPL patterns for combinations

---

## Phase 3: Hierarchical Place-Place Hubs

**Objective**: Support hierarchical geographic hubs (e.g., `/us/california`, `/world/europe/france`).

**Duration**: 16-24 hours  
**Complexity**: High  
**Dependencies**: None (uses existing `place_hierarchy` table)  
**Value**: Moderate-High (common for regional news sites)

### 3.1 Data Model Strategy

**Decision**: Use existing `place_hubs` table, add metadata to `evidence` field.

**Rationale**:
- Adding `place_slug_2`, `place_slug_3` columns is rigid
- `evidence` JSON field is flexible
- Can query hierarchical relationships via `place_hierarchy` table

**Schema** (no changes needed):
```sql
-- place_hubs table already supports this via evidence field
CREATE TABLE place_hubs (
  -- ... existing columns ...
  place_slug TEXT,           -- Primary place (e.g., "california")
  evidence TEXT              -- JSON: { hierarchy: { parent: "us", depth: 1 } }
);
```

### 3.2 Create PlacePlaceHubGapAnalyzer

**File**: `src/services/PlacePlaceHubGapAnalyzer.js` (NEW)

```javascript
'use strict';

const HubGapAnalyzerBase = require('./HubGapAnalyzerBase');

/**
 * PlacePlaceHubGapAnalyzer - URL prediction for place-place relationships
 * 
 * Handles two types of place-place hubs:
 * 1. Hierarchical: parent-child relationships (e.g., /us/california)
 * 2. Cross-location: peer relationships (e.g., /us-canada-border)
 */
class PlacePlaceHubGapAnalyzer extends HubGapAnalyzerBase {
  constructor({ db, logger, dsplDir } = {}) {
    super({ db, logger, dsplDir });
    this.hierarchyCache = null;
  }
  
  getEntityLabel() {
    return 'place-place';
  }
  
  getFallbackPatterns() {
    return [
      // Hierarchical patterns
      '/{parent}/{child}',                    // /us/california
      '/world/{parent}/{child}',              // /world/europe/france
      '/news/{parent}/{child}',               // /news/us/texas
      '/{parent}/{child}-news',               // /us/california-news
      
      // Cross-location patterns
      '/{place1}-{place2}',                   // /us-canada
      '/{place1}-{place2}-border',            // /california-mexico-border
      '/{place1}-{place2}-tunnel',            // /uk-france-tunnel
      '/{place1}-and-{place2}',               // /us-and-canada
      
      // Regional patterns
      '/{region}/{place}',                    // /europe/france
      '/regional/{parent}/{child}'            // /regional/us/california
    ];
  }
  
  buildEntityMetadata(relationship) {
    if (!relationship || !relationship.place1 || !relationship.place2) return null;
    
    const place1 = relationship.place1;
    const place2 = relationship.place2;
    const relationType = relationship.relationType || 'hierarchical';
    
    return {
      parent: relationType === 'hierarchical' ? place1.slug : null,
      child: relationType === 'hierarchical' ? place2.slug : null,
      place1: place1.slug,
      place2: place2.slug,
      region: place1.kind === 'continent' || place1.kind === 'region' ? place1.slug : null,
      place: place2.slug
    };
  }
  
  /**
   * Load place hierarchy from database
   */
  loadHierarchy() {
    if (this.hierarchyCache) return this.hierarchyCache;
    
    const rows = this.db.prepare(`
      SELECT parent_id, child_id, relation, depth
      FROM place_hierarchy
      WHERE relation IN ('admin_parent', 'contains')
    `).all();
    
    const hierarchy = new Map();
    for (const row of rows) {
      const key = `${row.parent_id}-${row.child_id}`;
      hierarchy.set(key, {
        parentId: row.parent_id,
        childId: row.child_id,
        relation: row.relation,
        depth: row.depth
      });
    }
    
    this.hierarchyCache = hierarchy;
    return hierarchy;
  }
  
  /**
   * Check if place1 is parent of place2
   */
  isParentOf(place1Id, place2Id) {
    const hierarchy = this.loadHierarchy();
    const key = `${place1Id}-${place2Id}`;
    return hierarchy.has(key);
  }
  
  /**
   * Predict hierarchical relationship URLs
   * @param {string} domain - Target domain
   * @param {Object} parent - Parent place
   * @param {Object} child - Child place
   * @returns {Array<Object>} Predictions
   */
  predictHierarchicalUrls(domain, parent, child) {
    if (!domain || !parent || !child) return [];
    
    // Verify hierarchy relationship exists
    if (parent.id && child.id && !this.isParentOf(parent.id, child.id)) {
      this.logger.warn(`[PlacePlaceAnalyzer] ${parent.name} is not parent of ${child.name}, skipping`);
      return [];
    }
    
    const relationship = {
      place1: parent,
      place2: child,
      relationType: 'hierarchical'
    };
    
    const baseUrls = this.predictHubUrls(domain, relationship);
    
    return baseUrls.map(url => ({
      url,
      confidence: 0.65,
      source: 'place-place-hierarchical',
      parent: {
        slug: parent.slug,
        name: parent.name,
        kind: parent.kind,
        id: parent.id
      },
      child: {
        slug: child.slug,
        name: child.name,
        kind: child.kind,
        id: child.id
      },
      relationType: 'hierarchical'
    }));
  }
  
  /**
   * Predict cross-location (peer) relationship URLs
   * @param {string} domain - Target domain
   * @param {Object} place1 - First place
   * @param {Object} place2 - Second place
   * @returns {Array<Object>} Predictions
   */
  predictCrossLocationUrls(domain, place1, place2) {
    if (!domain || !place1 || !place2) return [];
    
    const relationship = {
      place1,
      place2,
      relationType: 'cross-location'
    };
    
    const baseUrls = this.predictHubUrls(domain, relationship);
    
    return baseUrls.map(url => ({
      url,
      confidence: 0.5, // Lower confidence (less common pattern)
      source: 'place-place-cross-location',
      place1: {
        slug: place1.slug,
        name: place1.name,
        kind: place1.kind,
        id: place1.id
      },
      place2: {
        slug: place2.slug,
        name: place2.name,
        kind: place2.kind,
        id: place2.id
      },
      relationType: 'cross-location'
    }));
  }
}

module.exports = PlacePlaceHubGapAnalyzer;
```

### 3.3 Orchestration Changes

Similar to Phase 2, add:
- `includeHierarchical` and `includeCrossLocation` options
- Hierarchical relationship processing loop
- Evidence field updates with relationship metadata

### 3.4 Validation Strategy

**Challenge**: How to validate a hierarchical hub page?

**Approach**:
1. Validate child place is present (e.g., "California" for `/us/california`)
2. Check breadcrumbs or navigation for parent reference (e.g., "United States > California")
3. Verify URL structure matches hierarchy
4. Check title format (e.g., "California | United States | The Guardian")

**Implementation**: New `validatePlacePlaceHub()` method in `HubValidator`.

---

## Phase 4: Cross-Location Place-Place Hubs

**Objective**: Support peer place relationships (e.g., `/us-canada-border`).

**Duration**: 16-24 hours  
**Complexity**: Very High  
**Dependencies**: Phase 3 (shares PlacePlaceHubGapAnalyzer)  
**Value**: Low-Moderate (rare pattern)

### 4.1 Relationship Type Modeling

**Challenge**: How to model non-hierarchical relationships?

**Options**:

**Option A**: Use `place_hierarchy` table with `relation='peer'`
```sql
INSERT INTO place_hierarchy (parent_id, child_id, relation, depth, metadata)
VALUES (usa_id, canada_id, 'peer', NULL, '{"relationship": "border"}');
```

**Option B**: Create new `place_relationships` table
```sql
CREATE TABLE place_relationships (
  place1_id INTEGER NOT NULL,
  place2_id INTEGER NOT NULL,
  relationship_type TEXT NOT NULL,  -- border | cultural | economic | comparative
  bidirectional BOOLEAN DEFAULT 1,
  metadata JSON,
  PRIMARY KEY (place1_id, place2_id, relationship_type),
  FOREIGN KEY (place1_id) REFERENCES places(id),
  FOREIGN KEY (place2_id) REFERENCES places(id)
);
```

**Recommendation**: Option B (clearer semantics, doesn't overload `place_hierarchy`).

### 4.2 Detection Challenges

**Problem**: How to detect `/us-canada-border` is a place-place hub vs a regular article?

**Approach**:
1. Parse URL for place name pairs (`{place1}-{place2}` pattern)
2. Check both places exist in gazetteer
3. Validate content mentions both places
4. Check for relationship keywords ("border", "tunnel", "cooperation")

**Implementation**: Extend `placeHubDetector.js` with place-place detection logic.

---

## Testing Strategy

### Unit Tests

**Phase 1** (Topic Hubs):
- `TopicHubGapAnalyzer.test.js` - pattern generation, topic selection
- `HubValidator.validateTopicHub.test.js` - validation logic
- `placeHubGuessing.topics.test.js` - orchestration integration

**Phase 2** (Place-Topic):
- `PlaceTopicHubGapAnalyzer.test.js` - combination URL generation
- `HubValidator.validatePlaceTopicHub.test.js` - combination validation
- `placeHubGuessing.combinations.test.js` - orchestration integration

**Phase 3** (Hierarchical):
- `PlacePlaceHubGapAnalyzer.test.js` - hierarchical URL generation
- `HubValidator.validatePlacePlaceHub.test.js` - hierarchy validation
- `placeHubGuessing.hierarchical.test.js` - orchestration integration

**Phase 4** (Cross-Location):
- `placeRelationships.test.js` - relationship modeling
- `placeHubDetector.placePair.test.js` - place pair detection

### Integration Tests

**API Tests**:
- Topic hub discovery via `/api/place-hubs/guess` with `enableTopicDiscovery=true`
- Place-topic combination discovery with `includeCombinations=true`
- Hierarchical hub discovery with `includeHierarchical=true`

**E2E Tests**:
- Run full crawl with topic discovery enabled
- Verify topic hubs stored correctly in database
- Query topic hubs via API and verify response format

---

## Migration Path

### Backward Compatibility

**Requirement**: Existing place hub functionality must continue working without changes.

**Strategy**:
1. All new features are **opt-in** via explicit parameters
2. Default behavior unchanged (`kinds=['country']`, no topics)
3. Existing API endpoints work identically
4. Database schema fully backward compatible (all new columns already exist)

### Rollout Plan

**Week 1-2**: Phase 1 (Topic Hubs)
- Implement TopicHubGapAnalyzer
- Extend orchestration and API
- Unit and integration tests
- Documentation updates

**Week 3-4**: Phase 2 (Place-Topic Combinations)
- Implement PlaceTopicHubGapAnalyzer
- Integrate placeHubDetector.js
- Combination validation
- Tests and documentation

**Week 5-6**: Phase 3 (Hierarchical Place-Place)
- Implement PlacePlaceHubGapAnalyzer
- Hierarchy validation
- Tests and documentation

**Week 7+**: Phase 4 (Cross-Location Place-Place)
- New relationship table
- Cross-location detection
- Semantic validation
- Tests and documentation

---

## Performance Considerations

### Scaling Concerns

**Topic Hubs**:
- 20-30 topics per domain
- 3-5 URL patterns per topic
- Total: 60-150 URLs to fetch per domain
- **Impact**: Moderate (manageable)

**Place-Topic Combinations**:
- 50 places × 20 topics = 1,000 combinations
- 3-5 URL patterns per combination
- Total: 3,000-5,000 URLs to fetch per domain
- **Impact**: High (requires rate limiting)

**Hierarchical Place-Place**:
- Countries: 250
- Regions per country: ~5-10
- Cities per region: ~10-50
- Total hierarchical pairs: ~12,500-125,000
- **Impact**: Very High (requires intelligent sampling)

### Optimization Strategies

1. **Intelligent Sampling**:
   - For combinations, only test top N places × top M topics
   - For hierarchies, only test major cities (population > 500k)
   - Use confidence scores to prioritize

2. **Caching**:
   - Cache topic hub predictions (rarely change)
   - Cache hierarchy relationships (static)
   - Reuse fetch results across entity types

3. **Batch Processing**:
   - Process combinations in parallel batches
   - Use background jobs for large-scale discovery
   - Implement progressive discovery (start with high-confidence, expand later)

4. **Rate Limiting**:
   - Enforce stricter limits for combination discovery
   - Add delays between batch requests
   - Implement exponential backoff on 429 responses

---

## Documentation Updates

### User-Facing Documentation

**API Documentation** (`docs/API_ENDPOINT_REFERENCE.md`):
- Document new parameters (`topics`, `enableTopicDiscovery`, `includeCombinations`)
- Add examples for each hub type
- Update response schemas

**Architecture Documentation** (`docs/ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md`):
- Explain hub type taxonomy
- Document relationship modeling
- Add diagrams for hub types

**Testing Documentation** (`docs/TESTING_QUICK_REFERENCE.md`):
- Add hub type testing patterns
- Document test data setup for combinations
- Update integration test examples

### Developer Documentation

**AGENTS.md**:
- Update hub guessing workflow section
- Add topic/combination/hierarchy patterns
- Document new analyzers

**Service Documentation**:
- Add JSDoc for new analyzer services
- Document pattern generation logic
- Explain relationship validation

---

## Success Criteria

### Phase 1 (Topic Hubs)

✅ **Functional**:
- TopicHubGapAnalyzer generates topic URLs
- Topic hub validation works
- API accepts `topics` and `enableTopicDiscovery` parameters
- Database stores topic hubs correctly

✅ **Quality**:
- 5/5 unit tests pass
- 3/3 integration tests pass
- Documentation complete
- No regressions in existing place hub functionality

### Phase 2 (Place-Topic)

✅ **Functional**:
- PlaceTopicHubGapAnalyzer generates combination URLs
- placeHubDetector.js integrated into orchestration
- Combination validation works
- Database stores combinations with both place and topic

✅ **Quality**:
- 8/8 unit tests pass
- 5/5 integration tests pass
- Example combinations work (e.g., `/sport/iceland`, `/world/france/politics`)
- Performance acceptable (<1min for 50 places × 10 topics)

### Phase 3 (Hierarchical)

✅ **Functional**:
- PlacePlaceHubGapAnalyzer generates hierarchical URLs
- Hierarchy validation uses `place_hierarchy` table
- Evidence field captures parent-child metadata
- API supports `includeHierarchical` parameter

✅ **Quality**:
- 6/6 unit tests pass
- 4/4 integration tests pass
- Major hierarchies work (e.g., `/us/california`, `/world/europe/france`)
- Performance acceptable (<2min for 50 parent-child pairs)

### Phase 4 (Cross-Location)

✅ **Functional**:
- `place_relationships` table created
- Cross-location URL generation works
- Place pair detection implemented
- Semantic validation prevents invalid pairs

✅ **Quality**:
- 5/5 unit tests pass
- 3/3 integration tests pass
- Example pairs work (e.g., `/us-canada-border`, `/uk-france-tunnel`)
- Documentation explains relationship semantics

---

## Conclusion

This implementation plan provides a systematic, phased approach to extending the hub guessing system. Each phase builds on previous work and maintains backward compatibility. The key insight is that **most infrastructure already exists** - the work is integration and extension, not ground-up implementation.

**Estimated Total Effort**: 52-76 hours across 4 phases  
**Recommended Approach**: Implement Phase 1 and Phase 2 first (highest value), defer Phase 3 and Phase 4 until user demand justifies the complexity.

**Next Steps**: Begin Phase 1 implementation with TopicHubGapAnalyzer service.
