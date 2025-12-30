'use strict';

/**
 * Tests for SourceRater
 */

const { 
  SourceRater, 
  MBFC_SCORES, 
  KNOWN_SOURCES, 
  DEFAULT_CREDIBILITY 
} = require('../../src/trust/SourceRater');

describe('SourceRater', () => {
  let rater;
  
  beforeEach(() => {
    rater = new SourceRater();
  });
  
  describe('constructor', () => {
    it('should create instance with default weights', () => {
      expect(rater.weights.mbfc).toBe(0.4);
      expect(rater.weights.corrections).toBe(0.2);
      expect(rater.weights.age).toBe(0.2);
      expect(rater.weights.baseline).toBe(0.2);
    });
    
    it('should accept custom weights', () => {
      const custom = new SourceRater({
        weights: { mbfc: 0.5, corrections: 0.3 }
      });
      
      expect(custom.weights.mbfc).toBe(0.5);
      expect(custom.weights.corrections).toBe(0.3);
    });
    
    it('should pre-load known sources into cache', () => {
      expect(rater.cache.size).toBeGreaterThan(0);
      expect(rater.cache.has('apnews.com')).toBe(true);
      expect(rater.cache.has('reuters.com')).toBe(true);
    });
  });
  
  describe('getSourceCredibility', () => {
    it('should return known source data', () => {
      const result = rater.getSourceCredibility('apnews.com');
      
      expect(result.credibilityScore).toBe(92);
      expect(result.mbfcRating).toBe('high');
      expect(result.biasLabel).toBe('center');
    });
    
    it('should normalize hostnames', () => {
      // Remove www prefix
      const result1 = rater.getSourceCredibility('www.nytimes.com');
      expect(result1.credibilityScore).toBe(85);
      
      // Handle uppercase
      const result2 = rater.getSourceCredibility('REUTERS.COM');
      expect(result2.credibilityScore).toBe(92);
    });
    
    it('should return default for unknown sources', () => {
      const result = rater.getSourceCredibility('unknown-site.example');
      
      expect(result.credibilityScore).toBe(DEFAULT_CREDIBILITY);
      expect(result.mbfcRating).toBeNull();
      expect(result.source).toBe('unknown');
    });
    
    it('should identify questionable sources', () => {
      const result = rater.getSourceCredibility('infowars.com');
      
      expect(result.credibilityScore).toBe(10);
      expect(result.mbfcRating).toBe('very-low');
      expect(result.biasLabel).toBe('conspiracy-pseudoscience');
    });
    
    it('should identify satire sources', () => {
      const result = rater.getSourceCredibility('theonion.com');
      
      expect(result.credibilityScore).toBe(90);
      expect(result.biasLabel).toBe('satire');
    });
  });
  
  describe('calculateScore', () => {
    it('should calculate from MBFC rating', () => {
      const score = rater.calculateScore({ mbfcRating: 'high' });
      
      expect(score).toBeGreaterThan(70);
      expect(score).toBeLessThanOrEqual(100);
    });
    
    it('should penalize high correction rates', () => {
      const lowCorrections = rater.calculateScore({
        mbfcRating: 'high',
        correctionCount: 1,
        articleCount: 1000
      });
      
      const highCorrections = rater.calculateScore({
        mbfcRating: 'high',
        correctionCount: 50,
        articleCount: 1000
      });
      
      expect(lowCorrections).toBeGreaterThan(highCorrections);
    });
    
    it('should reward older domains', () => {
      const newDomain = rater.calculateScore({
        mbfcRating: 'high',
        domainAgeYears: 1
      });
      
      const oldDomain = rater.calculateScore({
        mbfcRating: 'high',
        domainAgeYears: 20
      });
      
      expect(oldDomain).toBeGreaterThan(newDomain);
    });
    
    it('should return default for no factors', () => {
      const score = rater.calculateScore({});
      
      expect(score).toBe(DEFAULT_CREDIBILITY);
    });
    
    it('should clamp scores to 0-100', () => {
      const score = rater.calculateScore({ mbfcRating: 'very-high' });
      
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });
  
  describe('updateSource', () => {
    it('should add source to cache', () => {
      rater.updateSource('newsite.com', {
        credibilityScore: 75,
        mbfcRating: 'mostly-factual',
        biasLabel: 'center'
      });
      
      const result = rater.getSourceCredibility('newsite.com');
      expect(result.credibilityScore).toBe(75);
      expect(result.mbfcRating).toBe('mostly-factual');
    });
    
    it('should return updated data with timestamp', () => {
      const result = rater.updateSource('test.com', {
        credibilityScore: 60
      });
      
      expect(result.host).toBe('test.com');
      expect(result.credibilityScore).toBe(60);
      expect(result.updatedAt).toBeDefined();
    });
  });
  
  describe('batchUpdateFromMBFC', () => {
    it('should update multiple sources', () => {
      const mbfcData = [
        { host: 'source1.com', rating: 'high', bias: 'center' },
        { host: 'source2.com', rating: 'mixed', bias: 'left' }
      ];
      
      const result = rater.batchUpdateFromMBFC(mbfcData);
      
      expect(result.updated).toBe(2);
      expect(result.skipped).toBe(0);
      
      expect(rater.getSourceCredibility('source1.com').credibilityScore).toBe(85);
      expect(rater.getSourceCredibility('source2.com').credibilityScore).toBe(50);
    });
    
    it('should skip invalid entries', () => {
      const mbfcData = [
        { host: 'valid.com', rating: 'high' },
        { rating: 'high' }, // Missing host
        { host: 'missing-rating.com' } // Missing rating
      ];
      
      const result = rater.batchUpdateFromMBFC(mbfcData);
      
      expect(result.updated).toBe(1);
      expect(result.skipped).toBe(2);
    });
  });
  
  describe('getBadge', () => {
    it('should return high badge for scores >= 80', () => {
      const badge = rater.getBadge(85);
      
      expect(badge.emoji).toBe('✅');
      expect(badge.label).toBe('High');
      expect(badge.level).toBe('high');
      expect(badge.color).toBe('green');
    });
    
    it('should return mixed badge for scores 50-79', () => {
      const badge = rater.getBadge(65);
      
      expect(badge.emoji).toBe('⚠️');
      expect(badge.label).toBe('Mixed');
      expect(badge.level).toBe('mixed');
      expect(badge.color).toBe('yellow');
    });
    
    it('should return low badge for scores < 50', () => {
      const badge = rater.getBadge(30);
      
      expect(badge.emoji).toBe('❌');
      expect(badge.label).toBe('Low');
      expect(badge.level).toBe('low');
      expect(badge.color).toBe('red');
    });
    
    it('should handle boundary values', () => {
      expect(rater.getBadge(80).level).toBe('high');
      expect(rater.getBadge(79).level).toBe('mixed');
      expect(rater.getBadge(50).level).toBe('mixed');
      expect(rater.getBadge(49).level).toBe('low');
    });
  });
  
  describe('getAllSources', () => {
    it('should return all cached sources', () => {
      const sources = rater.getAllSources();
      
      expect(sources.length).toBeGreaterThan(0);
      expect(sources[0].host).toBeDefined();
      expect(sources[0].credibilityScore).toBeDefined();
    });
    
    it('should filter by minimum score', () => {
      const sources = rater.getAllSources({ minScore: 80 });
      
      for (const src of sources) {
        expect(src.credibilityScore).toBeGreaterThanOrEqual(80);
      }
    });
    
    it('should sort by score descending', () => {
      const sources = rater.getAllSources();
      
      for (let i = 1; i < sources.length; i++) {
        expect(sources[i - 1].credibilityScore).toBeGreaterThanOrEqual(
          sources[i].credibilityScore
        );
      }
    });
  });
  
  describe('getMBFCScores', () => {
    it('should return MBFC score mapping', () => {
      const scores = rater.getMBFCScores();
      
      expect(scores['very-high']).toBe(95);
      expect(scores['high']).toBe(85);
      expect(scores['mixed']).toBe(50);
      expect(scores['very-low']).toBe(10);
    });
  });
  
  describe('getStats', () => {
    it('should return rater statistics', () => {
      const stats = rater.getStats();
      
      expect(stats.cachedSources).toBeGreaterThan(0);
      expect(stats.knownSources).toBeGreaterThan(0);
      expect(typeof stats.highCredibility).toBe('number');
      expect(typeof stats.mixedCredibility).toBe('number');
      expect(typeof stats.lowCredibility).toBe('number');
    });
  });
});

describe('MBFC_SCORES constant', () => {
  it('should have all rating levels', () => {
    expect(MBFC_SCORES['very-high']).toBeDefined();
    expect(MBFC_SCORES['high']).toBeDefined();
    expect(MBFC_SCORES['mostly-factual']).toBeDefined();
    expect(MBFC_SCORES['mixed']).toBeDefined();
    expect(MBFC_SCORES['low']).toBeDefined();
    expect(MBFC_SCORES['very-low']).toBeDefined();
  });
  
  it('should have scores in descending order', () => {
    expect(MBFC_SCORES['very-high']).toBeGreaterThan(MBFC_SCORES['high']);
    expect(MBFC_SCORES['high']).toBeGreaterThan(MBFC_SCORES['mostly-factual']);
    expect(MBFC_SCORES['mostly-factual']).toBeGreaterThan(MBFC_SCORES['mixed']);
    expect(MBFC_SCORES['mixed']).toBeGreaterThan(MBFC_SCORES['low']);
    expect(MBFC_SCORES['low']).toBeGreaterThan(MBFC_SCORES['very-low']);
  });
});

describe('KNOWN_SOURCES constant', () => {
  it('should include major wire services', () => {
    expect(KNOWN_SOURCES['apnews.com']).toBeDefined();
    expect(KNOWN_SOURCES['reuters.com']).toBeDefined();
  });
  
  it('should include major newspapers', () => {
    expect(KNOWN_SOURCES['nytimes.com']).toBeDefined();
    expect(KNOWN_SOURCES['wsj.com']).toBeDefined();
    expect(KNOWN_SOURCES['washingtonpost.com']).toBeDefined();
  });
  
  it('should include questionable sources', () => {
    expect(KNOWN_SOURCES['infowars.com']).toBeDefined();
    expect(KNOWN_SOURCES['infowars.com'].score).toBeLessThan(20);
  });
  
  it('should have complete data for each source', () => {
    for (const [host, data] of Object.entries(KNOWN_SOURCES)) {
      expect(data.score).toBeDefined();
      expect(data.mbfc).toBeDefined();
      expect(data.bias).toBeDefined();
    }
  });
});
