#!/usr/bin/env node
"use strict";

/**
 * SVG Components Library - Reusable primitives for diagram creation
 * 
 * Provides a set of composable components for building professional diagrams:
 * - Shapes: boxes, circles, diamonds, cylinders
 * - Connectors: arrows, lines, curved paths
 * - Text: labels, badges, multi-line blocks
 * - Layout: grids, columns, stacks
 * - Interactivity: data attributes for click handling
 * 
 * Import and use in custom generators or the main svg-gen.js
 * 
 * See: docs/guides/SVG_CREATION_METHODOLOGY.md
 */

// ═══════════════════════════════════════════════════════════════════════════════
// THEME (can be overridden)
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_THEME = {
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

let theme = { ...DEFAULT_THEME };

function setTheme(customTheme) {
  theme = { ...DEFAULT_THEME, ...customTheme };
}

function getTheme() {
  return theme;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

function escapeXml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '0, 0, 0';
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
}

function rgba(hex, alpha) {
  return `rgba(${hexToRgb(hex)}, ${alpha})`;
}

function generateId(prefix = 'el') {
  return `${prefix}_${Math.random().toString(36).substring(2, 8)}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHAPE COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Rounded rectangle box
 */
function box(options = {}) {
  const {
    x = 0,
    y = 0,
    width = 200,
    height = 100,
    rx = 8,
    fill = theme.surface.card,
    stroke = theme.surface.cardBorder,
    strokeWidth = 1,
    filter = null,
    id = null,
    className = null,
    dataAttrs = {}
  } = options;
  
  const dataStr = Object.entries(dataAttrs)
    .map(([k, v]) => `data-${k}="${escapeXml(v)}"`)
    .join(' ');
  
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" 
    fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"
    ${filter ? `filter="url(#${filter})"` : ''}
    ${id ? `id="${id}"` : ''}
    ${className ? `class="${className}"` : ''}
    ${dataStr}/>`;
}

/**
 * Circle shape
 */
function circle(options = {}) {
  const {
    cx = 50,
    cy = 50,
    r = 40,
    fill = theme.accent.gold,
    stroke = null,
    strokeWidth = 0,
    id = null,
    dataAttrs = {}
  } = options;
  
  const dataStr = Object.entries(dataAttrs)
    .map(([k, v]) => `data-${k}="${escapeXml(v)}"`)
    .join(' ');
  
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"
    ${stroke ? `stroke="${stroke}" stroke-width="${strokeWidth}"` : ''}
    ${id ? `id="${id}"` : ''}
    ${dataStr}/>`;
}

/**
 * Diamond (decision) shape
 */
function diamond(options = {}) {
  const {
    cx = 50,
    cy = 50,
    size = 60,
    fill = theme.surface.card,
    stroke = theme.accent.gold,
    strokeWidth = 2,
    id = null,
    dataAttrs = {}
  } = options;
  
  const half = size / 2;
  const points = `${cx},${cy - half} ${cx + half},${cy} ${cx},${cy + half} ${cx - half},${cy}`;
  
  const dataStr = Object.entries(dataAttrs)
    .map(([k, v]) => `data-${k}="${escapeXml(v)}"`)
    .join(' ');
  
  return `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"
    ${id ? `id="${id}"` : ''}
    ${dataStr}/>`;
}

/**
 * Database cylinder shape
 */
function cylinder(options = {}) {
  const {
    x = 0,
    y = 0,
    width = 80,
    height = 100,
    fill = theme.surface.card,
    stroke = theme.status.planned,
    strokeWidth = 2,
    id = null,
    dataAttrs = {}
  } = options;
  
  const ellipseRy = height * 0.1;
  const bodyHeight = height - ellipseRy * 2;
  
  const dataStr = Object.entries(dataAttrs)
    .map(([k, v]) => `data-${k}="${escapeXml(v)}"`)
    .join(' ');
  
  return `<g ${id ? `id="${id}"` : ''} ${dataStr}>
    <!-- Cylinder body -->
    <path d="M ${x} ${y + ellipseRy} 
             L ${x} ${y + ellipseRy + bodyHeight}
             A ${width / 2} ${ellipseRy} 0 0 0 ${x + width} ${y + ellipseRy + bodyHeight}
             L ${x + width} ${y + ellipseRy}
             A ${width / 2} ${ellipseRy} 0 0 0 ${x} ${y + ellipseRy}
             Z"
          fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
    <!-- Top ellipse (visible) -->
    <ellipse cx="${x + width / 2}" cy="${y + ellipseRy}" rx="${width / 2}" ry="${ellipseRy}"
             fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
  </g>`;
}

/**
 * Hexagon shape (for nodes/modules)
 */
function hexagon(options = {}) {
  const {
    cx = 50,
    cy = 50,
    size = 40,
    fill = theme.surface.card,
    stroke = theme.accent.gold,
    strokeWidth = 2,
    id = null,
    dataAttrs = {}
  } = options;
  
  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    points.push(`${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`);
  }
  
  const dataStr = Object.entries(dataAttrs)
    .map(([k, v]) => `data-${k}="${escapeXml(v)}"`)
    .join(' ');
  
  return `<polygon points="${points.join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"
    ${id ? `id="${id}"` : ''}
    ${dataStr}/>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONNECTOR COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Straight line with optional arrow
 */
function line(options = {}) {
  const {
    x1, y1, x2, y2,
    stroke = theme.connector.default,
    strokeWidth = 2,
    strokeDasharray = null,
    markerEnd = null,
    id = null
  } = options;
  
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
    stroke="${stroke}" stroke-width="${strokeWidth}"
    ${strokeDasharray ? `stroke-dasharray="${strokeDasharray}"` : ''}
    ${markerEnd ? `marker-end="url(#${markerEnd})"` : ''}
    ${id ? `id="${id}"` : ''}/>`;
}

/**
 * Arrow (line with arrowhead)
 */
function arrow(options = {}) {
  return line({ ...options, markerEnd: options.markerEnd || 'arrowhead' });
}

/**
 * Curved connector path (for flowcharts)
 */
function curvedConnector(options = {}) {
  const {
    x1, y1, x2, y2,
    direction = 'horizontal', // 'horizontal', 'vertical', 'auto'
    stroke = theme.connector.default,
    strokeWidth = 2,
    markerEnd = 'arrowhead',
    id = null
  } = options;
  
  let path;
  if (direction === 'horizontal') {
    const midX = (x1 + x2) / 2;
    path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
  } else if (direction === 'vertical') {
    const midY = (y1 + y2) / 2;
    path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
  } else {
    // Auto: prefer horizontal if wider than tall
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    if (dx >= dy) {
      const midX = (x1 + x2) / 2;
      path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
    } else {
      const midY = (y1 + y2) / 2;
      path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
    }
  }
  
  return `<path d="${path}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"
    ${markerEnd ? `marker-end="url(#${markerEnd})"` : ''}
    ${id ? `id="${id}"` : ''}/>`;
}

/**
 * Orthogonal connector (right-angle turns)
 */
function orthogonalConnector(options = {}) {
  const {
    x1, y1, x2, y2,
    stroke = theme.connector.default,
    strokeWidth = 2,
    markerEnd = 'arrowhead',
    offset = 20, // distance before turn
    id = null
  } = options;
  
  let path;
  if (Math.abs(x2 - x1) > Math.abs(y2 - y1)) {
    // More horizontal: go horizontal first
    const midX = x1 + (x2 - x1) / 2;
    path = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
  } else {
    // More vertical: go vertical first
    const midY = y1 + (y2 - y1) / 2;
    path = `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
  }
  
  return `<path d="${path}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"
    ${markerEnd ? `marker-end="url(#${markerEnd})"` : ''}
    ${id ? `id="${id}"` : ''}/>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEXT COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Single line text
 */
function text(options = {}) {
  const {
    x = 0,
    y = 0,
    content = '',
    fontFamily = 'Inter, system-ui, sans-serif',
    fontSize = 14,
    fontWeight = 'normal',
    fill = theme.text.primary,
    textAnchor = 'start', // 'start', 'middle', 'end'
    id = null,
    className = null,
    dataAttrs = {}
  } = options;
  
  const dataStr = Object.entries(dataAttrs)
    .map(([k, v]) => `data-${k}="${escapeXml(v)}"`)
    .join(' ');
  
  return `<text x="${x}" y="${y}" font-family="${fontFamily}" font-size="${fontSize}" 
    font-weight="${fontWeight}" fill="${fill}" text-anchor="${textAnchor}"
    ${id ? `id="${id}"` : ''}
    ${className ? `class="${className}"` : ''}
    ${dataStr}>${escapeXml(content)}</text>`;
}

/**
 * Multi-line text block
 */
function textBlock(options = {}) {
  const {
    x = 0,
    y = 0,
    lines = [],
    fontFamily = 'Inter, system-ui, sans-serif',
    fontSize = 14,
    fontWeight = 'normal',
    fill = theme.text.primary,
    lineHeight = 1.4,
    textAnchor = 'start',
    id = null
  } = options;
  
  const actualLineHeight = fontSize * lineHeight;
  
  return lines.map((line, i) => text({
    x,
    y: y + i * actualLineHeight,
    content: line,
    fontFamily,
    fontSize,
    fontWeight,
    fill,
    textAnchor,
    id: id ? `${id}_line${i}` : null
  })).join('\n');
}

/**
 * Badge (small labeled pill)
 */
function badge(options = {}) {
  const {
    x = 0,
    y = 0,
    content = '',
    bgColor = theme.status.active,
    textColor = '#ffffff',
    fontSize = 10,
    paddingX = 8,
    paddingY = 4,
    rx = 4,
    id = null
  } = options;
  
  // Estimate text width (rough)
  const textWidth = content.length * fontSize * 0.6;
  const width = textWidth + paddingX * 2;
  const height = fontSize + paddingY * 2;
  
  return `<g ${id ? `id="${id}"` : ''}>
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="${bgColor}"/>
    <text x="${x + width / 2}" y="${y + height / 2 + fontSize * 0.35}" 
          font-family="Inter, system-ui, sans-serif" font-size="${fontSize}" font-weight="bold"
          fill="${textColor}" text-anchor="middle">${escapeXml(content)}</text>
  </g>`;
}

/**
 * Icon placeholder (emoji or SVG symbol)
 */
function icon(options = {}) {
  const {
    x = 0,
    y = 0,
    content = '●',
    fontSize = 20,
    fill = theme.accent.gold,
    id = null
  } = options;
  
  return text({ x, y, content, fontSize, fill, id });
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPOSITE COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Labeled box (box with title and optional content)
 */
function labeledBox(options = {}) {
  const {
    x = 0,
    y = 0,
    width = 200,
    height = 100,
    title = '',
    subtitle = null,
    headerColor = rgba(theme.status.active, 0.15),
    bodyColor = theme.surface.card,
    titleColor = theme.accent.gold,
    subtitleColor = theme.text.secondary,
    rx = 8,
    headerHeight = 40,
    id = null,
    dataAttrs = {}
  } = options;
  
  const dataStr = Object.entries(dataAttrs)
    .map(([k, v]) => `data-${k}="${escapeXml(v)}"`)
    .join(' ');
  
  return `<g ${id ? `id="${id}"` : ''} ${dataStr}>
    <!-- Body -->
    ${box({ x, y, width, height, rx, fill: bodyColor, stroke: theme.surface.cardBorder })}
    
    <!-- Header -->
    <rect x="${x}" y="${y}" width="${width}" height="${headerHeight}" rx="${rx}" fill="${headerColor}"/>
    <rect x="${x}" y="${y + headerHeight - rx}" width="${width}" height="${rx}" fill="${headerColor}"/>
    
    <!-- Title -->
    ${text({ x: x + 16, y: y + 26, content: title, fontSize: 16, fontWeight: 'bold', fill: titleColor })}
    
    ${subtitle ? text({ x: x + 16, y: y + 44, content: subtitle, fontSize: 11, fill: subtitleColor }) : ''}
  </g>`;
}

/**
 * Node with label (for architecture diagrams)
 */
function node(options = {}) {
  const {
    cx = 100,
    cy = 100,
    label = '',
    shape = 'box', // 'box', 'circle', 'diamond', 'hexagon', 'cylinder'
    size = 80,
    fill = theme.surface.card,
    stroke = theme.accent.gold,
    strokeWidth = 2,
    textColor = theme.text.primary,
    fontSize = 12,
    id = null,
    dataAttrs = {}
  } = options;
  
  const dataStr = Object.entries(dataAttrs)
    .map(([k, v]) => `data-${k}="${escapeXml(v)}"`)
    .join(' ');
  
  let shapeEl;
  switch (shape) {
    case 'circle':
      shapeEl = circle({ cx, cy, r: size / 2, fill, stroke, strokeWidth });
      break;
    case 'diamond':
      shapeEl = diamond({ cx, cy, size, fill, stroke, strokeWidth });
      break;
    case 'hexagon':
      shapeEl = hexagon({ cx, cy, size: size / 2, fill, stroke, strokeWidth });
      break;
    case 'cylinder':
      shapeEl = cylinder({ x: cx - size / 2, y: cy - size / 2, width: size, height: size, fill, stroke, strokeWidth });
      break;
    default: // box
      shapeEl = box({ x: cx - size / 2, y: cy - size * 0.4, width: size, height: size * 0.8, rx: 6, fill, stroke, strokeWidth });
  }
  
  return `<g ${id ? `id="${id}"` : ''} ${dataStr}>
    ${shapeEl}
    ${text({ x: cx, y: cy + fontSize * 0.35, content: label, fontSize, fill: textColor, textAnchor: 'middle', fontWeight: 'bold' })}
  </g>`;
}

/**
 * Progress indicator
 */
function progressBar(options = {}) {
  const {
    x = 0,
    y = 0,
    width = 100,
    height = 6,
    progress = 0,
    bgColor = 'rgba(255,255,255,0.1)',
    fillColor = theme.status.active,
    showLabel = true,
    labelColor = theme.text.tertiary,
    rx = 3,
    id = null
  } = options;
  
  const fillWidth = Math.round((Math.min(100, Math.max(0, progress)) / 100) * width);
  
  return `<g ${id ? `id="${id}"` : ''}>
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="${bgColor}"/>
    <rect x="${x}" y="${y}" width="${fillWidth}" height="${height}" rx="${rx}" fill="${fillColor}"/>
    ${showLabel ? text({ x: x + width + 8, y: y + height - 1, content: `${progress}%`, fontSize: 9, fill: labelColor }) : ''}
  </g>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFS (Gradients, Filters, Markers)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Standard defs block for Industrial Luxury Obsidian theme
 */
function standardDefs() {
  return `<defs>
    <!-- Filters -->
    <filter id="goldGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feFlood flood-color="${theme.accent.gold}" flood-opacity="0.3"/>
      <feComposite in2="blur" operator="in"/>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    
    <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="2" dy="3" stdDeviation="3" flood-opacity="0.3"/>
    </filter>
    
    <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    
    <!-- Gradients -->
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${theme.background.secondary}" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="${theme.background.tertiary}" stop-opacity="0.3"/>
    </linearGradient>
    
    <linearGradient id="cardGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:${theme.surface.card}"/>
      <stop offset="50%" style="stop-color:${theme.background.tertiary}"/>
      <stop offset="100%" style="stop-color:#0f1420"/>
    </linearGradient>
    
    <linearGradient id="goldAccent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${theme.accent.goldBright}"/>
      <stop offset="50%" style="stop-color:${theme.accent.gold}"/>
      <stop offset="100%" style="stop-color:${theme.accent.goldDark}"/>
    </linearGradient>
    
    <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" style="stop-color:${theme.accent.gold};stop-opacity:0.4"/>
      <stop offset="70%" style="stop-color:${theme.accent.gold};stop-opacity:0.1"/>
      <stop offset="100%" style="stop-color:${theme.accent.gold};stop-opacity:0"/>
    </radialGradient>
    
    <!-- Markers -->
    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="${theme.connector.default}"/>
    </marker>
    
    <marker id="arrowheadGold" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="${theme.accent.gold}"/>
    </marker>
    
    <marker id="arrowheadGreen" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="${theme.status.active}"/>
    </marker>
    
    <marker id="arrowheadRed" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="${theme.status.error}"/>
    </marker>
    
    <marker id="circleMarker" markerWidth="8" markerHeight="8" refX="4" refY="4">
      <circle cx="4" cy="4" r="3" fill="${theme.connector.default}"/>
    </marker>
  </defs>`;
}

/**
 * Canvas wrapper with background
 */
function canvas(options = {}) {
  const {
    width = 1400,
    height = 900,
    background = theme.background.primary,
    includeGradient = true,
    content = ''
  } = options;
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  ${standardDefs()}
  
  <!-- Background -->
  <rect width="${width}" height="${height}" fill="${background}"/>
  ${includeGradient ? `<rect width="${width}" height="${height}" fill="url(#bgGradient)"/>` : ''}
  
  <!-- Content -->
  ${content}
</svg>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  // Theme
  setTheme,
  getTheme,
  DEFAULT_THEME,
  
  // Utilities
  escapeXml,
  hexToRgb,
  rgba,
  generateId,
  
  // Basic shapes
  box,
  circle,
  diamond,
  cylinder,
  hexagon,
  
  // Connectors
  line,
  arrow,
  curvedConnector,
  orthogonalConnector,
  
  // Text
  text,
  textBlock,
  badge,
  icon,
  
  // Composite
  labeledBox,
  node,
  progressBar,
  
  // Defs & Canvas
  standardDefs,
  canvas
};
