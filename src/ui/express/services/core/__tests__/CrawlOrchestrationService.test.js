/**
 * Unit tests for CrawlOrchestrationService
 * 
 * These tests demonstrate service-level testing:
 * - No Express server required
 * - Easy to mock dependencies
 * - Fast execution
 * - Clear business logic validation
 */

const { CrawlOrchestrationService } = require('../CrawlOrchestrationService');
const { CrawlAlreadyRunningError, InvalidCrawlOptionsError } = require('../../errors/ServiceErrors');

describe('CrawlOrchestrationService', () => {
  let service;
  let mockDependencies;

  beforeEach(() => {
    // Create mock dependencies
    mockDependencies = {
      jobRegistry: {
        checkStartAllowed: jest.fn(),
        reserveJobId: jest.fn(),
        registerJob: jest.fn(),
        getJobs: jest.fn(() => new Map())
      },
      runner: {
        start: jest.fn()
      },
      buildArgs: jest.fn(),
      urlsDbPath: '/test/path/to/news.db',
      getDbRW: jest.fn(),
      recordJobStart: jest.fn(),
      eventHandler: {
        attachEventHandlers: jest.fn(),
        setupInitialBroadcast: jest.fn()
      },
      broadcastJobs: jest.fn(),
      QUIET: true // Suppress logs in tests
    };

    // Create service instance
    service = new CrawlOrchestrationService(mockDependencies);
  });

  describe('constructor', () => {
    it('should throw if jobRegistry is missing', () => {
      expect(() => {
        new CrawlOrchestrationService({ ...mockDependencies, jobRegistry: null });
      }).toThrow('CrawlOrchestrationService requires jobRegistry');
    });

    it('should throw if runner is missing', () => {
      expect(() => {
        new CrawlOrchestrationService({ ...mockDependencies, runner: null });
      }).toThrow('CrawlOrchestrationService requires runner with start() method');
    });

    it('should throw if buildArgs is missing', () => {
      expect(() => {
        new CrawlOrchestrationService({ ...mockDependencies, buildArgs: null });
      }).toThrow('CrawlOrchestrationService requires buildArgs function');
    });

    it('should construct successfully with all dependencies', () => {
      expect(service).toBeInstanceOf(CrawlOrchestrationService);
      expect(service.jobRegistry).toBe(mockDependencies.jobRegistry);
      expect(service.runner).toBe(mockDependencies.runner);
    });
  });

  describe('startCrawl', () => {
    beforeEach(() => {
      // Setup successful default mocks
      mockDependencies.jobRegistry.checkStartAllowed.mockReturnValue({ ok: true });
      mockDependencies.jobRegistry.reserveJobId.mockReturnValue('test-job-123');
      mockDependencies.buildArgs.mockReturnValue(['src/crawl.js', 'https://example.com']);
      mockDependencies.runner.start.mockReturnValue({
        pid: 12345,
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        stdin: { write: jest.fn() }
      });
      mockDependencies.getDbRW.mockReturnValue({
        run: jest.fn(),
        prepare: jest.fn()
      });
    });

    it('should start a crawl successfully', () => {
      const result = service.startCrawl({ url: 'https://example.com' });

      expect(result).toMatchObject({
        jobId: 'test-job-123',
        url: 'https://example.com',
        stage: 'preparing'
      });
      expect(result.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO timestamp
      expect(result.process).toBeDefined();
      expect(result.args).toEqual([
        'src/crawl.js',
        'https://example.com',
        '--db=/test/path/to/news.db',
        '--job-id=test-job-123'
      ]);
    });

    it('should throw CrawlAlreadyRunningError if crawler already running', () => {
      mockDependencies.jobRegistry.checkStartAllowed.mockReturnValue({
        ok: false,
        reason: 'Crawler already active'
      });

      expect(() => {
        service.startCrawl({ url: 'https://example.com' });
      }).toThrow(CrawlAlreadyRunningError);
    });

    it('should throw InvalidCrawlOptionsError if buildArgs returns empty', () => {
      mockDependencies.buildArgs.mockReturnValue([]);

      expect(() => {
        service.startCrawl({ url: 'https://example.com' });
      }).toThrow(InvalidCrawlOptionsError);
    });

    it('should enhance arguments with --db flag', () => {
      mockDependencies.buildArgs.mockReturnValue(['src/crawl.js', 'https://example.com']);

      service.startCrawl({ url: 'https://example.com' });

      const startArgs = mockDependencies.runner.start.mock.calls[0][0];
      expect(startArgs).toContain('--db=/test/path/to/news.db');
    });

    it('should enhance arguments with --job-id flag', () => {
      mockDependencies.buildArgs.mockReturnValue(['src/crawl.js', 'https://example.com']);

      service.startCrawl({ url: 'https://example.com' });

      const startArgs = mockDependencies.runner.start.mock.calls[0][0];
      expect(startArgs).toContain('--job-id=test-job-123');
    });

    it('should not duplicate --db flag if already present', () => {
      mockDependencies.buildArgs.mockReturnValue([
        'src/crawl.js',
        'https://example.com',
        '--db=/custom/path/db.db'
      ]);

      service.startCrawl({ url: 'https://example.com' });

      const startArgs = mockDependencies.runner.start.mock.calls[0][0];
      const dbFlags = startArgs.filter(arg => arg.startsWith('--db='));
      expect(dbFlags).toHaveLength(1);
      expect(dbFlags[0]).toBe('--db=/custom/path/db.db');
    });

    it('should register job in registry', () => {
      service.startCrawl({ url: 'https://example.com' });

      expect(mockDependencies.jobRegistry.registerJob).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-job-123',
          url: 'https://example.com',
          stage: 'preparing'
        })
      );
    });

    it('should record job start in database', () => {
      service.startCrawl({ url: 'https://example.com' });

      expect(mockDependencies.recordJobStart).toHaveBeenCalledWith(
        expect.anything(), // db
        expect.objectContaining({
          id: 'test-job-123',
          url: 'https://example.com'
        })
      );
    });

    it('should attach event handlers to job', () => {
      service.startCrawl({ url: 'https://example.com' });

      expect(mockDependencies.eventHandler.attachEventHandlers).toHaveBeenCalled();
      expect(mockDependencies.eventHandler.setupInitialBroadcast).toHaveBeenCalled();
    });

    it('should broadcast job list update', () => {
      service.startCrawl({ url: 'https://example.com' });

      expect(mockDependencies.broadcastJobs).toHaveBeenCalledWith(true);
    });

    it('should create job with initial metrics', () => {
      service.startCrawl({ url: 'https://example.com' });

      const registeredJob = mockDependencies.jobRegistry.registerJob.mock.calls[0][0];
      expect(registeredJob.metrics).toMatchObject({
        visited: 0,
        downloaded: 0,
        found: 0,
        saved: 0,
        errors: 0,
        queueSize: 0,
        running: 1,
        requestsPerSec: 0,
        downloadsPerSec: 0,
        stage: 'preparing',
        statusText: 'Preparing crawler…'
      });
    });

    it('should handle DB recording failure gracefully', () => {
      mockDependencies.recordJobStart.mockImplementation(() => {
        throw new Error('DB write failed');
      });

      // Should not throw - DB failure is logged but doesn't stop crawl
      expect(() => {
        service.startCrawl({ url: 'https://example.com' });
      }).not.toThrow();
    });

    it('should extract URL from arguments', () => {
      mockDependencies.buildArgs.mockReturnValue(['src/crawl.js', 'https://example.com']);

      const result = service.startCrawl({ url: 'https://example.com' });

      expect(result.url).toBe('https://example.com');
    });

    it('should handle missing URL gracefully', () => {
      mockDependencies.buildArgs.mockReturnValue(['src/crawl.js', '--depth=2']);

      const result = service.startCrawl({ depth: 2 });

      expect(result.url).toBeNull();
    });

    it('should pass options to buildArgs', () => {
      const options = {
        url: 'https://example.com',
        depth: 3,
        maxPages: 100
      };

      service.startCrawl(options);

      expect(mockDependencies.buildArgs).toHaveBeenCalledWith(options);
    });
  });

  describe('_enhanceArguments', () => {
    it('should add --db flag if missing', () => {
      const args = ['src/crawl.js', 'https://example.com'];
      const enhanced = service._enhanceArguments(args, 'job-123');

      expect(enhanced).toContain('--db=/test/path/to/news.db');
    });

    it('should add --job-id flag if missing', () => {
      const args = ['src/crawl.js', 'https://example.com'];
      const enhanced = service._enhanceArguments(args, 'job-123');

      expect(enhanced).toContain('--job-id=job-123');
    });

    it('should not add --db if already present', () => {
      const args = ['src/crawl.js', 'https://example.com', '--db=/other/path.db'];
      const enhanced = service._enhanceArguments(args, 'job-123');

      const dbFlags = enhanced.filter(arg => arg.startsWith('--db='));
      expect(dbFlags).toHaveLength(1);
    });

    it('should not modify original args array', () => {
      const args = ['src/crawl.js', 'https://example.com'];
      const original = [...args];
      
      service._enhanceArguments(args, 'job-123');

      expect(args).toEqual(original);
    });
  });

  describe('_extractUrl', () => {
    it('should extract HTTP URL from arguments', () => {
      const args = ['src/crawl.js', 'http://example.com'];
      const url = service._extractUrl(args);

      expect(url).toBe('http://example.com');
    });

    it('should extract HTTPS URL from arguments', () => {
      const args = ['src/crawl.js', 'https://example.com'];
      const url = service._extractUrl(args);

      expect(url).toBe('https://example.com');
    });

    it('should return null if no URL present', () => {
      const args = ['src/crawl.js', '--depth=2'];
      const url = service._extractUrl(args);

      expect(url).toBeNull();
    });

    it('should return null if args too short', () => {
      const args = ['src/crawl.js'];
      const url = service._extractUrl(args);

      expect(url).toBeNull();
    });
  });

  describe('_createJobDescriptor', () => {
    it('should create complete job descriptor', () => {
      const mockChild = {
        pid: 12345,
        stdin: { write: jest.fn() },
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() }
      };

      const job = service._createJobDescriptor({
        jobId: 'test-123',
        child: mockChild,
        args: ['src/crawl.js', 'https://example.com'],
        url: 'https://example.com'
      });

      expect(job).toMatchObject({
        id: 'test-123',
        child: mockChild,
        url: 'https://example.com',
        paused: false,
        stage: 'preparing'
      });
      expect(job.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(job.metrics).toBeDefined();
    });

    it('should handle child without stdin', () => {
      const mockChild = {
        pid: 12345,
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() }
      };

      const job = service._createJobDescriptor({
        jobId: 'test-123',
        child: mockChild,
        args: [],
        url: null
      });

      expect(job.stdin).toBeNull();
    });
  });

  describe('_createInitialMetrics', () => {
    it('should create metrics with zero counters', () => {
      const metrics = service._createInitialMetrics();

      expect(metrics).toMatchObject({
        visited: 0,
        downloaded: 0,
        found: 0,
        saved: 0,
        errors: 0,
        queueSize: 0,
        running: 1
      });
    });

    it('should include performance tracking fields', () => {
      const metrics = service._createInitialMetrics();

      expect(metrics).toHaveProperty('_lastSampleTime');
      expect(metrics).toHaveProperty('_lastVisited');
      expect(metrics).toHaveProperty('_lastDownloaded');
      expect(metrics).toHaveProperty('_lastProgressWall');
    });

    it('should include startup progress', () => {
      const metrics = service._createInitialMetrics();

      expect(metrics.startup).toMatchObject({
        summary: {
          label: 'Preparing crawler',
          progress: 0,
          done: false
        },
        stages: []
      });
    });
  });
});
