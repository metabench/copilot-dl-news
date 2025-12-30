'use strict';

/**
 * EntitySentiment Tests
 * 
 * Tests for entity-level sentiment analysis.
 */

const { EntitySentiment, Lexicon } = require('../../../src/analysis/sentiment');

describe('EntitySentiment', () => {
  let entitySentiment;
  
  beforeEach(() => {
    entitySentiment = new EntitySentiment();
  });
  
  describe('constructor', () => {
    it('should initialize with default settings', () => {
      const es = new EntitySentiment();
      expect(es.lexicon).toBeInstanceOf(Lexicon);
      expect(es.config).toBeDefined();
    });
    
    it('should accept custom lexicon', () => {
      const customLexicon = new Lexicon({ customScores: { 'custom': 4 } });
      const es = new EntitySentiment({ lexicon: customLexicon });
      
      expect(es.lexicon.getScore('custom')).toBe(4);
    });
    
    it('should accept custom config', () => {
      const es = new EntitySentiment({ config: { contextWindowChars: 300 } });
      expect(es.config.contextWindowChars).toBe(300);
    });
  });
  
  describe('analyzeEntities()', () => {
    it('should analyze entities and calculate sentiment', () => {
      const text = 'John Smith did something wonderful today.';
      const entities = [{ text: 'John Smith', type: 'PERSON' }];
      
      const results = entitySentiment.analyzeEntities(text, entities);
      
      expect(results.length).toBe(1);
      expect(results[0].entity).toBe('John Smith');
      expect(results[0].type).toBe('PERSON');
      expect(results[0].score).toBeGreaterThan(0);
    });
    
    it('should handle negative sentiment toward entity', () => {
      const text = 'Apple released a terrible product that disappointed everyone.';
      const entities = [{ text: 'Apple', type: 'ORG' }];
      
      const results = entitySentiment.analyzeEntities(text, entities);
      
      expect(results.length).toBe(1);
      expect(results[0].score).toBeLessThan(0);
    });
    
    it('should return empty array for text with no entities', () => {
      const text = 'This is just some text with no named entities.';
      const entities = [];
      
      const results = entitySentiment.analyzeEntities(text, entities);
      
      expect(results).toEqual([]);
    });
    
    it('should return empty array for empty text', () => {
      const results = entitySentiment.analyzeEntities('', [{ text: 'Test', type: 'ENTITY' }]);
      expect(results).toEqual([]);
    });
    
    it('should handle multiple entities with different sentiments', () => {
      const text = 'Apple delivered excellent results. Microsoft faced terrible losses.';
      const entities = [
        { text: 'Apple', type: 'ORG' },
        { text: 'Microsoft', type: 'ORG' }
      ];
      
      const results = entitySentiment.analyzeEntities(text, entities);
      
      const apple = results.find(e => e.entity === 'Apple');
      const microsoft = results.find(e => e.entity === 'Microsoft');
      
      expect(apple.score).toBeGreaterThan(0);
      expect(microsoft.score).toBeLessThan(0);
    });
    
    it('should include context in results', () => {
      const text = 'The company grew. Apple is doing great. Sales increased.';
      const entities = [{ text: 'Apple', type: 'ORG' }];
      
      const results = entitySentiment.analyzeEntities(text, entities);
      
      expect(results[0].contexts).toBeDefined();
      expect(results[0].contexts.length).toBeGreaterThan(0);
    });
    
    it('should calculate confidence per entity', () => {
      const text = 'John Smith achieved something incredible and wonderful.';
      const entities = [{ text: 'John Smith', type: 'PERSON' }];
      
      const results = entitySentiment.analyzeEntities(text, entities);
      
      expect(results[0].confidence).toBeDefined();
      expect(results[0].confidence).toBeGreaterThanOrEqual(0);
      expect(results[0].confidence).toBeLessThanOrEqual(1);
    });
    
    it('should count multiple entity mentions', () => {
      const text = 'Apple is great. Later, Apple announced good news. Apple shares rose.';
      const entities = [{ text: 'Apple', type: 'ORG' }];
      
      const results = entitySentiment.analyzeEntities(text, entities);
      
      expect(results[0].mentions).toBe(3);
    });
    
    it('should deduplicate entities by text', () => {
      const text = 'Apple is great. Apple is wonderful.';
      const entities = [
        { text: 'Apple', type: 'ORG' },
        { text: 'Apple', type: 'COMPANY' }  // duplicate with different type
      ];
      
      const results = entitySentiment.analyzeEntities(text, entities);
      
      expect(results.length).toBe(1);
    });
  });
  
  describe('analyzeTextForEntities()', () => {
    it('should extract entities from text automatically', () => {
      const text = 'John Smith and Mary Jones work at Apple Inc.';
      
      const results = entitySentiment.analyzeTextForEntities(text);
      
      // Should find some capitalized entities
      expect(Array.isArray(results)).toBe(true);
    });
    
    it('should return empty array for empty text', () => {
      const results = entitySentiment.analyzeTextForEntities('');
      expect(results).toEqual([]);
    });
    
    it('should handle text with no clear entities', () => {
      const text = 'this is all lowercase with no entities';
      const results = entitySentiment.analyzeTextForEntities(text);
      expect(Array.isArray(results)).toBe(true);
    });
  });
  
  describe('edge cases', () => {
    it('should handle entity not found in text', () => {
      const text = 'Some text without the entity.';
      const entities = [{ text: 'NotPresent', type: 'PERSON' }];
      
      const results = entitySentiment.analyzeEntities(text, entities);
      
      expect(results.length).toBe(0);
    });
    
    it('should handle very long entity names', () => {
      const text = 'The Federal Reserve Bank of New York announced good rates.';
      const entities = [{ text: 'Federal Reserve Bank of New York', type: 'ORG' }];
      
      const results = entitySentiment.analyzeEntities(text, entities);
      
      expect(results.length).toBe(1);
      expect(results[0].score).toBeGreaterThan(0);
    });
    
    it('should handle null text gracefully', () => {
      const results = entitySentiment.analyzeEntities(null, [{ text: 'Test', type: 'ENTITY' }]);
      expect(results).toEqual([]);
    });
    
    it('should handle null entities gracefully', () => {
      const results = entitySentiment.analyzeEntities('Some text', null);
      expect(results).toEqual([]);
    });
    
    it('should normalize entity scores to -1 to 1 range', () => {
      const text = 'Apple achieved absolutely incredible amazing wonderful fantastic results!';
      const entities = [{ text: 'Apple', type: 'ORG' }];
      
      const results = entitySentiment.analyzeEntities(text, entities);
      
      expect(results[0].score).toBeGreaterThanOrEqual(-1);
      expect(results[0].score).toBeLessThanOrEqual(1);
    });
    
    it('should handle case-insensitive entity matching', () => {
      const text = 'APPLE is great. apple is wonderful.';
      const entities = [{ text: 'Apple', type: 'ORG' }];
      
      const results = entitySentiment.analyzeEntities(text, entities);
      
      expect(results[0].mentions).toBe(2);
    });
  });
});
