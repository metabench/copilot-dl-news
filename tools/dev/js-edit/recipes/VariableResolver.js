/**
 * VariableResolver — Resolves ${} variable substitution in recipes
 * 
 * Supports:
 * - Direct variables: ${functionName}
 * - Nested access: ${found_functions.matches[0].name}
 * - Array operations: ${found_functions.matches[*].name}
 * - Fallbacks: ${varName|'default'}
 * 
 * @module tools/dev/js-edit/recipes/VariableResolver
 */

class VariableResolver {
  /**
   * @param {Object} params - Parameter scope
   * @param {Object} stepContext - Results from previous steps
   */
  constructor(params = {}, stepContext = {}) {
    this.params = params;
    this.stepContext = stepContext;
  }

  /**
   * Resolve a variable string containing ${} expressions
   */
  resolve(str) {
    if (typeof str !== 'string') {
      return str;
    }

    // Replace all ${...} expressions
    return str.replace(/\$\{([^}]+)\}/g, (match, expr) => {
      try {
        return this._resolveExpression(expr);
      } catch (error) {
        throw new Error(`Failed to resolve variable: ${expr}\n${error.message}`);
      }
    });
  }

  /**
   * Resolve a single expression (without ${})
   */
  _resolveExpression(expr) {
    expr = expr.trim();

    // Handle fallback: varName|'default'
    if (expr.includes('|')) {
      const [primary, fallback] = expr.split('|').map(s => s.trim());
      try {
        return this._resolveExpression(primary);
      } catch {
        // Use fallback
        return fallback.replace(/^['"]|['"]$/g, ''); // Strip quotes
      }
    }

    // Handle array map: varName[*].property
    if (expr.includes('[*]')) {
      return this._resolveArrayMap(expr);
    }

    // Handle direct path access
    const parts = expr.split('.');
    let value = this._resolveRoot(parts[0]);

    // Navigate through nested properties
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      value = this._accessProperty(value, part);
    }

    return value;
  }

  /**
   * Resolve root variable (check params, then step context, then built-in)
   */
  _resolveRoot(name) {
    // Check for array/object access: name[0] or name.foo
    const match = name.match(/^(\w+)(?:\[([^\]]+)\])?$/);
    if (!match) {
      throw new Error(`Invalid variable name: ${name}`);
    }

    const baseName = match[1];
    const accessor = match[2];

    let value;
    if (this.params.hasOwnProperty(baseName)) {
      value = this.params[baseName];
    } else if (this.stepContext.hasOwnProperty(baseName)) {
      value = this.stepContext[baseName];
    } else {
      throw new Error(`Variable not found: ${baseName}`);
    }

    // Apply accessor if present
    if (accessor !== undefined) {
      if (accessor.match(/^\d+$/)) {
        // Numeric index
        value = value[parseInt(accessor, 10)];
      } else if (accessor.startsWith("'") || accessor.startsWith('"')) {
        // String key
        const key = accessor.slice(1, -1);
        value = value[key];
      } else {
        // Property name
        value = value[accessor];
      }
    }

    return value;
  }

  /**
   * Access a property, handling both dot notation and bracket notation
   */
  _accessProperty(obj, part) {
    if (obj === null || obj === undefined) {
      throw new Error(`Cannot access property "${part}" of null/undefined`);
    }

    // Handle array/object access: part[0] or part.foo or part['key']
    const match = part.match(/^(\w+)(?:\[([^\]]+)\])?$/);
    if (!match) {
      throw new Error(`Invalid property access: ${part}`);
    }

    const propName = match[1];
    const accessor = match[2];

    let value = obj[propName];

    if (accessor !== undefined) {
      if (accessor.match(/^\d+$/)) {
        // Numeric index
        value = value[parseInt(accessor, 10)];
      } else if (accessor.startsWith("'") || accessor.startsWith('"')) {
        // String key
        const key = accessor.slice(1, -1);
        value = value[key];
      } else {
        // Property name or variable
        throw new Error(`Complex accessors not yet supported: ${part}`);
      }
    }

    return value;
  }

  /**
   * Resolve array map: items[*].name
   * Returns array of property values
   */
  _resolveArrayMap(expr) {
    // Find the [*] position
    const mapIndex = expr.indexOf('[*]');
    const basePath = expr.substring(0, mapIndex);
    const mapPath = expr.substring(mapIndex + 4); // Skip [*]

    // Resolve base array
    let array = this._resolveExpression(basePath);

    if (!Array.isArray(array)) {
      throw new Error(`Array map target is not an array: ${basePath}`);
    }

    // Map operation
    if (mapPath.length === 0) {
      // No property specified, return array as-is
      return array;
    }

    if (mapPath.startsWith('.')) {
      // Property access: [*].name
      const propName = mapPath.substring(1);
      return array.map(item => {
        if (item === null || item === undefined) return null;
        return item[propName];
      });
    }

    throw new Error(`Invalid array map syntax: ${expr}`);
  }

  /**
   * Type coercion for recipe values
   */
  static coerce(value, expectedType) {
    if (!expectedType) return value;

    switch (expectedType) {
      case 'string':
        return String(value);
      case 'number':
        return Number(value);
      case 'boolean':
        if (typeof value === 'boolean') return value;
        return value === 'true' || value === '1' || value === true;
      case 'array':
        return Array.isArray(value) ? value : [value];
      default:
        return value;
    }
  }
}

module.exports = VariableResolver;
