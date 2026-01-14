'use strict';

/**
 * trustAdapter tests
 * 
 * Tests the database adapter factory function.
 * The module exports { createTrustAdapter } which requires a db handle.
 */

const trustAdapterModule = require('../../src/data/db/sqlite/v1/queries/trustAdapter');

describe('trustAdapter module exports', () => {
  it('should export createTrustAdapter factory function', () => {
    expect(typeof trustAdapterModule.createTrustAdapter).toBe('function');
  });
  
  it('should only export createTrustAdapter', () => {
    expect(Object.keys(trustAdapterModule)).toEqual(['createTrustAdapter']);
  });
});

describe('createTrustAdapter factory', () => {
  it('should throw when db is null', () => {
    expect(() => trustAdapterModule.createTrustAdapter(null))
      .toThrow(/requires a better-sqlite3 database handle/);
  });
  
  it('should throw when db is undefined', () => {
    expect(() => trustAdapterModule.createTrustAdapter(undefined))
      .toThrow(/requires a better-sqlite3 database handle/);
  });
  
  it('should throw when db lacks prepare method', () => {
    expect(() => trustAdapterModule.createTrustAdapter({}))
      .toThrow(/requires a better-sqlite3 database handle/);
  });
  
  it('should throw when db.prepare is not a function', () => {
    expect(() => trustAdapterModule.createTrustAdapter({ prepare: 'not-a-function' }))
      .toThrow(/requires a better-sqlite3 database handle/);
  });
});

describe('trustAdapter instance interface (with mock db)', () => {
  let mockDb;
  let mockStatement;
  let adapter;
  
  beforeEach(() => {
    // Create mock statement that returns expected shapes
    mockStatement = {
      run: jest.fn().mockReturnValue({ lastInsertRowid: 1, changes: 1 }),
      get: jest.fn().mockReturnValue(null),
      all: jest.fn().mockReturnValue([])
    };
    
    // Create mock db
    mockDb = {
      prepare: jest.fn().mockReturnValue(mockStatement),
      exec: jest.fn()
    };
    
    adapter = trustAdapterModule.createTrustAdapter(mockDb);
  });
  
  it('should call db.exec to create schema on instantiation', () => {
    expect(mockDb.exec).toHaveBeenCalledTimes(1);
    expect(mockDb.exec.mock.calls[0][0]).toMatch(/CREATE TABLE IF NOT EXISTS fact_checks/);
    expect(mockDb.exec.mock.calls[0][0]).toMatch(/CREATE TABLE IF NOT EXISTS source_credibility/);
    expect(mockDb.exec.mock.calls[0][0]).toMatch(/CREATE TABLE IF NOT EXISTS article_credibility/);
  });
  
  describe('returned adapter methods', () => {
    const expectedMethods = [
      'saveFactCheck',
      'getFactCheck',
      'getAllFactChecks',
      'getFactChecksBySource',
      'getFactChecksByRating',
      'searchFactChecks',
      'deleteFactCheck',
      'getFactCheckCount',
      'saveSourceCredibility',
      'getSourceCredibility',
      'getAllSourceCredibility',
      'getSourcesByBias',
      'deleteSourceCredibility',
      'getSourceCount',
      'saveArticleCredibility',
      'getArticleCredibility',
      'getArticlesByCredibility',
      'deleteArticleCredibility',
      'getCredibilityStats',
      'getStats'
    ];
    
    it.each(expectedMethods)('should have %s method', (methodName) => {
      expect(typeof adapter[methodName]).toBe('function');
    });
    
    it('should have exactly 20 methods', () => {
      const methodCount = Object.keys(adapter).filter(k => typeof adapter[k] === 'function').length;
      expect(methodCount).toBe(20);
    });
  });
  
  describe('saveFactCheck', () => {
    it('should call prepared statement with correct args', () => {
      const data = {
        claimText: 'The sky is green',
        rating: 'false',
        source: 'Snopes',
        claimSimhash: 'abc123',
        sourceUrl: 'https://snopes.com/sky-color',
        publishedAt: '2024-01-01'
      };
      
      const result = adapter.saveFactCheck(data);
      
      expect(mockStatement.run).toHaveBeenCalledWith(
        'The sky is green',
        'abc123',
        'false',
        'Snopes',
        'https://snopes.com/sky-color',
        '2024-01-01'
      );
      expect(result).toMatchObject({ id: 1, ...data });
    });
    
    it('should handle optional fields as null', () => {
      const data = {
        claimText: 'Claim text',
        rating: 'true',
        source: 'PolitiFact'
      };
      
      adapter.saveFactCheck(data);
      
      expect(mockStatement.run).toHaveBeenCalledWith(
        'Claim text',
        null,
        'true',
        'PolitiFact',
        null,
        null
      );
    });
  });
  
  describe('getFactCheck', () => {
    it('should return null when not found', () => {
      mockStatement.get.mockReturnValue(undefined);
      expect(adapter.getFactCheck(999)).toBeNull();
    });
    
    it('should return record when found', () => {
      const mockRow = { id: 1, claim_text: 'test', rating: 'true' };
      mockStatement.get.mockReturnValue(mockRow);
      expect(adapter.getFactCheck(1)).toEqual(mockRow);
    });
  });
  
  describe('getAllFactChecks', () => {
    it('should use default limit of 1000', () => {
      adapter.getAllFactChecks();
      expect(mockStatement.all).toHaveBeenCalledWith(1000);
    });
    
    it('should use custom limit when provided', () => {
      adapter.getAllFactChecks({ limit: 50 });
      expect(mockStatement.all).toHaveBeenCalledWith(50);
    });
  });
  
  describe('searchFactChecks', () => {
    it('should wrap query in wildcards', () => {
      adapter.searchFactChecks('climate');
      expect(mockStatement.all).toHaveBeenCalledWith('%climate%', 20);
    });
    
    it('should use custom limit', () => {
      adapter.searchFactChecks('test', { limit: 5 });
      expect(mockStatement.all).toHaveBeenCalledWith('%test%', 5);
    });
  });
  
  describe('saveSourceCredibility', () => {
    it('should call prepared statement with correct args', () => {
      const data = {
        host: 'example.com',
        credibilityScore: 85,
        mbfcRating: 'high',
        biasLabel: 'center',
        correctionCount: 2
      };
      
      adapter.saveSourceCredibility(data);
      
      expect(mockStatement.run).toHaveBeenCalledWith(
        'example.com',
        85,
        'high',
        'center',
        2
      );
    });
    
    it('should use defaults for optional fields', () => {
      adapter.saveSourceCredibility({ host: 'test.com' });
      
      expect(mockStatement.run).toHaveBeenCalledWith(
        'test.com',
        50,  // default credibilityScore
        null,
        null,
        0    // default correctionCount
      );
    });
  });
  
  describe('getSourceCredibility', () => {
    it('should return null when not found', () => {
      mockStatement.get.mockReturnValue(undefined);
      expect(adapter.getSourceCredibility('unknown.com')).toBeNull();
    });
    
    it('should transform snake_case to camelCase', () => {
      mockStatement.get.mockReturnValue({
        host: 'example.com',
        credibility_score: 90,
        mbfc_rating: 'high',
        bias_label: 'center',
        correction_count: 1,
        updated_at: '2024-01-01'
      });
      
      const result = adapter.getSourceCredibility('example.com');
      
      expect(result).toEqual({
        host: 'example.com',
        credibilityScore: 90,
        mbfcRating: 'high',
        biasLabel: 'center',
        correctionCount: 1,
        updatedAt: '2024-01-01'
      });
    });
  });
  
  describe('saveArticleCredibility', () => {
    it('should stringify matchedFactChecks array', () => {
      const data = {
        contentId: 123,
        overallScore: 75,
        matchedFactChecks: [{ id: 1, rating: 'true' }],
        sourceScore: 80,
        claimCount: 3
      };
      
      adapter.saveArticleCredibility(data);
      
      expect(mockStatement.run).toHaveBeenCalledWith(
        123,
        75,
        '[{"id":1,"rating":"true"}]',
        80,
        3
      );
    });
    
    it('should pass string matchedFactChecks as-is', () => {
      const data = {
        contentId: 123,
        overallScore: 75,
        matchedFactChecks: '[]',
        sourceScore: 80,
        claimCount: 3
      };
      
      adapter.saveArticleCredibility(data);
      
      expect(mockStatement.run).toHaveBeenCalledWith(123, 75, '[]', 80, 3);
    });
  });
  
  describe('getArticleCredibility', () => {
    it('should return null when not found', () => {
      mockStatement.get.mockReturnValue(undefined);
      expect(adapter.getArticleCredibility(999)).toBeNull();
    });
    
    it('should parse matched_fact_checks JSON', () => {
      mockStatement.get.mockReturnValue({
        content_id: 1,
        overall_score: 85,
        matched_fact_checks: '[{"id":1}]',
        source_score: 90,
        claim_count: 2,
        analyzed_at: '2024-01-01'
      });
      
      const result = adapter.getArticleCredibility(1);
      
      expect(result.matchedFactChecks).toEqual([{ id: 1 }]);
    });
    
    it('should handle invalid JSON in matched_fact_checks', () => {
      mockStatement.get.mockReturnValue({
        content_id: 1,
        overall_score: 85,
        matched_fact_checks: 'invalid-json',
        source_score: 90,
        claim_count: 2,
        analyzed_at: '2024-01-01'
      });
      
      const result = adapter.getArticleCredibility(1);
      
      expect(result.matchedFactChecks).toEqual([]);
    });
  });
  
  describe('getStats', () => {
    it('should combine all stat sources', () => {
      // Mock the prepared statements for stats
      const getFactCheckCountStmt = { get: jest.fn().mockReturnValue({ count: 100 }) };
      const getSourceCountStmt = { get: jest.fn().mockReturnValue({ count: 50 }) };
      const getCredibilityStatsStmt = {
        get: jest.fn().mockReturnValue({
          total_analyzed: 200,
          avg_score: 72.5,
          high_credibility: 50,
          mixed_credibility: 100,
          low_credibility: 50
        })
      };
      
      // Create adapter with specific mocks for stat methods
      mockDb.prepare
        .mockReturnValueOnce(mockStatement) // saveFactCheck
        .mockReturnValueOnce(mockStatement) // getFactCheck
        .mockReturnValueOnce(mockStatement) // getAllFactChecks
        .mockReturnValueOnce(mockStatement) // getFactChecksBySource
        .mockReturnValueOnce(mockStatement) // getFactChecksByRating
        .mockReturnValueOnce(mockStatement) // searchFactChecks
        .mockReturnValueOnce(mockStatement) // deleteFactCheck
        .mockReturnValueOnce(getFactCheckCountStmt) // getFactCheckCount
        .mockReturnValueOnce(mockStatement) // saveSourceCredibility
        .mockReturnValueOnce(mockStatement) // getSourceCredibility
        .mockReturnValueOnce(mockStatement) // getAllSourceCredibility
        .mockReturnValueOnce(mockStatement) // getSourcesByBias
        .mockReturnValueOnce(mockStatement) // deleteSourceCredibility
        .mockReturnValueOnce(getSourceCountStmt) // getSourceCount
        .mockReturnValueOnce(mockStatement) // saveArticleCredibility
        .mockReturnValueOnce(mockStatement) // getArticleCredibility
        .mockReturnValueOnce(mockStatement) // getArticlesByCredibility
        .mockReturnValueOnce(mockStatement) // deleteArticleCredibility
        .mockReturnValueOnce(getCredibilityStatsStmt); // getCredibilityStats
      
      const testAdapter = trustAdapterModule.createTrustAdapter(mockDb);
      const stats = testAdapter.getStats();
      
      expect(stats).toEqual({
        factChecks: 100,
        sources: 50,
        credibility: {
          totalAnalyzed: 200,
          avgScore: 73,
          highCredibility: 50,
          mixedCredibility: 100,
          lowCredibility: 50
        }
      });
    });
  });
});

