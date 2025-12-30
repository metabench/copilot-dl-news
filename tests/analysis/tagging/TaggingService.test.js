'use strict';

/**
 * TaggingService Tests
 * 
 * Tests for the tagging pipeline components (without DB integration).
 * For full integration tests with database, use the check scripts.
 */

const { TaggingService } = require('../../../src/analysis/tagging/TaggingService');
const { KeywordExtractor } = require('../../../src/analysis/tagging/KeywordExtractor');
const { CategoryClassifier, UNCATEGORIZED } = require('../../../src/analysis/tagging/CategoryClassifier');
const { EntityRecognizer } = require('../../../src/analysis/tagging/EntityRecognizer');

describe('TaggingService', () => {
  let service;
  
  beforeEach(() => {
    // Create service without database adapter
    service = new TaggingService({
      topKeywords: 10
    });
  });
  
  describe('constructor', () => {
    it('should create components with defaults', () => {
      expect(service.keywordExtractor).toBeInstanceOf(KeywordExtractor);
      expect(service.categoryClassifier).toBeInstanceOf(CategoryClassifier);
      expect(service.entityRecognizer).toBeInstanceOf(EntityRecognizer);
    });
    
    it('should accept custom topKeywords', () => {
      const customService = new TaggingService({ topKeywords: 5 });
      expect(customService.topKeywords).toBe(5);
    });
    
    it('should accept injected components', () => {
      const extractor = new KeywordExtractor({ topN: 5 });
      const classifier = new CategoryClassifier();
      const recognizer = new EntityRecognizer();
      
      const svc = new TaggingService({
        keywordExtractor: extractor,
        categoryClassifier: classifier,
        entityRecognizer: recognizer
      });
      
      expect(svc.keywordExtractor).toBe(extractor);
      expect(svc.categoryClassifier).toBe(classifier);
      expect(svc.entityRecognizer).toBe(recognizer);
    });
  });
  
  describe('tagArticle()', () => {
    const sampleArticle = {
      contentId: 1,
      title: 'Apple Inc. Reports Record Quarterly Earnings',
      bodyText: `
        Apple Inc. announced record-breaking quarterly earnings today.
        CEO Tim Cook praised the company's innovation in artificial intelligence.
        The technology giant reported strong iPhone sales in China.
        Dr. Lisa Su from AMD commented on the competitive landscape.
        Investors in New York responded positively to the news.
      `
    };
    
    it('should extract keywords from article', async () => {
      const result = await service.tagArticle(sampleArticle, { persist: false });
      
      expect(result.keywords).toBeDefined();
      expect(result.keywords.length).toBeGreaterThan(0);
      expect(result.keywords.length).toBeLessThanOrEqual(10);
      
      // Should have score and keyword
      result.keywords.forEach(kw => {
        expect(kw.keyword).toBeDefined();
        expect(kw.score).toBeGreaterThan(0);
      });
    });
    
    it('should classify article category', async () => {
      const result = await service.tagArticle(sampleArticle, { persist: false });
      
      expect(result.category).toBeDefined();
      expect(result.category.category).toBeDefined();
      expect(result.category.confidence).toBeDefined();
      
      // This article is about technology/business
      expect(['Technology', 'Business']).toContain(result.category.category);
    });
    
    it('should extract named entities', async () => {
      const result = await service.tagArticle(sampleArticle, { persist: false });
      
      expect(result.entities).toBeDefined();
      expect(result.entities.length).toBeGreaterThan(0);
      
      // Should find Apple Inc. as ORG
      const orgs = result.entities.filter(e => e.type === 'ORG');
      expect(orgs.some(o => o.text.includes('Apple'))).toBe(true);
      
      // Should find PERSON entities
      const persons = result.entities.filter(e => e.type === 'PERSON');
      expect(persons.length).toBeGreaterThan(0);
    });
    
    it('should skip short text', async () => {
      const shortArticle = {
        contentId: 99,
        bodyText: 'Too short.'
      };
      
      const result = await service.tagArticle(shortArticle, { persist: false });
      
      expect(result.skipped).toBe(true);
      expect(result.reason).toBeDefined();
    });
    
    it('should include contentId in result', async () => {
      const result = await service.tagArticle(sampleArticle, { persist: false });
      
      expect(result.contentId).toBe(sampleArticle.contentId);
    });
  });
  
  describe('classify different topics', () => {
    it('should classify Technology articles', async () => {
      const article = {
        contentId: 1,
        bodyText: 'Apple announced new software updates for iPhone. The technology includes machine learning algorithms.'
      };
      
      const result = await service.tagArticle(article, { persist: false });
      expect(result.category.category).toBe('Technology');
    });
    
    it('should classify Sports articles', async () => {
      const article = {
        contentId: 2,
        bodyText: 'The Lakers won the championship game. The coach praised the team performance in the NBA finals.'
      };
      
      const result = await service.tagArticle(article, { persist: false });
      expect(result.category.category).toBe('Sports');
    });
    
    it('should classify Health articles', async () => {
      const article = {
        contentId: 3,
        bodyText: 'The FDA approved a new vaccine for the coronavirus. Doctors recommend vaccination for patient health.'
      };
      
      const result = await service.tagArticle(article, { persist: false });
      expect(result.category.category).toBe('Health');
    });
    
    it('should classify Politics articles', async () => {
      const article = {
        contentId: 4,
        bodyText: 'Congress passed new legislation on immigration. The senator announced support for the bipartisan bill.'
      };
      
      const result = await service.tagArticle(article, { persist: false });
      expect(result.category.category).toBe('Politics');
    });
    
    it('should classify Business articles', async () => {
      const article = {
        contentId: 5,
        bodyText: 'The stock market reached new highs. The CEO announced quarterly revenue exceeded investor expectations.'
      };
      
      const result = await service.tagArticle(article, { persist: false });
      expect(result.category.category).toBe('Business');
    });
  });
  
  describe('entity recognition in service', () => {
    it('should recognize PERSON entities', async () => {
      const article = {
        contentId: 10,
        bodyText: 'President Biden met with Dr. Smith and Sen. Warren at the White House conference.'
      };
      
      const result = await service.tagArticle(article, { persist: false });
      const persons = result.entities.filter(e => e.type === 'PERSON');
      
      expect(persons.length).toBeGreaterThanOrEqual(1);
    });
    
    it('should recognize ORG entities', async () => {
      const article = {
        contentId: 11,
        bodyText: 'Microsoft Corp. and Amazon Inc. announced a partnership with Harvard University.'
      };
      
      const result = await service.tagArticle(article, { persist: false });
      const orgs = result.entities.filter(e => e.type === 'ORG');
      
      expect(orgs.length).toBeGreaterThanOrEqual(2);
    });
    
    it('should recognize GPE entities when added', () => {
      service.addKnownLocations(['Washington', 'New York', 'London']);
      
      const article = {
        contentId: 12,
        bodyText: 'The summit was held in Washington. Delegates from New York and London attended.'
      };
      
      // Use synchronous approach for this test
      const entities = service.entityRecognizer.recognize(article.bodyText);
      const gpes = entities.filter(e => e.type === 'GPE');
      
      expect(gpes.length).toBeGreaterThanOrEqual(1);
    });
  });
  
  describe('getStats()', () => {
    it('should return service statistics', () => {
      const stats = service.getStats();
      
      expect(stats.initialized).toBeDefined();
      expect(stats.topKeywords).toBe(10);
      expect(stats.keywordExtractor).toBeDefined();
      expect(stats.categoryClassifier).toBeDefined();
      expect(stats.entityRecognizer).toBeDefined();
    });
  });
  
  describe('addKnownLocations()', () => {
    it('should delegate to entity recognizer', () => {
      service.addKnownLocations(['TestCity', 'TestTown']);
      
      const stats = service.entityRecognizer.getStats();
      expect(stats.knownLocations).toBe(2);
    });
  });
  
  describe('addKnownOrganizations()', () => {
    it('should delegate to entity recognizer', () => {
      service.addKnownOrganizations(['Acme Corp', 'Test Inc']);
      
      const stats = service.entityRecognizer.getStats();
      expect(stats.knownOrgs).toBe(2);
    });
  });
});
