/**
 * @fileoverview Tests for AttributeBuilder
 */

const { AttributeBuilder } = require('../attributeBuilder');

describe('AttributeBuilder', () => {
  describe('basic functionality', () => {
    test('creates empty builder with source', () => {
      const builder = new AttributeBuilder('wikidata');
      expect(builder.source).toBe('wikidata');
      expect(builder.build()).toEqual([]);
    });

    test('adds single attribute', () => {
      const builder = new AttributeBuilder('wikidata');
      builder.add('population', 1000000);
      
      const attrs = builder.build();
      expect(attrs).toHaveLength(1);
      expect(attrs[0]).toEqual({
        kind: 'population',
        value: '1000000',
        source: 'wikidata'
      });
    });

    test('chains multiple adds', () => {
      const builder = new AttributeBuilder('wikidata');
      builder
        .add('population', 1000000)
        .add('area_km2', 500)
        .add('capital', 'City');
      
      const attrs = builder.build();
      expect(attrs).toHaveLength(3);
      expect(attrs[0].kind).toBe('population');
      expect(attrs[1].kind).toBe('area_km2');
      expect(attrs[2].kind).toBe('capital');
    });
  });

  describe('value filtering', () => {
    test('filters out null values', () => {
      const builder = new AttributeBuilder('wikidata');
      builder
        .add('population', 1000000)
        .add('area_km2', null)
        .add('capital', 'City');
      
      const attrs = builder.build();
      expect(attrs).toHaveLength(2);
      expect(attrs.map(a => a.kind)).toEqual(['population', 'capital']);
    });

    test('filters out undefined values', () => {
      const builder = new AttributeBuilder('wikidata');
      builder
        .add('population', 1000000)
        .add('area_km2', undefined)
        .add('capital', 'City');
      
      const attrs = builder.build();
      expect(attrs).toHaveLength(2);
    });

    test('filters out empty strings', () => {
      const builder = new AttributeBuilder('wikidata');
      builder
        .add('population', 1000000)
        .add('capital', '')
        .add('timezone', 'UTC');
      
      const attrs = builder.build();
      expect(attrs).toHaveLength(2);
      expect(attrs.map(a => a.kind)).toEqual(['population', 'timezone']);
    });

    test('preserves zero as valid value', () => {
      const builder = new AttributeBuilder('wikidata');
      builder.add('count', 0);
      
      const attrs = builder.build();
      expect(attrs).toHaveLength(1);
      expect(attrs[0].value).toBe('0');
    });

    test('preserves false as valid value', () => {
      const builder = new AttributeBuilder('wikidata');
      builder.add('flag', false);
      
      const attrs = builder.build();
      expect(attrs).toHaveLength(1);
      expect(attrs[0].value).toBe('false');
    });
  });

  describe('value stringification', () => {
    test('converts numbers to strings', () => {
      const builder = new AttributeBuilder('wikidata');
      builder.add('population', 1000000);
      
      expect(builder.build()[0].value).toBe('1000000');
    });

    test('converts booleans to strings', () => {
      const builder = new AttributeBuilder('wikidata');
      builder.add('active', true).add('closed', false);
      
      const attrs = builder.build();
      expect(attrs[0].value).toBe('true');
      expect(attrs[1].value).toBe('false');
    });

    test('preserves strings as-is', () => {
      const builder = new AttributeBuilder('wikidata');
      builder.add('name', 'Test City');
      
      expect(builder.build()[0].value).toBe('Test City');
    });

    test('converts objects to strings', () => {
      const builder = new AttributeBuilder('wikidata');
      builder.add('data', { key: 'value' });
      
      expect(builder.build()[0].value).toBe('[object Object]');
    });
  });

  describe('addMany', () => {
    test('adds multiple attributes from object', () => {
      const builder = new AttributeBuilder('wikidata');
      builder.addMany({
        population: 1000000,
        area_km2: 500,
        capital: 'City'
      });
      
      const attrs = builder.build();
      expect(attrs).toHaveLength(3);
      expect(attrs.map(a => a.kind).sort()).toEqual(['area_km2', 'capital', 'population']);
    });

    test('filters null/undefined values in addMany', () => {
      const builder = new AttributeBuilder('wikidata');
      builder.addMany({
        population: 1000000,
        area_km2: null,
        capital: 'City',
        timezone: undefined
      });
      
      const attrs = builder.build();
      expect(attrs).toHaveLength(2);
      expect(attrs.map(a => a.kind).sort()).toEqual(['capital', 'population']);
    });

    test('chains with regular add', () => {
      const builder = new AttributeBuilder('wikidata');
      builder
        .add('id', 'Q123')
        .addMany({ population: 1000000, area_km2: 500 })
        .add('capital', 'City');
      
      const attrs = builder.build();
      expect(attrs).toHaveLength(4);
      expect(attrs[0].kind).toBe('id');
      expect(attrs[3].kind).toBe('capital');
    });
  });

  describe('utility methods', () => {
    test('count returns number of attributes', () => {
      const builder = new AttributeBuilder('wikidata');
      expect(builder.count()).toBe(0);
      
      builder.add('population', 1000000);
      expect(builder.count()).toBe(1);
      
      builder.add('area_km2', 500);
      expect(builder.count()).toBe(2);
    });

    test('reset clears all attributes', () => {
      const builder = new AttributeBuilder('wikidata');
      builder
        .add('population', 1000000)
        .add('area_km2', 500);
      
      expect(builder.count()).toBe(2);
      
      builder.reset();
      expect(builder.count()).toBe(0);
      expect(builder.build()).toEqual([]);
    });

    test('reset returns this for chaining', () => {
      const builder = new AttributeBuilder('wikidata');
      builder
        .add('population', 1000000)
        .reset()
        .add('area_km2', 500);
      
      const attrs = builder.build();
      expect(attrs).toHaveLength(1);
      expect(attrs[0].kind).toBe('area_km2');
    });
  });

  describe('real-world usage', () => {
    test('replaces repetitive conditional pushes', () => {
      // Simulates WikidataCountryIngestor pattern
      const population = 1000000;
      const area = 500;
      const capital = null;
      const currency = { currencyLabel: { value: 'EUR' } };
      const gdp = undefined;
      const gini = 0.3;
      const hdi = 0.9;
      const timezone = '';
      
      const builder = new AttributeBuilder('wikidata');
      builder
        .add('population', population)
        .add('area_km2', area)
        .add('capital', capital)
        .add('currency', currency?.currencyLabel?.value)
        .add('gdp', gdp)
        .add('gini', gini)
        .add('hdi', hdi)
        .add('timezone', timezone);
      
      const attrs = builder.build();
      
      // Only non-null/non-empty values added
      expect(attrs).toHaveLength(5);
      expect(attrs.map(a => a.kind).sort()).toEqual([
        'area_km2',
        'currency',
        'gini',
        'hdi',
        'population'
      ]);
    });

    test('supports multiple sources', () => {
      const wikidataBuilder = new AttributeBuilder('wikidata');
      wikidataBuilder.add('population', 1000000);
      
      const osmBuilder = new AttributeBuilder('osm');
      osmBuilder.add('boundary', 'administrative');
      
      const allAttrs = [
        ...wikidataBuilder.build(),
        ...osmBuilder.build()
      ];
      
      expect(allAttrs).toHaveLength(2);
      expect(allAttrs[0].source).toBe('wikidata');
      expect(allAttrs[1].source).toBe('osm');
    });

    test('handles optional chaining gracefully', () => {
      const data = {
        basic: { value: 'basic' },
        nested: { deep: { value: 'nested' } },
        missing: null
      };
      
      const builder = new AttributeBuilder('source');
      builder
        .add('basic', data.basic?.value)
        .add('nested', data.nested?.deep?.value)
        .add('missing', data.missing?.value)
        .add('undefined', data.nothere?.value);
      
      const attrs = builder.build();
      expect(attrs).toHaveLength(2);
      expect(attrs.map(a => a.kind)).toEqual(['basic', 'nested']);
    });
  });

  describe('edge cases', () => {
    test('handles very long values', () => {
      const longValue = 'x'.repeat(10000);
      const builder = new AttributeBuilder('wikidata');
      builder.add('description', longValue);
      
      expect(builder.build()[0].value).toBe(longValue);
    });

    test('handles special characters', () => {
      const builder = new AttributeBuilder('wikidata');
      builder.add('name', 'Test & "Special" <Characters>');
      
      expect(builder.build()[0].value).toBe('Test & "Special" <Characters>');
    });

    test('handles unicode', () => {
      const builder = new AttributeBuilder('wikidata');
      builder.add('name', '北京市 🏙️');
      
      expect(builder.build()[0].value).toBe('北京市 🏙️');
    });

    test('handles whitespace-only strings', () => {
      const builder = new AttributeBuilder('wikidata');
      builder.add('name', '   ');
      
      // Whitespace-only strings are preserved (not empty)
      expect(builder.build()).toHaveLength(1);
    });
  });
});
