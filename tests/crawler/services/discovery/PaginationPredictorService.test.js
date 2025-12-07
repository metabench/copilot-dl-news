'use strict';

const { PaginationPredictorService } = require('../../../../src/crawler/services/PaginationPredictorService');

describe('PaginationPredictorService', () => {
  let service;

  beforeEach(() => {
    service = new PaginationPredictorService({
      maxSpeculativePages: 3,
      patternTtlMs: 60000
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('detectPattern', () => {
    describe('query parameter patterns', () => {
      it('should detect ?page=N pattern', () => {
        const result = service.detectPattern('https://example.com/news?page=5');
        
        expect(result.detected).toBe(true);
        expect(result.pattern.type).toBe('query-page');
        expect(result.pattern.param).toBe('page');
        expect(result.pageNum).toBe(5);
        expect(result.basePath).toBe('https://example.com/news');
      });

      it('should detect ?p=N pattern', () => {
        const result = service.detectPattern('https://example.com/news?p=3');
        
        expect(result.detected).toBe(true);
        expect(result.pattern.type).toBe('query-p');
        expect(result.pageNum).toBe(3);
      });

      it('should detect ?paged=N pattern', () => {
        const result = service.detectPattern('https://example.com/blog?paged=2');
        
        expect(result.detected).toBe(true);
        expect(result.pattern.type).toBe('query-paged');
        expect(result.pageNum).toBe(2);
      });

      it('should detect ?offset=N pattern', () => {
        const result = service.detectPattern('https://example.com/list?offset=20');
        
        expect(result.detected).toBe(true);
        expect(result.pattern.type).toBe('query-offset');
        expect(result.pattern.multiplier).toBe(true);
        expect(result.pageNum).toBe(20);
      });

      it('should preserve other query parameters in basePath', () => {
        const result = service.detectPattern('https://example.com/news?category=tech&page=5&sort=date');
        
        expect(result.detected).toBe(true);
        expect(result.basePath).toContain('category=tech');
        expect(result.basePath).toContain('sort=date');
        expect(result.basePath).not.toContain('page=');
      });
    });

    describe('path-based patterns', () => {
      it('should detect /page/N pattern', () => {
        const result = service.detectPattern('https://example.com/news/page/5');
        
        expect(result.detected).toBe(true);
        expect(result.pattern.type).toBe('path-page');
        expect(result.pageNum).toBe(5);
        expect(result.basePath).toBe('https://example.com/news');
      });

      it('should detect /page/N/ with trailing slash', () => {
        const result = service.detectPattern('https://example.com/news/page/3/');
        
        expect(result.detected).toBe(true);
        expect(result.pageNum).toBe(3);
      });

      it('should detect /p/N pattern', () => {
        const result = service.detectPattern('https://example.com/articles/p/2');
        
        expect(result.detected).toBe(true);
        expect(result.pattern.type).toBe('path-p');
        expect(result.pageNum).toBe(2);
      });

      it('should detect path-numeric pattern', () => {
        const result = service.detectPattern('https://example.com/gallery/42');
        
        expect(result.detected).toBe(true);
        expect(result.pattern.type).toBe('path-numeric');
        expect(result.pageNum).toBe(42);
      });
    });

    describe('non-pagination URLs', () => {
      it('should not detect pattern in regular URL', () => {
        const result = service.detectPattern('https://example.com/news/article-title');
        
        expect(result.detected).toBe(false);
        expect(result.pattern).toBeNull();
      });

      it('should handle invalid URLs gracefully', () => {
        const result = service.detectPattern('not-a-url');
        
        expect(result.detected).toBe(false);
      });
    });
  });

  describe('analyzePageLinks', () => {
    it('should detect pagination patterns in links', () => {
      const currentUrl = 'https://example.com/news';
      const links = [
        'https://example.com/news?page=1',
        'https://example.com/news?page=2',
        'https://example.com/news?page=3',
        'https://example.com/article/some-title'
      ];
      
      const result = service.analyzePageLinks(currentUrl, links);
      
      expect(result.detected).toBe(true);
      expect(result.maxPage).toBe(3);
      expect(result.patterns.length).toBeGreaterThan(0);
    });

    it('should handle relative links', () => {
      const currentUrl = 'https://example.com/news';
      const links = ['/news?page=1', '/news?page=2'];
      
      const result = service.analyzePageLinks(currentUrl, links);
      
      expect(result.detected).toBe(true);
      expect(result.maxPage).toBe(2);
    });

    it('should return empty for URLs without pagination', () => {
      const currentUrl = 'https://example.com/about';
      const links = [
        'https://example.com/contact',
        'https://example.com/team'
      ];
      
      const result = service.analyzePageLinks(currentUrl, links);
      
      expect(result.detected).toBe(false);
      expect(result.patterns).toEqual([]);
    });
  });

  describe('recordVisit', () => {
    it('should record new pattern on first visit', () => {
      const handler = jest.fn();
      service.on('pattern-detected', handler);
      
      service.recordVisit('https://example.com/news?page=1', { hasContent: true });
      
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        basePath: 'https://example.com/news',
        pageNum: 1
      }));
    });

    it('should update maxPage on subsequent visits', () => {
      service.recordVisit('https://example.com/news?page=1', { hasContent: true });
      service.recordVisit('https://example.com/news?page=3', { hasContent: true });
      
      const state = service.getPatternState('https://example.com/news');
      expect(state.maxPage).toBe(3);
    });

    it('should analyze links when provided', () => {
      service.recordVisit('https://example.com/news?page=1', {
        hasContent: true,
        links: [
          'https://example.com/news?page=1',
          'https://example.com/news?page=2',
          'https://example.com/news?page=10'
        ]
      });
      
      const state = service.getPatternState('https://example.com/news');
      expect(state.maxPage).toBe(10);
    });

    it('should not record non-pagination URLs', () => {
      service.recordVisit('https://example.com/article/title', { hasContent: true });
      
      const patterns = service.getAllPatterns();
      expect(patterns.length).toBe(0);
    });
  });

  describe('recordFailure', () => {
    it('should mark pattern as exhausted on 404', () => {
      service.recordVisit('https://example.com/news?page=1', { hasContent: true });
      
      const handler = jest.fn();
      service.on('pattern-exhausted', handler);
      
      service.recordFailure('https://example.com/news?page=2', '404');
      
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        basePath: 'https://example.com/news',
        reason: '404'
      }));
      
      const state = service.getPatternState('https://example.com/news');
      expect(state.exhausted).toBe(true);
    });

    it('should mark pattern as exhausted on empty content', () => {
      service.recordVisit('https://example.com/news?page=1', { hasContent: true });
      service.recordFailure('https://example.com/news?page=5', 'empty');
      
      const state = service.getPatternState('https://example.com/news');
      expect(state.exhausted).toBe(true);
    });

    it('should increment failure count', () => {
      service.recordVisit('https://example.com/news?page=1', { hasContent: true });
      service.recordFailure('https://example.com/news?page=2', 'error');
      
      const state = service.getPatternState('https://example.com/news');
      expect(state.failures).toBe(1);
    });
  });

  describe('generateSpeculative', () => {
    it('should generate next page URLs', () => {
      service.recordVisit('https://example.com/news?page=3', { hasContent: true });
      
      const urls = service.generateSpeculative('https://example.com/news');
      
      // maxSpeculativePages=3, maxPage=3, so generates pages 4, 5, 6
      expect(urls).toEqual([
        'https://example.com/news?page=4',
        'https://example.com/news?page=5',
        'https://example.com/news?page=6'
      ]);
    });

    it('should respect limit option', () => {
      service.recordVisit('https://example.com/news?page=1', { hasContent: true });
      
      const urls = service.generateSpeculative('https://example.com/news', { limit: 2 });
      
      expect(urls.length).toBe(2);
    });

    it('should exclude known URLs', () => {
      service.recordVisit('https://example.com/news?page=1', { hasContent: true });
      
      const knownUrls = new Set(['https://example.com/news?page=2']);
      const urls = service.generateSpeculative('https://example.com/news', { knownUrls });
      
      expect(urls).not.toContain('https://example.com/news?page=2');
    });

    it('should not generate for exhausted patterns', () => {
      service.recordVisit('https://example.com/news?page=1', { hasContent: true });
      service.recordFailure('https://example.com/news?page=2', '404');
      
      const urls = service.generateSpeculative('https://example.com/news');
      
      expect(urls).toEqual([]);
    });

    it('should return empty for unknown base path', () => {
      const urls = service.generateSpeculative('https://unknown.com/news');
      
      expect(urls).toEqual([]);
    });

    it('should generate path-based URLs correctly', () => {
      service.recordVisit('https://example.com/news/page/2', { hasContent: true });
      
      const urls = service.generateSpeculative('https://example.com/news');
      
      expect(urls[0]).toBe('https://example.com/news/page/3');
    });
  });

  describe('generateAllSpeculative', () => {
    it('should generate speculative URLs for all active patterns', () => {
      service.recordVisit('https://example.com/news?page=1', { hasContent: true });
      service.recordVisit('https://other.com/blog?page=2', { hasContent: true });
      
      const results = service.generateAllSpeculative({ limitPerPattern: 2 });
      
      expect(results.length).toBe(4); // 2 per pattern
      expect(results.every(r => r.source === 'pagination-speculation')).toBe(true);
    });

    it('should skip exhausted patterns', () => {
      service.recordVisit('https://example.com/news?page=1', { hasContent: true });
      service.recordFailure('https://example.com/news?page=2', '404');
      
      const results = service.generateAllSpeculative();
      
      expect(results.length).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return comprehensive statistics', () => {
      service.recordVisit('https://example.com/news?page=1', { hasContent: true });
      service.generateSpeculative('https://example.com/news');
      
      const stats = service.getStats();
      
      expect(stats).toEqual(expect.objectContaining({
        patternsDetected: 1,
        speculativeGenerated: expect.any(Number),
        activePatterns: 1,
        exhaustedPatterns: 0
      }));
    });
  });

  describe('cleanup', () => {
    it('should remove stale patterns', () => {
      // Create service with very short TTL for testing
      const shortTtlService = new PaginationPredictorService({
        patternTtlMs: 100
      });
      
      shortTtlService.recordVisit('https://example.com/news?page=1', { hasContent: true });
      expect(shortTtlService.getAllPatterns().length).toBe(1);
      
      // Wait for TTL to expire
      return new Promise(resolve => {
        setTimeout(() => {
          shortTtlService.cleanup();
          expect(shortTtlService.getAllPatterns().length).toBe(0);
          resolve();
        }, 150);
      });
    });
  });

  describe('reset', () => {
    it('should clear all state and stats', () => {
      service.recordVisit('https://example.com/news?page=1', { hasContent: true });
      service.generateSpeculative('https://example.com/news');
      
      service.reset();
      
      expect(service.getAllPatterns().length).toBe(0);
      const stats = service.getStats();
      expect(stats.patternsDetected).toBe(0);
      expect(stats.speculativeGenerated).toBe(0);
    });
  });

  describe('getAllPatterns', () => {
    it('should return all tracked patterns', () => {
      service.recordVisit('https://example.com/news?page=1', { hasContent: true });
      service.recordVisit('https://other.com/blog/page/2', { hasContent: true });
      
      const patterns = service.getAllPatterns();
      
      expect(patterns.length).toBe(2);
      expect(patterns[0]).toEqual(expect.objectContaining({
        basePath: expect.any(String),
        state: expect.objectContaining({
          pattern: expect.any(Object),
          maxPage: expect.any(Number)
        })
      }));
    });
  });
});
