#!/usr/bin/env node
"use strict";

/**
 * SVG Generator - Multi-stage SVG creation from JSON data
 * 
 * Takes structured JSON data and generates professional SVG diagrams
 * following the Industrial Luxury Obsidian theme.
 * 
 * Usage:
 *   node tools/dev/svg-gen.js <data.json> <output.svg>
 *   node tools/dev/svg-gen.js --template <template-name> --data <file> --output <file>
 *   node tools/dev/svg-gen.js --list-templates
 *   node tools/dev/svg-gen.js --help
 * 
 * Templates:
 *   goals-overview     - Project goals with categories and progress
 *   architecture       - System architecture diagram
 *   flowchart          - Process flow diagram
 *   timeline           - Roadmap/timeline visualization
 * 
 * See: docs/guides/SVG_CREATION_METHODOLOGY.md
 */

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════════
// THEME CONSTANTS - Industrial Luxury Obsidian
// ═══════════════════════════════════════════════════════════════════════════════

const THEME = {
  // Background layers
  background: {
    primary: '#0a0d14',
    secondary: '#050508',
    tertiary: '#141824'
  },
  
  // Card/panel surfaces
  surface: {
    card: '#1a1f2e',
    cardHover: '#252b3d',
    cardBorder: 'rgba(255,255,255,0.06)'
  },
  
  // Accent colors
  accent: {
    gold: '#c9a227',
    goldBright: '#ffd700',
    goldDark: '#8b7500'
  },
  
  // Status colors
  status: {
    active: '#10b981',     // Emerald
    planned: '#3b82f6',    // Sapphire
    research: '#8b5cf6',   // Amethyst
    complete: '#22c55e',   // Green
    error: '#e31837',      // Ruby
    warning: '#ff9f00'     // Topaz
  },
  
  // Text hierarchy
  text: {
    primary: '#f0f4f8',
    secondary: '#94a3b8',
    tertiary: '#64748b',
    muted: '#475569'
  }
};

const TYPOGRAPHY = {
  title: {
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: 32,
    fontWeight: 'bold',
    letterSpacing: 2
  },
  
  subtitle: {
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: 14,
    fontWeight: 'normal'
  },
  
  categoryHeader: {
    fontFamily: "Georgia, serif",
    fontSize: 16,
    fontWeight: 'bold'
  },
  
  goalTitle: {
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: 13,
    fontWeight: 600
  },
  
  description: {
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: 11,
    fontWeight: 'normal'
  },
  
  code: {
    fontFamily: "JetBrains Mono, monospace",
    fontSize: 11
  },
  
  stats: {
    fontFamily: "JetBrains Mono, monospace",
    fontSize: 9
  }
};

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

function categoryTint(hexColor) {
  return `rgba(${hexToRgb(hexColor)}, 0.15)`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFS BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

function buildDefs(options = {}) {
  return `<defs>
    <!-- Gold glow filter -->
    <filter id="goldGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feFlood flood-color="${THEME.accent.gold}" flood-opacity="0.3"/>
      <feComposite in2="blur" operator="in"/>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    
    <!-- Drop shadow -->
    <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="2" dy="3" stdDeviation="3" flood-opacity="0.3"/>
    </filter>
    
    <!-- Background gradient -->
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${THEME.background.secondary}" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="${THEME.background.tertiary}" stop-opacity="0.3"/>
    </linearGradient>
    
    <!-- Arrow markers -->
    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="${THEME.text.tertiary}"/>
    </marker>
    
    <marker id="arrowheadGold" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="${THEME.accent.gold}"/>
    </marker>
  </defs>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function buildHeader(data, width) {
  const margin = 50;
  
  let legendContent = '';
  if (data.legend && data.legend.length > 0) {
    legendContent = `<g transform="translate(${width - 550}, 50)">
      ${data.legend.map((item, i) => `
        <circle cx="${i * 140}" cy="0" r="6" fill="${item.color}"/>
        <text x="${i * 140 + 14}" y="4" font-family="${TYPOGRAPHY.subtitle.fontFamily}" 
              font-size="11" font-weight="bold" fill="${item.color}">${escapeXml(item.label)} (${item.count || ''})</text>
      `).join('')}
    </g>`;
  }
  
  let statsContent = '';
  if (data.lastUpdated || data.stats) {
    statsContent = `<g transform="translate(${width - 550}, 80)">
      <text x="0" y="4" font-family="${TYPOGRAPHY.code.fontFamily}" 
            font-size="11" fill="${THEME.text.muted}">${data.stats || ''} • Last updated: ${data.lastUpdated || 'N/A'}</text>
    </g>`;
  }
  
  return `
  <!-- Header -->
  <text x="${margin}" y="55" font-family="${TYPOGRAPHY.title.fontFamily}" 
        font-size="${TYPOGRAPHY.title.fontSize}" font-weight="${TYPOGRAPHY.title.fontWeight}" 
        fill="${THEME.accent.gold}" letter-spacing="${TYPOGRAPHY.title.letterSpacing}">${escapeXml(data.title || 'Diagram')}</text>
  <text x="${margin}" y="85" font-family="${TYPOGRAPHY.subtitle.fontFamily}" 
        font-size="${TYPOGRAPHY.subtitle.fontSize}" fill="${THEME.text.tertiary}">${escapeXml(data.subtitle || '')}</text>
  
  <!-- Gold divider -->
  <line x1="${margin}" y1="105" x2="${width - margin}" y2="105" 
        stroke="${THEME.accent.gold}" stroke-opacity="0.4" stroke-width="1"/>
  
  <!-- Legend -->
  ${legendContent}
  
  <!-- Stats -->
  ${statsContent}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDERERS
// ═══════════════════════════════════════════════════════════════════════════════

// --- Goals Overview Renderer ---

function buildProgressBar(x, y, width, progress, color) {
  const fillWidth = Math.round((progress / 100) * width);
  return `
    <rect x="${x}" y="${y}" width="${width}" height="6" rx="2" fill="rgba(255,255,255,0.1)"/>
    <rect x="${x}" y="${y}" width="${fillWidth}" height="6" rx="2" fill="${color}"/>
    <text x="${x + width + 5}" y="${y + 6}" font-family="${TYPOGRAPHY.stats.fontFamily}" 
          font-size="${TYPOGRAPHY.stats.fontSize}" fill="${THEME.text.tertiary}" text-anchor="start">${progress}%</text>`;
}

function buildGoalCard(goal, x, y, width) {
  const statusColor = THEME.status[goal.status] || THEME.text.tertiary;
  const progressWidth = 80;
  
  let lines = '';
  if (goal.lines && goal.lines.length > 0) {
    lines = goal.lines.map((line, i) => `
      <text x="26" y="${28 + i * 14}" font-family="${TYPOGRAPHY.description.fontFamily}" 
            font-size="${TYPOGRAPHY.description.fontSize}" fill="${THEME.text.secondary}">${escapeXml(line)}</text>
    `).join('');
  }
  
  const cardHeight = 16 + (goal.lines ? goal.lines.length * 14 : 0) + 20;
  
  return `
  <g transform="translate(${x}, ${y})" data-goal-id="${escapeXml(goal.id || '')}">
    <rect x="0" y="0" width="${width}" height="${cardHeight}" rx="4" fill="rgba(26, 31, 46, 0.6)"/>
    <circle cx="12" cy="12" r="5" fill="${statusColor}"/>
    <text x="26" y="14" font-family="${TYPOGRAPHY.goalTitle.fontFamily}" 
          font-size="${TYPOGRAPHY.goalTitle.fontSize}" font-weight="${TYPOGRAPHY.goalTitle.fontWeight}" 
          fill="${THEME.text.primary}">${escapeXml(goal.name)}</text>
    ${goal.progress !== undefined ? buildProgressBar(width - progressWidth - 20, 6, progressWidth, goal.progress, statusColor) : ''}
    ${lines}
  </g>`;
}

function renderGoalsOverview(data, config) {
  const { canvasWidth = 1400, margin = 50, columnWidth = 420, columnGap = 40, categoryGap = 20, headerHeight = 120 } = config;
  
  const contentWidth = canvasWidth - (2 * margin);
  const numColumns = Math.floor((contentWidth + columnGap) / (columnWidth + columnGap));
  const columnHeights = new Array(numColumns).fill(headerHeight + margin);
  
  let categoriesContent = '';
  
  if (data.categories) {
    for (const category of data.categories) {
      const shortestCol = columnHeights.indexOf(Math.min(...columnHeights));
      const x = margin + shortestCol * (columnWidth + columnGap);
      const y = columnHeights[shortestCol];
      
      // Calculate height
      const goalPadding = 12;
      const baseHeight = 60;
      let goalsHeight = 0;
      let goalsContent = '';
      let currentY = 48;
      
      if (category.goals) {
        for (const goal of category.goals) {
          const lineCount = goal.lines ? goal.lines.length : 0;
          const goalCardHeight = 16 + (lineCount * 14) + 20;
          goalsContent += buildGoalCard(goal, 12, currentY, columnWidth - 24);
          currentY += goalCardHeight + goalPadding;
          goalsHeight += goalCardHeight + goalPadding;
        }
      }
      
      const totalHeight = currentY + 12;
      const headerColor = category.color || categoryTint(THEME.status.active);
      
      categoriesContent += `
      <g transform="translate(${x}, ${y})" data-category-id="${escapeXml(category.id || '')}">
        <rect x="0" y="0" width="${columnWidth}" height="${totalHeight}" 
              rx="8" fill="${THEME.surface.card}" stroke="${THEME.surface.cardBorder}" stroke-width="1"/>
        <rect x="0" y="0" width="${columnWidth}" height="40" rx="8" fill="${headerColor}"/>
        <rect x="0" y="32" width="${columnWidth}" height="8" fill="${headerColor}"/>
        <text x="16" y="26" font-family="${TYPOGRAPHY.categoryHeader.fontFamily}" 
              font-size="${TYPOGRAPHY.categoryHeader.fontSize}" font-weight="${TYPOGRAPHY.categoryHeader.fontWeight}" 
              fill="${THEME.accent.gold}">${escapeXml(category.icon || '')} ${escapeXml(category.name)}</text>
        <text x="${columnWidth - 20}" y="26" font-family="${TYPOGRAPHY.code.fontFamily}" 
              font-size="12" fill="${THEME.text.tertiary}" text-anchor="end">${category.goals ? category.goals.length : 0}</text>
        ${goalsContent}
      </g>`;
      
      columnHeights[shortestCol] += totalHeight + categoryGap;
    }
  }
  
  return {
    svgContent: categoriesContent,
    width: canvasWidth,
    height: Math.max(...columnHeights) + margin
  };
}

// --- Architecture Renderer ---

function renderArchitecture(data, config) {
  const { canvasWidth = 1400, margin = 50, headerHeight = 120 } = config;
  
  let content = '';
  let maxY = headerHeight;
  
  // Draw connections first (so they are behind components)
  if (data.connections) {
    for (const conn of data.connections) {
      const from = data.components.find(c => c.id === conn.from);
      const to = data.components.find(c => c.id === conn.to);
      
      if (from && to) {
        const x1 = from.x + from.width / 2;
        const y1 = from.y + from.height / 2;
        const x2 = to.x + to.width / 2;
        const y2 = to.y + to.height / 2;
        
        content += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" 
          stroke="${THEME.text.tertiary}" stroke-width="2" marker-end="url(#arrowhead)"/>`;
          
        if (conn.label) {
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          content += `<rect x="${mx - 30}" y="${my - 10}" width="60" height="20" rx="4" fill="${THEME.background.primary}" opacity="0.8"/>`;
          content += `<text x="${mx}" y="${my + 4}" font-family="${TYPOGRAPHY.code.fontFamily}" 
            font-size="10" fill="${THEME.text.secondary}" text-anchor="middle">${escapeXml(conn.label)}</text>`;
        }
      }
    }
  }
  
  // Draw components
  if (data.components) {
    for (const comp of data.components) {
      const color = comp.type === 'database' ? THEME.status.planned : 
                   comp.type === 'client' ? THEME.status.active : THEME.surface.card;
      
      content += `
      <g transform="translate(${comp.x}, ${comp.y})">
        <rect width="${comp.width}" height="${comp.height}" rx="6" 
          fill="${THEME.surface.card}" stroke="${color}" stroke-width="2"/>
        <text x="${comp.width/2}" y="${comp.height/2 + 5}" font-family="${TYPOGRAPHY.goalTitle.fontFamily}" 
          font-size="${TYPOGRAPHY.goalTitle.fontSize}" fill="${THEME.text.primary}" text-anchor="middle">${escapeXml(comp.name)}</text>
        <text x="${comp.width/2}" y="${comp.height - 8}" font-family="${TYPOGRAPHY.code.fontFamily}" 
          font-size="9" fill="${THEME.text.tertiary}" text-anchor="middle">${escapeXml(comp.type)}</text>
      </g>`;
      
      maxY = Math.max(maxY, comp.y + comp.height);
    }
  }
  
  return {
    svgContent: content,
    width: canvasWidth,
    height: maxY + margin
  };
}

// --- Flowchart Renderer ---

function renderFlowchart(data, config) {
  const { canvasWidth = 1400, margin = 50, headerHeight = 120 } = config;
  
  let content = '';
  let maxY = headerHeight;
  
  // Draw edges
  if (data.edges) {
    for (const edge of data.edges) {
      const from = data.nodes.find(n => n.id === edge.from);
      const to = data.nodes.find(n => n.id === edge.to);
      
      if (from && to) {
        // Simple center-to-center for now
        // In a real implementation, we'd calculate intersection points
        const x1 = from.x + 60; // Assuming width 120
        const y1 = from.y + 30; // Assuming height 60
        const x2 = to.x + 60;
        const y2 = to.y + 30;
        
        content += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" 
          stroke="${THEME.text.tertiary}" stroke-width="2" marker-end="url(#arrowhead)"/>`;
          
        if (edge.label) {
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          content += `<text x="${mx}" y="${my - 5}" font-family="${TYPOGRAPHY.code.fontFamily}" 
            font-size="10" fill="${THEME.text.secondary}" text-anchor="middle">${escapeXml(edge.label)}</text>`;
        }
      }
    }
  }
  
  // Draw nodes
  if (data.nodes) {
    for (const node of data.nodes) {
      const width = 120;
      const height = 60;
      let shape = '';
      let color = THEME.surface.card;
      
      if (node.type === 'start' || node.type === 'end') {
        shape = `<rect width="${width}" height="${height}" rx="30" fill="${THEME.surface.card}" stroke="${THEME.status.active}" stroke-width="2"/>`;
      } else if (node.type === 'decision') {
        shape = `<polygon points="${width/2},0 ${width},${height/2} ${width/2},${height} 0,${height/2}" fill="${THEME.surface.card}" stroke="${THEME.accent.gold}" stroke-width="2"/>`;
      } else {
        shape = `<rect width="${width}" height="${height}" rx="4" fill="${THEME.surface.card}" stroke="${THEME.text.tertiary}" stroke-width="1"/>`;
      }
      
      content += `
      <g transform="translate(${node.x}, ${node.y})">
        ${shape}
        <text x="${width/2}" y="${height/2 + 4}" font-family="${TYPOGRAPHY.goalTitle.fontFamily}" 
          font-size="${TYPOGRAPHY.goalTitle.fontSize}" fill="${THEME.text.primary}" text-anchor="middle">${escapeXml(node.label)}</text>
      </g>`;
      
      maxY = Math.max(maxY, node.y + height);
    }
  }
  
  return {
    svgContent: content,
    width: canvasWidth,
    height: maxY + margin
  };
}

// --- Timeline Renderer ---

function renderTimeline(data, config) {
  const { canvasWidth = 1400, margin = 50, headerHeight = 120 } = config;
  
  let content = '';
  let currentY = headerHeight + 40;
  
  // Calculate time scale
  const start = new Date(data.startDate).getTime();
  const end = new Date(data.endDate).getTime();
  const duration = end - start;
  const timelineWidth = canvasWidth - (2 * margin);
  
  function getX(dateStr) {
    const t = new Date(dateStr).getTime();
    return margin + ((t - start) / duration) * timelineWidth;
  }
  
  // Draw axis
  content += `<line x1="${margin}" y1="${currentY}" x2="${canvasWidth - margin}" y2="${currentY}" stroke="${THEME.text.tertiary}" stroke-width="1"/>`;
  
  // Draw months (simplified)
  let d = new Date(start);
  while (d.getTime() <= end) {
    const x = getX(d.toISOString());
    content += `<line x1="${x}" y1="${currentY}" x2="${x}" y2="${currentY + 10}" stroke="${THEME.text.tertiary}" stroke-width="1"/>`;
    content += `<text x="${x + 5}" y="${currentY + 20}" font-family="${TYPOGRAPHY.code.fontFamily}" font-size="10" fill="${THEME.text.tertiary}">${d.toISOString().slice(0, 7)}</text>`;
    d.setMonth(d.getMonth() + 1);
  }
  
  currentY += 40;
  
  // Draw tracks
  if (data.tracks) {
    for (const track of data.tracks) {
      content += `<text x="${margin}" y="${currentY + 15}" font-family="${TYPOGRAPHY.categoryHeader.fontFamily}" font-size="14" fill="${THEME.text.primary}">${escapeXml(track.name)}</text>`;
      
      // Track background
      content += `<rect x="${margin + 100}" y="${currentY}" width="${timelineWidth - 100}" height="30" fill="${THEME.surface.card}" opacity="0.5"/>`;
      
      if (track.items) {
        for (const item of track.items) {
          const x1 = Math.max(margin + 100, getX(item.start));
          const x2 = Math.min(canvasWidth - margin, getX(item.end));
          const w = Math.max(2, x2 - x1);
          const color = THEME.status[item.status] || THEME.status.planned;
          
          content += `<rect x="${x1}" y="${currentY + 5}" width="${w}" height="20" rx="4" fill="${color}" opacity="0.8"/>`;
          content += `<text x="${x1 + 5}" y="${currentY + 19}" font-family="${TYPOGRAPHY.description.fontFamily}" font-size="10" fill="#fff">${escapeXml(item.label)}</text>`;
        }
      }
      
      currentY += 40;
    }
  }
  
  // Draw milestones
  if (data.milestones) {
    currentY += 20;
    for (const m of data.milestones) {
      const x = getX(m.date);
      content += `<line x1="${x}" y1="${headerHeight + 40}" x2="${x}" y2="${currentY}" stroke="${THEME.accent.gold}" stroke-dasharray="4 4" opacity="0.5"/>`;
      content += `<circle cx="${x}" cy="${currentY}" r="6" fill="${THEME.accent.gold}"/>`;
      content += `<text x="${x}" y="${currentY + 20}" font-family="${TYPOGRAPHY.subtitle.fontFamily}" font-size="11" fill="${THEME.accent.gold}" text-anchor="middle">${escapeXml(m.label)}</text>`;
    }
    currentY += 40;
  }
  
  return {
    svgContent: content,
    width: canvasWidth,
    height: currentY + margin
  };
}

// --- Comparison Renderer ---

function renderComparison(data, config) {
  const { canvasWidth = 1400, margin = 50, headerHeight = 120 } = config;
  
  let content = '';
  const columnGap = 40;
  const availableWidth = canvasWidth - (2 * margin);
  const numColumns = data.columns.length;
  const columnWidth = (availableWidth - ((numColumns - 1) * columnGap)) / numColumns;
  
  let maxY = headerHeight;
  
  data.columns.forEach((col, index) => {
    const x = margin + (index * (columnWidth + columnGap));
    const y = headerHeight + 40;
    let currentY = y;
    
    // Column Header
    content += `
    <g transform="translate(${x}, ${currentY})">
      <rect width="${columnWidth}" height="60" rx="8" fill="${THEME.surface.card}" stroke="${col.color}" stroke-width="2"/>
      <text x="${columnWidth/2}" y="35" font-family="${TYPOGRAPHY.categoryHeader.fontFamily}" 
        font-size="18" font-weight="bold" fill="${THEME.text.primary}" text-anchor="middle">
        ${escapeXml(col.icon || '')} ${escapeXml(col.name)}
      </text>
    </g>`;
    
    currentY += 80;
    
    // Items
    if (col.items) {
      col.items.forEach(item => {
        const statusColor = item.status === 'positive' ? THEME.status.active :
                           item.status === 'negative' ? THEME.status.error :
                           THEME.text.tertiary;
                           
        content += `
        <g transform="translate(${x}, ${currentY})">
          <rect width="${columnWidth}" height="50" rx="4" fill="${THEME.surface.card}" stroke="${THEME.surface.cardBorder}" stroke-width="1"/>
          
          <!-- Status indicator -->
          <rect x="0" y="0" width="4" height="50" rx="1" fill="${statusColor}"/>
          
          <text x="15" y="20" font-family="${TYPOGRAPHY.description.fontFamily}" 
            font-size="10" fill="${THEME.text.secondary}">${escapeXml(item.label)}</text>
            
          <text x="15" y="38" font-family="${TYPOGRAPHY.goalTitle.fontFamily}" 
            font-size="13" font-weight="600" fill="${THEME.text.primary}">${escapeXml(item.value)}</text>
        </g>`;
        
        currentY += 60;
      });
    }
    
    maxY = Math.max(maxY, currentY);
  });
  
  return {
    svgContent: content,
    width: canvasWidth,
    height: maxY + margin
  };
}

// --- Hierarchy Renderer ---

function renderHierarchy(data, config) {
  const { canvasWidth = 1400, margin = 50, headerHeight = 120 } = config;
  
  let content = '';
  const nodeWidth = 180;
  const nodeHeight = 80;
  const levelHeight = 120;
  
  // Calculate tree layout
  // Simple algorithm:
  // 1. Assign depth to each node
  // 2. Assign x position based on leaf count
  
  function assignMetrics(node, depth = 0) {
    node._depth = depth;
    node._width = nodeWidth;
    node._height = nodeHeight;
    
    if (!node.children || node.children.length === 0) {
      node._leafCount = 1;
    } else {
      node._leafCount = 0;
      node.children.forEach(child => {
        assignMetrics(child, depth + 1);
        node._leafCount += child._leafCount;
      });
    }
  }
  
  if (data.root) {
    assignMetrics(data.root);
    
    // Calculate positions
    const totalLeaves = data.root._leafCount;
    const availableWidth = canvasWidth - (2 * margin);
    const leafWidth = availableWidth / totalLeaves;
    
    let currentLeafIndex = 0;
    let maxY = headerHeight;
    
    function assignPositions(node) {
      // Y position based on depth
      node._y = headerHeight + 40 + (node._depth * levelHeight);
      maxY = Math.max(maxY, node._y + nodeHeight);
      
      if (!node.children || node.children.length === 0) {
        // Leaf node: center in its slot
        node._x = margin + (currentLeafIndex * leafWidth) + (leafWidth / 2) - (nodeWidth / 2);
        currentLeafIndex++;
      } else {
        // Parent node: center over children
        node.children.forEach(child => assignPositions(child));
        const firstChild = node.children[0];
        const lastChild = node.children[node.children.length - 1];
        node._x = (firstChild._x + lastChild._x) / 2;
      }
    }
    
    assignPositions(data.root);
    
    // Render edges first
    function renderEdges(node) {
      if (node.children) {
        node.children.forEach(child => {
          // Draw elbow connector
          const startX = node._x + (nodeWidth / 2);
          const startY = node._y + nodeHeight;
          const endX = child._x + (nodeWidth / 2);
          const endY = child._y;
          const midY = startY + (endY - startY) / 2;
          
          content += `<path d="M${startX},${startY} V${midY} H${endX} V${endY}" 
            fill="none" stroke="${THEME.text.tertiary}" stroke-width="1"/>`;
            
          renderEdges(child);
        });
      }
    }
    
    renderEdges(data.root);
    
    // Render nodes
    function renderNodes(node) {
      const color = node.type === 'executive' ? THEME.accent.gold :
                   node.type === 'management' ? THEME.status.planned :
                   node.type === 'lead' ? THEME.status.active :
                   THEME.surface.card;
                   
      const borderColor = node.type === 'executive' ? THEME.accent.gold : THEME.surface.cardBorder;
      const strokeWidth = node.type === 'executive' ? 2 : 1;
      
      content += `
      <g transform="translate(${node._x}, ${node._y})">
        <rect width="${nodeWidth}" height="${nodeHeight}" rx="4" 
          fill="${THEME.surface.card}" stroke="${borderColor}" stroke-width="${strokeWidth}"/>
        
        <!-- Top accent bar -->
        <rect x="0" y="0" width="${nodeWidth}" height="4" rx="1" fill="${color}"/>
        
        <text x="${nodeWidth/2}" y="30" font-family="${TYPOGRAPHY.goalTitle.fontFamily}" 
          font-size="${TYPOGRAPHY.goalTitle.fontSize}" font-weight="bold" 
          fill="${THEME.text.primary}" text-anchor="middle">${escapeXml(node.name)}</text>
          
        <text x="${nodeWidth/2}" y="50" font-family="${TYPOGRAPHY.subtitle.fontFamily}" 
          font-size="11" fill="${THEME.text.secondary}" text-anchor="middle">${escapeXml(node.role || '')}</text>
      </g>`;
      
      if (node.children) {
        node.children.forEach(child => renderNodes(child));
      }
    }
    
    renderNodes(data.root);
    
    return {
      svgContent: content,
      width: canvasWidth,
      height: maxY + margin
    };
  }
  
  return {
    svgContent: '',
    width: canvasWidth,
    height: headerHeight + margin
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SVG GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

function generateSvg(data, options = {}) {
  const config = {
    canvasWidth: options.width || 1400,
    margin: options.margin || 50,
    columnWidth: options.columnWidth || 420,
    columnGap: options.columnGap || 40,
    categoryGap: options.categoryGap || 20,
    headerHeight: options.headerHeight || 120
  };
  
  // Detect template
  let template = options.template;
  if (!template) {
    if (data.categories) template = 'goals-overview';
    else if (data.components) template = 'architecture';
    else if (data.nodes) template = 'flowchart';
    else if (data.tracks) template = 'timeline';
    else if (data.root) template = 'hierarchy';
    else if (data.columns) template = 'comparison';
    else template = 'goals-overview'; // Default
  }
  
  let result;
  switch (template) {
    case 'architecture':
      result = renderArchitecture(data, config);
      break;
    case 'flowchart':
      result = renderFlowchart(data, config);
      break;
    case 'timeline':
      result = renderTimeline(data, config);
      break;
    case 'hierarchy':
      result = renderHierarchy(data, config);
      break;
    case 'comparison':
      result = renderComparison(data, config);
      break;
    case 'goals-overview':
    default:
      result = renderGoalsOverview(data, config);
      break;
  }
  
  // Assemble SVG
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${result.width} ${result.height}">
  ${buildDefs()}
  
  <!-- Background -->
  <rect width="${result.width}" height="${result.height}" fill="${THEME.background.primary}"/>
  <rect width="${result.width}" height="${result.height}" fill="url(#bgGradient)"/>
  
  ${buildHeader(data, result.width)}
  
  <!-- Content -->
  ${result.svgContent}
</svg>`;
  
  return {
    svg,
    stats: {
      width: result.width,
      height: result.height,
      template: template
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLI INTERFACE
// ═══════════════════════════════════════════════════════════════════════════════

const TEMPLATES = {
  'goals-overview': 'Project goals with categories and progress bars',
  'architecture': 'System architecture with components and connections',
  'flowchart': 'Process flow with decisions and actions',
  'timeline': 'Roadmap/timeline with milestones',
  'hierarchy': 'Organizational chart or tree structure',
  'comparison': 'Side-by-side comparison of options'
};

function showHelp() {
  console.log(`
SVG Generator - Create professional diagrams from JSON data

Usage:
  node svg-gen.js <data.json> <output.svg>
  node svg-gen.js --template <name> --data <file> --output <file>
  node svg-gen.js --list-templates
  node svg-gen.js --validate <data.json>

Arguments:
  <data.json>        Input JSON data file
  <output.svg>       Output SVG file path

Options:
  --template <name>  Use a specific template (default: auto-detect)
  --data <file>      Input data file (alternative to positional)
  --output <file>    Output file (alternative to positional)
  --width <px>       Canvas width (default: 1400)
  --validate         Validate JSON structure without generating
  --list-templates   Show available templates
  --json             Output stats as JSON
  --help, -h         Show this help

Templates:
${Object.entries(TEMPLATES).map(([name, desc]) => `  ${name.padEnd(18)} ${desc}`).join('\n')}

Examples:
  node svg-gen.js data/goals.json docs/designs/goals.svg
  node svg-gen.js --template goals-overview --data goals.json --output diagram.svg
  node svg-gen.js --validate goals.json

See: docs/guides/SVG_CREATION_METHODOLOGY.md
`);
}

function listTemplates() {
  console.log('\nAvailable Templates:\n');
  for (const [name, desc] of Object.entries(TEMPLATES)) {
    console.log(`  ${name}`);
    console.log(`    ${desc}\n`);
  }
}

function validateData(data) {
  const issues = [];
  
  if (!data.title) {
    issues.push({ level: 'warning', message: 'Missing title' });
  }
  
  // Basic validation - could be expanded per template
  return issues;
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    showHelp();
    process.exit(0);
  }
  
  if (args.includes('--list-templates')) {
    listTemplates();
    process.exit(0);
  }
  
  // Parse arguments
  const flags = {
    json: args.includes('--json'),
    validate: args.includes('--validate')
  };
  
  let dataPath = null;
  let outputPath = null;
  let width = 1400;
  let template = null;
  
  // Parse named arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--data' && args[i + 1]) {
      dataPath = args[++i];
    } else if (args[i] === '--output' && args[i + 1]) {
      outputPath = args[++i];
    } else if (args[i] === '--width' && args[i + 1]) {
      width = parseInt(args[++i], 10);
    } else if (args[i] === '--template' && args[i + 1]) {
      template = args[++i];
    } else if (!args[i].startsWith('--') && !dataPath) {
      dataPath = args[i];
    } else if (!args[i].startsWith('--') && dataPath && !outputPath) {
      outputPath = args[i];
    }
  }
  
  if (!dataPath) {
    console.error('Error: No input data file specified');
    process.exit(1);
  }
  
  // Resolve path
  const absoluteDataPath = path.resolve(dataPath);
  if (!fs.existsSync(absoluteDataPath)) {
    console.error(`Error: File not found: ${absoluteDataPath}`);
    process.exit(1);
  }
  
  // Load and parse JSON
  let data;
  try {
    const content = fs.readFileSync(absoluteDataPath, 'utf-8');
    data = JSON.parse(content);
  } catch (e) {
    console.error(`Error parsing JSON: ${e.message}`);
    process.exit(1);
  }
  
  // Validate mode
  if (flags.validate) {
    const issues = validateData(data);
    if (flags.json) {
      console.log(JSON.stringify({ valid: issues.length === 0, issues }, null, 2));
    } else {
      console.log(`\nValidation Results: ${dataPath}\n`);
      if (issues.length === 0) {
        console.log('✅ No issues found');
      } else {
        const errors = issues.filter(i => i.level === 'error');
        const warnings = issues.filter(i => i.level === 'warning');
        if (errors.length > 0) {
          console.log(`❌ Errors (${errors.length}):`);
          errors.forEach(i => console.log(`   - ${i.message}`));
        }
        if (warnings.length > 0) {
          console.log(`⚠️  Warnings (${warnings.length}):`);
          warnings.forEach(i => console.log(`   - ${i.message}`));
        }
      }
    }
    process.exit(issues.some(i => i.level === 'error') ? 1 : 0);
  }
  
  // Generate mode
  if (!outputPath) {
    console.error('Error: No output file specified');
    process.exit(1);
  }
  
  const result = generateSvg(data, { width, template });
  
  // Write output
  const absoluteOutputPath = path.resolve(outputPath);
  fs.writeFileSync(absoluteOutputPath, result.svg);
  
  if (flags.json) {
    console.log(JSON.stringify({
      output: absoluteOutputPath,
      stats: result.stats
    }, null, 2));
  } else {
    console.log(`\n✅ Generated: ${absoluteOutputPath}`);
    console.log(`   Template: ${result.stats.template}`);
    console.log(`   Canvas: ${result.stats.width}×${result.stats.height}`);
    console.log(`\nValidate with: node tools/dev/svg-validate.js ${outputPath}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  generateSvg,
  buildDefs,
  THEME,
  TYPOGRAPHY,
  escapeXml
};
