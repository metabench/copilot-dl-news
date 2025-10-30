/**
 * HubGapAnalyzerBase tests
 * Tests the shared pattern generation and URL normalization logic
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { CountryHubGapAnalyzer } = require('../CountryHubGapAnalyzer');
const { CityHubGapAnalyzer } = require('../CityHubGapAnalyzer');
const { RegionHubGapAnalyzer } = require('../RegionHubGapAnalyzer');

function createSilentLogger() {
  return {
    log: () => {},
    warn: () => {},
    error: () => {}
  };
}

describe('HubGapAnalyzerBase - Shared Pattern Logic', () => {
  let tempDir;
  let db;
  const logger = createSilentLogger();

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'base-test-'));
    
    // Create a simple DSPL without patterns to test fallback logic
    const dsplPayload = {
      'example.com': {
        domain: 'example.com',
        generated: new Date().toISOString(),
        countryHubPatterns: [],
        regionHubPatterns: [],
        cityHubPatterns: []
      }
    };
    fs.writeFileSync(
      path.join(tempDir, 'example.json'), 
      JSON.stringify(dsplPayload, null, 2), 
      'utf8'
    );
    
    db = new Database(':memory:');
  });

  afterEach(() => {
    if (db) db.close();
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Country analyzer', () => {
    test('generates URLs from fallback patterns', () => {
      const analyzer = new CountryHubGapAnalyzer({ db, dsplDir: tempDir, logger });
      const urls = analyzer.predictHubUrls('example.com', { name: 'France', code: 'FR' });

      expect(urls).toContain('https://example.com/world/france');
      expect(urls).toContain('https://example.com/news/world/france');
      expect(urls).toContain('https://example.com/news/fr');
      expect(urls.every(u => u.startsWith('https://example.com/'))).toBe(true);
    });

    test('deduplicates identical URLs', () => {
      const analyzer = new CountryHubGapAnalyzer({ db, dsplDir: tempDir, logger });
      const urls = analyzer.predictHubUrls('example.com', { name: 'USA', code: 'US' });

      // Count unique URLs
      const uniqueUrls = new Set(urls);
      expect(uniqueUrls.size).toBe(urls.length);
    });
  });

  describe('City analyzer', () => {
    test('generates URLs from fallback patterns with city slug', () => {
      const analyzer = new CityHubGapAnalyzer({ db, dsplDir: tempDir, logger });
      const urls = analyzer.predictHubUrls('example.com', {
        name: 'New York',
        countryCode: 'US',
        regionName: 'New York'
      });

      expect(urls).toContain('https://example.com/new-york');
      expect(urls).toContain('https://example.com/city/new-york');
      expect(urls).toContain('https://example.com/us/new-york');
    });

    test('handles missing country code gracefully', () => {
      const analyzer = new CityHubGapAnalyzer({ db, dsplDir: tempDir, logger });
      const urls = analyzer.predictHubUrls('example.com', { name: 'Paris' });

      expect(urls.length).toBeGreaterThan(0);
      expect(urls[0]).toMatch(/^https:\/\/example.com\//);
    });
  });

  describe('Region analyzer', () => {
    test('generates URLs from fallback patterns with region metadata', () => {
      const analyzer = new RegionHubGapAnalyzer({ db, dsplDir: tempDir, logger });
      const urls = analyzer.predictHubUrls('example.com', {
        name: 'California',
        code: 'US-CA',
        countryCode: 'US'
      });

      expect(urls).toContain('https://example.com/california');
      expect(urls).toContain('https://example.com/us/california');
    });
  });

  describe('Shared deduplication', () => {
    test('removes duplicate predictions and keeps highest confidence', () => {
      const analyzer = new CountryHubGapAnalyzer({ db, dsplDir: tempDir, logger });
      
      const predictions = [
        { url: 'https://example.com/test', confidence: 0.5 },
        { url: 'https://example.com/test', confidence: 0.9 },
        { url: 'https://example.com/other', confidence: 0.7 }
      ];

      const deduped = analyzer.deduplicateAndScore(predictions);
      
      expect(deduped.length).toBe(2);
      const testUrl = deduped.find(p => p.url === 'https://example.com/test');
      expect(testUrl.confidence).toBe(0.9);
    });

    test('sorts by confidence descending', () => {
      const analyzer = new CountryHubGapAnalyzer({ db, dsplDir: tempDir, logger });
      
      const predictions = [
        { url: 'https://example.com/low', confidence: 0.3 },
        { url: 'https://example.com/high', confidence: 0.9 },
        { url: 'https://example.com/mid', confidence: 0.6 }
      ];

      const sorted = analyzer.deduplicateAndScore(predictions);
      
      expect(sorted[0].confidence).toBe(0.9);
      expect(sorted[1].confidence).toBe(0.6);
      expect(sorted[2].confidence).toBe(0.3);
    });
  });
});
