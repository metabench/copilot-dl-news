/**
 * @fileoverview Fluent builder for gazetteer place attributes.
 * Eliminates repetitive conditional attribute construction.
 * @module utils/attributeBuilder
 */

const { is_defined } = require('lang-tools');

/**
 * Fluent builder for constructing place attributes with automatic filtering.
 * Only adds attributes with defined, non-empty values.
 * 
 * @example
 * const builder = new AttributeBuilder('wikidata');
 * builder.add('population', population)
 *        .add('area_km2', area)
 *        .add('capital', capital)
 *        .add('currency', currency?.currencyLabel?.value);
 * const attributes = builder.build();
 * 
 * // Replaces 32 lines of:
 * // if (population != null) {
 * //   attributes.push({ kind: 'population', value: String(population), source: 'wikidata' });
 * // }
 */
class AttributeBuilder {
  /**
   * @param {string} source - Source identifier (e.g., 'wikidata', 'osm')
   */
  constructor(source) {
    this.source = source;
    this.attributes = [];
  }

  /**
   * Adds an attribute if the value is defined and non-empty.
   * 
   * @param {string} kind - Attribute kind/type
   * @param {*} value - Attribute value (will be stringified)
   * @returns {AttributeBuilder} - this for chaining
   */
  add(kind, value) {
    if (value != null && value !== '') {
      this.attributes.push({ 
        kind, 
        value: String(value), 
        source: this.source 
      });
    }
    return this; // Enable chaining
  }

  /**
   * Adds multiple attributes from an object.
   * 
   * @param {Object} attrs - Object mapping attribute kinds to values
   * @returns {AttributeBuilder} - this for chaining
   * 
   * @example
   * builder.addMany({
   *   population: 1000000,
   *   area_km2: 500,
   *   capital: 'City'
   * });
   */
  addMany(attrs) {
    for (const [kind, value] of Object.entries(attrs)) {
      this.add(kind, value);
    }
    return this;
  }

  /**
   * Returns the built attributes array.
   * 
   * @returns {Array<{kind: string, value: string, source: string}>}
   */
  build() {
    return this.attributes;
  }

  /**
   * Returns the number of attributes added.
   * 
   * @returns {number}
   */
  count() {
    return this.attributes.length;
  }

  /**
   * Clears all attributes.
   * 
   * @returns {AttributeBuilder} - this for chaining
   */
  reset() {
    this.attributes = [];
    return this;
  }
}

module.exports = { AttributeBuilder };
