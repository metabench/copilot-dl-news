/**
 * @fileoverview Tests for pipeline utilities
 */

const { compact, pluck, pipeline } = require('../pipelines');

describe('pipelines', () => {
  describe('compact', () => {
    test('filters out falsy values without mapping', () => {
      const input = [1, null, 2, undefined, 3, false, 4, '', 5, 0];
      const result = compact(input);
      expect(result).toEqual([1, 2, 3, 4, 5, 0]); // 0 is truthy for numbers
    });

    test('maps and filters in single pass', () => {
      const input = [
        { value: 'a' },
        { value: null },
        { value: 'b' },
        { value: undefined },
        { value: 'c' }
      ];
      const result = compact(input, item => item.value);
      expect(result).toEqual(['a', 'b', 'c']);
    });

    test('handles nested optional chaining', () => {
      const input = [
        { country: { value: 'Q123' } },
        { country: null },
        { country: { value: 'Q456' } },
        {},
        { country: { value: null } }
      ];
      const result = compact(input, item => item.country?.value);
      expect(result).toEqual(['Q123', 'Q456']);
    });

    test('handles empty arrays', () => {
      expect(compact([])).toEqual([]);
      expect(compact([], x => x * 2)).toEqual([]);
    });

    test('handles null/undefined input gracefully', () => {
      expect(compact(null)).toEqual([]);
      expect(compact(undefined)).toEqual([]);
    });

    test('filters empty strings but not zeros', () => {
      const input = ['a', '', 'b', 0, 'c', false];
      const result = compact(input);
      expect(result).toEqual(['a', 'b', 0, 'c']);
    });

    test('works with complex mapping functions', () => {
      const input = [
        { id: 1, name: 'Alice', active: true },
        { id: 2, name: '', active: true },
        { id: 3, name: 'Bob', active: false },
        { id: 4, name: 'Charlie', active: true }
      ];
      const result = compact(input, item => 
        item.active && item.name ? item.name : null
      );
      expect(result).toEqual(['Alice', 'Charlie']);
    });

    test('preserves numeric zero', () => {
      const input = [0, 1, 2, null, 3];
      const result = compact(input);
      expect(result).toEqual([0, 1, 2, 3]);
    });
  });

  describe('pluck', () => {
    test('extracts property from objects', () => {
      const input = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
        { name: 'Charlie', age: 35 }
      ];
      const result = pluck(input, 'name');
      expect(result).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    test('filters out null/undefined properties', () => {
      const input = [
        { name: 'Alice' },
        { name: null },
        { name: 'Bob' },
        { name: undefined },
        { name: 'Charlie' }
      ];
      const result = pluck(input, 'name');
      expect(result).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    test('handles missing property keys', () => {
      const input = [
        { name: 'Alice' },
        { age: 30 },
        { name: 'Bob' }
      ];
      const result = pluck(input, 'name');
      expect(result).toEqual(['Alice', 'Bob']);
    });

    test('handles empty arrays', () => {
      expect(pluck([], 'name')).toEqual([]);
    });

    test('handles null/undefined items', () => {
      const input = [
        { name: 'Alice' },
        null,
        { name: 'Bob' },
        undefined,
        { name: 'Charlie' }
      ];
      const result = pluck(input, 'name');
      expect(result).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    test('preserves empty strings', () => {
      const input = [
        { name: 'Alice' },
        { name: '' },
        { name: 'Bob' }
      ];
      const result = pluck(input, 'name');
      expect(result).toEqual(['Alice', '', 'Bob']);
    });

    test('preserves numeric zero', () => {
      const input = [
        { count: 0 },
        { count: 1 },
        { count: 2 }
      ];
      const result = pluck(input, 'count');
      expect(result).toEqual([0, 1, 2]);
    });

    test('works with nested objects', () => {
      const input = [
        { user: { id: 1 } },
        { user: { id: 2 } },
        { user: null },
        { user: { id: 3 } }
      ];
      const result = pluck(input, 'user');
      expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    });
  });

  describe('pipeline', () => {
    test('composes functions left to right', () => {
      const double = x => x * 2;
      const addTen = x => x + 10;
      const toString = x => String(x);
      
      const process = pipeline(double, addTen, toString);
      expect(process(5)).toBe('20'); // (5 * 2) + 10 = 20
    });

    test('works with array transformations', () => {
      const process = pipeline(
        items => compact(items, x => x?.value),
        values => values.filter(v => v.length > 2),
        values => values.sort()
      );
      
      const input = [
        { value: 'abc' },
        { value: 'a' },
        { value: 'def' },
        { value: null },
        { value: 'xyz' }
      ];
      
      expect(process(input)).toEqual(['abc', 'def', 'xyz']);
    });

    test('handles single function', () => {
      const double = x => x * 2;
      const process = pipeline(double);
      expect(process(5)).toBe(10);
    });

    test('handles empty pipeline', () => {
      const process = pipeline();
      expect(process(5)).toBe(5);
    });

    test('preserves intermediate transformations', () => {
      const steps = [];
      const log = (label) => (value) => {
        steps.push({ label, value });
        return value;
      };
      
      const process = pipeline(
        log('start'),
        x => x * 2,
        log('doubled'),
        x => x + 10,
        log('added')
      );
      
      process(5);
      expect(steps).toEqual([
        { label: 'start', value: 5 },
        { label: 'doubled', value: 10 },
        { label: 'added', value: 20 }
      ]);
    });

    test('can be composed with other pipelines', () => {
      const pipeline1 = pipeline(
        x => x * 2,
        x => x + 10
      );
      
      const pipeline2 = pipeline(
        x => x - 5,
        x => x / 3
      );
      
      const combined = pipeline(pipeline1, pipeline2);
      expect(combined(5)).toBe(5); // (5*2+10-5)/3 = 15/3 = 5
    });
  });

  describe('integration scenarios', () => {
    test('compact + pluck pattern', () => {
      const bindings = [
        { country: { value: 'Q123' } },
        { country: { value: null } },
        { country: { value: 'Q456' } },
        { country: null }
      ];
      
      // Extract and filter QIDs
      const qids = compact(bindings, b => b.country?.value);
      expect(qids).toEqual(['Q123', 'Q456']);
      
      // Alternative with pluck
      const countries = pluck(bindings, 'country');
      const qids2 = compact(countries, c => c?.value);
      expect(qids2).toEqual(['Q123', 'Q456']);
    });

    test('pipeline with compact and pluck', () => {
      const process = pipeline(
        items => pluck(items, 'data'),
        dataArray => compact(dataArray, d => d?.id),
        ids => ids.filter(id => id > 100)
      );
      
      const input = [
        { data: { id: 50 } },
        { data: { id: 150 } },
        { data: null },
        { data: { id: 200 } }
      ];
      
      expect(process(input)).toEqual([150, 200]);
    });
  });
});
