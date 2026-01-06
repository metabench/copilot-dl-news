'use strict';

const Database = require('better-sqlite3');
const { createPlaceHubUrlPatternsStore } = require('../placeHubUrlPatternsStore');

describe('placeHubUrlPatternsStore', () => {
  let db;
  let store;

  beforeEach(() => {
    db = new Database(':memory:');
    store = createPlaceHubUrlPatternsStore(db);
  });

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
  });

  describe('savePattern', () => {
    it('should save a new pattern', () => {
      const pattern = {
        domain: 'example.com',
        patternType: 'segment',
        patternRegex: '\\/places\\/',
        patternDescription: 'URL contains /places/ segment',
        placeKind: 'city-hub',
        sampleCount: 5,
        exampleUrls: ['https://example.com/places/london', 'https://example.com/places/paris']
      };

      const saved = store.savePattern(pattern);

      expect(saved).not.toBeNull();
      expect(saved.domain).toBe('example.com');
      expect(saved.pattern_type).toBe('segment');
      expect(saved.pattern_regex).toBe('\\/places\\/');
      expect(saved.place_kind).toBe('city-hub');
      expect(saved.sample_count).toBe(5);
    });

    it('should normalize domain to lowercase', () => {
      const pattern = {
        domain: 'EXAMPLE.COM',
        patternType: 'segment',
        patternRegex: '\\/news\\/'
      };

      const saved = store.savePattern(pattern);

      expect(saved).not.toBeNull();
      expect(saved.domain).toBe('example.com');
    });

    it('should update sample_count on upsert', () => {
      const pattern = {
        domain: 'example.com',
        patternType: 'segment',
        patternRegex: '\\/places\\/',
        sampleCount: 1
      };

      store.savePattern(pattern);
      const initial = store.getPattern('example.com', 'segment', '\\/places\\/');
      expect(initial.sample_count).toBe(1);

      // Save same pattern again - should increment sample_count
      store.savePattern(pattern);
      const updated = store.getPattern('example.com', 'segment', '\\/places\\/');
      expect(updated.sample_count).toBe(2);
    });

    it('should return null for missing required fields', () => {
      expect(store.savePattern({ domain: 'example.com' })).toBeNull();
      expect(store.savePattern({ patternType: 'segment' })).toBeNull();
      expect(store.savePattern({ patternRegex: 'test' })).toBeNull();
      expect(store.savePattern(null)).toBeNull();
    });

    it('should serialize example URLs array', () => {
      const pattern = {
        domain: 'example.com',
        patternType: 'path',
        patternRegex: '^\\/uk\\/[a-z-]+\\/?$',
        exampleUrls: ['https://example.com/uk/london', 'https://example.com/uk/manchester']
      };

      const saved = store.savePattern(pattern);

      expect(saved.example_urls).toBeTruthy();
      const parsed = JSON.parse(saved.example_urls);
      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toBe('https://example.com/uk/london');
    });
  });

  describe('getPatternsForDomain', () => {
    beforeEach(() => {
      // Insert test patterns
      store.savePattern({
        domain: 'bbc.com',
        patternType: 'segment',
        patternRegex: '\\/news\\/uk\\/',
        accuracy: 0.9,
        sampleCount: 10
      });
      store.savePattern({
        domain: 'bbc.com',
        patternType: 'path',
        patternRegex: '^\\/news\\/[a-z-]+\\/?$',
        accuracy: 0.7,
        sampleCount: 5
      });
      store.savePattern({
        domain: 'bbc.com',
        patternType: 'segment',
        patternRegex: '\\/world\\/',
        accuracy: 0.4, // Below default threshold
        sampleCount: 3
      });
      store.savePattern({
        domain: 'cnn.com',
        patternType: 'segment',
        patternRegex: '\\/travel\\/',
        accuracy: 0.8,
        sampleCount: 7
      });
    });

    it('should return patterns for a domain', () => {
      const patterns = store.getPatternsForDomain('bbc.com');

      expect(patterns).toHaveLength(2); // Only 2 above default minAccuracy (0.5)
      expect(patterns[0].accuracy).toBeGreaterThanOrEqual(patterns[1].accuracy);
    });

    it('should filter by minimum accuracy', () => {
      const patterns = store.getPatternsForDomain('bbc.com', { minAccuracy: 0.8 });

      expect(patterns).toHaveLength(1);
      expect(patterns[0].pattern_regex).toBe('\\/news\\/uk\\/');
    });

    it('should respect limit parameter', () => {
      const patterns = store.getPatternsForDomain('bbc.com', { limit: 1 });

      expect(patterns).toHaveLength(1);
    });

    it('should return empty array for unknown domain', () => {
      const patterns = store.getPatternsForDomain('unknown.com');

      expect(patterns).toEqual([]);
    });

    it('should normalize domain for lookup', () => {
      const patterns = store.getPatternsForDomain('BBC.COM');

      expect(patterns.length).toBeGreaterThan(0);
    });
  });

  describe('getPatternsByPlaceKind', () => {
    beforeEach(() => {
      store.savePattern({
        domain: 'bbc.com',
        patternType: 'segment',
        patternRegex: '\\/uk\\/',
        placeKind: 'country-hub',
        accuracy: 0.9
      });
      store.savePattern({
        domain: 'bbc.com',
        patternType: 'segment',
        patternRegex: '\\/england\\/',
        placeKind: 'region-hub',
        accuracy: 0.85
      });
    });

    it('should filter by place kind', () => {
      const countryPatterns = store.getPatternsByPlaceKind('bbc.com', 'country-hub');
      expect(countryPatterns).toHaveLength(1);
      expect(countryPatterns[0].place_kind).toBe('country-hub');

      const regionPatterns = store.getPatternsByPlaceKind('bbc.com', 'region-hub');
      expect(regionPatterns).toHaveLength(1);
      expect(regionPatterns[0].place_kind).toBe('region-hub');
    });

    it('should return empty for non-existent place kind', () => {
      const patterns = store.getPatternsByPlaceKind('bbc.com', 'city-hub');
      expect(patterns).toEqual([]);
    });
  });

  describe('getAllPatterns', () => {
    beforeEach(() => {
      store.savePattern({
        domain: 'bbc.com',
        patternType: 'segment',
        patternRegex: '\\/uk\\/',
        accuracy: 0.9
      });
      store.savePattern({
        domain: 'cnn.com',
        patternType: 'segment',
        patternRegex: '\\/travel\\/',
        accuracy: 0.8
      });
    });

    it('should return patterns from all domains', () => {
      const patterns = store.getAllPatterns();

      expect(patterns.length).toBeGreaterThanOrEqual(2);
      const domains = new Set(patterns.map(p => p.domain));
      expect(domains.has('bbc.com')).toBe(true);
      expect(domains.has('cnn.com')).toBe(true);
    });
  });

  describe('updatePatternAccuracy', () => {
    beforeEach(() => {
      store.savePattern({
        domain: 'example.com',
        patternType: 'segment',
        patternRegex: '\\/places\\/',
        verifiedCount: 0,
        correctCount: 0,
        accuracy: 1.0
      });
    });

    it('should update accuracy on correct verification', () => {
      const changes = store.updatePatternAccuracy({
        domain: 'example.com',
        patternType: 'segment',
        patternRegex: '\\/places\\/',
        isCorrect: true
      });

      expect(changes).toBe(1);

      const pattern = store.getPattern('example.com', 'segment', '\\/places\\/');
      expect(pattern.verified_count).toBe(1);
      expect(pattern.correct_count).toBe(1);
      expect(pattern.accuracy).toBe(1.0);
    });

    it('should update accuracy on incorrect verification', () => {
      // First mark as correct
      store.updatePatternAccuracy({
        domain: 'example.com',
        patternType: 'segment',
        patternRegex: '\\/places\\/',
        isCorrect: true
      });

      // Then mark as incorrect
      store.updatePatternAccuracy({
        domain: 'example.com',
        patternType: 'segment',
        patternRegex: '\\/places\\/',
        isCorrect: false
      });

      const pattern = store.getPattern('example.com', 'segment', '\\/places\\/');
      expect(pattern.verified_count).toBe(2);
      expect(pattern.correct_count).toBe(1);
      expect(pattern.accuracy).toBe(0.5);
    });

    it('should return 0 for non-existent pattern', () => {
      const changes = store.updatePatternAccuracy({
        domain: 'unknown.com',
        patternType: 'segment',
        patternRegex: '\\/nonexistent\\/',
        isCorrect: true
      });

      expect(changes).toBe(0);
    });
  });

  describe('matchUrl', () => {
    beforeEach(() => {
      store.savePattern({
        domain: 'bbc.com',
        patternType: 'segment',
        patternRegex: '\\/news\\/uk\\/',
        placeKind: 'country-hub',
        accuracy: 0.9
      });
      store.savePattern({
        domain: 'bbc.com',
        patternType: 'segment',
        patternRegex: '\\/news\\/england\\/',
        placeKind: 'region-hub',
        accuracy: 0.85
      });
    });

    it('should match URL against learned patterns', () => {
      const result = store.matchUrl('https://bbc.com/news/uk/politics', 'bbc.com');

      expect(result).not.toBeNull();
      expect(result.matched).toBe(true);
      expect(result.pattern.pattern_regex).toBe('\\/news\\/uk\\/');
      expect(result.placeKind).toBe('country-hub');
      expect(result.confidence).toBe(0.9);
    });

    it('should return no match for non-matching URL', () => {
      const result = store.matchUrl('https://bbc.com/sport/football', 'bbc.com');

      expect(result).not.toBeNull();
      expect(result.matched).toBe(false);
      expect(result.pattern).toBeNull();
    });

    it('should record pattern match', () => {
      const result = store.matchUrl('https://bbc.com/news/uk/economy', 'bbc.com');

      expect(result.matched).toBe(true);
      
      // Verify the pattern has a last_matched_at timestamp
      const pattern = store.getPattern('bbc.com', 'segment', '\\/news\\/uk\\/');
      expect(pattern.last_matched_at).toBeTruthy();
      expect(pattern.updated_at).toBeTruthy();
    });

    it('should return null for empty inputs', () => {
      expect(store.matchUrl(null, 'bbc.com')).toBeNull();
      expect(store.matchUrl('https://bbc.com/test', null)).toBeNull();
    });
  });

  describe('deleteStalePatterns', () => {
    it('should delete patterns below accuracy threshold', () => {
      store.savePattern({
        domain: 'example.com',
        patternType: 'segment',
        patternRegex: '\\/good\\/',
        accuracy: 0.9
      });
      store.savePattern({
        domain: 'example.com',
        patternType: 'segment',
        patternRegex: '\\/bad\\/',
        accuracy: 0.2
      });

      const deleted = store.deleteStalePatterns('example.com', { minAccuracy: 0.5 });

      expect(deleted).toBe(1);
      expect(store.getPattern('example.com', 'segment', '\\/good\\/')).not.toBeNull();
      expect(store.getPattern('example.com', 'segment', '\\/bad\\/')).toBeNull();
    });
  });

  describe('getDomainStats', () => {
    beforeEach(() => {
      store.savePattern({
        domain: 'example.com',
        patternType: 'segment',
        patternRegex: '\\/a\\/',
        sampleCount: 10,
        accuracy: 0.9
      });
      store.savePattern({
        domain: 'example.com',
        patternType: 'segment',
        patternRegex: '\\/b\\/',
        sampleCount: 5,
        accuracy: 0.8
      });
    });

    it('should return domain statistics', () => {
      const stats = store.getDomainStats('example.com');

      expect(stats).not.toBeNull();
      expect(stats.domain).toBe('example.com');
      expect(stats.pattern_count).toBe(2);
      expect(stats.total_samples).toBe(15);
      expect(stats.avg_accuracy).toBeCloseTo(0.85, 1);
    });

    it('should return null for unknown domain', () => {
      const stats = store.getDomainStats('unknown.com');
      expect(stats).toBeNull();
    });
  });

  describe('getTopDomains', () => {
    beforeEach(() => {
      // Add patterns for multiple domains
      for (let i = 0; i < 5; i++) {
        store.savePattern({
          domain: 'domainA.com',
          patternType: 'segment',
          patternRegex: `\\/segment${i}\\/`,
          accuracy: 0.9
        });
      }
      for (let i = 0; i < 3; i++) {
        store.savePattern({
          domain: 'domainB.com',
          patternType: 'segment',
          patternRegex: `\\/segment${i}\\/`,
          accuracy: 0.8
        });
      }
    });

    it('should return domains sorted by pattern count', () => {
      const domains = store.getTopDomains(10);

      expect(domains.length).toBeGreaterThanOrEqual(2);
      expect(domains[0].domain).toBe('domaina.com'); // Normalized to lowercase
      expect(domains[0].pattern_count).toBe(5);
      expect(domains[1].domain).toBe('domainb.com');
      expect(domains[1].pattern_count).toBe(3);
    });

    it('should respect limit', () => {
      const domains = store.getTopDomains(1);
      expect(domains).toHaveLength(1);
    });
  });
});
