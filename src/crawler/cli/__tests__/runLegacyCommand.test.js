'use strict';

// Mock chalk to avoid ESM issues
jest.mock('chalk', () => {
  const identity = (text) => String(text);
  const colorFn = Object.assign(identity, { bold: identity });
  return colorFn;
});

// Mock NewsCrawler module
const mockCrawl = jest.fn().mockResolvedValue();
const mockLoadAndRunSequence = jest.fn().mockResolvedValue({
  sequenceStartUrl: 'https://example.com',
  metadata: { config: { startUrl: 'https://example.com' } }
});

jest.mock('../../NewsCrawler', () => {
  class MockNewsCrawler {
    constructor(startUrl, options) {
      this.startUrl = startUrl;
      this.options = options;
      this.dbPath = options?.dbPath || 'data/news.db';
      this.crawl = mockCrawl;
    }
  }
  MockNewsCrawler.loadAndRunSequence = mockLoadAndRunSequence;
  return MockNewsCrawler;
});

// Mock database module
jest.mock('../../../db/sqlite', () => ({
  ensureDatabase: jest.fn(() => ({
    db: {
      prepare: jest.fn(() => ({
        get: jest.fn(() => ({ city_count: 100 }))
      }))
    },
    close: jest.fn()
  }))
}));

// Mock CLI modules
jest.mock('../progressReporter', () => ({
  createCliLogger: jest.fn(() => ({
    info: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }))
}));

jest.mock('../bootstrap', () => ({
  setupLegacyCliEnvironment: jest.fn(() => ({
    verboseModeEnabled: false,
    restoreConsole: jest.fn()
  }))
}));

jest.mock('../argumentNormalizer', () => ({
  normalizeLegacyArguments: jest.fn((argv) => {
    const hasHelp = argv.includes('--help') || argv.includes('-h');
    if (hasHelp) {
      return {
        startUrl: 'https://www.theguardian.com',
        options: {}
      };
    }
    return {
      startUrl: argv.find(a => a.startsWith('http')) || 'https://www.theguardian.com',
      startUrlExplicit: argv.some(a => a.startsWith('http')),
      options: {},
      targetCountries: [],
      sequenceConfig: argv.includes('--sequence-config') ? { name: 'test-sequence' } : null
    };
  })
}));

const { runLegacyCommand, HELP_TEXT } = require('../runLegacyCommand');
const NewsCrawler = require('../../NewsCrawler');
const { createCliLogger } = require('../progressReporter');
const { setupLegacyCliEnvironment } = require('../bootstrap');
const { normalizeLegacyArguments } = require('../argumentNormalizer');

describe('runLegacyCommand.js', () => {
  let mockStdout, mockStderr;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStdout = jest.fn();
    mockStderr = jest.fn();
    mockCrawl.mockClear();
    mockLoadAndRunSequence.mockClear();
  });

  describe('HELP_TEXT', () => {
    it('exports comprehensive help text', () => {
      expect(HELP_TEXT).toBeTruthy();
      expect(HELP_TEXT).toContain('News Crawl CLI');
      expect(HELP_TEXT).toContain('Usage:');
      expect(HELP_TEXT).toContain('Core modes:');
      expect(HELP_TEXT).toContain('--crawl-type');
      expect(HELP_TEXT).toContain('Examples:');
    });

    it('documents all major flag categories', () => {
      expect(HELP_TEXT).toContain('Primary options:');
      expect(HELP_TEXT).toContain('Database controls:');
      expect(HELP_TEXT).toContain('Planner & hub discovery:');
      expect(HELP_TEXT).toContain('Geography & gazetteer helpers:');
      expect(HELP_TEXT).toContain('Miscellaneous:');
    });

    it('includes sequence configuration flags', () => {
      expect(HELP_TEXT).toContain('--sequence-config');
      expect(HELP_TEXT).toContain('--config-host');
      expect(HELP_TEXT).toContain('--shared-overrides');
      expect(HELP_TEXT).toContain('--step-overrides');
    });
  });

  describe('runLegacyCommand', () => {
    it('displays help text when --help flag is present', async () => {
      const result = await runLegacyCommand({
        argv: ['--help'],
        stdout: mockStdout,
        stderr: mockStderr
      });

      expect(mockStdout).toHaveBeenCalledWith(HELP_TEXT);
      expect(result.exitCode).toBe(0);
      expect(setupLegacyCliEnvironment).not.toHaveBeenCalled();
    });

    it('displays help text when -h flag is present', async () => {
      const result = await runLegacyCommand({
        argv: ['-h'],
        stdout: mockStdout,
        stderr: mockStderr
      });

      expect(mockStdout).toHaveBeenCalledWith(HELP_TEXT);
      expect(result.exitCode).toBe(0);
    });

    it('sets up CLI environment before processing', async () => {
      await runLegacyCommand({
        argv: ['https://example.com'],
        stdout: mockStdout,
        stderr: mockStderr
      });

      expect(setupLegacyCliEnvironment).toHaveBeenCalledWith({
        args: ['https://example.com'],
        log: expect.objectContaining({
          info: expect.any(Function),
          success: expect.any(Function),
          error: expect.any(Function)
        })
      });
    });

    it('normalizes arguments via argumentNormalizer', async () => {
      await runLegacyCommand({
        argv: ['https://example.com', '--max-pages=10'],
        stdout: mockStdout,
        stderr: mockStderr
      });

      expect(normalizeLegacyArguments).toHaveBeenCalledWith(
        ['https://example.com', '--max-pages=10'],
        expect.objectContaining({ log: expect.any(Object) })
      );
    });

    it('creates CLI logger with provided stdout/stderr', async () => {
      await runLegacyCommand({
        argv: ['https://example.com'],
        stdout: mockStdout,
        stderr: mockStderr
      });

      expect(createCliLogger).toHaveBeenCalledWith({
        stdout: mockStdout,
        stderr: mockStderr
      });
    });

    it('handles normalization errors gracefully', async () => {
      normalizeLegacyArguments.mockImplementationOnce(() => {
        throw new Error('Invalid argument format');
      });

      const mockRestore = jest.fn();
      setupLegacyCliEnvironment.mockReturnValueOnce({
        verboseModeEnabled: false,
        restoreConsole: mockRestore
      });

      const result = await runLegacyCommand({
        argv: ['--invalid-flag'],
        stdout: mockStdout,
        stderr: mockStderr
      });

      expect(result.exitCode).toBe(1);
      expect(result.error).toBeDefined();
      expect(mockRestore).toHaveBeenCalled();
    });

    it('restores console on normalization failure', async () => {
      const mockRestore = jest.fn();
      setupLegacyCliEnvironment.mockReturnValueOnce({
        verboseModeEnabled: false,
        restoreConsole: mockRestore
      });

      normalizeLegacyArguments.mockImplementationOnce(() => {
        throw new Error('Test error');
      });

      await runLegacyCommand({
        argv: ['--bad-flag'],
        stdout: mockStdout,
        stderr: mockStderr
      });

      expect(mockRestore).toHaveBeenCalled();
    });

    it('instantiates NewsCrawler with normalized arguments', async () => {
      normalizeLegacyArguments.mockReturnValueOnce({
        startUrl: 'https://news.example.com',
        options: { maxPages: 50, crawlType: 'intelligent' },
        targetCountries: [],
        sequenceConfig: null
      });

      await runLegacyCommand({
        argv: ['https://news.example.com', '--max-pages=50'],
        stdout: mockStdout,
        stderr: mockStderr
      });

      // Verify crawl was called (NewsCrawler was instantiated)
      expect(mockCrawl).toHaveBeenCalled();
    });

    it('calls crawler.crawl() for standard crawls', async () => {
      normalizeLegacyArguments.mockReturnValueOnce({
        startUrl: 'https://example.com',
        options: {},
        targetCountries: [],
        sequenceConfig: null
      });

      mockCrawl.mockResolvedValueOnce();

      const result = await runLegacyCommand({
        argv: ['https://example.com'],
        stdout: mockStdout,
        stderr: mockStderr
      });

      expect(mockCrawl).toHaveBeenCalled();
      expect(result.exitCode).toBe(0);
    });

    it('logs success message after successful crawl', async () => {
      const mockLog = {
        info: jest.fn(),
        success: jest.fn(),
        error: jest.fn()
      };
      createCliLogger.mockReturnValueOnce(mockLog);

      normalizeLegacyArguments.mockReturnValueOnce({
        startUrl: 'https://example.com',
        options: {},
        targetCountries: [],
        sequenceConfig: null
      });

      await runLegacyCommand({
        argv: ['https://example.com'],
        stdout: mockStdout,
        stderr: mockStderr
      });

      expect(mockLog.success).toHaveBeenCalledWith('Crawler finished');
    });

    it('handles crawler failure gracefully', async () => {
      const mockLog = {
        info: jest.fn(),
        success: jest.fn(),
        error: jest.fn()
      };
      createCliLogger.mockReturnValueOnce(mockLog);

      const mockRestore = jest.fn();
      setupLegacyCliEnvironment.mockReturnValueOnce({
        verboseModeEnabled: false,
        restoreConsole: mockRestore
      });

      normalizeLegacyArguments.mockReturnValueOnce({
        startUrl: 'https://example.com',
        options: {},
        targetCountries: [],
        sequenceConfig: null
      });

      const crawlError = new Error('Network timeout');
      mockCrawl.mockRejectedValueOnce(crawlError);

      const result = await runLegacyCommand({
        argv: ['https://example.com'],
        stdout: mockStdout,
        stderr: mockStderr
      });

      expect(result.exitCode).toBe(1);
      expect(result.error).toBe(crawlError);
      expect(mockLog.error).toHaveBeenCalledWith('Crawler failed: Network timeout');
      expect(mockRestore).toHaveBeenCalled();
    });

    it('restores console on crawler failure', async () => {
      const mockRestore = jest.fn();
      setupLegacyCliEnvironment.mockReturnValueOnce({
        verboseModeEnabled: false,
        restoreConsole: mockRestore
      });

      normalizeLegacyArguments.mockReturnValueOnce({
        startUrl: 'https://example.com',
        options: {},
        targetCountries: [],
        sequenceConfig: null
      });

      mockCrawl.mockRejectedValueOnce(new Error('Test failure'));

      await runLegacyCommand({
        argv: ['https://example.com'],
        stdout: mockStdout,
        stderr: mockStderr
      });

      expect(mockRestore).toHaveBeenCalled();
    });

    it('calls loadAndRunSequence when sequence-config is present', async () => {
      const mockLog = {
        info: jest.fn(),
        success: jest.fn(),
        error: jest.fn()
      };
      createCliLogger.mockReturnValueOnce(mockLog);

      normalizeLegacyArguments.mockReturnValueOnce({
        startUrl: 'https://example.com',
        startUrlExplicit: true,
        options: {},
        targetCountries: [],
        sequenceConfig: {
          name: 'evening-sequence',
          configHost: 'uk',
          sharedOverrides: { slowMode: true }
        }
      });

      mockLoadAndRunSequence.mockResolvedValueOnce({
        sequenceStartUrl: 'https://news.example.com',
        metadata: { config: { startUrl: 'https://news.example.com' } },
        result: {}
      });

      const result = await runLegacyCommand({
        argv: ['--sequence-config', 'evening-sequence'],
        stdout: mockStdout,
        stderr: mockStderr
      });

      expect(mockLoadAndRunSequence).toHaveBeenCalled();
      const callArgs = mockLoadAndRunSequence.mock.calls[0][0];
      expect(callArgs.sequenceConfigName).toBe('evening-sequence');
      expect(callArgs.configHost).toBe('uk');
      expect(callArgs.sharedOverrides).toEqual({ slowMode: true });
      expect(callArgs.startUrl).toBe('https://example.com');
      expect(callArgs.logger).toBe(mockLog);
      expect(result.exitCode).toBe(0);
    });

    it('logs sequence completion success', async () => {
      const mockLog = {
        info: jest.fn(),
        success: jest.fn(),
        error: jest.fn()
      };
      createCliLogger.mockReturnValueOnce(mockLog);

      normalizeLegacyArguments.mockReturnValueOnce({
        startUrl: 'https://example.com',
        options: {},
        targetCountries: [],
        sequenceConfig: { name: 'test-sequence' }
      });

      mockLoadAndRunSequence.mockResolvedValueOnce({
        sequenceStartUrl: 'https://example.com',
        metadata: {},
        result: {}
      });

      await runLegacyCommand({
        argv: ['--sequence-config', 'test-sequence'],
        stdout: mockStdout,
        stderr: mockStderr
      });

      expect(mockLog.success).toHaveBeenCalledWith('Sequence completed');
    });

    it('handles sequence execution failure', async () => {
      const mockLog = {
        info: jest.fn(),
        success: jest.fn(),
        error: jest.fn()
      };
      createCliLogger.mockReturnValueOnce(mockLog);

      const mockRestore = jest.fn();
      setupLegacyCliEnvironment.mockReturnValueOnce({
        verboseModeEnabled: false,
        restoreConsole: mockRestore
      });

      normalizeLegacyArguments.mockReturnValueOnce({
        startUrl: 'https://example.com',
        options: {},
        targetCountries: [],
        sequenceConfig: { name: 'bad-sequence' }
      });

      const sequenceError = new Error('Sequence step failed');
      mockLoadAndRunSequence.mockRejectedValueOnce(sequenceError);

      const result = await runLegacyCommand({
        argv: ['--sequence-config', 'bad-sequence'],
        stdout: mockStdout,
        stderr: mockStderr
      });

      expect(result.exitCode).toBe(1);
      expect(result.error).toBe(sequenceError);
      expect(mockLog.error).toHaveBeenCalledWith('Sequence step failed');
      expect(mockRestore).toHaveBeenCalled();
    });

    it('defaults argv to empty array when not provided', async () => {
      normalizeLegacyArguments.mockReturnValueOnce({
        startUrl: 'https://www.theguardian.com',
        options: {},
        targetCountries: [],
        sequenceConfig: null
      });

      await runLegacyCommand({
        stdout: mockStdout,
        stderr: mockStderr
      });

      expect(normalizeLegacyArguments).toHaveBeenCalledWith(
        [],
        expect.any(Object)
      );
    });

    it('uses default stdout/stderr when not provided', async () => {
      normalizeLegacyArguments.mockReturnValueOnce({
        startUrl: 'https://www.theguardian.com',
        options: {},
        targetCountries: [],
        sequenceConfig: null
      });

      await runLegacyCommand({ argv: ['--help'] });

      expect(createCliLogger).toHaveBeenCalled();
    });
  });
});
