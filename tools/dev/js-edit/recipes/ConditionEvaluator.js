/**
 * ConditionEvaluator — Evaluates step conditions in recipes
 * 
 * Supports:
 * - Comparisons: ==, !=, <, >, <=, >=
 * - Logical: &&, ||, !
 * - Array/String methods: .length, .count, .includes()
 * - Boolean expressions with proper precedence
 * 
 * @module tools/dev/js-edit/recipes/ConditionEvaluator
 */

class ConditionEvaluator {
  /**
   * Evaluate a condition expression
   * @param {string} condition - Condition to evaluate
   * @param {Object} context - Variables available to the condition
   * @returns {boolean}
   */
  static evaluate(condition, context = {}) {
    const evaluator = new ConditionEvaluator(context);
    return evaluator._evaluate(condition);
  }

  constructor(context = {}) {
    this.context = context;
  }

  /**
   * Main evaluation entry point
   */
    _evaluate(expr) {
    expr = this._substituteTemplateVariables(expr);
    expr = String(expr ?? '').trim();

    // Handle logical OR (lowest precedence)
    if (expr.includes('||')) {
      const parts = this._splitTopLevel(expr, '||');
      return parts.some(part => this._evaluate(part));
    }

    // Handle logical AND
    if (expr.includes('&&')) {
      const parts = this._splitTopLevel(expr, '&&');
      return parts.every(part => this._evaluate(part));
    }

    // Handle logical NOT
    if (expr.startsWith('!')) {
      return !this._evaluate(expr.substring(1).trim());
    }

    // Handle comparisons
    const compOps = ['<=', '>=', '==', '!=', '<', '>'];
    for (const op of compOps) {
      if (expr.includes(op) && !expr.includes('"' + op) && !expr.includes("'" + op)) {
        return this._evaluateComparison(expr, op);
      }
    }

    // Handle method calls: .includes(), .length, .count
    if (expr.includes('.')) {
      return this._evaluateProperty(expr);
    }

    // Handle parentheses
    if (expr.startsWith('(') && expr.endsWith(')')) {
      return this._evaluate(expr.slice(1, -1));
    }

    // Handle literal values
    if (expr === 'true') return true;
    if (expr === 'false') return false;
    if (expr === 'null' || expr === 'undefined') return false;

    // Handle numeric literals
    if (/^\d+$/.test(expr)) {
      return parseInt(expr, 10) !== 0;
    }

    // Handle variable reference
    return this._resolveValue(expr) ? true : false;
  }

  _substituteTemplateVariables(expr) {
    if (typeof expr !== 'string') {
      return expr;
    }

    return expr.replace(/\$\{([^}]+)\}/g, (_, raw) => {
      const target = raw.trim();
      try {
        const value = this._resolveValue(target);
        if (value === undefined || value === null) {
          return 'null';
        }
        if (typeof value === 'string') {
          return JSON.stringify(value);
        }
        if (typeof value === 'number' || typeof value === 'boolean') {
          return String(value);
        }
        return JSON.stringify(value);
      } catch (error) {
        return target;
      }
    });
  }


  /**
   * Split expression by operator at top level (respecting parentheses/brackets)
   */
  _splitTopLevel(expr, operator) {
    const parts = [];
    let current = '';
    let depth = 0;
    let bracketDepth = 0;

    for (let i = 0; i < expr.length; i++) {
      const char = expr[i];
      const next = expr[i + 1];

      if (char === '(' || char === '[') {
        depth += char === '(' ? 1 : 1;
        bracketDepth += char === '[' ? 1 : 0;
      } else if (char === ')' || char === ']') {
        depth -= char === ')' ? 1 : 1;
        bracketDepth -= char === ']' ? 1 : 0;
      } else if (
        depth === 0 &&
        bracketDepth === 0 &&
        char === operator[0] &&
        expr.substring(i, i + operator.length) === operator
      ) {
        parts.push(current.trim());
        current = '';
        i += operator.length - 1;
        continue;
      }

      current += char;
    }

    if (current) {
      parts.push(current.trim());
    }

    return parts;
  }

  /**
   * Evaluate a comparison expression
   */
  _evaluateComparison(expr, operator) {
    const parts = expr.split(operator).map(p => p.trim());
    if (parts.length !== 2) {
      throw new Error(`Invalid comparison expression: ${expr}`);
    }

    const [left, right] = parts;
    const leftVal = this._resolveValue(left);
    const rightVal = this._resolveValue(right);

    switch (operator) {
      case '==':
        return leftVal == rightVal;
      case '!=':
        return leftVal != rightVal;
      case '<':
        return leftVal < rightVal;
      case '>':
        return leftVal > rightVal;
      case '<=':
        return leftVal <= rightVal;
      case '>=':
        return leftVal >= rightVal;
      default:
        throw new Error(`Unknown comparison operator: ${operator}`);
    }
  }

  /**
   * Evaluate property access (.length, .count, .includes())
   */
  _evaluateProperty(expr) {
    // Handle method calls: foo.includes('bar')
    if (expr.includes('(')) {
      const methodMatch = expr.match(/^(.+?)\.(\w+)\((.*)\)$/);
      if (!methodMatch) {
        throw new Error(`Invalid method call: ${expr}`);
      }

      const [, objExpr, method, argsStr] = methodMatch;
      const obj = this._resolveValue(objExpr);

      if (method === 'includes') {
        const argExpr = argsStr.trim().replace(/^['"]|['"]$/g, '');
        const arg = this._resolveValue(argExpr);
        if (typeof obj?.includes === 'function') {
          return obj.includes(arg);
        }
        throw new Error(`${objExpr} does not have includes method`);
      }

      throw new Error(`Unknown method: ${method}`);
    }

    // Handle property access: foo.length, foo.count
    const parts = expr.split('.');
    let value = this._resolveValue(parts[0]);

    for (let i = 1; i < parts.length; i++) {
      const prop = parts[i];

      if (prop === 'length' || prop === 'count') {
        value = value?.[prop] || value?.length || 0;
      } else {
        value = value?.[prop];
      }
    }

    return value ? true : false;
  }

  /**
   * Resolve a value (variable or literal)
   */
  _resolveValue(expr) {
    expr = expr.trim();

    if (expr.startsWith('${') && expr.endsWith('}')) {
      return this._resolveValue(expr.slice(2, -1));
    }

    // Handle quoted strings
    if ((expr.startsWith('"') && expr.endsWith('"')) ||
        (expr.startsWith("'") && expr.endsWith("'"))) {
      return expr.slice(1, -1);
    }

    // Handle numbers
    if (/^-?\d+(\.\d+)?$/.test(expr)) {
      return parseFloat(expr);
    }

    // Handle literals
    if (expr === 'true') return true;
    if (expr === 'false') return false;
    if (expr === 'null' || expr === 'undefined') return null;

    // Handle variables with dot notation
    const parts = expr.split('.');
    let value = this.context[parts[0]];

    if (value === undefined) {
      throw new Error(`Variable not found: ${parts[0]}`);
    }

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];

      // Handle array access: items[0]
      const match = part.match(/^(\w+)(?:\[(\d+)\])?$/);
      if (match) {
        value = value?.[match[1]];
        if (match[2] !== undefined) {
          value = value?.[parseInt(match[2], 10)];
        }
      } else {
        value = value?.[part];
      }
    }

    return value;
  }
}

module.exports = ConditionEvaluator;
