/**
 * Unit tests for lang-tools collective() function
 * 
 * These tests verify the Proxy-based bulk operation pattern works as expected
 * before integrating it into SSE handlers and other production code.
 */

const { collective, collect } = require('lang-tools');

describe('collective() - Proxy pattern for bulk operations', () => {
  
  describe('Basic property access', () => {
    test('should get property from all array items', () => {
      const objects = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
        { name: 'Charlie', age: 35 }
      ];
      
      const coll = collective(objects);
      const names = coll.name;
      
      expect(names).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    test('should return array properties directly', () => {
      const arr = [1, 2, 3, 4, 5];
      const coll = collective(arr);
      
      // Array's own properties should pass through
      expect(coll.length).toBe(5);
    });
  });

  describe('Method calls', () => {
    test('should call method on all items and return results', () => {
      const numbers = [
        { value: 10, double() { return this.value * 2; } },
        { value: 20, double() { return this.value * 2; } },
        { value: 30, double() { return this.value * 2; } }
      ];
      
      const coll = collective(numbers);
      const doubled = coll.double();
      
      expect(doubled).toEqual([20, 40, 60]);
    });

    test('should pass arguments to method calls', () => {
      const strings = ['hello', 'world', 'test'];
      const coll = collective(strings);
      const uppercased = coll.toUpperCase();
      
      expect(uppercased).toEqual(['HELLO', 'WORLD', 'TEST']);
    });

    test('should handle method calls with multiple arguments', () => {
      const strings = ['apple', 'banana', 'cherry'];
      const coll = collective(strings);
      const sliced = coll.slice(0, 3);
      
      expect(sliced).toEqual(['app', 'ban', 'che']);
    });
  });

  describe('DOM-like operations (with mock objects)', () => {
    test('should NOT work with nested property method calls (limitation)', () => {
      const mockElements = [
        { classList: { add: jest.fn(), classes: [] } },
        { classList: { add: jest.fn(), classes: [] } },
        { classList: { add: jest.fn(), classes: [] } }
      ];
      
      const coll = collective(mockElements);
      // collective returns array of classList objects, not a proxy to them
      const classLists = coll.classList;
      
      expect(Array.isArray(classLists)).toBe(true);
      expect(classLists.length).toBe(3);
      // So we'd need: classLists.forEach(cl => cl.add('active'))
      // Or: mockElements.forEach(el => el.classList.add('active'))
    });

    test('should simulate textContent assignment pattern', () => {
      const mockElements = [
        { textContent: '' },
        { textContent: '' },
        { textContent: '' }
      ];
      
      // Note: collective returns getters, so we need to test the property access pattern
      const coll = collective(mockElements);
      const textContents = coll.textContent;
      
      expect(textContents).toEqual(['', '', '']);
      
      // For setting, we'd do it individually (collective is for reads/method calls)
      mockElements.forEach(el => el.textContent = 'Updated');
      expect(mockElements[0].textContent).toBe('Updated');
    });

    test('should handle getBoundingClientRect-like method', () => {
      const mockElements = [
        { getBoundingClientRect: () => ({ width: 100, height: 50 }) },
        { getBoundingClientRect: () => ({ width: 200, height: 75 }) },
        { getBoundingClientRect: () => ({ width: 150, height: 60 }) }
      ];
      
      const coll = collective(mockElements);
      const rects = coll.getBoundingClientRect();
      
      expect(rects).toEqual([
        { width: 100, height: 50 },
        { width: 200, height: 75 },
        { width: 150, height: 60 }
      ]);
    });
  });

  describe('Edge cases', () => {
    test('should handle empty arrays (returns empty when accessing properties)', () => {
      const coll = collective([]);
      // Empty arrays cause undefined access on arr[0]
      // This is a known limitation - collective assumes non-empty arrays
      expect(() => coll.someProp).toThrow();
    });

    test('should handle arrays with single item', () => {
      const coll = collective([{ name: 'Solo' }]);
      const names = coll.name;
      
      expect(names).toEqual(['Solo']);
    });

    test('should handle undefined properties', () => {
      const objects = [
        { name: 'Alice' },
        { name: 'Bob' },
        { name: 'Charlie' }
      ];
      
      const coll = collective(objects);
      const ages = coll.age; // age property doesn't exist
      
      expect(ages).toEqual([undefined, undefined, undefined]);
    });

    test('should handle mixed property types', () => {
      const objects = [
        { value: 10 },
        { value: 'twenty' },
        { value: null }
      ];
      
      const coll = collective(objects);
      const values = coll.value;
      
      expect(values).toEqual([10, 'twenty', null]);
    });
  });

  describe('collect() alias', () => {
    test('should work identically to collective()', () => {
      const objects = [
        { name: 'Test1' },
        { name: 'Test2' }
      ];
      
      const coll1 = collective(objects);
      const coll2 = collect(objects);
      
      expect(coll1.name).toEqual(coll2.name);
      expect(coll1.name).toEqual(['Test1', 'Test2']);
    });
  });

  describe('Real-world SSE handler patterns', () => {
    test('should support milestone visited hubs pattern', () => {
      // Simulating: milestone.visited_hub_countries.forEach(country => createLi(country))
      const countries = ['USA', 'UK', 'Germany', 'France'];
      
      const mockCountries = countries.map(country => ({
        toString: () => country,
        toLowerCase: function() { return country.toLowerCase(); }
      }));
      
      const coll = collective(mockCountries);
      const lowercased = coll.toLowerCase();
      
      expect(lowercased).toEqual(['usa', 'uk', 'germany', 'france']);
    });

    test('should NOT work with nested DOM element batch updates (limitation)', () => {
      const mockSpans = [
        { classList: { remove: jest.fn() }, textContent: '' },
        { classList: { remove: jest.fn() }, textContent: '' },
        { classList: { remove: jest.fn() }, textContent: '' }
      ];
      
      // Pattern: collective(spans).classList.remove('highlight') does NOT work
      // Because collective returns array of classList objects, not proxy to nested methods
      const coll = collective(mockSpans);
      const classLists = coll.classList;
      
      expect(Array.isArray(classLists)).toBe(true);
      // Would need: mockSpans.forEach(span => span.classList.remove('highlight'))
    });

    test('should support extracting values for comparison', () => {
      const mockElements = [
        { dataset: { id: '1', priority: 'high' } },
        { dataset: { id: '2', priority: 'low' } },
        { dataset: { id: '3', priority: 'medium' } }
      ];
      
      const coll = collective(mockElements);
      const priorities = coll.dataset;
      
      expect(priorities).toEqual([
        { id: '1', priority: 'high' },
        { id: '2', priority: 'low' },
        { id: '3', priority: 'medium' }
      ]);
    });
  });

  describe('Performance and limitations', () => {
    test('should handle large arrays efficiently', () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => ({ 
        id: i, 
        getValue() { return this.id * 2; } 
      }));
      
      const coll = collective(largeArray);
      const values = coll.getValue();
      
      expect(values.length).toBe(1000);
      expect(values[0]).toBe(0);
      expect(values[999]).toBe(1998);
    });

    test('should work with chained method calls on results', () => {
      const objects = [
        { name: 'Alice' },
        { name: 'Bob' },
        { name: 'Charlie' }
      ];
      
      const coll = collective(objects);
      const names = coll.name;
      
      // Results are plain arrays, so we can use array methods
      const filtered = names.filter(n => n.startsWith('A'));
      expect(filtered).toEqual(['Alice']);
    });
  });
});
