'use strict';

/**
 * Tests for Plugin API
 * @module tests/plugins/PluginAPI.test
 */

describe('PluginAPI', () => {
  let PluginAPI;

  beforeEach(() => {
    jest.resetModules();
    PluginAPI = require('../../src/plugins/PluginAPI');
  });

  describe('exports', () => {
    it('should export PluginAPI class', () => {
      expect(PluginAPI).toBeDefined();
      expect(typeof PluginAPI).toBe('function');
    });
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const api = new PluginAPI();
      expect(api).toBeDefined();
    });

    it('should accept pluginId', () => {
      const api = new PluginAPI({ pluginId: 'test-plugin' });
      expect(api.pluginId).toBe('test-plugin');
    });

    it('should accept pluginType', () => {
      const api = new PluginAPI({ pluginType: 'extractor' });
      expect(api.pluginType).toBe('extractor');
    });

    it('should initialize hooks API', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(api.hooks).toBeDefined();
    });

    it('should initialize services API', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(api.services).toBeDefined();
    });

    it('should initialize config API', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(api.config).toBeDefined();
    });

    it('should initialize log API', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(api.log).toBeDefined();
    });

    it('should initialize storage API', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(api.storage).toBeDefined();
    });
  });

  describe('getId', () => {
    it('should return plugin ID', () => {
      const api = new PluginAPI({ pluginId: 'my-plugin' });
      expect(api.getId()).toBe('my-plugin');
    });
  });

  describe('getType', () => {
    it('should return plugin type', () => {
      const api = new PluginAPI({ pluginType: 'analyzer' });
      expect(api.getType()).toBe('analyzer');
    });
  });

  describe('cleanup', () => {
    it('should be a function', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(typeof api.cleanup).toBe('function');
    });
  });
});

describe('HooksAPI', () => {
  let PluginAPI;

  beforeEach(() => {
    jest.resetModules();
    PluginAPI = require('../../src/plugins/PluginAPI');
  });

  describe('hook registration methods', () => {
    it('should have onArticleExtracted', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(typeof api.hooks.onArticleExtracted).toBe('function');
    });

    it('should have beforeSave', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(typeof api.hooks.beforeSave).toBe('function');
    });

    it('should have afterSave', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(typeof api.hooks.afterSave).toBe('function');
    });

    it('should have onAnalysisComplete', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(typeof api.hooks.onAnalysisComplete).toBe('function');
    });

    it('should have onCrawlStart', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(typeof api.hooks.onCrawlStart).toBe('function');
    });

    it('should have onCrawlEnd', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(typeof api.hooks.onCrawlEnd).toBe('function');
    });

    it('should have register', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(typeof api.hooks.register).toBe('function');
    });

    it('should have trigger', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(typeof api.hooks.trigger).toBe('function');
    });

    it('should have getAll', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(typeof api.hooks.getAll).toBe('function');
    });
  });
});

describe('ServicesAPI', () => {
  let PluginAPI;

  beforeEach(() => {
    jest.resetModules();
    PluginAPI = require('../../src/plugins/PluginAPI');
  });

  describe('service methods', () => {
    it('should have getArticle', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(typeof api.services.getArticle).toBe('function');
    });

    it('should have searchArticles', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(typeof api.services.searchArticles).toBe('function');
    });

    it('should have saveAnalysis', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(typeof api.services.saveAnalysis).toBe('function');
    });

    it('should have getTopics', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(typeof api.services.getTopics).toBe('function');
    });

    it('should have notify', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(typeof api.services.notify).toBe('function');
    });

    it('should have getHttpClient', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(typeof api.services.getHttpClient).toBe('function');
    });

    it('should have hasService', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(typeof api.services.hasService).toBe('function');
    });
  });
});

describe('ConfigAPI', () => {
  let PluginAPI;

  beforeEach(() => {
    jest.resetModules();
    PluginAPI = require('../../src/plugins/PluginAPI');
  });

  describe('config methods', () => {
    it('should have get', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(typeof api.config.get).toBe('function');
    });

    it('should have set', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(typeof api.config.set).toBe('function');
    });

    it('should have getAll', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(typeof api.config.getAll).toBe('function');
    });

    it('should have clearCache', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(typeof api.config.clearCache).toBe('function');
    });
  });

  describe('config operations', () => {
    it('should set and get config values', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      api.config.set('key1', 'value1');
      expect(api.config.get('key1')).toBe('value1');
    });

    it('should return default for missing keys', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(api.config.get('missing', 'default')).toBe('default');
    });

    it('should get all config as object', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      api.config.set('a', 1);
      api.config.set('b', 2);
      const all = api.config.getAll();
      expect(all).toBeDefined();
    });
  });
});

describe('LogAPI', () => {
  let PluginAPI;

  beforeEach(() => {
    jest.resetModules();
    PluginAPI = require('../../src/plugins/PluginAPI');
  });

  describe('log methods', () => {
    it('should have info', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(typeof api.log.info).toBe('function');
    });

    it('should have warn', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(typeof api.log.warn).toBe('function');
    });

    it('should have error', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(typeof api.log.error).toBe('function');
    });

    it('should have debug', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(typeof api.log.debug).toBe('function');
    });
  });
});

describe('StorageAPI', () => {
  let PluginAPI;

  beforeEach(() => {
    jest.resetModules();
    PluginAPI = require('../../src/plugins/PluginAPI');
  });

  describe('storage methods', () => {
    it('should have get', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(typeof api.storage.get).toBe('function');
    });

    it('should have set', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(typeof api.storage.set).toBe('function');
    });

    it('should have delete', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(typeof api.storage.delete).toBe('function');
    });

    it('should have has', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(typeof api.storage.has).toBe('function');
    });

    it('should have keys', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(typeof api.storage.keys).toBe('function');
    });

    it('should have clear', () => {
      const api = new PluginAPI({ pluginId: 'test' });
      expect(typeof api.storage.clear).toBe('function');
    });
  });

  describe('storage operations', () => {
    it('should set and get values', async () => {
      const api = new PluginAPI({ pluginId: 'test' });
      await api.storage.set('item1', { data: 'test' });
      const result = await api.storage.get('item1');
      expect(result).toEqual({ data: 'test' });
    });

    it('should check existence with has', async () => {
      const api = new PluginAPI({ pluginId: 'test' });
      await api.storage.set('exists', true);
      expect(await api.storage.has('exists')).toBe(true);
      expect(await api.storage.has('not-exists')).toBe(false);
    });

    it('should delete items', async () => {
      const api = new PluginAPI({ pluginId: 'test' });
      await api.storage.set('to-delete', 'value');
      await api.storage.delete('to-delete');
      expect(await api.storage.has('to-delete')).toBe(false);
    });

    it('should list keys', async () => {
      const api = new PluginAPI({ pluginId: 'test' });
      await api.storage.set('k1', 1);
      await api.storage.set('k2', 2);
      const keys = await api.storage.keys();
      expect(Array.isArray(keys)).toBe(true);
    });

    it('should clear all items', async () => {
      const api = new PluginAPI({ pluginId: 'test' });
      await api.storage.set('a', 1);
      await api.storage.set('b', 2);
      await api.storage.clear();
      const keys = await api.storage.keys();
      expect(keys.length).toBe(0);
    });
  });
});
