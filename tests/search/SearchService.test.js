'use strict';

/**
 * SearchService Tests
 * 
 * Tests full-text search functionality using SQLite FTS5.
 * Covers:
 *   - Basic search operations
 *   - Author-specific search
 *   - Phrase search
 *   - Boolean operators (AND, OR)
 *   - Faceted filtering
 *   - Result highlighting
 *   - Query parsing
 *   - Edge cases and error handling
 */

const Database = require('better-sqlite3');
const path = require('path');
const { SearchService } = require('../../src/search/SearchService');
const { createSearchAdapter, sanitizeFtsQuery } = require('../../src/db/sqlite/v1/queries/searchAdapter');

// Test database setup
let db;
let searchService;
let searchAdapter;

/**
 * Create test database schema
 */
function createTestSchema(db) {
  // Create minimal schema for testing
  db.exec(`
    CREATE TABLE IF NOT EXISTS urls (
      id INTEGER PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      host TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS http_responses (
      id INTEGER PRIMARY KEY,
      url_id INTEGER NOT NULL,
      fetched_at TEXT,
      http_status INTEGER,
      FOREIGN KEY(url_id) REFERENCES urls(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS content_storage (
      id INTEGER PRIMARY KEY,
      http_response_id INTEGER NOT NULL,
      storage_type TEXT,
      FOREIGN KEY(http_response_id) REFERENCES http_responses(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS content_analysis (
      id INTEGER PRIMARY KEY,
      content_id INTEGER NOT NULL,
      title TEXT,
      body_text TEXT,
      byline TEXT,
      authors TEXT,
      date TEXT,
      section TEXT,
      word_count INTEGER,
      classification TEXT,
      analyzed_at TEXT,
      analysis_json TEXT,
      FOREIGN KEY(content_id) REFERENCES content_storage(id)
    )
  `);

  // Create FTS5 virtual table
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
      title,
      body_text,
      byline,
      authors,
      content='content_analysis',
      content_rowid='id',
      tokenize='porter unicode61'
    )
  `);

  // Create triggers
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS articles_fts_insert AFTER INSERT ON content_analysis
    BEGIN
      INSERT INTO articles_fts(rowid, title, body_text, byline, authors)
      VALUES (NEW.id, NEW.title, NEW.body_text, NEW.byline, NEW.authors);
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS articles_fts_update AFTER UPDATE ON content_analysis
    BEGIN
      INSERT INTO articles_fts(articles_fts, rowid, title, body_text, byline, authors)
      VALUES ('delete', OLD.id, OLD.title, OLD.body_text, OLD.byline, OLD.authors);
      INSERT INTO articles_fts(rowid, title, body_text, byline, authors)
      VALUES (NEW.id, NEW.title, NEW.body_text, NEW.byline, NEW.authors);
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS articles_fts_delete AFTER DELETE ON content_analysis
    BEGIN
      INSERT INTO articles_fts(articles_fts, rowid, title, body_text, byline, authors)
      VALUES ('delete', OLD.id, OLD.title, OLD.body_text, OLD.byline, OLD.authors);
    END
  `);
}

/**
 * Insert test article
 */
function insertTestArticle(db, article) {
  const urlId = db.prepare(`
    INSERT INTO urls (url, host) VALUES (?, ?)
  `).run(article.url, article.host || new URL(article.url).hostname).lastInsertRowid;

  const responseId = db.prepare(`
    INSERT INTO http_responses (url_id, fetched_at, http_status) VALUES (?, ?, 200)
  `).run(urlId, article.date || new Date().toISOString()).lastInsertRowid;

  const storageId = db.prepare(`
    INSERT INTO content_storage (http_response_id, storage_type) VALUES (?, 'inline')
  `).run(responseId).lastInsertRowid;

  const analysisId = db.prepare(`
    INSERT INTO content_analysis (content_id, title, body_text, byline, authors, date, section, word_count, classification, analyzed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    storageId,
    article.title,
    article.body_text,
    article.byline || null,
    article.authors ? JSON.stringify(article.authors) : null,
    article.date || null,
    article.section || null,
    article.word_count || (article.body_text?.split(/\s+/).length || 0),
    article.classification || 'article'
  ).lastInsertRowid;

  return analysisId;
}

// Test data
const testArticles = [
  {
    url: 'https://example.com/news/politics-debate-2025',
    host: 'example.com',
    title: 'Presidential Debate Highlights: Key Moments',
    body_text: 'The presidential debate featured heated exchanges between candidates on economic policy, healthcare reform, and foreign relations. Both candidates presented their vision for the nation.',
    byline: 'By John Smith, Political Correspondent',
    authors: ['John Smith'],
    date: '2025-01-15',
    section: 'Politics'
  },
  {
    url: 'https://example.com/tech/ai-advances-2025',
    host: 'example.com',
    title: 'Artificial Intelligence Breakthrough in Medical Diagnosis',
    body_text: 'Researchers at Stanford University have developed an AI system capable of detecting early-stage cancer with unprecedented accuracy. The breakthrough could revolutionize healthcare diagnostics.',
    byline: 'By Sarah Johnson, Technology Editor',
    authors: ['Sarah Johnson'],
    date: '2025-01-20',
    section: 'Technology'
  },
  {
    url: 'https://newssite.org/sports/championship-finals',
    host: 'newssite.org',
    title: 'Championship Finals: Historic Victory for Underdogs',
    body_text: 'In a stunning upset, the underdog team clinched the championship title with a last-minute goal. Fans celebrated throughout the night as the team achieved their first major victory in decades.',
    byline: 'By Michael O\'Brien, Sports Writer',
    authors: ['Michael O\'Brien'],
    date: '2025-01-22',
    section: 'Sports'
  },
  {
    url: 'https://newssite.org/science/climate-study',
    host: 'newssite.org',
    title: 'New Climate Study Reveals Alarming Trends',
    body_text: 'A comprehensive climate study published in Nature shows accelerating ice loss in Antarctica. Scientists warn that immediate action is needed to prevent irreversible damage to coastal ecosystems.',
    byline: 'By Dr. Emily Chen and James Wilson',
    authors: ['Dr. Emily Chen', 'James Wilson'],
    date: '2025-01-25',
    section: 'Science'
  },
  {
    url: 'https://example.com/health/breakthrough-treatment',
    host: 'example.com',
    title: 'Revolutionary Treatment Shows Promise for Alzheimer\'s',
    body_text: 'A new drug treatment has shown remarkable results in early clinical trials for Alzheimer\'s disease. Healthcare providers are cautiously optimistic about the potential to slow cognitive decline in patients.',
    byline: 'By Sarah Johnson, Health Reporter',
    authors: ['Sarah Johnson'],
    date: '2025-01-28',
    section: 'Health'
  }
];

describe('SearchService', () => {
  beforeAll(() => {
    // Create in-memory database for tests
    db = new Database(':memory:');
    createTestSchema(db);

    // Insert test articles
    for (const article of testArticles) {
      insertTestArticle(db, article);
    }

    // Create service and adapter
    searchService = new SearchService(db);
    searchAdapter = createSearchAdapter(db);
  });

  afterAll(() => {
    db.close();
  });

  describe('Basic Search', () => {
    test('search by keyword returns matching articles', () => {
      const result = searchService.search('climate');
      expect(result.success).toBe(true);
      expect(result.results.length).toBe(1);
      expect(result.results[0].title).toContain('Climate');
    });

    test('search by title keyword returns matching articles', () => {
      const result = searchService.search('Presidential');
      expect(result.success).toBe(true);
      expect(result.results.length).toBe(1);
      expect(result.results[0].title).toContain('Presidential');
    });

    test('search returns multiple matches', () => {
      const result = searchService.search('healthcare');
      expect(result.success).toBe(true);
      expect(result.results.length).toBeGreaterThanOrEqual(2);
    });

    test('search returns empty for non-existent term', () => {
      const result = searchService.search('xyznonexistent123');
      expect(result.success).toBe(true);
      expect(result.results.length).toBe(0);
      expect(result.pagination.total).toBe(0);
    });

    test('empty query returns error', () => {
      const result = searchService.search('');
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('Author Search', () => {
    test('searchByAuthor finds articles by author name', () => {
      const result = searchService.searchByAuthor('John Smith');
      expect(result.success).toBe(true);
      expect(result.results.length).toBeGreaterThanOrEqual(1);
      const titles = result.results.map(r => r.title);
      expect(titles.some(t => t.includes('Presidential'))).toBe(true);
    });

    test('searchByAuthor finds articles by byline', () => {
      const result = searchService.searchByAuthor('Sarah Johnson');
      expect(result.success).toBe(true);
      expect(result.results.length).toBe(2); // Tech and Health articles
    });

    test('searchByAuthor handles names with apostrophes', () => {
      const result = searchService.searchByAuthor("O'Brien");
      expect(result.success).toBe(true);
      expect(result.results.length).toBe(1);
      expect(result.results[0].title).toContain('Championship');
    });

    test('search with author: prefix', () => {
      const result = searchService.search('author:Smith');
      expect(result.success).toBe(true);
      expect(result.results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Phrase Search', () => {
    test('phrase search returns exact matches', () => {
      const result = searchService.search('"clinical trials"');
      expect(result.success).toBe(true);
      expect(result.results.length).toBe(1);
      expect(result.results[0].body_text).toContain('clinical trials');
    });

    test('phrase search is case insensitive', () => {
      const result = searchService.search('"STANFORD UNIVERSITY"');
      expect(result.success).toBe(true);
      expect(result.results.length).toBe(1);
    });
  });

  describe('Boolean Operators', () => {
    test('AND operator requires both terms', () => {
      const result = searchService.search('climate AND Antarctica');
      expect(result.success).toBe(true);
      expect(result.results.length).toBe(1);
      expect(result.results[0].body_text).toContain('Antarctica');
    });

    test('OR operator matches either term', () => {
      const result = searchService.search('championship OR presidential');
      expect(result.success).toBe(true);
      expect(result.results.length).toBeGreaterThanOrEqual(2);
    });

    test('NOT operator excludes terms', () => {
      const result = searchService.search('healthcare NOT cancer');
      expect(result.success).toBe(true);
      // Should match healthcare but exclude the AI cancer article
      for (const article of result.results) {
        expect(article.body_text.toLowerCase()).not.toContain('cancer');
      }
    });
  });

  describe('Pagination', () => {
    test('pagination respects limit', () => {
      const result = searchService.search('the', { limit: 2 });
      expect(result.success).toBe(true);
      expect(result.results.length).toBeLessThanOrEqual(2);
      expect(result.pagination.limit).toBe(2);
    });

    test('pagination respects offset', () => {
      const result1 = searchService.search('the', { limit: 2, offset: 0 });
      const result2 = searchService.search('the', { limit: 2, offset: 2 });
      
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      
      // Results should be different (different offset)
      if (result1.results.length > 0 && result2.results.length > 0) {
        expect(result1.results[0].id).not.toBe(result2.results[0].id);
      }
    });

    test('pagination includes total count', () => {
      const result = searchService.search('the', { limit: 1 });
      expect(result.success).toBe(true);
      expect(result.pagination.total).toBeGreaterThan(result.pagination.limit);
      expect(result.pagination.hasMore).toBe(true);
    });

    test('pagination calculates page info correctly', () => {
      const result = searchService.search('the', { limit: 2, offset: 2 });
      expect(result.success).toBe(true);
      expect(result.pagination.page).toBe(2);
      expect(result.pagination.totalPages).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Highlighting', () => {
    test('highlight method wraps terms with mark tags', () => {
      const text = 'The quick brown fox jumps over the lazy dog.';
      const highlighted = searchService.highlight(text, 'quick');
      expect(highlighted).toContain('<mark>quick</mark>');
    });

    test('highlight handles multiple terms', () => {
      const text = 'The quick brown fox jumps over the lazy dog.';
      const highlighted = searchService.highlight(text, 'quick brown');
      expect(highlighted).toContain('<mark>quick</mark>');
      expect(highlighted).toContain('<mark>brown</mark>');
    });

    test('highlight is case insensitive', () => {
      const text = 'The QUICK brown fox.';
      const highlighted = searchService.highlight(text, 'quick');
      expect(highlighted).toContain('<mark>QUICK</mark>');
    });

    test('highlight handles custom tag', () => {
      const text = 'The quick brown fox.';
      const highlighted = searchService.highlight(text, 'quick', { tag: 'em' });
      expect(highlighted).toContain('<em>quick</em>');
    });

    test('search results include highlights when requested', () => {
      const result = searchService.search('climate', { includeHighlights: true });
      expect(result.success).toBe(true);
      expect(result.results.length).toBe(1);
      // Highlights should be included
      expect(result.results[0].highlights).toBeDefined();
    });
  });

  describe('Facets', () => {
    test('getFacets returns domain counts', () => {
      const facets = searchService.getFacets('the');
      expect(facets.domains).toBeDefined();
      expect(Array.isArray(facets.domains)).toBe(true);
    });

    test('getFacets returns author counts', () => {
      const facets = searchService.getFacets('healthcare');
      expect(facets.authors).toBeDefined();
      expect(Array.isArray(facets.authors)).toBe(true);
    });

    test('getFacets returns date range', () => {
      const facets = searchService.getFacets('the');
      expect(facets.dateRange).toBeDefined();
      expect(facets.dateRange.min_date).toBeDefined();
      expect(facets.dateRange.max_date).toBeDefined();
    });

    test('search with includeFacets option', () => {
      const result = searchService.search('healthcare', { includeFacets: true });
      expect(result.success).toBe(true);
      expect(result.facets).toBeDefined();
      expect(result.facets.domains).toBeDefined();
    });
  });

  describe('Domain Filtering', () => {
    test('search filters by domain', () => {
      const result = searchService.search('the', { domain: 'example.com' });
      expect(result.success).toBe(true);
      for (const article of result.results) {
        expect(article.host).toBe('example.com');
      }
    });

    test('domain: prefix in query', () => {
      const result = searchService.search('championship domain:newssite.org');
      expect(result.success).toBe(true);
      expect(result.results.length).toBeGreaterThanOrEqual(1);
      for (const article of result.results) {
        expect(article.host).toBe('newssite.org');
      }
    });
  });

  describe('BM25 Ranking', () => {
    test('title matches rank higher than body matches', () => {
      // Insert an article with "climate" in body only
      insertTestArticle(db, {
        url: 'https://test.com/article-climate-body',
        host: 'test.com',
        title: 'Regular News Article',
        body_text: 'This article discusses climate change and its effects.',
        byline: 'Test Author',
        authors: ['Test Author'],
        date: '2025-01-01'
      });

      const result = searchService.search('climate');
      expect(result.success).toBe(true);
      expect(result.results.length).toBeGreaterThanOrEqual(2);
      
      // Article with "Climate" in title should rank higher
      const titleMatch = result.results.find(r => r.title.includes('Climate'));
      const bodyOnlyMatch = result.results.find(r => r.title === 'Regular News Article');
      
      if (titleMatch && bodyOnlyMatch) {
        const titleIndex = result.results.indexOf(titleMatch);
        const bodyIndex = result.results.indexOf(bodyOnlyMatch);
        expect(titleIndex).toBeLessThan(bodyIndex);
      }
    });
  });

  describe('Performance', () => {
    test('search completes quickly', () => {
      const result = searchService.search('healthcare');
      expect(result.success).toBe(true);
      expect(result.metrics.durationMs).toBeLessThan(100); // Should complete in <100ms
    });
  });

  describe('Error Handling', () => {
    test('handles null query gracefully', () => {
      const result = searchService.search(null);
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    test('handles undefined query gracefully', () => {
      const result = searchService.search(undefined);
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    test('handles invalid query gracefully', () => {
      // Unbalanced quotes might cause FTS5 syntax error
      const result = searchService.search('test"');
      // Should not throw, either succeeds or returns error gracefully
      expect(result).toBeDefined();
    });
  });
});

describe('sanitizeFtsQuery', () => {
  test('trims whitespace', () => {
    expect(sanitizeFtsQuery('  test  ')).toBe('test');
  });

  test('normalizes multiple spaces', () => {
    expect(sanitizeFtsQuery('test  multiple   spaces')).toBe('test multiple spaces');
  });

  test('converts author: to FTS5 syntax', () => {
    const result = sanitizeFtsQuery('author:Smith');
    expect(result).toContain('authors:Smith');
    expect(result).toContain('byline:Smith');
  });

  test('preserves quoted phrases', () => {
    const result = sanitizeFtsQuery('"exact phrase"');
    expect(result).toBe('"exact phrase"');
  });

  test('handles unbalanced quotes', () => {
    const result = sanitizeFtsQuery('test "unbalanced');
    expect(result).not.toContain('"');
  });
});

describe('createSearchAdapter', () => {
  let localDb;

  beforeAll(() => {
    localDb = new Database(':memory:');
    createTestSchema(localDb);
    insertTestArticle(localDb, {
      url: 'https://test.com/adapter-test',
      host: 'test.com',
      title: 'Adapter Test Article',
      body_text: 'Testing the search adapter functionality with climate data.',
      byline: 'Test Author',
      authors: ['Test Author'],
      date: '2025-01-01'
    });
  });

  afterAll(() => {
    localDb.close();
  });

  test('throws error without database', () => {
    expect(() => createSearchAdapter(null)).toThrow();
  });

  test('creates adapter with valid database', () => {
    const adapter = createSearchAdapter(localDb);
    expect(adapter).toBeDefined();
    expect(typeof adapter.search).toBe('function');
    expect(typeof adapter.searchByAuthor).toBe('function');
    expect(typeof adapter.getHighlights).toBe('function');
  });

  test('adapter search returns correct structure', () => {
    const adapter = createSearchAdapter(localDb);
    const result = adapter.search('climate', { limit: 5, offset: 0 });
    expect(result).toHaveProperty('results');
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('limit');
    expect(result).toHaveProperty('offset');
    expect(result).toHaveProperty('hasMore');
  });
});
