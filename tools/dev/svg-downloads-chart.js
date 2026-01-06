#!/usr/bin/env node
/**
 * svg-downloads-chart - Generate WLILO-styled SVG bar chart of daily downloads
 * 
 * Usage:
 *   node tools/dev/svg-downloads-chart.js                    # Last 65 days (default)
 *   node tools/dev/svg-downloads-chart.js --days 30          # Last 30 days
 *   node tools/dev/svg-downloads-chart.js --output chart.svg # Save to file
 *   node tools/dev/svg-downloads-chart.js --simple           # Plain B&W version
 * 
 * @module tools/dev/svg-downloads-chart
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// CLI argument parsing
const args = process.argv.slice(2);
const flags = {};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
}

const DAYS = parseInt(flags.days || '65', 10);
const OUTPUT = flags.output || null;
const SIMPLE = flags.simple || false;

// ============================================================
// Database Query
// ============================================================

function getDailyDownloads(days) {
  const dbPath = path.resolve(__dirname, '..', '..', 'data', 'news.db');
  const db = new Database(dbPath, { readonly: true });
  
  // Get all days in range with download counts
  const stmt = db.prepare(`
    SELECT date(fetched_at) as day, COUNT(*) as count 
    FROM http_responses 
    WHERE http_status = 200 
      AND fetched_at >= date('now', '-' || ? || ' days') 
    GROUP BY date(fetched_at) 
    ORDER BY day
  `);
  
  const rows = stmt.all(days);
  db.close();
  
  // Fill in missing days with zero counts
  const result = [];
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - days);
  
  const dataMap = new Map(rows.map(r => [r.day, r.count]));
  
  for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
    const dayStr = d.toISOString().split('T')[0];
    result.push({
      day: dayStr,
      count: dataMap.get(dayStr) || 0
    });
  }
  
  return result;
}

// ============================================================
// SVG Generation - Simple Version
// ============================================================

function generateSimpleSVG(data) {
  const width = 800;
  const height = 400;
  const margin = { top: 40, right: 60, bottom: 60, left: 60 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  
  const barWidth = chartWidth / data.length;
  const maxCount = Math.max(...data.map(d => d.count), 1);
  
  let bars = '';
  let labels = '';
  
  data.forEach((d, i) => {
    const barHeight = (d.count / maxCount) * chartHeight;
    const x = margin.left + i * barWidth;
    const y = margin.top + chartHeight - barHeight;
    
    bars += `  <rect x="${x}" y="${y}" width="${barWidth - 1}" height="${barHeight}" fill="#333" />\n`;
    
    // Show count on bars with significant values
    if (d.count > maxCount * 0.05) {
      labels += `  <text x="${x + barWidth / 2}" y="${y - 4}" text-anchor="middle" font-size="8" fill="#333">${d.count}</text>\n`;
    }
  });
  
  // X-axis labels (every 7 days)
  let xLabels = '';
  data.forEach((d, i) => {
    if (i % 7 === 0) {
      const x = margin.left + i * barWidth + barWidth / 2;
      const label = d.day.slice(5); // MM-DD
      xLabels += `  <text x="${x}" y="${height - 25}" text-anchor="middle" font-size="9" fill="#333">${label}</text>\n`;
    }
  });
  
  // Y-axis
  const yAxis = `
  <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + chartHeight}" stroke="#333" stroke-width="1"/>
  <line x1="${margin.left}" y1="${margin.top + chartHeight}" x2="${width - margin.right}" y2="${margin.top + chartHeight}" stroke="#333" stroke-width="1"/>
  <text x="${margin.left - 10}" y="${margin.top}" text-anchor="end" font-size="9" fill="#333">${maxCount}</text>
  <text x="${margin.left - 10}" y="${margin.top + chartHeight}" text-anchor="end" font-size="9" fill="#333">0</text>
  `;
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <!-- Title -->
  <text x="${width / 2}" y="25" text-anchor="middle" font-size="14" font-weight="bold" fill="#333">Daily Downloads (Last ${data.length} Days)</text>
  
  <!-- Axes -->
${yAxis}
  
  <!-- Bars -->
${bars}
  <!-- Bar Labels -->
${labels}
  <!-- X-axis Labels -->
${xLabels}
</svg>`;
}

// ============================================================
// SVG Generation - WLILO Styled Version
// ============================================================

function generateWLILOSVG(data) {
  const width = 900;
  const height = 500;
  const margin = { top: 70, right: 80, bottom: 80, left: 80 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  
  const barWidth = chartWidth / data.length;
  const barGap = 1;
  const maxCount = Math.max(...data.map(d => d.count), 1);
  
  // WLILO Color Palette
  const colors = {
    leatherLight: '#faf9f7',
    leatherMid: '#f5f3ef',
    leatherDark: '#ebe8e2',
    obsidian: '#2d2d2d',
    obsidianDeep: '#1a1a1a',
    gold: '#c9a962',
    goldLight: '#e8d5a3',
    textPrimary: '#2d2d2d',
    textSecondary: '#666',
    barFill: '#3a3a4a',
    barHighlight: '#4a4a5a'
  };
  
  // Defs for gradients and filters
  const defs = `
  <defs>
    <!-- Leather Background Gradient -->
    <linearGradient id="leatherBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${colors.leatherLight}"/>
      <stop offset="50%" stop-color="${colors.leatherMid}"/>
      <stop offset="100%" stop-color="${colors.leatherDark}"/>
    </linearGradient>
    
    <!-- Obsidian Panel Gradient -->
    <linearGradient id="obsidianPanel" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${colors.obsidian}"/>
      <stop offset="100%" stop-color="${colors.obsidianDeep}"/>
    </linearGradient>
    
    <!-- Bar Gradient -->
    <linearGradient id="barGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${colors.gold}"/>
      <stop offset="100%" stop-color="${colors.goldLight}"/>
    </linearGradient>
    
    <!-- Drop Shadow -->
    <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="2" dy="3" stdDeviation="4" flood-color="#000" flood-opacity="0.25"/>
    </filter>
    
    <!-- Inner Glow -->
    <filter id="innerGlow" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur"/>
      <feOffset in="blur" dx="0" dy="1" result="offsetBlur"/>
      <feFlood flood-color="${colors.gold}" flood-opacity="0.3"/>
      <feComposite in2="offsetBlur" operator="in"/>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>`;
  
  // Background
  const background = `
  <!-- Leather Background -->
  <rect width="${width}" height="${height}" fill="url(#leatherBg)"/>`;
  
  // Obsidian chart panel
  const panelX = margin.left - 20;
  const panelY = margin.top - 20;
  const panelW = chartWidth + 40;
  const panelH = chartHeight + 50;
  
  const panel = `
  <!-- Obsidian Panel -->
  <rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" 
        rx="10" ry="10" fill="url(#obsidianPanel)" 
        stroke="${colors.gold}" stroke-width="1.5"
        filter="url(#dropShadow)"/>`;
  
  // Title with gold accent
  const title = `
  <!-- Title -->
  <text x="${width / 2}" y="38" text-anchor="middle" 
        font-family="Georgia, serif" font-size="20" font-weight="bold" 
        fill="${colors.obsidian}">Daily Downloads</text>
  <text x="${width / 2}" y="55" text-anchor="middle" 
        font-family="Arial, sans-serif" font-size="11" 
        fill="${colors.textSecondary}">Last ${data.length} Days • Total: ${data.reduce((a, b) => a + b.count, 0).toLocaleString()}</text>
  <line x1="${width / 2 - 80}" y1="62" x2="${width / 2 + 80}" y2="62" 
        stroke="${colors.gold}" stroke-width="2"/>`;
  
  // Generate bars
  let bars = '';
  let barLabels = '';
  
  data.forEach((d, i) => {
    const barHeight = Math.max((d.count / maxCount) * chartHeight, 0);
    const x = margin.left + i * barWidth + barGap / 2;
    const y = margin.top + chartHeight - barHeight;
    const actualBarWidth = barWidth - barGap;
    
    // Bar
    if (d.count > 0) {
      bars += `  <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${actualBarWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" fill="url(#barGradient)" rx="1" ry="1"/>\n`;
    }
    
    // Label on significant bars
    if (d.count > maxCount * 0.08) {
      barLabels += `  <text x="${(x + actualBarWidth / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="8" fill="${colors.goldLight}">${d.count}</text>\n`;
    }
  });
  
  // X-axis labels
  let xAxisLabels = '';
  const labelInterval = Math.ceil(data.length / 10); // Show ~10 labels
  data.forEach((d, i) => {
    if (i % labelInterval === 0 || i === data.length - 1) {
      const x = margin.left + i * barWidth + barWidth / 2;
      const label = d.day.slice(5); // MM-DD
      xAxisLabels += `  <text x="${x.toFixed(1)}" y="${margin.top + chartHeight + 18}" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" fill="${colors.leatherLight}">${label}</text>\n`;
    }
  });
  
  // Y-axis with grid lines
  let yAxis = '';
  const ySteps = 5;
  for (let i = 0; i <= ySteps; i++) {
    const y = margin.top + (chartHeight / ySteps) * i;
    const value = Math.round(maxCount - (maxCount / ySteps) * i);
    
    // Grid line (subtle)
    yAxis += `  <line x1="${margin.left}" y1="${y.toFixed(1)}" x2="${margin.left + chartWidth}" y2="${y.toFixed(1)}" stroke="${colors.leatherDark}" stroke-width="0.5" stroke-opacity="0.3"/>\n`;
    
    // Y label
    yAxis += `  <text x="${margin.left - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-family="Arial, sans-serif" font-size="9" fill="${colors.leatherLight}">${value.toLocaleString()}</text>\n`;
  }
  
  // Axis lines
  const axes = `
  <!-- Axes -->
  <line x1="${margin.left}" y1="${margin.top + chartHeight}" x2="${margin.left + chartWidth}" y2="${margin.top + chartHeight}" stroke="${colors.gold}" stroke-width="1.5"/>`;
  
  // Legend / stats footer
  const totalDownloads = data.reduce((a, b) => a + b.count, 0);
  const avgDownloads = Math.round(totalDownloads / data.length);
  const maxDay = data.reduce((max, d) => d.count > max.count ? d : max, data[0]);
  
  const footer = `
  <!-- Stats Footer -->
  <text x="${margin.left}" y="${height - 20}" font-family="Arial, sans-serif" font-size="10" fill="${colors.textSecondary}">
    Peak: ${maxDay.count.toLocaleString()} (${maxDay.day}) • Avg: ${avgDownloads.toLocaleString()}/day
  </text>`;
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
${defs}
${background}
${title}
${panel}
${yAxis}
${axes}
  <!-- Bars -->
${bars}
  <!-- Bar Labels -->
${barLabels}
  <!-- X-axis Labels -->
${xAxisLabels}
${footer}
</svg>`;
}

// ============================================================
// Main
// ============================================================

function main() {
  if (flags.help || flags.h) {
    console.log(`
svg-downloads-chart - Generate WLILO-styled SVG bar chart of daily downloads

OPTIONS:
  --days <n>       Number of days to show (default: 65)
  --output <file>  Save SVG to file (default: stdout)
  --simple         Generate plain B&W version instead of WLILO
  --help, -h       Show this help
`);
    return;
  }
  
  const data = getDailyDownloads(DAYS);
  const svg = SIMPLE ? generateSimpleSVG(data) : generateWLILOSVG(data);
  
  if (OUTPUT) {
    fs.writeFileSync(OUTPUT, svg);
    console.log(`SVG written to ${OUTPUT}`);
    console.log(`  Days: ${data.length}`);
    console.log(`  Total downloads: ${data.reduce((a, b) => a + b.count, 0).toLocaleString()}`);
  } else {
    console.log(svg);
  }
}

main();
