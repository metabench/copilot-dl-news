'use strict';

const HubFreshnessController = require('../../../../src/core/crawler/HubFreshnessController');

describe('HubFreshnessController', () => {
  describe('constructor', () => {
    it('should initialize with default state', () => {
      const controller = new HubFreshnessController();
      
      expect(controller.getConfig()).toBeNull();
      expect(controller._manager).toBeNull();
      expect(controller._ownedManager).toBeNull();
    });

    it('should accept custom options', () => {
      const mockLogger = { warn: jest.fn() };
      const mockGetEnhanced = jest.fn().mockReturnValue(null);
      
      const controller = new HubFreshnessController({
        logger: mockLogger,
        getEnhancedConfigManager: mockGetEnhanced
      });
      
      expect(controller.logger).toBe(mockLogger);
      expect(controller.getEnhancedConfigManager).toBe(mockGetEnhanced);
    });
  });

  describe('applyPolicy', () => {
    it('should return meta unchanged when no config', () => {
      const controller = new HubFreshnessController();
      const meta = { foo: 'bar' };
      
      const result = controller.applyPolicy({ depth: 0, type: 'nav', meta });
      
      expect(result).toBe(meta);
    });

    it('should return meta unchanged for non-hub-like requests', () => {
      const controller = new HubFreshnessController();
      controller.config = { maxCacheAgeMs: 60000 };
      const meta = { foo: 'bar' };
      
      // depth > 0 and non-hub type
      const result = controller.applyPolicy({ depth: 2, type: 'article', meta });
      
      expect(result).toBe(meta);
    });

    it('should apply maxCacheAgeMs for hub-like requests at depth 0', () => {
      const controller = new HubFreshnessController();
      controller.config = { maxCacheAgeMs: 60000 };
      const meta = {};
      
      const result = controller.applyPolicy({ depth: 0, type: 'nav', meta });
      
      expect(result).not.toBe(meta);
      expect(result.maxCacheAgeMs).toBe(60000);
    });

    it('should use firstPageMaxAgeMs for depth 0 when available', () => {
      const controller = new HubFreshnessController();
      controller.config = { 
        maxCacheAgeMs: 60000,
        firstPageMaxAgeMs: 30000
      };
      const meta = {};
      
      const result = controller.applyPolicy({ depth: 0, type: 'nav', meta });
      
      expect(result.maxCacheAgeMs).toBe(30000);
    });

    it('should use maxCacheAgeMs for depth > 0 hub requests', () => {
      const controller = new HubFreshnessController();
      controller.config = { 
        maxCacheAgeMs: 60000,
        firstPageMaxAgeMs: 30000
      };
      const meta = { kind: 'hub' };
      
      const result = controller.applyPolicy({ depth: 1, type: 'nav', meta });
      
      expect(result.maxCacheAgeMs).toBe(60000);
    });

    it('should set fetchPolicy to network-first for depth 0', () => {
      const controller = new HubFreshnessController();
      controller.config = { refreshOnStartup: true };
      const meta = {};
      
      const result = controller.applyPolicy({ depth: 0, type: 'nav', meta });
      
      expect(result.fetchPolicy).toBe('network-first');
    });

    it('should not override existing fetchPolicy', () => {
      const controller = new HubFreshnessController();
      controller.config = { refreshOnStartup: true };
      const meta = { fetchPolicy: 'cache-first' };
      
      const result = controller.applyPolicy({ depth: 0, type: 'nav', meta });
      
      expect(result.fetchPolicy).toBe('cache-first');
    });

    it('should set fallbackToCache false when fallbackToCacheOnFailure is false', () => {
      const controller = new HubFreshnessController();
      controller.config = { fallbackToCacheOnFailure: false };
      const meta = {};
      
      const result = controller.applyPolicy({ depth: 0, type: 'nav', meta });
      
      expect(result.fallbackToCache).toBe(false);
    });

    it('should handle null meta', () => {
      const controller = new HubFreshnessController();
      controller.config = { maxCacheAgeMs: 60000 };
      
      const result = controller.applyPolicy({ depth: 0, type: 'nav', meta: null });
      
      expect(result.maxCacheAgeMs).toBe(60000);
    });

    it('should return primitive meta unchanged', () => {
      const controller = new HubFreshnessController();
      controller.config = { maxCacheAgeMs: 60000 };
      
      const result = controller.applyPolicy({ depth: 0, type: 'nav', meta: 'string-meta' });
      
      expect(result).toBe('string-meta');
    });
  });

  describe('_isHubLikeRequest', () => {
    let controller;

    beforeEach(() => {
      controller = new HubFreshnessController();
    });

    it('should return true for depth 0', () => {
      expect(controller._isHubLikeRequest({ depth: 0 })).toBe(true);
    });

    it('should return true for nav type', () => {
      expect(controller._isHubLikeRequest({ depth: 1, type: 'nav' })).toBe(true);
    });

    it('should return true for navigation type', () => {
      expect(controller._isHubLikeRequest({ depth: 1, type: 'navigation' })).toBe(true);
    });

    it('should return true when meta.kind contains hub', () => {
      expect(controller._isHubLikeRequest({ 
        depth: 1, 
        type: 'other', 
        meta: { kind: 'country-hub' } 
      })).toBe(true);
    });

    it('should return true when meta.role is hub', () => {
      expect(controller._isHubLikeRequest({ 
        depth: 1, 
        type: 'other', 
        meta: { role: 'hub' } 
      })).toBe(true);
    });

    it('should return false for article at depth > 0', () => {
      expect(controller._isHubLikeRequest({ 
        depth: 1, 
        type: 'article', 
        meta: {} 
      })).toBe(false);
    });
  });

  describe('_resolveRequestKind', () => {
    let controller;

    beforeEach(() => {
      controller = new HubFreshnessController();
    });

    it('should prefer meta.kind', () => {
      const result = controller._resolveRequestKind('type-val', { 
        kind: 'KIND-VAL', 
        type: 'other' 
      });
      expect(result).toBe('kind-val');
    });

    it('should fall back to meta.type', () => {
      const result = controller._resolveRequestKind('type-val', { 
        type: 'META-TYPE' 
      });
      expect(result).toBe('meta-type');
    });

    it('should fall back to meta.intent', () => {
      const result = controller._resolveRequestKind('type-val', { 
        intent: 'INTENT' 
      });
      expect(result).toBe('intent');
    });

    it('should fall back to type parameter', () => {
      const result = controller._resolveRequestKind('TYPE-PARAM', {});
      expect(result).toBe('type-param');
    });

    it('should return null when no kind found', () => {
      const result = controller._resolveRequestKind(null, {});
      expect(result).toBeNull();
    });
  });

  describe('configure', () => {
    it('should use enhanced manager when available and preferEnhanced is true', () => {
      const mockEnhancedManager = {
        getHubFreshnessConfig: jest.fn().mockReturnValue({ maxCacheAgeMs: 5000 }),
        addWatcher: jest.fn().mockReturnValue(() => {})
      };
      
      const controller = new HubFreshnessController({
        getEnhancedConfigManager: () => mockEnhancedManager
      });
      
      controller.configure({ preferEnhanced: true });
      
      expect(controller._manager).toBe(mockEnhancedManager);
      expect(controller.getConfig()).toEqual({ maxCacheAgeMs: 5000 });
    });

    it('should create owned manager when ConfigManager is provided', () => {
      const mockManagerInstance = {
        getHubFreshnessConfig: jest.fn().mockReturnValue({ maxCacheAgeMs: 10000 }),
        addWatcher: jest.fn().mockReturnValue(() => {}),
        close: jest.fn()
      };
      
      const MockConfigManager = jest.fn().mockReturnValue(mockManagerInstance);
      
      const controller = new HubFreshnessController({
        ConfigManager: MockConfigManager
      });
      
      controller.configure();
      
      // In Jest environment, watch is false due to JEST_WORKER_ID
      expect(MockConfigManager).toHaveBeenCalledWith(null, {
        watch: false,
        inMemory: false
      });
      expect(controller._ownedManager).toBe(mockManagerInstance);
      expect(controller.getConfig()).toEqual({ maxCacheAgeMs: 10000 });
    });

    it('should handle ConfigManager initialization failure', () => {
      const mockLogger = { warn: jest.fn() };
      const MockConfigManager = jest.fn().mockImplementation(() => {
        throw new Error('Init failed');
      });
      
      const controller = new HubFreshnessController({
        ConfigManager: MockConfigManager,
        logger: mockLogger
      });
      
      controller.configure();
      
      expect(mockLogger.warn).toHaveBeenCalled();
      expect(controller._ownedManager).toBeNull();
    });

    it('should dispose previous watcher when switching managers', () => {
      const disposeWatcher = jest.fn();
      const mockManager1 = {
        getHubFreshnessConfig: jest.fn().mockReturnValue({}),
        addWatcher: jest.fn().mockReturnValue(disposeWatcher),
        close: jest.fn()
      };
      const mockManager2 = {
        getHubFreshnessConfig: jest.fn().mockReturnValue({}),
        addWatcher: jest.fn().mockReturnValue(() => {})
      };
      
      let callCount = 0;
      const controller = new HubFreshnessController({
        getEnhancedConfigManager: () => {
          callCount++;
          return callCount === 1 ? null : mockManager2;
        },
        ConfigManager: jest.fn().mockReturnValue(mockManager1)
      });
      
      controller.configure();
      expect(controller._manager).toBe(mockManager1);
      
      controller.configure({ preferEnhanced: true });
      
      expect(disposeWatcher).toHaveBeenCalled();
      expect(mockManager1.close).toHaveBeenCalled();
      expect(controller._manager).toBe(mockManager2);
    });
  });

  describe('cleanup', () => {
    it('should dispose watcher and close owned manager', () => {
      const disposeWatcher = jest.fn();
      const mockManager = {
        getHubFreshnessConfig: jest.fn().mockReturnValue({ test: true }),
        addWatcher: jest.fn().mockReturnValue(disposeWatcher),
        close: jest.fn()
      };
      
      const controller = new HubFreshnessController({
        ConfigManager: jest.fn().mockReturnValue(mockManager)
      });
      
      controller.configure();
      expect(controller.getConfig()).toEqual({ test: true });
      
      controller.cleanup();
      
      expect(disposeWatcher).toHaveBeenCalled();
      expect(mockManager.close).toHaveBeenCalled();
      expect(controller._manager).toBeNull();
      expect(controller._ownedManager).toBeNull();
      expect(controller.getConfig()).toBeNull();
    });

    it('should handle cleanup when already clean', () => {
      const controller = new HubFreshnessController();
      
      // Should not throw
      expect(() => controller.cleanup()).not.toThrow();
    });
  });
});

