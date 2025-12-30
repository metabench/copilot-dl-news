'use strict';

/**
 * Unit tests for ProxyManager
 * @module tests/crawler/unit/ProxyManager.test
 */

const { ProxyManager } = require('../../../src/crawler/ProxyManager');

describe('ProxyManager', () => {
  /** @type {ProxyManager} */
  let manager;
  
  const mockConfig = {
    enabled: true,
    providers: [
      { name: 'proxy1', type: 'http', host: '192.168.1.1', port: 8080, priority: 1 },
      { name: 'proxy2', type: 'http', host: '192.168.1.2', port: 8080, priority: 2 },
      { name: 'proxy3', type: 'socks5', host: '192.168.1.3', port: 1080, priority: 3, tags: ['residential'] }
    ],
    strategy: 'round-robin',
    failover: {
      enabled: true,
      banThresholdFailures: 3,
      banDurationMs: 5000,
      triggerOnStatusCodes: [403, 429]
    }
  };

  beforeEach(() => {
    manager = new ProxyManager({ 
      config: mockConfig,
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    });
  });

  describe('isEnabled', () => {
    it('should return true when enabled with providers', () => {
      expect(manager.isEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      const disabled = new ProxyManager({
        config: { ...mockConfig, enabled: false },
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
      });
      expect(disabled.isEnabled()).toBe(false);
    });

    it('should return false when no providers', () => {
      const noProviders = new ProxyManager({
        config: { enabled: true, providers: [] },
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
      });
      expect(noProviders.isEnabled()).toBe(false);
    });
  });

  describe('getProxy', () => {
    it('should return a proxy when enabled', () => {
      const proxy = manager.getProxy();
      expect(proxy).not.toBeNull();
      expect(proxy).toHaveProperty('url');
      expect(proxy).toHaveProperty('name');
      expect(proxy).toHaveProperty('type');
    });

    it('should return null when disabled', () => {
      const disabled = new ProxyManager({
        config: { ...mockConfig, enabled: false },
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
      });
      expect(disabled.getProxy()).toBeNull();
    });

    it('should rotate through proxies with round-robin', () => {
      const seen = new Set();
      for (let i = 0; i < 6; i++) {
        const proxy = manager.getProxy();
        seen.add(proxy.name);
      }
      expect(seen.size).toBe(3); // All 3 proxies used
    });

    it('should exclude specified proxy names', () => {
      const proxy = manager.getProxy(null, { excludeNames: ['proxy1', 'proxy2'] });
      expect(proxy.name).toBe('proxy3');
    });

    it('should filter by required tags', () => {
      const proxy = manager.getProxy(null, { requireTags: ['residential'] });
      expect(proxy.name).toBe('proxy3');
    });

    it('should return null when all filtered out', () => {
      const proxy = manager.getProxy(null, { requireTags: ['nonexistent'] });
      expect(proxy).toBeNull();
    });

    it('should build correct URL for HTTP proxy', () => {
      const proxy = manager.getProxy(null, { excludeNames: ['proxy2', 'proxy3'] });
      expect(proxy.url).toBe('http://192.168.1.1:8080');
    });

    it('should build correct URL for SOCKS5 proxy', () => {
      const proxy = manager.getProxy(null, { excludeNames: ['proxy1', 'proxy2'] });
      expect(proxy.url).toBe('socks5://192.168.1.3:1080');
    });

    it('should include auth in URL when provided', () => {
      const withAuth = new ProxyManager({
        config: {
          enabled: true,
          providers: [{
            name: 'auth-proxy',
            type: 'http',
            host: 'example.com',
            port: 8080,
            auth: { username: 'user', password: 'pass' }
          }]
        },
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
      });
      
      const proxy = withAuth.getProxy();
      expect(proxy.url).toBe('http://user:pass@example.com:8080');
    });
  });

  describe('recordSuccess', () => {
    it('should increment success count', () => {
      manager.getProxy(); // Use proxy first
      manager.recordSuccess('proxy1');
      
      const stats = manager.getStats();
      const proxy1Stats = stats.proxies.find(p => p.name === 'proxy1');
      expect(proxy1Stats.stats.successes).toBe(1);
    });

    it('should reset consecutive failures on success', () => {
      manager.recordFailure('proxy1');
      manager.recordFailure('proxy1');
      manager.recordSuccess('proxy1');
      
      const stats = manager.getStats();
      const proxy1Stats = stats.proxies.find(p => p.name === 'proxy1');
      expect(proxy1Stats.stats.consecutiveFailures).toBe(0);
    });

    it('should emit success event', () => {
      const listener = jest.fn();
      manager.on('proxy:success', listener);
      
      manager.recordSuccess('proxy1');
      
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'proxy1' })
      );
    });
  });

  describe('recordFailure', () => {
    it('should increment failure count', () => {
      manager.recordFailure('proxy1');
      
      const stats = manager.getStats();
      const proxy1Stats = stats.proxies.find(p => p.name === 'proxy1');
      expect(proxy1Stats.stats.failures).toBe(1);
      expect(proxy1Stats.stats.consecutiveFailures).toBe(1);
    });

    it('should ban proxy after threshold failures', () => {
      manager.recordFailure('proxy1');
      manager.recordFailure('proxy1');
      manager.recordFailure('proxy1'); // Threshold is 3
      
      expect(manager.isBanned('proxy1')).toBe(true);
    });

    it('should emit failure event', () => {
      const listener = jest.fn();
      manager.on('proxy:failure', listener);
      
      manager.recordFailure('proxy1', { httpStatus: 500 });
      
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ 
          name: 'proxy1',
          error: { httpStatus: 500 }
        })
      );
    });

    it('should emit ban event when proxy is banned', () => {
      const listener = jest.fn();
      manager.on('proxy:ban', listener);
      
      // Hit threshold
      manager.recordFailure('proxy1');
      manager.recordFailure('proxy1');
      manager.recordFailure('proxy1');
      
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ 
          name: 'proxy1',
          reason: 'consecutive failures'
        })
      );
    });

    it('should immediately ban on 403 status code', () => {
      manager.recordFailure('proxy1', { httpStatus: 403 });
      expect(manager.isBanned('proxy1')).toBe(true);
    });

    it('should immediately ban on 429 status code', () => {
      manager.recordFailure('proxy1', { httpStatus: 429 });
      expect(manager.isBanned('proxy1')).toBe(true);
    });
  });

  describe('isBanned', () => {
    it('should return false for non-banned proxy', () => {
      expect(manager.isBanned('proxy1')).toBe(false);
    });

    it('should return true for banned proxy', () => {
      manager.recordFailure('proxy1', { httpStatus: 403 });
      expect(manager.isBanned('proxy1')).toBe(true);
    });

    it('should auto-expire bans after duration', async () => {
      // Use short ban duration
      const shortBan = new ProxyManager({
        config: {
          ...mockConfig,
          failover: { ...mockConfig.failover, banDurationMs: 50 }
        },
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
      });
      
      shortBan.recordFailure('proxy1', { httpStatus: 403 });
      expect(shortBan.isBanned('proxy1')).toBe(true);
      
      await new Promise(r => setTimeout(r, 100));
      
      expect(shortBan.isBanned('proxy1')).toBe(false);
    });
  });

  describe('unban', () => {
    it('should manually unban a proxy', () => {
      manager.recordFailure('proxy1', { httpStatus: 403 });
      expect(manager.isBanned('proxy1')).toBe(true);
      
      manager.unban('proxy1');
      expect(manager.isBanned('proxy1')).toBe(false);
    });

    it('should return false for unknown proxy', () => {
      expect(manager.unban('nonexistent')).toBe(false);
    });

    it('should emit unban event', () => {
      const listener = jest.fn();
      manager.on('proxy:unban', listener);
      
      manager.recordFailure('proxy1', { httpStatus: 403 });
      manager.unban('proxy1');
      
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'proxy1', manual: true })
      );
    });
  });

  describe('getStats', () => {
    it('should return comprehensive statistics', () => {
      manager.getProxy();
      manager.recordSuccess('proxy1');
      manager.recordFailure('proxy2');
      
      const stats = manager.getStats();
      
      expect(stats.enabled).toBe(true);
      expect(stats.strategy).toBe('round-robin');
      expect(stats.proxies).toHaveLength(3);
      expect(stats.telemetry.totalRequests).toBe(1);
      expect(stats.telemetry.proxyRequests).toBe(1);
    });
  });

  describe('getAvailableProxyNames', () => {
    it('should return list of non-banned proxies', () => {
      const names = manager.getAvailableProxyNames();
      expect(names).toEqual(['proxy1', 'proxy2', 'proxy3']);
    });

    it('should exclude banned proxies', () => {
      manager.recordFailure('proxy1', { httpStatus: 403 });
      
      const names = manager.getAvailableProxyNames();
      expect(names).not.toContain('proxy1');
      expect(names).toContain('proxy2');
      expect(names).toContain('proxy3');
    });
  });

  describe('resetStats', () => {
    it('should reset all statistics', () => {
      manager.getProxy();
      manager.recordSuccess('proxy1');
      manager.recordFailure('proxy2', { httpStatus: 403 });
      
      manager.resetStats();
      
      const stats = manager.getStats();
      expect(stats.telemetry.totalRequests).toBe(0);
      expect(stats.telemetry.bansApplied).toBe(0);
      
      const proxy1 = stats.proxies.find(p => p.name === 'proxy1');
      expect(proxy1.stats.successes).toBe(0);
      
      const proxy2 = stats.proxies.find(p => p.name === 'proxy2');
      expect(proxy2.stats.banned).toBe(false);
    });
  });

  describe('strategies', () => {
    it('should select by priority when strategy is priority', () => {
      const priorityManager = new ProxyManager({
        config: { ...mockConfig, strategy: 'priority' },
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
      });
      
      // Should always get proxy1 (lowest priority number = highest priority)
      for (let i = 0; i < 5; i++) {
        const proxy = priorityManager.getProxy();
        expect(proxy.name).toBe('proxy1');
      }
    });

    it('should select randomly when strategy is random', () => {
      const randomManager = new ProxyManager({
        config: { ...mockConfig, strategy: 'random' },
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
      });
      
      const seen = new Set();
      for (let i = 0; i < 20; i++) {
        const proxy = randomManager.getProxy();
        seen.add(proxy.name);
      }
      // With 20 attempts and 3 proxies, should see at least 2
      expect(seen.size).toBeGreaterThanOrEqual(2);
    });

    it('should select least-used when strategy is least-used', () => {
      const leastUsedManager = new ProxyManager({
        config: { ...mockConfig, strategy: 'least-used' },
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
      });
      
      // First call - any proxy
      const first = leastUsedManager.getProxy();
      leastUsedManager.recordSuccess(first.name);
      
      // Second call - should get different proxy (least used)
      const second = leastUsedManager.getProxy();
      expect(second.name).not.toBe(first.name);
    });
  });

  describe('disabled providers', () => {
    it('should skip disabled providers', () => {
      const withDisabled = new ProxyManager({
        config: {
          enabled: true,
          providers: [
            { name: 'active', host: '1.1.1.1', port: 8080, enabled: true },
            { name: 'inactive', host: '2.2.2.2', port: 8080, enabled: false }
          ]
        },
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
      });
      
      // Should only ever get the active proxy
      for (let i = 0; i < 5; i++) {
        const proxy = withDisabled.getProxy();
        expect(proxy.name).toBe('active');
      }
    });
  });

  describe('getAgent', () => {
    it('should return null when disabled', () => {
      const disabled = new ProxyManager({
        config: { ...mockConfig, enabled: false },
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
      });
      expect(disabled.getAgent()).toBeNull();
    });

    it('should return agent and proxyInfo when enabled', () => {
      const result = manager.getAgent();
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('agent');
      expect(result).toHaveProperty('proxyInfo');
      expect(result.proxyInfo).toHaveProperty('name');
      expect(result.proxyInfo).toHaveProperty('url');
      expect(result.proxyInfo).toHaveProperty('type');
    });

    it('should create HttpsProxyAgent from proxy URL', () => {
      const result = manager.getAgent();
      expect(result).not.toBeNull();
      // Agent should be an instance (duck type check)
      expect(result.agent).toBeDefined();
      expect(typeof result.agent).toBe('object');
    });

    it('should respect excludeNames option', () => {
      const result = manager.getAgent(null, { excludeNames: ['proxy1', 'proxy2'] });
      expect(result).not.toBeNull();
      expect(result.proxyInfo.name).toBe('proxy3');
    });

    it('should respect requireTags option', () => {
      const result = manager.getAgent(null, { requireTags: ['residential'] });
      expect(result).not.toBeNull();
      expect(result.proxyInfo.name).toBe('proxy3');
    });

    it('should return null when all proxies filtered out', () => {
      const result = manager.getAgent(null, { requireTags: ['nonexistent'] });
      expect(result).toBeNull();
    });
  });
});
