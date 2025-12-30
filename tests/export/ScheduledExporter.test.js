'use strict';

/**
 * Tests for ScheduledExporter
 * 
 * Tests for the cron-based scheduled export functionality.
 */

const fs = require('fs');
const path = require('path');
const { ScheduledExporter, CronParser, loadExportConfig, DEFAULT_CONFIG } = require('../../src/export/ScheduledExporter');
const { ExportService } = require('../../src/export/ExportService');

// Mock articles
const mockArticles = [
  {
    id: 1,
    title: 'Test Article',
    url: 'https://example.com/article',
    host: 'example.com',
    published_at: '2025-01-15T10:00:00Z',
    fetched_at: '2025-01-15T12:00:00Z'
  }
];

// Create mock adapter
const createMockAdapter = () => ({
  exportArticles: jest.fn(() => mockArticles),
  exportArticlesBatch: jest.fn(() => mockArticles),
  exportDomains: jest.fn(() => [{ host: 'example.com', article_count: 100 }]),
  listDomains: jest.fn(() => ({ items: [{ host: 'example.com', article_count: 100 }] }))
});

describe('CronParser', () => {
  describe('parse', () => {
    it('should parse daily at 2am', () => {
      const schedule = CronParser.parse('0 2 * * *');
      expect(schedule.minute).toEqual([0]);
      expect(schedule.hour).toEqual([2]);
      expect(schedule.dayOfMonth).toBeNull();
      expect(schedule.month).toBeNull();
      expect(schedule.dayOfWeek).toBeNull();
    });

    it('should parse hourly', () => {
      const schedule = CronParser.parse('0 * * * *');
      expect(schedule.minute).toEqual([0]);
      expect(schedule.hour).toBeNull();
    });

    it('should parse step values', () => {
      const schedule = CronParser.parse('*/15 * * * *');
      expect(schedule.minute).toEqual([0, 15, 30, 45]);
    });

    it('should parse ranges', () => {
      const schedule = CronParser.parse('0 9-17 * * *');
      expect(schedule.hour).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    });

    it('should parse lists', () => {
      const schedule = CronParser.parse('0 9,12,18 * * *');
      expect(schedule.hour).toEqual([9, 12, 18]);
    });

    it('should parse weekdays', () => {
      const schedule = CronParser.parse('0 9 * * 1-5');
      expect(schedule.dayOfWeek).toEqual([1, 2, 3, 4, 5]);
    });

    it('should throw for invalid expression', () => {
      expect(() => CronParser.parse('invalid')).toThrow(/Invalid cron expression/);
      expect(() => CronParser.parse('0 0 0 0')).toThrow(); // Only 4 fields
    });
  });

  describe('matches', () => {
    it('should match exact time', () => {
      const schedule = CronParser.parse('30 14 * * *');
      const matchingDate = new Date('2025-01-15T14:30:00');
      const nonMatchingDate = new Date('2025-01-15T14:31:00');

      expect(CronParser.matches(schedule, matchingDate)).toBe(true);
      expect(CronParser.matches(schedule, nonMatchingDate)).toBe(false);
    });

    it('should match wildcard', () => {
      const schedule = CronParser.parse('0 * * * *');
      const date1 = new Date('2025-01-15T10:00:00');
      const date2 = new Date('2025-01-15T14:00:00');

      expect(CronParser.matches(schedule, date1)).toBe(true);
      expect(CronParser.matches(schedule, date2)).toBe(true);
    });

    it('should match day of week', () => {
      const schedule = CronParser.parse('0 9 * * 1'); // Monday at 9am
      const monday = new Date('2025-01-20T09:00:00'); // Monday
      const tuesday = new Date('2025-01-21T09:00:00'); // Tuesday

      expect(CronParser.matches(schedule, monday)).toBe(true);
      expect(CronParser.matches(schedule, tuesday)).toBe(false);
    });
  });

  describe('getNextRun', () => {
    it('should find next run time', () => {
      const schedule = CronParser.parse('0 2 * * *'); // Daily at 2am
      const from = new Date('2025-01-15T10:00:00');
      const next = CronParser.getNextRun(schedule, from);

      expect(next.getHours()).toBe(2);
      expect(next.getMinutes()).toBe(0);
      expect(next > from).toBe(true);
    });

    it('should find next hourly run', () => {
      const schedule = CronParser.parse('30 * * * *'); // Every hour at :30
      const from = new Date('2025-01-15T10:00:00');
      const next = CronParser.getNextRun(schedule, from);

      expect(next.getMinutes()).toBe(30);
    });
  });
});

describe('ScheduledExporter', () => {
  let exportService;
  let scheduler;
  let mockAdapter;
  // tests/export -> .. -> tests -> .. -> project root -> tmp/test-exports
  const testOutputDir = path.join(__dirname, '..', '..', 'tmp', 'test-exports');

  beforeEach(() => {
    mockAdapter = createMockAdapter();
    exportService = new ExportService({
      articlesAdapter: mockAdapter,
      domainsAdapter: mockAdapter,
      logger: { log: jest.fn(), error: jest.fn() }
    });

    scheduler = new ScheduledExporter({
      exportService,
      config: {
        enabled: false, // Don't actually start scheduler in tests
        schedule: '0 2 * * *',
        outputDir: testOutputDir,
        formats: ['json', 'jsonl'],
        types: ['articles', 'domains'],
        retentionDays: 7
      },
      logger: { log: jest.fn(), error: jest.fn() }
    });
  });

  afterEach(() => {
    scheduler.stop();
    // Cleanup test directory
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    it('should parse cron schedule', () => {
      expect(scheduler.schedule).toBeDefined();
      expect(scheduler.schedule.hour).toEqual([2]);
      expect(scheduler.schedule.minute).toEqual([0]);
    });

    it('should apply configuration', () => {
      expect(scheduler.config.formats).toEqual(['json', 'jsonl']);
      expect(scheduler.config.types).toEqual(['articles', 'domains']);
    });
  });

  describe('getStatus', () => {
    it('should return current status', () => {
      const status = scheduler.getStatus();

      expect(status.enabled).toBe(false);
      expect(status.running).toBe(false);
      expect(status.schedule).toBe('0 2 * * *');
      expect(status.formats).toEqual(['json', 'jsonl']);
    });
  });

  describe('getNextRun', () => {
    it('should calculate next run time', () => {
      const next = scheduler.getNextRun();

      expect(next).toBeInstanceOf(Date);
      expect(next.getHours()).toBe(2);
      expect(next.getMinutes()).toBe(0);
    });
  });

  describe('runExport', () => {
    it('should create export directory', async () => {
      const date = new Date('2025-01-15T10:00:00Z');
      await scheduler.runExport(date);

      const exportDir = path.join(testOutputDir, '2025-01-15');
      expect(fs.existsSync(exportDir)).toBe(true);
    });

    it('should create export files', async () => {
      const date = new Date('2025-01-15T10:00:00Z');
      const result = await scheduler.runExport(date);

      expect(result.exports.length).toBeGreaterThan(0);
      
      // Check JSON export exists
      const jsonExport = result.exports.find(e => e.type === 'articles' && e.format === 'json');
      expect(jsonExport).toBeDefined();
      expect(fs.existsSync(jsonExport.file)).toBe(true);
    });

    it('should create manifest', async () => {
      const date = new Date('2025-01-15T10:00:00Z');
      await scheduler.runExport(date);

      const manifestPath = path.join(testOutputDir, '2025-01-15', 'manifest.json');
      expect(fs.existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(manifest.exportedAt).toBeDefined();
      expect(manifest.exports).toBeInstanceOf(Array);
    });

    it('should update lastRun', async () => {
      const date = new Date('2025-01-15T10:00:00Z');
      await scheduler.runExport(date);

      expect(scheduler.lastRun).toEqual(date);
    });
  });

  describe('getHistory', () => {
    it('should return empty array for new directory', () => {
      const history = scheduler.getHistory();
      expect(history).toEqual([]);
    });

    it('should return export history', async () => {
      // Run two exports on different dates
      await scheduler.runExport(new Date('2025-01-15T10:00:00Z'));
      await scheduler.runExport(new Date('2025-01-16T10:00:00Z'));

      const history = scheduler.getHistory();

      expect(history.length).toBe(2);
      expect(history[0].date).toBe('2025-01-16'); // Most recent first
      expect(history[1].date).toBe('2025-01-15');
    });
  });

  describe('start/stop', () => {
    it('should not start when disabled', () => {
      scheduler.start();
      expect(scheduler.running).toBe(false);
    });

    it('should start when enabled', () => {
      scheduler.config.enabled = true;
      scheduler.start();
      expect(scheduler.running).toBe(true);
      scheduler.stop();
    });

    it('should stop cleanly', () => {
      scheduler.config.enabled = true;
      scheduler.start();
      scheduler.stop();
      expect(scheduler.running).toBe(false);
      expect(scheduler.timer).toBeNull();
    });
  });
});

describe('loadExportConfig', () => {
  it('should return default config for missing file', () => {
    const config = loadExportConfig('/nonexistent/path.json');
    expect(config).toEqual(DEFAULT_CONFIG);
  });
});
