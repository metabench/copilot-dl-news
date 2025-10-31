/**
 * Unit tests for PlaceTopicHubGapAnalyzer
 */

const { PlaceTopicHubGapAnalyzer } = require('../PlaceTopicHubGapAnalyzer');
const { createTempDb } = require('../../test-utils/db-helpers');

describe('PlaceTopicHubGapAnalyzer', () => {
  let db;
  let analyzer;

  beforeEach(() => {
    db = createTempDb();
    analyzer = new PlaceTopicHubGapAnalyzer({ db });
  });

  afterEach(() => {
    if (db) db.close();
  });

  describe('constructor', () => {
    test('requires database connection', () => {
      expect(() => new PlaceTopicHubGapAnalyzer({})).toThrow('requires a database connection');
    });

    test('initializes with database', () => {
      expect(analyzer.db).toBe(db);
      expect(analyzer.logger).toBe(console);
    });
  });

  describe('getEntityLabel', () => {
    test('returns place-topic', () => {
      expect(analyzer.getEntityLabel()).toBe('place-topic');
    });
  });

  describe('getFallbackPatterns', () => {
    test('returns combination patterns', () => {
      const patterns = analyzer.getFallbackPatterns();
      expect(Array.isArray(patterns)).toBe(true);
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns).toContain('/world/{placeSlug}/{topicSlug}');
      expect(patterns).toContain('/{placeSlug}/{topicSlug}');
      expect(patterns).toContain('/{topicSlug}/{placeSlug}');
    });
  });

  describe('buildEntityMetadata', () => {
    test('returns null for invalid input', () => {
      expect(analyzer.buildEntityMetadata(null)).toBeNull();
      expect(analyzer.buildEntityMetadata({})).toBeNull();
      expect(analyzer.buildEntityMetadata({ place: {} })).toBeNull();
      expect(analyzer.buildEntityMetadata({ topic: {} })).toBeNull();
    });

    test('builds metadata for valid combination', () => {
      const combination = {
        place: { name: 'France', code: 'FR', slug: 'france' },
        topic: { slug: 'politics', label: 'Politics' }
      };

      const metadata = analyzer.buildEntityMetadata(combination);
      expect(metadata).toEqual({
        placeSlug: 'france',
        placeCode: 'fr',
        placeName: 'France',
        topicSlug: 'politics',
        topicLabel: 'Politics',
        region: 'europe'
      });
    });

    test('handles missing slugs', () => {
      const combination = {
        place: { name: 'United States', code: 'US' }, // no slug
        topic: { slug: 'sport' } // no label
      };

      const metadata = analyzer.buildEntityMetadata(combination);
      expect(metadata.placeSlug).toBe('united-states');
      expect(metadata.topicLabel).toBe('sport');
    });

    test('handles region mapping', () => {
      const combination = {
        place: { name: 'Japan', code: 'JP' },
        topic: { slug: 'technology' }
      };

      const metadata = analyzer.buildEntityMetadata(combination);
      expect(metadata.region).toBe('asia');
    });
  });

  describe('predictCombinationUrls', () => {
    test('returns empty array for invalid inputs', () => {
      expect(analyzer.predictCombinationUrls('example.com', null, {})).toEqual([]);
      expect(analyzer.predictCombinationUrls('example.com', {}, null)).toEqual([]);
    });

    test('generates predictions from common patterns', () => {
      const place = { name: 'France', code: 'FR' };
      const topic = { slug: 'politics' };

      const predictions = analyzer.predictCombinationUrls('example.com', place, topic);

      expect(Array.isArray(predictions)).toBe(true);
      expect(predictions.length).toBeGreaterThan(0);

      // Check that URLs are properly formatted strings
      for (const url of predictions) {
        expect(typeof url).toBe('string');
        expect(url).toMatch(/^https:\/\/example\.com\//);
      }

      // Check for expected patterns
      expect(predictions).toContain('https://example.com/world/france/politics');
      expect(predictions).toContain('https://example.com/france/politics');
      // Note: /politics/france is not in top 3 due to confidence ordering
    });

    test('limits results to top predictions', () => {
      const place = { name: 'Germany', code: 'DE' };
      const topic = { slug: 'economy' };

      const predictions = analyzer.predictCombinationUrls('example.com', place, topic);

      // Should be limited to 3 predictions max
      expect(predictions.length).toBeLessThanOrEqual(3);
    });
  });

  describe('analyzeGaps', () => {
    test('returns gap analysis structure', () => {
      const analysis = analyzer.analyzeGaps('example.com');

      expect(analysis).toHaveProperty('domain', 'example.com');
      expect(analysis).toHaveProperty('seeded', 0);
      expect(analysis).toHaveProperty('visited', 0);
      expect(analysis).toHaveProperty('missing', 0);
      expect(analysis).toHaveProperty('coveragePercent', 0);
      expect(analysis).toHaveProperty('isComplete', false);
      expect(analysis).toHaveProperty('timestamp');
      expect(analysis).toHaveProperty('totalCombinations', 0);
      expect(analysis).toHaveProperty('missingCombinations');
    });

    test('caches analysis results', () => {
      const analysis1 = analyzer.analyzeGaps('example.com');
      const analysis2 = analyzer.analyzeGaps('example.com');

      // Should return the same object (cached)
      expect(analysis1).toBe(analysis2);
    });
  });

  describe('generatePredictions', () => {
    test('returns empty array for no combinations', () => {
      const predictions = analyzer.generatePredictions('example.com', []);
      expect(predictions).toEqual([]);
    });

    test('generates predictions for combinations', () => {
      const combinations = [
        {
          place: { name: 'Italy', code: 'IT', importance: 80 },
          topic: { slug: 'culture', label: 'Culture', relevance: 0.8 }
        }
      ];

      const predictions = analyzer.generatePredictions('example.com', combinations);

      expect(Array.isArray(predictions)).toBe(true);
      expect(predictions.length).toBeGreaterThan(0);

      for (const pred of predictions) {
        expect(pred).toHaveProperty('url');
        expect(pred).toHaveProperty('placeName', 'Italy');
        expect(pred).toHaveProperty('placeCode', 'IT');
        expect(pred).toHaveProperty('topicSlug', 'culture');
        expect(pred).toHaveProperty('topicLabel', 'Culture');
        expect(pred).toHaveProperty('confidence');
        expect(pred).toHaveProperty('priority');
        expect(pred).toHaveProperty('predictionSource', 'place-topic-combination-gap-analysis');
        expect(pred).toHaveProperty('timestamp');
      }
    });
  });

  describe('private methods', () => {
    describe('_getRegion', () => {
      test('maps country codes to regions', () => {
        expect(analyzer._getRegion('US')).toBe('americas');
        expect(analyzer._getRegion('GB')).toBe('europe');
        expect(analyzer._getRegion('JP')).toBe('asia');
        expect(analyzer._getRegion('AU')).toBe('oceania');
        expect(analyzer._getRegion('XX')).toBe('international');
      });
    });

    describe('_calculateCombinationConfidence', () => {
      test('calculates confidence based on place importance and topic relevance', () => {
        const combination = {
          place: { importance: 100 },
          topic: { relevance: 1.0 }
        };

        const confidence = analyzer._calculateCombinationConfidence(combination);
        expect(confidence).toBeGreaterThan(0.3);
        expect(confidence).toBeLessThanOrEqual(1.0);
      });
    });

    describe('_calculateCombinationPriority', () => {
      test('calculates priority based on place importance', () => {
        const combination = {
          place: { importance: 90 }
        };

        const priority = analyzer._calculateCombinationPriority(combination);
        expect(priority).toBe(9);
      });
    });
  });
});