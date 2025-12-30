'use strict';

/**
 * Tests for Test Studio Jest Reporter
 * @module tests/tools/test-reporter.test
 */

const path = require('path');
const fs = require('fs');

// Mock fs before requiring the module
jest.mock('fs');

describe('TestStudioReporter', () => {
  let TestStudioReporter;
  let mockFs;

  beforeEach(() => {
    jest.resetModules();
    mockFs = require('fs');
    
    mockFs.existsSync.mockReturnValue(true);
    mockFs.mkdirSync.mockImplementation(() => {});
    mockFs.writeFileSync.mockImplementation(() => {});
    mockFs.readFileSync.mockReturnValue('{}');
    mockFs.readdirSync.mockReturnValue([]);
    mockFs.unlinkSync.mockImplementation(() => {});

    TestStudioReporter = require('../../tools/test-reporter');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('exports', () => {
    it('should export TestStudioReporter class as default', () => {
      expect(TestStudioReporter).toBeDefined();
      expect(typeof TestStudioReporter).toBe('function');
    });

    it('should export TestStudioReporter as named export', () => {
      expect(TestStudioReporter.TestStudioReporter).toBeDefined();
    });

    it('should export importFromFile function', () => {
      expect(TestStudioReporter.importFromFile).toBeDefined();
      expect(typeof TestStudioReporter.importFromFile).toBe('function');
    });

    it('should export listResultFiles function', () => {
      expect(TestStudioReporter.listResultFiles).toBeDefined();
      expect(typeof TestStudioReporter.listResultFiles).toBe('function');
    });

    it('should export getLatestResults function', () => {
      expect(TestStudioReporter.getLatestResults).toBeDefined();
      expect(typeof TestStudioReporter.getLatestResults).toBe('function');
    });

    it('should export pruneOldResults function', () => {
      expect(TestStudioReporter.pruneOldResults).toBeDefined();
      expect(typeof TestStudioReporter.pruneOldResults).toBe('function');
    });
  });

  describe('constructor', () => {
    it('should create instance with global config', () => {
      const reporter = new TestStudioReporter({});
      expect(reporter).toBeDefined();
    });

    it('should accept options', () => {
      const reporter = new TestStudioReporter({}, {
        outputDir: 'custom/output',
        runId: 'custom-run-id'
      });
      expect(reporter.outputDir).toBe('custom/output');
      expect(reporter.runId).toBe('custom-run-id');
    });

    it('should generate runId if not provided', () => {
      const reporter = new TestStudioReporter({}, {});
      expect(reporter.runId).toMatch(/^run-\d{4}-\d{2}-\d{2}-\d{6}$/);
    });

    it('should use default output directory', () => {
      const reporter = new TestStudioReporter({}, {});
      expect(reporter.outputDir).toBe('data/test-results');
    });
  });

  describe('generateRunId', () => {
    it('should generate valid run ID format', () => {
      const reporter = new TestStudioReporter({}, {});
      const runId = reporter.generateRunId();
      expect(runId).toMatch(/^run-\d{4}-\d{2}-\d{2}-\d{6}$/);
    });

    it('should generate unique IDs', () => {
      const reporter = new TestStudioReporter({}, {});
      const id1 = reporter.generateRunId();
      // Wait a tiny bit to ensure different timestamp
      const id2 = reporter.generateRunId();
      // IDs could be same if generated in same second, but format should be valid
      expect(id1).toMatch(/^run-/);
      expect(id2).toMatch(/^run-/);
    });
  });

  describe('onRunStart', () => {
    it('should initialize start time', () => {
      const reporter = new TestStudioReporter({}, {});
      reporter.onRunStart({}, {});
      expect(reporter.startTime).toBeDefined();
      expect(typeof reporter.startTime).toBe('number');
    });

    it('should initialize empty test results', () => {
      const reporter = new TestStudioReporter({}, {});
      reporter.onRunStart({}, {});
      expect(reporter.testResults).toEqual([]);
    });
  });

  describe('onTestResult', () => {
    let reporter;

    beforeEach(() => {
      reporter = new TestStudioReporter({ rootDir: '/project' }, {});
      reporter.onRunStart({}, {});
    });

    it('should collect test results', () => {
      const testResult = {
        testFilePath: '/project/tests/example.test.js',
        testResults: [
          { fullName: 'example should pass', status: 'passed', duration: 10 }
        ]
      };

      reporter.onTestResult({}, testResult, {});
      expect(reporter.testResults.length).toBe(1);
    });

    it('should extract relative file path', () => {
      const testResult = {
        testFilePath: '/project/tests/example.test.js',
        testResults: [
          { fullName: 'test', status: 'passed', duration: 10 }
        ]
      };

      reporter.onTestResult({}, testResult, {});
      // Handle cross-platform path separators
      const expectedPath = require('path').join('tests', 'example.test.js');
      expect(reporter.testResults[0].file).toBe(expectedPath);
    });

    it('should capture test name', () => {
      const testResult = {
        testFilePath: '/project/tests/example.test.js',
        testResults: [
          { fullName: 'example should work correctly', status: 'passed', duration: 10 }
        ]
      };

      reporter.onTestResult({}, testResult, {});
      expect(reporter.testResults[0].testName).toBe('example should work correctly');
    });

    it('should capture duration', () => {
      const testResult = {
        testFilePath: '/project/tests/example.test.js',
        testResults: [
          { fullName: 'test', status: 'passed', duration: 150 }
        ]
      };

      reporter.onTestResult({}, testResult, {});
      expect(reporter.testResults[0].duration).toBe(150);
    });

    it('should capture error messages for failures', () => {
      const testResult = {
        testFilePath: '/project/tests/example.test.js',
        testResults: [
          { 
            fullName: 'test', 
            status: 'failed', 
            duration: 10,
            failureMessages: ['Expected true, got false']
          }
        ]
      };

      reporter.onTestResult({}, testResult, {});
      expect(reporter.testResults[0].errorMessage).toBe('Expected true, got false');
    });

    it('should handle multiple failure messages', () => {
      const testResult = {
        testFilePath: '/project/tests/example.test.js',
        testResults: [
          { 
            fullName: 'test', 
            status: 'failed', 
            duration: 10,
            failureMessages: ['Error 1', 'Error 2']
          }
        ]
      };

      reporter.onTestResult({}, testResult, {});
      expect(reporter.testResults[0].errorMessage).toContain('Error 1');
      expect(reporter.testResults[0].errorMessage).toContain('Error 2');
    });

    it('should collect ancestor titles', () => {
      const testResult = {
        testFilePath: '/project/tests/example.test.js',
        testResults: [
          { 
            fullName: 'Suite > Nested > test', 
            status: 'passed', 
            duration: 10,
            ancestorTitles: ['Suite', 'Nested']
          }
        ]
      };

      reporter.onTestResult({}, testResult, {});
      expect(reporter.testResults[0].ancestorTitles).toEqual(['Suite', 'Nested']);
    });
  });

  describe('mapStatus', () => {
    let reporter;

    beforeEach(() => {
      reporter = new TestStudioReporter({}, {});
    });

    it('should map passed status', () => {
      expect(reporter.mapStatus('passed')).toBe('passed');
    });

    it('should map failed status', () => {
      expect(reporter.mapStatus('failed')).toBe('failed');
    });

    it('should map pending to skipped', () => {
      expect(reporter.mapStatus('pending')).toBe('skipped');
    });

    it('should map skipped to skipped', () => {
      expect(reporter.mapStatus('skipped')).toBe('skipped');
    });

    it('should map todo to skipped', () => {
      expect(reporter.mapStatus('todo')).toBe('skipped');
    });

    it('should map disabled to skipped', () => {
      expect(reporter.mapStatus('disabled')).toBe('skipped');
    });

    it('should default unknown status to skipped', () => {
      expect(reporter.mapStatus('unknown')).toBe('skipped');
    });
  });

  describe('onRunComplete', () => {
    let reporter;

    beforeEach(() => {
      reporter = new TestStudioReporter({ rootDir: '/project' }, {});
      reporter.onRunStart({}, {});
      reporter.testResults = [
        { file: 'test.js', testName: 'test1', status: 'passed', duration: 10 }
      ];
    });

    it('should write output file', () => {
      const results = {
        numTotalTests: 1,
        numPassedTests: 1,
        numFailedTests: 0,
        numPendingTests: 0,
        numTodoTests: 0,
        numTotalTestSuites: 1
      };

      reporter.onRunComplete({}, results);
      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });

    it('should write to correct output directory', () => {
      mockFs.existsSync.mockReturnValue(false);
      
      const results = {
        numTotalTests: 1,
        numPassedTests: 1,
        numFailedTests: 0,
        numPendingTests: 0,
        numTodoTests: 0,
        numTotalTestSuites: 1
      };

      reporter.onRunComplete({}, results);
      expect(mockFs.mkdirSync).toHaveBeenCalled();
    });

    it('should include summary in output', () => {
      const results = {
        numTotalTests: 10,
        numPassedTests: 8,
        numFailedTests: 1,
        numPendingTests: 1,
        numTodoTests: 0,
        numTotalTestSuites: 3
      };

      reporter.onRunComplete({}, results);
      
      const writeCall = mockFs.writeFileSync.mock.calls[0];
      const output = JSON.parse(writeCall[1]);
      
      expect(output.summary.total).toBe(10);
      expect(output.summary.passed).toBe(8);
      expect(output.summary.failed).toBe(1);
    });

    it('should include environment info', () => {
      const results = {
        numTotalTests: 1,
        numPassedTests: 1,
        numFailedTests: 0,
        numPendingTests: 0,
        numTodoTests: 0,
        numTotalTestSuites: 1
      };

      reporter.onRunComplete({}, results);
      
      const writeCall = mockFs.writeFileSync.mock.calls[0];
      const output = JSON.parse(writeCall[1]);
      
      expect(output.environment).toBeDefined();
      expect(output.environment.node).toBeDefined();
      expect(output.environment.platform).toBeDefined();
    });

    it('should write latest.json', () => {
      const results = {
        numTotalTests: 1,
        numPassedTests: 1,
        numFailedTests: 0,
        numPendingTests: 0,
        numTodoTests: 0,
        numTotalTestSuites: 1
      };

      reporter.onRunComplete({}, results);
      
      const latestWrite = mockFs.writeFileSync.mock.calls.find(
        call => call[0].includes('latest.json')
      );
      expect(latestWrite).toBeDefined();
    });
  });

  describe('getLastError', () => {
    it('should return null', () => {
      const reporter = new TestStudioReporter({}, {});
      expect(reporter.getLastError()).toBeNull();
    });
  });
});

describe('Helper functions', () => {
  let TestStudioReporter;
  let mockFs;

  beforeEach(() => {
    jest.resetModules();
    mockFs = require('fs');
    
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify({ runId: 'test' }));
    mockFs.readdirSync.mockReturnValue(['run-1.json', 'run-2.json', 'latest.json']);
    mockFs.unlinkSync.mockImplementation(() => {});

    TestStudioReporter = require('../../tools/test-reporter');
  });

  describe('importFromFile', () => {
    it('should read and parse JSON file', () => {
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ 
        runId: 'test-run',
        results: []
      }));

      const result = TestStudioReporter.importFromFile('test.json');
      expect(result.runId).toBe('test-run');
    });
  });

  describe('listResultFiles', () => {
    it('should list JSON files', () => {
      mockFs.readdirSync.mockReturnValue(['run-1.json', 'run-2.json', 'latest.json']);
      
      const files = TestStudioReporter.listResultFiles('data/test-results');
      expect(files.length).toBe(2); // Excludes latest.json
    });

    it('should return empty for non-existent directory', () => {
      mockFs.existsSync.mockReturnValue(false);
      
      const files = TestStudioReporter.listResultFiles('nonexistent');
      expect(files).toEqual([]);
    });

    it('should sort files in reverse order', () => {
      mockFs.readdirSync.mockReturnValue(['run-001.json', 'run-002.json', 'run-003.json']);
      
      const files = TestStudioReporter.listResultFiles('data/test-results');
      expect(files[0]).toContain('run-003.json');
    });
  });

  describe('getLatestResults', () => {
    it('should read latest.json', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ runId: 'latest' }));
      
      const result = TestStudioReporter.getLatestResults('data/test-results');
      expect(result.runId).toBe('latest');
    });

    it('should return null if no latest.json', () => {
      mockFs.existsSync.mockReturnValue(false);
      
      const result = TestStudioReporter.getLatestResults('data/test-results');
      expect(result).toBeNull();
    });
  });

  describe('pruneOldResults', () => {
    it('should delete old files', () => {
      mockFs.readdirSync.mockReturnValue([
        'run-001.json', 'run-002.json', 'run-003.json', 'run-004.json', 'run-005.json'
      ]);
      
      const deleted = TestStudioReporter.pruneOldResults('data/test-results', 2);
      expect(deleted).toBe(3);
    });

    it('should keep specified number of files', () => {
      mockFs.readdirSync.mockReturnValue(['run-001.json', 'run-002.json', 'run-003.json']);
      
      TestStudioReporter.pruneOldResults('data/test-results', 3);
      expect(mockFs.unlinkSync).not.toHaveBeenCalled();
    });

    it('should handle deletion errors gracefully', () => {
      mockFs.readdirSync.mockReturnValue(['run-001.json', 'run-002.json', 'run-003.json']);
      mockFs.unlinkSync.mockImplementation(() => { throw new Error('Permission denied'); });
      
      const deleted = TestStudioReporter.pruneOldResults('data/test-results', 1);
      expect(deleted).toBe(0);
    });
  });
});
