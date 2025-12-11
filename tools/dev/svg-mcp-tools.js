/**
 * @fileoverview SVG MCP Tools
 * 
 * Model Context Protocol tools for high-bandwidth SVG generation and editing.
 * Agents call these directly — no CLI wrapper needed.
 * 
 * Tools:
 * - svg_stamp: Create elements from templates (single or batch)
 * - svg_batch: Apply multiple operations atomically
 * - svg_edit: Guarded element mutations
 * - svg_query: Find elements, get positions, check collisions
 * - svg_create: Generate new SVG from plan
 * - svg_fix_collisions: Auto-repair overlapping elements
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { SvgTemplateEngine } = require('./lib/svgTemplateEngine');
const { processBatch, expandElement, processInstanceSpec } = require('./lib/svgDensePayload');
const { computeElementHash, createGuardPlan, validatePlan, checkSyntax, generatePathSignature } = require('./lib/svgGuardSystem');

// Theme registry (shared across SVG + HTML + jsgui3)
const THEME_DIR = path.join(__dirname, 'svg-templates', 'themes');
const DEFAULT_SVG_THEME = {
  background: {
    primary: '#0a0d14',
    secondary: '#050508',
    tertiary: '#141824'
  },
  surface: {
    card: '#1a1f2e',
    cardHover: '#252b3d',
    cardBorder: 'rgba(255,255,255,0.06)'
  },
  accent: {
    gold: '#c9a227',
    goldBright: '#ffd700',
    goldDark: '#8b7500'
  },
  status: {
    active: '#10b981',
    planned: '#3b82f6',
    research: '#8b5cf6',
    complete: '#22c55e',
    error: '#e31837',
    warning: '#ff9f00'
  },
  text: {
    primary: '#f0f4f8',
    secondary: '#94a3b8',
    tertiary: '#64748b',
    muted: '#475569'
  },
  connector: {
    default: '#64748b',
    highlight: '#c9a227',
    success: '#10b981',
    error: '#e31837'
  }
};

const DEFAULT_THEME_CONFIG = {
  name: 'obsidian',
  displayName: 'Obsidian Luxe',
  description: 'Fallback dark luxury palette for SVG/HTML/jsgui3',
  colors: {},
  typography: {},
  spacing: {},
  radii: {},
  shadows: {},
  transitions: {},
  svg: DEFAULT_SVG_THEME
};

function ensureThemeDir() {
  if (!fs.existsSync(THEME_DIR)) {
    fs.mkdirSync(THEME_DIR, { recursive: true });
  }
}

function listAvailableThemes() {
  ensureThemeDir();
  return fs.readdirSync(THEME_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => path.basename(file, '.json'));
}

function loadThemeDefinition(name) {
  ensureThemeDir();
  const normalized = (name || 'obsidian').toLowerCase();
  const themeFiles = fs.readdirSync(THEME_DIR).filter((file) => file.endsWith('.json'));

  // Direct match first
  let themePath = themeFiles.find((file) => path.basename(file, '.json') === normalized);

  // Alias match if needed
  if (!themePath) {
    for (const file of themeFiles) {
      const candidatePath = path.join(THEME_DIR, file);
      try {
        const content = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
        const aliases = Array.isArray(content.aliases) ? content.aliases.map((a) => String(a).toLowerCase()) : [];
        if (aliases.includes(normalized)) {
          themePath = file;
          break;
        }
      } catch (err) {
        // Ignore malformed files; fallback will handle
      }
    }
  }

  if (themePath) {
    try {
      const absolutePath = path.join(THEME_DIR, themePath);
      const data = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
      return { name: data.name || normalized, path: absolutePath, data };
    } catch (err) {
      // Continue to fallback
    }
  }

  return { name: normalized, path: null, data: { ...DEFAULT_THEME_CONFIG }, fallback: true };
}

function mergeSvgPalette(themeData = {}) {
  const palette = JSON.parse(JSON.stringify(DEFAULT_SVG_THEME));
  const svgSection = themeData.svg || {};
  ['background', 'surface', 'accent', 'status', 'text', 'connector'].forEach((section) => {
    if (svgSection[section] && typeof svgSection[section] === 'object') {
      Object.assign(palette[section], svgSection[section]);
    }
  });

  const colors = themeData.colors || {};
  if (!palette.accent.gold && colors.accent) palette.accent.gold = colors.accent;
  if (!palette.text.primary && colors.text) palette.text.primary = colors.text;
  if (!palette.text.secondary && colors.textSecondary) palette.text.secondary = colors.textSecondary;

  return palette;
}

function buildCssVariables(config = {}) {
  const lines = [':root {'];

  if (config.colors) {
    Object.entries(config.colors).forEach(([key, value]) => {
      const cssKey = `--theme-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
      lines.push(`  ${cssKey}: ${value};`);
    });
  }

  if (config.typography) {
    Object.entries(config.typography).forEach(([key, value]) => {
      const cssKey = `--theme-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
      lines.push(`  ${cssKey}: ${value};`);
    });
  }

  if (config.spacing) {
    Object.entries(config.spacing).forEach(([key, value]) => {
      lines.push(`  --theme-space-${key}: ${value};`);
    });
  }

  if (config.radii) {
    Object.entries(config.radii).forEach(([key, value]) => {
      lines.push(`  --theme-radius-${key}: ${value};`);
    });
  }

  if (config.shadows) {
    Object.entries(config.shadows).forEach(([key, value]) => {
      lines.push(`  --theme-shadow-${key}: ${value};`);
    });
  }

  if (config.transitions) {
    Object.entries(config.transitions).forEach(([key, value]) => {
      lines.push(`  --theme-transition-${key}: ${value};`);
    });
  }

  lines.push('}');
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG DOM Helpers (JSDOM-based for basic parsing, Puppeteer for positions)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse an SVG file and return a JSDOM document
 * @param {string} filePath - Path to SVG file
 * @returns {{dom: JSDOM, document: Document, svg: SVGElement}}
 */
function parseSvgFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const dom = new JSDOM(content, { contentType: 'image/svg+xml' });
  const document = dom.window.document;
  const svg = document.querySelector('svg');
  return { dom, document, svg, content };
}

/**
 * Serialize DOM back to string
 * @param {JSDOM} dom - JSDOM instance
 * @returns {string}
 */
function serializeSvg(dom) {
  return dom.serialize();
}

/**
 * Build element metadata for guard system
 * @param {Element} element - DOM element
 * @param {Document} document - Owner document
 * @returns {Object}
 */
function buildElementMeta(element, document) {
  const id = element.getAttribute('id');
  const tagName = element.tagName.toLowerCase();
  const textContent = element.textContent?.trim().slice(0, 100) || null;
  
  // Build path
  const pathParts = [];
  let current = element;
  while (current && current.tagName) {
    let part = current.tagName.toLowerCase();
    if (current.id) {
      part += `#${current.id}`;
    }
    pathParts.unshift(part);
    current = current.parentElement;
  }
  const pathSignature = pathParts.join(' > ');
  
  // Get markup for hash
  const markup = element.outerHTML;
  const hash = computeElementHash(markup);
  
  // Get span (character offsets in serialized content)
  // Note: JSDOM doesn't provide byte offsets, so we use markup length
  const span = { start: 0, end: markup.length };
  
  return {
    id,
    tagName,
    textContent,
    pathSignature,
    hash,
    markup,
    span,
    selector: id ? `#${id}` : pathSignature
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Tool: svg_stamp
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stamp template instances into an SVG file
 * 
 * @typedef {Object} SvgStampParams
 * @property {string} file - SVG file path
 * @property {string} template - Template name (badge, node, legend, etc.)
 * @property {string} [parent] - Parent selector (default: "svg")
 * @property {Object|Object[]} instances - Single instance params or array of instances
 * @property {Object} [defaults] - Default params applied to all instances
 * @property {Object} [grid] - Grid specification for generating instances
 * @property {boolean} [dryRun] - Preview without modifying (default: true)
 * 
 * @example Single instance
 * {
 *   "file": "diagram.svg",
 *   "template": "badge",
 *   "instances": { "text": "Status", "x": 100, "y": 50 }
 * }
 * 
 * @example Batch instances
 * {
 *   "file": "diagram.svg",
 *   "template": "badge",
 *   "instances": [
 *     { "text": "Alpha", "x": 100, "y": 50 },
 *     { "text": "Beta", "x": 200, "y": 50 },
 *     { "text": "Gamma", "x": 300, "y": 50 }
 *   ]
 * }
 * 
 * @example Grid generation (creates 20 nodes in one call)
 * {
 *   "file": "diagram.svg",
 *   "template": "node",
 *   "defaults": { "shape": "rect", "fill": "#e8f4f8" },
 *   "grid": {
 *     "startX": 100, "startY": 100,
 *     "cols": 5, "rows": 4,
 *     "spacingX": 150, "spacingY": 80,
 *     "labelPattern": "Node-${row}-${col}"
 *   }
 * }
 */
async function svg_stamp(params) {
  const { file, template, parent = 'svg', instances, defaults = {}, grid, dryRun = true } = params;
  
  const engine = new SvgTemplateEngine();
  
  // Build instance list
  let instanceList = [];
  
  if (Array.isArray(instances)) {
    instanceList = instances.map(i => ({ ...defaults, ...i }));
  } else if (instances) {
    instanceList = [{ ...defaults, ...instances }];
  }
  
  // Add grid-generated instances
  if (grid) {
    const gridInstances = processInstanceSpec({ defaults, grid });
    instanceList.push(...gridInstances);
  }
  
  if (instanceList.length === 0) {
    return { success: false, error: 'No instances provided' };
  }
  
  // Stamp all instances
  const stamped = [];
  const errors = [];
  
  for (let i = 0; i < instanceList.length; i++) {
    try {
      const markup = engine.stamp(template, instanceList[i]);
      const bounds = engine.calculateBounds(template, instanceList[i]);
      stamped.push({
        index: i,
        params: instanceList[i],
        markup,
        bounds
      });
    } catch (e) {
      errors.push({ index: i, error: e.message });
    }
  }
  
  if (errors.length > 0 && stamped.length === 0) {
    return { success: false, errors };
  }
  
  // Read and modify file
  if (!dryRun && fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    
    // Find parent and insert
    const parentPattern = new RegExp(`(<${parent}[^>]*>)`, 'i');
    const insertMarkup = stamped.map(s => s.markup).join('\n');
    
    if (parent === 'svg') {
      // Insert before </svg>
      content = content.replace('</svg>', `${insertMarkup}\n</svg>`);
    } else {
      // Insert after parent opening tag
      content = content.replace(parentPattern, `$1\n${insertMarkup}`);
    }
    
    // Validate syntax
    const syntaxCheck = checkSyntax(content);
    if (!syntaxCheck.passed) {
      return { success: false, error: 'Invalid SVG after modification', details: syntaxCheck };
    }
    
    fs.writeFileSync(file, content, 'utf8');
  }
  
  return {
    success: true,
    dryRun,
    template,
    count: stamped.length,
    instances: stamped,
    errors: errors.length > 0 ? errors : undefined
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Tool: svg_batch
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply multiple SVG operations atomically
 * 
 * @typedef {Object} SvgBatchParams
 * @property {string} file - SVG file path
 * @property {Array<Object>} operations - Array of operations
 * @property {boolean} [atomic] - Rollback all on any failure (default: true)
 * @property {boolean} [dryRun] - Preview without modifying (default: true)
 * 
 * @example
 * {
 *   "file": "diagram.svg",
 *   "operations": [
 *     { "op": "stamp", "template": "badge", "instances": [...] },
 *     { "op": "set", "selector": ".marker", "attrs": { "r": "8" } },
 *     { "op": "move", "selector": "#label", "by": { "x": 10 } },
 *     { "op": "delete", "selector": ".temp" }
 *   ]
 * }
 */
async function svg_batch(params) {
  const { file, operations, atomic = true, dryRun = true } = params;
  
  // Parse the file once
  const { dom, document, svg, content: originalContent } = parseSvgFile(file);
  
  const results = [];
  const errors = [];
  const engine = new SvgTemplateEngine();
  
  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    
    try {
      let opResult;
      
      switch (op.op) {
        case 'stamp': {
          // Stamp template instances
          const instances = Array.isArray(op.instances) ? op.instances : [op.instances];
          const stamped = [];
          
          for (const inst of instances) {
            const markup = engine.stamp(op.template, inst);
            stamped.push(markup);
          }
          
          // Insert into SVG
          const parent = op.parent ? document.querySelector(op.parent) : svg;
          if (parent) {
            const fragment = new JSDOM(`<svg xmlns="http://www.w3.org/2000/svg">${stamped.join('\n')}</svg>`,
                                       { contentType: 'image/svg+xml' });
            const newElements = fragment.window.document.querySelector('svg').children;
            for (const el of Array.from(newElements)) {
              parent.appendChild(document.importNode(el, true));
            }
          }
          
          opResult = { op: 'stamp', count: stamped.length, template: op.template };
          break;
        }
        
        case 'set': {
          const element = document.querySelector(op.selector);
          if (!element) throw new Error(`Element not found: ${op.selector}`);
          
          for (const [key, value] of Object.entries(op.attrs || {})) {
            element.setAttribute(key, value);
          }
          opResult = { op: 'set', selector: op.selector, attrs: op.attrs };
          break;
        }
        
        case 'move': {
          const element = document.querySelector(op.selector);
          if (!element) throw new Error(`Element not found: ${op.selector}`);
          
          const currentX = parseFloat(element.getAttribute('x')) || 0;
          const currentY = parseFloat(element.getAttribute('y')) || 0;
          
          if (op.by) {
            element.setAttribute('x', currentX + (op.by.x || 0));
            element.setAttribute('y', currentY + (op.by.y || 0));
          } else if (op.to) {
            element.setAttribute('x', op.to.x);
            element.setAttribute('y', op.to.y);
          }
          
          opResult = { op: 'move', selector: op.selector };
          break;
        }
        
        case 'delete': {
          const element = document.querySelector(op.selector);
          if (!element) throw new Error(`Element not found: ${op.selector}`);
          element.remove();
          opResult = { op: 'delete', selector: op.selector };
          break;
        }
        
        case 'insert': {
          const parent = op.parent ? document.querySelector(op.parent) : svg;
          if (!parent) throw new Error(`Parent not found: ${op.parent}`);
          
          const elements = (op.elements || []).map(el => expandElement(el));
          const fragment = new JSDOM(`<svg xmlns="http://www.w3.org/2000/svg">${elements.join('\n')}</svg>`,
                                     { contentType: 'image/svg+xml' });
          const newElements = fragment.window.document.querySelector('svg').children;
          for (const el of Array.from(newElements)) {
            parent.appendChild(document.importNode(el, true));
          }
          
          opResult = { op: 'insert', count: elements.length };
          break;
        }
        
        default:
          throw new Error(`Unknown operation: ${op.op}`);
      }
      
      results.push({ index: i, success: true, ...opResult });
      
    } catch (e) {
      errors.push({ index: i, operation: op.op, error: e.message });
      
      if (atomic) {
        // Rollback: don't write anything
        return {
          success: false,
          error: 'ATOMIC_ROLLBACK',
          message: `Operation ${i} failed: ${e.message}`,
          results,
          errors
        };
      }
    }
  }
  
  // Validate final SVG
  const newContent = serializeSvg(dom);
  const syntaxCheck = checkSyntax(newContent);
  
  if (!syntaxCheck.passed) {
    return {
      success: false,
      error: 'INVALID_SVG',
      message: 'Batch would produce invalid SVG',
      details: syntaxCheck,
      results,
      errors
    };
  }
  
  // Write if not dry run
  if (!dryRun) {
    fs.writeFileSync(file, newContent, 'utf8');
  }
  
  return {
    success: errors.length === 0,
    dryRun,
    summary: {
      total: operations.length,
      succeeded: results.length,
      failed: errors.length
    },
    results,
    errors: errors.length > 0 ? errors : undefined
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Tool: svg_edit
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Guarded element mutation with hash verification
 * 
 * @typedef {Object} SvgEditParams
 * @property {string} file - SVG file path
 * @property {string} selector - Element selector
 * @property {string} action - Action: "set", "move", "delete", "replace"
 * @property {Object} [attrs] - Attributes to set (for "set" action)
 * @property {Object} [by] - Relative movement {x, y} (for "move" action)
 * @property {Object} [to] - Absolute position {x, y} (for "move" action)
 * @property {string} [content] - Replacement content (for "replace" action)
 * @property {string} [expectHash] - Guard: expected element hash
 * @property {boolean} [dryRun] - Preview without modifying (default: true)
 * 
 * @example Set attributes
 * {
 *   "file": "diagram.svg",
 *   "selector": "#my-label",
 *   "action": "set",
 *   "attrs": { "fill": "#ff0000", "font-size": "14" },
 *   "expectHash": "abc123..."
 * }
 * 
 * @example Move element
 * {
 *   "file": "diagram.svg",
 *   "selector": "#node-1",
 *   "action": "move",
 *   "by": { "x": 20, "y": 0 }
 * }
 */
async function svg_edit(params) {
  const { file, selector, action, attrs, by, to, content, expectHash, dryRun = true } = params;
  
  // Locate element and verify guard
  const located = await locateElement(file, selector);
  if (!located.found) {
    return {
      success: false,
      error: 'SELECTOR_NOT_FOUND',
      message: `Element not found: ${selector}`,
      suggestions: ['Use svg_query with action "index" to list elements']
    };
  }
  
  // Check hash guard
  if (expectHash && located.hash !== expectHash) {
    return {
      success: false,
      error: 'HASH_MISMATCH',
      message: `Element changed since locate`,
      expected: expectHash,
      actual: located.hash,
      suggestion: 'Re-run svg_query to get current hash'
    };
  }
  
  // Parse the file for modifications
  const { dom, document, svg, content: originalContent } = parseSvgFile(file);
  
  // Apply action
  let result;
  switch (action) {
    case 'set':
      result = applySetAttrs(located, attrs, dom);
      break;
    case 'move':
      result = applyMove(located, by, to, dom);
      break;
    case 'delete':
      result = applyDelete(located, dom);
      break;
    case 'replace':
      result = applyReplace(located, content, dom);
      break;
    default:
      return { success: false, error: `Unknown action: ${action}` };
  }
  
  if (!result.success) {
    return result;
  }
  
  // Serialize and validate
  const newContent = serializeSvg(dom);
  const syntaxCheck = checkSyntax(newContent);
  
  if (!syntaxCheck.passed) {
    return {
      success: false,
      error: 'INVALID_SVG',
      message: 'Edit would produce invalid SVG',
      details: syntaxCheck
    };
  }
  
  // Write if not dry run
  if (!dryRun) {
    fs.writeFileSync(file, newContent, 'utf8');
  }
  
  return {
    success: true,
    dryRun,
    action,
    selector,
    before: located,
    after: result.after || result,
    guardPlan: result.after ? createGuardPlan(result.after, { file }) : null
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Tool: svg_query
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Query SVG structure, positions, and collisions
 * 
 * @typedef {Object} SvgQueryParams
 * @property {string} file - SVG file path
 * @property {string} action - Query type: "index", "find", "positions", "collisions", "bounds"
 * @property {string} [selector] - Element selector (for "find", "positions")
 * @property {string} [severity] - Collision severity filter (for "collisions")
 * 
 * @example Index all elements
 * { "file": "diagram.svg", "action": "index" }
 * 
 * @example Find specific element
 * { "file": "diagram.svg", "action": "find", "selector": "#my-label" }
 * 
 * @example Get absolute positions
 * { "file": "diagram.svg", "action": "positions", "selector": "text" }
 * 
 * @example Detect collisions
 * { "file": "diagram.svg", "action": "collisions", "severity": "high" }
 */
async function svg_query(params) {
  const { file, action, selector, severity } = params;
  
  switch (action) {
    case 'index':
      return await queryIndex(file);
    case 'find':
      return await queryFind(file, selector);
    case 'positions':
      return await queryPositions(file, selector);
    case 'collisions':
      return await queryCollisions(file, severity);
    case 'bounds':
      return await queryBounds(file);
    default:
      return { success: false, error: `Unknown action: ${action}` };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Tool: svg_create
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate new SVG from a plan
 * 
 * @typedef {Object} SvgCreateParams
 * @property {string} output - Output file path
 * @property {Object} plan - SVG generation plan
 * 
 * @example
 * {
 *   "output": "diagram.svg",
 *   "plan": {
 *     "viewBox": { "width": 800, "height": 600 },
 *     "background": "#f8f9fa",
 *     "layers": [
 *       {
 *         "id": "nodes",
 *         "template": "node",
 *         "instances": [
 *           { "id": "a", "x": 100, "y": 300, "label": "Database" },
 *           { "id": "b", "x": 400, "y": 300, "label": "API" }
 *         ]
 *       },
 *       {
 *         "id": "labels",
 *         "elements": [
 *           { "t": "text", "x": 400, "y": 50, "text": "Architecture", "fs": 24, "anchor": "middle" }
 *         ]
 *       }
 *     ]
 *   }
 * }
 */
async function svg_create(params) {
  const { output, plan } = params;
  
  const { width, height } = plan.viewBox || { width: 800, height: 600 };
  const engine = new SvgTemplateEngine();
  
  const layers = [];
  
  for (const layer of (plan.layers || [])) {
    const layerContent = [];
    
    // Template-based layer
    if (layer.template && layer.instances) {
      for (const inst of layer.instances) {
        layerContent.push(engine.stamp(layer.template, inst));
      }
    }
    
    // Dense element layer
    if (layer.elements) {
      for (const el of layer.elements) {
        layerContent.push(expandElement(el));
      }
    }
    
    layers.push(`<g id="${layer.id || ''}">\n${layerContent.join('\n')}\n</g>`);
  }
  
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
${plan.background ? `<rect width="100%" height="100%" fill="${plan.background}"/>` : ''}
${layers.join('\n')}
</svg>`;
  
  fs.writeFileSync(output, svg, 'utf8');
  
  return {
    success: true,
    output,
    viewBox: { width, height },
    layerCount: layers.length
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Tool: svg_fix_collisions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Automatically fix overlapping elements
 * 
 * @typedef {Object} SvgFixCollisionsParams
 * @property {string} file - SVG file path
 * @property {string} [severity] - Minimum severity to fix: "high", "medium", "all"
 * @property {number} [padding] - Separation padding after fix (default: 5)
 * @property {number} [maxFixes] - Maximum fixes per call (default: 10)
 * @property {boolean} [dryRun] - Preview without modifying (default: true)
 * 
 * @example
 * {
 *   "file": "diagram.svg",
 *   "severity": "high",
 *   "padding": 8,
 *   "dryRun": false
 * }
 */
async function svg_fix_collisions(params) {
  const { file, severity = 'high', padding = 5, maxFixes = 10, dryRun = true } = params;
  
  // Detect collisions
  const collisions = await queryCollisions(file, severity);
  
  if (!collisions.collisions || collisions.collisions.length === 0) {
    return {
      success: true,
      message: 'No collisions to fix',
      summary: collisions.summary
    };
  }
  
  // Compute fixes
  const fixes = [];
  for (const collision of collisions.collisions.slice(0, maxFixes)) {
    if (collision.repair) {
      fixes.push({
        selector: collision.repair.target,
        action: 'move',
        by: collision.repair.vector
      });
    }
  }
  
  if (!dryRun) {
    // Apply fixes
    for (const fix of fixes) {
      await svg_edit({ file, ...fix, dryRun: false });
    }
  }
  
  return {
    success: true,
    dryRun,
    fixesApplied: fixes.length,
    fixes,
    before: collisions.summary
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Tool: svg_theme
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List or retrieve theme definitions for SVG/HTML/jsgui3 surfaces
 * @param {Object} params
 * @param {string} [params.action] - "list" or "get" (default: list)
 * @param {string} [params.name] - Theme name or alias when action=get
 * @param {boolean} [params.includeCss] - Include CSS custom properties output (default: true)
 */
async function svg_theme(params = {}) {
  const action = params.action || 'list';
  const includeCss = params.includeCss !== false;

  if (action === 'list') {
    return {
      success: true,
      themes: listAvailableThemes(),
      defaultTheme: DEFAULT_THEME_CONFIG.name
    };
  }

  if (action === 'get') {
    const { name, path: themePath, data, fallback } = loadThemeDefinition(params.name);
    const svgPalette = mergeSvgPalette(data);
    const tokens = {
      colors: data.colors || {},
      typography: data.typography || {},
      spacing: data.spacing || {},
      radii: data.radii || {},
      shadows: data.shadows || {},
      transitions: data.transitions || {}
    };

    return {
      success: true,
      theme: {
        name,
        displayName: data.displayName || name,
        description: data.description || null,
        aliases: data.aliases || [],
        path: themePath,
        fallback: !!fallback,
        svg: svgPalette,
        tokens,
        cssVariables: includeCss ? buildCssVariables(tokens) : undefined
      }
    };
  }

  return { success: false, error: `Unsupported action: ${action}` };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions — Real Implementations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Locate an element in an SVG file by selector
 * @param {string} file - SVG file path
 * @param {string} selector - CSS selector or #id
 * @returns {Promise<Object>} Located element info or {found: false}
 */
async function locateElement(file, selector) {
  try {
    const { dom, document, svg } = parseSvgFile(file);
    
    // Try selector directly
    let element = document.querySelector(selector);
    
    // If not found and selector looks like an id without #, try with #
    if (!element && !selector.startsWith('#') && !selector.includes(' ')) {
      element = document.getElementById(selector);
    }
    
    if (!element) {
      return { found: false, selector };
    }
    
    const meta = buildElementMeta(element, document);
    
    return {
      found: true,
      ...meta,
      file
    };
  } catch (e) {
    return { found: false, error: e.message };
  }
}

/**
 * Index all elements in an SVG file
 * @param {string} file - SVG file path
 * @returns {Promise<Object>} Element index
 */
async function queryIndex(file) {
  try {
    const { dom, document, svg } = parseSvgFile(file);
    const elements = [];
    
    // Walk all elements
    const walker = document.createTreeWalker(
      svg,
      1, // NodeFilter.SHOW_ELEMENT
      null,
      false
    );
    
    let node = walker.currentNode;
    let docOrder = 0;
    
    while (node) {
      if (node.tagName && node.tagName.toLowerCase() !== 'defs') {
        const meta = buildElementMeta(node, document);
        elements.push({
          ...meta,
          docOrder: docOrder++
        });
      }
      node = walker.nextNode();
    }
    
    // Group by tag for summary
    const byTag = {};
    elements.forEach(el => {
      byTag[el.tagName] = (byTag[el.tagName] || 0) + 1;
    });
    
    return {
      success: true,
      file,
      totalElements: elements.length,
      byTag,
      elements: elements.slice(0, 100), // Limit for payload size
      truncated: elements.length > 100
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Find a specific element
 * @param {string} file - SVG file path
 * @param {string} selector - CSS selector
 * @returns {Promise<Object>} Element info
 */
async function queryFind(file, selector) {
  const result = await locateElement(file, selector);
  if (!result.found) {
    return {
      success: false,
      error: 'SELECTOR_NOT_FOUND',
      message: `Element not found: ${selector}`,
      suggestions: ['Use svg_query with action "index" to list elements']
    };
  }
  return { success: true, ...result };
}

/**
 * Get absolute positions using Puppeteer (delegates to svg-collisions.js)
 * For accurate positions, spawn the collision detector with --positions
 * @param {string} file - SVG file path
 * @param {string} [selector] - Optional filter selector
 * @returns {Promise<Object>} Position data
 */
async function queryPositions(file, selector) {
  try {
    const { spawn } = require('child_process');
    const scriptPath = path.join(__dirname, 'svg-collisions.js');
    
    // Resolve file path to absolute (relative to process cwd, not tools/dev)
    const absoluteFile = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
    
    return new Promise((resolve, reject) => {
      const args = [scriptPath, absoluteFile, '--positions', '--json'];
      if (selector) {
        args.push('--element', selector);
      }
      
      const proc = spawn('node', args);
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', data => { stdout += data; });
      proc.stderr.on('data', data => { stderr += data; });
      
      proc.on('close', code => {
        try {
          const result = JSON.parse(stdout);
          resolve({
            success: true,
            file,
            elements: result.elements || [],
            query: result.query || null
          });
        } catch (e) {
          resolve({
            success: false,
            error: 'Failed to parse position data',
            details: stderr || e.message
          });
        }
      });
      
      proc.on('error', err => {
        resolve({ success: false, error: err.message });
      });
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Detect collisions using Puppeteer (delegates to svg-collisions.js)
 * @param {string} file - SVG file path
 * @param {string} [severity] - Minimum severity filter
 * @returns {Promise<Object>} Collision data
 */
async function queryCollisions(file, severity) {
  try {
    const { spawn } = require('child_process');
    const scriptPath = path.join(__dirname, 'svg-collisions.js');
    
    // Resolve file path to absolute (relative to process cwd, not tools/dev)
    const absoluteFile = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
    
    return new Promise((resolve, reject) => {
      const args = [scriptPath, absoluteFile, '--json'];
      if (severity === 'high' || severity === 'medium') {
        args.push('--strict');
      }
      
      const proc = spawn('node', args);
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', data => { stdout += data; });
      proc.stderr.on('data', data => { stderr += data; });
      
      proc.on('close', code => {
        try {
          const result = JSON.parse(stdout);
          
          // Filter by severity if specified
          let collisions = result.collisions || [];
          if (severity === 'high') {
            collisions = collisions.filter(c => c.severity === 'high');
          } else if (severity === 'medium') {
            collisions = collisions.filter(c => c.severity === 'high' || c.severity === 'medium');
          }
          
          resolve({
            success: true,
            file,
            summary: result.summary || { high: 0, medium: 0, low: 0 },
            collisions,
            totalElements: result.totalElements
          });
        } catch (e) {
          resolve({
            success: false,
            error: 'Failed to parse collision data',
            details: stderr || e.message
          });
        }
      });
      
      proc.on('error', err => {
        resolve({ success: false, error: err.message });
      });
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Get SVG viewBox and content bounds
 * @param {string} file - SVG file path
 * @returns {Promise<Object>} Bounds data
 */
async function queryBounds(file) {
  try {
    const { dom, document, svg } = parseSvgFile(file);
    
    // Parse viewBox
    const viewBoxAttr = svg.getAttribute('viewBox');
    let viewBox = { x: 0, y: 0, width: 800, height: 600 };
    
    if (viewBoxAttr) {
      const parts = viewBoxAttr.split(/[\s,]+/).map(Number);
      if (parts.length === 4) {
        viewBox = { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
      }
    }
    
    // Get explicit width/height if set
    const width = svg.getAttribute('width');
    const height = svg.getAttribute('height');
    
    return {
      success: true,
      file,
      viewBox,
      explicitSize: {
        width: width ? parseFloat(width) : null,
        height: height ? parseFloat(height) : null
      }
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Apply set-attributes operation
 * @param {Object} located - Located element info
 * @param {Object} attrs - Attributes to set
 * @param {JSDOM} dom - JSDOM instance
 * @returns {Object} Result with new state
 */
function applySetAttrs(located, attrs, dom) {
  const document = dom.window.document;
  const element = document.querySelector(located.selector) || 
                  document.getElementById(located.id);
  
  if (!element) {
    return { success: false, error: 'Element not found for set' };
  }
  
  const beforeAttrs = {};
  const afterAttrs = {};
  
  for (const [key, value] of Object.entries(attrs)) {
    beforeAttrs[key] = element.getAttribute(key);
    element.setAttribute(key, value);
    afterAttrs[key] = value;
  }
  
  const newMeta = buildElementMeta(element, document);
  
  return {
    success: true,
    action: 'set',
    before: { attrs: beforeAttrs },
    after: { attrs: afterAttrs, ...newMeta }
  };
}

/**
 * Apply move operation (translate)
 * @param {Object} located - Located element info
 * @param {Object} by - Relative movement {x, y}
 * @param {Object} to - Absolute position {x, y}
 * @param {JSDOM} dom - JSDOM instance
 * @returns {Object} Result with new state
 */
function applyMove(located, by, to, dom) {
  const document = dom.window.document;
  const element = document.querySelector(located.selector) || 
                  document.getElementById(located.id);
  
  if (!element) {
    return { success: false, error: 'Element not found for move' };
  }
  
  // Get current position from x/y attrs or transform
  let currentX = parseFloat(element.getAttribute('x')) || 0;
  let currentY = parseFloat(element.getAttribute('y')) || 0;
  
  let newX, newY;
  
  if (to) {
    newX = to.x;
    newY = to.y;
  } else if (by) {
    newX = currentX + (by.x || 0);
    newY = currentY + (by.y || 0);
  } else {
    return { success: false, error: 'Must provide by or to for move' };
  }
  
  // Apply new position
  element.setAttribute('x', newX);
  element.setAttribute('y', newY);
  
  const newMeta = buildElementMeta(element, document);
  
  return {
    success: true,
    action: 'move',
    before: { x: currentX, y: currentY },
    after: { x: newX, y: newY, ...newMeta }
  };
}

/**
 * Apply delete operation
 * @param {Object} located - Located element info
 * @param {JSDOM} dom - JSDOM instance
 * @returns {Object} Result
 */
function applyDelete(located, dom) {
  const document = dom.window.document;
  const element = document.querySelector(located.selector) || 
                  document.getElementById(located.id);
  
  if (!element) {
    return { success: false, error: 'Element not found for delete' };
  }
  
  element.remove();
  
  return {
    success: true,
    action: 'delete',
    deleted: {
      id: located.id,
      tagName: located.tagName,
      selector: located.selector
    }
  };
}

/**
 * Apply replace operation
 * @param {Object} located - Located element info
 * @param {string} content - New SVG content
 * @param {JSDOM} dom - JSDOM instance
 * @returns {Object} Result
 */
function applyReplace(located, content, dom) {
  const document = dom.window.document;
  const element = document.querySelector(located.selector) || 
                  document.getElementById(located.id);
  
  if (!element) {
    return { success: false, error: 'Element not found for replace' };
  }
  
  // Parse new content
  const tempDom = new JSDOM(`<svg xmlns="http://www.w3.org/2000/svg">${content}</svg>`, 
                            { contentType: 'image/svg+xml' });
  const newElement = tempDom.window.document.querySelector('svg').firstElementChild;
  
  if (!newElement) {
    return { success: false, error: 'Invalid replacement content' };
  }
  
  // Import and replace
  const imported = document.importNode(newElement, true);
  element.replaceWith(imported);
  
  const newMeta = buildElementMeta(imported, document);
  
  return {
    success: true,
    action: 'replace',
    before: { markup: located.markup },
    after: newMeta
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Tool Definitions (for registration)
// ─────────────────────────────────────────────────────────────────────────────

const MCP_TOOLS = {
  svg_stamp: {
    name: 'svg_stamp',
    description: 'Stamp template instances into an SVG. Supports single instance, batch array, or grid generation. One call can create hundreds of elements.',
    inputSchema: {
      type: 'object',
      required: ['file', 'template'],
      properties: {
        file: { type: 'string', description: 'SVG file path' },
        template: { type: 'string', description: 'Template name: badge, node, legend, etc.' },
        parent: { type: 'string', description: 'Parent selector (default: svg)' },
        instances: {
          oneOf: [
            { type: 'object', description: 'Single instance parameters' },
            { type: 'array', items: { type: 'object' }, description: 'Array of instance parameters' }
          ]
        },
        defaults: { type: 'object', description: 'Default params for all instances' },
        grid: {
          type: 'object',
          description: 'Grid spec: startX, startY, cols, rows, spacingX, spacingY, labelPattern',
          properties: {
            startX: { type: 'number' },
            startY: { type: 'number' },
            cols: { type: 'number' },
            rows: { type: 'number' },
            spacingX: { type: 'number' },
            spacingY: { type: 'number' },
            labelPattern: { type: 'string', description: 'Pattern with ${row}, ${col}, ${index}' }
          }
        },
        dryRun: { type: 'boolean', default: true }
      }
    },
    handler: svg_stamp
  },
  
  svg_batch: {
    name: 'svg_batch',
    description: 'Apply multiple SVG operations atomically. Operations: stamp, set, move, delete, insert.',
    inputSchema: {
      type: 'object',
      required: ['file', 'operations'],
      properties: {
        file: { type: 'string' },
        operations: {
          type: 'array',
          items: {
            type: 'object',
            required: ['op'],
            properties: {
              op: { type: 'string', enum: ['stamp', 'set', 'move', 'delete', 'insert'] },
              selector: { type: 'string' },
              template: { type: 'string' },
              instances: { type: 'array' },
              attrs: { type: 'object' },
              by: { type: 'object' },
              elements: { type: 'array' }
            }
          }
        },
        atomic: { type: 'boolean', default: true },
        dryRun: { type: 'boolean', default: true }
      }
    },
    handler: svg_batch
  },
  
  svg_edit: {
    name: 'svg_edit',
    description: 'Guarded element mutation. Verifies hash before editing to prevent stale edits.',
    inputSchema: {
      type: 'object',
      required: ['file', 'selector', 'action'],
      properties: {
        file: { type: 'string' },
        selector: { type: 'string', description: 'CSS selector or #id' },
        action: { type: 'string', enum: ['set', 'move', 'delete', 'replace'] },
        attrs: { type: 'object', description: 'Attributes to set' },
        by: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } },
        to: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } },
        content: { type: 'string', description: 'Replacement SVG content' },
        expectHash: { type: 'string', description: 'Guard hash from previous query' },
        dryRun: { type: 'boolean', default: true }
      }
    },
    handler: svg_edit
  },
  
  svg_query: {
    name: 'svg_query',
    description: 'Query SVG structure, element positions, and collisions.',
    inputSchema: {
      type: 'object',
      required: ['file', 'action'],
      properties: {
        file: { type: 'string' },
        action: { type: 'string', enum: ['index', 'find', 'positions', 'collisions', 'bounds'] },
        selector: { type: 'string', description: 'For find/positions actions' },
        severity: { type: 'string', enum: ['high', 'medium', 'low', 'all'], description: 'For collisions action' }
      }
    },
    handler: svg_query
  },
  
  svg_create: {
    name: 'svg_create',
    description: 'Generate new SVG from a layered plan with templates and dense elements.',
    inputSchema: {
      type: 'object',
      required: ['output', 'plan'],
      properties: {
        output: { type: 'string', description: 'Output file path' },
        plan: {
          type: 'object',
          properties: {
            viewBox: { type: 'object', properties: { width: { type: 'number' }, height: { type: 'number' } } },
            background: { type: 'string' },
            layers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  template: { type: 'string' },
                  instances: { type: 'array' },
                  elements: { type: 'array' }
                }
              }
            }
          }
        }
      }
    },
    handler: svg_create
  },

  svg_theme: {
    name: 'svg_theme',
    description: 'List or retrieve theme definitions for SVG/HTML/jsgui3 (tokens + CSS vars).',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'get'], default: 'list' },
        name: { type: 'string', description: 'Theme name or alias (action=get)' },
        includeCss: { type: 'boolean', default: true }
      }
    },
    handler: svg_theme
  },
  
  svg_fix_collisions: {
    name: 'svg_fix_collisions',
    description: 'Detect and auto-fix overlapping elements using safe nudge strategies.',
    inputSchema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string' },
        severity: { type: 'string', enum: ['high', 'medium', 'all'], default: 'high' },
        padding: { type: 'number', default: 5 },
        maxFixes: { type: 'number', default: 10 },
        dryRun: { type: 'boolean', default: true }
      }
    },
    handler: svg_fix_collisions
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  // Tool handlers
  svg_stamp,
  svg_batch,
  svg_edit,
  svg_query,
  svg_create,
  svg_theme,
  svg_fix_collisions,
  
  // MCP registration
  MCP_TOOLS,
  
  // Helper functions (for testing and direct use)
  locateElement,
  queryIndex,
  queryFind,
  queryPositions,
  queryCollisions,
  queryBounds,
  parseSvgFile,
  serializeSvg,
  buildElementMeta
};
