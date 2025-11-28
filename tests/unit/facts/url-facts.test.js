'use strict';

/**
 * @fileoverview Unit tests for URL facts
 */

const { 
  UrlFact,
  HasDateSegment, 
  HasSlugPattern, 
  HasNewsKeyword,
  HasPaginationPattern,
  IsHomepage,
  FactRegistry
} = require('../../../src/facts');

describe('URL Facts', () => {
  describe('HasDateSegment', () => {
    let fact;
    
    beforeEach(() => {
      fact = new HasDateSegment();
    });
    
    test('detects YYYY/MM/DD pattern', () => {
      const result = fact.extract('https://news.com/2024/01/15/story');
      expect(result.value).toBe(true);
      expect(result.evidence.year).toBe('2024');
      expect(result.evidence.month).toBe('01');
      expect(result.evidence.day).toBe('15');
      expect(result.evidence.format).toBe('YYYY/MM/DD');
    });
    
    test('detects YYYY-MM-DD pattern', () => {
      const result = fact.extract('https://news.com/2024-01-15/story');
      expect(result.value).toBe(true);
      expect(result.evidence.format).toBe('YYYY-MM-DD');
    });
    
    test('detects YYYYMMDD pattern', () => {
      const result = fact.extract('https://news.com/20240115/story');
      expect(result.value).toBe(true);
      expect(result.evidence.format).toBe('YYYYMMDD');
    });
    
    test('detects YYYY/MM pattern', () => {
      const result = fact.extract('https://news.com/2024/01/story');
      expect(result.value).toBe(true);
      expect(result.evidence.format).toBe('YYYY/MM');
      expect(result.evidence.day).toBe(null);
    });
    
    test('rejects invalid month', () => {
      const result = fact.extract('https://news.com/2024/13/15/story');
      expect(result.value).toBe(false);
    });
    
    test('returns false for URLs without dates', () => {
      const result = fact.extract('https://news.com/category/story-slug');
      expect(result.value).toBe(false);
    });
  });
  
  describe('HasSlugPattern', () => {
    let fact;
    
    beforeEach(() => {
      fact = new HasSlugPattern();
    });
    
    test('detects hyphenated slug with 3+ words', () => {
      const result = fact.extract('https://news.com/breaking-news-story');
      expect(result.value).toBe(true);
      expect(result.evidence.wordCount).toBe(3);
      expect(result.evidence.separator).toBe('-');
    });
    
    test('detects underscore slug', () => {
      const result = fact.extract('https://news.com/breaking_news_story_here');
      expect(result.value).toBe(true);
      expect(result.evidence.separator).toBe('_');
    });
    
    test('strips html extension', () => {
      const result = fact.extract('https://news.com/breaking-news-story.html');
      expect(result.value).toBe(true);
    });
    
    test('rejects single-word segments', () => {
      const result = fact.extract('https://news.com/category');
      expect(result.value).toBe(false);
    });
    
    test('rejects two-word segments', () => {
      const result = fact.extract('https://news.com/news-stories');
      expect(result.value).toBe(false);
    });
    
    test('returns false for numeric-only paths', () => {
      const result = fact.extract('https://news.com/12345');
      expect(result.value).toBe(false);
    });
  });
  
  describe('HasNewsKeyword', () => {
    let fact;
    
    beforeEach(() => {
      fact = new HasNewsKeyword();
    });
    
    test('detects /news/ segment', () => {
      const result = fact.extract('https://example.com/news/2024/story');
      expect(result.value).toBe(true);
      expect(result.evidence.keyword).toBe('news');
    });
    
    test('detects /article/ segment', () => {
      const result = fact.extract('https://example.com/article/12345');
      expect(result.value).toBe(true);
      expect(result.evidence.keyword).toBe('article');
    });
    
    test('detects /story/ segment', () => {
      const result = fact.extract('https://example.com/story/breaking-news');
      expect(result.value).toBe(true);
      expect(result.evidence.keyword).toBe('story');
    });
    
    test('is case-insensitive', () => {
      const result = fact.extract('https://example.com/NEWS/2024');
      expect(result.value).toBe(true);
    });
    
    test('returns false when no keywords present', () => {
      const result = fact.extract('https://example.com/products/widget');
      expect(result.value).toBe(false);
    });
    
    test('does not match substrings', () => {
      // "newsroom" should NOT match "news" keyword
      const result = fact.extract('https://example.com/newsroom/latest-updates');
      expect(result.value).toBe(false);
      expect(result.evidence.reason).toContain('No news keywords found');
    });
  });
  
  describe('IsHomepage', () => {
    let fact;
    
    beforeEach(() => {
      fact = new IsHomepage();
    });
    
    test('detects root path /', () => {
      const result = fact.extract('https://example.com/');
      expect(result.value).toBe(true);
      expect(result.evidence.pattern).toBe('root');
    });
    
    test('detects empty path', () => {
      const result = fact.extract('https://example.com');
      expect(result.value).toBe(true);
    });
    
    test('detects /index.html', () => {
      const result = fact.extract('https://example.com/index.html');
      expect(result.value).toBe(true);
    });
    
    test('detects /home', () => {
      const result = fact.extract('https://example.com/home');
      expect(result.value).toBe(true);
    });
    
    test('returns false for article paths', () => {
      const result = fact.extract('https://example.com/news/story');
      expect(result.value).toBe(false);
    });
  });
  
  describe('HasPaginationPattern', () => {
    let fact;
    
    beforeEach(() => {
      fact = new HasPaginationPattern();
    });
    
    test('detects ?page=2 query parameter', () => {
      const result = fact.extract('https://example.com/news?page=2');
      expect(result.value).toBe(true);
      expect(result.evidence.type).toBe('query');
      expect(result.evidence.param).toBe('page');
      expect(result.evidence.pageNumber).toBe(2);
    });
    
    test('detects ?p=3 short form', () => {
      const result = fact.extract('https://example.com/category?p=3');
      expect(result.value).toBe(true);
      expect(result.evidence.param).toBe('p');
    });
    
    test('detects ?offset=10 parameter', () => {
      const result = fact.extract('https://example.com/list?offset=10');
      expect(result.value).toBe(true);
      expect(result.evidence.param).toBe('offset');
    });
    
    test('detects /page/2 path pattern', () => {
      const result = fact.extract('https://example.com/news/page/2');
      expect(result.value).toBe(true);
      expect(result.evidence.type).toBe('path');
      expect(result.evidence.pageNumber).toBe(2);
    });
    
    test('ignores page=1 (default page)', () => {
      // Page 1 in path is often not real pagination
      const result = fact.extract('https://example.com/news/page/1');
      expect(result.value).toBe(false);
    });
    
    test('ignores non-numeric page values', () => {
      const result = fact.extract('https://example.com/news?page=next');
      expect(result.value).toBe(false);
    });
    
    test('returns false for clean URLs without pagination', () => {
      const result = fact.extract('https://example.com/2024/01/15/story-slug');
      expect(result.value).toBe(false);
    });
    
    test('avoids false positives for years in path', () => {
      // /2024/ should not be detected as pagination
      const result = fact.extract('https://example.com/archive/2024/');
      expect(result.value).toBe(false);
    });
  });

  describe('FactRegistry', () => {
    let registry;
    
    beforeEach(() => {
      FactRegistry.reset();
      registry = FactRegistry.getInstance();
    });
    
    test('loads built-in URL facts', () => {
      expect(registry.size).toBe(5);
      expect(registry.getCategories()).toContain('url');
    });
    
    test('retrieves fact by name', () => {
      const fact = registry.get('url.hasDateSegment');
      expect(fact).toBeInstanceOf(HasDateSegment);
    });
    
    test('retrieves pagination fact', () => {
      const fact = registry.get('url.hasPaginationPattern');
      expect(fact).toBeInstanceOf(HasPaginationPattern);
    });
    
    test('returns undefined for unknown fact', () => {
      expect(registry.get('unknown.fact')).toBeUndefined();
    });
    
    test('getRunnableFacts filters by available data', () => {
      const urlOnly = registry.getRunnableFacts({ url: 'https://test.com' });
      expect(urlOnly.length).toBe(5); // All URL facts should be runnable
    });
    
    test('getAllMetadata returns fact metadata', () => {
      const metadata = registry.getAllMetadata();
      expect(metadata.length).toBe(5);
      expect(metadata[0]).toHaveProperty('name');
      expect(metadata[0]).toHaveProperty('description');
      expect(metadata[0]).toHaveProperty('category');
    });
  });
});
