#!/usr/bin/env node
"use strict";

/**
 * svg-compile.js - Merge tech-tree SVG components with WLILO styling
 * 
 * Usage: node tools/dev/svg-compile.js --dir docs/diagrams/tech-tree --out docs/diagrams/tech-tree-compiled.svg
 */

const fs = require("fs");
const path = require("path");

const WLILO_DEFS = `
  <defs>
    <!-- WLILO Leather Background -->
    <linearGradient id="leather-bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#faf9f7"/>
      <stop offset="50%" style="stop-color:#f5f3ef"/>
      <stop offset="100%" style="stop-color:#ebe8e2"/>
    </linearGradient>
    
    <!-- Obsidian Panel -->
    <linearGradient id="obsidian" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#2d2d2d"/>
      <stop offset="100%" style="stop-color:#1a1a1a"/>
    </linearGradient>
    
    <!-- Obsidian Inner (lighter) -->
    <linearGradient id="obsidian-inner" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#3a3a3a"/>
      <stop offset="100%" style="stop-color:#252525"/>
    </linearGradient>
    
    <!-- Gold Accent -->
    <linearGradient id="gold-accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#c9a962"/>
      <stop offset="100%" style="stop-color:#e8d5a3"/>
    </linearGradient>
    
    <!-- Status: Complete (Emerald) -->
    <linearGradient id="status-complete" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#34d399"/>
      <stop offset="100%" style="stop-color:#059669"/>
    </linearGradient>
    
    <!-- Status: In Progress (Sapphire) -->
    <linearGradient id="status-progress" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#60a5fa"/>
      <stop offset="100%" style="stop-color:#2563eb"/>
    </linearGradient>
    
    <!-- Status: Planned (Amethyst) -->
    <linearGradient id="status-planned" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#a78bfa"/>
      <stop offset="100%" style="stop-color:#7c3aed"/>
    </linearGradient>
    
    <!-- Status: Research (Topaz) -->
    <linearGradient id="status-research" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#fbbf24"/>
      <stop offset="100%" style="stop-color:#d97706"/>
    </linearGradient>
    
    <!-- Drop Shadow -->
    <filter id="drop-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="2" dy="4" stdDeviation="4" flood-color="#000" flood-opacity="0.35"/>
    </filter>
    
    <!-- Inner Card Shadow -->
    <filter id="card-shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="1" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.4"/>
    </filter>
    
    <!-- Gold Glow -->
    <filter id="gold-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="blur"/>
      <feFlood flood-color="#c9a962" flood-opacity="0.5"/>
      <feComposite in2="blur" operator="in"/>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    
    <!-- Emerald Glow -->
    <filter id="emerald-glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur"/>
      <feFlood flood-color="#10b981" flood-opacity="0.35"/>
      <feComposite in2="blur" operator="in"/>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    
    <!-- Subtle Texture -->
    <pattern id="leather-texture" patternUnits="userSpaceOnUse" width="100" height="100">
      <rect width="100" height="100" fill="url(#leather-bg)"/>
      <circle cx="25" cy="25" r="1" fill="#00000006"/>
      <circle cx="75" cy="75" r="1" fill="#00000006"/>
      <circle cx="50" cy="50" r="0.5" fill="#00000004"/>
      <circle cx="10" cy="60" r="0.8" fill="#00000005"/>
      <circle cx="90" cy="30" r="0.6" fill="#00000005"/>
    </pattern>
    
    <!-- Grid Pattern for Obsidian -->
    <pattern id="obsidian-grid" patternUnits="userSpaceOnUse" width="20" height="20">
      <rect width="20" height="20" fill="transparent"/>
      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#ffffff08" stroke-width="0.5"/>
    </pattern>
  </defs>
`;

const WLILO_STYLES = `
  <style>
    /* Base Typography */
    text { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; }
    
    /* Title Styling */
    .title { 
      font-size: 42px; 
      font-weight: 300; 
      fill: #1a1a1a; 
      letter-spacing: 2px;
    }
    .subtitle { 
      font-size: 18px; 
      fill: #666; 
      font-weight: 300;
      letter-spacing: 1px;
    }
    
    /* Panel Styling */
    .wlilo-bg { fill: url(#leather-texture); }
    .obsidian-panel { 
      fill: url(#obsidian); 
      stroke: url(#gold-accent); 
      stroke-width: 1.5; 
      filter: url(#drop-shadow); 
    }
    .obsidian-inner {
      fill: url(#obsidian-inner);
      stroke: #444;
      stroke-width: 0.5;
    }
    
    /* Gold Elements */
    .gold-header { fill: #c9a962; font-family: Georgia, serif; filter: url(#gold-glow); }
    .gold-bar { fill: url(#gold-accent); }
    .gold-text { fill: url(#gold-accent); }
    
    /* Body Text */
    .body-text { fill: #2d2d2d; font-family: Arial, sans-serif; }
    .muted-text { fill: #666; font-family: Arial, sans-serif; }
    .light-text { fill: #f0ede8; }
    
    /* Status Badges */
    .status-complete { fill: url(#status-complete); filter: url(#emerald-glow); }
    .status-progress { fill: url(#status-progress); }
    .status-planned { fill: url(#status-planned); }
    .status-research { fill: url(#status-research); }
  </style>
`;

/**
 * Transform raw SVG content to use WLILO styling
 */
function applyWliloTransforms(content) {
  // Transform status fills to use gradients
  content = content.replace(/fill="#10b981"/gi, 'fill="url(#status-complete)"');
  content = content.replace(/fill="#34d399"/gi, 'fill="url(#status-complete)"');
  content = content.replace(/fill="#059669"/gi, 'fill="url(#status-complete)"');
  content = content.replace(/fill="#22c55e"/gi, 'fill="url(#status-complete)"');
  
  content = content.replace(/fill="#3b82f6"/gi, 'fill="url(#status-progress)"');
  content = content.replace(/fill="#60a5fa"/gi, 'fill="url(#status-progress)"');
  content = content.replace(/fill="#2563eb"/gi, 'fill="url(#status-progress)"');
  
  content = content.replace(/fill="#a855f7"/gi, 'fill="url(#status-planned)"');
  content = content.replace(/fill="#8b5cf6"/gi, 'fill="url(#status-planned)"');
  content = content.replace(/fill="#7c3aed"/gi, 'fill="url(#status-planned)"');
  
  content = content.replace(/fill="#f59e0b"/gi, 'fill="url(#status-research)"');
  content = content.replace(/fill="#eab308"/gi, 'fill="url(#status-research)"');
  content = content.replace(/fill="#fbbf24"/gi, 'fill="url(#status-research)"');
  
  // Transform panel backgrounds to obsidian
  content = content.replace(/fill="#2d2d2d"/gi, 'fill="url(#obsidian)"');
  content = content.replace(/fill="#333333"/gi, 'fill="url(#obsidian)"');
  content = content.replace(/fill="#333"/gi, 'fill="url(#obsidian)"');
  
  // Inner cards to obsidian-inner
  content = content.replace(/fill="#3a3a3a"/gi, 'fill="url(#obsidian-inner)"');
  content = content.replace(/fill="#404040"/gi, 'fill="url(#obsidian-inner)"');
  content = content.replace(/fill="#444"/gi, 'fill="url(#obsidian-inner)"');
  
  // Transform gold colors
  content = content.replace(/fill="#c9a962"/gi, 'fill="url(#gold-accent)"');
  content = content.replace(/fill="#d4af37"/gi, 'fill="url(#gold-accent)"');
  
  // Brighten text on dark backgrounds
  content = content.replace(/fill="#e5e5e5"/gi, 'fill="#f0ede8"');
  content = content.replace(/fill="#cccccc"/gi, 'fill="#d0ccc5"');
  content = content.replace(/fill="#ccc"/gi, 'fill="#d0ccc5"');
  
  return content;
}

function extractContent(svgContent) {
  // Extract viewBox dimensions
  const vbMatch = svgContent.match(/viewBox="([^"]+)"/);
  const viewBox = vbMatch ? vbMatch[1].split(" ").map(Number) : [0, 0, 400, 400];
  
  // Extract inner content (everything between first <g> and last </g>)
  const innerMatch = svgContent.match(/<g[^>]*>([\s\S]*)<\/g>/);
  let inner = innerMatch ? innerMatch[0] : "";
  
  // Apply WLILO transforms to the inner content
  inner = applyWliloTransforms(inner);
  
  return { viewBox, inner };
}

function compile(inputDir, outputFile) {
  const files = fs.readdirSync(inputDir)
    .filter(f => f.endsWith(".svg") && f.match(/^\d{2}-/))
    .sort();
  
  if (files.length === 0) {
    console.error("No component SVGs found in", inputDir);
    process.exit(1);
  }
  
  console.log(`Found ${files.length} component files`);
  
  // Layout configuration
  const CANVAS_WIDTH = 1600;
  const MARGIN = 40;
  const COL_GAP = 30;
  const ROW_GAP = 25;
  const HEADER_HEIGHT = 220;
  
  // Parse all components
  const components = files.map(f => {
    const content = fs.readFileSync(path.join(inputDir, f), "utf8");
    const parsed = extractContent(content);
    return { file: f, ...parsed };
  });
  
  // Header is first, rest go into 3-column layout
  const header = components[0];
  const panels = components.slice(1);
  
  // Calculate 3-column layout
  const COL_WIDTH = Math.floor((CANVAS_WIDTH - 2 * MARGIN - 2 * COL_GAP) / 3);
  const colHeights = [HEADER_HEIGHT + MARGIN, HEADER_HEIGHT + MARGIN, HEADER_HEIGHT + MARGIN];
  
  const placements = [];
  
  for (const panel of panels) {
    // Find shortest column
    const shortestIdx = colHeights.indexOf(Math.min(...colHeights));
    const x = MARGIN + shortestIdx * (COL_WIDTH + COL_GAP);
    const y = colHeights[shortestIdx];
    
    // Scale factor to fit column width
    const origWidth = panel.viewBox[2];
    const origHeight = panel.viewBox[3];
    const scale = COL_WIDTH / origWidth;
    const scaledHeight = origHeight * scale;
    
    placements.push({
      ...panel,
      x,
      y,
      scale,
      scaledWidth: COL_WIDTH,
      scaledHeight
    });
    
    colHeights[shortestIdx] += scaledHeight + ROW_GAP;
  }
  
  const totalHeight = Math.max(...colHeights) + MARGIN;
  
  // Build output SVG
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_WIDTH} ${totalHeight}" width="${CANVAS_WIDTH}" height="${totalHeight}">
${WLILO_DEFS}
${WLILO_STYLES}

  <!-- WLILO Leather Background -->
  <rect class="wlilo-bg" width="100%" height="100%"/>
  
  <!-- Outer Gold Frame -->
  <rect x="15" y="15" width="${CANVAS_WIDTH - 30}" height="${totalHeight - 30}" 
        fill="none" stroke="url(#gold-accent)" stroke-width="3" rx="16" filter="url(#gold-glow)"/>
  
  <!-- Inner Frame -->
  <rect x="22" y="22" width="${CANVAS_WIDTH - 44}" height="${totalHeight - 44}" 
        fill="none" stroke="#c9a96240" stroke-width="1" rx="14"/>
  
  <!-- Corner Ornaments -->
  <g fill="url(#gold-accent)">
    <!-- Top Left -->
    <circle cx="35" cy="35" r="6"/>
    <rect x="45" y="32" width="30" height="2" rx="1"/>
    <rect x="32" y="45" width="2" height="30" rx="1"/>
    
    <!-- Top Right -->
    <circle cx="${CANVAS_WIDTH - 35}" cy="35" r="6"/>
    <rect x="${CANVAS_WIDTH - 75}" y="32" width="30" height="2" rx="1"/>
    <rect x="${CANVAS_WIDTH - 34}" y="45" width="2" height="30" rx="1"/>
    
    <!-- Bottom Left -->
    <circle cx="35" cy="${totalHeight - 35}" r="6"/>
    <rect x="45" y="${totalHeight - 34}" width="30" height="2" rx="1"/>
    <rect x="32" y="${totalHeight - 75}" width="2" height="30" rx="1"/>
    
    <!-- Bottom Right -->
    <circle cx="${CANVAS_WIDTH - 35}" cy="${totalHeight - 35}" r="6"/>
    <rect x="${CANVAS_WIDTH - 75}" y="${totalHeight - 34}" width="30" height="2" rx="1"/>
    <rect x="${CANVAS_WIDTH - 34}" y="${totalHeight - 75}" width="2" height="30" rx="1"/>
  </g>
  
  <!-- Header Panel -->
  <g transform="translate(${MARGIN}, ${MARGIN})">
    <rect class="obsidian-panel" x="0" y="0" width="${CANVAS_WIDTH - 2 * MARGIN}" height="180" rx="12"/>
    
    <!-- Header Gold Accent Line -->
    <rect class="gold-bar" x="30" y="170" width="${CANVAS_WIDTH - 2 * MARGIN - 60}" height="3" rx="1.5"/>
    
    <g transform="translate(${(CANVAS_WIDTH - 2 * MARGIN) / 2 - 200}, 20)">
      ${header.inner}
    </g>
  </g>
  
  <!-- Content Panels -->
`;

  for (const p of placements) {
    svg += `
  <!-- ${p.file} -->
  <g transform="translate(${p.x}, ${p.y})">
    <!-- Panel Shadow Layer -->
    <rect fill="url(#obsidian)" x="3" y="3" width="${p.scaledWidth}" height="${p.scaledHeight}" rx="10" opacity="0.5" filter="url(#drop-shadow)"/>
    
    <!-- Main Panel -->
    <rect class="obsidian-panel" x="0" y="0" width="${p.scaledWidth}" height="${p.scaledHeight}" rx="10"/>
    
    <!-- Top Accent Line -->
    <rect fill="url(#gold-accent)" x="20" y="6" width="${Math.min(100, p.scaledWidth * 0.25)}" height="2" rx="1" opacity="0.7"/>
    
    <!-- Content -->
    <g transform="scale(${p.scale.toFixed(3)})">
      ${p.inner}
    </g>
  </g>
`;
  }
  
  // Add footer decoration
  svg += `
  <!-- Footer Decoration -->
  <g transform="translate(${CANVAS_WIDTH / 2}, ${totalHeight - 25})">
    <rect fill="url(#gold-accent)" x="-60" y="-2" width="120" height="4" rx="2"/>
    <circle fill="url(#gold-accent)" cx="-70" cy="0" r="4"/>
    <circle fill="url(#gold-accent)" cx="70" cy="0" r="4"/>
  </g>
`;
  
  svg += `
</svg>`;

  fs.writeFileSync(outputFile, svg);
  console.log(`Compiled ${files.length} components → ${outputFile}`);
  console.log(`Canvas: ${CANVAS_WIDTH} x ${totalHeight}`);
}

// CLI
const args = process.argv.slice(2);
let inputDir = "docs/diagrams/tech-tree";
let outputFile = "docs/diagrams/tech-tree-compiled.svg";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--dir" && args[i + 1]) inputDir = args[++i];
  if (args[i] === "--out" && args[i + 1]) outputFile = args[++i];
  if (args[i] === "--help") {
    console.log("Usage: node svg-compile.js --dir <input-dir> --out <output.svg>");
    process.exit(0);
  }
}

compile(inputDir, outputFile);
