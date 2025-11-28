# URL Classification System Improvement Plan

## Session Info
- **Date**: 2025-11-27
- **Objective**: Improve the classification system to distinguish between URL-only predictions and content-verified classifications, using pattern matching from known classified documents

## Problem Statement

Currently, the system has two classification scenarios that are conflated:

1. **Content-Based Classification** (High Confidence)
   - URL has been fetched, content analyzed
   - Classification stored in `content_analysis.classification`
   - Based on actual page content, structure, word count, schema signals
   - Examples: "article", "nav", "hub", "place-hub"

2. **URL-Only Classification** (Lower Confidence)
   - URL exists but has not been fetched
   - Can only predict classification from URL patterns
   - Currently not tracked separately
   - Examples: Uses `looksLikeArticle(url)` heuristics

## Current Architecture

### Classification Flow
```
URL Discovered → URL Stored → [Optional Fetch] → Content Analysis → Classification
                     │                                     │
                     │                                     ▼
                     │                            content_analysis.classification
                     │
                     └─── Currently: No prediction stored
```

### Key Files
- `src/crawler/ArticleSignalsService.js` - URL pattern analysis (`looksLikeArticle`, `computeUrlSignals`)
- `src/crawler/ArticleProcessor.js` - Content classification after fetch
- `src/db/sqlite/v1/queries/ui/classificationTypes.js` - Classification queries

### Current URL Signals
From `ArticleSignalsService.computeUrlSignals()`:
- `hasDatePath` - e.g., `/2024/11/27/article-slug`
- `hasArticleWords` - article, story, news, post, opinion, etc.
- `pathDepth` - number of URL segments
- `section` - first path segment
- `slugLen` - length of final segment

## Proposed Solution

### 1. Add URL Classification Prediction Table

```sql
CREATE TABLE url_classifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url_id INTEGER NOT NULL REFERENCES urls(id),
    predicted_classification TEXT NOT NULL,
    confidence REAL NOT NULL CHECK(confidence >= 0.0 AND confidence <= 1.0),
    prediction_source TEXT NOT NULL,  -- 'url_pattern', 'similar_url', 'domain_profile'
    pattern_matched TEXT,              -- The pattern that matched (e.g., '/2024/*/article')
    similar_url_id INTEGER,            -- Reference to similar URL with verified classification
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    verified_at TEXT,                  -- When content was fetched and verified
    verified_classification TEXT,      -- Actual classification after fetch
    verification_match INTEGER,        -- 1 if prediction was correct
    UNIQUE(url_id, prediction_source)
);

CREATE INDEX idx_url_classifications_url ON url_classifications(url_id);
CREATE INDEX idx_url_classifications_predicted ON url_classifications(predicted_classification);
CREATE INDEX idx_url_classifications_confidence ON url_classifications(confidence DESC);
CREATE INDEX idx_url_classifications_verified ON url_classifications(verified_at);
```

### 2. Pattern Learning from Verified Documents

Build a pattern repository from URLs with verified content classifications:

```sql
CREATE TABLE url_classification_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT NOT NULL,
    pattern_regex TEXT NOT NULL,           -- e.g., '^/news/\\d{4}/\\d{2}/\\d{2}/'
    pattern_description TEXT,
    classification TEXT NOT NULL,
    sample_count INTEGER DEFAULT 0,        -- How many URLs match this pattern
    verified_count INTEGER DEFAULT 0,      -- How many have verified classifications
    accuracy REAL,                         -- verified_correct / verified_count
    last_verified_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(domain, pattern_regex)
);

CREATE INDEX idx_url_patterns_domain ON url_classification_patterns(domain);
CREATE INDEX idx_url_patterns_accuracy ON url_classification_patterns(accuracy DESC);
```

### 3. URL Classification Service

```javascript
// src/services/UrlClassificationService.js
class UrlClassificationService {
    constructor({ db, patternMatcher, signalsService }) {
        this.db = db;
        this.patternMatcher = patternMatcher;
        this.signalsService = signalsService;
    }

    /**
     * Predict classification for an unfetched URL
     * Uses multiple strategies in order of confidence:
     * 1. Exact pattern match from learned patterns (highest confidence)
     * 2. Similar URL match (URLs with same structure but different slugs)
     * 3. URL signals heuristics (lowest confidence)
     */
    async predictClassification(url) {
        const predictions = [];

        // Strategy 1: Learned patterns
        const patternMatch = await this.matchLearnedPattern(url);
        if (patternMatch) {
            predictions.push({
                classification: patternMatch.classification,
                confidence: patternMatch.accuracy,
                source: 'learned_pattern',
                pattern: patternMatch.pattern_regex,
                sampleCount: patternMatch.sample_count
            });
        }

        // Strategy 2: Similar URL lookup
        const similarMatch = await this.findSimilarVerifiedUrl(url);
        if (similarMatch) {
            predictions.push({
                classification: similarMatch.classification,
                confidence: 0.7 * similarMatch.similarity,
                source: 'similar_url',
                similarUrl: similarMatch.url,
                similarUrlId: similarMatch.url_id
            });
        }

        // Strategy 3: URL signals
        const urlSignals = this.signalsService.computeUrlSignals(url);
        const signalsPrediction = this.predictFromSignals(urlSignals);
        if (signalsPrediction) {
            predictions.push({
                classification: signalsPrediction.classification,
                confidence: signalsPrediction.confidence,
                source: 'url_signals',
                signals: urlSignals
            });
        }

        // Return best prediction
        return this.selectBestPrediction(predictions);
    }

    /**
     * Find similar URLs that have verified classifications
     * Similarity based on URL structure pattern
     */
    async findSimilarVerifiedUrl(url) {
        const parsed = new URL(url);
        const host = parsed.hostname;
        const segments = parsed.pathname.split('/').filter(Boolean);
        
        // Build structural pattern (replace variable segments with wildcards)
        const structuralPattern = this.buildStructuralPattern(segments);
        
        // Query for URLs matching this structural pattern
        return this.db.prepare(`
            SELECT u.id as url_id, u.url, ca.classification,
                   1.0 as similarity  -- Could be calculated based on path similarity
            FROM urls u
            JOIN http_responses hr ON u.id = hr.url_id
            JOIN content_storage cs ON hr.id = cs.http_response_id
            JOIN content_analysis ca ON cs.id = ca.content_id
            WHERE u.host = ?
              AND u.url LIKE ?
              AND ca.classification IS NOT NULL
            ORDER BY hr.fetched_at DESC
            LIMIT 1
        `).get(host, structuralPattern);
    }

    buildStructuralPattern(segments) {
        // Convert URL segments to matching pattern
        // e.g., ['news', '2024', '11', '27', 'headline-slug'] 
        // → 'news/%/%/%/%' (dates and slugs are variable)
        return segments.map(seg => {
            if (/^\d{4}$/.test(seg)) return '%'; // year
            if (/^\d{1,2}$/.test(seg)) return '%'; // month/day
            if (seg.length > 20) return '%'; // likely a slug
            return seg; // keep category/section names
        }).join('/');
    }
}
```

### 4. Pattern Learning Service

```javascript
// src/services/UrlPatternLearningService.js
class UrlPatternLearningService {
    /**
     * Analyze verified classifications to learn URL patterns
     * Run periodically to update pattern confidence
     */
    async learnPatternsFromDomain(domain) {
        // Get all verified URLs for this domain
        const verifiedUrls = this.db.prepare(`
            SELECT u.url, ca.classification
            FROM urls u
            JOIN http_responses hr ON u.id = hr.url_id
            JOIN content_storage cs ON hr.id = cs.http_response_id
            JOIN content_analysis ca ON cs.id = ca.content_id
            WHERE u.host = ?
              AND ca.classification IS NOT NULL
        `).all(domain);

        // Group by structural pattern and classification
        const patterns = new Map();
        for (const { url, classification } of verifiedUrls) {
            const pattern = this.extractPattern(url);
            const key = `${pattern}:${classification}`;
            if (!patterns.has(key)) {
                patterns.set(key, { pattern, classification, count: 0, urls: [] });
            }
            patterns.get(key).count++;
            patterns.get(key).urls.push(url);
        }

        // Upsert patterns with sufficient samples
        for (const { pattern, classification, count } of patterns.values()) {
            if (count >= 3) { // Minimum sample threshold
                this.upsertPattern(domain, pattern, classification, count);
            }
        }
    }

    extractPattern(url) {
        const parsed = new URL(url);
        const segments = parsed.pathname.split('/').filter(Boolean);
        
        // Convert to regex-like pattern
        return segments.map(seg => {
            if (/^\d{4}$/.test(seg)) return '\\d{4}'; // year
            if (/^\d{1,2}$/.test(seg)) return '\\d{1,2}'; // month/day
            if (seg.length > 30) return '[^/]+'; // long slugs
            return seg;
        }).join('/');
    }
}
```

### 5. Integration Points

#### A. When URL is Discovered (before fetch)
```javascript
// In PageExecutionService or similar
async onUrlDiscovered(url) {
    // Get/create URL record
    const urlId = await this.ensureUrlExists(url);
    
    // Predict classification before fetching
    const prediction = await this.urlClassificationService.predictClassification(url);
    
    if (prediction) {
        await this.storePrediction(urlId, prediction);
    }
    
    // Use prediction to prioritize queue
    return {
        urlId,
        predictedClassification: prediction?.classification,
        confidence: prediction?.confidence
    };
}
```

#### B. After Content Fetch (verification)
```javascript
// In ArticleProcessor.process() or similar
async afterContentClassified(urlId, actualClassification) {
    // Get stored prediction
    const prediction = await this.getPrediction(urlId);
    
    if (prediction) {
        // Verify prediction accuracy
        const isCorrect = prediction.predicted_classification === actualClassification;
        
        await this.updatePredictionVerification(urlId, {
            verifiedAt: new Date().toISOString(),
            verifiedClassification: actualClassification,
            verificationMatch: isCorrect ? 1 : 0
        });
        
        // Update pattern accuracy if from learned pattern
        if (prediction.prediction_source === 'learned_pattern') {
            await this.updatePatternAccuracy(prediction.pattern_matched, isCorrect);
        }
    }
}
```

### 6. UI Changes

#### Classification Detail Page Updates
- Show whether classification is "Verified" (from content) or "Predicted" (from URL)
- Display confidence score for predictions
- Show similar verified URLs used for prediction
- Allow filtering by verification status

#### New Query: URLs Awaiting Classification
```sql
-- URLs discovered but not yet fetched
SELECT u.id, u.url, uc.predicted_classification, uc.confidence
FROM urls u
LEFT JOIN url_classifications uc ON u.id = uc.url_id
WHERE NOT EXISTS (
    SELECT 1 FROM http_responses hr WHERE hr.url_id = u.id
)
ORDER BY uc.confidence DESC, u.created_at DESC;
```

## Implementation Phases

### Phase 1: Database Schema (1-2 hours)
- [ ] Create migration for `url_classifications` table
- [ ] Create migration for `url_classification_patterns` table
- [ ] Add indexes for efficient queries

### Phase 2: URL Classification Service (2-3 hours)
- [ ] Implement `UrlClassificationService`
- [ ] Implement `predictClassification()` with all strategies
- [ ] Implement `findSimilarVerifiedUrl()`
- [ ] Unit tests

### Phase 3: Pattern Learning (2-3 hours)
- [ ] Implement `UrlPatternLearningService`
- [ ] Extract patterns from existing verified URLs
- [ ] Run initial learning pass on existing data
- [ ] Unit tests

### Phase 4: Pipeline Integration (2-3 hours)
- [ ] Hook into URL discovery flow
- [ ] Hook into content classification flow
- [ ] Update queue prioritization to use predictions

### Phase 5: UI Updates (2-3 hours)
- [ ] Update classification detail pages
- [ ] Add "Predicted vs Verified" indicator
- [ ] Add confidence display
- [ ] Add filtering by verification status

## Success Metrics

1. **Prediction Accuracy**: Track % of URL predictions that match verified classification
2. **Coverage**: % of unfetched URLs with predictions
3. **Confidence Distribution**: Distribution of confidence scores
4. **Pattern Library Size**: Number of learned patterns per domain

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Low prediction accuracy | Minimum sample threshold for patterns, conservative confidence scores |
| Stale patterns | Regular pattern relearning, accuracy decay over time |
| Domain variation | Per-domain pattern learning, not global patterns |
| Performance impact | Efficient indexing, caching of common patterns |

## Follow-ups

- Add background task to periodically relearn patterns
- Add telemetry for prediction accuracy tracking
- Consider ML-based pattern recognition for complex sites
- Add domain profile learning (e.g., "this domain uses /article/ prefix")
