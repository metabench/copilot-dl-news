'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const CheckpointManager = require('../../../src/core/crawler/checkpoint/CheckpointManager');

describe('CheckpointManager', () => {
  let tempDir;
  let manager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-test-'));
    manager = new CheckpointManager({
      checkpointDir: tempDir,
      prefix: 'test-cp',
      maxCheckpoints: 3
    });
  });

  afterEach(() => {
    // Clean up temp directory
    try {
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        fs.unlinkSync(path.join(tempDir, file));
      }
      fs.rmdirSync(tempDir);
    } catch {}
  });

  describe('constructor', () => {
    it('creates checkpoint directory if not exists', () => {
      const newDir = path.join(tempDir, 'subdir', 'checkpoints');
      new CheckpointManager({ checkpointDir: newDir });

      expect(fs.existsSync(newDir)).toBe(true);
    });

    it('uses default values', () => {
      const m = new CheckpointManager({ checkpointDir: tempDir });

      expect(m.prefix).toBe('checkpoint');
      expect(m.maxCheckpoints).toBe(5);
    });
  });

  describe('save', () => {
    it('saves checkpoint to disk', () => {
      const checkpoint = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        jobId: 'test-job',
        context: { stats: { visited: 10 } },
        plan: { goals: [] }
      };

      const filepath = manager.save(checkpoint);

      expect(fs.existsSync(filepath)).toBe(true);
      expect(filepath).toContain('test-cp');
      expect(filepath).toContain('test-job');
    });

    it('saves checkpoint with valid JSON', () => {
      const checkpoint = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        context: { nested: { deep: { value: 42 } } },
        plan: {}
      };

      const filepath = manager.save(checkpoint);
      const data = fs.readFileSync(filepath, 'utf8');
      const parsed = JSON.parse(data);

      expect(parsed.context.nested.deep.value).toBe(42);
    });

    it('emits saved event', () => {
      const savedHandler = jest.fn();
      manager.on('saved', savedHandler);

      const checkpoint = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        context: {},
        plan: {}
      };

      manager.save(checkpoint);

      expect(savedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.any(String),
          size: expect.any(Number)
        })
      );
    });

    it('throws on invalid checkpoint', () => {
      expect(() => manager.save(null)).toThrow();
    });

    it('cleans up old checkpoints', () => {
      const checkpoint = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        jobId: 'cleanup-test',
        context: {},
        plan: {}
      };

      // Save more than maxCheckpoints
      for (let i = 0; i < 5; i++) {
        manager.save(checkpoint);
        // Small delay to ensure different filenames
      }

      const remaining = manager.list('cleanup-test');

      expect(remaining.length).toBeLessThanOrEqual(3);
    });
  });

  describe('load', () => {
    it('loads checkpoint from path', () => {
      const checkpoint = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        jobId: 'load-test',
        context: { test: true },
        plan: {}
      };

      const filepath = manager.save(checkpoint);
      const loaded = manager.load(filepath);

      expect(loaded.jobId).toBe('load-test');
      expect(loaded.context.test).toBe(true);
    });

    it('throws on non-existent file', () => {
      expect(() => manager.load('/nonexistent/path.json')).toThrow();
    });

    it('throws on invalid checkpoint format', () => {
      const invalidPath = path.join(tempDir, 'invalid.json');
      fs.writeFileSync(invalidPath, '{"not": "valid"}');

      expect(() => manager.load(invalidPath)).toThrow('Invalid checkpoint format');
    });

    it('emits loaded event', () => {
      const loadedHandler = jest.fn();
      manager.on('loaded', loadedHandler);

      const checkpoint = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        context: {},
        plan: {}
      };

      const filepath = manager.save(checkpoint);
      manager.load(filepath);

      expect(loadedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          path: filepath
        })
      );
    });
  });

  describe('loadLatest', () => {
    it('returns most recent checkpoint', () => {
      const checkpoint1 = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        jobId: 'job1',
        context: { order: 1 },
        plan: {}
      };

      const checkpoint2 = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        jobId: 'job2',
        context: { order: 2 },
        plan: {}
      };

      manager.save(checkpoint1);
      manager.save(checkpoint2);

      const latest = manager.loadLatest();

      expect(latest.jobId).toBe('job2');
    });

    it('filters by jobId', () => {
      const checkpoint1 = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        jobId: 'filter-job',
        context: {},
        plan: {}
      };

      const checkpoint2 = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        jobId: 'other-job',
        context: {},
        plan: {}
      };

      manager.save(checkpoint1);
      manager.save(checkpoint2);

      const latest = manager.loadLatest('filter-job');

      expect(latest.jobId).toBe('filter-job');
    });

    it('returns null when no checkpoints exist', () => {
      const result = manager.loadLatest();

      expect(result).toBeNull();
    });
  });

  describe('list', () => {
    it('lists all checkpoints', () => {
      const checkpoint = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        context: {},
        plan: {}
      };

      manager.save(checkpoint);
      manager.save(checkpoint);

      const list = manager.list();

      expect(list.length).toBe(2);
      expect(list[0]).toHaveProperty('filename');
      expect(list[0]).toHaveProperty('path');
      expect(list[0]).toHaveProperty('size');
      expect(list[0]).toHaveProperty('modified');
    });

    it('sorts by most recent first', async () => {
      const cp1 = { version: '1.0', timestamp: '2024-01-01', context: {}, plan: {} };
      const cp2 = { version: '1.0', timestamp: '2024-01-02', context: {}, plan: {} };

      manager.save(cp1);
      // Small delay to ensure different file modification times
      await new Promise(r => setTimeout(r, 10));
      manager.save(cp2);

      const list = manager.list();

      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list[0].modified >= list[1].modified).toBe(true);
    });

    it('filters by jobId', () => {
      manager.save({ version: '1.0', timestamp: 'x', jobId: 'a', context: {}, plan: {} });
      manager.save({ version: '1.0', timestamp: 'x', jobId: 'b', context: {}, plan: {} });

      const list = manager.list('a');

      expect(list.length).toBe(1);
      expect(list[0].filename).toContain('a');
    });

    it('returns empty array for non-existent directory', () => {
      const m = new CheckpointManager({ checkpointDir: '/nonexistent/dir' });
      // Reset _ensureDir side effect
      Object.defineProperty(m, 'checkpointDir', { value: '/nonexistent/dir' });

      const list = m.list();

      expect(list).toEqual([]);
    });
  });

  describe('deleteForJob', () => {
    it('deletes all checkpoints for job', () => {
      manager.save({ version: '1.0', timestamp: 'x', jobId: 'to-delete', context: {}, plan: {} });
      manager.save({ version: '1.0', timestamp: 'x', jobId: 'to-delete', context: {}, plan: {} });
      manager.save({ version: '1.0', timestamp: 'x', jobId: 'keep', context: {}, plan: {} });

      const deleted = manager.deleteForJob('to-delete');

      expect(deleted).toBe(2);
      expect(manager.list('to-delete').length).toBe(0);
      expect(manager.list('keep').length).toBe(1);
    });
  });

  describe('deleteAll', () => {
    it('deletes all checkpoints', () => {
      manager.save({ version: '1.0', timestamp: 'x', jobId: 'a', context: {}, plan: {} });
      manager.save({ version: '1.0', timestamp: 'x', jobId: 'b', context: {}, plan: {} });

      const deleted = manager.deleteAll();

      expect(deleted).toBe(2);
      expect(manager.list().length).toBe(0);
    });
  });

  describe('forOrchestrator', () => {
    it('creates manager wired to orchestrator', () => {
      const mockOrchestrator = {
        context: { jobId: 'orch-job' },
        on: jest.fn(),
        emit: jest.fn()
      };

      const m = CheckpointManager.forOrchestrator(mockOrchestrator, {
        checkpointDir: tempDir
      });

      expect(m).toBeInstanceOf(CheckpointManager);
      expect(mockOrchestrator.on).toHaveBeenCalledWith('checkpoint', expect.any(Function));
    });

    it('saves checkpoints when orchestrator emits', () => {
      let checkpointHandler = null;
      const mockOrchestrator = {
        context: { jobId: 'auto-save' },
        on: jest.fn((event, handler) => {
          if (event === 'checkpoint') checkpointHandler = handler;
        }),
        emit: jest.fn()
      };

      const m = CheckpointManager.forOrchestrator(mockOrchestrator, {
        checkpointDir: tempDir
      });

      // Simulate orchestrator emitting checkpoint
      checkpointHandler({
        version: '1.0',
        timestamp: new Date().toISOString(),
        jobId: 'auto-save',
        context: {},
        plan: {}
      });

      expect(m.list('auto-save').length).toBe(1);
      expect(mockOrchestrator.emit).toHaveBeenCalledWith(
        'checkpoint:saved',
        expect.objectContaining({ path: expect.any(String) })
      );
    });
  });
});

