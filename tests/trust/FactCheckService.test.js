'use strict';

/**
 * Tests for FactCheckService
 */

const { FactCheckService } = require('../../src/trust/FactCheckService');
const { ClaimExtractor } = require('../../src/trust/ClaimExtractor');
const { SourceRater } = require('../../src/trust/SourceRater');
const { CredibilityScorer } = require('../../src/trust/CredibilityScorer');

describe('FactCheckService', () => {
  let service;
  
  beforeEach(() => {
    service = new FactCheckService();
  });
  
  describe('constructor', () => {
    it('should create instance with default components', () => {
      expect(service.claimExtractor).toBeInstanceOf(ClaimExtractor);
      expect(service.sourceRater).toBeInstanceOf(SourceRater);
      expect(service.credibilityScorer).toBeInstanceOf(CredibilityScorer);
    });
    
    it('should accept custom options', () => {
      const customService = new FactCheckService({ 
        useGoogleApi: true,
        googleApiKey: 'test-key'
      });
      
      expect(customService.useGoogleApi).toBe(true);
      expect(customService.googleApiKey).toBe('test-key');
    });
    
    it('should initialize API cache', () => {
      expect(service.apiCache).toBeDefined();
      expect(service.apiCache instanceof Map).toBe(true);
    });
    
    it('should not have adapters by default', () => {
      expect(service.trustAdapter).toBeNull();
      expect(service.articlesAdapter).toBeNull();
    });
  });
  
  describe('analyzeArticle', () => {
    it('should return error for missing article', async () => {
      const result = await service.analyzeArticle(null);
      
      expect(result.error).toBeDefined();
      expect(result.overallScore).toBe(50);
    });
    
    it('should return error for missing host', async () => {
      const result = await service.analyzeArticle({ text: 'Some text' });
      
      expect(result.error).toBeDefined();
    });
    
    it('should analyze article with known source', async () => {
      const result = await service.analyzeArticle({
        host: 'apnews.com',
        text: 'The president announced new policies today.'
      });
      
      expect(result.overallScore).toBeGreaterThan(50);
      expect(result.source).toBeDefined();
      expect(result.host).toBe('apnews.com');
    });
    
    it('should include extracted claims count', async () => {
      const result = await service.analyzeArticle({
        host: 'reuters.com',
        text: 'According to the report, unemployment fell to 3.5 percent.'
      });
      
      expect(result.claims).toBeDefined();
      expect(result.claims.total).toBeGreaterThanOrEqual(0);
    });
    
    it('should return badge with analysis', async () => {
      const result = await service.analyzeArticle({
        host: 'nytimes.com',
        text: 'Some article text'
      });
      
      expect(result.badge).toBeDefined();
      expect(result.badge.emoji).toBeDefined();
      expect(result.badge.label).toBeDefined();
    });
    
    it('should include flags for questionable sources', async () => {
      const result = await service.analyzeArticle({
        host: 'infowars.com',
        text: 'Conspiracy theories here'
      });
      
      expect(result.flags.length).toBeGreaterThan(0);
      expect(result.overallScore).toBeLessThan(50);
    });
    
    it('should note satire sources', async () => {
      const result = await service.analyzeArticle({
        host: 'theonion.com',
        text: 'Satirical content'
      });
      
      expect(result.flags.some(f => f.message.includes('satire'))).toBe(true);
    });
    
    it('should include timestamp', async () => {
      const result = await service.analyzeArticle({
        host: 'reuters.com'
      });
      
      expect(result.analyzedAt).toBeDefined();
    });
    
    it('should include factor scores', async () => {
      const result = await service.analyzeArticle({
        host: 'apnews.com',
        text: 'Test content'
      });
      
      expect(result.factors).toBeDefined();
      expect(result.factors.source).toBeDefined();
    });
    
    it('should include source credibility info', async () => {
      const result = await service.analyzeArticle({
        host: 'reuters.com'
      });
      
      expect(result.source.credibilityScore).toBe(92);
    });
  });
  
  describe('analyzeById', () => {
    it('should throw error when adapter not available', async () => {
      await expect(service.analyzeById(123)).rejects.toThrow('articlesAdapter required');
    });
    
    it('should work with mock adapter', async () => {
      const serviceWithAdapter = new FactCheckService({
        articlesAdapter: {
          getArticleById: (id) => ({
            url: 'https://apnews.com/article/123',
            bodyText: 'Article text here'
          })
        }
      });
      
      const result = await serviceWithAdapter.analyzeById(123);
      expect(result.host).toBe('apnews.com');
    });
  });
  
  describe('getSourceCredibility', () => {
    it('should return source credibility data', () => {
      const result = service.getSourceCredibility('apnews.com');
      
      expect(result.credibilityScore).toBe(92);
      expect(result.mbfcRating).toBe('high');
    });
    
    it('should normalize hostnames', () => {
      const result = service.getSourceCredibility('www.REUTERS.com');
      
      expect(result.credibilityScore).toBe(92);
    });
    
    it('should return default for unknown sources', () => {
      const result = service.getSourceCredibility('unknown-site.example');
      
      expect(result.credibilityScore).toBe(50);
      expect(result.source).toBe('unknown');
    });
  });
  
  describe('updateSourceCredibility', () => {
    it('should update source in rater', () => {
      service.updateSourceCredibility('newsite.com', {
        credibilityScore: 75,
        mbfcRating: 'mostly-factual'
      });
      
      const result = service.getSourceCredibility('newsite.com');
      expect(result.credibilityScore).toBe(75);
    });
  });
  
  describe('invalidateCache', () => {
    it('should return deleted count without adapter', () => {
      const result = service.invalidateCache(123);
      expect(result.deleted).toBe(0);
    });
  });
  
  describe('clearApiCache', () => {
    it('should clear the API cache', () => {
      // Add something to cache
      service.apiCache.set('test', { timestamp: Date.now(), results: [] });
      expect(service.apiCache.size).toBe(1);
      
      service.clearApiCache();
      expect(service.apiCache.size).toBe(0);
    });
  });
  
  describe('getStats', () => {
    it('should return service statistics', () => {
      const stats = service.getStats();
      
      expect(stats.hasAdapter).toBe(false);
      expect(stats.hasArticlesAdapter).toBe(false);
      expect(stats.useGoogleApi).toBe(false);
      expect(stats.apiCacheSize).toBe(0);
      expect(stats.sourceRaterStats).toBeDefined();
      expect(stats.claimExtractorStats).toBeDefined();
      expect(stats.credibilityScorerStats).toBeDefined();
    });
  });
  
  describe('getAllSources', () => {
    it('should return all known sources', () => {
      const sources = service.getAllSources();
      
      expect(sources.length).toBeGreaterThan(0);
      expect(sources.find(s => s.host === 'apnews.com')).toBeDefined();
    });
    
    it('should filter by minimum score', () => {
      const sources = service.getAllSources({ minScore: 80 });
      
      for (const src of sources) {
        expect(src.credibilityScore).toBeGreaterThanOrEqual(80);
      }
    });
  });
  
  describe('searchFactChecks', () => {
    it('should return empty without adapter', () => {
      const result = service.searchFactChecks('test');
      expect(result).toEqual([]);
    });
  });
  
  describe('addFactCheck', () => {
    it('should throw without adapter', () => {
      expect(() => service.addFactCheck({
        claimText: 'Test claim',
        rating: 'true',
        source: 'Test'
      })).toThrow('trustAdapter required');
    });
  });
});

describe('FactCheckService integration', () => {
  let service;
  
  beforeEach(() => {
    service = new FactCheckService();
  });
  
  it('should analyze article with all components working together', async () => {
    const result = await service.analyzeArticle({
      host: 'nytimes.com',
      text: `
        According to government data, unemployment has dropped to 3.5 percent.
        The Federal Reserve announced that inflation remains under control.
        Critics argue that the policy has not achieved its stated goals.
      `
    });
    
    expect(result.overallScore).toBeDefined();
    expect(result.badge).toBeDefined();
    expect(result.source).toBeDefined();
    expect(result.factors).toBeDefined();
    expect(result.claims).toBeDefined();
  });
  
  it('should produce consistent results for same input', async () => {
    const article = {
      host: 'apnews.com',
      text: 'The president signed the bill into law today.'
    };
    
    const result1 = await service.analyzeArticle(article);
    const result2 = await service.analyzeArticle(article);
    
    expect(result1.overallScore).toBe(result2.overallScore);
    expect(result1.badge.level).toBe(result2.badge.level);
  });
  
  it('should handle various source types appropriately', async () => {
    const sources = ['apnews.com', 'foxnews.com', 'infowars.com', 'theonion.com'];
    
    const results = await Promise.all(
      sources.map(host => service.analyzeArticle({ host }))
    );
    
    // Wire service should score highest
    expect(results[0].source.credibilityScore).toBeGreaterThan(results[1].source.credibilityScore);
    // Conspiracy source should score lowest among non-satire
    expect(results[2].source.credibilityScore).toBeLessThan(results[1].source.credibilityScore);
    // Satire should be flagged
    expect(results[3].flags.some(f => f.message.includes('satire'))).toBe(true);
  });
});
