/**
 * @fileoverview Tests for object helper utilities
 */

const { firstDefined, numberOr, stringOr, getDeep } = require('../objectHelpers');

// Fast unit tests - use 1-second timeout
describe('objectHelpers', fastTest(() => {
  describe('firstDefined', () => {
    test('returns first defined value', () => {
      expect(firstDefined(undefined, null, 'hello')).toBe('hello');
      expect(firstDefined(null, 'first', 'second')).toBe('first');
      expect(firstDefined('immediate')).toBe('immediate');
    });

    test('returns undefined when all values are null/undefined', () => {
      expect(firstDefined(null, undefined)).toBeUndefined();
      expect(firstDefined()).toBeUndefined();
    });

    test('treats falsy values as defined', () => {
      expect(firstDefined(null, false, 'fallback')).toBe(false);
      expect(firstDefined(undefined, 0, 100)).toBe(0);
      expect(firstDefined(null, '', 'fallback')).toBe('');
    });

    test('works with complex values', () => {
      const obj = { key: 'value' };
      const arr = [1, 2, 3];
      expect(firstDefined(null, obj, arr)).toBe(obj);
      expect(firstDefined(undefined, arr, obj)).toBe(arr);
    });

    test('handles single argument', () => {
      expect(firstDefined('single')).toBe('single');
      expect(firstDefined(null)).toBeUndefined();
    });

    test('handles many arguments', () => {
      expect(firstDefined(
        undefined, null, undefined, null, 'found', 'ignored'
      )).toBe('found');
    });
  });

  describe('numberOr', () => {
    test('returns first numeric property', () => {
      const obj = { a: null, b: 42, c: 100 };
      expect(numberOr(obj, ['a', 'b', 'c'])).toBe(42);
    });

    test('returns fallback when no numeric property found', () => {
      const obj = { a: 'string', b: null, c: undefined };
      expect(numberOr(obj, ['a', 'b', 'c'], 99)).toBe(99);
    });

    test('accepts single key as string', () => {
      const obj = { count: 10 };
      expect(numberOr(obj, 'count')).toBe(10);
    });

    test('handles missing properties', () => {
      const obj = { a: 1 };
      expect(numberOr(obj, ['x', 'y', 'z'], 0)).toBe(0);
    });

    test('defaults to 0 when no fallback provided', () => {
      const obj = { a: 'string' };
      expect(numberOr(obj, 'a')).toBe(0);
    });

    test('rejects non-numeric values', () => {
      const obj = { a: '42', b: true, c: 100 };
      expect(numberOr(obj, ['a', 'b', 'c'])).toBe(100);
    });

    test('handles zero as valid number', () => {
      const obj = { a: null, b: 0, c: 10 };
      expect(numberOr(obj, ['a', 'b', 'c'])).toBe(0);
    });

    test('handles negative numbers', () => {
      const obj = { a: null, b: -5, c: 10 };
      expect(numberOr(obj, ['a', 'b', 'c'])).toBe(-5);
    });

    test('handles null/undefined object', () => {
      expect(numberOr(null, 'key', 42)).toBe(42);
      expect(numberOr(undefined, 'key', 42)).toBe(42);
    });

    test('real-world: progress info extraction', () => {
      const progressInfo = {
        processed: undefined,
        updated: null,
        analysed: 150,
        other: 200
      };
      expect(numberOr(progressInfo, ['processed', 'updated', 'analysed'], 0)).toBe(150);
    });
  });

  describe('stringOr', () => {
    test('returns first string property', () => {
      const obj = { a: null, b: 'hello', c: 'world' };
      expect(stringOr(obj, ['a', 'b', 'c'])).toBe('hello');
    });

    test('returns fallback when no string property found', () => {
      const obj = { a: 123, b: null, c: undefined };
      expect(stringOr(obj, ['a', 'b', 'c'], 'default')).toBe('default');
    });

    test('accepts single key as string', () => {
      const obj = { name: 'Alice' };
      expect(stringOr(obj, 'name')).toBe('Alice');
    });

    test('filters out empty strings', () => {
      const obj = { a: '', b: 'found', c: 'ignored' };
      expect(stringOr(obj, ['a', 'b', 'c'])).toBe('found');
    });

    test('defaults to empty string when no fallback provided', () => {
      const obj = { a: 123 };
      expect(stringOr(obj, 'a')).toBe('');
    });

    test('rejects non-string values', () => {
      const obj = { a: 42, b: true, c: 'valid' };
      expect(stringOr(obj, ['a', 'b', 'c'])).toBe('valid');
    });

    test('handles null/undefined object', () => {
      expect(stringOr(null, 'key', 'fallback')).toBe('fallback');
      expect(stringOr(undefined, 'key', 'fallback')).toBe('fallback');
    });

    test('real-world: place name extraction', () => {
      const place = {
        label: null,
        name: '',
        title: 'Paris',
        fallback: 'City'
      };
      expect(stringOr(place, ['label', 'name', 'title'], 'Unknown')).toBe('Paris');
    });
  });

  describe('getDeep', () => {
    test('retrieves nested property with string path', () => {
      const obj = { user: { profile: { name: 'Alice' } } };
      expect(getDeep(obj, 'user.profile.name')).toBe('Alice');
    });

    test('retrieves nested property with array path', () => {
      const obj = { user: { profile: { name: 'Alice' } } };
      expect(getDeep(obj, ['user', 'profile', 'name'])).toBe('Alice');
    });

    test('returns fallback for missing path', () => {
      const obj = { user: { name: 'Alice' } };
      expect(getDeep(obj, 'user.profile.name', 'Anonymous')).toBe('Anonymous');
    });

    test('returns fallback for null intermediate values', () => {
      const obj = { user: null };
      expect(getDeep(obj, 'user.profile.name', 'default')).toBe('default');
    });

    test('returns fallback for undefined intermediate values', () => {
      const obj = { user: { profile: undefined } };
      expect(getDeep(obj, 'user.profile.name', 'default')).toBe('default');
    });

    test('handles null/undefined root object', () => {
      expect(getDeep(null, 'user.name', 'fallback')).toBe('fallback');
      expect(getDeep(undefined, 'user.name', 'fallback')).toBe('fallback');
    });

    test('handles empty path', () => {
      const obj = { value: 42 };
      expect(getDeep(obj, '')).toBe(obj);
      expect(getDeep(obj, [])).toBe(obj);
    });

    test('handles single-level path', () => {
      const obj = { name: 'Alice' };
      expect(getDeep(obj, 'name')).toBe('Alice');
      expect(getDeep(obj, ['name'])).toBe('Alice');
    });

    test('returns undefined when no fallback provided', () => {
      const obj = { user: { name: 'Alice' } };
      expect(getDeep(obj, 'user.profile.name')).toBeUndefined();
    });

    test('preserves falsy values that exist', () => {
      const obj = { user: { active: false, count: 0, name: '' } };
      expect(getDeep(obj, 'user.active')).toBe(false);
      expect(getDeep(obj, 'user.count')).toBe(0);
      expect(getDeep(obj, 'user.name')).toBe('');
    });

    test('handles arrays in path', () => {
      const obj = { users: [{ name: 'Alice' }, { name: 'Bob' }] };
      expect(getDeep(obj, 'users.0.name')).toBe('Alice');
      expect(getDeep(obj, ['users', '1', 'name'])).toBe('Bob');
    });

    test('handles non-object intermediate values', () => {
      const obj = { user: 'string-not-object' };
      expect(getDeep(obj, 'user.profile.name', 'fallback')).toBe('fallback');
    });

    test('real-world: deeply nested optional chaining replacement', () => {
      const data = {
        response: {
          results: {
            bindings: [
              { country: { value: 'Q123' } }
            ]
          }
        }
      };
      
      expect(getDeep(data, 'response.results.bindings.0.country.value'))
        .toBe('Q123');
      
      expect(getDeep(data, 'response.results.bindings.5.country.value', null))
        .toBe(null);
    });
  });

  describe('integration scenarios', () => {
    test('combined nullish coalescing pattern', () => {
      const seeded = {
        unique: undefined,
        requested: null,
        count: 0,
        visited: 100
      };
      
      // numberOr handles the chain
      expect(numberOr(seeded, ['unique', 'requested', 'count', 'visited']))
        .toBe(0);
    });

    test('multi-source data extraction', () => {
      const progressInfo = {
        processed: null,
        updated: 150,
        analysed: null
      };
      
      const processed = numberOr(progressInfo, ['processed', 'updated', 'analysed'], 0);
      expect(processed).toBe(150);
    });

    test('configuration with deep paths and fallbacks', () => {
      const config = {
        server: {
          database: {
            connection: {
              host: 'localhost'
            }
          }
        }
      };
      
      const host = getDeep(config, 'server.database.connection.host', '127.0.0.1');
      const port = getDeep(config, 'server.database.connection.port', 5432);
      
      expect(host).toBe('localhost');
      expect(port).toBe(5432);
    });
  });
}));
