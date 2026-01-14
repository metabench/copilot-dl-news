/**
 * AnalysisTask Unit Tests
 * 
 * Tests for the AnalysisTask background task implementation
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const { AnalysisTask } = require('../AnalysisTask');
const { ensureDb } = require('../../../data/db/sqlite');
const Database = require('better-sqlite3');

function createTempDb() {
  const tmpDir = path.join(os.tmpdir(), 'analysis-task-tests');
  fs.mkdirSync(tmpDir, { recursive: true });
  const unique = `${process.pid}-${Date.now()}-${Math.random()}`;
  const dbPath = path.join(tmpDir, `test-${unique}.db`);
  
  // Create database with full schema
  const db = ensureDb(dbPath);
  
  return { dbPath, db };
}

function seedArticles(db, count = 10) {
  const now = new Date().toISOString();
  
  for (let i = 0; i < count; i++) {
    const url = `https://example.com/article-${i}`;
    
    db.prepare(`
      INSERT INTO articles (url, title, html, text, crawled_at, fetched_at, http_status, word_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      url,
      `Test Article ${i}`,
      `<html><body><article><p>Test content for article ${i}. This is a news article about events.</p></article></body></html>`,
      `Test content for article ${i}. This is a news article about events.`,
      now,
      now,
      200,
      12
    );
    
    // Also add fetch record
    db.prepare(`
      INSERT INTO fetches (url, request_started_at, fetched_at, http_status, content_type, classification, word_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      url,
      now,
      now,
      200,
      'text/html',
      'article',
      12
    );
  }
}

describe('AnalysisTask', () => {
  let dbPath;
  let db;
  let cleanup;

  beforeEach(() => {
    const result = createTempDb();
    dbPath = result.dbPath;
    db = result.db;

    cleanup = () => {
      try {
        if (db && db.open) db.close();
      } catch (_) {}
      
      const suffixes = ['', '-shm', '-wal'];
      for (const suffix of suffixes) {
        try {
          fs.unlinkSync(dbPath + suffix);
        } catch (_) {}
      }
    };
  });

  afterEach(() => {
    if (cleanup) cleanup();
  });

  describe('Constructor', () => {
    it('should initialize with valid options', () => {
      const controller = new AbortController();
      const task = new AnalysisTask({
        db,
        taskId: 1,
        config: { analysisVersion: 1 },
        signal: controller.signal,
        onProgress: jest.fn(),
        onError: jest.fn()
      });

      expect(task.taskId).toBe(1);
      expect(task.analysisVersion).toBe(1);
      expect(task.skipPages).toBe(false);
      expect(task.skipDomains).toBe(false);
      expect(task.skipMilestones).toBe(false);
    });

    it('should apply config defaults', () => {
      const controller = new AbortController();
      const task = new AnalysisTask({
        db,
        taskId: 1,
        config: {},
        signal: controller.signal,
        onProgress: jest.fn(),
        onError: jest.fn()
      });

      expect(task.analysisVersion).toBe(1);
      expect(task.skipPages).toBe(false);
      expect(task.verbose).toBe(false);
    });

    it('should accept custom configuration', () => {
      const controller = new AbortController();
      const task = new AnalysisTask({
        db,
        taskId: 1,
        config: {
          analysisVersion: 2,
          pageLimit: 100,
          domainLimit: 50,
          skipPages: true,
          skipDomains: false,
          skipMilestones: true,
          verbose: true,
          dbPath
        },
        signal: controller.signal,
        onProgress: jest.fn(),
        onError: jest.fn()
      });

      expect(task.analysisVersion).toBe(2);
      expect(task.pageLimit).toBe(100);
      expect(task.domainLimit).toBe(50);
      expect(task.skipPages).toBe(true);
      expect(task.skipDomains).toBe(false);
      expect(task.skipMilestones).toBe(true);
      expect(task.verbose).toBe(true);
    });
  });

  describe('Progress Reporting', () => {
    it('should report progress during execution', async () => {
      seedArticles(db, 5);

      const progressUpdates = [];
      const controller = new AbortController();
      
      const task = new AnalysisTask({
        db,
        taskId: 1,
        config: { 
          analysisVersion: 1, 
          pageLimit: 5,
          dbPath 
        },
        signal: controller.signal,
        onProgress: (data) => progressUpdates.push(data),
        onError: jest.fn()
      });

      await task.execute();

      // Should have progress updates
      expect(progressUpdates.length).toBeGreaterThan(0);
      
      // First update should be starting
      expect(progressUpdates[0]).toMatchObject({
        message: expect.stringContaining('Starting'),
        metadata: expect.objectContaining({
          stage: 'starting'
        })
      });

      // Last update should be completion
      const lastUpdate = progressUpdates[progressUpdates.length - 1];
      expect(lastUpdate).toMatchObject({
        message: expect.stringContaining('completed'),
        metadata: expect.objectContaining({
          stage: 'completed',
          final: true
        })
      });
    });

    it('should track statistics correctly', async () => {
      seedArticles(db, 10);

      const controller = new AbortController();
      const task = new AnalysisTask({
        db,
        taskId: 1,
        config: { 
          analysisVersion: 1, 
          pageLimit: 10,
          dbPath 
        },
        signal: controller.signal,
        onProgress: jest.fn(),
        onError: jest.fn()
      });

      await task.execute();

      expect(task.stats.pagesProcessed).toBeGreaterThan(0);
      expect(task.stats.errors).toBe(0);
    });
  });

  describe('Stage Execution', () => {
    it('should execute all stages when nothing is skipped', async () => {
      seedArticles(db, 3);

      const stages = [];
      const controller = new AbortController();
      
      const task = new AnalysisTask({
        db,
        taskId: 1,
        config: { 
          analysisVersion: 1, 
          pageLimit: 3,
          dbPath,
          skipPages: false,
          skipDomains: false,
          skipMilestones: false
        },
        signal: controller.signal,
        onProgress: (data) => {
          if (data.metadata && data.metadata.stage) {
            stages.push(data.metadata.stage);
          }
        },
        onError: jest.fn()
      });

      await task.execute();

      expect(stages).toContain('starting');
      expect(stages).toContain('page-analysis');
      expect(stages).toContain('domain-analysis');
      expect(stages).toContain('milestones');
      expect(stages).toContain('completed');
    });

    it('should skip page analysis when skipPages is true', async () => {
      const stages = [];
      const controller = new AbortController();
      
      const task = new AnalysisTask({
        db,
        taskId: 1,
        config: { 
          analysisVersion: 1,
          skipPages: true,
          dbPath
        },
        signal: controller.signal,
        onProgress: (data) => {
          if (data.metadata && data.metadata.stage) {
            stages.push(data.metadata.stage);
          }
        },
        onError: jest.fn()
      });

      await task.execute();

      expect(stages).not.toContain('page-analysis');
      expect(stages).toContain('completed');
    });

    it('should skip domain analysis when skipDomains is true', async () => {
      const stages = [];
      const controller = new AbortController();
      
      const task = new AnalysisTask({
        db,
        taskId: 1,
        config: { 
          analysisVersion: 1,
          skipDomains: true,
          dbPath
        },
        signal: controller.signal,
        onProgress: (data) => {
          if (data.metadata && data.metadata.stage) {
            stages.push(data.metadata.stage);
          }
        },
        onError: jest.fn()
      });

      await task.execute();

      expect(stages).not.toContain('domain-analysis');
      expect(stages).toContain('completed');
    });

    it('should skip milestones when skipMilestones is true', async () => {
      const stages = [];
      const controller = new AbortController();
      
      const task = new AnalysisTask({
        db,
        taskId: 1,
        config: { 
          analysisVersion: 1,
          skipMilestones: true,
          dbPath
        },
        signal: controller.signal,
        onProgress: (data) => {
          if (data.metadata && data.metadata.stage) {
            stages.push(data.metadata.stage);
          }
        },
        onError: jest.fn()
      });

      await task.execute();

      expect(stages).not.toContain('milestones');
      expect(stages).toContain('completed');
    });
  });

  describe('Pause and Resume', () => {
    it('should support pause', () => {
      const controller = new AbortController();
      const task = new AnalysisTask({
        db,
        taskId: 1,
        config: { analysisVersion: 1, dbPath },
        signal: controller.signal,
        onProgress: jest.fn(),
        onError: jest.fn()
      });

      expect(task.paused).toBe(false);
      task.pause();
      expect(task.paused).toBe(true);
    });

    it('should support resume', () => {
      const controller = new AbortController();
      const task = new AnalysisTask({
        db,
        taskId: 1,
        config: { analysisVersion: 1, dbPath },
        signal: controller.signal,
        onProgress: jest.fn(),
        onError: jest.fn()
      });

      task.pause();
      expect(task.paused).toBe(true);
      task.resume();
      expect(task.paused).toBe(false);
    });
  });

  describe('Cancellation', () => {
    it('should handle abort signal during page analysis', async () => {
      seedArticles(db, 10);

      const controller = new AbortController();
      const progressUpdates = [];
      
      const task = new AnalysisTask({
        db,
        taskId: 1,
        config: { 
          analysisVersion: 1, 
          pageLimit: 10,
          dbPath 
        },
        signal: controller.signal,
        onProgress: (data) => {
          progressUpdates.push(data);
          // Abort after first progress update
          if (progressUpdates.length === 2) {
            controller.abort();
          }
        },
        onError: jest.fn()
      });

      // Task should handle cancellation gracefully
      await task.execute();

      // Should have some progress before cancellation
      expect(progressUpdates.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    // Note: These tests are skipped because invalid DB paths don't cause errors -
    // NewsDatabase creates a new DB if the path doesn't exist. Real error conditions
    // would need to mock the analysePages function, which requires module-level mocking.
    it.skip('should call onError when execution fails', async () => {
      const controller = new AbortController();
      const onError = jest.fn();
      
      const task = new AnalysisTask({
        db,
        taskId: 1,
        config: { 
          analysisVersion: 1,
          dbPath: '/invalid/path/to/db.db'
        },
        signal: controller.signal,
        onProgress: jest.fn(),
        onError
      });

      await expect(task.execute()).rejects.toThrow();
      expect(onError).toHaveBeenCalled();
    });

    it.skip('should track error count in stats', async () => {
      const controller = new AbortController();
      
      const task = new AnalysisTask({
        db,
        taskId: 1,
        config: { 
          analysisVersion: 1,
          dbPath: '/invalid/path/to/db.db'
        },
        signal: controller.signal,
        onProgress: jest.fn(),
        onError: jest.fn()
      });

      try {
        await task.execute();
      } catch (_) {
        // Expected error
      }

      expect(task.stats.errors).toBeGreaterThan(0);
    });
  });

  describe('Integration with analysePages', () => {
    it('should analyze articles and update database', async () => {
      seedArticles(db, 5);

      const controller = new AbortController();
      const task = new AnalysisTask({
        db,
        taskId: 1,
        config: { 
          analysisVersion: 1, 
          pageLimit: 5,
          dbPath,
          skipDomains: true,
          skipMilestones: true
        },
        signal: controller.signal,
        onProgress: jest.fn(),
        onError: jest.fn()
      });

      await task.execute();

      // Check if articles were analyzed
      const analyzed = db.prepare(`
        SELECT COUNT(*) as count 
        FROM articles 
        WHERE analysis IS NOT NULL 
        AND CAST(json_extract(analysis, '$.analysis_version') AS INTEGER) = ?
      `).get(1);

      expect(analyzed.count).toBeGreaterThan(0);
    });

    it('should respect page limit', async () => {
      seedArticles(db, 20);

      const controller = new AbortController();
      const task = new AnalysisTask({
        db,
        taskId: 1,
        config: { 
          analysisVersion: 1, 
          pageLimit: 5,
          dbPath,
          skipDomains: true,
          skipMilestones: true
        },
        signal: controller.signal,
        onProgress: jest.fn(),
        onError: jest.fn()
      });

      await task.execute();

      // Should analyze at most 5 articles
      const analyzed = db.prepare(`
        SELECT COUNT(*) as count 
        FROM articles 
        WHERE analysis IS NOT NULL 
        AND analysis_version = ?
      `).get(1);

      expect(analyzed.count).toBeLessThanOrEqual(5);
    });
  });
});
