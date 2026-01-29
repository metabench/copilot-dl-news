/**
 * Article-Place Matching System
 *
 * Matches articles to places using configurable rule levels with confidence scoring.
 * Gazetteer provides place data, matcher applies rules and stores results.
 */

const { HtmlArticleExtractor } = require('../../shared/utils/HtmlArticleExtractor');

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

class ArticlePlaceMatcher {
  constructor(options = {}) {
    this.gazetteerApi = options.gazetteerApi || { baseUrl: 'http://localhost:3000' };
    this.db = options.db;
    this.placeCache = new Map(); // Cache place data
    this.cacheExpiry = options.cacheExpiry || 5 * 60 * 1000; // 5 minutes
    this.lastCacheUpdate = 0;
    this.mockPlaces = options.gazetteerApi?.mockPlaces; // For testing
    this.textSampleLimit = options.textSampleLimit || null; // Limit text for processing/display

    // HTML analysis for extracting article content
    this.htmlExtractor = new HtmlArticleExtractor({
      minWordCount: 10, // Lower threshold for place matching
      maxNavigationDensity: 0.3
    });
  }

  /**
   * Match a single article to places using specified rule level
   */
  async matchArticleToPlaces(articleId, ruleLevel = 1) {
    // Get article data from normalized tables
    const articleData = this.db.prepare(`
      SELECT
        hr.id,
        ca.title,
        cs.content_blob as html_content,
        ca.analysis_json
      FROM http_responses hr
      LEFT JOIN content_analysis ca ON hr.id = ca.content_id
      LEFT JOIN content_storage cs ON hr.id = cs.http_response_id
      WHERE hr.id = ?
    `).get(articleId);

    if (!articleData) return [];

    const text = this.extractText(articleData);

    const placeCandidates = await this.findPlaceMentions(text, ruleLevel);

    const relations = [];
    for (const candidate of placeCandidates) {
      const confidence = this.calculateConfidence(candidate, text, ruleLevel);
      if (confidence >= CONFIDENCE_THRESHOLDS.reject) {
        relations.push({
          article_id: articleId,
          place_id: candidate.placeId,
          place_name: candidate.canonicalName,
          relation_type: this.determineRelationType(candidate, text),
          confidence,
          matching_rule_level: ruleLevel,
          evidence: JSON.stringify({
            rule: MATCHING_RULE_LEVELS[ruleLevel],
            matches: candidate.matches,
            context: candidate.context,
            metadata: candidate.metadata || {}
          })
        });
      }
    }

    return relations;
  }

  /**
   * Store article-place relations in database
   */
  async storeArticlePlaces(relations) {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO article_place_relations
      (article_id, place_id, relation_type, confidence, matching_rule_level, evidence, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    const insertMany = this.db.transaction((relations) => {
      for (const relation of relations) {
        try {
          insert.run(
            relation.article_id,
            relation.place_id,
            relation.relation_type,
            relation.confidence,
            relation.matching_rule_level,
            relation.evidence
          );
        } catch (err) {
          console.error('Failed to insert relation:', JSON.stringify(relation, null, 2));
          console.error('Error:', err.message);
          throw err;
        }
      }
    });

    insertMany(relations);
    return relations.length;
  }

  /**
   * Get stored article-place relations for an article
   */
  getArticlePlaces(articleId) {
    return this.db.prepare(`
      SELECT apr.*, pn.name as place_name
      FROM article_place_relations apr
      JOIN places p ON apr.place_id = p.id
      JOIN place_names pn ON p.canonical_name_id = pn.id
      WHERE apr.article_id = ?
      ORDER BY apr.confidence DESC
    `).all(articleId);
  }

  /**
   * Find place mentions in text using specified rule level
   */
  async findPlaceMentions(text, ruleLevel = 1) {
    const places = await this.getAllPlaces();
    const candidates = [];

    for (const place of places) {
      let matches = [];

      switch (ruleLevel) {
        case 1:
          matches = this.findBasicMatches(text, place.names);
          break;
        case 2:
          matches = this.findContextAwareMatches(text, place.names);
          break;
        case 3:
          matches = this.findEntityDisambiguationMatches(text, place.names);
          break;
        case 4:
          matches = await this.findNlpEnhancedMatches(text, place.names);
          break;
        default:
          matches = this.findBasicMatches(text, place.names);
      }

      if (matches.length > 0) {
        candidates.push({
          placeId: place.id,
          canonicalName: place.canonicalName || place.names[0] || `Place ${place.id}`,
          names: place.names,
          matches,
          context: this.extractContext(text, matches),
          metadata: { ruleLevel }
        });
      }
    }

    return candidates;
  }

  /**
   * Level 1: Basic string matching
   */
  findBasicMatches(text, placeNames) {
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

  /**
   * Level 2: Context-aware matching
   */
  findContextAwareMatches(text, placeNames) {
    const basicMatches = this.findBasicMatches(text, placeNames);
    const enhancedMatches = [];

    for (const match of basicMatches) {
      let score = match.count;

      // Boost headline matches
      if (text.toLowerCase().startsWith('headline:')) {
        const headlineEnd = text.indexOf('\n\n');
        const headline = headlineEnd > 0 ? text.substring(0, headlineEnd) : text;
        if (headline.toLowerCase().includes(match.name.toLowerCase())) {
          score *= 2;
        }
      }

      // Boost early mentions
      const firstPosition = Math.min(...match.positions);
      const positionRatio = firstPosition / text.length;
      if (positionRatio < 0.1) { // In first 10% of text
        score *= 1.5;
      }

      enhancedMatches.push({
        ...match,
        score
      });
    }

    return enhancedMatches;
  }

  /**
   * Level 3: Entity disambiguation (placeholder for now)
   */
  findEntityDisambiguationMatches(text, placeNames) {
    // For now, use context-aware matching
    // Future: Add logic to distinguish places from people/things
    return this.findContextAwareMatches(text, placeNames);
  }

  /**
   * Level 4: NLP-enhanced matching (placeholder for now)
   */
  async findNlpEnhancedMatches(text, placeNames) {
    // For now, use context-aware matching
    // Future: Integrate WinkNLP for better entity recognition
    return this.findContextAwareMatches(text, placeNames);
  }

  /**
   * Calculate confidence score based on rule level
   */
  calculateConfidence(candidate, text, ruleLevel = 1) {
    let score = 0.5; // Base score for any match

    // Rule level base score
    const ruleMultipliers = {
      1: 1.0,   // Basic string matching
      2: 1.2,   // Context-aware
      3: 1.4,   // Entity disambiguation
      4: 1.6    // NLP-enhanced
    };

    score *= ruleMultipliers[ruleLevel] || 1.0;

    // Frequency bonus
    const totalMentions = candidate.matches.reduce((sum, m) => sum + (m.count || m.score || 1), 0);
    score += Math.min(totalMentions * 0.1, 0.3);

    // Position bonus (earlier mentions = more relevant)
    const positions = candidate.matches.flatMap(m => m.positions || []);
    if (positions.length > 0) {
      const firstPosition = Math.min(...positions);
      const positionRatio = firstPosition / text.length;
      score += (1 - positionRatio) * 0.2; // Earlier = higher score
    }

    // Context bonus (headline matches = very relevant)
    if (candidate.context && candidate.context.includes('headline')) {
      score += 0.2;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Determine relation type based on context
   */
  determineRelationType(candidate, text) {
    const totalMentions = candidate.matches.reduce((sum, m) => sum + (m.count || m.score || 1), 0);

    if (totalMentions >= 5) return 'primary';
    if (totalMentions >= 3) return 'secondary';
    if (candidate.context && candidate.context.includes('headline')) return 'primary';
    return 'mentioned';
  }

  /**
   * Get all places from gazetteer (with caching and mock support)
   */
  async getAllPlaces() {
    // Return mock data if provided (for testing)
    if (this.mockPlaces) {
      return this.mockPlaces.map(place => ({
        id: place.id,
        names: this.extractAllNames(place)
      }));
    }

    const now = Date.now();
    if (this.placeCache.size > 0 && (now - this.lastCacheUpdate) < this.cacheExpiry) {
      return Array.from(this.placeCache.values());
    }

    try {
      // Use gazetteer API to get place data
      const response = await fetch(`${this.gazetteerApi.baseUrl}/api/gazetteer/places`);
      const places = await response.json();

      this.placeCache.clear();
      for (const place of places) {
        this.placeCache.set(place.id, {
          id: place.id,
          names: this.extractAllNames(place)
        });
      }

      this.lastCacheUpdate = now;
      return Array.from(this.placeCache.values());
    } catch (error) {
      console.error('Failed to fetch places from gazetteer:', error);
      // Return cached data if available, otherwise empty array
      return this.placeCache.size > 0 ? Array.from(this.placeCache.values()) : [];
    }
  }

  /**
   * Extract all name variants for a place
   */
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

  /**
   * Extract searchable text from article (normalized schema)
   */
  extractText(article) {
    let text = '';

    // Title is most important for place matching
    if (article.title) {
      text += `HEADLINE: ${article.title}\n\n`;
    }

    // Extract article content using HTML analysis
    if (article.html_content) {
      const htmlString = Buffer.isBuffer(article.html_content) 
        ? article.html_content.toString('utf8') 
        : String(article.html_content);

      const extractionResult = this.htmlExtractor.extractForPlaceMatching(
        htmlString,
        null, // No URL available
        {
          maxLength: this.textSampleLimit,
          removeNavigation: true
        }
      );

      if (extractionResult) {
        text += extractionResult;
      } else {
        // Fallback to basic extraction if HTML analysis fails
        console.warn(`HTML analysis failed for article ${article.id}, using fallback`);
        text += this.stripHtml(htmlString);
      }
    }

    // Try to extract text from analysis_json if available (fallback)
    if (!text && article.analysis_json) {
      try {
        const analysis = JSON.parse(article.analysis_json);
        if (analysis.extractedText) {
          text += analysis.extractedText;
        }
      } catch (e) {
        // Ignore JSON parse errors
      }
    }

    // If still no content, use just the title
    if (!text && article.title) {
      text = article.title;
    }

    return text || '';
  }

  /**
   * Extract searchable text from article with extended metadata (ArticlePlus mode)
   *
   * Includes title, byline, publication date, and other metadata for richer analysis.
   */
  extractTextPlus(article, url = null) {
    let text = '';

    // Title is most important for place matching
    if (article.title) {
      text += `HEADLINE: ${article.title}\n\n`;
    }

    // Extract article content using ArticlePlus extraction
    if (article.html_content) {
      const extractionResult = this.htmlExtractor.extractPlus(
        article.html_content,
        url || `https://article-${article.id}.com`
      );

      if (extractionResult.success) {
        // Include main article text
        text += extractionResult.text;

        // Add metadata for context (but not for place matching)
        const metadata = extractionResult.metadata;
        if (metadata.byline) {
          text += `\n\nBYLINE: ${metadata.byline}`;
        }
        if (metadata.publicationDate) {
          text += `\n\nPUBLISHED: ${metadata.publicationDate}`;
        }
        if (metadata.articleMeta?.category) {
          text += `\n\nCATEGORY: ${metadata.articleMeta.category}`;
        }
        if (metadata.articleMeta?.tags && metadata.articleMeta.tags.length > 0) {
          text += `\n\nTAGS: ${metadata.articleMeta.tags.join(', ')}`;
        }

        // Store extended metadata for later use
        this.lastExtractionMetadata = metadata;
      } else {
        // Fallback to basic extraction if ArticlePlus fails
        console.warn(`ArticlePlus extraction failed for article ${article.id}: ${extractionResult.error}`);
        text += this.extractText(article); // Use regular extraction as fallback
      }
    }

    return text || '';
  }

  /**
   * Match article to places using ArticlePlus extraction
   */
  async matchArticleToPlacesPlus(articleId, ruleLevel = 1, url = null) {
    // Get article data from normalized tables
    const articleData = this.db.prepare(`
      SELECT
        hr.id,
        ca.title,
        cs.content_blob as html_content,
        ca.analysis_json
      FROM http_responses hr
      LEFT JOIN content_analysis ca ON hr.id = ca.content_id
      LEFT JOIN content_storage cs ON hr.id = cs.http_response_id
      WHERE hr.id = ?
    `).get(articleId);

    if (!articleData) return [];

    const text = this.extractTextPlus(articleData, url);

    const placeCandidates = await this.findPlaceMentions(text, ruleLevel);

    const relations = [];
    for (const candidate of placeCandidates) {
      const confidence = this.calculateConfidence(candidate, text, ruleLevel);
      if (confidence >= CONFIDENCE_THRESHOLDS.reject) {
        relations.push({
          article_id: articleId,
          place_id: candidate.placeId,
          place_name: candidate.canonicalName,
          relation_type: this.determineRelationType(candidate, text),
          confidence,
          matching_rule_level: ruleLevel,
          evidence: JSON.stringify({
            rule: MATCHING_RULE_LEVELS[ruleLevel],
            matches: candidate.matches,
            context: candidate.context,
            metadata: {
              ...candidate.metadata,
              extractionMode: 'articlePlus',
              extendedMetadata: this.lastExtractionMetadata || {}
            }
          })
        });
      }
    }

    return relations;
  }

  /**
   * Extract context snippets around matches
   */
  extractContext(text, matches) {
    const contexts = [];

    for (const match of matches) {
      const positions = match.positions || [];
      for (const position of positions) {
        const start = Math.max(0, position - 50);
        const end = Math.min(text.length, position + (match.name || '').length + 50);
        const snippet = text.substring(start, end);
        contexts.push(snippet);
      }
    }

    return contexts.join(' | ');
  }

  /**
   * Utility: Escape regex special characters
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Utility: Strip HTML tags (fallback)
   */
  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }
}

module.exports = {
  ArticlePlaceMatcher,
  MATCHING_RULE_LEVELS,
  RELATION_TYPES,
  CONFIDENCE_THRESHOLDS
};