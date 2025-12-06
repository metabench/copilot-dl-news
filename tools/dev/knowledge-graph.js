#!/usr/bin/env node
'use strict';

/**
 * knowledge-graph.js: Visualize relationships between agents, satellites, and docs
 * 
 * Generates an SVG diagram showing:
 * - Agent files (hub nodes)
 * - Satellite files (knowledge nodes)
 * - Cross-references between them
 * - Knowledge freshness indicators
 * 
 * Usage:
 *   node tools/dev/knowledge-graph.js --output docs/knowledge-graph.svg
 *   node tools/dev/knowledge-graph.js --json  # Output as JSON for further processing
 */

const fs = require('fs');
const path = require('path');

// Configuration
const AGENTS_DIR = path.join(process.cwd(), '.github', 'agents');
const GUIDES_DIR = path.join(process.cwd(), 'docs', 'guides');
const AGENTS_MD = path.join(process.cwd(), 'AGENTS.md');

// Colors for different node types
const COLORS = {
  agentHub: '#4CAF50',      // Green for agent files
  satellite: '#2196F3',      // Blue for satellite guides
  coreDoc: '#FF9800',        // Orange for AGENTS.md
  stale: '#F44336',          // Red for stale docs
  warning: '#FFC107',        // Yellow for docs needing attention
  fresh: '#8BC34A',          // Light green for fresh docs
  link: '#9E9E9E',           // Gray for links
  linkStrong: '#3F51B5'      // Indigo for strong links (multiple refs)
};

// Freshness thresholds (days)
const FRESHNESS = {
  fresh: 30,      // Updated within 30 days
  warning: 60,    // 30-60 days
  stale: 90       // >60 days
};

/**
 * Parse a markdown file for metadata and references
 */
function parseDocument(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const stats = fs.statSync(filePath);
    
    // Extract title (first # heading)
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].replace(/[🧠💡]/g, '').trim() : path.basename(filePath);
    
    // Extract "Last updated" date
    const lastUpdatedMatch = content.match(/_Last updated:\s*(\d{4}-\d{2}-\d{2})_/i);
    const lastUpdated = lastUpdatedMatch ? new Date(lastUpdatedMatch[1]) : stats.mtime;
    
    // Extract "Last Verified" date (for knowledge validation)
    const lastVerifiedMatch = content.match(/Last Verified[:\s]*(\d{4}-\d{2}-\d{2})/i);
    const lastVerified = lastVerifiedMatch ? new Date(lastVerifiedMatch[1]) : null;
    
    // Find references to other docs
    const references = [];
    const linkRegex = /\[([^\]]+)\]\(([^)]+\.md[^)]*)\)/g;
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
      references.push({
        text: match[1],
        url: match[2].split('#')[0],  // Remove anchors
        line: content.substring(0, match.index).split('\n').length
      });
    }
    
    // Find satellite file references in tables
    const satelliteRefs = [];
    const tableRowRegex = /\|\s*\*\*([^|]+)\*\*\s*\|\s*`([^`]+)`/g;
    while ((match = tableRowRegex.exec(content)) !== null) {
      satelliteRefs.push({
        domain: match[1].trim(),
        path: match[2].trim()
      });
    }
    
    // Calculate freshness
    const daysSinceUpdate = Math.floor((Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24));
    const daysSinceVerified = lastVerified 
      ? Math.floor((Date.now() - lastVerified.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    
    let freshnessStatus = 'fresh';
    if (daysSinceUpdate > FRESHNESS.stale) freshnessStatus = 'stale';
    else if (daysSinceUpdate > FRESHNESS.warning) freshnessStatus = 'warning';
    
    return {
      filePath,
      relativePath: path.relative(process.cwd(), filePath),
      title,
      lastUpdated,
      lastVerified,
      daysSinceUpdate,
      daysSinceVerified,
      freshnessStatus,
      references,
      satelliteRefs,
      lineCount: content.split('\n').length
    };
  } catch (error) {
    console.error(`Error parsing ${filePath}: ${error.message}`);
    return null;
  }
}

/**
 * Discover all knowledge documents
 */
function discoverDocuments() {
  const documents = {
    agents: [],
    satellites: [],
    core: null
  };
  
  // Find agent files
  if (fs.existsSync(AGENTS_DIR)) {
    const agentFiles = fs.readdirSync(AGENTS_DIR)
      .filter(f => f.endsWith('.md') || f.endsWith('.agent.md'))
      .map(f => path.join(AGENTS_DIR, f));
    
    documents.agents = agentFiles.map(parseDocument).filter(Boolean);
  }
  
  // Find satellite guides
  if (fs.existsSync(GUIDES_DIR)) {
    const guideFiles = fs.readdirSync(GUIDES_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(GUIDES_DIR, f));
    
    documents.satellites = guideFiles.map(parseDocument).filter(Boolean);
  }
  
  // Parse core AGENTS.md
  if (fs.existsSync(AGENTS_MD)) {
    documents.core = parseDocument(AGENTS_MD);
  }
  
  return documents;
}

/**
 * Build graph edges from document references
 */
function buildEdges(documents) {
  const edges = [];
  const allDocs = [...documents.agents, ...documents.satellites];
  if (documents.core) allDocs.push(documents.core);
  
  // Create a map for quick lookup
  const docMap = new Map();
  for (const doc of allDocs) {
    // Index by various path forms
    docMap.set(doc.relativePath, doc);
    docMap.set(path.basename(doc.filePath), doc);
    docMap.set(doc.filePath, doc);
  }
  
  // Find edges based on references
  for (const doc of allDocs) {
    for (const ref of doc.references) {
      // Try to resolve the reference
      let target = null;
      const refPath = ref.url.replace(/^\.\.\//, '').replace(/^\.\//, '');
      
      // Try different resolution strategies
      target = docMap.get(refPath) || 
               docMap.get(path.basename(refPath)) ||
               docMap.get(`docs/guides/${path.basename(refPath)}`);
      
      if (target && target !== doc) {
        // Check if edge already exists
        const existingEdge = edges.find(e => 
          e.from === doc.relativePath && e.to === target.relativePath
        );
        
        if (existingEdge) {
          existingEdge.weight++;
        } else {
          edges.push({
            from: doc.relativePath,
            to: target.relativePath,
            weight: 1
          });
        }
      }
    }
    
    // Also check satellite refs from tables
    for (const satRef of doc.satelliteRefs) {
      const target = docMap.get(satRef.path) || docMap.get(path.basename(satRef.path));
      if (target && target !== doc) {
        const existingEdge = edges.find(e => 
          e.from === doc.relativePath && e.to === target.relativePath
        );
        
        if (existingEdge) {
          existingEdge.weight++;
        } else {
          edges.push({
            from: doc.relativePath,
            to: target.relativePath,
            weight: 1,
            domain: satRef.domain
          });
        }
      }
    }
  }
  
  return edges;
}

/**
 * Generate SVG visualization
 */
function generateSVG(documents, edges) {
  const width = 1200;
  const height = 800;
  const padding = 60;
  
  // Calculate node positions using a simple force-directed layout simulation
  const nodes = [];
  
  // Core AGENTS.md at center-top
  if (documents.core) {
    nodes.push({
      ...documents.core,
      x: width / 2,
      y: padding + 40,
      type: 'core',
      radius: 30
    });
  }
  
  // Agents in a row below core
  const agentY = 180;
  const agentSpacing = width / (documents.agents.length + 1);
  documents.agents.forEach((agent, i) => {
    nodes.push({
      ...agent,
      x: agentSpacing * (i + 1),
      y: agentY,
      type: 'agent',
      radius: 25
    });
  });
  
  // Satellites in rows at bottom
  const satelliteStartY = 350;
  const satelliteRowHeight = 100;
  const satellitesPerRow = 4;
  documents.satellites.forEach((sat, i) => {
    const row = Math.floor(i / satellitesPerRow);
    const col = i % satellitesPerRow;
    const rowWidth = Math.min(documents.satellites.length - row * satellitesPerRow, satellitesPerRow);
    const spacing = width / (rowWidth + 1);
    
    nodes.push({
      ...sat,
      x: spacing * (col + 1),
      y: satelliteStartY + row * satelliteRowHeight,
      type: 'satellite',
      radius: 20
    });
  });
  
  // Create node lookup
  const nodeMap = new Map();
  nodes.forEach(n => nodeMap.set(n.relativePath, n));
  
  // Build SVG
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="${COLORS.link}" />
    </marker>
    <marker id="arrowhead-strong" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="${COLORS.linkStrong}" />
    </marker>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="2" dy="2" stdDeviation="3" flood-opacity="0.3"/>
    </filter>
  </defs>
  
  <style>
    .title { font: bold 24px sans-serif; fill: #333; }
    .subtitle { font: 14px sans-serif; fill: #666; }
    .node-label { font: bold 11px sans-serif; fill: #333; text-anchor: middle; }
    .node-sublabel { font: 10px sans-serif; fill: #666; text-anchor: middle; }
    .legend-text { font: 12px sans-serif; fill: #333; }
    .freshness-badge { font: bold 9px sans-serif; fill: white; text-anchor: middle; }
  </style>
  
  <!-- Background -->
  <rect width="${width}" height="${height}" fill="#f8f9fa"/>
  
  <!-- Title -->
  <text x="${width/2}" y="30" class="title" text-anchor="middle">Knowledge Graph</text>
  <text x="${width/2}" y="50" class="subtitle" text-anchor="middle">Agent → Satellite Documentation Relationships</text>
  
  <!-- Legend -->
  <g transform="translate(${width - 180}, 70)">
    <text x="0" y="0" class="legend-text" font-weight="bold">Legend</text>
    <circle cx="10" cy="20" r="8" fill="${COLORS.coreDoc}"/>
    <text x="25" y="24" class="legend-text">Core (AGENTS.md)</text>
    <circle cx="10" cy="45" r="8" fill="${COLORS.agentHub}"/>
    <text x="25" y="49" class="legend-text">Agent Files</text>
    <circle cx="10" cy="70" r="8" fill="${COLORS.satellite}"/>
    <text x="25" y="74" class="legend-text">Satellite Guides</text>
    <rect x="2" y="90" width="16" height="10" fill="${COLORS.fresh}" rx="2"/>
    <text x="25" y="99" class="legend-text">Fresh (&lt;30d)</text>
    <rect x="2" y="110" width="16" height="10" fill="${COLORS.warning}" rx="2"/>
    <text x="25" y="119" class="legend-text">Aging (30-60d)</text>
    <rect x="2" y="130" width="16" height="10" fill="${COLORS.stale}" rx="2"/>
    <text x="25" y="139" class="legend-text">Stale (&gt;60d)</text>
  </g>
`;

  // Draw edges
  svg += '\n  <!-- Edges -->\n  <g class="edges">\n';
  for (const edge of edges) {
    const fromNode = nodeMap.get(edge.from);
    const toNode = nodeMap.get(edge.to);
    
    if (fromNode && toNode) {
      const isStrong = edge.weight > 1;
      const color = isStrong ? COLORS.linkStrong : COLORS.link;
      const strokeWidth = Math.min(1 + edge.weight * 0.5, 4);
      const marker = isStrong ? 'url(#arrowhead-strong)' : 'url(#arrowhead)';
      
      // Calculate edge endpoints (from node edge, not center)
      const dx = toNode.x - fromNode.x;
      const dy = toNode.y - fromNode.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const nx = dx / dist;
      const ny = dy / dist;
      
      const x1 = fromNode.x + nx * fromNode.radius;
      const y1 = fromNode.y + ny * fromNode.radius;
      const x2 = toNode.x - nx * (toNode.radius + 5);
      const y2 = toNode.y - ny * (toNode.radius + 5);
      
      // Draw curved path for better visibility
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const curvature = 0.1;
      const ctrlX = midX - (y2 - y1) * curvature;
      const ctrlY = midY + (x2 - x1) * curvature;
      
      svg += `    <path d="M${x1},${y1} Q${ctrlX},${ctrlY} ${x2},${y2}" 
              fill="none" stroke="${color}" stroke-width="${strokeWidth}" 
              marker-end="${marker}" opacity="0.6"/>\n`;
    }
  }
  svg += '  </g>\n';
  
  // Draw nodes
  svg += '\n  <!-- Nodes -->\n  <g class="nodes">\n';
  for (const node of nodes) {
    let fillColor;
    switch (node.type) {
      case 'core': fillColor = COLORS.coreDoc; break;
      case 'agent': fillColor = COLORS.agentHub; break;
      default: fillColor = COLORS.satellite;
    }
    
    // Freshness badge color
    let badgeColor;
    switch (node.freshnessStatus) {
      case 'stale': badgeColor = COLORS.stale; break;
      case 'warning': badgeColor = COLORS.warning; break;
      default: badgeColor = COLORS.fresh;
    }
    
    // Truncate title for display
    const displayTitle = node.title.length > 25 
      ? node.title.substring(0, 22) + '...' 
      : node.title;
    
    svg += `    <g transform="translate(${node.x}, ${node.y})">
      <circle r="${node.radius}" fill="${fillColor}" filter="url(#shadow)" stroke="white" stroke-width="2"/>
      <text y="${node.radius + 15}" class="node-label">${escapeXml(displayTitle)}</text>
      <text y="${node.radius + 28}" class="node-sublabel">${node.daysSinceUpdate}d ago</text>
      <rect x="${node.radius - 8}" y="-${node.radius + 2}" width="16" height="12" rx="3" fill="${badgeColor}"/>
      <text x="${node.radius}" y="-${node.radius - 6}" class="freshness-badge">${node.daysSinceUpdate}d</text>
    </g>\n`;
  }
  svg += '  </g>\n';
  
  // Add timestamp
  const now = new Date().toISOString().split('T')[0];
  svg += `\n  <text x="10" y="${height - 10}" class="subtitle">Generated: ${now}</text>\n`;
  
  svg += '</svg>';
  
  return svg;
}

/**
 * Escape XML special characters
 */
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate JSON output
 */
function generateJSON(documents, edges) {
  return {
    generated: new Date().toISOString(),
    summary: {
      totalAgents: documents.agents.length,
      totalSatellites: documents.satellites.length,
      totalEdges: edges.length,
      staleDocuments: [...documents.agents, ...documents.satellites]
        .filter(d => d.freshnessStatus === 'stale').length,
      warningDocuments: [...documents.agents, ...documents.satellites]
        .filter(d => d.freshnessStatus === 'warning').length
    },
    nodes: {
      core: documents.core ? {
        path: documents.core.relativePath,
        title: documents.core.title,
        daysSinceUpdate: documents.core.daysSinceUpdate,
        freshnessStatus: documents.core.freshnessStatus
      } : null,
      agents: documents.agents.map(d => ({
        path: d.relativePath,
        title: d.title,
        daysSinceUpdate: d.daysSinceUpdate,
        freshnessStatus: d.freshnessStatus,
        satelliteCount: d.satelliteRefs.length
      })),
      satellites: documents.satellites.map(d => ({
        path: d.relativePath,
        title: d.title,
        daysSinceUpdate: d.daysSinceUpdate,
        daysSinceVerified: d.daysSinceVerified,
        freshnessStatus: d.freshnessStatus,
        lineCount: d.lineCount
      }))
    },
    edges: edges.map(e => ({
      from: e.from,
      to: e.to,
      weight: e.weight,
      domain: e.domain || null
    }))
  };
}

/**
 * Print freshness report to console
 */
function printFreshnessReport(documents) {
  console.log('\n📊 Knowledge Freshness Report\n');
  console.log('═'.repeat(60));
  
  const allDocs = [...documents.agents, ...documents.satellites];
  if (documents.core) allDocs.push(documents.core);
  
  // Sort by staleness
  allDocs.sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);
  
  const stale = allDocs.filter(d => d.freshnessStatus === 'stale');
  const warning = allDocs.filter(d => d.freshnessStatus === 'warning');
  const fresh = allDocs.filter(d => d.freshnessStatus === 'fresh');
  
  if (stale.length > 0) {
    console.log('\n🔴 STALE (>60 days) - Need verification:\n');
    for (const doc of stale) {
      console.log(`   ${doc.title}`);
      console.log(`   └─ ${doc.relativePath} (${doc.daysSinceUpdate} days)`);
    }
  }
  
  if (warning.length > 0) {
    console.log('\n🟡 AGING (30-60 days) - Consider reviewing:\n');
    for (const doc of warning) {
      console.log(`   ${doc.title}`);
      console.log(`   └─ ${doc.relativePath} (${doc.daysSinceUpdate} days)`);
    }
  }
  
  console.log('\n🟢 FRESH (<30 days):', fresh.length, 'documents');
  
  console.log('\n' + '═'.repeat(60));
  console.log(`Total: ${allDocs.length} documents | Stale: ${stale.length} | Warning: ${warning.length} | Fresh: ${fresh.length}`);
  console.log('═'.repeat(60) + '\n');
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf('--output');
  const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : null;
  const jsonOutput = args.includes('--json');
  const reportOnly = args.includes('--report');
  
  console.log('🔍 Discovering knowledge documents...');
  const documents = discoverDocuments();
  
  console.log(`   Found ${documents.agents.length} agents, ${documents.satellites.length} satellites`);
  
  console.log('🔗 Building relationship graph...');
  const edges = buildEdges(documents);
  console.log(`   Found ${edges.length} cross-references`);
  
  // Always print freshness report
  printFreshnessReport(documents);
  
  if (reportOnly) {
    return;
  }
  
  if (jsonOutput) {
    const json = generateJSON(documents, edges);
    console.log(JSON.stringify(json, null, 2));
    return;
  }
  
  console.log('🎨 Generating SVG visualization...');
  const svg = generateSVG(documents, edges);
  
  if (outputPath) {
    const fullPath = path.resolve(outputPath);
    fs.writeFileSync(fullPath, svg);
    console.log(`✅ Knowledge graph saved to: ${fullPath}`);
  } else {
    // Default output location
    const defaultPath = path.join(process.cwd(), 'docs', 'knowledge-graph.svg');
    fs.writeFileSync(defaultPath, svg);
    console.log(`✅ Knowledge graph saved to: ${defaultPath}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  discoverDocuments,
  buildEdges,
  generateSVG,
  generateJSON,
  parseDocument
};
