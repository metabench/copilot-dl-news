'use strict';

/**
 * Tests for newscrawl CLI
 * @module tests/cli/newscrawl.test
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// Mock dependencies before requiring the module
jest.mock('fs');
jest.mock('os');
jest.mock('readline');

describe('newscrawl CLI', () => {
  let cli;
  let mockFs;
  let mockOs;
  let originalArgv;
  let originalLog;
  let originalError;
  let logOutput;
  let errorOutput;

  beforeEach(() => {
    jest.resetModules();
    
    // Setup mocks
    mockFs = require('fs');
    mockOs = require('os');
    
    mockOs.homedir.mockReturnValue('/home/testuser');
    mockFs.existsSync.mockReturnValue(false);
    mockFs.readFileSync.mockReturnValue('{}');
    mockFs.writeFileSync.mockImplementation(() => {});
    mockFs.mkdirSync.mockImplementation(() => {});

    // Capture console output
    originalLog = console.log;
    originalError = console.error;
    logOutput = [];
    errorOutput = [];
    console.log = (...args) => logOutput.push(args.join(' '));
    console.error = (...args) => errorOutput.push(args.join(' '));

    // Save original argv
    originalArgv = process.argv;

    cli = require('../../tools/cli/newscrawl');
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    process.argv = originalArgv;
    jest.clearAllMocks();
  });

  describe('parseArgs', () => {
    it('should parse command with no arguments', () => {
      const result = cli.parseArgs(['node', 'newscrawl', 'status']);
      expect(result.args).toContain('status');
    });

    it('should parse command with positional arguments', () => {
      const result = cli.parseArgs(['node', 'newscrawl', 'search', 'climate', 'change']);
      expect(result.args).toContain('search');
      expect(result.args).toContain('climate');
      expect(result.args).toContain('change');
    });

    it('should parse flags', () => {
      const result = cli.parseArgs(['node', 'newscrawl', 'search', '--limit', '50', '--format', 'json']);
      expect(result.flags.limit).toBe('50');
      expect(result.flags.format).toBe('json');
    });

    it('should handle boolean flags', () => {
      const result = cli.parseArgs(['node', 'newscrawl', 'export', '--verbose']);
      expect(result.flags.verbose).toBe(true);
    });

    it('should handle mixed positional and flags', () => {
      const result = cli.parseArgs(['node', 'newscrawl', 'alerts', 'create', '--name', 'Test Alert']);
      expect(result.args).toContain('alerts');
      expect(result.args).toContain('create');
      expect(result.flags.name).toBe('Test Alert');
    });

    it('should collect all positional args', () => {
      const result = cli.parseArgs(['node', 'newscrawl']);
      expect(Array.isArray(result.args)).toBe(true);
    });

    it('should handle --help flag', () => {
      const result = cli.parseArgs(['node', 'newscrawl', 'search', '--help']);
      expect(result.flags.help).toBe(true);
    });
  });

  describe('loadConfig', () => {
    it('should return empty config when file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      const config = cli.loadConfig();
      expect(config).toEqual({});
    });

    it('should load config from file', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        apiUrl: 'https://api.example.com',
        token: 'test-token'
      }));

      const config = cli.loadConfig();
      expect(config.apiUrl).toBe('https://api.example.com');
      expect(config.token).toBe('test-token');
    });

    it('should handle invalid JSON gracefully', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('not valid json');

      const config = cli.loadConfig();
      expect(config).toEqual({});
    });
  });

  describe('saveConfig', () => {
    it('should create config directory if not exists', () => {
      mockFs.existsSync.mockReturnValue(false);
      
      cli.saveConfig({ token: 'abc' });
      
      expect(mockFs.mkdirSync).toHaveBeenCalled();
    });

    it('should write config to file', () => {
      mockFs.existsSync.mockReturnValue(true);
      
      cli.saveConfig({ token: 'test-token', apiUrl: 'https://api.test.com' });
      
      expect(mockFs.writeFileSync).toHaveBeenCalled();
      const writeCall = mockFs.writeFileSync.mock.calls[0];
      const written = JSON.parse(writeCall[1]);
      expect(written.token).toBe('test-token');
    });
  });

  describe('cmdStatus', () => {
    it('should show not logged in when no token', async () => {
      await cli.cmdStatus();
      expect(logOutput.some(l => l.includes('Not logged in') || l.includes('not logged'))).toBe(true);
    });

    it('should show config when apiKey exists', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ apiKey: 'test-key', baseUrl: 'https://api.test.com' }));
      
      // Re-require to pick up new mock values
      jest.resetModules();
      mockFs = require('fs');
      mockOs = require('os');
      mockOs.homedir.mockReturnValue('/home/testuser');
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ apiKey: 'test-key', baseUrl: 'https://api.test.com' }));
      mockFs.writeFileSync.mockImplementation(() => {});
      mockFs.mkdirSync.mockImplementation(() => {});
      cli = require('../../tools/cli/newscrawl');
      
      await cli.cmdStatus();
      expect(logOutput.some(l => l.includes('Configuration') || l.includes('Base URL'))).toBe(true);
    });
  });

  describe('cmdLogin', () => {
    it('should require API key', async () => {
      const result = await cli.cmdLogin([]);
      expect(result.success).toBe(false);
      // print() uses console.log, not console.error
      expect(logOutput.some(l => l.includes('API key'))).toBe(true);
    });

    it('should save config on login attempt', async () => {
      mockFs.existsSync.mockReturnValue(true);
      
      // Login with API key
      await cli.cmdLogin(['test-token-123', 'https://api.test.com']);
      
      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('cmdLogout', () => {
    it('should clear config', async () => {
      mockFs.existsSync.mockReturnValue(true);
      
      cli.cmdLogout();
      
      expect(mockFs.writeFileSync).toHaveBeenCalled();
      const writeCall = mockFs.writeFileSync.mock.calls[0];
      const written = JSON.parse(writeCall[1]);
      expect(written).toEqual({});
    });
  });

  describe('cmdSearch', () => {
    it('should require query', async () => {
      const result = await cli.cmdSearch([], {});
      expect(result.success).toBe(false);
    });
  });

  describe('cmdExport', () => {
    it('should export with default options', async () => {
      // Export function exists
      expect(typeof cli.cmdExport).toBe('function');
    });
  });

  describe('cmdAlertsList', () => {
    it('should return alerts list function', async () => {
      expect(typeof cli.cmdAlertsList).toBe('function');
    });
  });

  describe('cmdAlertsCreate', () => {
    it('should require name and query', async () => {
      const result = await cli.cmdAlertsCreate([], {});
      expect(result.success).toBe(false);
    });
  });

  describe('cmdAlertsDelete', () => {
    it('should require alert ID', async () => {
      const result = await cli.cmdAlertsDelete([]);
      expect(result.success).toBe(false);
    });
  });

  describe('main', () => {
    it('should show help for unknown command', async () => {
      process.argv = ['node', 'newscrawl', 'unknown'];
      await cli.main();
      expect(logOutput.some(l => l.includes('Unknown command') || l.includes('Usage'))).toBe(true);
    });

    it('should execute status command', async () => {
      process.argv = ['node', 'newscrawl', 'status'];
      await cli.main();
      expect(logOutput.length).toBeGreaterThan(0);
    });
  });
});

describe('CLI integration scenarios', () => {
  let cli;
  let mockFs;
  let mockOs;

  beforeEach(() => {
    jest.resetModules();
    mockFs = require('fs');
    mockOs = require('os');
    
    mockOs.homedir.mockReturnValue('/home/testuser');
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      baseUrl: 'https://api.newscrawl.io',
      apiKey: 'valid-token-123'
    }));
    mockFs.writeFileSync.mockImplementation(() => {});
    mockFs.mkdirSync.mockImplementation(() => {});

    cli = require('../../tools/cli/newscrawl');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should load configuration with apiKey', async () => {
    const config = cli.loadConfig();
    expect(config.apiKey).toBe('valid-token-123');
  });

  it('should support parseArgs for workflow commands', async () => {
    const result = cli.parseArgs(['node', 'newscrawl', 'search', 'climate', '--limit', '10']);
    expect(result.args).toContain('search');
    expect(result.flags.limit).toBe('10');
  });
});

describe('CLI argument parsing edge cases', () => {
  let cli;

  beforeEach(() => {
    jest.resetModules();
    const mockFs = require('fs');
    const mockOs = require('os');
    mockOs.homedir.mockReturnValue('/home/testuser');
    mockFs.existsSync.mockReturnValue(false);
    mockFs.readFileSync.mockReturnValue('{}');
    
    cli = require('../../tools/cli/newscrawl');
  });

  it('should handle flags with separate values', () => {
    const result = cli.parseArgs(['node', 'newscrawl', 'search', '--query', 'climate change']);
    expect(result.flags.query).toBe('climate change');
  });

  it('should handle multiple instances of same flag (last wins)', () => {
    const result = cli.parseArgs(['node', 'newscrawl', 'search', '--tag', 'news', '--tag', 'climate']);
    // Last value wins
    expect(result.flags.tag).toBe('climate');
  });

  it('should handle short flags', () => {
    const result = cli.parseArgs(['node', 'newscrawl', 'search', '-q', 'test', '-l', '10']);
    expect(result.flags.q).toBe('test');
    expect(result.flags.l).toBe('10');
  });

  it('should handle mixed flags and positional args', () => {
    const result = cli.parseArgs(['node', 'newscrawl', 'search', 'climate', '--limit', '50']);
    expect(result.args).toContain('search');
    expect(result.args).toContain('climate');
    expect(result.flags.limit).toBe('50');
  });
});
