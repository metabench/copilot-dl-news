'use strict';

/**
 * Summary Adapter Tests
 * 
 * Tests for the database adapter for article summaries.
 */

const Database = require('better-sqlite3');
const { createSummaryAdapter } = require('../../../src/db/sqlite/v1/queries/summaryAdapter');

describe('summaryAdapter', () => {
  let db;
  let adapter;
  
  beforeEach(() => {
    // In-memory database for testing
    db = new Database(':memory:');
    
    // Create required tables - adapter expects content_analysis table
    db.exec(`
      CREATE TABLE IF NOT EXISTS content_analysis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        title TEXT,
        body_text TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Insert test content with body_text > 200 chars (required for getArticlesWithoutSummaries)
    const longText = 'A'.repeat(250);
    db.prepare('INSERT INTO content_analysis (id, url, title, body_text) VALUES (?, ?, ?, ?)').run(1, 'http://example.com/1', 'Article 1', longText);
    db.prepare('INSERT INTO content_analysis (id, url, title, body_text) VALUES (?, ?, ?, ?)').run(2, 'http://example.com/2', 'Article 2', longText);
    db.prepare('INSERT INTO content_analysis (id, url, title, body_text) VALUES (?, ?, ?, ?)').run(3, 'http://example.com/3', 'Article 3', longText);
    
    adapter = createSummaryAdapter(db);
  });
  
  afterEach(() => {
    db.close();
  });
  
  describe('saveSummary()', () => {
    it('should save a new summary', () => {
      const summary = {
        contentId: 1,
        lengthType: 'short',
        summaryText: 'This is a test summary.',
        method: 'textrank',
        sentenceCount: 3,
        wordCount: 5
      };
      
      const result = adapter.saveSummary(summary);
      
      // Returns { changes: number }
      expect(result.changes).toBe(1);
    });
    
    it('should update existing summary (upsert)', () => {
      const summary1 = {
        contentId: 1,
        lengthType: 'short',
        summaryText: 'Original summary.',
        method: 'textrank',
        sentenceCount: 1,
        wordCount: 2
      };
      
      const summary2 = {
        contentId: 1,
        lengthType: 'short',
        summaryText: 'Updated summary.',
        method: 'textrank',
        sentenceCount: 1,
        wordCount: 2
      };
      
      adapter.saveSummary(summary1);
      const result = adapter.saveSummary(summary2);
      
      expect(result.changes).toBe(1);
      
      // Verify updated content
      const fetched = adapter.getSummary(1, 'short');
      expect(fetched.summary).toBe('Updated summary.');
    });
    
    it('should save different length types for same article', () => {
      adapter.saveSummary({
        contentId: 1,
        lengthType: 'brief',
        summaryText: 'Brief.',
        sentenceCount: 1,
        wordCount: 1
      });
      
      adapter.saveSummary({
        contentId: 1,
        lengthType: 'short',
        summaryText: 'Short summary here.',
        sentenceCount: 3,
        wordCount: 3
      });
      
      const brief = adapter.getSummary(1, 'brief');
      const short = adapter.getSummary(1, 'short');
      
      expect(brief.summary).toBe('Brief.');
      expect(short.summary).toBe('Short summary here.');
    });
    
    it('should validate length type', () => {
      expect(() => {
        adapter.saveSummary({
          contentId: 1,
          lengthType: 'invalid',
          summaryText: 'Test',
          sentenceCount: 1,
          wordCount: 1
        });
      }).toThrow();
    });
  });
  
  describe('getSummary()', () => {
    beforeEach(() => {
      adapter.saveSummary({
        contentId: 1,
        lengthType: 'short',
        summaryText: 'Test summary.',
        method: 'textrank',
        sentenceCount: 3,
        wordCount: 2
      });
    });
    
    it('should fetch summary by contentId and lengthType', () => {
      const result = adapter.getSummary(1, 'short');
      
      expect(result).toBeDefined();
      expect(result.contentId).toBe(1);
      expect(result.length).toBe('short');  // uses 'length' not 'lengthType'
      expect(result.summary).toBe('Test summary.');  // uses 'summary' not 'summaryText'
      expect(result.method).toBe('textrank');
      expect(result.sentenceCount).toBe(3);
      expect(result.wordCount).toBe(2);
    });
    
    it('should return null for non-existent summary', () => {
      const result = adapter.getSummary(999, 'short');
      
      expect(result).toBeNull();
    });
    
    it('should return null for non-existent length type', () => {
      const result = adapter.getSummary(1, 'full');
      
      expect(result).toBeNull();
    });
    
    it('should include createdAt timestamp', () => {
      const result = adapter.getSummary(1, 'short');
      
      expect(result.createdAt).toBeDefined();
    });
  });
  
  describe('getAllSummaries()', () => {
    beforeEach(() => {
      adapter.saveSummary({
        contentId: 1,
        lengthType: 'brief',
        summaryText: 'Brief.',
        sentenceCount: 1,
        wordCount: 1
      });
      adapter.saveSummary({
        contentId: 1,
        lengthType: 'short',
        summaryText: 'Short.',
        sentenceCount: 3,
        wordCount: 1
      });
      adapter.saveSummary({
        contentId: 1,
        lengthType: 'full',
        summaryText: 'Full.',
        sentenceCount: 5,
        wordCount: 1
      });
    });
    
    it('should return all summaries for an article', () => {
      const results = adapter.getAllSummaries(1);
      
      expect(results).toHaveLength(3);
    });
    
    it('should return empty array for no summaries', () => {
      const results = adapter.getAllSummaries(999);
      
      expect(results).toEqual([]);
    });
    
    it('should include all fields', () => {
      const results = adapter.getAllSummaries(1);
      
      for (const r of results) {
        expect(r).toHaveProperty('contentId');
        expect(r).toHaveProperty('length');  // uses 'length' not 'lengthType'
        expect(r).toHaveProperty('summary');  // uses 'summary' not 'summaryText'
        expect(r).toHaveProperty('method');
      }
    });
  });
  
  describe('hasSummary()', () => {
    beforeEach(() => {
      adapter.saveSummary({
        contentId: 1,
        lengthType: 'short',
        summaryText: 'Test.',
        sentenceCount: 1,
        wordCount: 1
      });
    });
    
    it('should return true when summary exists', () => {
      expect(adapter.hasSummary(1, 'short')).toBe(true);
    });
    
    it('should return false when summary does not exist', () => {
      expect(adapter.hasSummary(1, 'full')).toBe(false);
      expect(adapter.hasSummary(999, 'short')).toBe(false);
    });
  });
  
  describe('deleteSummaries()', () => {
    beforeEach(() => {
      adapter.saveSummary({
        contentId: 1,
        lengthType: 'brief',
        summaryText: 'Brief.',
        sentenceCount: 1,
        wordCount: 1
      });
      adapter.saveSummary({
        contentId: 1,
        lengthType: 'short',
        summaryText: 'Short.',
        sentenceCount: 3,
        wordCount: 1
      });
      adapter.saveSummary({
        contentId: 2,
        lengthType: 'short',
        summaryText: 'Other.',
        sentenceCount: 3,
        wordCount: 1
      });
    });
    
    it('should delete all summaries for an article', () => {
      const result = adapter.deleteSummaries(1);
      
      expect(result.deleted).toBe(2);
      expect(adapter.hasSummary(1, 'brief')).toBe(false);
      expect(adapter.hasSummary(1, 'short')).toBe(false);
    });
    
    it('should delete specific length type only', () => {
      const result = adapter.deleteSummaries(1, 'brief');
      
      expect(result.deleted).toBe(1);
      expect(adapter.hasSummary(1, 'brief')).toBe(false);
      expect(adapter.hasSummary(1, 'short')).toBe(true);
    });
    
    it('should not affect other articles', () => {
      adapter.deleteSummaries(1);
      
      expect(adapter.hasSummary(2, 'short')).toBe(true);
    });
    
    it('should return 0 for non-existent article', () => {
      const result = adapter.deleteSummaries(999);
      
      expect(result.deleted).toBe(0);
    });
  });
  
  describe('bulkSaveSummaries()', () => {
    it('should save multiple summaries', () => {
      const summaries = [
        { contentId: 1, lengthType: 'brief', summaryText: 'A', sentenceCount: 1, wordCount: 1 },
        { contentId: 1, lengthType: 'short', summaryText: 'B', sentenceCount: 3, wordCount: 1 },
        { contentId: 2, lengthType: 'brief', summaryText: 'C', sentenceCount: 1, wordCount: 1 }
      ];
      
      const result = adapter.bulkSaveSummaries(summaries);
      
      expect(result.saved).toBe(3);
    });
    
    it('should handle empty array', () => {
      const result = adapter.bulkSaveSummaries([]);
      
      expect(result.saved).toBe(0);
    });
    
    it('should throw on invalid length type (transaction rollback)', () => {
      const summaries = [
        { contentId: 1, lengthType: 'brief', summaryText: 'A', sentenceCount: 1, wordCount: 1 },
        { contentId: 999, lengthType: 'invalid', summaryText: 'B', sentenceCount: 1, wordCount: 1 }, // Will fail
        { contentId: 2, lengthType: 'brief', summaryText: 'C', sentenceCount: 1, wordCount: 1 }
      ];
      
      // Transaction should fail on invalid length type
      expect(() => adapter.bulkSaveSummaries(summaries)).toThrow();
    });
  });
  
  describe('getStats()', () => {
    beforeEach(() => {
      adapter.saveSummary({
        contentId: 1,
        lengthType: 'brief',
        summaryText: 'Brief.',
        sentenceCount: 1,
        wordCount: 1
      });
      adapter.saveSummary({
        contentId: 1,
        lengthType: 'short',
        summaryText: 'Short.',
        sentenceCount: 3,
        wordCount: 1
      });
      adapter.saveSummary({
        contentId: 2,
        lengthType: 'short',
        summaryText: 'Other.',
        sentenceCount: 3,
        wordCount: 1
      });
    });
    
    it('should return total summary count', () => {
      const stats = adapter.getStats();
      
      expect(stats.totalSummaries).toBe(3);
    });
    
    it('should return byLengthType as array', () => {
      const stats = adapter.getStats();
      
      expect(stats.byLengthType).toBeDefined();
      expect(Array.isArray(stats.byLengthType)).toBe(true);
      
      // Find brief type
      const briefStats = stats.byLengthType.find(s => s.lengthType === 'brief');
      expect(briefStats.count).toBe(1);
      
      // Find short type
      const shortStats = stats.byLengthType.find(s => s.lengthType === 'short');
      expect(shortStats.count).toBe(2);
    });
    
    it('should return count of unique articles', () => {
      const stats = adapter.getStats();
      
      expect(stats.articlesWithSummaries).toBe(2);
    });
    
    it('should handle empty database', () => {
      adapter.deleteSummaries(1);
      adapter.deleteSummaries(2);
      
      const stats = adapter.getStats();
      
      expect(stats.totalSummaries).toBe(0);
      expect(stats.articlesWithSummaries).toBe(0);
    });
  });
  
  describe('getArticlesWithoutSummaries()', () => {
    beforeEach(() => {
      // Article 1 has a short summary
      adapter.saveSummary({
        contentId: 1,
        lengthType: 'short',
        summaryText: 'Test.',
        sentenceCount: 3,
        wordCount: 1
      });
      // Articles 2 and 3 have no summaries
    });
    
    it('should return articles without summaries', () => {
      const results = adapter.getArticlesWithoutSummaries('short');
      
      // Returns objects with contentId, not just IDs
      const contentIds = results.map(r => r.contentId);
      expect(contentIds).toContain(2);
      expect(contentIds).toContain(3);
      expect(contentIds).not.toContain(1);
    });
    
    it('should respect limit', () => {
      const results = adapter.getArticlesWithoutSummaries('short', { limit: 1 });
      
      expect(results).toHaveLength(1);
    });
    
    it('should return empty array when all have summaries', () => {
      adapter.saveSummary({ contentId: 2, lengthType: 'short', summaryText: 'A', sentenceCount: 1, wordCount: 1 });
      adapter.saveSummary({ contentId: 3, lengthType: 'short', summaryText: 'B', sentenceCount: 1, wordCount: 1 });
      
      const results = adapter.getArticlesWithoutSummaries('short');
      
      expect(results).toHaveLength(0);
    });
  });
});
