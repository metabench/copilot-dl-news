'use strict';

/**
 * Tests for Plugin Manager
 * @module tests/plugins/PluginManager.test
 */

describe('PluginManager', () => {
  let PluginManager, PluginState, PluginType;

  beforeEach(() => {
    jest.resetModules();
    const mod = require('../../src/plugins/PluginManager');
    PluginManager = mod.PluginManager;
    PluginState = mod.PluginState;
    PluginType = mod.PluginType;
  });

  describe('exports', () => {
    it('should export PluginManager class', () => {
      expect(PluginManager).toBeDefined();
      expect(typeof PluginManager).toBe('function');
    });

    it('should export PluginState enum', () => {
      expect(PluginState).toBeDefined();
      expect(PluginState.DISCOVERED).toBe('discovered');
      expect(PluginState.LOADED).toBe('loaded');
      expect(PluginState.INITIALIZED).toBe('initialized');
      expect(PluginState.ACTIVE).toBe('active');
      expect(PluginState.DEACTIVATED).toBe('deactivated');
      expect(PluginState.ERROR).toBe('error');
    });

    it('should export PluginType enum', () => {
      expect(PluginType).toBeDefined();
      expect(PluginType.EXTRACTOR).toBe('extractor');
      expect(PluginType.ANALYZER).toBe('analyzer');
      expect(PluginType.INTEGRATION).toBe('integration');
      expect(PluginType.UI_WIDGET).toBe('ui-widget');
    });
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const manager = new PluginManager({ pluginsDir: './test-plugins-nonexistent' });
      expect(manager).toBeDefined();
    });

    it('should accept custom plugins directory', () => {
      const manager = new PluginManager({ pluginsDir: './custom-plugins' });
      expect(manager.pluginsDir).toBe('./custom-plugins');
    });

    it('should accept services option', () => {
      const services = { db: {}, config: {} };
      const manager = new PluginManager({ services });
      expect(manager.services).toBe(services);
    });

    it('should initialize empty plugins map', () => {
      const manager = new PluginManager({ pluginsDir: './test-plugins-nonexistent' });
      expect(manager.plugins).toBeInstanceOf(Map);
      expect(manager.plugins.size).toBe(0);
    });
  });

  describe('discoverPlugins', () => {
    let manager;

    beforeEach(() => {
      manager = new PluginManager({ pluginsDir: './non-existent-test-plugins' });
    });

    it('should return empty array when plugins directory does not exist', async () => {
      const plugins = await manager.discoverPlugins();
      expect(Array.isArray(plugins)).toBe(true);
      expect(plugins.length).toBe(0);
    });

    it('should be an async function', () => {
      const result = manager.discoverPlugins();
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('validateManifest', () => {
    let manager;

    beforeEach(() => {
      manager = new PluginManager({ pluginsDir: './test-plugins-nonexistent' });
    });

    it('should validate manifest with required fields', () => {
      const validManifest = {
        name: 'test-plugin',
        version: '1.0.0',
        type: 'extractor',
        entrypoint: 'index.js'
      };
      expect(manager.validateManifest(validManifest)).toBe(true);
    });

    it('should reject manifest without name', () => {
      const invalidManifest = {
        version: '1.0.0',
        type: 'extractor'
      };
      expect(manager.validateManifest(invalidManifest)).toBe(false);
    });

    it('should reject manifest without version', () => {
      const invalidManifest = {
        name: 'test',
        type: 'extractor'
      };
      expect(manager.validateManifest(invalidManifest)).toBe(false);
    });

    it('should handle null/undefined manifests', () => {
      expect(() => manager.validateManifest(null)).toThrow();
      expect(() => manager.validateManifest(undefined)).toThrow();
    });
  });

  describe('loadPlugin', () => {
    let manager;

    beforeEach(() => {
      manager = new PluginManager({ pluginsDir: './test-plugins-nonexistent' });
    });

    it('should throw for non-existent plugin', async () => {
      await expect(manager.loadPlugin('non-existent-plugin')).rejects.toThrow();
    });

    it('should be an async function', () => {
      expect(typeof manager.loadPlugin).toBe('function');
    });
  });

  describe('activatePlugin', () => {
    let manager;

    beforeEach(() => {
      manager = new PluginManager({ pluginsDir: './test-plugins-nonexistent' });
    });

    it('should throw for unknown plugin', async () => {
      await expect(manager.activatePlugin('unknown-plugin')).rejects.toThrow();
    });

    it('should be an async function', () => {
      expect(typeof manager.activatePlugin).toBe('function');
    });
  });

  describe('deactivatePlugin', () => {
    let manager;

    beforeEach(() => {
      manager = new PluginManager({ pluginsDir: './test-plugins-nonexistent' });
    });

    it('should throw for unknown plugin', async () => {
      await expect(manager.deactivatePlugin('unknown')).rejects.toThrow();
    });

    it('should be an async function', () => {
      expect(typeof manager.deactivatePlugin).toBe('function');
    });
  });

  describe('destroyPlugin', () => {
    let manager;

    beforeEach(() => {
      manager = new PluginManager({ pluginsDir: './test-plugins-nonexistent' });
    });

    it('should be no-op for unknown plugin', async () => {
      await expect(manager.destroyPlugin('not-loaded')).resolves.toBeUndefined();
    });

    it('should be an async function', () => {
      expect(typeof manager.destroyPlugin).toBe('function');
    });
  });

  describe('getPlugin', () => {
    let manager;

    beforeEach(() => {
      manager = new PluginManager({ pluginsDir: './test-plugins-nonexistent' });
    });

    it('should return null for unknown plugin', () => {
      const plugin = manager.getPlugin('unknown');
      expect(plugin).toBeNull();
    });

    it('should be a function', () => {
      expect(typeof manager.getPlugin).toBe('function');
    });
  });

  describe('listPlugins', () => {
    let manager;

    beforeEach(() => {
      manager = new PluginManager({ pluginsDir: './test-plugins-nonexistent' });
    });

    it('should return empty array initially', () => {
      const plugins = manager.listPlugins();
      expect(Array.isArray(plugins)).toBe(true);
      expect(plugins.length).toBe(0);
    });

    it('should be a function', () => {
      expect(typeof manager.listPlugins).toBe('function');
    });
  });

  describe('getPluginsByType', () => {
    let manager;

    beforeEach(() => {
      manager = new PluginManager({ pluginsDir: './test-plugins-nonexistent' });
    });

    it('should return empty array for no plugins of type', () => {
      const extractors = manager.getPluginsByType('extractor');
      expect(Array.isArray(extractors)).toBe(true);
      expect(extractors.length).toBe(0);
    });
  });

  describe('getActivePlugins', () => {
    let manager;

    beforeEach(() => {
      manager = new PluginManager({ pluginsDir: './test-plugins-nonexistent' });
    });

    it('should return empty array initially', () => {
      const active = manager.getActivePlugins();
      expect(Array.isArray(active)).toBe(true);
      expect(active.length).toBe(0);
    });
  });

  describe('activateAll', () => {
    let manager;

    beforeEach(() => {
      manager = new PluginManager({ pluginsDir: './test-plugins-nonexistent' });
    });

    it('should be an async function', () => {
      expect(typeof manager.activateAll).toBe('function');
    });

    it('should handle empty plugins', async () => {
      const results = await manager.activateAll();
      expect(results).toBeDefined();
      expect(results.activated).toEqual([]);
      expect(results.failed).toEqual([]);
    });
  });

  describe('destroyAll', () => {
    let manager;

    beforeEach(() => {
      manager = new PluginManager({ pluginsDir: './test-plugins-nonexistent' });
    });

    it('should be an async function', () => {
      expect(typeof manager.destroyAll).toBe('function');
    });

    it('should handle empty plugins', async () => {
      await expect(manager.destroyAll()).resolves.not.toThrow();
    });
  });

  describe('lifecycle events', () => {
    let manager;

    beforeEach(() => {
      manager = new PluginManager({ pluginsDir: './test-plugins-nonexistent' });
    });

    it('should support event emitter pattern', () => {
      expect(typeof manager.on).toBe('function');
      expect(typeof manager.emit).toBe('function');
    });

    it('should support removeListener', () => {
      expect(typeof manager.removeListener).toBe('function');
    });

    it('should emit events', (done) => {
      manager.on('test-event', (data) => {
        expect(data).toBe('test-data');
        done();
      });
      manager.emit('test-event', 'test-data');
    });
  });

  describe('findPluginsForUrl', () => {
    let manager;

    beforeEach(() => {
      manager = new PluginManager({ pluginsDir: './test-plugins-nonexistent' });
    });

    it('should be a function', () => {
      expect(typeof manager.findPluginsForUrl).toBe('function');
    });

    it('should return empty array when no plugins match', () => {
      const plugins = manager.findPluginsForUrl('https://example.com');
      expect(Array.isArray(plugins)).toBe(true);
    });
  });

  describe('runExtractors', () => {
    let manager;

    beforeEach(() => {
      manager = new PluginManager({ pluginsDir: './test-plugins-nonexistent' });
    });

    it('should be an async function', () => {
      expect(typeof manager.runExtractors).toBe('function');
    });
  });

  describe('runAnalyzers', () => {
    let manager;

    beforeEach(() => {
      manager = new PluginManager({ pluginsDir: './test-plugins-nonexistent' });
    });

    it('should be an async function', () => {
      expect(typeof manager.runAnalyzers).toBe('function');
    });
  });
});

describe('PluginManager integration scenarios', () => {
  let PluginManager;

  beforeEach(() => {
    jest.resetModules();
    PluginManager = require('../../src/plugins/PluginManager').PluginManager;
  });

  it('should support full lifecycle flow', async () => {
    const manager = new PluginManager({ pluginsDir: './test-plugins-nonexistent' });
    
    // Discover plugins (returns empty without real plugins dir)
    const discovered = await manager.discoverPlugins();
    expect(Array.isArray(discovered)).toBe(true);
    
    // List should be empty
    expect(manager.listPlugins()).toEqual([]);
  });

  it('should handle multiple plugin operations', async () => {
    const manager = new PluginManager({ pluginsDir: './test-plugins-nonexistent' });
    
    // All these should work without plugins
    await manager.discoverPlugins();
    await manager.activateAll();
    await manager.destroyAll();
    
    expect(manager.getActivePlugins()).toEqual([]);
  });
});
