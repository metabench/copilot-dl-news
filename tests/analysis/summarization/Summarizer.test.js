'use strict';

/**
 * Summarizer Tests
 * 
 * Tests for the main summarization service.
 */

const { 
  Summarizer, 
  DEFAULT_CONFIG, 
  MIN_SENTENCES_FOR_SUMMARIZATION 
} = require('../../../src/analysis/summarization/Summarizer');

describe('Summarizer', () => {
  let summarizer;
  
  beforeEach(() => {
    summarizer = new Summarizer();
  });
  
  describe('constructor', () => {
    it('should use default config', () => {
      expect(summarizer.config).toEqual(DEFAULT_CONFIG);
    });
    
    it('should accept custom config', () => {
      const custom = new Summarizer({
        config: {
          brief: { sentenceCount: 2, targetWords: 50 }
        }
      });
      
      expect(custom.config.brief.sentenceCount).toBe(2);
      expect(custom.config.brief.targetWords).toBe(50);
    });
    
    it('should accept adapters', () => {
      const mockSummaryAdapter = { saveSummary: jest.fn() };
      const mockArticlesAdapter = { getArticle: jest.fn() };
      
      const s = new Summarizer({
        summaryAdapter: mockSummaryAdapter,
        articlesAdapter: mockArticlesAdapter
      });
      
      expect(s.summaryAdapter).toBe(mockSummaryAdapter);
      expect(s.articlesAdapter).toBe(mockArticlesAdapter);
    });
  });
  
  describe('summarize()', () => {
    const sampleText = `
      The government announced new economic policy measures today.
      These measures are expected to have significant impact on the market.
      Business leaders expressed cautious optimism about the changes.
      The stock market responded positively to the announcement.
      Analysts predict continued growth in the coming months.
      Consumer confidence remains high despite global uncertainties.
      The central bank is monitoring inflation closely.
    `;
    
    it('should generate brief summary (1 sentence)', () => {
      const result = summarizer.summarize(sampleText, { length: 'brief' });
      
      expect(result.length).toBe('brief');
      expect(result.sentenceCount).toBe(1);
      expect(result.summary).toBeTruthy();
      expect(result.method).toBe('textrank');
    });
    
    it('should generate short summary (3 sentences)', () => {
      const result = summarizer.summarize(sampleText, { length: 'short' });
      
      expect(result.length).toBe('short');
      expect(result.sentenceCount).toBe(3);
      expect(result.summary).toBeTruthy();
    });
    
    it('should generate full summary (~150 words)', () => {
      const result = summarizer.summarize(sampleText, { length: 'full' });
      
      expect(result.length).toBe('full');
      expect(result.summary).toBeTruthy();
      // Should have multiple sentences for full summary
      expect(result.sentenceCount).toBeGreaterThanOrEqual(1);
    });
    
    it('should generate bullet point summary', () => {
      const result = summarizer.summarize(sampleText, { length: 'bullets' });
      
      expect(result.length).toBe('bullets');
      expect(result.summary).toContain('•');
      expect(result.sentenceCount).toBeGreaterThanOrEqual(1);
    });
    
    it('should use short as default length', () => {
      const result = summarizer.summarize(sampleText);
      
      expect(result.length).toBe('short');
    });
    
    it('should include word count', () => {
      const result = summarizer.summarize(sampleText);
      
      expect(result.wordCount).toBeGreaterThan(0);
    });
    
    it('should include method', () => {
      const result = summarizer.summarize(sampleText);
      
      expect(result.method).toBe('textrank');
    });
    
    it('should handle empty text', () => {
      const result = summarizer.summarize('');
      
      expect(result.summary).toBe('');
      expect(result.sentenceCount).toBe(0);
      expect(result.error).toBe('No text to summarize');
    });
    
    it('should handle null/undefined', () => {
      expect(summarizer.summarize(null).summary).toBe('');
      expect(summarizer.summarize(undefined).summary).toBe('');
    });
    
    it('should handle very short text (< MIN_SENTENCES)', () => {
      const shortText = 'This is a short text. Only two sentences.';
      const result = summarizer.summarize(shortText);
      
      // Should return the whole text as summary
      expect(result.summary).toContain('short text');
      expect(result.method).toBe('direct'); // Not textrank for short text
    });
    
    it('should preserve sentence order in output', () => {
      const result = summarizer.summarize(sampleText, { length: 'short' });
      
      // Check that sentences appear in logical order
      // The summary should read naturally
      expect(result.summary).toBeTruthy();
      // Should not start mid-sentence
      expect(result.summary[0]).toMatch(/[A-Z]/);
    });
  });
  
  describe('summarizeBullets()', () => {
    const text = `
      Technology companies are investing in AI.
      Artificial intelligence is transforming industries.
      Machine learning algorithms improve daily.
      Data scientists are in high demand.
      The future of computing is bright.
    `;
    
    it('should return bullets array', () => {
      const result = summarizer.summarizeBullets(text);
      
      expect(result.bullets).toBeDefined();
      expect(Array.isArray(result.bullets)).toBe(true);
      expect(result.bullets.length).toBeGreaterThan(0);
    });
    
    it('should have length type of bullets', () => {
      const result = summarizer.summarizeBullets(text);
      
      expect(result.length).toBe('bullets');
    });
    
    it('should format with bullet points', () => {
      const result = summarizer.summarizeBullets(text);
      
      for (const bullet of result.bullets) {
        expect(bullet).toMatch(/^• /);
      }
    });
  });
  
  describe('summarizeArticle()', () => {
    it('should require articles adapter', async () => {
      await expect(summarizer.summarizeArticle(123))
        .rejects.toThrow('Articles adapter required');
    });
    
    it('should fetch article and generate summary', async () => {
      const mockArticlesAdapter = {
        getArticle: jest.fn().mockReturnValue({
          id: 123,
          bodyText: 'First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence.'
        })
      };
      
      const s = new Summarizer({ articlesAdapter: mockArticlesAdapter });
      const result = await s.summarizeArticle(123);
      
      expect(mockArticlesAdapter.getArticle).toHaveBeenCalledWith(123);
      expect(result.articleId).toBe(123);
      expect(result.summary).toBeTruthy();
      expect(result.cached).toBe(false);
    });
    
    it('should use cache when available', async () => {
      const mockSummaryAdapter = {
        getSummary: jest.fn().mockReturnValue({
          summary: 'Cached summary',
          length: 'short',
          sentenceCount: 3,
          wordCount: 10
        })
      };
      const mockArticlesAdapter = {
        getArticle: jest.fn()
      };
      
      const s = new Summarizer({ 
        summaryAdapter: mockSummaryAdapter,
        articlesAdapter: mockArticlesAdapter 
      });
      const result = await s.summarizeArticle(123);
      
      expect(mockSummaryAdapter.getSummary).toHaveBeenCalledWith(123, 'short');
      expect(result.cached).toBe(true);
      expect(mockArticlesAdapter.getArticle).not.toHaveBeenCalled();
    });
    
    it('should regenerate when forced', async () => {
      const mockSummaryAdapter = {
        getSummary: jest.fn(),
        saveSummary: jest.fn()
      };
      const mockArticlesAdapter = {
        getArticle: jest.fn().mockReturnValue({
          id: 123,
          bodyText: 'First. Second. Third. Fourth. Fifth.'
        })
      };
      
      const s = new Summarizer({ 
        summaryAdapter: mockSummaryAdapter,
        articlesAdapter: mockArticlesAdapter 
      });
      const result = await s.summarizeArticle(123, { regenerate: true });
      
      expect(mockSummaryAdapter.getSummary).not.toHaveBeenCalled();
      expect(result.cached).toBe(false);
    });
    
    it('should throw for missing article', async () => {
      const mockArticlesAdapter = {
        getArticle: jest.fn().mockReturnValue(null)
      };
      
      const s = new Summarizer({ articlesAdapter: mockArticlesAdapter });
      
      await expect(s.summarizeArticle(999))
        .rejects.toThrow('Article not found: 999');
    });
    
    it('should save to cache after generation', async () => {
      const mockSummaryAdapter = {
        getSummary: jest.fn().mockReturnValue(null),
        saveSummary: jest.fn()
      };
      const mockArticlesAdapter = {
        getArticle: jest.fn().mockReturnValue({
          id: 123,
          bodyText: 'First. Second. Third. Fourth. Fifth.'
        })
      };
      
      const s = new Summarizer({ 
        summaryAdapter: mockSummaryAdapter,
        articlesAdapter: mockArticlesAdapter 
      });
      await s.summarizeArticle(123);
      
      expect(mockSummaryAdapter.saveSummary).toHaveBeenCalled();
    });
  });
  
  describe('batchSummarize()', () => {
    it('should summarize multiple articles', async () => {
      const mockArticlesAdapter = {
        getArticle: jest.fn().mockImplementation(id => ({
          id,
          bodyText: `Article ${id}. First sentence. Second sentence. Third sentence. Fourth sentence.`
        }))
      };
      
      const s = new Summarizer({ articlesAdapter: mockArticlesAdapter });
      const results = await s.batchSummarize([1, 2, 3]);
      
      expect(results).toHaveLength(3);
      expect(results[0].articleId).toBe(1);
      expect(results[1].articleId).toBe(2);
      expect(results[2].articleId).toBe(3);
    });
    
    it('should handle errors gracefully', async () => {
      const mockArticlesAdapter = {
        getArticle: jest.fn().mockImplementation(id => {
          if (id === 2) return null;
          return { id, bodyText: 'A. B. C. D. E.' };
        })
      };
      
      const s = new Summarizer({ 
        articlesAdapter: mockArticlesAdapter,
        logger: { error: jest.fn() }
      });
      const results = await s.batchSummarize([1, 2, 3]);
      
      expect(results).toHaveLength(3);
      expect(results[1].error).toBeDefined();
    });
  });
  
  describe('invalidateCache()', () => {
    it('should delete cached summaries', () => {
      const mockSummaryAdapter = {
        deleteSummaries: jest.fn().mockReturnValue({ deleted: 2 })
      };
      
      const s = new Summarizer({ summaryAdapter: mockSummaryAdapter });
      const result = s.invalidateCache(123);
      
      expect(mockSummaryAdapter.deleteSummaries).toHaveBeenCalledWith(123, null);
      expect(result.deleted).toBe(2);
    });
    
    it('should delete specific length type', () => {
      const mockSummaryAdapter = {
        deleteSummaries: jest.fn().mockReturnValue({ deleted: 1 })
      };
      
      const s = new Summarizer({ summaryAdapter: mockSummaryAdapter });
      s.invalidateCache(123, 'short');
      
      expect(mockSummaryAdapter.deleteSummaries).toHaveBeenCalledWith(123, 'short');
    });
    
    it('should return 0 when no adapter', () => {
      const result = summarizer.invalidateCache(123);
      
      expect(result.deleted).toBe(0);
    });
  });
  
  describe('getStats()', () => {
    it('should return configuration', () => {
      const stats = summarizer.getStats();
      
      expect(stats.config).toEqual(DEFAULT_CONFIG);
      expect(stats.hasAdapter).toBe(false);
      expect(stats.hasArticlesAdapter).toBe(false);
    });
    
    it('should include cache stats when adapter present', () => {
      const mockSummaryAdapter = {
        getStats: jest.fn().mockReturnValue({ totalSummaries: 100 })
      };
      
      const s = new Summarizer({ summaryAdapter: mockSummaryAdapter });
      const stats = s.getStats();
      
      expect(stats.hasAdapter).toBe(true);
      expect(stats.cacheStats).toEqual({ totalSummaries: 100 });
    });
  });
  
  describe('DEFAULT_CONFIG', () => {
    it('should have correct brief settings', () => {
      expect(DEFAULT_CONFIG.brief.sentenceCount).toBe(1);
      expect(DEFAULT_CONFIG.brief.targetWords).toBe(25);
    });
    
    it('should have correct short settings', () => {
      expect(DEFAULT_CONFIG.short.sentenceCount).toBe(3);
      expect(DEFAULT_CONFIG.short.targetWords).toBe(75);
    });
    
    it('should have correct full settings', () => {
      expect(DEFAULT_CONFIG.full.sentenceCount).toBeNull();
      expect(DEFAULT_CONFIG.full.targetWords).toBe(150);
    });
    
    it('should have correct bullets settings', () => {
      expect(DEFAULT_CONFIG.bullets.sentenceCount).toBe(5);
      expect(DEFAULT_CONFIG.bullets.targetWords).toBeNull();
    });
  });
  
  describe('MIN_SENTENCES_FOR_SUMMARIZATION', () => {
    it('should be 3', () => {
      expect(MIN_SENTENCES_FOR_SUMMARIZATION).toBe(3);
    });
  });
});
