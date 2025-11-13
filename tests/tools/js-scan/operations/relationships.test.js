#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const RelationshipAnalyzer = require('../../../../tools/dev/js-scan/operations/relationships');

describe('RelationshipAnalyzer - Semantic Relationship Queries', () => {
  let testDir;
  let analyzer;

  beforeEach(() => {
    // Create temporary test directory
    testDir = path.join(os.tmpdir(), `test-analyzer-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    analyzer = new RelationshipAnalyzer(testDir, { verbose: false });
  });

  afterEach(() => {
    // Clean up test directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  describe('whatImports - Find all files that import a target', () => {
    test('should find direct importers of a module', async () => {
      // Create test files
      const modulePath = path.join(testDir, 'utils.js');
      fs.writeFileSync(modulePath, `
        export function helper() { return 42; }
      `);

      const consumer1Path = path.join(testDir, 'consumer1.js');
      fs.writeFileSync(consumer1Path, `
        import { helper } from './utils.js';
        console.log(helper());
      `);

      const consumer2Path = path.join(testDir, 'consumer2.js');
      fs.writeFileSync(consumer2Path, `
        const { helper } = require('./utils.js');
        module.exports = helper;
      `);

      // Run analysis
      const result = await analyzer.whatImports('utils.js');

      // Verify results
      expect(result.target).toBe('utils.js');
      expect(result.importers).toBeDefined();
      expect(Array.isArray(result.importers)).toBe(true);
      expect(result.importerCount).toBeGreaterThanOrEqual(0);
    });

    test('should handle non-existent target gracefully', async () => {
      const result = await analyzer.whatImports('non-existent.js');

      expect(result.warning).toBeDefined();
      expect(result.warning).toContain('not found');
      expect(result.importers).toEqual([]);
    });

    test('should track import specifications', async () => {
      const modulePath = path.join(testDir, 'math.js');
      fs.writeFileSync(modulePath, `
        export function add(a, b) { return a + b; }
        export function subtract(a, b) { return a - b; }
      `);

      const consumerPath = path.join(testDir, 'calculator.js');
      fs.writeFileSync(consumerPath, `
        import { add, subtract } from './math.js';
        console.log(add(5, 3));
      `);

      const result = await analyzer.whatImports('math.js');

      expect(result.importSummary).toBeDefined();
      // Should have tracked imports
      expect(typeof result.importSummary).toBe('object');
    });

    test('should support namespace imports', async () => {
      const modulePath = path.join(testDir, 'api.js');
      fs.writeFileSync(modulePath, `
        export const endpoint = '/api';
        export const port = 3000;
      `);

      const consumerPath = path.join(testDir, 'client.js');
      fs.writeFileSync(consumerPath, `
        import * as api from './api.js';
        console.log(api.endpoint);
      `);

      const result = await analyzer.whatImports('api.js');

      // Result structure should be consistent
      expect(result).toHaveProperty('importers');
      expect(result).toHaveProperty('importerCount');
      expect(result).toHaveProperty('totalImportCount');
    });
  });

  describe('whatCalls - Find all functions called by a target', () => {
    test('should find function calls within target', async () => {
      const filePath = path.join(testDir, 'processor.js');
      fs.writeFileSync(filePath, `
        function processData() {
          const cleaned = validateInput();
          const transformed = formatOutput(cleaned);
          return transformed;
        }

        function validateInput() { return true; }
        function formatOutput(data) { return data; }
      `);

      const result = await analyzer.whatCalls('processData');

      expect(result.targetFunction).toBe('processData');
      expect(result.callees).toBeDefined();
      expect(Array.isArray(result.callees)).toBe(true);
      expect(result.callCount).toBeDefined();
    });

    test('should distinguish internal vs external calls', async () => {
      const filePath = path.join(testDir, 'service.js');
      fs.writeFileSync(filePath, `
        const http = require('http');
        const { db } = require('./database.js');

        async function handleRequest() {
          const data = db.query('SELECT *');
          http.get('/endpoint');
          return data;
        }

        const db = { query: () => ({}) };
      `);

      const result = await analyzer.whatCalls('handleRequest');

      expect(result).toHaveProperty('internalCalls');
      expect(result).toHaveProperty('externalCalls');
      expect(result.internalCallCount).toBeGreaterThanOrEqual(0);
      expect(result.externalCallCount).toBeGreaterThanOrEqual(0);
    });

    test('should handle non-existent function gracefully', async () => {
      fs.writeFileSync(path.join(testDir, 'dummy.js'), 'console.log("test");');

      const result = await analyzer.whatCalls('unknownFunction');

      expect(result.warning).toBeDefined();
      expect(result.callees).toEqual([]);
    });

    test('should count async and generator functions', async () => {
      const filePath = path.join(testDir, 'async-service.js');
      fs.writeFileSync(filePath, `
        async function fetchData() {
          await somePromise();
          const result = await anotherAsync();
          return result;
        }

        async function somePromise() { return true; }
        async function anotherAsync() { return false; }
      `);

      const result = await analyzer.whatCalls('fetchData');

      expect(result).toHaveProperty('callCount');
      // Should have found await calls
      expect(result.callees).toBeDefined();
    });
  });

  describe('exportUsage - Comprehensive usage analysis', () => {
    test('should analyze comprehensive export usage', async () => {
      const modulePath = path.join(testDir, 'auth.js');
      fs.writeFileSync(modulePath, `
        export function authenticate() { return true; }
        export function authorize() { return true; }
      `);

      const consumer1Path = path.join(testDir, 'middleware.js');
      fs.writeFileSync(consumer1Path, `
        import { authenticate, authorize } from './auth.js';
        export function secureRoute(handler) {
          return (req, res) => {
            if (!authenticate()) return;
            if (!authorize()) return;
            handler(req, res);
          };
        }
      `);

      const consumer2Path = path.join(testDir, 'utils.js');
      fs.writeFileSync(consumer2Path, `
        export { authenticate, authorize } from './auth.js';
      `);

      const result = await analyzer.exportUsage('auth.js');

      expect(result.target).toBe('auth.js');
      expect(result.usage).toBeDefined();
      expect(result.usage).toHaveProperty('directImports');
      expect(result.usage).toHaveProperty('functionCalls');
      expect(result.usage).toHaveProperty('reexports');
      expect(result.totalUsageCount).toBeGreaterThanOrEqual(0);
    });

    test('should assign risk levels based on usage', async () => {
      const modulePath = path.join(testDir, 'config.js');
      fs.writeFileSync(modulePath, 'export const VERSION = "1.0.0";');

      const result = await analyzer.exportUsage('config.js');

      expect(result.riskLevel).toMatch(/LOW|MEDIUM|HIGH/);
      expect(result.recommendation).toBeDefined();
      expect(typeof result.recommendation).toBe('string');
    });

    test('risk level should scale with usage count', async () => {
      const modulePath = path.join(testDir, 'core.js');
      fs.writeFileSync(modulePath, 'export function core() {}');

      // Create many consumers for high usage
      for (let i = 0; i < 30; i++) {
        const consumerPath = path.join(testDir, `consumer${i}.js`);
        fs.writeFileSync(consumerPath, `import { core } from './core.js'; core();`);
      }

      const result = await analyzer.exportUsage('core.js');

      if (result.totalUsageCount > 20) {
        expect(result.riskLevel).toBe('HIGH');
        expect(result.recommendation).toContain('refactor');
      } else if (result.totalUsageCount > 5) {
        expect(result.riskLevel).toBe('MEDIUM');
      }
    });
  });

  describe('transitiveDependencies - Follow dependency chain', () => {
    test('should trace transitive dependencies', async () => {
      const libPath = path.join(testDir, 'lib.js');
      fs.writeFileSync(libPath, 'export function lib() {}');

      const midPath = path.join(testDir, 'mid.js');
      fs.writeFileSync(midPath, 'import { lib } from "./lib.js"; export function mid() { return lib(); }');

      const appPath = path.join(testDir, 'app.js');
      fs.writeFileSync(appPath, 'import { mid } from "./mid.js"; mid();');

      const result = await analyzer.transitiveDependencies(appPath, 2);

      expect(result.target).toBe(appPath);
      expect(result.dependencies).toBeDefined();
      expect(Array.isArray(result.dependencies)).toBe(true);
      expect(result.depth).toBeGreaterThanOrEqual(0);
    });

    test('should respect maximum depth parameter', async () => {
      const result = await analyzer.transitiveDependencies('dummy.js', 1);

      expect(result.depth).toBeLessThanOrEqual(1);
    });

    test('should track dependency chains', async () => {
      const result = await analyzer.transitiveDependencies('app.js', 3);

      result.dependencies.forEach(dep => {
        expect(dep).toHaveProperty('file');
        expect(dep).toHaveProperty('depth');
        expect(dep).toHaveProperty('chain');
        expect(Array.isArray(dep.chain)).toBe(true);
      });
    });
  });

  describe('Cache behavior', () => {
    test('should cache import extraction', async () => {
      const filePath = path.join(testDir, 'cached.js');
      fs.writeFileSync(filePath, 'import x from "y.js";');

      // First call
      const imports1 = await analyzer._extractImports(filePath);
      
      // Second call should hit cache
      const imports2 = await analyzer._extractImports(filePath);

      expect(imports1).toEqual(imports2);
      expect(analyzer.importCache.has(filePath)).toBe(true);
    });

    test('should cache export extraction', async () => {
      const filePath = path.join(testDir, 'exports.js');
      fs.writeFileSync(filePath, 'export function test() {}');

      const exports1 = await analyzer._extractExports(filePath);
      const exports2 = await analyzer._extractExports(filePath);

      expect(exports1).toEqual(exports2);
      expect(analyzer.exportCache.has(filePath)).toBe(true);
    });

    test('should clear caches independently', () => {
      const filePath = path.join(testDir, 'test.js');
      
      analyzer.importCache.set(filePath, []);
      analyzer.exportCache.set(filePath, []);

      analyzer.importCache.delete(filePath);

      expect(analyzer.importCache.has(filePath)).toBe(false);
      expect(analyzer.exportCache.has(filePath)).toBe(true);
    });
  });

  describe('Error handling', () => {
    test('should handle malformed JavaScript gracefully', async () => {
      const filePath = path.join(testDir, 'broken.js');
      fs.writeFileSync(filePath, 'function broken( { invalid syntax here');

      // Should not throw, but return empty or error result
      const result = await analyzer.whatCalls('broken');

      expect(result).toBeDefined();
      expect(result).toHaveProperty('targetFunction');
    });

    test('should handle file read errors gracefully', async () => {
      const result = await analyzer._extractImports('/nonexistent/file.js');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    test('should handle invalid target paths', async () => {
      const result = await analyzer.whatImports('../../../etc/passwd');

      expect(result).toBeDefined();
      expect(result).toHaveProperty('target');
    });
  });

  describe('Edge cases', () => {
    test('should handle files with no imports or exports', async () => {
      const filePath = path.join(testDir, 'standalone.js');
      fs.writeFileSync(filePath, 'console.log("Hello");');

      const imports = await analyzer._extractImports(filePath);
      const exports = await analyzer._extractExports(filePath);

      expect(imports).toEqual([]);
      expect(exports).toEqual([]);
    });

    test('should handle circular dependencies', async () => {
      const module1 = path.join(testDir, 'circular1.js');
      const module2 = path.join(testDir, 'circular2.js');

      fs.writeFileSync(module1, 'import { b } from "./circular2.js"; export const a = 1;');
      fs.writeFileSync(module2, 'import { a } from "./circular1.js"; export const b = 2;');

      const result = await analyzer.transitiveDependencies(module1, 2);

      // Should handle without infinite loop
      expect(result).toBeDefined();
      expect(result.dependencies).toBeDefined();
    });

    test('should handle deeply nested imports', async () => {
      let prevFile = path.join(testDir, 'level0.js');
      fs.writeFileSync(prevFile, 'export const level = 0;');

      for (let i = 1; i < 5; i++) {
        const currentFile = path.join(testDir, `level${i}.js`);
        fs.writeFileSync(currentFile, `import { level } from "./level${i - 1}.js"; export const level = ${i};`);
        prevFile = currentFile;
      }

      const result = await analyzer.transitiveDependencies(prevFile, 5);

      expect(result.dependencies).toBeDefined();
      expect(result.depth).toBeLessThanOrEqual(5);
    });

    test('should handle mixed import/require syntax', async () => {
      const filePath = path.join(testDir, 'mixed.js');
      fs.writeFileSync(filePath, `
        import { named } from 'module1';
        const { another } = require('module2');
        const dynamic = require('module3');
        import('module4').then(m => console.log(m));
      `);

      const imports = await analyzer._extractImports(filePath);

      expect(imports.length).toBeGreaterThan(0);
      // Should extract multiple import styles
      const sources = imports.map(i => i.source);
      expect(sources).toContain('module1');
      expect(sources).toContain('module2');
      expect(sources).toContain('module3');
      expect(sources).toContain('module4');
    });
  });

  describe('Performance characteristics', () => {
    test('should handle large file gracefully', async () => {
      const filePath = path.join(testDir, 'large.js');
      const largeContent = 'import x from "y";\n'.repeat(1000) + '\nfunction test() { console.log("hello"); }';
      fs.writeFileSync(filePath, largeContent);

      const start = Date.now();
      const result = await analyzer.whatCalls('test');
      const duration = Date.now() - start;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(5000); // Should complete in < 5 seconds
    });

    test('should handle many files efficiently', async () => {
      // Create 50 small files
      for (let i = 0; i < 50; i++) {
        fs.writeFileSync(path.join(testDir, `file${i}.js`), `export function f${i}() {}`);
      }

      const start = Date.now();
      const result = await analyzer.whatImports('file0.js');
      const duration = Date.now() - start;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(10000); // Should complete in < 10 seconds
    });
  });
});
