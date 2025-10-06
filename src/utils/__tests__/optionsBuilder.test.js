/**
 * @fileoverview Tests for optionsBuilder
 */

const { buildOptions, buildOptionsStrict } = require('../optionsBuilder');

describe('optionsBuilder', () => {
  describe('buildOptions', () => {
    test('uses provided values when type matches', () => {
      const schema = {
        port: { type: 'number', default: 3000 },
        host: { type: 'string', default: 'localhost' },
        debug: { type: 'boolean', default: false }
      };
      
      const input = { port: 8080, host: '0.0.0.0', debug: true };
      const result = buildOptions(input, schema);
      
      expect(result).toEqual({
        port: 8080,
        host: '0.0.0.0',
        debug: true
      });
    });

    test('uses defaults when values missing', () => {
      const schema = {
        port: { type: 'number', default: 3000 },
        host: { type: 'string', default: 'localhost' },
        debug: { type: 'boolean', default: false }
      };
      
      const input = {};
      const result = buildOptions(input, schema);
      
      expect(result).toEqual({
        port: 3000,
        host: 'localhost',
        debug: false
      });
    });

    test('uses defaults when type mismatches', () => {
      const schema = {
        port: { type: 'number', default: 3000 },
        timeout: { type: 'number', default: 5000 }
      };
      
      const input = { port: '8080', timeout: 'invalid' };
      const result = buildOptions(input, schema);
      
      expect(result).toEqual({
        port: 3000,
        timeout: 5000
      });
    });

    test('handles function defaults', () => {
      const schema = {
        rateLimitMs: { 
          type: 'number', 
          default: (opts) => opts.slowMode ? 1000 : 0 
        },
        maxConcurrency: { 
          type: 'number', 
          default: (opts) => opts.slowMode ? 1 : 5 
        }
      };
      
      const input = { slowMode: true };
      const result = buildOptions(input, schema);
      
      expect(result).toEqual({
        rateLimitMs: 1000,
        maxConcurrency: 1
      });
    });

    test('function defaults receive full input object', () => {
      const schema = {
        computed: { 
          type: 'number', 
          default: (opts) => opts.a + opts.b 
        }
      };
      
      const input = { a: 10, b: 20 };
      const result = buildOptions(input, schema);
      
      expect(result.computed).toBe(30);
    });

    test('handles null values as missing', () => {
      const schema = {
        port: { type: 'number', default: 3000 }
      };
      
      const input = { port: null };
      const result = buildOptions(input, schema);
      
      expect(result.port).toBe(3000);
    });

    test('handles undefined values as missing', () => {
      const schema = {
        port: { type: 'number', default: 3000 }
      };
      
      const input = { port: undefined };
      const result = buildOptions(input, schema);
      
      expect(result.port).toBe(3000);
    });

    test('preserves valid zero values', () => {
      const schema = {
        rateLimitMs: { type: 'number', default: 1000 }
      };
      
      const input = { rateLimitMs: 0 };
      const result = buildOptions(input, schema);
      
      expect(result.rateLimitMs).toBe(0);
    });

    test('preserves valid false values', () => {
      const schema = {
        debug: { type: 'boolean', default: true }
      };
      
      const input = { debug: false };
      const result = buildOptions(input, schema);
      
      expect(result.debug).toBe(false);
    });

    test('preserves valid empty strings', () => {
      const schema = {
        prefix: { type: 'string', default: 'default' }
      };
      
      const input = { prefix: '' };
      const result = buildOptions(input, schema);
      
      expect(result.prefix).toBe('');
    });

    test('applies validator and falls back to default if validation fails', () => {
      const schema = {
        port: {
          type: 'number',
          default: 3000,
          validator: (val) => val > 0 && val < 65536
        }
      };
      
      // Valid value
      expect(buildOptions({ port: 8080 }, schema)).toEqual({ port: 8080 });
      
      // Invalid value (negative)
      expect(buildOptions({ port: -1 }, schema)).toEqual({ port: 3000 });
      
      // Invalid value (too large)
      expect(buildOptions({ port: 70000 }, schema)).toEqual({ port: 3000 });
    });

    test('applies processor to transform values', () => {
      const schema = {
        hosts: {
          type: 'array',
          default: [],
          processor: (arr) => arr.map(h => h.toLowerCase())
        },
        name: {
          type: 'string',
          default: 'unnamed',
          processor: (val) => val.trim()
        }
      };
      
      const input = { hosts: ['EXAMPLE.COM', 'TEST.ORG'], name: '  MyApp  ' };
      const result = buildOptions(input, schema);
      
      expect(result.hosts).toEqual(['example.com', 'test.org']);
      expect(result.name).toBe('MyApp');
    });

    test('handles array type correctly', () => {
      const schema = {
        items: {
          type: 'array',
          default: []
        }
      };
      
      expect(buildOptions({ items: [1, 2, 3] }, schema)).toEqual({ items: [1, 2, 3] });
      expect(buildOptions({ items: null }, schema)).toEqual({ items: [] });
      expect(buildOptions({}, schema)).toEqual({ items: [] });
    });

    test('handles complex schema with many options', () => {
      const schema = {
        rateLimitMs: { type: 'number', default: 0 },
        maxConcurrency: { type: 'number', default: 5 },
        maxPages: { type: 'number', default: Infinity },
        slowMode: { type: 'boolean', default: false },
        verbose: { type: 'boolean', default: false },
        baseUrl: { type: 'string', default: '' }
      };
      
      const input = {
        maxConcurrency: 3,
        verbose: true
      };
      
      const result = buildOptions(input, schema);
      
      expect(result).toEqual({
        rateLimitMs: 0,
        maxConcurrency: 3,
        maxPages: Infinity,
        slowMode: false,
        verbose: true,
        baseUrl: ''
      });
    });
  });

  describe('buildOptionsStrict', () => {
    test('validates required options', () => {
      const schema = {
        port: { type: 'number', required: true },
        host: { type: 'string', default: 'localhost' }
      };
      
      const input = {};
      
      expect(() => buildOptionsStrict(input, schema))
        .toThrow("options: missing required option 'port'");
    });

    test('allows required options with valid values', () => {
      const schema = {
        port: { type: 'number', required: true },
        host: { type: 'string', required: true }
      };
      
      const input = { port: 8080, host: '0.0.0.0' };
      const result = buildOptionsStrict(input, schema);
      
      expect(result).toEqual({
        port: 8080,
        host: '0.0.0.0'
      });
    });

    test('validates types strictly', () => {
      const schema = {
        port: { type: 'number', required: false, default: 3000 }
      };
      
      const input = { port: '8080' };
      
      expect(() => buildOptionsStrict(input, schema))
        .toThrow("options: option 'port' must be number, got string");
    });

    test('uses defaults for non-required missing options', () => {
      const schema = {
        port: { type: 'number', required: true },
        host: { type: 'string', default: 'localhost' }
      };
      
      const input = { port: 8080 };
      const result = buildOptionsStrict(input, schema);
      
      expect(result).toEqual({
        port: 8080,
        host: 'localhost'
      });
    });

    test('supports custom context in error messages', () => {
      const schema = {
        port: { type: 'number', required: true }
      };
      
      const input = {};
      
      expect(() => buildOptionsStrict(input, schema, 'server config'))
        .toThrow("server config: missing required option 'port'");
    });

    test('supports function defaults', () => {
      const schema = {
        port: { type: 'number', required: true },
        timeout: { 
          type: 'number', 
          default: (opts) => opts.port === 443 ? 30000 : 5000 
        }
      };
      
      const input = { port: 443 };
      const result = buildOptionsStrict(input, schema);
      
      expect(result.timeout).toBe(30000);
    });

    test('treats null as missing for required fields', () => {
      const schema = {
        port: { type: 'number', required: true }
      };
      
      const input = { port: null };
      
      expect(() => buildOptionsStrict(input, schema))
        .toThrow("missing required option 'port'");
    });

    test('treats undefined as missing for required fields', () => {
      const schema = {
        port: { type: 'number', required: true }
      };
      
      const input = { port: undefined };
      
      expect(() => buildOptionsStrict(input, schema))
        .toThrow("missing required option 'port'");
    });

    test('allows valid falsy values for required fields', () => {
      const schema = {
        rateLimitMs: { type: 'number', required: true },
        debug: { type: 'boolean', required: true },
        prefix: { type: 'string', required: true }
      };
      
      const input = {
        rateLimitMs: 0,
        debug: false,
        prefix: ''
      };
      
      const result = buildOptionsStrict(input, schema);
      
      expect(result).toEqual({
        rateLimitMs: 0,
        debug: false,
        prefix: ''
      });
    });
  });

  describe('real-world usage', () => {
    test('crawler options with conditional defaults', () => {
      const crawlerOptionsSchema = {
        rateLimitMs: { 
          type: 'number', 
          default: (opts) => opts.slowMode ? 1000 : 0 
        },
        maxConcurrency: { 
          type: 'number', 
          default: (opts) => opts.slowMode ? 1 : 5 
        },
        maxPages: { type: 'number', default: Infinity },
        slowMode: { type: 'boolean', default: false },
        verbose: { type: 'boolean', default: false }
      };
      
      // Fast mode
      const fastOptions = buildOptions({ slowMode: false }, crawlerOptionsSchema);
      expect(fastOptions.rateLimitMs).toBe(0);
      expect(fastOptions.maxConcurrency).toBe(5);
      
      // Slow mode
      const slowOptions = buildOptions({ slowMode: true }, crawlerOptionsSchema);
      expect(slowOptions.rateLimitMs).toBe(1000);
      expect(slowOptions.maxConcurrency).toBe(1);
      
      // Override slow mode defaults
      const customOptions = buildOptions(
        { slowMode: true, maxConcurrency: 3 }, 
        crawlerOptionsSchema
      );
      expect(customOptions.maxConcurrency).toBe(3);
    });

    test('replaces 35 lines of typeof validation', () => {
      // Simulates crawl.js constructor pattern
      const schema = {
        rateLimitMs: { type: 'number', default: 0 },
        maxConcurrency: { type: 'number', default: 5 },
        maxPages: { type: 'number', default: Infinity },
        timeout: { type: 'number', default: 30000 },
        retryLimit: { type: 'number', default: 3 }
      };
      
      const input = {
        rateLimitMs: 500,
        maxPages: '100', // Wrong type, should use default
        timeout: null,   // Null, should use default
        retryLimit: 5
      };
      
      const options = buildOptions(input, schema);
      
      expect(options.rateLimitMs).toBe(500);
      expect(options.maxConcurrency).toBe(5); // default
      expect(options.maxPages).toBe(Infinity); // default (wrong type)
      expect(options.timeout).toBe(30000); // default (null)
      expect(options.retryLimit).toBe(5);
    });

    test('server configuration with validation', () => {
      const schema = {
        port: { type: 'number', required: true },
        host: { type: 'string', default: 'localhost' },
        ssl: { type: 'boolean', default: false },
        timeout: { 
          type: 'number', 
          default: (opts) => opts.ssl ? 60000 : 30000 
        }
      };
      
      const input = { port: 443, ssl: true };
      const config = buildOptionsStrict(input, schema, 'server');
      
      expect(config).toEqual({
        port: 443,
        host: 'localhost',
        ssl: true,
        timeout: 60000
      });
    });
  });

  describe('edge cases', () => {
    test('handles empty schema', () => {
      const result = buildOptions({ foo: 'bar' }, {});
      expect(result).toEqual({});
    });

    test('handles empty input', () => {
      const schema = {
        port: { type: 'number', default: 3000 }
      };
      const result = buildOptions({}, schema);
      expect(result).toEqual({ port: 3000 });
    });

    test('ignores extra input properties', () => {
      const schema = {
        port: { type: 'number', default: 3000 }
      };
      const input = { port: 8080, extra: 'ignored' };
      const result = buildOptions(input, schema);
      
      expect(result).toEqual({ port: 8080 });
      expect(result.extra).toBeUndefined();
    });

    test('handles Infinity as valid number', () => {
      const schema = {
        maxPages: { type: 'number', default: 100 }
      };
      const input = { maxPages: Infinity };
      const result = buildOptions(input, schema);
      
      expect(result.maxPages).toBe(Infinity);
    });

    test('handles NaN as valid number type', () => {
      const schema = {
        value: { type: 'number', default: 0 }
      };
      const input = { value: NaN };
      const result = buildOptions(input, schema);
      
      // NaN is type 'number' in JavaScript
      expect(result.value).toBe(NaN);
    });
  });
});
