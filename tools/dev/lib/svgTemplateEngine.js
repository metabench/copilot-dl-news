/**
 * @fileoverview SVG Template Engine
 * 
 * Loads, validates, and instantiates SVG templates from the template catalog.
 * Templates are parametric SVG snippets that can be stamped multiple times
 * with different configurations.
 * 
 * @example
 * const engine = new SvgTemplateEngine();
 * const svg = engine.stamp('badge', { text: 'Status', x: 100, y: 50 });
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// Template Engine
// ─────────────────────────────────────────────────────────────────────────────

class SvgTemplateEngine {
  /**
   * Create a template engine
   * @param {Object} options - Engine options
   * @param {string} [options.templateDir] - Directory containing template files
   * @param {Object} [options.customTemplates] - Additional templates to register
   */
  constructor(options = {}) {
    this.templateDir = options.templateDir || path.join(__dirname, '..', 'svg-templates');
    this.templates = new Map();
    this.loaded = false;
    
    // Register any custom templates
    if (options.customTemplates) {
      for (const [name, template] of Object.entries(options.customTemplates)) {
        this.register(name, template);
      }
    }
  }
  
  /**
   * Load all templates from the template directory
   * @returns {SvgTemplateEngine} this for chaining
   */
  loadAll() {
    if (this.loaded) return this;
    
    try {
      const files = fs.readdirSync(this.templateDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const name = path.basename(file, '.json');
          const filePath = path.join(this.templateDir, file);
          const content = fs.readFileSync(filePath, 'utf8');
          const template = JSON.parse(content);
          this.templates.set(name, template);
        }
      }
      this.loaded = true;
    } catch (e) {
      console.warn(`Failed to load templates from ${this.templateDir}:`, e.message);
    }
    
    return this;
  }
  
  /**
   * Load a specific template by name
   * @param {string} name - Template name
   * @returns {Object|null} Template definition or null
   */
  load(name) {
    if (this.templates.has(name)) {
      return this.templates.get(name);
    }
    
    const filePath = path.join(this.templateDir, `${name}.json`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const template = JSON.parse(content);
      this.templates.set(name, template);
      return template;
    }
    
    return null;
  }
  
  /**
   * Register a custom template
   * @param {string} name - Template name
   * @param {Object} template - Template definition
   */
  register(name, template) {
    // Validate template structure
    this.validateTemplateDefinition(template);
    this.templates.set(name, template);
  }
  
  /**
   * List all available templates
   * @returns {Array<{name: string, description: string, category: string}>}
   */
  list() {
    this.loadAll();
    return Array.from(this.templates.entries()).map(([name, template]) => ({
      name,
      description: template.description || '',
      category: template.category || 'other',
      version: template.version || '1.0.0',
      parameters: Object.keys(template.parameters || {})
    }));
  }
  
  /**
   * Get template details
   * @param {string} name - Template name
   * @returns {Object|null} Template definition with metadata
   */
  get(name) {
    return this.load(name);
  }
  
  /**
   * Stamp a template with parameters
   * @param {string} name - Template name
   * @param {Object} params - Parameter values
   * @returns {string} Expanded SVG markup
   */
  stamp(name, params) {
    const template = this.load(name);
    if (!template) {
      throw new Error(`Template not found: ${name}`);
    }
    
    // Merge defaults
    const mergedParams = { ...this.getDefaults(template), ...params };
    
    // Validate
    this.validateParams(template, mergedParams);
    
    // Compute derived values
    const computed = this.computeDerived(template, mergedParams);
    const context = { ...mergedParams, computed };
    
    // Handle shape variants
    let svgTemplate = template.svg;
    if (template.shapes && params.shape && template.shapes[params.shape]) {
      // Replace shape placeholder
      svgTemplate = svgTemplate.replace(/\$\{shapes\[shape\]\}/g, template.shapes[params.shape]);
    }
    
    // Interpolate
    return this.interpolate(svgTemplate, context);
  }
  
  /**
   * Stamp multiple instances of a template
   * @param {string} name - Template name
   * @param {Array<Object>} instances - Array of parameter objects
   * @param {Object} [defaults] - Default parameters for all instances
   * @returns {Array<string>} Array of expanded SVG markup
   */
  stampMany(name, instances, defaults = {}) {
    return instances.map(params => this.stamp(name, { ...defaults, ...params }));
  }
  
  /**
   * Get default values from template
   * @param {Object} template - Template definition
   * @returns {Object} Default parameter values
   */
  getDefaults(template) {
    const defaults = {};
    for (const [name, spec] of Object.entries(template.parameters || {})) {
      if ('default' in spec) {
        defaults[name] = spec.default;
      }
    }
    return defaults;
  }
  
  /**
   * Compute derived values
   * @param {Object} template - Template definition
   * @param {Object} params - Parameter values
   * @returns {Object} Computed values
   */
  computeDerived(template, params) {
    const computed = {};
    if (template.computed) {
      for (const [name, expr] of Object.entries(template.computed)) {
        computed[name] = this.evaluate(expr, { ...params, computed });
      }
    }
    return computed;
  }
  
  /**
   * Validate parameters against template schema
   * @param {Object} template - Template definition
   * @param {Object} params - Parameter values
   * @throws {Error} If validation fails
   */
  validateParams(template, params) {
    const errors = [];
    
    for (const [name, spec] of Object.entries(template.parameters || {})) {
      // Check required
      if (spec.required && !(name in params)) {
        errors.push(`Missing required parameter: ${name}`);
        continue;
      }
      
      if (!(name in params)) continue;
      
      const value = params[name];
      
      // Type validation
      switch (spec.type) {
        case 'number':
          if (typeof value !== 'number' || isNaN(value)) {
            errors.push(`${name}: expected number, got ${typeof value}`);
          } else {
            if (spec.min != null && value < spec.min) {
              errors.push(`${name}: must be >= ${spec.min}`);
            }
            if (spec.max != null && value > spec.max) {
              errors.push(`${name}: must be <= ${spec.max}`);
            }
          }
          break;
          
        case 'string':
          if (typeof value !== 'string') {
            errors.push(`${name}: expected string, got ${typeof value}`);
          }
          break;
          
        case 'color':
          if (typeof value !== 'string' || !this.isValidColor(value)) {
            errors.push(`${name}: invalid color format`);
          }
          break;
          
        case 'array':
          if (!Array.isArray(value)) {
            errors.push(`${name}: expected array, got ${typeof value}`);
          }
          break;
          
        case 'boolean':
          if (typeof value !== 'boolean') {
            errors.push(`${name}: expected boolean, got ${typeof value}`);
          }
          break;
      }
      
      // Enum validation
      if (spec.enum && !spec.enum.includes(value)) {
        errors.push(`${name}: must be one of [${spec.enum.join(', ')}]`);
      }
    }
    
    if (errors.length > 0) {
      throw new Error(`Template '${template.name}' validation failed:\n  - ${errors.join('\n  - ')}`);
    }
  }
  
  /**
   * Validate template definition structure
   * @param {Object} template - Template definition
   * @throws {Error} If template structure is invalid
   */
  validateTemplateDefinition(template) {
    const errors = [];
    
    if (!template.name) {
      errors.push('Template must have a name');
    }
    
    if (!template.svg) {
      errors.push('Template must have an svg property');
    }
    
    if (template.parameters) {
      for (const [name, spec] of Object.entries(template.parameters)) {
        if (!spec.type) {
          errors.push(`Parameter ${name} must have a type`);
        }
      }
    }
    
    if (errors.length > 0) {
      throw new Error(`Invalid template definition:\n  - ${errors.join('\n  - ')}`);
    }
  }
  
  /**
   * Interpolate template string with context
   * @param {string} templateStr - Template string with ${...} placeholders
   * @param {Object} context - Context object
   * @returns {string} Interpolated string
   */
  interpolate(templateStr, context) {
    let result = templateStr.replace(/\$\{([^}]+)\}/g, (match, expr) => {
      try {
        const value = this.evaluate(expr, context);
        // Return empty string for null/undefined, otherwise the value
        return value != null ? value : '';
      } catch (e) {
        // If variable is undefined, return empty string for optional attrs
        if (e.message.includes('is not defined')) {
          // Simple variable name or just white space = optional parameter
          if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(expr.trim())) {
            return '';
          }
        }
        console.warn(`Expression failed: ${expr}`, e.message);
        return match;
      }
    });
    
    // Clean up empty attributes (id="", class="", etc.)
    result = result.replace(/\s+(id|class)=""\s*/g, ' ');
    result = result.replace(/\s+/g, ' '); // collapse multiple spaces
    
    return result;
  }
  
  /**
   * Safely evaluate an expression
   * @param {string} expr - Expression to evaluate
   * @param {Object} context - Evaluation context
   * @returns {*} Evaluation result
   */
  evaluate(expr, context) {
    // Handle reserved words by prefixing them
    const reservedWords = ['class', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'delete', 'typeof', 'void', 'this', 'with', 'default', 'throw', 'try', 'catch', 'finally', 'debugger', 'var', 'let', 'const', 'import', 'export', 'extends', 'super', 'static', 'yield', 'await', 'enum', 'implements', 'interface', 'package', 'private', 'protected', 'public'];
    
    // Create safe context with renamed reserved words
    const safeContext = {};
    const keyMap = {};
    
    for (const [key, value] of Object.entries(context)) {
      if (reservedWords.includes(key)) {
        const safeKey = `_${key}_`;
        safeContext[safeKey] = value;
        keyMap[key] = safeKey;
      } else {
        safeContext[key] = value;
      }
    }
    
    // Replace reserved words in expression
    let safeExpr = expr;
    for (const [orig, safe] of Object.entries(keyMap)) {
      // Replace word boundaries only
      safeExpr = safeExpr.replace(new RegExp(`\\b${orig}\\b`, 'g'), safe);
    }
    
    const fn = new Function(...Object.keys(safeContext), `return (${safeExpr});`);
    return fn(...Object.values(safeContext));
  }
  
  /**
   * Check if a value is a valid CSS color
   * @param {string} value - Value to check
   * @returns {boolean} True if valid color
   */
  isValidColor(value) {
    // Hex colors
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)) {
      return true;
    }
    
    // RGB/RGBA
    if (/^rgba?\s*\(/.test(value)) {
      return true;
    }
    
    // HSL/HSLA
    if (/^hsla?\s*\(/.test(value)) {
      return true;
    }
    
    // Named colors (basic check)
    const namedColors = [
      'black', 'white', 'red', 'green', 'blue', 'yellow', 'cyan', 'magenta',
      'gray', 'grey', 'orange', 'purple', 'pink', 'brown', 'transparent', 'none',
      'currentColor', 'inherit'
    ];
    if (namedColors.includes(value.toLowerCase())) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Get connection points for a stamped template instance
   * @param {string} name - Template name
   * @param {Object} params - Instance parameters
   * @returns {Object} Connection points with absolute positions
   */
  getConnectionPoints(name, params) {
    const template = this.load(name);
    if (!template || !template.connectionPoints) {
      return {};
    }
    
    const mergedParams = { ...this.getDefaults(template), ...params };
    const computed = this.computeDerived(template, mergedParams);
    const context = { ...mergedParams, computed };
    
    const points = {};
    for (const [pointName, spec] of Object.entries(template.connectionPoints)) {
      points[pointName] = {
        x: mergedParams.x + this.evaluate(spec.x, context),
        y: mergedParams.y + this.evaluate(spec.y, context)
      };
    }
    
    return points;
  }
  
  /**
   * Calculate bounds for a template instance
   * @param {string} name - Template name
   * @param {Object} params - Instance parameters
   * @returns {Object} Bounding box {x, y, width, height}
   */
  calculateBounds(name, params) {
    const template = this.load(name);
    if (!template) {
      throw new Error(`Template not found: ${name}`);
    }
    
    const mergedParams = { ...this.getDefaults(template), ...params };
    const computed = this.computeDerived(template, mergedParams);
    const context = { ...mergedParams, computed };
    
    let width, height;
    
    if (template.bounds) {
      // Handle both raw expressions and ${...} wrapped expressions
      const widthExpr = this.unwrapExpr(template.bounds.width);
      const heightExpr = this.unwrapExpr(template.bounds.height);
      width = this.evaluate(widthExpr, context);
      height = this.evaluate(heightExpr, context);
    } else {
      // Fallback to parameter-based estimation
      width = mergedParams.width || mergedParams.radius * 2 || 100;
      height = mergedParams.height || mergedParams.radius * 2 || 50;
    }
    
    // Apply anchor offset
    const anchor = template.anchor || { x: 'left', y: 'top' };
    let x = mergedParams.x || 0;
    let y = mergedParams.y || 0;
    
    if (anchor.x === 'center') x -= width / 2;
    else if (anchor.x === 'right') x -= width;
    
    if (anchor.y === 'center') y -= height / 2;
    else if (anchor.y === 'bottom') y -= height;
    
    return { x, y, width, height };
  }
  
  /**
   * Unwrap ${...} expression syntax if present
   * @param {string} expr - Expression possibly wrapped in ${...}
   * @returns {string} Raw expression
   */
  unwrapExpr(expr) {
    if (typeof expr !== 'string') return String(expr);
    const match = expr.match(/^\$\{(.+)\}$/);
    return match ? match[1] : expr;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton & Factory
// ─────────────────────────────────────────────────────────────────────────────

let defaultEngine = null;

/**
 * Get the default template engine (singleton)
 * @returns {SvgTemplateEngine}
 */
function getDefaultEngine() {
  if (!defaultEngine) {
    defaultEngine = new SvgTemplateEngine();
    defaultEngine.loadAll();
  }
  return defaultEngine;
}

/**
 * Create a new template engine
 * @param {Object} options - Engine options
 * @returns {SvgTemplateEngine}
 */
function createEngine(options) {
  return new SvgTemplateEngine(options);
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  SvgTemplateEngine,
  getDefaultEngine,
  createEngine
};
