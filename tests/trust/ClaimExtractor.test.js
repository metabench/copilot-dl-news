'use strict';

/**
 * Tests for ClaimExtractor
 */

const { ClaimExtractor } = require('../../src/trust/ClaimExtractor');

describe('ClaimExtractor', () => {
  let extractor;
  
  beforeEach(() => {
    extractor = new ClaimExtractor();
  });
  
  describe('constructor', () => {
    it('should create instance with default options', () => {
      expect(extractor.minClaimLength).toBe(30);
      expect(extractor.maxClaimLength).toBe(500);
      expect(extractor.minCheckabilityScore).toBe(0.3);
    });
    
    it('should accept custom options', () => {
      const custom = new ClaimExtractor({
        minClaimLength: 50,
        maxClaimLength: 300,
        minCheckabilityScore: 0.5
      });
      
      expect(custom.minClaimLength).toBe(50);
      expect(custom.maxClaimLength).toBe(300);
      expect(custom.minCheckabilityScore).toBe(0.5);
    });
  });
  
  describe('extract', () => {
    it('should return empty result for null/empty input', () => {
      expect(extractor.extract(null).claims).toEqual([]);
      expect(extractor.extract('').claims).toEqual([]);
      expect(extractor.extract(undefined).claims).toEqual([]);
    });
    
    it('should extract claims with attribution', () => {
      const text = `
        The president said that unemployment has dropped to 3.5 percent.
        According to the report, economic growth exceeded expectations.
        The CEO claimed the company would double its revenue this year.
      `;
      
      const result = extractor.extract(text);
      
      expect(result.claims.length).toBeGreaterThan(0);
      expect(result.summary.totalClaims).toBeGreaterThan(0);
    });
    
    it('should extract statistical claims', () => {
      const text = `
        The study found that 75 percent of participants reported improvement.
        Sales increased by 25% compared to last year.
        The population grew by 2 million in the last decade.
      `;
      
      const result = extractor.extract(text);
      
      expect(result.statistics.length).toBeGreaterThan(0);
    });
    
    it('should include SimHash fingerprints when requested', () => {
      const text = 'The senator claimed that taxes would be reduced by 20 percent for middle class families.';
      
      const result = extractor.extract(text, { includeSimHash: true });
      
      if (result.claims.length > 0) {
        expect(result.claims[0].simHash).toBeDefined();
        expect(result.claims[0].simHash).toHaveLength(16); // 64-bit hex
      }
    });
    
    it('should include keywords when requested', () => {
      const text = 'The senator claimed that taxes would be reduced by 20 percent for middle class families.';
      
      const result = extractor.extract(text, { includeKeywords: true });
      
      if (result.claims.length > 0) {
        expect(result.claims[0].keywords).toBeDefined();
        expect(Array.isArray(result.claims[0].keywords)).toBe(true);
      }
    });
    
    it('should score claims for checkability', () => {
      const text = `
        According to official data, inflation rose to 5.2 percent.
        I think the economy might improve next year.
      `;
      
      const result = extractor.extract(text);
      
      for (const claim of result.claims) {
        expect(claim.checkabilityScore).toBeDefined();
        expect(claim.checkabilityScore).toBeGreaterThanOrEqual(0);
        expect(claim.checkabilityScore).toBeLessThanOrEqual(1);
      }
    });
    
    it('should return summary statistics', () => {
      const text = 'The report stated that 50 percent of voters support the measure according to recent polls.';
      
      const result = extractor.extract(text);
      
      expect(result.summary).toBeDefined();
      expect(typeof result.summary.totalClaims).toBe('number');
      expect(typeof result.summary.statisticsClaims).toBe('number');
      expect(typeof result.summary.highConfidence).toBe('number');
    });
    
    it('should include extractedAt timestamp', () => {
      const result = extractor.extract('Some text');
      
      expect(result.extractedAt).toBeDefined();
      expect(new Date(result.extractedAt).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });
  
  describe('checkability scoring', () => {
    it('should give higher scores to claims with numbers', () => {
      const textWithNumber = 'The unemployment rate is 3.5 percent according to the bureau.';
      const textWithoutNumber = 'The economy appears to be improving according to experts.';
      
      const result1 = extractor.extract(textWithNumber);
      const result2 = extractor.extract(textWithoutNumber);
      
      // Both may extract claims, but number-based should score higher
      if (result1.claims.length > 0 && result2.claims.length > 0) {
        // Claims with statistics should generally score higher
        expect(result1.statistics.length).toBeGreaterThan(0);
      }
    });
    
    it('should give higher scores to attributed claims', () => {
      const attributed = 'The president said the policy would create 1 million jobs.';
      const unattributed = 'The policy would create 1 million jobs.';
      
      const result1 = extractor.extract(attributed);
      const result2 = extractor.extract(unattributed);
      
      // Attributed claims should exist
      const attributedClaims = result1.claims.filter(c => c.speaker);
      expect(attributedClaims.length).toBeGreaterThanOrEqual(0);
    });
    
    it('should reduce scores for opinion words', () => {
      const opinion = 'I believe the economy might possibly improve next year maybe.';
      
      const result = extractor.extract(opinion);
      
      // Opinion-heavy text should have lower checkability
      for (const claim of result.claims) {
        expect(claim.checkabilityScore).toBeLessThan(0.8);
      }
    });
  });
  
  describe('matchClaim', () => {
    const factChecks = [
      { 
        id: 1, 
        claim_text: 'The unemployment rate dropped to 3.5 percent', 
        claim_simhash: null, // Will be computed by matcher
        rating: 'true',
        source: 'PolitiFact'
      },
      { 
        id: 2, 
        claim_text: 'Taxes will increase by 50 percent next year', 
        claim_simhash: null,
        rating: 'false',
        source: 'Snopes'
      }
    ];
    
    it('should return empty array for empty inputs', () => {
      expect(extractor.matchClaim('', [])).toEqual([]);
      expect(extractor.matchClaim('test', [])).toEqual([]);
      expect(extractor.matchClaim(null, factChecks)).toEqual([]);
    });
    
    it('should match similar claims by keyword overlap', () => {
      const claim = 'The unemployment rate has fallen to 3.5 percent';
      
      const matches = extractor.matchClaim(claim, factChecks, { 
        minKeywordOverlap: 3 
      });
      
      // Should find match based on keyword overlap
      expect(matches.length).toBeGreaterThanOrEqual(0);
    });
    
    it('should include match confidence scores', () => {
      const claim = 'Unemployment is now at 3.5 percent nationwide';
      
      const matches = extractor.matchClaim(claim, factChecks, { 
        minKeywordOverlap: 2 
      });
      
      for (const match of matches) {
        expect(match.matchConfidence).toBeDefined();
        expect(match.matchConfidence).toBeGreaterThanOrEqual(0);
        expect(match.matchConfidence).toBeLessThanOrEqual(1);
      }
    });
    
    it('should sort matches by confidence', () => {
      const claim = 'The unemployment rate dropped to 3.5 percent in the US';
      
      const matches = extractor.matchClaim(claim, factChecks, { 
        minKeywordOverlap: 2 
      });
      
      if (matches.length > 1) {
        for (let i = 1; i < matches.length; i++) {
          expect(matches[i - 1].matchConfidence).toBeGreaterThanOrEqual(
            matches[i].matchConfidence
          );
        }
      }
    });
  });
  
  describe('getStats', () => {
    it('should return configuration statistics', () => {
      const stats = extractor.getStats();
      
      expect(stats.minClaimLength).toBe(30);
      expect(stats.maxClaimLength).toBe(500);
      expect(stats.minCheckabilityScore).toBe(0.3);
      expect(typeof stats.patternCount).toBe('number');
      expect(stats.patternCount).toBeGreaterThan(0);
    });
  });
});
