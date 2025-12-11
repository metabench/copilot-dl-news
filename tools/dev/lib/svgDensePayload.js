/**
 * @fileoverview Dense SVG Payload Parser & Expander
 * 
 * Converts compact JSON payloads into full SVG markup, enabling high-bandwidth
 * creation and modification with minimal token usage.
 * 
 * @example Compact format
 * ```json
 * { "t": "rect", "x": 10, "y": 20, "w": 100, "h": 50, "fill": "#abc" }
 * ```
 * 
 * @example Expands to
 * ```xml
 * <rect x="10" y="20" width="100" height="50" fill="#aabbcc"/>
 * ```
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Attribute Shorthand Mappings
// ─────────────────────────────────────────────────────────────────────────────

const ATTR_SHORTHANDS = {
  // Dimensions
  w: 'width',
  h: 'height',
  r: 'r',
  rx: 'rx',
  ry: 'ry',
  
  // Positions
  x: 'x',
  y: 'y',
  cx: 'cx',
  cy: 'cy',
  x1: 'x1',
  y1: 'y1',
  x2: 'x2',
  y2: 'y2',
  
  // Path
  d: 'd',
  pts: 'points',
  
  // Style
  fill: 'fill',
  stroke: 'stroke',
  sw: 'stroke-width',
  so: 'stroke-opacity',
  fo: 'fill-opacity',
  op: 'opacity',
  
  // Text
  anchor: 'text-anchor',
  baseline: 'dominant-baseline',
  fs: 'font-size',
  ff: 'font-family',
  fw: 'font-weight',
  
  // Transform
  tf: 'transform',
  
  // Identity
  id: 'id',
  cls: 'class',
  
  // Markers
  ms: 'marker-start',
  me: 'marker-end',
  mm: 'marker-mid'
};

const TAG_SHORTHANDS = {
  r: 'rect',
  c: 'circle',
  e: 'ellipse',
  l: 'line',
  p: 'path',
  pg: 'polygon',
  pl: 'polyline',
  t: 'text',
  g: 'g',
  u: 'use',
  i: 'image',
  ts: 'tspan',
  df: 'defs',
  sy: 'symbol',
  mk: 'marker',
  cp: 'clipPath',
  m: 'mask',
  lg: 'linearGradient',
  rg: 'radialGradient',
  st: 'stop',
  fe: 'filter'
};

// ─────────────────────────────────────────────────────────────────────────────
// Color Normalization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Expand 3-char hex to 6-char hex
 * @param {string} color - Color value
 * @returns {string} Normalized color
 */
function normalizeColor(color) {
  if (typeof color !== 'string') return color;
  
  // Expand #abc to #aabbcc
  const shortHex = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/;
  const match = color.match(shortHex);
  if (match) {
    return `#${match[1]}${match[1]}${match[2]}${match[2]}${match[3]}${match[3]}`;
  }
  
  return color;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transform Expansion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Expand compact transform array to SVG transform string
 * @param {Array|string} transform - Transform specification
 * @returns {string} SVG transform attribute value
 * 
 * @example
 * expandTransform([["translate", 10, 20], ["rotate", 45]])
 * // => "translate(10,20) rotate(45)"
 */
function expandTransform(transform) {
  if (typeof transform === 'string') return transform;
  if (!Array.isArray(transform)) return '';
  
  // Check if it's a single transform or array of transforms
  if (typeof transform[0] === 'string') {
    // Single transform: ["translate", 10, 20]
    const [type, ...args] = transform;
    return `${type}(${args.join(',')})`;
  }
  
  // Multiple transforms: [["translate", 10, 20], ["rotate", 45]]
  return transform.map(t => {
    const [type, ...args] = t;
    return `${type}(${args.join(',')})`;
  }).join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Element Expansion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Expand a compact element specification to SVG markup
 * @param {Object} compact - Compact element specification
 * @param {Object} [options] - Expansion options
 * @returns {string} SVG element markup
 */
function expandElement(compact, options = {}) {
  const { templates = {}, indent = 0 } = options;
  const prefix = '  '.repeat(indent);
  
  // Get tag name
  let tag = compact.t || compact.tag;
  if (!tag) {
    throw new Error('Element missing tag (t or tag property)');
  }
  
  // Check for template reference
  if (tag.startsWith('@')) {
    const templateName = tag.slice(1);
    return expandTemplate(templateName, compact, options);
  }
  
  // Expand tag shorthand
  tag = TAG_SHORTHANDS[tag] || tag;
  
  // Build attributes
  const attrs = [];
  const children = [];
  let textContent = null;
  
  for (const [key, value] of Object.entries(compact)) {
    if (key === 't' || key === 'tag') continue;
    if (key === 'children') {
      children.push(...value);
      continue;
    }
    if (key === 'text' || key === 'content') {
      textContent = value;
      continue;
    }
    
    // Expand attribute shorthand
    const attrName = ATTR_SHORTHANDS[key] || key;
    let attrValue = value;
    
    // Special handling for transform
    if (key === 'tf' || key === 'transform') {
      attrValue = expandTransform(value);
    }
    
    // Normalize colors
    if (['fill', 'stroke'].includes(attrName)) {
      attrValue = normalizeColor(attrValue);
    }
    
    // Skip null/undefined
    if (attrValue == null) continue;
    
    attrs.push(`${attrName}="${escapeAttr(attrValue)}"`);
  }
  
  const attrStr = attrs.length ? ' ' + attrs.join(' ') : '';
  
  // Handle children
  if (children.length > 0) {
    const childMarkup = children
      .map(child => expandElement(child, { ...options, indent: indent + 1 }))
      .join('\n');
    return `${prefix}<${tag}${attrStr}>\n${childMarkup}\n${prefix}</${tag}>`;
  }
  
  // Handle text content
  if (textContent != null) {
    return `${prefix}<${tag}${attrStr}>${escapeText(textContent)}</${tag}>`;
  }
  
  // Self-closing
  return `${prefix}<${tag}${attrStr}/>`;
}

/**
 * Escape attribute value for XML
 */
function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Escape text content for XML
 */
function escapeText(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─────────────────────────────────────────────────────────────────────────────
// Template Expansion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Expand a template reference with parameters
 * @param {string} templateName - Template name
 * @param {Object} params - Parameter values
 * @param {Object} options - Expansion options
 * @returns {string} Expanded SVG markup
 */
function expandTemplate(templateName, params, options = {}) {
  const { templates = {}, templateLoader } = options;
  
  // Get template definition
  let template = templates[templateName];
  if (!template && templateLoader) {
    template = templateLoader(templateName);
  }
  if (!template) {
    throw new Error(`Template not found: ${templateName}`);
  }
  
  // Merge defaults with provided params
  const mergedParams = { ...getTemplateDefaults(template), ...params };
  
  // Validate required parameters
  validateTemplateParams(template, mergedParams);
  
  // Expand template SVG with parameters
  return interpolateTemplate(template.svg, mergedParams, template);
}

/**
 * Get default values from template parameters
 */
function getTemplateDefaults(template) {
  const defaults = {};
  for (const [name, spec] of Object.entries(template.parameters || {})) {
    if ('default' in spec) {
      defaults[name] = spec.default;
    }
  }
  return defaults;
}

/**
 * Validate required parameters are present
 */
function validateTemplateParams(template, params) {
  const errors = [];
  
  for (const [name, spec] of Object.entries(template.parameters || {})) {
    if (spec.required && !(name in params)) {
      errors.push(`Missing required parameter: ${name}`);
    }
    
    if (name in params) {
      const value = params[name];
      
      // Type validation
      if (spec.type === 'number' && typeof value !== 'number') {
        errors.push(`Parameter ${name} must be a number, got ${typeof value}`);
      }
      
      // Range validation
      if (spec.type === 'number') {
        if (spec.min != null && value < spec.min) {
          errors.push(`Parameter ${name} must be >= ${spec.min}, got ${value}`);
        }
        if (spec.max != null && value > spec.max) {
          errors.push(`Parameter ${name} must be <= ${spec.max}, got ${value}`);
        }
      }
      
      // Enum validation
      if (spec.enum && !spec.enum.includes(value)) {
        errors.push(`Parameter ${name} must be one of: ${spec.enum.join(', ')}`);
      }
    }
  }
  
  if (errors.length > 0) {
    throw new Error(`Template validation failed:\n  ${errors.join('\n  ')}`);
  }
}

/**
 * Interpolate template string with parameters
 * Supports ${expr} syntax with simple expressions
 */
function interpolateTemplate(templateStr, params, templateDef = {}) {
  // First pass: compute any computed values
  const computed = {};
  if (templateDef.computed) {
    for (const [name, expr] of Object.entries(templateDef.computed)) {
      computed[name] = evaluateExpression(expr, { ...params, computed });
    }
  }
  
  // Merge computed into context
  const context = { ...params, computed };
  
  // Replace ${...} expressions
  return templateStr.replace(/\$\{([^}]+)\}/g, (match, expr) => {
    try {
      return evaluateExpression(expr, context);
    } catch (e) {
      console.warn(`Expression evaluation failed: ${expr}`, e.message);
      return match; // Leave unmodified on error
    }
  });
}

/**
 * Safely evaluate a simple expression
 * Supports: arithmetic, property access, ternary, array methods
 */
function evaluateExpression(expr, context) {
  // Create a safe evaluation context
  const safeContext = { ...context };
  
  // Build a function that evaluates the expression
  // This is safer than raw eval() because we control the context
  const fn = new Function(...Object.keys(safeContext), `return (${expr});`);
  
  try {
    return fn(...Object.values(safeContext));
  } catch (e) {
    throw new Error(`Failed to evaluate: ${expr} - ${e.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch Operations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process a batch of operations
 * @param {Array} operations - Array of operation specifications
 * @param {Object} options - Processing options
 * @returns {Object} Processing results
 */
function processBatch(operations, options = {}) {
  const results = [];
  const errors = [];
  
  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    try {
      const result = processOperation(op, options);
      results.push({ index: i, success: true, result });
    } catch (e) {
      errors.push({ index: i, operation: op.op, error: e.message });
      if (options.atomic) {
        return { success: false, errors, message: 'Atomic batch aborted on first error' };
      }
    }
  }
  
  return {
    success: errors.length === 0,
    results,
    errors,
    summary: {
      total: operations.length,
      succeeded: results.length,
      failed: errors.length
    }
  };
}

/**
 * Process a single operation
 */
function processOperation(op, options) {
  switch (op.op) {
    case 'insert':
      return processInsert(op, options);
    case 'stamp':
      return processStamp(op, options);
    case 'set':
      return processSet(op, options);
    case 'move':
      return processMove(op, options);
    case 'delete':
      return processDelete(op, options);
    default:
      throw new Error(`Unknown operation: ${op.op}`);
  }
}

function processInsert(op, options) {
  const elements = (op.elements || []).map(el => expandElement(el, options));
  return { type: 'insert', parent: op.parent, elements, count: elements.length };
}

function processStamp(op, options) {
  const instances = op.instances || [];
  const elements = instances.map(params => 
    expandTemplate(op.template, params, options)
  );
  return { type: 'stamp', template: op.template, parent: op.parent, elements, count: elements.length };
}

function processSet(op, options) {
  return { type: 'set', selector: op.selector, attrs: op.attrs };
}

function processMove(op, options) {
  return { type: 'move', selector: op.selector, by: op.by, to: op.to };
}

function processDelete(op, options) {
  return { type: 'delete', selector: op.selector };
}

// ─────────────────────────────────────────────────────────────────────────────
// Grid Instance Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate grid-based instances from a grid specification
 * @param {Object} gridSpec - Grid specification
 * @param {Object} defaults - Default parameter values
 * @returns {Array} Array of instance parameter objects
 */
function generateGridInstances(gridSpec, defaults = {}) {
  const {
    startX = 0,
    startY = 0,
    cols = 1,
    rows = 1,
    spacingX = 50,
    spacingY = 50,
    labelPattern = 'item-${row}-${col}'
  } = gridSpec;
  
  const instances = [];
  
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = startX + col * spacingX;
      const y = startY + row * spacingY;
      
      // Generate label from pattern
      const label = labelPattern
        .replace(/\$\{row\}/g, row)
        .replace(/\$\{col\}/g, col)
        .replace(/\$\{index\}/g, row * cols + col);
      
      instances.push({
        ...defaults,
        x,
        y,
        label,
        row,
        col,
        index: row * cols + col
      });
    }
  }
  
  return instances;
}

/**
 * Process an instance file that may contain grid specifications
 * @param {Object} instanceSpec - Instance file content
 * @returns {Array} Array of all instances (explicit + generated)
 */
function processInstanceSpec(instanceSpec) {
  const defaults = instanceSpec.defaults || {};
  const instances = [];
  
  // Add explicit instances
  if (instanceSpec.instances) {
    for (const inst of instanceSpec.instances) {
      instances.push({ ...defaults, ...inst });
    }
  }
  
  // Add grid-generated instances
  if (instanceSpec.grid && instanceSpec.grid.enabled !== false) {
    const gridInstances = generateGridInstances(instanceSpec.grid, defaults);
    instances.push(...gridInstances);
  }
  
  return instances;
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  // Expansion
  expandElement,
  expandTemplate,
  expandTransform,
  interpolateTemplate,
  
  // Batch processing
  processBatch,
  processOperation,
  
  // Instance generation
  generateGridInstances,
  processInstanceSpec,
  
  // Utilities
  normalizeColor,
  escapeAttr,
  escapeText,
  getTemplateDefaults,
  validateTemplateParams,
  
  // Constants
  ATTR_SHORTHANDS,
  TAG_SHORTHANDS
};
