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
const mockCreateCrawler = jest.fn();

jest.mock('../../NewsCrawler', () => {
  class MockNewsCrawler {
    constructor(startUrl, options) {
      this.startUrl = startUrl;
      this.options = options;
      this.dbPath = options?.dbPath || 'data/news.db';
      this.crawl = mockCrawl;
      // Track constructor calls for test assertions
      mockCreateCrawler({ startUrl, ...options });
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

const mockPauseControls = {
  attach: jest.fn(() => false),
  teardown: jest.fn(),
  isAttached: jest.fn(() => false)
};

jest.mock('../pauseControls', () => {
  const createPauseResumeControls = jest.fn(() => mockPauseControls);
  createPauseResumeControls.__mockControls = mockPauseControls;
  return { createPauseResumeControls };
});

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
        options: {},
        interactiveControls: { enabled: false, explicit: false }
      };
    }
    const options = {};
    if (argv.includes('--verbose')) {
      options.verbose = true;
    }
    return {
      startUrl: argv.find(a => a.startsWith('http')) || 'https://www.theguardian.com',
      startUrlExplicit: argv.some(a => a.startsWith('http')),
      options,
      targetCountries: [],
      sequenceConfig: argv.includes('--sequence-config') ? { name: 'test-sequence' } : null,
      interactiveControls: { enabled: true, explicit: false }
    };
  })
}));

const { runLegacyCommand, HELP_TEXT } = require('../runLegacyCommand');
const { createCliLogger } = require('../progressReporter');
const { createPauseResumeControls } = require('../pauseControls');
const { setupLegacyCliEnvironment } = require('../bootstrap');
const { normalizeLegacyArguments } = require('../argumentNormalizer');

describe('runLegacyCommand.js', () => {
  let mockStdout, mockStderr;
  let invokeLegacyCommand;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStdout = jest.fn();
    mockStderr = jest.fn();
    mockCrawl.mockClear();
    mockLoadAndRunSequence.mockClear();
    mockCreateCrawler.mockReset();
    mockCreateCrawler.mockImplementation((config = {}) => ({
      crawl: mockCrawl,
      dbPath: config?.dbPath || 'data/news.db',
      config
    }));
    mockPauseControls.attach.mockReset();
    mockPauseControls.teardown.mockReset();
    mockPauseControls.isAttached.mockReset();
    mockPauseControls.attach.mockImplementation(() => true);
    mockPauseControls.teardown.mockImplementation(() => undefined);
    mockPauseControls.isAttached.mockImplementation(() => true);
    createPauseResumeControls.mockClear();

    invokeLegacyCommand = (overrides = {}) => runLegacyCommand({
      stdin: null,
      stdout: mockStdout,
      stderr: mockStderr,
      ...overrides
    });
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
      await invokeLegacyCommand({
        argv: ['https://example.com']
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
      await invokeLegacyCommand({
        argv: ['https://example.com', '--max-pages=10']
      });

      expect(normalizeLegacyArguments).toHaveBeenCalledWith(
        ['https://example.com', '--max-pages=10'],
        expect.objectContaining({ log: expect.any(Object) })
      );
    });

    it('creates CLI logger with provided stdout/stderr', async () => {
      await invokeLegacyCommand({
        argv: ['https://example.com']
      });

      expect(createCliLogger).toHaveBeenCalledWith({
        stdout: mockStdout,
        stderr: mockStderr
      });
    });

    it('emits debug log when config metadata is provided in verbose mode', async () => {
      await runLegacyCommand({
        argv: ['https://example.com', '--verbose'],
        stdout: mockStdout,
        stderr: mockStderr,
        cliMetadata: {
          origin: 'config',
          configPath: 'C:/configs/crawl.js.config.json'
        }
      });

      const loggerInstance = createCliLogger.mock.results[0].value;
      expect(loggerInstance.debug).toHaveBeenCalledWith(expect.stringContaining('crawl.js.config.json'));
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

      const result = await invokeLegacyCommand({
        argv: ['--invalid-flag']
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

      await invokeLegacyCommand({
        argv: ['--bad-flag']
      });

      expect(mockRestore).toHaveBeenCalled();
    });

    it('creates crawler through NewsCrawler constructor with normalized arguments', async () => {
      normalizeLegacyArguments.mockReturnValueOnce({
        startUrl: 'https://news.example.com',
        options: { maxPages: 50, crawlType: 'intelligent' },
        targetCountries: [],
        sequenceConfig: null,
        interactiveControls: { enabled: true, explicit: false }
      });

      await invokeLegacyCommand({
        argv: ['https://news.example.com', '--max-pages=50']
      });

      expect(mockCreateCrawler).toHaveBeenCalledWith({
        maxPages: 50,
        crawlType: 'intelligent',
        startUrl: 'https://news.example.com'
      });
      expect(mockCrawl).toHaveBeenCalled();
    });

    it('calls crawler.crawl() for standard crawls', async () => {
      normalizeLegacyArguments.mockReturnValueOnce({
        startUrl: 'https://example.com',
        options: {},
        targetCountries: [],
        sequenceConfig: null,
        interactiveControls: { enabled: true, explicit: false }
      });

      mockCrawl.mockResolvedValueOnce();

      const result = await invokeLegacyCommand({
        argv: ['https://example.com']
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
        sequenceConfig: null,
        interactiveControls: { enabled: true, explicit: false }
      });

      await invokeLegacyCommand({
        argv: ['https://example.com']
      });

      expect(mockLog.success).toHaveBeenCalledWith('Crawler finished');
    });

    it('attaches pause controls when interactive controls are enabled', async () => {
      const fakeStdin = { on: jest.fn(), isTTY: true };

      normalizeLegacyArguments.mockReturnValueOnce({
        startUrl: 'https://example.com',
        options: {},
        targetCountries: [],
        sequenceConfig: null,
        interactiveControls: { enabled: true, explicit: false }
      });

      await invokeLegacyCommand({
        argv: ['https://example.com'],
        stdin: fakeStdin
      });

      expect(createPauseResumeControls).toHaveBeenCalledTimes(1);
      const pauseArgs = createPauseResumeControls.mock.calls[0][0];
      expect(pauseArgs.stdin).toBe(fakeStdin);
      // Verify crawler was passed (it's a MockNewsCrawler instance)
      expect(pauseArgs.crawler).toBeDefined();
      expect(pauseArgs.crawler.startUrl).toBe('https://example.com');
      expect(pauseArgs.crawler.crawl).toBe(mockCrawl);
      expect(pauseArgs.logger).toBeTruthy();

      expect(mockPauseControls.attach).toHaveBeenCalledWith({
        enabled: true,
        explicit: false
      });
      expect(mockPauseControls.teardown).toHaveBeenCalledTimes(1);
    });

    it('disables pause controls when interactive controls are turned off explicitly', async () => {
      const fakeStdin = { on: jest.fn(), isTTY: true };
      mockPauseControls.attach.mockImplementation(() => false);

      normalizeLegacyArguments.mockReturnValueOnce({
        startUrl: 'https://example.com',
        options: {},
        targetCountries: [],
        sequenceConfig: null,
        interactiveControls: { enabled: false, explicit: true }
      });

      await invokeLegacyCommand({
        argv: ['https://example.com', '--no-interactive-controls'],
        stdin: fakeStdin
      });

      expect(createPauseResumeControls).toHaveBeenCalledTimes(1);
      expect(mockPauseControls.attach).toHaveBeenCalledWith({
        enabled: false,
        explicit: true
      });
      expect(mockPauseControls.teardown).toHaveBeenCalledTimes(1);
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
        sequenceConfig: null,
        interactiveControls: { enabled: true, explicit: false }
      });

      const crawlError = new Error('Network timeout');
      mockCrawl.mockRejectedValueOnce(crawlError);

      const result = await invokeLegacyCommand({
        argv: ['https://example.com']
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
        sequenceConfig: null,
        interactiveControls: { enabled: true, explicit: false }
      });

      mockCrawl.mockRejectedValueOnce(new Error('Test failure'));

      await invokeLegacyCommand({
        argv: ['https://example.com']
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
        },
        interactiveControls: { enabled: true, explicit: false }
      });

      mockLoadAndRunSequence.mockResolvedValueOnce({
        sequenceStartUrl: 'https://news.example.com',
        metadata: { config: { startUrl: 'https://news.example.com' } },
        result: {}
      });

      const result = await invokeLegacyCommand({
        argv: ['--sequence-config', 'evening-sequence']
      });

      expect(mockLoadAndRunSequence).toHaveBeenCalled();
      const callArgs = mockLoadAndRunSequence.mock.calls[0][0];
      expect(callArgs.sequenceConfigName).toBe('evening-sequence');
      expect(callArgs.configHost).toBe('uk');
      expect(callArgs.sharedOverrides).toEqual({ slowMode: true });
      expect(callArgs.startUrl).toBe('https://example.com');
      expect(callArgs.logger).toBe(mockLog);
      expect(result.exitCode).toBe(0);
      expect(createPauseResumeControls).not.toHaveBeenCalled();
      expect(mockPauseControls.attach).not.toHaveBeenCalled();
      expect(mockPauseControls.teardown).not.toHaveBeenCalled();
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
        sequenceConfig: { name: 'test-sequence' },
        interactiveControls: { enabled: true, explicit: false }
      });

      mockLoadAndRunSequence.mockResolvedValueOnce({
        sequenceStartUrl: 'https://example.com',
        metadata: {},
        result: {}
      });

      await invokeLegacyCommand({
        argv: ['--sequence-config', 'test-sequence']
      });

      expect(mockLog.success).toHaveBeenCalledWith('Sequence completed');
      expect(createPauseResumeControls).not.toHaveBeenCalled();
      expect(mockPauseControls.attach).not.toHaveBeenCalled();
      expect(mockPauseControls.teardown).not.toHaveBeenCalled();
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
        sequenceConfig: { name: 'bad-sequence' },
        interactiveControls: { enabled: true, explicit: false }
      });

      const sequenceError = new Error('Sequence step failed');
      mockLoadAndRunSequence.mockRejectedValueOnce(sequenceError);

      const result = await invokeLegacyCommand({
        argv: ['--sequence-config', 'bad-sequence']
      });

      expect(result.exitCode).toBe(1);
      expect(result.error).toBe(sequenceError);
      expect(mockLog.error).toHaveBeenCalledWith('Sequence step failed');
      expect(mockRestore).toHaveBeenCalled();
      expect(createPauseResumeControls).not.toHaveBeenCalled();
      expect(mockPauseControls.attach).not.toHaveBeenCalled();
      expect(mockPauseControls.teardown).not.toHaveBeenCalled();
    });

    it('defaults argv to empty array when not provided', async () => {
      normalizeLegacyArguments.mockReturnValueOnce({
        startUrl: 'https://www.theguardian.com',
        options: {},
        targetCountries: [],
        sequenceConfig: null,
        interactiveControls: { enabled: true, explicit: false }
      });

      await invokeLegacyCommand();

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
        sequenceConfig: null,
        interactiveControls: { enabled: true, explicit: false }
      });

      await runLegacyCommand({ argv: ['--help'], stdin: null });

      expect(createCliLogger).toHaveBeenCalled();
    });
  });
});
