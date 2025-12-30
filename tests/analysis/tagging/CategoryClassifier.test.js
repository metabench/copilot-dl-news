'use strict';

/**
 * CategoryClassifier Tests
 * 
 * Tests for rule-based topic classification.
 */

const { CategoryClassifier, UNCATEGORIZED, getDefaultConfig } = require('../../../src/analysis/tagging/CategoryClassifier');

describe('CategoryClassifier', () => {
  let classifier;
  
  beforeEach(() => {
    classifier = new CategoryClassifier();
  });
  
  describe('constructor', () => {
    it('should load categories from config', () => {
      const categories = classifier.getCategories();
      
      expect(categories).toContain('Politics');
      expect(categories).toContain('Technology');
      expect(categories).toContain('Sports');
      expect(categories).toContain('Business');
      expect(categories).toContain('Entertainment');
      expect(categories).toContain('Science');
      expect(categories).toContain('Health');
    });
    
    it('should accept custom config', () => {
      const customClassifier = new CategoryClassifier({
        config: {
          categories: {
            Custom: { primary: ['custom', 'special'], secondary: [] }
          },
          weights: { primary: 2.0, secondary: 1.0, titleMultiplier: 3.0 },
          thresholds: { minConfidence: 0.1, secondaryCategoryGap: 0.5 }
        }
      });
      
      const categories = customClassifier.getCategories();
      expect(categories).toEqual(['Custom']);
    });
  });
  
  describe('classify()', () => {
    it('should classify Politics articles correctly', () => {
      const text = `
        The presidential election is heating up as candidates prepare for debates.
        Congress passed new legislation on immigration policy yesterday.
        The senator announced support for the bipartisan bill.
      `;
      
      const result = classifier.classify(text);
      
      expect(result.category).toBe('Politics');
      expect(result.confidence).toBeGreaterThan(0);
    });
    
    it('should classify Technology articles correctly', () => {
      const text = `
        Apple announced its new iPhone with advanced artificial intelligence features.
        The software update includes machine learning algorithms for better performance.
        Silicon Valley startups are investing heavily in blockchain technology.
      `;
      
      const result = classifier.classify(text);
      
      expect(result.category).toBe('Technology');
      expect(result.confidence).toBeGreaterThan(0);
    });
    
    it('should classify Sports articles correctly', () => {
      const text = `
        The Lakers won the championship game last night in overtime.
        The quarterback threw three touchdowns in the NFL playoff match.
        The team's coach praised the players' performance this season.
      `;
      
      const result = classifier.classify(text);
      
      expect(result.category).toBe('Sports');
      expect(result.confidence).toBeGreaterThan(0);
    });
    
    it('should classify Business articles correctly', () => {
      const text = `
        The stock market reached record highs as investors reacted to earnings reports.
        The merger between the two corporations was approved by shareholders.
        The CEO announced quarterly revenue exceeded expectations.
      `;
      
      const result = classifier.classify(text);
      
      expect(result.category).toBe('Business');
      expect(result.confidence).toBeGreaterThan(0);
    });
    
    it('should classify Entertainment articles correctly', () => {
      const text = `
        The new Marvel movie broke box office records this weekend.
        The celebrity attended the Oscar awards ceremony in a stunning dress.
        Netflix announced a new series starring the famous actor.
      `;
      
      const result = classifier.classify(text);
      
      expect(result.category).toBe('Entertainment');
      expect(result.confidence).toBeGreaterThan(0);
    });
    
    it('should classify Science articles correctly', () => {
      const text = `
        Scientists at NASA discovered a new planet in a distant galaxy.
        The research study published in Nature reveals breakthrough findings.
        Climate change researchers warn about rising global temperatures.
      `;
      
      const result = classifier.classify(text);
      
      expect(result.category).toBe('Science');
      expect(result.confidence).toBeGreaterThan(0);
    });
    
    it('should classify Health articles correctly', () => {
      const text = `
        The FDA approved a new vaccine for the coronavirus variant.
        Doctors recommend regular exercise for cardiovascular health.
        The hospital reported successful treatment outcomes for cancer patients.
      `;
      
      const result = classifier.classify(text);
      
      expect(result.category).toBe('Health');
      expect(result.confidence).toBeGreaterThan(0);
    });
    
    it('should return Uncategorized for ambiguous text', () => {
      const text = 'Hello world, this is a generic sentence with no specific topic.';
      
      const result = classifier.classify(text);
      
      expect(result.category).toBe(UNCATEGORIZED);
      expect(result.confidence).toBe(0);
    });
    
    it('should boost title keywords', () => {
      // Body text is about business, title is about sports
      const text = 'The company reported quarterly earnings.';
      
      const resultWithTitle = classifier.classify(text, { 
        title: 'Lakers Win Championship Game in NBA Finals' 
      });
      
      const resultWithoutTitle = classifier.classify(text);
      
      // With sports-heavy title, should lean towards Sports
      expect(resultWithTitle.category).toBe('Sports');
    });
    
    it('should include scores for all categories', () => {
      const text = 'The technology company stock rose after the election results.';
      
      const result = classifier.classify(text);
      
      expect(result.scores).toBeDefined();
      expect(result.scores.Technology).toBeGreaterThan(0);
      expect(result.scores.Politics).toBeGreaterThan(0);
      expect(result.scores.Business).toBeGreaterThan(0);
    });
    
    it('should identify secondary category when close', () => {
      const text = `
        The tech company's stock surged after announcing new AI features.
        Investors are excited about the technology investment opportunity.
        The business market responded positively to the software release.
      `;
      
      const result = classifier.classify(text);
      
      // Both Technology and Business should be relevant
      if (result.secondaryCategory) {
        expect(['Technology', 'Business']).toContain(result.secondaryCategory);
      }
    });
    
    it('should handle empty text', () => {
      const result = classifier.classify('');
      
      expect(result.category).toBe(UNCATEGORIZED);
      expect(result.confidence).toBe(0);
    });
    
    it('should handle multi-word phrases', () => {
      const text = `
        The United Nations held a climate change summit.
        World leaders discussed artificial intelligence regulations.
        The social media platform announced new privacy features.
      `;
      
      const result = classifier.classify(text);
      
      // Should recognize multi-word phrases
      expect(['Technology', 'Science', 'Politics']).toContain(result.category);
    });
  });
  
  describe('getCategoryKeywords()', () => {
    it('should return keywords for valid category', () => {
      const keywords = classifier.getCategoryKeywords('Technology');
      
      expect(keywords).toBeDefined();
      expect(keywords.primary).toBeInstanceOf(Array);
      expect(keywords.secondary).toBeInstanceOf(Array);
      expect(keywords.primary.length).toBeGreaterThan(0);
    });
    
    it('should return null for invalid category', () => {
      const keywords = classifier.getCategoryKeywords('NotACategory');
      
      expect(keywords).toBeNull();
    });
  });
  
  describe('getStats()', () => {
    it('should return classifier statistics', () => {
      const stats = classifier.getStats();
      
      expect(stats.categories).toBe(7);
      expect(stats.singleKeywords).toBeGreaterThan(0);
      expect(stats.phrases).toBeGreaterThan(0);
      expect(stats.weights).toBeDefined();
      expect(stats.thresholds).toBeDefined();
    });
  });
  
  describe('getDefaultConfig()', () => {
    it('should return a valid default config', () => {
      const config = getDefaultConfig();
      
      expect(config.categories).toBeDefined();
      expect(config.weights).toBeDefined();
      expect(config.thresholds).toBeDefined();
      expect(Object.keys(config.categories)).toHaveLength(7);
    });
  });
});
