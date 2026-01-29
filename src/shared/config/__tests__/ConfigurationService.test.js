'use strict';

const path = require('path');
const { ConfigurationService, CliContext } = require('../ConfigurationService');

// Mock filesystem for isolated tests
function createMockFs(files = {}) {
  // Normalize paths to be resilient across platforms (Windows drive letters, separators)
  const normalizePath = (p) => path.normalize(p).replace(/^[A-Z]:/i, '').replace(/\\/g, '/');
  const normalizedEntries = Object.entries(files).reduce((acc, [key, value]) => {
    acc[normalizePath(key)] = value;
    return acc;
  }, {});

  return {
    existsSync: (filePath) => {
      const normalizedPath = normalizePath(filePath);
      return Object.prototype.hasOwnProperty.call(normalizedEntries, normalizedPath);
    },
    readFileSync: (filePath) => {
      const normalizedPath = normalizePath(filePath);
      if (Object.prototype.hasOwnProperty.call(normalizedEntries, normalizedPath)) {
        return normalizedEntries[normalizedPath];
      }
      const error = new Error(`ENOENT: no such file or directory, open '${filePath}'`);
      error.code = 'ENOENT';
      throw error;
    }
  };
}

describe('ConfigurationService', () => {
  describe('createContext', () => {
    it('parses a simple command with no flags', () => {
      const mockFs = createMockFs({});
      const service = new ConfigurationService({ cwd: '/test', fsImpl: mockFs });
      const context = service.createContext(['availability']);

      expect(context.getCommand()).toBe('availability');
      expect(context.getPositional(0)).toBe(null);
    });

    it('parses command with positional arguments', () => {
      const mockFs = createMockFs({});
      const service = new ConfigurationService({ cwd: '/test', fsImpl: mockFs });
      const context = service.createContext(['run-operation', 'basicArticleCrawl', 'https://example.com']);

      expect(context.getCommand()).toBe('run-operation');
      expect(context.getPositional(0)).toBe('basicArticleCrawl');
      expect(context.getPositional(1)).toBe('https://example.com');
      expect(context.getPositional(2)).toBe(null);
    });

    it('parses flags with values', () => {
      const mockFs = createMockFs({});
      const service = new ConfigurationService({ cwd: '/test', fsImpl: mockFs });
      const context = service.createContext([
        'run-sequence',
        'test-sequence',
        'https://example.com',
        '--max-downloads', '100',
        '--output-verbosity', 'terse'
      ]);

      expect(context.getCommand()).toBe('run-sequence');
      expect(context.getFlag('--max-downloads')).toBe(100);
      expect(context.getFlag('--output-verbosity')).toBe('terse');
      expect(context.getIntegerFlag('--max-downloads')).toBe(100);
    });

    it('parses boolean flags without values', () => {
      const mockFs = createMockFs({});
      const service = new ConfigurationService({ cwd: '/test', fsImpl: mockFs });
      const context = service.createContext([
        'run-sequence',
        'test-sequence',
        'https://example.com',
        '--continue-on-error',
        '--json'
      ]);

      expect(context.hasFlag('--continue-on-error')).toBe(true);
      expect(context.hasFlag('--json')).toBe(true);
      expect(context.hasFlag('--verbose')).toBe(false);
    });

    it('parses JSON flags', () => {
      const mockFs = createMockFs({});
      const service = new ConfigurationService({ cwd: '/test', fsImpl: mockFs });
      const overrides = { maxDownloads: 50, concurrency: 4 };
      const context = service.createContext([
        'run-operation',
        'testOp',
        'https://example.com',
        '--overrides', JSON.stringify(overrides)
      ]);

      expect(context.getJsonFlag('--overrides')).toEqual(overrides);
    });

    it('handles --limit as alias for --max-downloads', () => {
      const mockFs = createMockFs({});
      const service = new ConfigurationService({ cwd: '/test', fsImpl: mockFs });
      const context = service.createContext([
        'run-sequence',
        'test',
        'https://example.com',
        '--limit', '200'
      ]);

      expect(context.getIntegerFlag('--max-downloads')).toBe(200);
      expect(context.getIntegerFlag('--limit')).toBe(200);
    });
  });

  describe('config file loading', () => {
    it('loads config.json when present', () => {
      const configContent = JSON.stringify({
        crawlDefaults: {
          startUrl: 'https://test-site.com',
          maxDownloads: 500,
          concurrency: 3
        }
      });
      const mockFs = createMockFs({
        '/test/config.json': configContent
      });
      const service = new ConfigurationService({ cwd: '/test', fsImpl: mockFs });
      const context = service.createContext([]);

      const defaultRunConfig = context.getDefaultRunConfig();
      expect(defaultRunConfig.startUrl).toBe('https://test-site.com');
      expect(defaultRunConfig.sharedOverrides.maxDownloads).toBe(500);
      expect(defaultRunConfig.sharedOverrides.concurrency).toBe(3);
    });

    it('loads runner config from config/crawl-runner.json', () => {
      const runnerContent = JSON.stringify({
        sequence: 'fullCountryHubDiscovery',
        startUrl: 'https://runner-site.com',
        sharedOverrides: {
          maxDownloads: 1000
        }
      });
      const mockFs = createMockFs({
        '/test/config/crawl-runner.json': runnerContent
      });
      const service = new ConfigurationService({ cwd: '/test', fsImpl: mockFs });
      const context = service.createContext([]);

      const runnerConfig = context.getRunnerConfig();
      expect(runnerConfig).not.toBeNull();
      expect(runnerConfig.config.sequence).toBe('fullCountryHubDiscovery');
      expect(runnerConfig.config.startUrl).toBe('https://runner-site.com');
    });

    it('CLI flags override config file values', () => {
      const configContent = JSON.stringify({
        crawlDefaults: {
          startUrl: 'https://config-site.com',
          maxDownloads: 500
        }
      });
      const mockFs = createMockFs({
        '/test/config.json': configContent
      });
      const service = new ConfigurationService({ cwd: '/test', fsImpl: mockFs });
      const context = service.createContext([
        '--max-downloads', '100',
        '--start-url', 'https://cli-site.com'
      ]);

      const defaultRunConfig = context.getDefaultRunConfig();
      // CLI should override config
      expect(defaultRunConfig.sharedOverrides.maxDownloads).toBe(100);
      expect(defaultRunConfig.startUrl).toBe('https://cli-site.com');
    });
  });
});

describe('CliContext', () => {
  describe('getFlag with multiple aliases', () => {
    it('returns first matching flag value', () => {
      const context = new CliContext({
        command: 'test',
        positionals: [],
        flags: { sequenceName: 'test-seq' },
        rawFlags: { sequenceName: 'test-seq' },
        configLayers: {},
        defaultRunConfig: {},
        crawlerOptions: {}
      });

      expect(context.getFlag('--sequence', '--sequence-name')).toBe('test-seq');
    });
  });

  describe('getBooleanFlag', () => {
    it('returns true for "true" string', () => {
      const context = new CliContext({
        command: 'test',
        positionals: [],
        flags: { loggingQueue: 'true' },
        rawFlags: { loggingQueue: 'true' },
        configLayers: {},
        defaultRunConfig: {},
        crawlerOptions: {}
      });

      expect(context.getBooleanFlag('--logging-queue')).toBe(true);
    });

    it('returns false for "false" string', () => {
      const context = new CliContext({
        command: 'test',
        positionals: [],
        flags: { loggingQueue: 'false' },
        rawFlags: { loggingQueue: 'false' },
        configLayers: {},
        defaultRunConfig: {},
        crawlerOptions: {}
      });

      expect(context.getBooleanFlag('--logging-queue')).toBe(false);
    });

    it('returns undefined for missing flag', () => {
      const context = new CliContext({
        command: 'test',
        positionals: [],
        flags: {},
        rawFlags: {},
        configLayers: {},
        defaultRunConfig: {},
        crawlerOptions: {}
      });

      expect(context.getBooleanFlag('--logging-queue')).toBe(undefined);
    });
  });

  describe('getIntegerFlag', () => {
    it('parses positive integers', () => {
      const context = new CliContext({
        command: 'test',
        positionals: [],
        flags: { maxDownloads: '100' },
        rawFlags: { maxDownloads: '100' },
        configLayers: {},
        defaultRunConfig: {},
        crawlerOptions: {}
      });

      expect(context.getIntegerFlag('--max-downloads')).toBe(100);
    });

    it('supports multiple fallback names', () => {
      const context = new CliContext({
        command: 'test',
        positionals: [],
        flags: { limit: 50 },
        rawFlags: { limit: '50' },
        configLayers: {},
        defaultRunConfig: {},
        crawlerOptions: {}
      });

      expect(context.getIntegerFlag('--max-downloads', '--limit')).toBe(50);
    });
  });
});
