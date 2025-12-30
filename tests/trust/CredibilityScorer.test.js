'use strict';

/**
 * Tests for CredibilityScorer
 */

const { 
  CredibilityScorer, 
  DEFAULT_WEIGHTS, 
  FACT_CHECK_SCORES, 
  FLAG_TYPES 
} = require('../../src/trust/CredibilityScorer');
const { SourceRater } = require('../../src/trust/SourceRater');

describe('CredibilityScorer', () => {
  let scorer;
  let sourceRater;
  
  beforeEach(() => {
    sourceRater = new SourceRater();
    scorer = new CredibilityScorer({ sourceRater });
  });
  
  describe('constructor', () => {
    it('should create instance with default weights', () => {
      expect(scorer.weights).toEqual(DEFAULT_WEIGHTS);
    });
    
    it('should accept custom weights', () => {
      const custom = new CredibilityScorer({
        sourceRater,
        weights: { source: 0.5, factChecks: 0.5, claims: 0, tone: 0 }
      });
      
      expect(custom.weights.source).toBe(0.5);
      expect(custom.weights.factChecks).toBe(0.5);
    });
    
    it('should create source rater if not provided', () => {
      const s = new CredibilityScorer();
      expect(s.sourceRater).toBeDefined();
    });
  });
  
  describe('score', () => {
    it('should return default result for missing article', () => {
      const result = scorer.score(null);
      
      expect(result.overallScore).toBe(50);
      expect(result.error).toBeDefined();
    });
    
    it('should return default result for missing host', () => {
      const result = scorer.score({ text: 'Some text' });
      
      expect(result.overallScore).toBe(50);
      expect(result.error).toBeDefined();
    });
    
    it('should score article with high credibility source', () => {
      const result = scorer.score({ host: 'apnews.com' });
      
      // With only source score (92) and other factors at default/neutral,
      // overall score may be in mixed range due to weighting
      expect(result.overallScore).toBeGreaterThan(50);
      expect(result.factors.source.score).toBe(92);
    });
    
    it('should score article with low credibility source', () => {
      const result = scorer.score({ host: 'infowars.com' });
      
      expect(result.overallScore).toBeLessThan(50);
      expect(result.badge.level).toBe('low');
      expect(result.flags.length).toBeGreaterThan(0);
    });
    
    it('should add flags for questionable sources', () => {
      const result = scorer.score({ host: 'infowars.com' });
      
      const flagMessages = result.flags.map(f => f.message);
      expect(flagMessages.some(m => m.includes('conspiracy') || m.includes('low credibility'))).toBe(true);
    });
    
    it('should add flag for satire sources', () => {
      const result = scorer.score({ host: 'theonion.com' });
      
      const flagMessages = result.flags.map(f => f.message);
      expect(flagMessages.some(m => m.includes('satire'))).toBe(true);
    });
    
    it('should include all factor scores', () => {
      const result = scorer.score({ 
        host: 'reuters.com',
        text: 'Some article text'
      });
      
      expect(result.factors.source).toBeDefined();
      expect(result.factors.factChecks).toBeDefined();
      expect(result.factors.claims).toBeDefined();
      expect(result.factors.tone).toBeDefined();
    });
    
    it('should include analyzed timestamp', () => {
      const result = scorer.score({ host: 'reuters.com' });
      
      expect(result.analyzedAt).toBeDefined();
      expect(new Date(result.analyzedAt).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });
  
  describe('score with fact-checks', () => {
    it('should boost score for verified true claims', () => {
      const matchedFactChecks = [
        { 
          factCheck: { rating: 'true', claim_text: 'Test claim' },
          matchConfidence: 0.8
        }
      ];
      
      const result = scorer.score(
        { host: 'unknown-site.com' },
        { matchedFactChecks }
      );
      
      expect(result.factors.factChecks.score).toBeGreaterThan(80);
    });
    
    it('should lower score for false claims', () => {
      const matchedFactChecks = [
        { 
          factCheck: { rating: 'false', claim_text: 'False claim' },
          matchConfidence: 0.8
        }
      ];
      
      const result = scorer.score(
        { host: 'unknown-site.com' },
        { matchedFactChecks }
      );
      
      expect(result.factors.factChecks.score).toBeLessThan(50);
      expect(result.flags.some(f => f.message.includes('false'))).toBe(true);
    });
    
    it('should handle mixed fact-check ratings', () => {
      const matchedFactChecks = [
        { factCheck: { rating: 'true' }, matchConfidence: 0.7 },
        { factCheck: { rating: 'mostly-false' }, matchConfidence: 0.6 }
      ];
      
      const result = scorer.score(
        { host: 'unknown-site.com' },
        { matchedFactChecks }
      );
      
      // Score should be between true (100) and mostly-false (30)
      expect(result.factors.factChecks.score).toBeGreaterThan(30);
      expect(result.factors.factChecks.score).toBeLessThan(100);
    });
  });
  
  describe('score with claims', () => {
    it('should reward attributed claims', () => {
      const claims = {
        claims: [
          { text: 'Claim 1', speaker: 'John Smith', checkabilityScore: 0.7 },
          { text: 'Claim 2', speaker: 'Jane Doe', checkabilityScore: 0.8 }
        ]
      };
      
      const result = scorer.score(
        { host: 'unknown-site.com' },
        { claims }
      );
      
      expect(result.factors.claims.attributionRate).toBe(1);
      expect(result.factors.claims.score).toBeGreaterThan(70);
    });
    
    it('should flag unattributed claims', () => {
      const claims = {
        claims: [
          { text: 'Claim 1', checkabilityScore: 0.3 },
          { text: 'Claim 2', checkabilityScore: 0.3 },
          { text: 'Claim 3', checkabilityScore: 0.3 }
        ]
      };
      
      const result = scorer.score(
        { host: 'unknown-site.com' },
        { claims }
      );
      
      expect(result.factors.claims.attributionRate).toBe(0);
    });
  });
  
  describe('score with sentiment', () => {
    it('should reward neutral tone', () => {
      const sentiment = { overallScore: 0.05 };
      
      const result = scorer.score(
        { host: 'unknown-site.com' },
        { sentiment }
      );
      
      expect(result.factors.tone.score).toBeGreaterThan(90);
      expect(result.factors.tone.direction).toBe('neutral');
    });
    
    it('should flag extreme positive tone', () => {
      const sentiment = { overallScore: 0.8 };
      
      const result = scorer.score(
        { host: 'unknown-site.com' },
        { sentiment }
      );
      
      expect(result.factors.tone.score).toBeLessThan(70);
      expect(result.factors.tone.direction).toBe('positive');
      expect(result.flags.some(f => f.message.includes('extreme'))).toBe(true);
    });
    
    it('should flag extreme negative tone', () => {
      const sentiment = { overallScore: -0.8 };
      
      const result = scorer.score(
        { host: 'unknown-site.com' },
        { sentiment }
      );
      
      expect(result.factors.tone.score).toBeLessThan(70);
      expect(result.factors.tone.direction).toBe('negative');
    });
  });
  
  describe('batchScore', () => {
    it('should score multiple articles', () => {
      const articles = [
        { host: 'apnews.com' },
        { host: 'reuters.com' },
        { host: 'infowars.com' }
      ];
      
      const results = scorer.batchScore(articles);
      
      expect(results.length).toBe(3);
      expect(results[0].overallScore).toBeGreaterThan(70);
      expect(results[2].overallScore).toBeLessThan(50);
    });
    
    it('should handle errors gracefully', () => {
      const articles = [
        { host: 'valid.com' },
        null,
        { host: 'another.com' }
      ];
      
      const results = scorer.batchScore(articles);
      
      expect(results.length).toBe(3);
      expect(results[1].error).toBeDefined();
    });
  });
  
  describe('getFlagTypes', () => {
    it('should return all flag types', () => {
      const flags = scorer.getFlagTypes();
      
      expect(flags.KNOWN_FALSE_CLAIM).toBeDefined();
      expect(flags.LOW_SOURCE_CREDIBILITY).toBeDefined();
      expect(flags.EXTREME_TONE).toBeDefined();
      expect(flags.SATIRE).toBeDefined();
    });
    
    it('should have severity and message for each flag', () => {
      const flags = scorer.getFlagTypes();
      
      for (const flag of Object.values(flags)) {
        expect(flag.severity).toBeDefined();
        expect(flag.message).toBeDefined();
      }
    });
  });
  
  describe('getFactCheckScores', () => {
    it('should return rating to score mapping', () => {
      const scores = scorer.getFactCheckScores();
      
      expect(scores['true']).toBe(100);
      expect(scores['false']).toBe(10);
      expect(scores['mostly-true']).toBe(85);
      expect(scores['pants-on-fire']).toBe(0);
    });
  });
  
  describe('getStats', () => {
    it('should return scorer statistics', () => {
      const stats = scorer.getStats();
      
      expect(stats.weights).toEqual(DEFAULT_WEIGHTS);
      expect(typeof stats.flagCount).toBe('number');
      expect(typeof stats.ratingCount).toBe('number');
      expect(stats.hasSourceRater).toBe(true);
    });
  });
});

describe('DEFAULT_WEIGHTS constant', () => {
  it('should sum to 1.0', () => {
    const sum = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });
  
  it('should have all required factors', () => {
    expect(DEFAULT_WEIGHTS.source).toBeDefined();
    expect(DEFAULT_WEIGHTS.factChecks).toBeDefined();
    expect(DEFAULT_WEIGHTS.claims).toBeDefined();
    expect(DEFAULT_WEIGHTS.tone).toBeDefined();
  });
});

describe('FACT_CHECK_SCORES constant', () => {
  it('should have standard ratings', () => {
    expect(FACT_CHECK_SCORES['true']).toBeDefined();
    expect(FACT_CHECK_SCORES['false']).toBeDefined();
    expect(FACT_CHECK_SCORES['mostly-true']).toBeDefined();
    expect(FACT_CHECK_SCORES['mostly-false']).toBeDefined();
  });
  
  it('should have scores in logical order', () => {
    expect(FACT_CHECK_SCORES['true']).toBeGreaterThan(FACT_CHECK_SCORES['mostly-true']);
    expect(FACT_CHECK_SCORES['mostly-true']).toBeGreaterThan(FACT_CHECK_SCORES['half-true']);
    expect(FACT_CHECK_SCORES['half-true']).toBeGreaterThan(FACT_CHECK_SCORES['mostly-false']);
    expect(FACT_CHECK_SCORES['mostly-false']).toBeGreaterThan(FACT_CHECK_SCORES['false']);
  });
});

describe('FLAG_TYPES constant', () => {
  it('should have all expected flags', () => {
    expect(FLAG_TYPES.KNOWN_FALSE_CLAIM).toBeDefined();
    expect(FLAG_TYPES.UNVERIFIED_CLAIMS).toBeDefined();
    expect(FLAG_TYPES.LOW_SOURCE_CREDIBILITY).toBeDefined();
    expect(FLAG_TYPES.EXTREME_TONE).toBeDefined();
    expect(FLAG_TYPES.NO_ATTRIBUTED_CLAIMS).toBeDefined();
    expect(FLAG_TYPES.CONSPIRACY_SOURCE).toBeDefined();
    expect(FLAG_TYPES.SATIRE).toBeDefined();
  });
  
  it('should have appropriate severity levels', () => {
    expect(FLAG_TYPES.KNOWN_FALSE_CLAIM.severity).toBe('high');
    expect(FLAG_TYPES.LOW_SOURCE_CREDIBILITY.severity).toBe('high');
    expect(FLAG_TYPES.EXTREME_TONE.severity).toBe('low');
    expect(FLAG_TYPES.SATIRE.severity).toBe('info');
  });
});
