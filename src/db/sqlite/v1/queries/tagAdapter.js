'use strict';

/**
 * Tag Database Adapter
 * 
 * Provides database access for content tagging:
 * - Keywords (TF-IDF scores)
 * - Categories (topic classification)
 * - Entities (NER results)
 * - Document frequencies (corpus statistics)
 * 
 * @module tagAdapter
 */

/**
 * Create tag adapter
 * @param {import('better-sqlite3').Database} db - better-sqlite3 database instance
 * @returns {Object} Tag adapter methods
 */
function createTagAdapter(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('createTagAdapter requires a better-sqlite3 database handle');
  }
  
  // Ensure tables exist (idempotent)
  db.exec(`
    -- Article Keywords (TF-IDF extracted)
    CREATE TABLE IF NOT EXISTS article_keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id INTEGER NOT NULL,
      keyword TEXT NOT NULL,
      score REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(content_id) REFERENCES content_analysis(id) ON DELETE CASCADE,
      UNIQUE(content_id, keyword)
    );

    -- Article Categories (Rule-based classification)
    CREATE TABLE IF NOT EXISTS article_categories (
      content_id INTEGER PRIMARY KEY,
      category TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.0,
      secondary_category TEXT,
      secondary_confidence REAL,
      classified_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(content_id) REFERENCES content_analysis(id) ON DELETE CASCADE
    );

    -- Article Entities (Named Entity Recognition)
    CREATE TABLE IF NOT EXISTS article_entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id INTEGER NOT NULL,
      entity_text TEXT NOT NULL,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('PERSON', 'ORG', 'GPE')),
      confidence REAL DEFAULT 1.0,
      start_offset INTEGER,
      end_offset INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(content_id) REFERENCES content_analysis(id) ON DELETE CASCADE,
      UNIQUE(content_id, entity_text, entity_type, start_offset)
    );

    -- Document Frequencies (for TF-IDF calculation)
    CREATE TABLE IF NOT EXISTS document_frequencies (
      term TEXT PRIMARY KEY,
      doc_count INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_article_keywords_content ON article_keywords(content_id);
    CREATE INDEX IF NOT EXISTS idx_article_keywords_keyword ON article_keywords(keyword);
    CREATE INDEX IF NOT EXISTS idx_article_keywords_score ON article_keywords(score DESC);

    CREATE INDEX IF NOT EXISTS idx_article_categories_category ON article_categories(category);
    CREATE INDEX IF NOT EXISTS idx_article_categories_confidence ON article_categories(confidence DESC);

    CREATE INDEX IF NOT EXISTS idx_article_entities_content ON article_entities(content_id);
    CREATE INDEX IF NOT EXISTS idx_article_entities_type ON article_entities(entity_type);
    CREATE INDEX IF NOT EXISTS idx_article_entities_text ON article_entities(entity_text);

    CREATE INDEX IF NOT EXISTS idx_document_frequencies_count ON document_frequencies(doc_count DESC);
  `);
  
  // Prepared statements
  const stmts = {
    // Keywords
    saveKeyword: db.prepare(`
      INSERT OR REPLACE INTO article_keywords (content_id, keyword, score, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `),
    
    getKeywords: db.prepare(`
      SELECT content_id, keyword, score, created_at
      FROM article_keywords
      WHERE content_id = ?
      ORDER BY score DESC
    `),
    
    deleteKeywords: db.prepare(`
      DELETE FROM article_keywords WHERE content_id = ?
    `),
    
    getTopKeywords: db.prepare(`
      SELECT keyword, COUNT(*) as article_count, AVG(score) as avg_score
      FROM article_keywords
      GROUP BY keyword
      ORDER BY article_count DESC
      LIMIT ?
    `),
    
    getArticlesByKeyword: db.prepare(`
      SELECT ak.content_id, ak.score, ca.title
      FROM article_keywords ak
      JOIN content_analysis ca ON ca.id = ak.content_id
      WHERE ak.keyword = ?
      ORDER BY ak.score DESC
      LIMIT ? OFFSET ?
    `),
    
    // Categories
    saveCategory: db.prepare(`
      INSERT OR REPLACE INTO article_categories 
        (content_id, category, confidence, secondary_category, secondary_confidence, classified_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `),
    
    getCategory: db.prepare(`
      SELECT content_id, category, confidence, secondary_category, secondary_confidence, classified_at
      FROM article_categories
      WHERE content_id = ?
    `),
    
    deleteCategory: db.prepare(`
      DELETE FROM article_categories WHERE content_id = ?
    `),
    
    getCategoryStats: db.prepare(`
      SELECT category, COUNT(*) as article_count, AVG(confidence) as avg_confidence
      FROM article_categories
      GROUP BY category
      ORDER BY article_count DESC
    `),
    
    getArticlesByCategory: db.prepare(`
      SELECT ac.content_id, ac.confidence, ca.title
      FROM article_categories ac
      JOIN content_analysis ca ON ca.id = ac.content_id
      WHERE ac.category = ?
      ORDER BY ac.confidence DESC
      LIMIT ? OFFSET ?
    `),
    
    // Entities
    saveEntity: db.prepare(`
      INSERT OR REPLACE INTO article_entities 
        (content_id, entity_text, entity_type, confidence, start_offset, end_offset, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `),
    
    getEntities: db.prepare(`
      SELECT content_id, entity_text, entity_type, confidence, start_offset, end_offset, created_at
      FROM article_entities
      WHERE content_id = ?
      ORDER BY confidence DESC
    `),
    
    getEntitiesByType: db.prepare(`
      SELECT content_id, entity_text, entity_type, confidence, start_offset, end_offset
      FROM article_entities
      WHERE content_id = ? AND entity_type = ?
      ORDER BY confidence DESC
    `),
    
    deleteEntities: db.prepare(`
      DELETE FROM article_entities WHERE content_id = ?
    `),
    
    getTopEntities: db.prepare(`
      SELECT entity_text, entity_type, COUNT(*) as article_count
      FROM article_entities
      GROUP BY entity_text, entity_type
      ORDER BY article_count DESC
      LIMIT ?
    `),
    
    getArticlesByEntity: db.prepare(`
      SELECT ae.content_id, ae.confidence, ca.title
      FROM article_entities ae
      JOIN content_analysis ca ON ca.id = ae.content_id
      WHERE ae.entity_text = ? AND ae.entity_type = ?
      ORDER BY ae.confidence DESC
      LIMIT ? OFFSET ?
    `),
    
    // Document Frequencies
    saveDocumentFrequency: db.prepare(`
      INSERT OR REPLACE INTO document_frequencies (term, doc_count, updated_at)
      VALUES (?, ?, datetime('now'))
    `),
    
    getDocumentFrequency: db.prepare(`
      SELECT term, doc_count, updated_at
      FROM document_frequencies
      WHERE term = ?
    `),
    
    getAllDocumentFrequencies: db.prepare(`
      SELECT term, doc_count, updated_at
      FROM document_frequencies
      ORDER BY doc_count DESC
      LIMIT ?
    `),
    
    getDocumentFrequencyStats: db.prepare(`
      SELECT 
        COUNT(*) as total_terms,
        SUM(doc_count) as total_occurrences,
        MAX(doc_count) as max_doc_count,
        AVG(doc_count) as avg_doc_count
      FROM document_frequencies
    `),
    
    incrementDocumentFrequency: db.prepare(`
      INSERT INTO document_frequencies (term, doc_count, updated_at)
      VALUES (?, 1, datetime('now'))
      ON CONFLICT(term) DO UPDATE SET 
        doc_count = doc_count + 1,
        updated_at = datetime('now')
    `),
    
    // Counting
    countTaggedArticles: db.prepare(`
      SELECT 
        (SELECT COUNT(DISTINCT content_id) FROM article_keywords) as with_keywords,
        (SELECT COUNT(*) FROM article_categories) as with_categories,
        (SELECT COUNT(DISTINCT content_id) FROM article_entities) as with_entities
    `),
    
    // Articles without tags
    getArticlesWithoutTags: db.prepare(`
      SELECT 
        ca.id as content_id,
        ca.body_text,
        ca.title
      FROM content_analysis ca
      LEFT JOIN article_categories ac ON ac.content_id = ca.id
      WHERE ac.content_id IS NULL
        AND ca.body_text IS NOT NULL
        AND length(ca.body_text) > 100
      ORDER BY ca.id
      LIMIT ? OFFSET ?
    `),
    
    countArticlesWithoutTags: db.prepare(`
      SELECT COUNT(*) as total
      FROM content_analysis ca
      LEFT JOIN article_categories ac ON ac.content_id = ca.id
      WHERE ac.content_id IS NULL
        AND ca.body_text IS NOT NULL
        AND length(ca.body_text) > 100
    `)
  };
  
  return {
    // =================== Keywords ===================
    
    /**
     * Save keywords for an article
     * @param {number} contentId - Content ID
     * @param {Array<{keyword: string, score: number}>} keywords - Keywords with scores
     * @returns {{saved: number}}
     */
    saveKeywords(contentId, keywords) {
      const insertMany = db.transaction((kws) => {
        // Clear existing keywords first
        stmts.deleteKeywords.run(contentId);
        
        let saved = 0;
        for (const { keyword, score } of kws) {
          stmts.saveKeyword.run(contentId, keyword, score);
          saved++;
        }
        return saved;
      });
      
      const saved = insertMany(keywords);
      return { saved };
    },
    
    /**
     * Get keywords for an article
     * @param {number} contentId - Content ID
     * @returns {Array<{keyword: string, score: number}>}
     */
    getKeywords(contentId) {
      const rows = stmts.getKeywords.all(contentId);
      return rows.map(r => ({
        keyword: r.keyword,
        score: r.score,
        createdAt: r.created_at
      }));
    },
    
    /**
     * Get most common keywords across all articles
     * @param {number} [limit=50] - Max keywords to return
     * @returns {Array<{keyword: string, articleCount: number, avgScore: number}>}
     */
    getTopKeywords(limit = 50) {
      const rows = stmts.getTopKeywords.all(limit);
      return rows.map(r => ({
        keyword: r.keyword,
        articleCount: r.article_count,
        avgScore: Math.round(r.avg_score * 10000) / 10000
      }));
    },
    
    /**
     * Get articles containing a keyword
     * @param {string} keyword - Keyword to search
     * @param {Object} [options] - Pagination options
     * @returns {Array<{contentId: number, score: number, title: string}>}
     */
    getArticlesByKeyword(keyword, { page = 1, limit = 20 } = {}) {
      const offset = (page - 1) * limit;
      const rows = stmts.getArticlesByKeyword.all(keyword, limit, offset);
      return rows.map(r => ({
        contentId: r.content_id,
        score: r.score,
        title: r.title
      }));
    },
    
    // =================== Categories ===================
    
    /**
     * Save category for an article
     * @param {Object} classification - Classification result
     * @returns {{changes: number}}
     */
    saveCategory({ contentId, category, confidence, secondaryCategory = null, secondaryConfidence = null }) {
      const result = stmts.saveCategory.run(
        contentId,
        category,
        confidence,
        secondaryCategory,
        secondaryConfidence
      );
      return { changes: result.changes };
    },
    
    /**
     * Get category for an article
     * @param {number} contentId - Content ID
     * @returns {Object|null}
     */
    getCategory(contentId) {
      const row = stmts.getCategory.get(contentId);
      if (!row) return null;
      
      return {
        category: row.category,
        confidence: row.confidence,
        secondaryCategory: row.secondary_category,
        secondaryConfidence: row.secondary_confidence,
        classifiedAt: row.classified_at
      };
    },
    
    /**
     * Get category statistics
     * @returns {Array<{category: string, articleCount: number, avgConfidence: number}>}
     */
    getCategoryStats() {
      const rows = stmts.getCategoryStats.all();
      return rows.map(r => ({
        category: r.category,
        articleCount: r.article_count,
        avgConfidence: Math.round(r.avg_confidence * 1000) / 1000
      }));
    },
    
    /**
     * Get articles by category
     * @param {string} category - Category name
     * @param {Object} [options] - Pagination options
     * @returns {Array<{contentId: number, confidence: number, title: string}>}
     */
    getArticlesByCategory(category, { page = 1, limit = 20 } = {}) {
      const offset = (page - 1) * limit;
      const rows = stmts.getArticlesByCategory.all(category, limit, offset);
      return rows.map(r => ({
        contentId: r.content_id,
        confidence: r.confidence,
        title: r.title
      }));
    },
    
    // =================== Entities ===================
    
    /**
     * Save entities for an article
     * @param {number} contentId - Content ID
     * @param {Array<{text: string, type: string, confidence: number, start?: number, end?: number}>} entities
     * @returns {{saved: number}}
     */
    saveEntities(contentId, entities) {
      const insertMany = db.transaction((ents) => {
        // Clear existing entities first
        stmts.deleteEntities.run(contentId);
        
        let saved = 0;
        for (const entity of ents) {
          stmts.saveEntity.run(
            contentId,
            entity.text,
            entity.type,
            entity.confidence,
            entity.start || null,
            entity.end || null
          );
          saved++;
        }
        return saved;
      });
      
      const saved = insertMany(entities);
      return { saved };
    },
    
    /**
     * Get entities for an article
     * @param {number} contentId - Content ID
     * @param {string} [type] - Optional entity type filter
     * @returns {Array<{text: string, type: string, confidence: number, start?: number, end?: number}>}
     */
    getEntities(contentId, type = null) {
      const rows = type 
        ? stmts.getEntitiesByType.all(contentId, type)
        : stmts.getEntities.all(contentId);
      
      return rows.map(r => ({
        text: r.entity_text,
        type: r.entity_type,
        confidence: r.confidence,
        start: r.start_offset,
        end: r.end_offset
      }));
    },
    
    /**
     * Get most common entities across all articles
     * @param {number} [limit=50] - Max entities to return
     * @returns {Array<{text: string, type: string, articleCount: number}>}
     */
    getTopEntities(limit = 50) {
      const rows = stmts.getTopEntities.all(limit);
      return rows.map(r => ({
        text: r.entity_text,
        type: r.entity_type,
        articleCount: r.article_count
      }));
    },
    
    /**
     * Get articles mentioning an entity
     * @param {string} entityText - Entity text
     * @param {string} entityType - Entity type
     * @param {Object} [options] - Pagination options
     * @returns {Array<{contentId: number, confidence: number, title: string}>}
     */
    getArticlesByEntity(entityText, entityType, { page = 1, limit = 20 } = {}) {
      const offset = (page - 1) * limit;
      const rows = stmts.getArticlesByEntity.all(entityText, entityType, limit, offset);
      return rows.map(r => ({
        contentId: r.content_id,
        confidence: r.confidence,
        title: r.title
      }));
    },
    
    // =================== Document Frequencies ===================
    
    /**
     * Save document frequencies (for TF-IDF)
     * @param {Array<{term: string, docCount: number}>} terms
     * @returns {{saved: number}}
     */
    bulkSaveDocumentFrequencies(terms) {
      const insertMany = db.transaction((ts) => {
        let saved = 0;
        for (const { term, docCount } of ts) {
          stmts.saveDocumentFrequency.run(term, docCount);
          saved++;
        }
        return saved;
      });
      
      const saved = insertMany(terms);
      return { saved };
    },
    
    /**
     * Get document frequencies
     * @param {Object} [options] - Options
     * @returns {Array<{term: string, docCount: number}>}
     */
    getDocumentFrequencies({ limit = 10000 } = {}) {
      const rows = stmts.getAllDocumentFrequencies.all(limit);
      return rows.map(r => ({
        term: r.term,
        docCount: r.doc_count
      }));
    },
    
    /**
     * Get document frequency for a single term
     * @param {string} term
     * @returns {{term: string, docCount: number}|null}
     */
    getDocumentFrequency(term) {
      const row = stmts.getDocumentFrequency.get(term);
      if (!row) return null;
      return { term: row.term, docCount: row.doc_count };
    },
    
    /**
     * Increment document frequency for terms in a new document
     * @param {string[]} terms - Unique terms in the document
     * @returns {{updated: number}}
     */
    incrementDocumentFrequencies(terms) {
      const incrementMany = db.transaction((ts) => {
        let updated = 0;
        for (const term of ts) {
          stmts.incrementDocumentFrequency.run(term);
          updated++;
        }
        return updated;
      });
      
      const updated = incrementMany(terms);
      return { updated };
    },
    
    /**
     * Get document frequency statistics
     * @returns {{totalTerms: number, totalOccurrences: number, maxDocCount: number, avgDocCount: number, totalDocuments: number}}
     */
    getDocumentFrequencyStats() {
      const row = stmts.getDocumentFrequencyStats.get();
      
      // Estimate total documents from content_analysis
      const docCount = db.prepare(`SELECT COUNT(*) as total FROM content_analysis WHERE body_text IS NOT NULL`).get();
      
      return {
        totalTerms: row.total_terms || 0,
        totalOccurrences: row.total_occurrences || 0,
        maxDocCount: row.max_doc_count || 0,
        avgDocCount: Math.round((row.avg_doc_count || 0) * 100) / 100,
        totalDocuments: docCount.total || 1
      };
    },
    
    // =================== Stats & Utilities ===================
    
    /**
     * Get tagging statistics
     * @returns {Object}
     */
    getStats() {
      const counts = stmts.countTaggedArticles.get();
      const dfStats = this.getDocumentFrequencyStats();
      
      return {
        articlesWithKeywords: counts.with_keywords,
        articlesWithCategories: counts.with_categories,
        articlesWithEntities: counts.with_entities,
        vocabularySize: dfStats.totalTerms,
        totalDocuments: dfStats.totalDocuments
      };
    },
    
    /**
     * Get articles that need tagging
     * @param {Object} [options] - Options
     * @returns {Array<{contentId: number, bodyText: string, title: string}>}
     */
    getArticlesWithoutTags({ limit = 1000, offset = 0 } = {}) {
      const rows = stmts.getArticlesWithoutTags.all(limit, offset);
      return rows.map(r => ({
        contentId: r.content_id,
        bodyText: r.body_text,
        title: r.title
      }));
    },
    
    /**
     * Count articles needing tagging
     * @returns {number}
     */
    countArticlesWithoutTags() {
      return stmts.countArticlesWithoutTags.get().total;
    },
    
    /**
     * Delete all tags for an article
     * @param {number} contentId - Content ID
     * @returns {{keywordsDeleted: number, categoriesDeleted: number, entitiesDeleted: number}}
     */
    deleteAllTags(contentId) {
      const deleteAll = db.transaction(() => {
        const kw = stmts.deleteKeywords.run(contentId);
        const cat = stmts.deleteCategory.run(contentId);
        const ent = stmts.deleteEntities.run(contentId);
        return {
          keywordsDeleted: kw.changes,
          categoriesDeleted: cat.changes,
          entitiesDeleted: ent.changes
        };
      });
      
      return deleteAll();
    },
    
    /**
     * Get complete tags for an article
     * @param {number} contentId - Content ID
     * @returns {{keywords: Array, category: Object|null, entities: Array}}
     */
    getArticleTags(contentId) {
      return {
        keywords: this.getKeywords(contentId),
        category: this.getCategory(contentId),
        entities: this.getEntities(contentId)
      };
    }
  };
}

module.exports = {
  createTagAdapter
};
