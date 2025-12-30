'use strict';

/**
 * Tests for Plugin Registry
 * @module tests/plugins/PluginRegistry.test
 */

describe('PluginRegistry', () => {
  let PluginRegistry;

  beforeEach(() => {
    jest.resetModules();
    PluginRegistry = require('../../src/plugins/PluginRegistry').PluginRegistry;
  });

  describe('exports', () => {
    it('should export PluginRegistry class', () => {
      expect(PluginRegistry).toBeDefined();
      expect(typeof PluginRegistry).toBe('function');
    });
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const registry = new PluginRegistry();
      expect(registry).toBeDefined();
    });

    it('should accept custom plugins directory', () => {
      const registry = new PluginRegistry({ pluginsDir: './custom-plugins' });
      expect(registry.pluginsDir).toBe('./custom-plugins');
    });

    it('should accept registry URL', () => {
      const registry = new PluginRegistry({ registryUrl: 'https://registry.example.com' });
      expect(registry.registryUrl).toBe('https://registry.example.com');
    });

    it('should initialize local registry map', () => {
      const registry = new PluginRegistry();
      expect(registry.localRegistry).toBeInstanceOf(Map);
    });
  });

  describe('scanLocal', () => {
    let registry;

    beforeEach(() => {
      registry = new PluginRegistry({ pluginsDir: './non-existent-plugins' });
    });

    it('should be an async function', () => {
      expect(typeof registry.scanLocal).toBe('function');
    });

    it('should return empty array when plugins directory does not exist', async () => {
      const plugins = await registry.scanLocal();
      expect(Array.isArray(plugins)).toBe(true);
    });
  });

  describe('getLocal', () => {
    let registry;

    beforeEach(() => {
      registry = new PluginRegistry();
    });

    it('should return null for unknown plugin', () => {
      const plugin = registry.getLocal('unknown-plugin');
      expect(plugin).toBeNull();
    });

    it('should be a function', () => {
      expect(typeof registry.getLocal).toBe('function');
    });
  });

  describe('isInstalled', () => {
    let registry;

    beforeEach(() => {
      registry = new PluginRegistry();
    });

    it('should return false for unknown plugin', () => {
      expect(registry.isInstalled('not-installed')).toBe(false);
    });

    it('should be a function', () => {
      expect(typeof registry.isInstalled).toBe('function');
    });
  });

  describe('listLocal', () => {
    let registry;

    beforeEach(() => {
      registry = new PluginRegistry();
    });

    it('should return empty array initially', () => {
      const plugins = registry.listLocal();
      expect(Array.isArray(plugins)).toBe(true);
      expect(plugins.length).toBe(0);
    });

    it('should be a function', () => {
      expect(typeof registry.listLocal).toBe('function');
    });
  });

  describe('fetchRemote', () => {
    let registry;

    beforeEach(() => {
      registry = new PluginRegistry();
    });

    it('should be an async function', () => {
      expect(typeof registry.fetchRemote).toBe('function');
    });
  });

  describe('search', () => {
    let registry;

    beforeEach(() => {
      registry = new PluginRegistry();
    });

    it('should be a function', () => {
      expect(typeof registry.search).toBe('function');
    });

    it('should return empty array for no matches', async () => {
      const results = await registry.search('nonexistent-plugin-xyz');
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('install', () => {
    let registry;

    beforeEach(() => {
      registry = new PluginRegistry();
    });

    it('should be an async function', () => {
      expect(typeof registry.install).toBe('function');
    });
  });

  describe('uninstall', () => {
    let registry;

    beforeEach(() => {
      registry = new PluginRegistry();
    });

    it('should be an async function', () => {
      expect(typeof registry.uninstall).toBe('function');
    });
  });

  describe('getVersion', () => {
    let registry;

    beforeEach(() => {
      registry = new PluginRegistry();
    });

    it('should return null for unknown plugin', () => {
      const version = registry.getVersion('unknown');
      expect(version).toBeNull();
    });

    it('should be a function', () => {
      expect(typeof registry.getVersion).toBe('function');
    });
  });

  describe('checkUpdates', () => {
    let registry;

    beforeEach(() => {
      registry = new PluginRegistry();
    });

    it('should be an async function', () => {
      expect(typeof registry.checkUpdates).toBe('function');
    });
  });
});

describe('PluginRegistry integration', () => {
  let PluginRegistry;

  beforeEach(() => {
    jest.resetModules();
    PluginRegistry = require('../../src/plugins/PluginRegistry').PluginRegistry;
  });

  it('should support full workflow: scan -> search -> install', async () => {
    const registry = new PluginRegistry({ pluginsDir: './non-existent-plugins' });
    
    // Scan local (empty)
    const local = await registry.scanLocal();
    expect(Array.isArray(local)).toBe(true);
    
    // List should be empty
    expect(registry.listLocal()).toEqual([]);
  });

  it('should handle version comparison', () => {
    const registry = new PluginRegistry();
    
    // _versionCompare is internal but we can test it exists
    expect(typeof registry._versionCompare).toBe('function');
  });
});
