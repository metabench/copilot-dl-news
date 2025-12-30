'use strict';

/**
 * Tests for ExportService
 * 
 * Tests for the data export orchestration layer.
 */

const { ExportService } = require('../../src/export/ExportService');
const { JsonFormatter, JsonlFormatter } = require('../../src/export/formatters/JsonFormatter');
const { CsvFormatter } = require('../../src/export/formatters/CsvFormatter');
const { RssFormatter } = require('../../src/export/formatters/RssFormatter');
const { AtomFormatter } = require('../../src/export/formatters/AtomFormatter');

// Mock articles for testing
const mockArticles = [
  {
    id: 1,
    title: 'Test Article One',
    url: 'https://example.com/article-1',
    host: 'example.com',
    published_at: '2025-01-15T10:00:00Z',
    fetched_at: '2025-01-15T12:00:00Z',
    word_count: 500,
    category: 'Technology',
    body_text: 'This is the body text of article one. It contains multiple sentences for testing purposes.',
    byline: 'John Doe'
  },
  {
    id: 2,
    title: 'Test Article Two',
    url: 'https://example.com/article-2',
    host: 'example.com',
    published_at: '2025-01-16T10:00:00Z',
    fetched_at: '2025-01-16T12:00:00Z',
    word_count: 750,
    category: 'Science',
    body_text: 'Body text for article two with some content.',
    byline: 'Jane Smith'
  },
  {
    id: 3,
    title: 'Article with "Quotes" and, Commas',
    url: 'https://other.com/article-3',
    host: 'other.com',
    published_at: '2025-01-17T10:00:00Z',
    fetched_at: '2025-01-17T12:00:00Z',
    word_count: 300,
    category: 'Business',
    body_text: 'Text with special chars: "quotes", commas, and\nnewlines.',
    byline: 'Bob O\'Brien'
  }
];

// Mock domains
const mockDomains = [
  { host: 'example.com', article_count: 150, first_crawled: '2025-01-01T00:00:00Z', last_crawled: '2025-01-17T00:00:00Z' },
  { host: 'other.com', article_count: 50, first_crawled: '2025-01-05T00:00:00Z', last_crawled: '2025-01-17T00:00:00Z' }
];

// Create mock adapter
const createMockAdapter = (articles = mockArticles, domains = mockDomains) => ({
  exportArticles: jest.fn((options = {}) => {
    let result = [...articles];
    
    if (options.host) {
      result = result.filter(a => a.host === options.host);
    }
    if (options.since) {
      result = result.filter(a => a.published_at >= options.since);
    }
    if (options.until) {
      result = result.filter(a => a.published_at <= options.until);
    }
    if (options.limit) {
      result = result.slice(0, options.limit);
    }
    
    return result;
  }),
  exportArticlesBatch: jest.fn((options = {}) => {
    const { limit = 10, offset = 0 } = options;
    return articles.slice(offset, offset + limit);
  }),
  exportDomains: jest.fn((options = {}) => {
    let result = [...domains];
    if (options.limit) {
      result = result.slice(0, options.limit);
    }
    return result;
  }),
  listDomains: jest.fn((options = {}) => ({
    items: domains.slice(0, options.limit || 100)
  }))
});

describe('ExportService', () => {
  let exportService;
  let mockAdapter;

  beforeEach(() => {
    mockAdapter = createMockAdapter();
    exportService = new ExportService({
      articlesAdapter: mockAdapter,
      domainsAdapter: mockAdapter,
      logger: { log: jest.fn(), error: jest.fn() }
    });
  });

  describe('constructor', () => {
    it('should initialize with formatters', () => {
      expect(exportService.getSupportedFormats()).toContain('json');
      expect(exportService.getSupportedFormats()).toContain('jsonl');
      expect(exportService.getSupportedFormats()).toContain('csv');
      expect(exportService.getSupportedFormats()).toContain('rss');
      expect(exportService.getSupportedFormats()).toContain('atom');
    });

    it('should return correct content types', () => {
      expect(exportService.getContentType('json')).toBe('application/json; charset=utf-8');
      expect(exportService.getContentType('jsonl')).toBe('application/x-ndjson; charset=utf-8');
      expect(exportService.getContentType('csv')).toBe('text/csv; charset=utf-8');
      expect(exportService.getContentType('rss')).toBe('application/rss+xml; charset=utf-8');
      expect(exportService.getContentType('atom')).toBe('application/atom+xml; charset=utf-8');
    });
  });

  describe('exportArticles', () => {
    it('should export articles as JSON', () => {
      const result = exportService.exportArticles('json');
      const parsed = JSON.parse(result);

      expect(parsed.exported_at).toBeDefined();
      expect(parsed.count).toBe(3);
      expect(parsed.data).toHaveLength(3);
      expect(parsed.data[0].title).toBe('Test Article One');
    });

    it('should export articles as JSONL', () => {
      const result = exportService.exportArticles('jsonl');
      const lines = result.trim().split('\n');

      expect(lines).toHaveLength(3);
      lines.forEach(line => {
        expect(() => JSON.parse(line)).not.toThrow();
      });

      const first = JSON.parse(lines[0]);
      expect(first.title).toBe('Test Article One');
    });

    it('should export articles as CSV', () => {
      const result = exportService.exportArticles('csv');
      const lines = result.trim().split('\n');

      // First line is header
      expect(lines[0]).toContain('id');
      expect(lines[0]).toContain('title');

      // Should have 4 lines (1 header + 3 data)
      expect(lines).toHaveLength(4);
    });

    it('should export articles as RSS', () => {
      const result = exportService.exportArticles('rss');

      expect(result).toContain('<?xml version="1.0"');
      expect(result).toContain('<rss version="2.0"');
      expect(result).toContain('<channel>');
      expect(result).toContain('<item>');
      expect(result).toContain('<title>Test Article One</title>');
      expect(result).toContain('</rss>');
    });

    it('should export articles as Atom', () => {
      const result = exportService.exportArticles('atom');

      expect(result).toContain('<?xml version="1.0"');
      expect(result).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
      expect(result).toContain('<entry>');
      expect(result).toContain('<title>Test Article One</title>');
      expect(result).toContain('</feed>');
    });

    it('should filter by host', () => {
      exportService.exportArticles('json', { host: 'other.com' });

      expect(mockAdapter.exportArticles).toHaveBeenCalledWith(
        expect.objectContaining({ host: 'other.com' })
      );
    });

    it('should filter by date range', () => {
      exportService.exportArticles('json', {
        since: '2025-01-16T00:00:00Z',
        until: '2025-01-17T00:00:00Z'
      });

      expect(mockAdapter.exportArticles).toHaveBeenCalledWith(
        expect.objectContaining({
          since: '2025-01-16T00:00:00Z',
          until: '2025-01-17T00:00:00Z'
        })
      );
    });

    it('should respect limit', () => {
      exportService.exportArticles('json', { limit: 2 });

      expect(mockAdapter.exportArticles).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 2 })
      );
    });

    it('should throw for unsupported format', () => {
      expect(() => exportService.exportArticles('xml')).toThrow(/Unsupported format/);
    });
  });

  describe('exportDomains', () => {
    it('should export domains as JSON', () => {
      const result = exportService.exportDomains('json');
      const parsed = JSON.parse(result);

      expect(parsed.count).toBe(2);
      expect(parsed.data[0].host).toBe('example.com');
    });

    it('should export domains as CSV', () => {
      const result = exportService.exportDomains('csv');

      expect(result).toContain('host');
      expect(result).toContain('article_count');
      expect(result).toContain('example.com');
    });

    it('should throw for RSS/Atom formats', () => {
      expect(() => exportService.exportDomains('rss')).toThrow(/not supported/);
      expect(() => exportService.exportDomains('atom')).toThrow(/not supported/);
    });
  });

  describe('generateRssFeed', () => {
    it('should generate valid RSS feed', () => {
      const rss = exportService.generateRssFeed();

      expect(rss).toContain('<rss version="2.0"');
      expect(rss).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');
      expect(rss).toContain('<channel>');
      expect(rss).toContain('<title>News Feed</title>');
    });

    it('should filter by host', () => {
      exportService.generateRssFeed({ host: 'example.com' });

      expect(mockAdapter.exportArticles).toHaveBeenCalledWith(
        expect.objectContaining({ host: 'example.com' })
      );
    });
  });

  describe('generateAtomFeed', () => {
    it('should generate valid Atom feed', () => {
      const atom = exportService.generateAtomFeed();

      expect(atom).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
      expect(atom).toContain('<title>News Feed</title>');
      expect(atom).toContain('<entry>');
    });
  });

  describe('createExportStream', () => {
    it('should create JSONL stream', async () => {
      const stream = exportService.createExportStream('articles', 'jsonl', { limit: 2 });
      const chunks = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      const output = chunks.join('');
      const lines = output.trim().split('\n');

      expect(lines.length).toBeGreaterThan(0);
      expect(() => JSON.parse(lines[0])).not.toThrow();
    });

    it('should create CSV stream with headers', async () => {
      const stream = exportService.createExportStream('articles', 'csv', { limit: 2 });
      const chunks = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      const output = chunks.join('');
      expect(output).toContain('id');
      expect(output).toContain('title');
    });

    it('should throw for non-streaming formats', () => {
      expect(() => exportService.createExportStream('articles', 'json'))
        .toThrow(/Streaming only supported/);
    });
  });
});

describe('JsonFormatter', () => {
  const formatter = new JsonFormatter();

  it('should format array as JSON with metadata', () => {
    const result = formatter.format(mockArticles, { type: 'articles' });
    const parsed = JSON.parse(result);

    expect(parsed.exported_at).toBeDefined();
    expect(parsed.type).toBe('articles');
    expect(parsed.count).toBe(3);
    expect(parsed.data).toEqual(mockArticles);
  });
});

describe('JsonlFormatter', () => {
  const formatter = new JsonlFormatter();

  it('should format each item on separate line', () => {
    const result = formatter.format(mockArticles);
    const lines = result.trim().split('\n');

    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0])).toEqual(mockArticles[0]);
    expect(JSON.parse(lines[1])).toEqual(mockArticles[1]);
    expect(JSON.parse(lines[2])).toEqual(mockArticles[2]);
  });

  it('should format single item', () => {
    const result = formatter.formatLine(mockArticles[0]);
    expect(result).toBe(JSON.stringify(mockArticles[0]) + '\n');
  });
});

describe('CsvFormatter', () => {
  const formatter = new CsvFormatter();

  it('should escape quotes by doubling', () => {
    const escaped = formatter.escapeField('Test "quoted" text');
    expect(escaped).toBe('"Test ""quoted"" text"');
  });

  it('should escape commas', () => {
    const escaped = formatter.escapeField('one, two, three');
    expect(escaped).toBe('"one, two, three"');
  });

  it('should escape newlines', () => {
    const escaped = formatter.escapeField('line1\nline2');
    expect(escaped).toBe('"line1\nline2"');
  });

  it('should not escape simple values', () => {
    const escaped = formatter.escapeField('simple text');
    expect(escaped).toBe('simple text');
  });

  it('should handle null and undefined', () => {
    expect(formatter.escapeField(null)).toBe('');
    expect(formatter.escapeField(undefined)).toBe('');
  });

  it('should format CSV with headers', () => {
    const result = formatter.format(mockArticles, {
      type: 'articles',
      fields: ['id', 'title', 'host']
    });
    const lines = result.trim().split('\n');

    expect(lines[0]).toBe('id,title,host');
    expect(lines[1]).toBe('1,Test Article One,example.com');
    expect(lines[3]).toContain('"Article with ""Quotes"" and'); // Escaped quotes
  });
});

describe('RssFormatter', () => {
  const formatter = new RssFormatter({
    feedTitle: 'Test Feed',
    feedLink: 'https://test.com'
  });

  it('should generate valid RSS 2.0 structure', () => {
    const result = formatter.format(mockArticles);

    expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(result).toContain('<rss version="2.0"');
    expect(result).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');
    expect(result).toContain('<channel>');
    expect(result).toContain('<title>Test Feed</title>');
    expect(result).toContain('<link>https://test.com</link>');
  });

  it('should format items correctly', () => {
    const result = formatter.format(mockArticles);

    expect(result).toContain('<item>');
    expect(result).toContain('<title>Test Article One</title>');
    expect(result).toContain('<link>https://example.com/article-1</link>');
    expect(result).toContain('<guid isPermaLink="true">');
    expect(result).toContain('<pubDate>');
  });

  it('should escape XML special characters', () => {
    expect(formatter.escapeXml('<script>')).toBe('&lt;script&gt;');
    expect(formatter.escapeXml('&test')).toBe('&amp;test');
    expect(formatter.escapeXml('"quoted"')).toBe('&quot;quoted&quot;');
  });

  it('should format RFC 2822 dates', () => {
    const date = formatter.formatRfc2822Date('2025-01-15T10:00:00Z');
    expect(date).toContain('2025');
    expect(date).toContain('Jan');
  });

  it('should truncate long descriptions', () => {
    const longText = 'A'.repeat(600);
    const truncated = formatter.truncateDescription(longText, 500);

    expect(truncated.length).toBeLessThanOrEqual(503); // 500 + '...'
    expect(truncated).toContain('...');
  });
});

describe('AtomFormatter', () => {
  const formatter = new AtomFormatter({
    feedTitle: 'Test Feed',
    feedLink: 'https://test.com'
  });

  it('should generate valid Atom 1.0 structure', () => {
    const result = formatter.format(mockArticles);

    expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(result).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect(result).toContain('<title>Test Feed</title>');
    expect(result).toContain('<link href="https://test.com"');
  });

  it('should format entries correctly', () => {
    const result = formatter.format(mockArticles);

    expect(result).toContain('<entry>');
    expect(result).toContain('<title>Test Article One</title>');
    expect(result).toContain('<link href="https://example.com/article-1"/>');
    expect(result).toContain('<id>');
    expect(result).toContain('<updated>');
  });

  it('should generate valid URN UUIDs for feed ID', () => {
    const feedId = formatter.generateFeedId('https://test.com');
    expect(feedId).toMatch(/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('should format ISO 8601 dates', () => {
    const date = formatter.formatIso8601Date('2025-01-15T10:00:00Z');
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
