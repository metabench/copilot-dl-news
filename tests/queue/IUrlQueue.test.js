'use strict';

const { IUrlQueue } = require('../../src/queue/IUrlQueue');
const { SqliteUrlQueueAdapter } = require('../../src/queue/SqliteUrlQueueAdapter');
const { PostgresUrlQueueAdapter } = require('../../src/queue/PostgresUrlQueueAdapter');
const { QueueFactory } = require('../../src/queue/QueueFactory');

/**
 * URL Queue System Tests
 * 
 * Tests the IUrlQueue interface contract and both adapters.
 * Uses in-memory SQLite and Postgres stub mode for testing.
 */

describe('IUrlQueue Interface', () => {
  test('IUrlQueue is an abstract class that throws on all methods', () => {
    const queue = new IUrlQueue();
    
    expect(() => queue.initialize()).rejects.toThrow('Not implemented');
    expect(() => queue.enqueue({})).rejects.toThrow('Not implemented');
    expect(() => queue.enqueueBatch([])).rejects.toThrow('Not implemented');
    expect(() => queue.dequeue()).rejects.toThrow('Not implemented');
    expect(() => queue.markComplete('url')).rejects.toThrow('Not implemented');
    expect(() => queue.markFailed('url')).rejects.toThrow('Not implemented');
    expect(() => queue.returnToPending('url')).rejects.toThrow('Not implemented');
    expect(() => queue.getPending()).rejects.toThrow('Not implemented');
    expect(() => queue.getStats()).rejects.toThrow('Not implemented');
    expect(() => queue.has('url')).rejects.toThrow('Not implemented');
    expect(() => queue.get('url')).rejects.toThrow('Not implemented');
    expect(() => queue.updatePriority('url', 1)).rejects.toThrow('Not implemented');
    expect(() => queue.recoverStale(1000)).rejects.toThrow('Not implemented');
    expect(() => queue.clear()).rejects.toThrow('Not implemented');
    expect(() => queue.close()).rejects.toThrow('Not implemented');
    expect(() => queue.backendType).toThrow('Not implemented');
  });

  test('IUrlQueue has STATUS constants', () => {
    expect(IUrlQueue.STATUS.PENDING).toBe('pending');
    expect(IUrlQueue.STATUS.IN_PROGRESS).toBe('in-progress');
    expect(IUrlQueue.STATUS.COMPLETED).toBe('completed');
    expect(IUrlQueue.STATUS.FAILED).toBe('failed');
  });
});

describe('SqliteUrlQueueAdapter', () => {
  let queue;

  beforeEach(async () => {
    // Use in-memory database for tests
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    
    queue = new SqliteUrlQueueAdapter({
      db,
      tableName: 'test_queue',
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    });
    await queue.initialize();
  });

  afterEach(async () => {
    if (queue) {
      await queue.close();
    }
  });

  test('backendType returns sqlite', () => {
    expect(queue.backendType).toBe('sqlite');
  });

  test('initialize is idempotent', async () => {
    await queue.initialize();
    await queue.initialize();
    // No error means success
  });

  test('enqueue adds a URL to the queue', async () => {
    const result = await queue.enqueue({
      url: 'https://example.com/page1',
      domain: 'example.com',
      priority: 100,
      depth: 1
    });

    expect(result.inserted).toBe(true);
    expect(typeof result.id).toBe('number');

    const stats = await queue.getStats();
    expect(stats.pending).toBe(1);
    expect(stats.total).toBe(1);
  });

  test('enqueue skips duplicates', async () => {
    await queue.enqueue({ url: 'https://example.com/dupe', domain: 'example.com' });
    const result = await queue.enqueue({ url: 'https://example.com/dupe', domain: 'example.com' });

    expect(result.inserted).toBe(false);

    const stats = await queue.getStats();
    expect(stats.total).toBe(1);
  });

  test('enqueue extracts domain from URL if not provided', async () => {
    await queue.enqueue({ url: 'https://auto-domain.com/path' });

    const item = await queue.get('https://auto-domain.com/path');
    expect(item.domain).toBe('auto-domain.com');
  });

  test('enqueueBatch adds multiple URLs', async () => {
    const items = [
      { url: 'https://example.com/a', domain: 'example.com', priority: 50 },
      { url: 'https://example.com/b', domain: 'example.com', priority: 75 },
      { url: 'https://example.com/c', domain: 'example.com', priority: 25 }
    ];

    const result = await queue.enqueueBatch(items);

    expect(result.inserted).toBe(3);
    expect(result.skipped).toBe(0);

    const stats = await queue.getStats();
    expect(stats.pending).toBe(3);
  });

  test('enqueueBatch skips duplicates in batch', async () => {
    await queue.enqueue({ url: 'https://example.com/existing', domain: 'example.com' });

    const items = [
      { url: 'https://example.com/new1', domain: 'example.com' },
      { url: 'https://example.com/existing', domain: 'example.com' }, // duplicate
      { url: 'https://example.com/new2', domain: 'example.com' }
    ];

    const result = await queue.enqueueBatch(items);

    expect(result.inserted).toBe(2);
    expect(result.skipped).toBe(1);
  });

  test('enqueueBatch handles empty array', async () => {
    const result = await queue.enqueueBatch([]);
    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(0);
  });

  test('dequeue returns highest priority URL first', async () => {
    await queue.enqueueBatch([
      { url: 'https://example.com/low', domain: 'example.com', priority: 10 },
      { url: 'https://example.com/high', domain: 'example.com', priority: 100 },
      { url: 'https://example.com/mid', domain: 'example.com', priority: 50 }
    ]);

    const first = await queue.dequeue();
    expect(first.url).toBe('https://example.com/high');
    expect(first.status).toBe('in-progress');

    const second = await queue.dequeue();
    expect(second.url).toBe('https://example.com/mid');
  });

  test('dequeue returns null when queue is empty', async () => {
    const result = await queue.dequeue();
    expect(result).toBeNull();
  });

  test('dequeue filters by domain', async () => {
    await queue.enqueueBatch([
      { url: 'https://a.com/page', domain: 'a.com', priority: 50 },
      { url: 'https://b.com/page', domain: 'b.com', priority: 100 }
    ]);

    const result = await queue.dequeue({ domain: 'a.com' });
    expect(result.url).toBe('https://a.com/page');
    expect(result.domain).toBe('a.com');
  });

  test('dequeue assigns workerId', async () => {
    await queue.enqueue({ url: 'https://example.com/work', domain: 'example.com' });

    const result = await queue.dequeue({ workerId: 'worker-42' });
    expect(result.workerId).toBe('worker-42');
  });

  test('markComplete changes status to completed', async () => {
    await queue.enqueue({ url: 'https://example.com/complete', domain: 'example.com' });
    await queue.dequeue();
    
    await queue.markComplete('https://example.com/complete');

    const item = await queue.get('https://example.com/complete');
    expect(item.status).toBe('completed');

    const stats = await queue.getStats();
    expect(stats.completed).toBe(1);
    expect(stats.inProgress).toBe(0);
  });

  test('markFailed changes status to failed and increments retryCount', async () => {
    await queue.enqueue({ url: 'https://example.com/fail', domain: 'example.com' });
    await queue.dequeue();
    
    await queue.markFailed('https://example.com/fail', { message: 'Connection timeout' });

    const item = await queue.get('https://example.com/fail');
    expect(item.status).toBe('failed');
    expect(item.retryCount).toBe(1);
    expect(item.errorMessage).toBe('Connection timeout');

    const stats = await queue.getStats();
    expect(stats.failed).toBe(1);
  });

  test('returnToPending returns URL to pending status', async () => {
    await queue.enqueue({ url: 'https://example.com/retry', domain: 'example.com' });
    await queue.dequeue({ workerId: 'worker-1' });
    
    await queue.returnToPending('https://example.com/retry');

    const item = await queue.get('https://example.com/retry');
    expect(item.status).toBe('pending');
    expect(item.workerId).toBeNull();
  });

  test('getPending returns pending URLs ordered by priority', async () => {
    await queue.enqueueBatch([
      { url: 'https://example.com/a', domain: 'example.com', priority: 30 },
      { url: 'https://example.com/b', domain: 'example.com', priority: 70 },
      { url: 'https://example.com/c', domain: 'example.com', priority: 50 }
    ]);

    const pending = await queue.getPending();
    expect(pending.length).toBe(3);
    expect(pending[0].url).toBe('https://example.com/b'); // highest priority first
    expect(pending[1].url).toBe('https://example.com/c');
    expect(pending[2].url).toBe('https://example.com/a');
  });

  test('getPending respects limit and domain filter', async () => {
    await queue.enqueueBatch([
      { url: 'https://a.com/1', domain: 'a.com', priority: 10 },
      { url: 'https://a.com/2', domain: 'a.com', priority: 20 },
      { url: 'https://b.com/1', domain: 'b.com', priority: 30 }
    ]);

    const pending = await queue.getPending({ domain: 'a.com', limit: 1 });
    expect(pending.length).toBe(1);
    expect(pending[0].domain).toBe('a.com');
  });

  test('getStats returns correct counts', async () => {
    await queue.enqueueBatch([
      { url: 'https://example.com/1', domain: 'example.com' },
      { url: 'https://example.com/2', domain: 'example.com' },
      { url: 'https://example.com/3', domain: 'example.com' },
      { url: 'https://example.com/4', domain: 'example.com' }
    ]);

    await queue.dequeue(); // 1 in-progress
    const item2 = await queue.dequeue();
    await queue.markComplete(item2.url); // 1 completed
    const item3 = await queue.dequeue();
    await queue.markFailed(item3.url, { message: 'Error' }); // 1 failed
    // 1 remaining pending

    const stats = await queue.getStats();
    expect(stats.pending).toBe(1);
    expect(stats.inProgress).toBe(1);
    expect(stats.completed).toBe(1);
    expect(stats.failed).toBe(1);
    expect(stats.total).toBe(4);
  });

  test('has returns true for existing URLs', async () => {
    await queue.enqueue({ url: 'https://example.com/exists', domain: 'example.com' });

    expect(await queue.has('https://example.com/exists')).toBe(true);
    expect(await queue.has('https://example.com/not-exists')).toBe(false);
  });

  test('get returns URL details', async () => {
    await queue.enqueue({
      url: 'https://example.com/details',
      domain: 'example.com',
      priority: 42,
      depth: 3,
      parentUrl: 'https://example.com/'
    });

    const item = await queue.get('https://example.com/details');
    expect(item.url).toBe('https://example.com/details');
    expect(item.domain).toBe('example.com');
    expect(item.priority).toBe(42);
    expect(item.depth).toBe(3);
    expect(item.parentUrl).toBe('https://example.com/');
    expect(item.status).toBe('pending');
  });

  test('get returns null for non-existent URL', async () => {
    const item = await queue.get('https://example.com/not-found');
    expect(item).toBeNull();
  });

  test('updatePriority changes URL priority', async () => {
    await queue.enqueue({ url: 'https://example.com/update', domain: 'example.com', priority: 10 });

    const updated = await queue.updatePriority('https://example.com/update', 999);
    expect(updated).toBe(true);

    const item = await queue.get('https://example.com/update');
    expect(item.priority).toBe(999);
  });

  test('updatePriority returns false for non-existent URL', async () => {
    const updated = await queue.updatePriority('https://example.com/not-found', 999);
    expect(updated).toBe(false);
  });

  test('clear removes all URLs', async () => {
    await queue.enqueueBatch([
      { url: 'https://example.com/1', domain: 'example.com' },
      { url: 'https://example.com/2', domain: 'example.com' }
    ]);

    await queue.clear();

    const stats = await queue.getStats();
    expect(stats.total).toBe(0);
  });

  test('operations throw when not initialized', async () => {
    const uninitQueue = new SqliteUrlQueueAdapter({
      dbPath: ':memory:',
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    });

    await expect(uninitQueue.enqueue({ url: 'test' }))
      .rejects.toThrow('not initialized');
  });

  test('enqueue stores and retrieves meta', async () => {
    await queue.enqueue({
      url: 'https://example.com/meta',
      domain: 'example.com',
      meta: { jobId: 'job-123', type: 'article' }
    });

    const item = await queue.get('https://example.com/meta');
    expect(item.meta).toEqual({ jobId: 'job-123', type: 'article' });
  });
});

describe('PostgresUrlQueueAdapter (Stub Mode)', () => {
  let queue;

  beforeEach(async () => {
    // Create adapter without connection string - will use stub mode
    queue = new PostgresUrlQueueAdapter({
      tableName: 'test_queue',
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
    });
    await queue.initialize();
  });

  afterEach(async () => {
    if (queue) {
      await queue.close();
    }
  });

  test('backendType returns postgres', () => {
    expect(queue.backendType).toBe('postgres');
  });

  test('runs in stub mode without connection string', () => {
    expect(queue.isStubMode).toBe(true);
  });

  test('enqueue and dequeue work in stub mode', async () => {
    const result = await queue.enqueue({
      url: 'https://stub.com/page',
      domain: 'stub.com',
      priority: 100
    });
    expect(result.inserted).toBe(true);

    const item = await queue.dequeue();
    expect(item.url).toBe('https://stub.com/page');
    expect(item.status).toBe('in-progress');
  });

  test('getStats works in stub mode', async () => {
    await queue.enqueue({ url: 'https://stub.com/1', domain: 'stub.com' });
    await queue.enqueue({ url: 'https://stub.com/2', domain: 'stub.com' });
    await queue.dequeue();

    const stats = await queue.getStats();
    expect(stats.pending).toBe(1);
    expect(stats.inProgress).toBe(1);
    expect(stats.total).toBe(2);
  });

  test('markComplete works in stub mode', async () => {
    await queue.enqueue({ url: 'https://stub.com/complete', domain: 'stub.com' });
    await queue.dequeue();
    await queue.markComplete('https://stub.com/complete');

    const stats = await queue.getStats();
    expect(stats.completed).toBe(1);
  });

  test('markFailed works in stub mode', async () => {
    await queue.enqueue({ url: 'https://stub.com/fail', domain: 'stub.com' });
    await queue.dequeue();
    await queue.markFailed('https://stub.com/fail', { message: 'Error' });

    const stats = await queue.getStats();
    expect(stats.failed).toBe(1);
  });

  test('returnToPending works in stub mode', async () => {
    await queue.enqueue({ url: 'https://stub.com/retry', domain: 'stub.com' });
    await queue.dequeue();
    await queue.returnToPending('https://stub.com/retry');

    const stats = await queue.getStats();
    expect(stats.pending).toBe(1);
    expect(stats.inProgress).toBe(0);
  });

  test('clear works in stub mode', async () => {
    await queue.enqueue({ url: 'https://stub.com/1', domain: 'stub.com' });
    await queue.enqueue({ url: 'https://stub.com/2', domain: 'stub.com' });
    await queue.clear();

    const stats = await queue.getStats();
    expect(stats.total).toBe(0);
  });

  test('priority ordering works in stub mode', async () => {
    await queue.enqueue({ url: 'https://stub.com/low', domain: 'stub.com', priority: 10 });
    await queue.enqueue({ url: 'https://stub.com/high', domain: 'stub.com', priority: 100 });

    const first = await queue.dequeue();
    expect(first.url).toBe('https://stub.com/high');
  });
});

describe('QueueFactory', () => {
  test('create returns SQLite adapter by default', async () => {
    const queue = await QueueFactory.create({
      backend: 'sqlite',
      sqliteOptions: { dbPath: ':memory:' },
      logger: { info: jest.fn(), warn: jest.fn() }
    });

    expect(queue.backendType).toBe('sqlite');
    await queue.close();
  });

  test('create returns Postgres adapter in stub mode', async () => {
    const queue = await QueueFactory.create({
      backend: 'postgres',
      logger: { info: jest.fn(), warn: jest.fn() }
    });

    expect(queue.backendType).toBe('postgres');
    expect(queue.isStubMode).toBe(true);
    await queue.close();
  });

  test('create throws for unknown backend', async () => {
    await expect(QueueFactory.create({ backend: 'redis' }))
      .rejects.toThrow('Unknown queue backend: redis');
  });

  test('getConfig returns default config', () => {
    const config = QueueFactory.getConfig('/non/existent/path.json');
    
    expect(config.backend).toBe('sqlite');
    expect(config.sqlite.dbPath).toBe('data/news.db');
    expect(config.postgres.tableName).toBe('url_queue');
  });

  test('getAvailableBackends returns list', () => {
    const backends = QueueFactory.getAvailableBackends();
    expect(backends).toContain('sqlite');
    expect(backends).toContain('postgres');
  });
});

describe('Queue Contract Tests', () => {
  // These tests verify both adapters implement the interface correctly
  const adapters = [
    {
      name: 'SqliteUrlQueueAdapter',
      create: async () => {
        const Database = require('better-sqlite3');
        const db = new Database(':memory:');
        const queue = new SqliteUrlQueueAdapter({
          db,
          tableName: 'contract_test',
          logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
        });
        await queue.initialize();
        return queue;
      }
    },
    {
      name: 'PostgresUrlQueueAdapter (stub)',
      create: async () => {
        const queue = new PostgresUrlQueueAdapter({
          tableName: 'contract_test',
          logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
        });
        await queue.initialize();
        return queue;
      }
    }
  ];

  adapters.forEach(({ name, create }) => {
    describe(`${name} contract compliance`, () => {
      let queue;

      beforeEach(async () => {
        queue = await create();
      });

      afterEach(async () => {
        if (queue) {
          await queue.close();
        }
      });

      test('implements full lifecycle: enqueue → dequeue → complete', async () => {
        // Enqueue
        const enqueueResult = await queue.enqueue({
          url: 'https://test.com/lifecycle',
          domain: 'test.com',
          priority: 50,
          depth: 1
        });
        expect(enqueueResult.inserted).toBe(true);

        // Verify pending
        const statsBefore = await queue.getStats();
        expect(statsBefore.pending).toBe(1);

        // Dequeue
        const item = await queue.dequeue({ workerId: 'test-worker' });
        expect(item).not.toBeNull();
        expect(item.url).toBe('https://test.com/lifecycle');
        expect(item.status).toBe('in-progress');

        // Verify in-progress
        const statsInProgress = await queue.getStats();
        expect(statsInProgress.pending).toBe(0);
        expect(statsInProgress.inProgress).toBe(1);

        // Complete
        await queue.markComplete(item.url);

        // Verify completed
        const statsAfter = await queue.getStats();
        expect(statsAfter.completed).toBe(1);
        expect(statsAfter.inProgress).toBe(0);
      });

      test('implements full lifecycle: enqueue → dequeue → fail → retry', async () => {
        // Enqueue
        await queue.enqueue({
          url: 'https://test.com/retry-cycle',
          domain: 'test.com'
        });

        // First attempt - fail
        const item1 = await queue.dequeue();
        await queue.markFailed(item1.url, { message: 'First failure' });

        // Return to pending for retry
        await queue.returnToPending(item1.url);

        // Second attempt - success
        const item2 = await queue.dequeue();
        expect(item2.url).toBe('https://test.com/retry-cycle');
        await queue.markComplete(item2.url);

        const stats = await queue.getStats();
        expect(stats.completed).toBe(1);
      });

      test('enqueueBatch and getPending work together', async () => {
        const urls = Array.from({ length: 5 }, (_, i) => ({
          url: `https://test.com/batch/${i}`,
          domain: 'test.com',
          priority: i * 10,
          depth: 0
        }));

        const batchResult = await queue.enqueueBatch(urls);
        expect(batchResult.inserted).toBe(5);

        const pending = await queue.getPending({ limit: 3 });
        expect(pending.length).toBe(3);
        // Should be ordered by priority descending
        expect(pending[0].priority).toBeGreaterThanOrEqual(pending[1].priority);
      });
    });
  });
});
