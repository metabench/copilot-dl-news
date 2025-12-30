'use strict';

const { DomainLockManager } = require('../../../src/crawler/coordinator/DomainLockManager');

describe('DomainLockManager', () => {
  let lockManager;

  beforeEach(() => {
    lockManager = new DomainLockManager({
      lockTimeoutMs: 1000,
      maxLocksPerWorker: 3,
      logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn() }
    });
  });

  afterEach(async () => {
    await lockManager.clear();
  });

  describe('acquire', () => {
    it('should acquire a lock on an unlocked domain', async () => {
      const result = await lockManager.acquire('example.com', 'worker-1');
      
      expect(result.acquired).toBe(true);
    });

    it('should prevent another worker from acquiring the same domain', async () => {
      await lockManager.acquire('example.com', 'worker-1');
      const result = await lockManager.acquire('example.com', 'worker-2');
      
      expect(result.acquired).toBe(false);
      expect(result.holder).toBe('worker-1');
      expect(result.expiresIn).toBeGreaterThan(0);
    });

    it('should allow the same worker to renew their lock', async () => {
      await lockManager.acquire('example.com', 'worker-1');
      const result = await lockManager.acquire('example.com', 'worker-1');
      
      expect(result.acquired).toBe(true);
    });

    it('should enforce maxLocksPerWorker', async () => {
      await lockManager.acquire('domain1.com', 'worker-1');
      await lockManager.acquire('domain2.com', 'worker-1');
      await lockManager.acquire('domain3.com', 'worker-1');
      
      const result = await lockManager.acquire('domain4.com', 'worker-1');
      
      expect(result.acquired).toBe(false);
      expect(result.reason).toContain('max locks');
    });

    it('should require domain and workerId', async () => {
      let result = await lockManager.acquire(null, 'worker-1');
      expect(result.acquired).toBe(false);
      
      result = await lockManager.acquire('example.com', null);
      expect(result.acquired).toBe(false);
    });

    it('should allow lock after expiration', async () => {
      // Use short timeout for test
      lockManager = new DomainLockManager({ lockTimeoutMs: 50 });
      
      await lockManager.acquire('example.com', 'worker-1');
      await new Promise(r => setTimeout(r, 100));
      
      const result = await lockManager.acquire('example.com', 'worker-2');
      expect(result.acquired).toBe(true);
    });
  });

  describe('release', () => {
    it('should release a held lock', async () => {
      await lockManager.acquire('example.com', 'worker-1');
      const result = await lockManager.release('example.com', 'worker-1');
      
      expect(result.released).toBe(true);
    });

    it('should allow another worker to acquire after release', async () => {
      await lockManager.acquire('example.com', 'worker-1');
      await lockManager.release('example.com', 'worker-1');
      
      const result = await lockManager.acquire('example.com', 'worker-2');
      expect(result.acquired).toBe(true);
    });

    it('should not release lock held by another worker', async () => {
      await lockManager.acquire('example.com', 'worker-1');
      const result = await lockManager.release('example.com', 'worker-2');
      
      expect(result.released).toBe(false);
      expect(result.reason).toContain('Not lock holder');
    });

    it('should succeed for non-existent lock', async () => {
      const result = await lockManager.release('unknown.com', 'worker-1');
      expect(result.released).toBe(true);
    });
  });

  describe('extend', () => {
    it('should extend lock expiration', async () => {
      await lockManager.acquire('example.com', 'worker-1');
      const before = (await lockManager.getLocks())[0].expiresAt;
      
      await new Promise(r => setTimeout(r, 50));
      const result = await lockManager.extend('example.com', 'worker-1');
      
      expect(result.extended).toBe(true);
      expect(result.expiresAt).toBeGreaterThan(before);
    });

    it('should fail for non-holder', async () => {
      await lockManager.acquire('example.com', 'worker-1');
      const result = await lockManager.extend('example.com', 'worker-2');
      
      expect(result.extended).toBe(false);
    });

    it('should fail for expired lock', async () => {
      lockManager = new DomainLockManager({ lockTimeoutMs: 50 });
      await lockManager.acquire('example.com', 'worker-1');
      await new Promise(r => setTimeout(r, 100));
      
      const result = await lockManager.extend('example.com', 'worker-1');
      expect(result.extended).toBe(false);
    });
  });

  describe('getLocks', () => {
    it('should return all active locks', async () => {
      await lockManager.acquire('domain1.com', 'worker-1');
      await lockManager.acquire('domain2.com', 'worker-2');
      
      const locks = await lockManager.getLocks();
      
      expect(locks.length).toBe(2);
      expect(locks.map(l => l.domain)).toContain('domain1.com');
      expect(locks.map(l => l.domain)).toContain('domain2.com');
    });

    it('should not include expired locks', async () => {
      lockManager = new DomainLockManager({ lockTimeoutMs: 50 });
      await lockManager.acquire('example.com', 'worker-1');
      await new Promise(r => setTimeout(r, 100));
      
      const locks = await lockManager.getLocks();
      expect(locks.length).toBe(0);
    });
  });

  describe('getWorkerLocks', () => {
    it('should return domains locked by a worker', async () => {
      await lockManager.acquire('domain1.com', 'worker-1');
      await lockManager.acquire('domain2.com', 'worker-1');
      await lockManager.acquire('domain3.com', 'worker-2');
      
      const locks = await lockManager.getWorkerLocks('worker-1');
      
      expect(locks.length).toBe(2);
      expect(locks).toContain('domain1.com');
      expect(locks).toContain('domain2.com');
    });
  });

  describe('getAvailableDomains', () => {
    it('should filter out locked domains', async () => {
      await lockManager.acquire('domain1.com', 'worker-1');
      
      const available = await lockManager.getAvailableDomains(
        ['domain1.com', 'domain2.com', 'domain3.com']
      );
      
      expect(available).toEqual(['domain2.com', 'domain3.com']);
    });

    it('should include domains locked by requesting worker', async () => {
      await lockManager.acquire('domain1.com', 'worker-1');
      
      const available = await lockManager.getAvailableDomains(
        ['domain1.com', 'domain2.com'],
        'worker-1'
      );
      
      expect(available).toContain('domain1.com');
    });
  });

  describe('isLocked', () => {
    it('should return lock status', async () => {
      await lockManager.acquire('example.com', 'worker-1');
      
      let status = await lockManager.isLocked('example.com');
      expect(status.locked).toBe(true);
      expect(status.holder).toBe('worker-1');
      
      status = await lockManager.isLocked('other.com');
      expect(status.locked).toBe(false);
    });
  });

  describe('releaseAll', () => {
    it('should release all locks for a worker', async () => {
      await lockManager.acquire('domain1.com', 'worker-1');
      await lockManager.acquire('domain2.com', 'worker-1');
      await lockManager.acquire('domain3.com', 'worker-2');
      
      const result = await lockManager.releaseAll('worker-1');
      
      expect(result.released).toBe(2);
      
      const locks = await lockManager.getLocks();
      expect(locks.length).toBe(1);
      expect(locks[0].workerId).toBe('worker-2');
    });
  });

  describe('cleanup', () => {
    it('should remove expired locks', async () => {
      lockManager = new DomainLockManager({ lockTimeoutMs: 50 });
      await lockManager.acquire('example.com', 'worker-1');
      await new Promise(r => setTimeout(r, 100));
      
      const result = await lockManager.cleanup();
      
      expect(result.cleaned).toBe(1);
    });
  });

  describe('getStats', () => {
    it('should return lock statistics', async () => {
      await lockManager.acquire('domain1.com', 'worker-1');
      await lockManager.acquire('domain2.com', 'worker-1');
      await lockManager.acquire('domain3.com', 'worker-2');
      
      const stats = await lockManager.getStats();
      
      expect(stats.active).toBe(3);
      expect(stats.workerCount).toBe(2);
      expect(stats.locksPerWorker['worker-1']).toBe(2);
      expect(stats.locksPerWorker['worker-2']).toBe(1);
    });
  });
});
