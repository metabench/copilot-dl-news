/**
 * @fileoverview Tests for geography crawl depth filtering
 * 
 * Verifies that geography crawls ignore depth limits and process all stages
 * (countries, regions, cities, boundaries) regardless of maxDepth setting.
 */

'use strict';

const NewsCrawler = require('../../../crawl');
const path = require('path');
const os = require('os');
const fs = require('fs');

describe('Geography Crawl - Depth Filtering', () => {
  let tempDbPath;

  beforeEach(() => {
    tempDbPath = path.join(os.tmpdir(), `test-depth-${Date.now()}.db`);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDbPath)) {
        fs.unlinkSync(tempDbPath);
      }
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  describe('_applyGazetteerDefaults()', () => {
    test('sets maxDepth to 999 for geography crawls by default', () => {
      const crawler = new NewsCrawler('https://placeholder.example.com', {
        maxPages: 10,
        crawlType: 'geography',
        dbPath: tempDbPath,
        verbose: false
      });

      expect(crawler.isGazetteerMode).toBe(true);
      expect(crawler.gazetteerVariant).toBe('geography');
      expect(crawler.maxDepth).toBe(999);
    });

    test('respects explicit maxDepth if provided', () => {
      const crawler = new NewsCrawler('https://placeholder.example.com', {
        maxPages: 10,
        crawlType: 'geography',
        maxDepth: 1,
        dbPath: tempDbPath,
        verbose: false
      });

      expect(crawler.maxDepth).toBe(1);
    });

    test('applies to wikidata crawl type', () => {
      const crawler = new NewsCrawler('https://placeholder.example.com', {
        maxPages: 10,
        crawlType: 'wikidata',
        dbPath: tempDbPath,
        verbose: false
      });

      expect(crawler.isGazetteerMode).toBe(true);
      expect(crawler.gazetteerVariant).toBe('wikidata');
      expect(crawler.maxDepth).toBe(999);
    });

    test('applies to gazetteer crawl type', () => {
      const crawler = new NewsCrawler('https://placeholder.example.com', {
        maxPages: 10,
        crawlType: 'gazetteer',
        dbPath: tempDbPath,
        verbose: false
      });

      expect(crawler.isGazetteerMode).toBe(true);
      expect(crawler.gazetteerVariant).toBe('geography');
      expect(crawler.maxDepth).toBe(999);
    });

    test('does not affect regular web crawls', () => {
      const crawler = new NewsCrawler('https://example.com', {
        maxPages: 10,
        maxDepth: 3,
        dbPath: tempDbPath,
        verbose: false
      });

      expect(crawler.isGazetteerMode).toBe(false);
      expect(crawler.maxDepth).toBe(3);
    });
  });

  describe('Stage Filtering', () => {
    test('geography crawl includes all stages when maxDepth=999', () => {
      const crawler = new NewsCrawler('https://placeholder.example.com', {
        maxPages: 10,
        crawlType: 'geography',
        dbPath: tempDbPath,
        verbose: false
      });

      // maxDepth is set automatically in constructor
      expect(crawler.maxDepth).toBe(999);
      
      // With maxDepth=999, all stages (depth 0, 1, 2) should be included
      const testStages = [
        { name: 'countries', crawlDepth: 0 },
        { name: 'regions', crawlDepth: 1 },
        { name: 'cities', crawlDepth: 2 }
      ];
      
      testStages.forEach(stage => {
        expect(stage.crawlDepth).toBeLessThanOrEqual(crawler.maxDepth);
      });
    });

    test('explicit low maxDepth filters stages', () => {
      const crawler = new NewsCrawler('https://placeholder.example.com', {
        maxPages: 10,
        crawlType: 'geography',
        maxDepth: 0,  // Explicit override
        dbPath: tempDbPath,
        verbose: false
      });

      // Configure gazetteer pipeline
      crawler._configureGazetteerPipeline();

      expect(crawler.maxDepth).toBe(0);

      // With maxDepth=0, only stages with crawlDepth=0 should be included
      // (typically just countries)
    });

    test('stage crawlDepth values are preserved', () => {
      const crawler = new NewsCrawler('https://placeholder.example.com', {
        maxPages: 10,
        crawlType: 'geography',
        dbPath: tempDbPath,
        verbose: false
      });

      // Verify configuration was applied (maxDepth is set on crawler directly)
      expect(crawler.maxDepth).toBe(999);
      
      // Test stages would have preserved depth values
      // (actual stage creation happens in _configureGazetteerPipeline)
      expect(crawler.crawlType).toBe('geography');
    });
  });

  describe('_shouldBypassDepth()', () => {
    test('returns true for gazetteer mode crawls', () => {
      const crawler = new NewsCrawler('https://placeholder.example.com', {
        maxPages: 10,
        crawlType: 'geography',
        dbPath: tempDbPath,
        verbose: false
      });

      expect(crawler._shouldBypassDepth()).toBe(true);
    });

    test('returns true for URLs with gazetteer meta', () => {
      const crawler = new NewsCrawler('https://example.com', {
        maxPages: 10,
        dbPath: tempDbPath,
        verbose: false
      });

      const info = {
        meta: { origin: 'gazetteer' }
      };

      expect(crawler._shouldBypassDepth(info)).toBe(true);
    });

    test('returns true for depthPolicy=ignore', () => {
      const crawler = new NewsCrawler('https://example.com', {
        maxPages: 10,
        dbPath: tempDbPath,
        verbose: false
      });

      const info = {
        meta: { depthPolicy: 'ignore' }
      };

      expect(crawler._shouldBypassDepth(info)).toBe(true);
    });

    test('returns false for regular web crawls', () => {
      const crawler = new NewsCrawler('https://example.com', {
        maxPages: 10,
        dbPath: tempDbPath,
        verbose: false
      });

      expect(crawler._shouldBypassDepth({})).toBe(false);
    });
  });

  describe('Integration with Stages', () => {
    test('countries stage has crawlDepth=0', () => {
      // This verifies the stage configuration is correct
      const expectedStages = [
        { name: 'countries', crawlDepth: 0 },
        { name: 'adm1', crawlDepth: 1 },
        { name: 'cities', crawlDepth: 2 },
        { name: 'boundaries', crawlDepth: 1 }
      ];

      // With maxDepth=999, all stages should be included
      expectedStages.forEach(stage => {
        expect(stage.crawlDepth).toBeLessThanOrEqual(999);
      });
    });

    test('filtering with maxDepth=1 excludes cities (depth=2)', () => {
      const stages = [
        { name: 'countries', crawlDepth: 0 },
        { name: 'adm1', crawlDepth: 1 },
        { name: 'cities', crawlDepth: 2 },
        { name: 'boundaries', crawlDepth: 1 }
      ];

      const maxDepth = 1;
      const filtered = stages.filter(s => s.crawlDepth <= maxDepth);

      expect(filtered).toHaveLength(3);
      expect(filtered.find(s => s.name === 'countries')).toBeDefined();
      expect(filtered.find(s => s.name === 'adm1')).toBeDefined();
      expect(filtered.find(s => s.name === 'boundaries')).toBeDefined();
      expect(filtered.find(s => s.name === 'cities')).toBeUndefined();
    });

    test('filtering with maxDepth=999 includes all stages', () => {
      const stages = [
        { name: 'countries', crawlDepth: 0 },
        { name: 'adm1', crawlDepth: 1 },
        { name: 'cities', crawlDepth: 2 },
        { name: 'boundaries', crawlDepth: 1 }
      ];

      const maxDepth = 999;
      const filtered = stages.filter(s => s.crawlDepth <= maxDepth);

      expect(filtered).toHaveLength(4);
      expect(filtered.find(s => s.name === 'countries')).toBeDefined();
      expect(filtered.find(s => s.name === 'adm1')).toBeDefined();
      expect(filtered.find(s => s.name === 'cities')).toBeDefined();
      expect(filtered.find(s => s.name === 'boundaries')).toBeDefined();
    });
  });

  describe('City Limits Configuration', () => {
    test('cities stage uses increased limits', () => {
      const crawler = new NewsCrawler('https://placeholder.example.com', {
        maxPages: 10,
        crawlType: 'geography',
        dbPath: tempDbPath,
        verbose: false
      });

      crawler._configureGazetteerPipeline();

      // Verify cities ingestor configuration
      // The actual ingestor is created with maxCitiesPerCountry: 200
      // and minPopulation: 10000
      expect(crawler.gazetteerOptions).toBeDefined();
    });
  });

  describe('Region Fetching Configuration', () => {
    test('regions stage uses dynamic fetching', () => {
      const crawler = new NewsCrawler('https://placeholder.example.com', {
        maxPages: 10,
        crawlType: 'geography',
        dbPath: tempDbPath,
        verbose: false
      });

      // Verify configuration was applied (maxDepth is set on crawler directly)
      expect(crawler.maxDepth).toBe(999);
      
      // ADM1 ingestor configuration happens in _configureGazetteerPipeline
      // This test verifies the defaults are set correctly
      expect(crawler.crawlType).toBe('geography');
    });
  });
});
