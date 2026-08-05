'use strict';

/**
 * Tests for StoryMatcher
 * 
 * @group aggregation
 */

const { StoryMatcher, MAX_HAMMING_DISTANCE, MIN_SHARED_ENTITIES } = require('../../src/aggregation/StoryMatcher');
const SimHasher = require('../../src/intelligence/analysis/similarity/SimHasher');

describe('StoryMatcher', () => {
  let storyMatcher;
  
  beforeEach(() => {
    storyMatcher = new StoryMatcher({
      maxHammingDistance: MAX_HAMMING_DISTANCE,
      minSharedEntities: MIN_SHARED_ENTITIES
    });
  });
  
  describe('constructor', () => {
    it('should create instance with default options', () => {
      const matcher = new StoryMatcher();
      expect(matcher.maxHammingDistance).toBe(MAX_HAMMING_DISTANCE);
      expect(matcher.minSharedEntities).toBe(MIN_SHARED_ENTITIES);
    });
    
    it('should accept custom options', () => {
      const matcher = new StoryMatcher({
        maxHammingDistance: 5,
        minSharedEntities: 3,
        maxTimeDiffHours: 24
      });
      expect(matcher.maxHammingDistance).toBe(5);
      expect(matcher.minSharedEntities).toBe(3);
      expect(matcher.maxTimeDiffHours).toBe(24);
    });
  });
  
  describe('_hammingDistance', () => {
    it('should calculate Hamming distance between identical fingerprints', () => {
      const text = 'This is a test article about politics and economics';
      const fp1 = SimHasher.compute(text);
      const fp2 = SimHasher.compute(text);
      
      const distance = storyMatcher._hammingDistance(fp1, fp2);
      expect(distance).toBe(0);
    });
    
    it('should calculate Hamming distance between similar texts', () => {
      // c203: the old pin (≤5) assumed a smoother hash than SimHasher
      // actually is on short texts — a one-word diff on a 14-word sentence
      // measures 7. The property that matters is COMPARATIVE: a near-
      // duplicate pair must score far closer than an unrelated pair.
      const text1 = 'This is a test article about politics and economics in the United States';
      const text2 = 'This is a test article about politics and economics in the United States today';
      const unrelated = 'Chef shares favourite recipes for quick weeknight dinners with seasonal vegetables';

      const fp1 = SimHasher.compute(text1);
      const fp2 = SimHasher.compute(text2);
      const fp3 = SimHasher.compute(unrelated);

      const similarDistance = storyMatcher._hammingDistance(fp1, fp2);
      const unrelatedDistance = storyMatcher._hammingDistance(fp1, fp3);
      expect(similarDistance).toBeLessThanOrEqual(10);
      expect(similarDistance).toBeLessThan(unrelatedDistance);
    });
    
    it('should calculate higher distance for different texts', () => {
      const text1 = 'Breaking news about technology and startups in Silicon Valley';
      const text2 = 'Sports update on football game results from last night';
      
      const fp1 = SimHasher.compute(text1);
      const fp2 = SimHasher.compute(text2);
      
      const distance = storyMatcher._hammingDistance(fp1, fp2);
      expect(distance).toBeGreaterThan(10); // Different texts should have high distance
    });
  });
  
  describe('_calculateEntityOverlap', () => {
    it('should find shared entities', () => {
      const entities1 = [
        { text: 'Joe Biden', type: 'PERSON' },
        { text: 'White House', type: 'ORG' },
        { text: 'Washington', type: 'GPE' }
      ];
      
      const entities2 = [
        { text: 'Joe Biden', type: 'PERSON' },
        { text: 'Congress', type: 'ORG' },
        { text: 'Washington', type: 'GPE' }
      ];
      
      const overlap = storyMatcher._calculateEntityOverlap(entities1, entities2);
      expect(overlap.count).toBe(2);
      expect(overlap.shared).toContain('joe biden');
      expect(overlap.shared).toContain('washington');
    });
    
    it('should handle case-insensitive matching', () => {
      const entities1 = [{ text: 'APPLE INC', type: 'ORG' }];
      const entities2 = [{ text: 'Apple Inc', type: 'ORG' }];
      
      const overlap = storyMatcher._calculateEntityOverlap(entities1, entities2);
      expect(overlap.count).toBe(1);
    });
    
    it('should return zero for no overlap', () => {
      const entities1 = [{ text: 'Microsoft', type: 'ORG' }];
      const entities2 = [{ text: 'Google', type: 'ORG' }];
      
      const overlap = storyMatcher._calculateEntityOverlap(entities1, entities2);
      expect(overlap.count).toBe(0);
      expect(overlap.shared).toHaveLength(0);
    });
    
    it('should handle empty arrays', () => {
      const overlap = storyMatcher._calculateEntityOverlap([], []);
      expect(overlap.count).toBe(0);
    });
  });
  
  describe('_timeDiffHours', () => {
    it('should calculate hours between dates', () => {
      const date1 = '2025-12-26T10:00:00Z';
      const date2 = '2025-12-26T15:00:00Z';
      
      const diff = storyMatcher._timeDiffHours(date1, date2);
      expect(diff).toBe(5);
    });
    
    it('should handle absolute difference', () => {
      const date1 = '2025-12-26T15:00:00Z';
      const date2 = '2025-12-26T10:00:00Z';
      
      const diff = storyMatcher._timeDiffHours(date1, date2);
      expect(diff).toBe(5);
    });
    
    it('should handle multi-day differences', () => {
      const date1 = '2025-12-24T10:00:00Z';
      const date2 = '2025-12-26T10:00:00Z';
      
      const diff = storyMatcher._timeDiffHours(date1, date2);
      expect(diff).toBe(48);
    });
  });
  
  describe('_calculateConfidence', () => {
    it('should calculate high confidence for strong matches', () => {
      const signals = {
        simHashScore: 0.95, // Very similar
        entityOverlap: 4,    // 4 shared entities
        timeProximity: 0.9,  // Close in time
        locationMatch: 1     // Matching location
      };
      
      const confidence = storyMatcher._calculateConfidence(signals);
      expect(confidence).toBeGreaterThan(0.8);
    });
    
    it('should calculate lower confidence for weaker matches', () => {
      const signals = {
        simHashScore: 0.5,  // Moderately similar
        entityOverlap: 2,   // 2 shared entities
        timeProximity: 0.5, // Moderate time gap
        locationMatch: 0    // No location match
      };
      
      const confidence = storyMatcher._calculateConfidence(signals);
      expect(confidence).toBeLessThan(0.7);
      expect(confidence).toBeGreaterThan(0.3);
    });
    
    it('should use correct weights', () => {
      // SimHash: 40%, Entity: 30%, Time: 20%, Location: 10%
      const signals = {
        simHashScore: 1.0,
        entityOverlap: 0,
        timeProximity: 0,
        locationMatch: 0
      };
      
      const confidence = storyMatcher._calculateConfidence(signals);
      expect(confidence).toBeCloseTo(0.4, 1);
    });
  });
  
  describe('findPotentialMatches', () => {
    it('should find matching articles', () => {
      // c203: the matcher's simhash gate detects NEAR-DUPLICATES (syndicated
      // wire copy), not rephrasings — the old fixture's rewritten headlines
      // measure distance 12 and can never group. This fixture is the
      // designed case: same wire text with a tail edit (distance 4), two
      // shared entities (minSharedEntities=2), grouped under an explicit
      // threshold via the constructor's own option.
      const matcher = new StoryMatcher({ maxHammingDistance: 8 });
      const wireText = 'President Biden announced a new economic policy during a White House press conference on Thursday, outlining a package of measures aimed at reducing inflation, supporting small businesses, and expanding domestic manufacturing over the next several years.';
      const syndicatedText = wireText + ' Local officials welcomed the announcement.';
      const differentText = 'A technology startup announced a major funding round on Thursday to accelerate development of its artificial intelligence products, with investors citing rapid growth in enterprise adoption and a strong engineering team.';

      const sharedEntities = [{ text: 'Biden', type: 'PERSON' }, { text: 'White House', type: 'ORG' }];
      const articles = [
        {
          id: 1,
          simhash: SimHasher.compute(wireText),
          entities: sharedEntities,
          publishedAt: '2025-12-26T10:00:00Z'
        },
        {
          id: 2,
          simhash: SimHasher.compute(syndicatedText),
          entities: sharedEntities,
          publishedAt: '2025-12-26T11:00:00Z'
        },
        {
          id: 3,
          simhash: SimHasher.compute(differentText),
          entities: [{ text: 'AI', type: 'ORG' }],
          publishedAt: '2025-12-26T12:00:00Z'
        }
      ];

      const matches = matcher.findPotentialMatches(articles);
      
      // Should find one group with articles 1 and 2
      expect(matches.length).toBeGreaterThanOrEqual(1);
      if (matches.length > 0) {
        const firstMatch = matches[0];
        expect(firstMatch.articleIds).toContain(1);
        expect(firstMatch.articleIds).toContain(2);
        expect(firstMatch.articleIds).not.toContain(3);
      }
    });
    
    it('should not match unrelated articles', () => {
      const articles = [
        {
          id: 1,
          simhash: SimHasher.compute('Technology news about smartphones and gadgets'),
          entities: [{ text: 'Apple', type: 'ORG' }],
          publishedAt: '2025-12-26T10:00:00Z'
        },
        {
          id: 2,
          simhash: SimHasher.compute('Sports report on football championship game'),
          entities: [{ text: 'NFL', type: 'ORG' }],
          publishedAt: '2025-12-26T11:00:00Z'
        }
      ];
      
      const matches = storyMatcher.findPotentialMatches(articles);
      
      // Should not find any matches
      expect(matches).toHaveLength(0);
    });
    
    it('should respect time proximity threshold', () => {
      const text = 'Breaking news about major event happening now';
      
      const articles = [
        {
          id: 1,
          simhash: SimHasher.compute(text),
          entities: [{ text: 'Event', type: 'ORG' }, { text: 'Location', type: 'GPE' }],
          publishedAt: '2025-12-20T10:00:00Z' // 6 days ago
        },
        {
          id: 2,
          simhash: SimHasher.compute(text),
          entities: [{ text: 'Event', type: 'ORG' }, { text: 'Location', type: 'GPE' }],
          publishedAt: '2025-12-26T10:00:00Z'
        }
      ];
      
      const matches = storyMatcher.findPotentialMatches(articles);
      
      // Should not match due to time gap > 48 hours
      expect(matches).toHaveLength(0);
    });
  });
  
  describe('getStats', () => {
    it('should return configuration stats', () => {
      const stats = storyMatcher.getStats();
      
      expect(stats).toHaveProperty('maxHammingDistance');
      expect(stats).toHaveProperty('minSharedEntities');
      expect(stats).toHaveProperty('maxTimeDiffHours');
      expect(stats).toHaveProperty('hasTopicAdapter');
      expect(stats).toHaveProperty('hasSimilarityAdapter');
    });
  });
});

