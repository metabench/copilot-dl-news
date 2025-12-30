'use strict';

const { WorkDistributor } = require('../../../src/crawler/coordinator/WorkDistributor');
const { DomainLockManager } = require('../../../src/crawler/coordinator/DomainLockManager');

// Mock queue implementation
class MockQueue {
  constructor() {
    this._pending = [];
    this._dequeued = [];
  }

  async getPending({ limit = 100 } = {}) {
    return this._pending.slice(0, limit);
  }

  async dequeue({ domain, workerId } = {}) {
    const idx = this._pending.findIndex(u => u.domain === domain);
    if (idx === -1) return null;
    
    const item = this._pending.splice(idx, 1)[0];
    this._dequeued.push({ ...item, workerId });
    return item;
  }

  addPending(urls) {
    this._pending.push(...urls);
  }
}

describe('WorkDistributor', () => {
  let distributor;
  let mockQueue;
  let lockManager;

  beforeEach(() => {
    mockQueue = new MockQueue();
    lockManager = new DomainLockManager({
      lockTimeoutMs: 5000,
      logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn() }
    });
    
    distributor = new WorkDistributor({
      strategy: 'round-robin',
      lockManager,
      queue: mockQueue,
      logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn() }
    });
  });

  afterEach(async () => {
    await lockManager.clear();
    distributor.reset();
  });

  describe('getNextWork', () => {
    it('should return null when queue is empty', async () => {
      const work = await distributor.getNextWork('worker-1');
      expect(work).toBeNull();
    });

    it('should dequeue a URL and acquire lock', async () => {
      mockQueue.addPending([
        { url: 'https://example.com/page1', domain: 'example.com', priority: 100, depth: 0 }
      ]);

      const work = await distributor.getNextWork('worker-1');

      expect(work).not.toBeNull();
      expect(work.url).toBe('https://example.com/page1');
      expect(work.domain).toBe('example.com');
      
      // Lock should be held
      const lockStatus = await lockManager.isLocked('example.com');
      expect(lockStatus.locked).toBe(true);
      expect(lockStatus.holder).toBe('worker-1');
    });

    it('should skip domains locked by other workers', async () => {
      mockQueue.addPending([
        { url: 'https://locked.com/page1', domain: 'locked.com', priority: 100, depth: 0 },
        { url: 'https://available.com/page1', domain: 'available.com', priority: 100, depth: 0 }
      ]);

      // Lock first domain by another worker
      await lockManager.acquire('locked.com', 'worker-other');

      const work = await distributor.getNextWork('worker-1');

      expect(work.domain).toBe('available.com');
    });

    it('should track worker load', async () => {
      mockQueue.addPending([
        { url: 'https://example.com/page1', domain: 'example.com', priority: 100, depth: 0 }
      ]);

      await distributor.getNextWork('worker-1');

      expect(distributor.getWorkerLoad('worker-1')).toBe(1);
    });

    it('should track domain load', async () => {
      mockQueue.addPending([
        { url: 'https://example.com/page1', domain: 'example.com', priority: 100, depth: 0 }
      ]);

      await distributor.getNextWork('worker-1');

      expect(distributor.getDomainLoad('example.com')).toBe(1);
    });

    it('should respect preferDomain option', async () => {
      mockQueue.addPending([
        { url: 'https://domain1.com/page1', domain: 'domain1.com', priority: 100, depth: 0 },
        { url: 'https://domain2.com/page1', domain: 'domain2.com', priority: 100, depth: 0 }
      ]);

      const work = await distributor.getNextWork('worker-1', { preferDomain: 'domain2.com' });

      expect(work.domain).toBe('domain2.com');
    });
  });

  describe('workComplete', () => {
    it('should decrement load and release lock', async () => {
      mockQueue.addPending([
        { url: 'https://example.com/page1', domain: 'example.com', priority: 100, depth: 0 }
      ]);

      await distributor.getNextWork('worker-1');
      expect(distributor.getWorkerLoad('worker-1')).toBe(1);

      await distributor.workComplete('worker-1', 'example.com');

      expect(distributor.getWorkerLoad('worker-1')).toBe(0);
      
      const lockStatus = await lockManager.isLocked('example.com');
      expect(lockStatus.locked).toBe(false);
    });
  });

  describe('workFailed', () => {
    it('should decrement load and release lock on failure', async () => {
      mockQueue.addPending([
        { url: 'https://example.com/page1', domain: 'example.com', priority: 100, depth: 0 }
      ]);

      await distributor.getNextWork('worker-1');
      await distributor.workFailed('worker-1', 'example.com', { message: 'timeout' });

      expect(distributor.getWorkerLoad('worker-1')).toBe(0);
    });
  });

  describe('strategy: round-robin', () => {
    it('should cycle through domains', async () => {
      mockQueue.addPending([
        { url: 'https://domain1.com/page1', domain: 'domain1.com', priority: 100, depth: 0 },
        { url: 'https://domain2.com/page1', domain: 'domain2.com', priority: 100, depth: 0 },
        { url: 'https://domain1.com/page2', domain: 'domain1.com', priority: 100, depth: 0 },
        { url: 'https://domain2.com/page2', domain: 'domain2.com', priority: 100, depth: 0 }
      ]);

      // Get work with different workers to avoid lock conflicts
      const work1 = await distributor.getNextWork('worker-1');
      await distributor.workComplete('worker-1', work1.domain);
      
      const work2 = await distributor.getNextWork('worker-1');
      await distributor.workComplete('worker-1', work2.domain);

      // Should have gotten different domains (round-robin effect)
      expect([work1.domain, work2.domain]).toContain('domain1.com');
      expect([work1.domain, work2.domain]).toContain('domain2.com');
    });
  });

  describe('strategy: least-loaded', () => {
    it('should prefer domains with lower load', async () => {
      distributor.setStrategy('least-loaded');
      
      mockQueue.addPending([
        { url: 'https://loaded.com/page1', domain: 'loaded.com', priority: 100, depth: 0 },
        { url: 'https://empty.com/page1', domain: 'empty.com', priority: 100, depth: 0 }
      ]);

      // Simulate load on one domain
      distributor._domainLoads.set('loaded.com', 10);

      const work = await distributor.getNextWork('worker-1');

      expect(work.domain).toBe('empty.com');
    });
  });

  describe('strategy: priority', () => {
    it('should prefer domains with highest-priority URLs', async () => {
      distributor.setStrategy('priority');
      
      mockQueue.addPending([
        { url: 'https://low.com/page1', domain: 'low.com', priority: 50, depth: 0 },
        { url: 'https://high.com/page1', domain: 'high.com', priority: 200, depth: 0 }
      ]);

      const work = await distributor.getNextWork('worker-1');

      expect(work.domain).toBe('high.com');
    });
  });

  describe('setStrategy', () => {
    it('should change the distribution strategy', () => {
      distributor.setStrategy('least-loaded');
      expect(distributor.strategy).toBe('least-loaded');
    });

    it('should reject invalid strategies', () => {
      expect(() => distributor.setStrategy('invalid'))
        .toThrow('Invalid strategy');
    });
  });

  describe('getStats', () => {
    it('should return distribution statistics', async () => {
      mockQueue.addPending([
        { url: 'https://example.com/page1', domain: 'example.com', priority: 100, depth: 0 }
      ]);

      await distributor.getNextWork('worker-1');

      const stats = distributor.getStats();

      expect(stats.totalAssignments).toBe(1);
      expect(stats.strategy).toBe('round-robin');
      expect(stats.workerLoads['worker-1']).toBe(1);
    });
  });

  describe('clearWorker', () => {
    it('should remove worker state', async () => {
      mockQueue.addPending([
        { url: 'https://example.com/page1', domain: 'example.com', priority: 100, depth: 0 }
      ]);

      await distributor.getNextWork('worker-1');
      expect(distributor.getWorkerLoad('worker-1')).toBe(1);

      distributor.clearWorker('worker-1');

      expect(distributor.getWorkerLoad('worker-1')).toBe(0);
    });
  });

  describe('without lockManager', () => {
    it('should work without domain locking', async () => {
      distributor = new WorkDistributor({
        queue: mockQueue,
        logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn() }
      });

      mockQueue.addPending([
        { url: 'https://example.com/page1', domain: 'example.com', priority: 100, depth: 0 }
      ]);

      const work = await distributor.getNextWork('worker-1');

      expect(work).not.toBeNull();
      expect(work.domain).toBe('example.com');
    });
  });
});
