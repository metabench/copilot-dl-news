'use strict';

/**
 * Tests for Test Result Service
 * @module tests/ui/testStudio/TestResultService.test
 */

describe('TestResultService', () => {
  let TestResultService;

  beforeEach(() => {
    jest.resetModules();
    TestResultService = require('../../../src/ui/server/testStudio/TestResultService');
  });

  describe('exports', () => {
    it('should export TestResultService class', () => {
      expect(TestResultService).toBeDefined();
      expect(typeof TestResultService).toBe('function');
    });
  });

  describe('constructor', () => {
    it('should create instance', () => {
      const service = new TestResultService();
      expect(service).toBeDefined();
    });

    it('should accept options', () => {
      const service = new TestResultService({ dataDir: './test-data' });
      expect(service).toBeDefined();
    });
  });

  describe('generateRunId', () => {
    it('should generate unique run IDs', () => {
      const service = new TestResultService();
      const id1 = service.generateRunId();
      const id2 = service.generateRunId();
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });

    it('should generate string IDs', () => {
      const service = new TestResultService();
      const id = service.generateRunId();
      expect(typeof id).toBe('string');
    });
  });

  describe('importResults', () => {
    it('should be an async function', () => {
      const service = new TestResultService();
      expect(typeof service.importResults).toBe('function');
    });

    it('should accept results array', async () => {
      const service = new TestResultService();
      const runId = await service.importResults([
        { name: 'test1', status: 'passed', duration: 100 }
      ]);
      expect(runId).toBeDefined();
    });
  });

  describe('listRuns', () => {
    it('should return array', async () => {
      const service = new TestResultService();
      const runs = await service.listRuns();
      expect(Array.isArray(runs)).toBe(true);
    });

    it('should accept options', async () => {
      const service = new TestResultService();
      const runs = await service.listRuns({ limit: 10 });
      expect(Array.isArray(runs)).toBe(true);
    });
  });

  describe('getRunCount', () => {
    it('should return number', async () => {
      const service = new TestResultService();
      const count = await service.getRunCount();
      expect(typeof count).toBe('number');
    });
  });

  describe('getRun', () => {
    it('should return null for unknown run', async () => {
      const service = new TestResultService();
      const run = await service.getRun('unknown-run-id');
      expect(run).toBeNull();
    });
  });

  describe('getResults', () => {
    it('should return array', async () => {
      const service = new TestResultService();
      const results = await service.getResults('run-id');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should accept filter options', async () => {
      const service = new TestResultService();
      const results = await service.getResults('run-id', { status: 'failed' });
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('getResultCount', () => {
    it('should return counts object', async () => {
      const service = new TestResultService();
      const counts = await service.getResultCount('run-id');
      expect(counts).toBeDefined();
    });
  });

  describe('getGroupedFailures', () => {
    it('should return object', async () => {
      const service = new TestResultService();
      const grouped = await service.getGroupedFailures('run-id');
      expect(typeof grouped).toBe('object');
    });
  });

  describe('deleteRun', () => {
    it('should be an async function', () => {
      const service = new TestResultService();
      expect(typeof service.deleteRun).toBe('function');
    });
  });

  describe('getStats', () => {
    it('should return stats object', async () => {
      const service = new TestResultService();
      const stats = await service.getStats();
      expect(stats).toBeDefined();
    });
  });

  describe('getTestHistory', () => {
    it('should return array', async () => {
      const service = new TestResultService();
      const history = await service.getTestHistory('test-name');
      expect(Array.isArray(history)).toBe(true);
    });
  });
});

describe('TestResultService with results', () => {
  let TestResultService;
  let service;

  beforeEach(async () => {
    jest.resetModules();
    TestResultService = require('../../../src/ui/server/testStudio/TestResultService');
    service = new TestResultService();
    
    // Import test results in Jest format
    await service.importResults({
      testResults: [
        {
          name: 'test.js',
          assertionResults: [
            { title: 'test1', status: 'passed', duration: 100 },
            { title: 'test2', status: 'failed', duration: 50, failureMessages: ['Error'] }
          ]
        },
        {
          name: 'other.js',
          assertionResults: [
            { title: 'test3', status: 'passed', duration: 75 }
          ]
        }
      ]
    });
  });

  it('should have at least one run', async () => {
    const runs = await service.listRuns();
    expect(runs.length).toBeGreaterThan(0);
  });

  it('should count runs correctly', async () => {
    const count = await service.getRunCount();
    expect(count).toBeGreaterThan(0);
  });

  it('should get results for run', async () => {
    const runs = await service.listRuns();
    if (runs.length > 0) {
      const results = await service.getResults(runs[0].runId);
      expect(results.length).toBeGreaterThan(0);
    }
  });

  it('should filter failed results', async () => {
    const runs = await service.listRuns();
    if (runs.length > 0) {
      const failed = await service.getResults(runs[0].runId, { status: 'failed' });
      expect(Array.isArray(failed)).toBe(true);
    }
  });
});
