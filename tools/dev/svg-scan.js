#!/usr/bin/env node
/**
 * svg-scan.js — SVG Element Discovery & Query Tool
 * 
 * Scans SVG files for elements matching specific criteria (colors, types, patterns).
 * Designed for analyzing road networks, bridge positions, and other structural elements.
 * 
 * Usage:
 *   node tools/dev/svg-scan.js <file.svg> --roads              # Find all road paths
 *   node tools/dev/svg-scan.js <file.svg> --bridges            # Find bridge groups
 *   node tools/dev/svg-scan.js <file.svg> --query "stroke=#9a5519"  # Custom query
 *   node tools/dev/svg-scan.js <file.svg> --elements path      # List all paths
 *   node tools/dev/svg-scan.js <file.svg> --json               # JSON output
 */

const fs = require('fs');
const path = require('path');

// Road-like stroke colors (brown/tan shades used for roads)
const ROAD_COLORS = [
  '#9a5519', '#7a5a30', '#6a4a20', '#5c3310', '#8a7a5a',
  '#7d5e4e', '#6d5040', '#8b7355'
];

// Parse command line
const args = process.argv.slice(2);
const flags = {
  roads: args.includes('--roads'),
  bridges: args.includes('--bridges'),
  json: args.includes('--json'),
  help: args.includes('--help') || args.includes('-h'),
  verbose: args.includes('--verbose') || args.includes('-v'),
};

const queryIdx = args.indexOf('--query');
const query = queryIdx !== -1 ? args[queryIdx + 1] : null;

const elemIdx = args.indexOf('--elements');
const elemType = elemIdx !== -1 ? args[elemIdx + 1] : null;

const file = args.find(a => a.endsWith('.svg'));

if (flags.help || !file) {
  console.log(`
svg-scan.js — SVG Element Discovery & Query Tool

Usage:
  node tools/dev/svg-scan.js <file.svg> [options]

Options:
  --roads           Find all road paths (by stroke color)
  --bridges         Find bridge groups (by comment/id patterns)
  --elements <tag>  List all elements of a type (path, rect, g, etc.)
  --query <expr>    Custom attribute query (e.g., "stroke=#9a5519")
  --json            Output as JSON
  --verbose, -v     Show more detail
  --help, -h        Show this help

Examples:
  node tools/dev/svg-scan.js map.svg --roads
  node tools/dev/svg-scan.js map.svg --elements path --json
  node tools/dev/svg-scan.js map.svg --query "fill=#7d5e4e"
`);
  process.exit(0);
}

if (!fs.existsSync(file)) {
  console.error(`Error: File not found: ${file}`);
  process.exit(1);
}

const content = fs.readFileSync(file, 'utf8');

/**
 * Extract path data with context (preceding comment if any)
 */
function extractPaths(svg) {
  const results = [];
  // Match paths with their attributes
  const pathRegex = /<path\s+([^>]+)\/?\s*>/g;
  let match;
  
  while ((match = pathRegex.exec(svg)) !== null) {
    const attrs = match[1];
    const fullMatch = match[0];
    const position = match.index;
    
    // Look for preceding comment (within 200 chars before)
    const before = svg.substring(Math.max(0, position - 300), position);
    const commentMatch = before.match(/<!--\s*([^>]+)\s*-->\s*$/);
    const comment = commentMatch ? commentMatch[1].trim() : null;
    
    // Parse attributes
    const attrMap = {};
    const attrRegex = /(\w+(?:-\w+)*)="([^"]*)"/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attrs)) !== null) {
      attrMap[attrMatch[1]] = attrMatch[2];
    }
    
    // Extract path coordinates
    const d = attrMap.d || '';
    const startMatch = d.match(/M\s*([\d.-]+)[,\s]+([\d.-]+)/);
    const endMatch = d.match(/([\d.-]+)[,\s]+([\d.-]+)\s*$/);
    
    results.push({
      type: 'path',
      position,
      comment,
      attrs: attrMap,
      start: startMatch ? { x: parseFloat(startMatch[1]), y: parseFloat(startMatch[2]) } : null,
      end: endMatch ? { x: parseFloat(endMatch[1]), y: parseFloat(endMatch[2]) } : null,
      raw: fullMatch.substring(0, 100) + (fullMatch.length > 100 ? '...' : '')
    });
  }
  
  return results;
}

/**
 * Find roads by stroke color
 */
function findRoads(paths) {
  return paths.filter(p => {
    const stroke = (p.attrs.stroke || '').toLowerCase();
    return ROAD_COLORS.some(c => c.toLowerCase() === stroke);
  }).map((p, idx) => ({
    index: idx,
    comment: p.comment,
    stroke: p.attrs.stroke,
    strokeWidth: p.attrs['stroke-width'],
    dashArray: p.attrs['stroke-dasharray'],
    start: p.start,
    end: p.end,
    d: p.attrs.d
  }));
}

/**
 * Find bridge groups by comment patterns
 */
function findBridges(svg) {
  const results = [];
  const bridgeRegex = /<!--\s*([^>]*bridge[^>]*)\s*-->\s*<g\s+transform="translate\(([^)]+)\)"/gi;
  let match;
  
  while ((match = bridgeRegex.exec(svg)) !== null) {
    const [full, comment, translate] = match;
    const [x, y] = translate.split(',').map(s => parseFloat(s.trim()));
    results.push({
      comment: comment.trim(),
      translate: { x, y },
      position: match.index
    });
  }
  
  return results;
}

/**
 * Find elements by tag name
 */
function findElements(svg, tagName) {
  const results = [];
  const regex = new RegExp(`<${tagName}\\s+([^>]*)>`, 'g');
  let match;
  
  while ((match = regex.exec(svg)) !== null) {
    const attrs = match[1];
    const attrMap = {};
    const attrRegex = /(\w+(?:-\w+)*)="([^"]*)"/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attrs)) !== null) {
      attrMap[attrMatch[1]] = attrMatch[2];
    }
    
    results.push({
      type: tagName,
      position: match.index,
      attrs: attrMap
    });
  }
  
  return results;
}

/**
 * Query by attribute
 */
function queryByAttribute(paths, queryStr) {
  const [key, value] = queryStr.split('=');
  return paths.filter(p => {
    const attrVal = (p.attrs[key] || '').toLowerCase();
    return attrVal === value.toLowerCase();
  });
}

// Main execution
const paths = extractPaths(content);

if (flags.roads) {
  const roads = findRoads(paths);
  
  if (flags.json) {
    console.log(JSON.stringify({ roads, count: roads.length }, null, 2));
  } else {
    console.log(`\n═══════════════════════════════════════════════════════════════`);
    console.log(`Road Network Analysis: ${path.basename(file)}`);
    console.log(`═══════════════════════════════════════════════════════════════\n`);
    console.log(`Found ${roads.length} road paths:\n`);
    
    roads.forEach((r, i) => {
      const startStr = r.start ? `(${r.start.x}, ${r.start.y})` : '?';
      const endStr = r.end ? `(${r.end.x}, ${r.end.y})` : '?';
      const comment = r.comment ? `  // ${r.comment.substring(0, 40)}` : '';
      console.log(`[${String(i).padStart(2)}] ${r.stroke} w=${r.strokeWidth || '?'} | ${startStr} → ${endStr}${comment}`);
    });
    
    // Group by approximate endpoints to find duplicates
    console.log(`\n─────────────────────────────────────────────────────────────────`);
    console.log(`Potential Duplicates (roads with similar start/end points):`);
    console.log(`─────────────────────────────────────────────────────────────────\n`);
    
    const tolerance = 15; // pixels
    const groups = [];
    const used = new Set();
    
    for (let i = 0; i < roads.length; i++) {
      if (used.has(i)) continue;
      const group = [i];
      used.add(i);
      
      for (let j = i + 1; j < roads.length; j++) {
        if (used.has(j)) continue;
        const ri = roads[i], rj = roads[j];
        if (!ri.start || !rj.start || !ri.end || !rj.end) continue;
        
        const startDist = Math.hypot(ri.start.x - rj.start.x, ri.start.y - rj.start.y);
        const endDist = Math.hypot(ri.end.x - rj.end.x, ri.end.y - rj.end.y);
        
        if (startDist < tolerance && endDist < tolerance) {
          group.push(j);
          used.add(j);
        }
      }
      
      if (group.length > 1) {
        groups.push(group);
      }
    }
    
    if (groups.length === 0) {
      console.log('  No duplicate roads detected.\n');
    } else {
      groups.forEach((g, idx) => {
        console.log(`  Group ${idx + 1}: Indices [${g.join(', ')}]`);
        g.forEach(i => {
          const r = roads[i];
          console.log(`    [${i}] ${r.stroke} w=${r.strokeWidth} ${r.dashArray ? 'dashed' : 'solid'}`);
        });
        console.log('');
      });
    }
  }
  
} else if (flags.bridges) {
  const bridges = findBridges(content);
  
  if (flags.json) {
    console.log(JSON.stringify({ bridges, count: bridges.length }, null, 2));
  } else {
    console.log(`\nFound ${bridges.length} bridges:\n`);
    bridges.forEach((b, i) => {
      console.log(`[${i}] translate(${b.translate.x}, ${b.translate.y}) — ${b.comment}`);
    });
  }
  
} else if (elemType) {
  const elements = findElements(content, elemType);
  
  if (flags.json) {
    console.log(JSON.stringify({ elements, count: elements.length }, null, 2));
  } else {
    console.log(`\nFound ${elements.length} <${elemType}> elements`);
    if (flags.verbose) {
      elements.slice(0, 50).forEach((e, i) => {
        console.log(`[${i}] ${JSON.stringify(e.attrs).substring(0, 80)}`);
      });
      if (elements.length > 50) {
        console.log(`... and ${elements.length - 50} more`);
      }
    }
  }
  
} else if (query) {
  const matches = queryByAttribute(paths, query);
  
  if (flags.json) {
    console.log(JSON.stringify({ matches, count: matches.length }, null, 2));
  } else {
    console.log(`\nFound ${matches.length} paths matching "${query}"`);
  }
  
} else {
  console.log('No operation specified. Use --roads, --bridges, --elements, or --query.');
  console.log('Run with --help for usage information.');
}
