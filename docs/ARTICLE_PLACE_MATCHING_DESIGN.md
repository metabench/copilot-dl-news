/**
 * Article-Place Matching System Design
 *
 * Architecture: Gazetteer provides data, matching system makes decisions
 *
 * Gazetteer APIs (existing):
 * - /api/gazetteer/place/:id - Get place details
 * - /api/gazetteer/resolve - Resolve place names to IDs
 * - /api/gazetteer/hubs - Get place hubs
 *
 * Matching System (new):
 * - Consumes gazetteer data
 * - Applies matching rules with confidence scoring
 * - Stores results with provenance
 * - Supports rule versioning for iterative improvement
 */

const MATCHING_RULE_LEVELS = {
  0: 'no_rules_applied',     // Default for existing content
  1: 'basic_string_match',   // Simple exact/case-insensitive matching
  2: 'context_aware',        // Considers position, frequency, context
  3: 'entity_disambiguation', // Distinguishes places from people/things
  4: 'nlp_enhanced'          // Uses WinkNLP for English text analysis
};

const RELATION_TYPES = {
  primary: 'Primary subject of article',
  secondary: 'Secondary location mentioned',
  mentioned: 'Briefly mentioned',
  affected: 'Impacted by events in article',
  origin: 'Origin of people/events mentioned'
};

const CONFIDENCE_THRESHOLDS = {
  high: 0.8,     // Very confident matches
  medium: 0.6,   // Moderately confident
  low: 0.4,      // Low confidence, needs review
  reject: 0.2    // Likely false positive
};

/**
 * Article-Place Relation Schema
 *
 * CREATE TABLE article_place_relations (
 *   id INTEGER PRIMARY KEY,
 *   article_id INTEGER NOT NULL,
 *   place_id INTEGER NOT NULL,
 *   relation_type TEXT NOT NULL,
 *   confidence REAL NOT NULL,
 *   matching_rule_level INTEGER NOT NULL DEFAULT 0,
 *   evidence TEXT,              -- JSON: {rule, matches, context}
 *   created_at TEXT NOT NULL,
 *   updated_at TEXT NOT NULL,
 *   FOREIGN KEY (article_id) REFERENCES articles(id),
 *   FOREIGN KEY (place_id) REFERENCES places(id)
 * );
 *
 * CREATE INDEX idx_article_place_relations_article ON article_place_relations(article_id);
 * CREATE INDEX idx_article_place_relations_place ON article_place_relations(place_id);
 * CREATE INDEX idx_article_place_relations_confidence ON article_place_relations(confidence DESC);
 * CREATE INDEX idx_article_place_relations_rule_level ON article_place_relations(matching_rule_level);
 */

/**
 * Database Migration for Article-Place Relations
 *
 * File: src/db/migrations/008-article-place-relations.sql
 */

-- Create article_place_relations table
CREATE TABLE IF NOT EXISTS article_place_relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL,
  place_id INTEGER NOT NULL,
  relation_type TEXT NOT NULL CHECK(relation_type IN ('primary', 'secondary', 'mentioned', 'affected', 'origin')),
  confidence REAL NOT NULL CHECK(confidence >= 0.0 AND confidence <= 1.0),
  matching_rule_level INTEGER NOT NULL DEFAULT 0,
  evidence TEXT,              -- JSON: {rule, matches, context, metadata}
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
  FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE,
  UNIQUE(article_id, place_id, matching_rule_level) -- Prevent duplicate matches at same rule level
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_article_place_relations_article ON article_place_relations(article_id);
CREATE INDEX IF NOT EXISTS idx_article_place_relations_place ON article_place_relations(place_id);
CREATE INDEX IF NOT EXISTS idx_article_place_relations_confidence ON article_place_relations(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_article_place_relations_rule_level ON article_place_relations(matching_rule_level);
CREATE INDEX IF NOT EXISTS idx_article_place_relations_created ON article_place_relations(created_at DESC);

-- Update existing articles to rule level 0 (no matching applied yet)
INSERT OR IGNORE INTO schema_migrations (version, name, applied_at, description)
VALUES (8, '008-article-place-relations', datetime('now'), 'Add article-place relations with confidence scoring and rule versioning');

 /**
 * API Endpoints for Article-Place Matching
 *
 * These endpoints provide access to matching results and allow triggering matching operations.
 */

-- GET /api/articles/:id/places
// Get places associated with an article
{
  "article": {
    "id": 123,
    "title": "California Wildfires Spread",
    "url": "https://example.com/california-wildfires"
  },
  "relations": [
    {
      "place": {
        "id": 456,
        "name": "California",
        "kind": "region"
      },
      "relation_type": "primary",
      "confidence": 0.9,
      "matching_rule_level": 2,
      "evidence": {
        "rule": "context_aware",
        "matches": ["California"],
        "context": "HEADLINE: California Wildfires Spread | California is experiencing..."
      },
      "created_at": "2025-10-18T10:00:00Z"
    }
  ]
}

-- GET /api/places/:id/articles
// Get articles associated with a place
{
  "place": {
    "id": 456,
    "name": "California",
    "kind": "region"
  },
  "relations": [
    {
      "article": {
        "id": 123,
        "title": "California Wildfires Spread",
        "url": "https://example.com/california-wildfires"
      },
      "relation_type": "primary",
      "confidence": 0.9,
      "matching_rule_level": 2
    }
  ],
  "total": 150,
  "high_confidence": 120
}

-- POST /api/articles/:id/match-places
// Trigger place matching for a specific article
{
  "rule_level": 1,  // Which matching algorithm to use
  "force": false    // Whether to re-match if already matched
}

-- POST /api/articles/match-places-batch
// Batch matching for multiple articles
{
  "article_ids": [123, 456, 789],
  "rule_level": 1,
  "batch_size": 10
}

-- GET /api/matching/stats
// Get matching statistics
{
  "total_relations": 15420,
  "by_rule_level": {
    "0": 8500,  // No matching applied
    "1": 4520,  // Basic string matching
    "2": 2400   // Context-aware matching
  },
  "by_confidence": {
    "high": 12000,
    "medium": 2800,
    "low": 620
  },
  "recent_matches": 450  // Last 24 hours
}

/**
 * Implementation Strategy
 *
 * 1. Gazetteer Integration (Data Provider)
 *    - Use existing /api/gazetteer/resolve for place name → ID mapping
 *    - Cache place data locally for performance
 *    - Keep gazetteer as pure data API
 *
 * 2. Matching Engine (Decision Maker)
 *    - Level 1: Basic string matching against place names
 *    - Level 2: Context-aware matching (headline, first paragraph priority)
 *    - Level 3: Frequency analysis (multiple mentions = higher confidence)
 *    - Level 4: Position analysis (early mentions = more relevant)
 *
 * 3. Confidence Scoring
 *    - Base score from matching rule level
 *    - Multipliers: frequency, position, context
 *    - Penalties: ambiguous names, common words
 *
 * 4. Evidence Tracking
 *    - Store exact matches found
 *    - Record context snippets
 *    - Track which rule produced the match
 *
 * 5. Iterative Improvement
 *    - Start with level 1 for all content
 *    - Apply higher levels to high-confidence matches
 *    - Reassess low-confidence matches with better rules
 *    - Human verification for uncertain cases
 */

/**
 * Basic String Matching Implementation (Level 1)
 *
 * Algorithm:
 * 1. Get article text (title + content)
 * 2. Get all place names from gazetteer
 * 3. Find exact/case-insensitive matches
 * 4. Score based on frequency and position
 * 5. Store results with evidence
 */

class ArticlePlaceMatcher {
  constructor(gazetteerApi, db) {
    this.gazetteer = gazetteerApi; // Data provider
    this.db = db;
    this.placeCache = new Map(); // Cache place data
  }

  async matchArticleToPlaces(articleId) {
    const article = this.db.prepare('SELECT * FROM articles WHERE id = ?').get(articleId);
    if (!article) return [];

    const text = this.extractText(article);
    const placeCandidates = await this.findPlaceMentions(text);

    const relations = [];
    for (const candidate of placeCandidates) {
      const confidence = this.calculateConfidence(candidate, text);
      if (confidence >= CONFIDENCE_THRESHOLDS.reject) {
        relations.push({
          article_id: articleId,
          place_id: candidate.placeId,
          relation_type: this.determineRelationType(candidate, text),
          confidence,
          matching_rule_level: 1,
          evidence: JSON.stringify({
            rule: 'basic_string_match',
            matches: candidate.matches,
            context: candidate.context
          })
        });
      }
    }

    return relations;
  }

  async findPlaceMentions(text) {
    const places = await this.getAllPlaces();
    const candidates = [];

    for (const place of places) {
      const matches = this.findMatches(text, place.names);
      if (matches.length > 0) {
        candidates.push({
          placeId: place.id,
          names: place.names,
          matches,
          context: this.extractContext(text, matches)
        });
      }
    }

    return candidates;
  }

  findMatches(text, placeNames) {
    const matches = [];
    const lowerText = text.toLowerCase();

    for (const name of placeNames) {
      const lowerName = name.toLowerCase();
      const regex = new RegExp(`\\b${this.escapeRegex(lowerName)}\\b`, 'gi');
      const nameMatches = [...text.matchAll(regex)];

      if (nameMatches.length > 0) {
        matches.push({
          name,
          count: nameMatches.length,
          positions: nameMatches.map(m => m.index)
        });
      }
    }

    return matches;
  }

  calculateConfidence(candidate, text) {
    let score = 0.5; // Base score for any match

    // Frequency bonus
    const totalMentions = candidate.matches.reduce((sum, m) => sum + m.count, 0);
    score += Math.min(totalMentions * 0.1, 0.3);

    // Position bonus (earlier mentions = more relevant)
    const firstPosition = Math.min(...candidate.matches.flatMap(m => m.positions));
    const positionRatio = firstPosition / text.length;
    score += (1 - positionRatio) * 0.2; // Earlier = higher score

    // Context bonus (headline matches = very relevant)
    if (candidate.context.includes('headline')) {
      score += 0.2;
    }

    return Math.min(score, 1.0);
  }

  determineRelationType(candidate, text) {
    const totalMentions = candidate.matches.reduce((sum, m) => sum + m.count, 0);

    if (totalMentions >= 5) return 'primary';
    if (totalMentions >= 3) return 'secondary';
    if (candidate.context.includes('headline')) return 'primary';
    return 'mentioned';
  }

  async getAllPlaces() {
    if (this.placeCache.size > 0) {
      return Array.from(this.placeCache.values());
    }

    // Use gazetteer API to get place data
    const response = await fetch(`${this.gazetteer.baseUrl}/api/gazetteer/places`);
    const places = await response.json();

    for (const place of places) {
      this.placeCache.set(place.id, {
        id: place.id,
        names: this.extractAllNames(place)
      });
    }

    return Array.from(this.placeCache.values());
  }

  extractAllNames(place) {
    const names = new Set();

    // Add canonical name
    if (place.canonicalName) {
      names.add(place.canonicalName);
    }

    // Add all alternate names
    if (place.names) {
      for (const name of place.names) {
        names.add(name.name);
        if (name.normalized) names.add(name.normalized);
      }
    }

    return Array.from(names);
  }

  extractText(article) {
    let text = '';

    // Title is most important
    if (article.title) text += `HEADLINE: ${article.title}\n\n`;

    // Article text content
    if (article.text) text += article.text;

    // Fallback to HTML if no text
    if (!text && article.html) {
      text += this.stripHtml(article.html);
    }

    return text;
  }

  extractContext(text, matches) {
    const contexts = [];

    for (const match of matches) {
      for (const position of match.positions) {
        const start = Math.max(0, position - 50);
        const end = Math.min(text.length, position + match.name.length + 50);
        const snippet = text.substring(start, end);
        contexts.push(snippet);
      }
    }

    return contexts.join(' | ');
  }

  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }
}

/**
 * Usage Example:
 *
 * const matcher = new ArticlePlaceMatcher({ baseUrl: 'http://localhost:3000' }, db);
 * const relations = await matcher.matchArticleToPlaces(articleId);
 *
 * for (const relation of relations) {
 *   db.prepare(`
 *     INSERT INTO article_place_relations
 *     (article_id, place_id, relation_type, confidence, matching_rule_level, evidence, created_at, updated_at)
 *     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
 *   `).run(
 *     relation.article_id,
 *     relation.place_id,
 *     relation.relation_type,
 *     relation.confidence,
 *     relation.matching_rule_level,
 *     relation.evidence
 *   );
 * }
 */

/**
 * Integration with Current Analysis System
 *
 * The article-place matching system integrates seamlessly with the existing analysis background task system.
 * When articles are analyzed, place matching can be performed as part of the page analysis stage.
 */

/**
 * Integration Architecture
 *
 * Current Analysis System Flow:
 * 1. AnalysisTask.execute() → page-analysis stage
 * 2. Calls analysePages() from analyse-pages-core.js
 * 3. analysePages() processes articles and updates analysis metadata
 * 4. Results stored in articles table (analysis_version, analysis_data, etc.)
 *
 * Integration Points:
 * ┌─────────────────────────────────────────────────────────┐
 * │  AnalysisTask.execute()                                 │
 * │  ├── page-analysis stage                                │
 * │  │   ├── analysePages() (existing)                      │
 * │  │   │   ├── Process article content                    │
 * │  │   │   ├── Extract places/topics/quality              │
 * │  │   │   └── Update articles table                      │
 * │  │   └── matchArticlePlaces() (NEW)                    │
 * │  │       ├── ArticlePlaceMatcher.matchArticleToPlaces()│
 * │  │       ├── Store in article_place_relations          │
 * │  │       └── Update progress/stats                      │
 * │  ├── domain-analysis stage (existing)                  │
 * │  └── milestones stage (existing)                       │
 * └─────────────────────────────────────────────────────────┘
 */

/**
 * Integration Implementation
 *
 * 1. Add Place Matching to AnalysisTask
 *
 * File: src/background/tasks/AnalysisTask.js
 *
 * Add to constructor options:
 * this.placeMatchingEnabled = config.placeMatchingEnabled || false;
 * this.placeMatchingRuleLevel = config.placeMatchingRuleLevel || 1;
 *
 * Add to _runPageAnalysis():
 * if (this.placeMatchingEnabled) {
 *   await this._runPlaceMatching();
 * }
 *
 * Add new method:
 * async _runPlaceMatching() {
 *   const matcher = new ArticlePlaceMatcher({
 *     baseUrl: `${this.serverUrl}/api/gazetteer`,
 *     db: this.db
 *   });
 *
 *   // Get articles that need place matching
 *   const articles = this.db.prepare(`
 *     SELECT id FROM articles
 *     WHERE analysis_version >= ?
 *     AND id NOT IN (
 *       SELECT article_id FROM article_place_relations
 *       WHERE matching_rule_level >= ?
 *     )
 *     ORDER BY id
 *     LIMIT ?
 *   `).all(this.analysisVersion, this.placeMatchingRuleLevel, this.batchSize);
 *
 *   for (const article of articles) {
 *     if (this.shouldPause()) break;
 *
 *     try {
 *       const relations = await matcher.matchArticleToPlaces(article.id);
 *
 *       // Store relations
 *       for (const relation of relations) {
 *         this.db.prepare(`
 *           INSERT OR REPLACE INTO article_place_relations
 *           (article_id, place_id, relation_type, confidence, matching_rule_level, evidence, created_at, updated_at)
 *           VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
 *         `).run(
 *           relation.article_id, relation.place_id, relation.relation_type,
 *           relation.confidence, relation.matching_rule_level, relation.evidence
 *         );
 *       }
 *
 *       this.stats.placesMatched += relations.length;
 *       this.stats.articlesPlaceMatched++;
 *
 *     } catch (error) {
 *       this.stats.placeMatchingErrors++;
 *       console.error(`Place matching failed for article ${article.id}:`, error);
 *     }
 *
 *     // Progress update
 *     this.onProgress({
 *       current: this.stats.articlesProcessed + this.stats.articlesPlaceMatched,
 *       total: this.totalArticles,
 *       message: `Articles: ${this.stats.articlesProcessed}/${this.totalArticles}, Places: ${this.stats.placesMatched}`,
 *       metadata: {
 *         stage: 'place-matching',
 *         stats: this.stats
 *       }
 *     });
 *   }
 * }
 */

/**
 * 2. Update Task Configuration
 *
 * File: src/background/tasks/taskDefinitions.js
 *
 * Add to 'analysis-run' fields:
 * {
 *   name: 'placeMatchingEnabled',
 *   label: 'Enable Place Matching',
 *   type: FieldType.BOOLEAN,
 *   default: false,
 *   description: 'Associate articles with places using rule-based matching'
 * },
 * {
 *   name: 'placeMatchingRuleLevel',
 *   label: 'Matching Rule Level',
 *   type: FieldType.NUMBER,
 *   default: 1,
 *   min: 1,
 *   max: 4,
 *   description: 'Algorithm sophistication (1=basic, 4=NLP-enhanced)'
 * }
 */

/**
 * 3. Update API Endpoint
 *
 * File: src/ui/express/routes/api.analysis-control.js
 *
 * Update POST /api/analysis/start-background to accept:
 * {
 *   "placeMatchingEnabled": true,
 *   "placeMatchingRuleLevel": 1,
 *   ...existing options
 * }
 */

/**
 * 4. Update Progress Reporting
 *
 * Add to AnalysisTask stats initialization:
 * this.stats.placesMatched = 0;
 * this.stats.articlesPlaceMatched = 0;
 * this.stats.placeMatchingErrors = 0;
 *
 * Update progress messages to include place matching stats.
 */

/**
 * 5. Database Schema Integration
 *
 * The article_place_relations table is created by migration 008-article-place-relations.sql
 * This migration should be applied before enabling place matching in analysis tasks.
 *
 * Verification:
 * SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='article_place_relations';
 * -- Should return 1 if migration applied
 */

/**
 * 6. UI Integration
 *
 * Update background tasks UI to show place matching progress:
 * - Add "Places Matched" to task progress display
 * - Show place matching statistics in task details
 * - Display place matching errors if any
 */

/**
 * Usage Examples
 *
 * 1. Enable Place Matching in Analysis Task:
 * POST /api/analysis/start-background
 * {
 *   "analysisVersion": 1,
 *   "pageLimit": 1000,
 *   "placeMatchingEnabled": true,
 *   "placeMatchingRuleLevel": 1
 * }
 *
 * 2. Monitor Progress via SSE:
 * Event: task-progress
 * Data: {
 *   "taskId": 42,
 *   "progress_current": 750,
 *   "progress_total": 1000,
 *   "message": "Articles: 500/1000, Places: 1250",
 *   "metadata": {
 *     "stage": "place-matching",
 *     "stats": {
 *       "articlesProcessed": 500,
 *       "placesMatched": 1250,
 *       "articlesPlaceMatched": 450
 *     }
 *   }
 * }
 *
 * 3. Query Results:
 * GET /api/articles/123/places
 * {
 *   "article": { "id": 123, "title": "California Fires Update" },
 *   "relations": [
 *     {
 *       "place": { "id": 456, "name": "California" },
 *       "relation_type": "primary",
 *       "confidence": 0.9,
 *       "matching_rule_level": 1,
 *       "evidence": { "rule": "basic_string_match", "matches": ["California"] }
 *     }
 *   ]
 * }
 */

/**
 * Benefits of Integration
 *
 * 1. **Unified Processing**: Place matching runs alongside existing analysis
 * 2. **Resource Efficiency**: Shares database connections and progress tracking
 * 3. **User Control**: Can be enabled/disabled per analysis run
 * 4. **Incremental Updates**: Only processes articles that haven't been matched yet
 * 5. **Error Isolation**: Place matching failures don't stop overall analysis
 * 6. **Progress Visibility**: Users see place matching progress in real-time
 * 7. **Background Task Benefits**: Pause/resume, persistence, error recovery
 */

/**
 * Migration Strategy
 *
 * Phase 1: Schema Only
 * - Apply migration 008-article-place-relations.sql
 * - Verify table creation
 * - No functional changes yet
 *
 * Phase 2: Core Integration
 * - Add ArticlePlaceMatcher to AnalysisTask
 * - Enable via configuration flag
 * - Test with small batches
 *
 * Phase 3: UI Updates
 * - Update progress displays
 * - Add configuration options
 * - Test end-to-end flow
 *
 * Phase 4: Optimization
 * - Add batch processing
 * - Optimize database queries
 * - Add caching for gazetteer data
 */

/**
 * Implementation Plan (Simplified for Speed)
 *
 * Focus: Get basic matching working fast, use false positives to guide improvements
 *
 * Phase 1: Basic String Matching (Rule Level 1) - START HERE
 * - Create schema migration
 * - Implement basic ArticlePlaceMatcher class
 * - Add core API endpoints
 * - Test with sample articles (accept false positives)
 *
 * Phase 2: Context-Aware Matching (Rule Level 2)
 * - Add position/frequency analysis
 * - Headline prioritization
 * - Improved confidence scoring
 *
 * Phase 3: Entity Disambiguation (Rule Level 3)
 * - Handle ambiguous names (Paris city vs Paris person)
 * - Basic person/place conflict resolution
 *
 * Phase 4: WinkNLP Integration (Rule Level 4)
 * - Add WinkNLP for English text analysis
 * - Focus on speed and accuracy improvements
 *
 * Future: Advanced AI (when current system proves valuable)
 * - Local LLM integration for complex disambiguation
 * - AI-powered verification of edge cases
 * - Multi-language support
 */

/**
 * User Contribution System (Separate from Automated Matching)
 *
 * This system allows users/bots to submit place-article relationships while protecting
 * against malicious submissions. It's completely separate from the automated rule levels.
 */

-- POST /api/articles/:id/submit-place-relation
// Allow users to submit place-article relationships
{
  "place_id": 123,
  "relation_type": "primary",
  "source": "user_submission",
  "user_id": "optional_user_identifier",
  "evidence": "Optional explanation or source"
}

-- GET /api/articles/:id/user-relations
// Get user-submitted relations for an article
{
  "relations": [
    {
      "id": 456,
      "place_id": 123,
      "relation_type": "primary",
      "submitted_by": "user123",
      "submitted_at": "2025-10-18T10:00:00Z",
      "status": "pending_review",
      "evidence": "Found in article metadata"
    }
  ]
}

-- POST /api/user-relations/:id/verify
// AI-powered verification of user submissions
{
  "verified": true,
  "confidence": 0.85,
  "ai_analysis": "Analysis of submission validity",
  "automated_matching_agreement": 0.7
}

-- GET /api/user-relations/stats
// Statistics on user contributions
{
  "total_submissions": 1540,
  "verified_relations": 1200,
  "rejected_submissions": 340,
  "malicious_attempts_detected": 45,
  "top_contributors": [...]
}

/**
 * Malicious Submission Detection
 *
 * - Rate limiting per IP/user
 * - Pattern analysis for spam/bot submissions
 * - Cross-reference with automated matching results
 * - AI analysis of submission quality and intent
 * - Community flagging system
 */

/**
 * Space-Efficient Storage Design
 *
 * - Compress evidence JSON using existing compression infrastructure
 * - Use integer enums for relation types instead of strings
 * - Archive old rule level results when superseded
 * - Deduplicate common evidence patterns
 * - Use variable-precision confidence scores (e.g., 0.1 granularity for low-confidence)
 */

/**
 * Performance Considerations
 *
 * - Cache gazetteer data to avoid repeated API calls
 * - Process articles in batches to reduce database load
 * - Use background tasks for large matching operations
 * - Index on confidence for fast high-confidence queries
 * - Store evidence efficiently (compress JSON if needed)
 *
 * Expected Performance:
 * - Level 1 matching: ~50 articles/second
 * - Level 2 matching: ~20 articles/second
 * - Level 3 matching: ~10 articles/second
 * - Level 4 matching: ~5 articles/second (with WinkNLP)
 *
 * Design Philosophy: Fast > Perfect
 * - Accept false positives initially - they guide rule improvements
 * - Focus on speed and coverage over accuracy
 * - Use false positives as training data for refinements
 * - Iterate quickly based on real-world results
 *
 * Space Efficiency Features:
 * - Evidence compression using existing brotli infrastructure
 * - Enum-based relation types (saves ~60% vs string storage)
 * - Confidence score quantization (0.05 precision for scores <0.8)
 * - Evidence deduplication (common patterns stored once)
 * - Rule level archiving (old results compressed when superseded)
 * - User submission evidence optional (can be minimal for space)
 */

/**
 * Fast Implementation Strategy
 *
 * 1. Start Simple (Level 1 Only)
 *    - Basic string matching against gazetteer names
 *    - No fancy scoring - just presence/absence
 *    - Accept all matches above minimum threshold
 *    - Goal: Get something working in hours, not days
 *
 * 2. Measure False Positives
 *    - Track what gets incorrectly matched
 *    - Identify patterns (person names, company names, etc.)
 *    - Use as input for Level 2 improvements
 *
 * 3. Iterative Refinement
 *    - Add one improvement at a time
 *    - Test impact on false positive rate
 *    - Keep what works, discard what doesn't
 *    - Focus on high-impact, low-effort changes
 *
 * 4. False Positive Examples to Expect:
 *    - "Paris Hilton" → Paris, France
 *    - "London Fog" (company) → London, UK
 *    - "Rome wasn't built in a day" → Rome, Italy
 *    - "California Pizza Kitchen" → California, USA
 *    - "Jordan shoes" → Jordan (country)
 *
 * 5. Quick Wins for Level 2:
 *    - Require matches in headline/title
 *    - Penalize matches that are part of longer words
 *    - Boost score for multiple mentions
 *    - Add basic person name filtering
 */