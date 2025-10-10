/**
 * @fileoverview Tests verifying that gazetteer/geography crawls treat concurrency
 * as a maximum allowed limit, not a requirement. Sequential processing should occur
 * regardless of the concurrency value.
 */

const NewsCrawler = require('../../../crawl');
const path = require('path');
const os = require('os');
const fs = require('fs');

describe('Gazetteer Concurrency Behavior', () => {
  let tmpDbPath;

  beforeEach(() => {
    const tmpDir = path.join(os.tmpdir(), `concurrency-test-${Date.now()}-${Math.random()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    tmpDbPath = path.join(tmpDir, 'test.db');
  });

  afterEach(() => {
    // Clean up temp files
    const suffixes = ['', '-shm', '-wal'];
    for (const suffix of suffixes) {
      try {
        fs.unlinkSync(tmpDbPath + suffix);
      } catch (_) {}
    }
  });

  describe('concurrency parameter is stored', () => {
    test('geography crawl stores concurrency=1', () => {
      const crawler = new NewsCrawler('https://placeholder.example.com', {
        crawlType: 'geography',
        concurrency: 1,
        enableDb: false
      });

      expect(crawler.concurrency).toBe(1);
      expect(crawler.isGazetteerMode).toBe(true);
      expect(crawler.gazetteerVariant).toBe('geography');
    });

    test('geography crawl stores concurrency=8 (but uses it as maximum)', () => {
      const crawler = new NewsCrawler('https://placeholder.example.com', {
        crawlType: 'geography',
        concurrency: 8,
        enableDb: false
      });

      // Parameter is stored (as maximum allowed)
      expect(crawler.concurrency).toBe(8);
      expect(crawler.isGazetteerMode).toBe(true);
      
      // But priority queue is disabled (sequential processing)
      expect(crawler.usePriorityQueue).toBe(false);
    });

    test('wikidata crawl stores concurrency=4 (but uses it as maximum)', () => {
      const crawler = new NewsCrawler('https://placeholder.example.com', {
        crawlType: 'wikidata',
        concurrency: 4,
        enableDb: false
      });

      expect(crawler.concurrency).toBe(4);
      expect(crawler.isGazetteerMode).toBe(true);
      expect(crawler.gazetteerVariant).toBe('wikidata');
      expect(crawler.usePriorityQueue).toBe(false); // Sequential
    });

    test('gazetteer crawl type stores concurrency=3 (but uses it as maximum)', () => {
      const crawler = new NewsCrawler('https://placeholder.example.com', {
        crawlType: 'gazetteer',
        concurrency: 3,
        enableDb: false
      });

      expect(crawler.concurrency).toBe(3);
      expect(crawler.isGazetteerMode).toBe(true);
      expect(crawler.usePriorityQueue).toBe(false); // Sequential
    });
  });

  describe('gazetteer mode forces sequential processing', () => {
    test('usePriorityQueue is false even when concurrency > 1', () => {
      const crawler = new NewsCrawler('https://placeholder.example.com', {
        crawlType: 'geography',
        concurrency: 10,
        enableDb: false
      });

      // High concurrency stored but queue is not concurrent
      expect(crawler.concurrency).toBe(10);
      expect(crawler.usePriorityQueue).toBe(false);
    });

    test('regular crawl with concurrency > 1 enables priority queue', () => {
      const crawler = new NewsCrawler('https://www.theguardian.com', {
        crawlType: 'basic',
        concurrency: 4,
        enableDb: false
      });

      // Regular crawl enables priority queue for parallelism
      expect(crawler.concurrency).toBe(4);
      expect(crawler.usePriorityQueue).toBe(true);
    });

    test('geography defaults are applied overriding concurrency queue behavior', () => {
      const crawlerNoConcurrency = new NewsCrawler('https://placeholder.example.com', {
        crawlType: 'geography',
        enableDb: false
      });

      const crawlerHighConcurrency = new NewsCrawler('https://placeholder.example.com', {
        crawlType: 'geography',
        concurrency: 8,
        enableDb: false
      });

      // Both have priority queue disabled
      expect(crawlerNoConcurrency.usePriorityQueue).toBe(false);
      expect(crawlerHighConcurrency.usePriorityQueue).toBe(false);
    });
  });

  describe('_applyGazetteerDefaults enforces sequential behavior', () => {
    test('geography crawl disables sitemap regardless of options', () => {
      const crawler = new NewsCrawler('https://placeholder.example.com', {
        crawlType: 'geography',
        useSitemap: true, // Try to enable
        concurrency: 5,
        enableDb: false
      });

      expect(crawler.useSitemap).toBe(false); // Forced off
      expect(crawler.sitemapOnly).toBe(false);
      expect(crawler.usePriorityQueue).toBe(false); // Sequential
    });

    test('gazetteer defaults preserve concurrency value but disable queue', () => {
      const crawler = new NewsCrawler('https://placeholder.example.com', {
        crawlType: 'geography',
        concurrency: 6,
        enableDb: false
      });

      // Concurrency stored (maximum allowed)
      expect(crawler.concurrency).toBe(6);
      
      // But gazetteer defaults applied
      expect(crawler.structureOnly).toBe(false);
      expect(crawler.useSitemap).toBe(false);
      expect(crawler.usePriorityQueue).toBe(false); // Key: sequential processing
    });
  });

  describe('documentation consistency', () => {
    test('high concurrency values are accepted without error', () => {
      expect(() => {
        new NewsCrawler('https://placeholder.example.com', {
          crawlType: 'geography',
          concurrency: 100, // Very high
          enableDb: false
        });
      }).not.toThrow();
    });

    test('concurrency=0 is normalized to 1', () => {
      const crawler = new NewsCrawler('https://placeholder.example.com', {
        crawlType: 'geography',
        concurrency: 0, // Invalid
        enableDb: false
      });

      // Schema processor enforces Math.max(1, val)
      expect(crawler.concurrency).toBe(1);
    });

    test('negative concurrency is normalized to 1', () => {
      const crawler = new NewsCrawler('https://placeholder.example.com', {
        crawlType: 'geography',
        concurrency: -5, // Invalid
        enableDb: false
      });

      expect(crawler.concurrency).toBe(1);
    });
  });

  describe('regular crawls behave differently', () => {
    test('basic crawl with concurrency=4 enables parallel workers', () => {
      const crawler = new NewsCrawler('https://www.example.com', {
        crawlType: 'basic',
        concurrency: 4,
        enableDb: false
      });

      expect(crawler.concurrency).toBe(4);
      expect(crawler.usePriorityQueue).toBe(true); // Parallel enabled
      expect(crawler.isGazetteerMode).toBe(false);
    });

    test('intelligent crawl with concurrency=3 enables parallel workers', () => {
      const crawler = new NewsCrawler('https://www.example.com', {
        crawlType: 'intelligent',
        concurrency: 3,
        enableDb: false
      });

      expect(crawler.concurrency).toBe(3);
      expect(crawler.usePriorityQueue).toBe(true); // Parallel enabled
      expect(crawler.isGazetteerMode).toBe(false);
    });
  });
});
