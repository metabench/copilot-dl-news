'use strict';

const { WorkerRegistry } = require('../../../src/crawler/coordinator/WorkerRegistry');

describe('WorkerRegistry', () => {
  let registry;

  beforeEach(async () => {
    registry = new WorkerRegistry({
      heartbeatIntervalMs: 500, // Long enough so auto-cleanup doesn't run during tests
      staleTimeoutMs: 100, // Short for faster tests
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
    });
    await registry.initialize();
  });

  afterEach(async () => {
    await registry.close();
  });

  describe('register', () => {
    it('should register a worker with required fields', async () => {
      const result = await registry.register({ id: 'worker-1' });
      
      expect(result.success).toBe(true);
      expect(result.worker.id).toBe('worker-1');
      expect(result.worker.status).toBe('active');
      expect(result.worker.registeredAt).toBeGreaterThan(0);
    });

    it('should register a worker with optional fields', async () => {
      const result = await registry.register({
        id: 'worker-2',
        hostname: 'test-host',
        pid: 12345,
        metadata: { version: '1.0.0' },
        capabilities: { maxConcurrency: 10 }
      });
      
      expect(result.success).toBe(true);
      expect(result.worker.hostname).toBe('test-host');
      expect(result.worker.pid).toBe(12345);
      expect(result.worker.metadata.version).toBe('1.0.0');
      expect(result.worker.capabilities.maxConcurrency).toBe(10);
    });

    it('should fail without worker ID', async () => {
      const result = await registry.register({});
      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should allow re-registration of same worker ID', async () => {
      await registry.register({ id: 'worker-1' });
      const result = await registry.register({ id: 'worker-1', hostname: 'new-host' });
      
      expect(result.success).toBe(true);
      expect(result.worker.hostname).toBe('new-host');
    });

    it('should emit worker:registered event', async () => {
      const handler = jest.fn();
      registry.on('worker:registered', handler);
      
      await registry.register({ id: 'worker-1' });
      
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'worker-1' })
      );
    });
  });

  describe('heartbeat', () => {
    it('should update lastHeartbeat timestamp', async () => {
      await registry.register({ id: 'worker-1' });
      const before = (await registry.getWorker('worker-1')).lastHeartbeat;
      
      await new Promise(r => setTimeout(r, 10));
      await registry.heartbeat('worker-1');
      
      const after = (await registry.getWorker('worker-1')).lastHeartbeat;
      expect(after).toBeGreaterThan(before);
    });

    it('should update status fields if provided', async () => {
      await registry.register({ id: 'worker-1' });
      await registry.heartbeat('worker-1', { load: 5, urlsProcessed: 100 });
      
      const worker = await registry.getWorker('worker-1');
      expect(worker.load).toBe(5);
      expect(worker.urlsProcessed).toBe(100);
    });

    it('should fail for unregistered worker', async () => {
      const result = await registry.heartbeat('unknown-worker');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not registered');
    });
  });

  describe('deregister', () => {
    it('should remove worker from registry', async () => {
      await registry.register({ id: 'worker-1' });
      await registry.deregister('worker-1');
      
      const worker = await registry.getWorker('worker-1');
      expect(worker).toBeNull();
    });

    it('should emit worker:deregistered event', async () => {
      const handler = jest.fn();
      registry.on('worker:deregistered', handler);
      
      await registry.register({ id: 'worker-1' });
      await registry.deregister('worker-1');
      
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'worker-1' })
      );
    });

    it('should succeed for non-existent worker', async () => {
      const result = await registry.deregister('unknown');
      expect(result.success).toBe(true);
    });
  });

  describe('getWorkers', () => {
    it('should return only active workers', async () => {
      await registry.register({ id: 'worker-1' });
      await registry.register({ id: 'worker-2' });
      await registry.deregister('worker-2');
      
      const workers = await registry.getWorkers();
      expect(workers.length).toBe(1);
      expect(workers[0].id).toBe('worker-1');
    });
  });

  describe('getCount', () => {
    it('should return count of active workers', async () => {
      await registry.register({ id: 'worker-1' });
      await registry.register({ id: 'worker-2' });
      
      const count = await registry.getCount();
      expect(count).toBe(2);
    });
  });

  describe('stale worker cleanup', () => {
    it('should remove workers that miss heartbeats', async () => {
      await registry.register({ id: 'worker-1' });
      
      // Wait for stale timeout (100ms) + buffer
      await new Promise(r => setTimeout(r, 150));
      
      // Force cleanup
      const stale = await registry.cleanupStaleWorkers();
      
      expect(stale.length).toBe(1);
      expect(stale[0].id).toBe('worker-1');
      expect(await registry.getCount()).toBe(0);
    });

    it('should emit worker:stale event', async () => {
      const handler = jest.fn();
      registry.on('worker:stale', handler);
      
      await registry.register({ id: 'worker-1' });
      await new Promise(r => setTimeout(r, 150));
      await registry.cleanupStaleWorkers();
      
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'worker-1' })
      );
    });

    it('should not remove workers with recent heartbeats', async () => {
      await registry.register({ id: 'worker-1' });
      
      // Send heartbeat before timeout (100ms)
      await new Promise(r => setTimeout(r, 50));
      await registry.heartbeat('worker-1');
      await new Promise(r => setTimeout(r, 50));
      
      const stale = await registry.cleanupStaleWorkers();
      expect(stale.length).toBe(0);
      expect(await registry.getCount()).toBe(1);
    });
  });

  describe('getWorkersByCapability', () => {
    beforeEach(async () => {
      await registry.register({
        id: 'worker-1',
        capabilities: { maxConcurrency: 10, hasPuppeteer: true }
      });
      await registry.register({
        id: 'worker-2',
        capabilities: { maxConcurrency: 5 }
      });
    });

    it('should filter workers by capability existence', async () => {
      const workers = await registry.getWorkersByCapability('hasPuppeteer');
      expect(workers.length).toBe(1);
      expect(workers[0].id).toBe('worker-1');
    });

    it('should filter workers by capability value', async () => {
      const workers = await registry.getWorkersByCapability('maxConcurrency', 10);
      expect(workers.length).toBe(1);
      expect(workers[0].id).toBe('worker-1');
    });
  });

  describe('getStats', () => {
    it('should return registry statistics', async () => {
      await registry.register({ id: 'worker-1', hostname: 'host-1' });
      await registry.register({ id: 'worker-2', hostname: 'host-2' });
      
      const stats = await registry.getStats();
      
      expect(stats.total).toBe(2);
      expect(stats.active).toBe(2);
      expect(stats.hosts).toContain('host-1');
      expect(stats.hosts).toContain('host-2');
    });
  });

  describe('updateMetadata', () => {
    it('should merge metadata into worker', async () => {
      await registry.register({ id: 'worker-1', metadata: { a: 1 } });
      await registry.updateMetadata('worker-1', { b: 2 });
      
      const worker = await registry.getWorker('worker-1');
      expect(worker.metadata).toEqual({ a: 1, b: 2 });
    });

    it('should fail for unknown worker', async () => {
      const result = await registry.updateMetadata('unknown', { x: 1 });
      expect(result.success).toBe(false);
    });
  });
});
