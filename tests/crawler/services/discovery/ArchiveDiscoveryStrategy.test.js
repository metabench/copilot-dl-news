'use strict';

const { ArchiveDiscoveryStrategy } = require('../../../../src/core/crawler/services/ArchiveDiscoveryStrategy');

describe('ArchiveDiscoveryStrategy', () => {
  let strategy;
  let mockTelemetry;

  beforeEach(() => {
    mockTelemetry = {
      milestone: jest.fn()
    };
    strategy = new ArchiveDiscoveryStrategy({
      telemetry: mockTelemetry,
      discoveryIntervalMs: 1000 // Short cooldown for testing
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('shouldTrigger', () => {
    it('should trigger when queue is below threshold', () => {
      const result = strategy.shouldTrigger('example.com', 5);
      expect(result.shouldDiscover).toBe(true);
      expect(result.reason).toBe('queue-exhausted');
    });

    it('should not trigger when queue is above threshold', () => {
      const result = strategy.shouldTrigger('example.com', 50);
      expect(result.shouldDiscover).toBe(false);
      expect(result.reason).toBe('queue-sufficient');
    });

    it('should respect cooldown per domain', async () => {
      // First call should trigger
      expect(strategy.shouldTrigger('example.com', 5).shouldDiscover).toBe(true);
      
      // Perform a discovery to set the cooldown
      await strategy.discover('https://example.com', { 
        knownUrls: new Set(),
        enqueue: jest.fn()
      });
      
      // Now it should be on cooldown
      const result = strategy.shouldTrigger('example.com', 5);
      expect(result.shouldDiscover).toBe(false);
      expect(result.reason).toBe('cooldown');
    });

    it('should allow different domains independently', async () => {
      await strategy.discover('https://example.com', { 
        knownUrls: new Set(),
        enqueue: jest.fn()
      });
      
      // Different domain should still be allowed
      expect(strategy.shouldTrigger('other.com', 5).shouldDiscover).toBe(true);
    });

    it('should allow trigger after cooldown expires', async () => {
      await strategy.discover('https://example.com', { 
        knownUrls: new Set(),
        enqueue: jest.fn()
      });
      expect(strategy.shouldTrigger('example.com', 5).shouldDiscover).toBe(false);
      
      // Wait for cooldown
      await new Promise(resolve => setTimeout(resolve, 1100));
      expect(strategy.shouldTrigger('example.com', 5).shouldDiscover).toBe(true);
    });
  });

  describe('generateCandidates', () => {
    it('should generate standard archive paths', () => {
      const candidates = strategy.generateCandidates('https://example.com');
      
      const urls = candidates.map(c => c.url);
      expect(urls).toContain('https://example.com/archive');
      expect(urls).toContain('https://example.com/sitemap.xml');
    });

    it('should generate section archive paths', () => {
      const candidates = strategy.generateCandidates('https://example.com');
      
      const sectionCandidates = candidates.filter(c => c.type === 'archive-section');
      const urls = sectionCandidates.map(c => c.url);
      expect(urls).toContain('https://example.com/news/archive');
      expect(urls).toContain('https://example.com/blog/archive');
    });

    it('should generate date-based paths', () => {
      const now = new Date();
      const currentYear = now.getFullYear();
      
      const candidates = strategy.generateCandidates('https://example.com');
      
      const yearCandidates = candidates.filter(c => c.type === 'archive-year');
      const urls = yearCandidates.map(c => c.url);
      expect(urls).toContain(`https://example.com/${currentYear}/`);
    });

    it('should exclude known URLs', () => {
      const knownUrls = new Set(['https://example.com/archive']);
      const candidates = strategy.generateCandidates('https://example.com', {
        knownUrls
      });
      
      const archiveUrl = candidates.find(c => c.url === 'https://example.com/archive');
      expect(archiveUrl).toBeUndefined();
    });

    it('should generate custom section archives when sections provided', () => {
      const candidates = strategy.generateCandidates('https://example.com', {
        knownSections: ['/sports', '/politics']
      });
      
      const customSectionCandidates = candidates.filter(c => c.type === 'archive-custom-section');
      const urls = customSectionCandidates.map(c => c.url);
      expect(urls).toContain('https://example.com/sports/archive');
      expect(urls).toContain('https://example.com/politics/archive');
    });
  });

  describe('parseSitemap', () => {
    it('should parse XML sitemap URLs', () => {
      const xml = `
        <?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url><loc>https://example.com/page1</loc></url>
          <url><loc>https://example.com/page2</loc></url>
        </urlset>
      `;
      
      const result = strategy.parseSitemap(xml);
      expect(result.urls).toEqual([
        'https://example.com/page1',
        'https://example.com/page2'
      ]);
    });

    it('should identify nested sitemaps', () => {
      const xml = `
        <?xml version="1.0" encoding="UTF-8"?>
        <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <sitemap><loc>https://example.com/sitemap1.xml</loc></sitemap>
          <sitemap><loc>https://example.com/sitemap2.xml</loc></sitemap>
        </sitemapindex>
      `;
      
      const result = strategy.parseSitemap(xml);
      expect(result.nestedSitemaps).toEqual([
        'https://example.com/sitemap1.xml',
        'https://example.com/sitemap2.xml'
      ]);
    });

    it('should handle empty or invalid XML gracefully', () => {
      expect(strategy.parseSitemap('').urls).toEqual([]);
      expect(strategy.parseSitemap('not xml').urls).toEqual([]);
    });
  });

  describe('discover', () => {
    it('should return discovered URLs and statistics', async () => {
      const enqueueMock = jest.fn();
      const result = await strategy.discover('https://example.com', {
        knownUrls: new Set(),
        enqueue: enqueueMock
      });
      
      expect(result.discovered).toBeGreaterThan(0);
      expect(result.queued).toBeGreaterThan(0);
      expect(result.duplicates).toBe(0);
    });

    it('should skip already known URLs', async () => {
      const enqueueMock = jest.fn();
      const knownUrls = new Set(['https://example.com/archive', 'https://example.com/sitemap.xml']);
      
      const result = await strategy.discover('https://example.com', {
        knownUrls,
        enqueue: enqueueMock
      });
      
      // Should not enqueue URLs that are already known
      const enqueuedUrls = enqueueMock.mock.calls.map(call => call[0].url);
      expect(enqueuedUrls).not.toContain('https://example.com/archive');
      expect(enqueuedUrls).not.toContain('https://example.com/sitemap.xml');
    });

    it('should use checkExists function when provided', async () => {
      const checkExists = jest.fn().mockResolvedValue(false);
      const enqueueMock = jest.fn();
      
      await strategy.discover('https://example.com', {
        knownUrls: new Set(),
        checkExists,
        enqueue: enqueueMock
      });
      
      expect(checkExists).toHaveBeenCalled();
    });

    it('should emit discovery event', async () => {
      const handler = jest.fn();
      strategy.on('discovery', handler);
      
      await strategy.discover('https://example.com', {
        knownUrls: new Set(),
        enqueue: jest.fn()
      });
      
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        domain: 'example.com',
        discovered: expect.any(Number),
        queued: expect.any(Number)
      }));
    });

    it('should record telemetry milestone', async () => {
      await strategy.discover('https://example.com', {
        knownUrls: new Set(),
        enqueue: jest.fn()
      });
      
      expect(mockTelemetry.milestone).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'archive-discovery',
          details: expect.objectContaining({
            domain: 'example.com'
          })
        })
      );
    });

    it('should handle invalid URL gracefully', async () => {
      const result = await strategy.discover('not-a-valid-url', {
        knownUrls: new Set(),
        enqueue: jest.fn()
      });
      
      expect(result.error).toBe('invalid-url');
      expect(result.discovered).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return comprehensive statistics', async () => {
      await strategy.discover('https://example.com', {
        knownUrls: new Set(),
        enqueue: jest.fn()
      });
      
      const stats = strategy.getStats();
      
      expect(stats).toEqual(expect.objectContaining({
        discoveries: 1,
        urlsGenerated: expect.any(Number),
        urlsNew: expect.any(Number),
        urlsDuplicate: expect.any(Number)
      }));
    });
  });

  describe('getDomainStatus', () => {
    it('should return status for discovered domain', async () => {
      await strategy.discover('https://example.com', {
        knownUrls: new Set(),
        enqueue: jest.fn()
      });
      
      const status = strategy.getDomainStatus('example.com');
      
      expect(status.discovered).toBe(true);
      expect(status.lastDiscoveryAt).toBeGreaterThan(0);
      expect(status.elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it('should return not discovered for unknown domain', () => {
      const status = strategy.getDomainStatus('unknown.com');
      
      expect(status.discovered).toBe(false);
      expect(status.lastDiscoveryAt).toBeNull();
    });
  });

  describe('reset', () => {
    it('should clear all state', async () => {
      await strategy.discover('https://example.com', {
        knownUrls: new Set(),
        enqueue: jest.fn()
      });
      
      strategy.reset();
      
      const stats = strategy.getStats();
      expect(stats.discoveries).toBe(0);
      expect(stats.urlsGenerated).toBe(0);
      
      // Should be able to trigger again immediately
      expect(strategy.shouldTrigger('example.com', 5).shouldDiscover).toBe(true);
    });
  });

  describe('date pattern generation', () => {
    it('should generate current and previous year paths', () => {
      const now = new Date();
      const currentYear = now.getFullYear();
      const prevYear = currentYear - 1;
      
      const candidates = strategy.generateCandidates('https://example.com');
      
      const yearCandidates = candidates.filter(c => c.type === 'archive-year');
      const years = yearCandidates.map(c => c.url);
      
      expect(years).toContain(`https://example.com/${currentYear}/`);
      expect(years).toContain(`https://example.com/${prevYear}/`);
    });

    it('should generate month-based paths for current year', () => {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
      
      const candidates = strategy.generateCandidates('https://example.com');
      
      const monthCandidates = candidates.filter(c => c.type === 'archive-month');
      const months = monthCandidates.map(c => c.url);
      
      expect(months).toContain(`https://example.com/${currentYear}/${currentMonth}/`);
    });
  });
});

