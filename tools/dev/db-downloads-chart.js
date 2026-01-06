#!/usr/bin/env node
/**
 * db-downloads-chart - Generate SVG bar chart of cumulative downloads over time
 * 
 * Usage:
 *   node tools/dev/db-downloads-chart.js                    # Last 65 days, WLILO style
 *   node tools/dev/db-downloads-chart.js --days 30          # Last 30 days
 *   node tools/dev/db-downloads-chart.js --simple           # Simple B&W version
 *   node tools/dev/db-downloads-chart.js --output chart.svg # Save to file
 * 
 * @module tools/dev/db-downloads-chart
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
const SIMPLE = flags.simple || false;
const OUTPUT = flags.output || null;

function getDb() {
  const dbPath = path.resolve(__dirname, '..', '..', 'data', 'news.db');
  return new Database(dbPath, { readonly: true });
}

function getCumulativeData(days) {
  const db = getDb();
  
  // Get daily counts with cumulative running total from ALL time
  const stmt = db.prepare(`
    WITH all_daily AS (
      SELECT 
        date(fetched_at) as day,
        COUNT(*) as count
      FROM http_responses
      WHERE http_status = 200 AND bytes_downloaded > 0
      GROUP BY date(fetched_at)
      ORDER BY day
    ),
    cumulative AS (
      SELECT 
        day,
        count,
        SUM(count) OVER (ORDER BY day) as cumulative
      FROM all_daily
    )
    SELECT * FROM cumulative
    ORDER BY day
  `);
  
  const allData = stmt.all();
  db.close();
  
  // Generate all dates in the range and fill gaps with last known cumulative
  const endDate = new Date();
  endDate.setHours(23, 59, 59, 999); // End of today to ensure today is included
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days + 1);
  startDate.setHours(0, 0, 0, 0);
  
  const result = [];
  let lastCumulative = 0;
  
  // Find starting cumulative (sum before our date range)
  for (const row of allData) {
    const rowDate = new Date(row.day);
    if (rowDate < startDate) {
      lastCumulative = row.cumulative;
    }
  }
  
  // Build daily data with gaps filled
  const dataMap = new Map(allData.map(r => [r.day, r]));
  
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dayStr = d.toISOString().split('T')[0];
    const row = dataMap.get(dayStr);
    
    if (row) {
      lastCumulative = row.cumulative;
      result.push({ day: dayStr, count: row.count, cumulative: row.cumulative });
    } else {
      result.push({ day: dayStr, count: 0, cumulative: lastCumulative });
    }
  }
  
  return result;
}

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function generateSimpleSVG(data) {
  const width = 900;
  const height = 400;
  const margin = { top: 40, right: 80, bottom: 60, left: 70 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  
  const maxValue = Math.max(...data.map(d => d.cumulative));
  const barWidth = chartWidth / data.length;
  
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <style>
    .title { font: bold 16px sans-serif; }
    .axis-label { font: 10px sans-serif; }
    .bar-label { font: 8px sans-serif; }
    .grid { stroke: #ccc; stroke-width: 0.5; }
  </style>
  
  <!-- Background -->
  <rect width="${width}" height="${height}" fill="white"/>
  
  <!-- Title -->
  <text x="${width/2}" y="25" text-anchor="middle" class="title">Cumulative Downloads (Last ${data.length} Days)</text>
  
  <!-- Chart area -->
  <g transform="translate(${margin.left}, ${margin.top})">
    
    <!-- Y-axis grid lines -->`;
  
  // Y-axis grid lines
  const yTicks = 5;
  for (let i = 0; i <= yTicks; i++) {
    const y = chartHeight - (i / yTicks) * chartHeight;
    const value = Math.round((i / yTicks) * maxValue);
    svg += `
    <line x1="0" y1="${y}" x2="${chartWidth}" y2="${y}" class="grid"/>
    <text x="-8" y="${y + 3}" text-anchor="end" class="axis-label">${formatNumber(value)}</text>`;
  }
  
  // Bars
  svg += `
    
    <!-- Bars -->`;
  
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    const barHeight = (d.cumulative / maxValue) * chartHeight;
    const x = i * barWidth;
    const y = chartHeight - barHeight;
    
    svg += `
    <rect x="${x + 1}" y="${y}" width="${barWidth - 2}" height="${barHeight}" fill="black"/>`;
  }
  
  // X-axis labels (every 10 days)
  svg += `
    
    <!-- X-axis labels -->`;
  
  for (let i = 0; i < data.length; i += 10) {
    const d = data[i];
    const x = i * barWidth + barWidth / 2;
    const label = d.day.slice(5); // MM-DD
    svg += `
    <text x="${x}" y="${chartHeight + 15}" text-anchor="middle" class="axis-label">${label}</text>`;
  }
  
  // Final value label
  const lastValue = data[data.length - 1].cumulative;
  svg += `
    
    <!-- Final value -->
    <text x="${chartWidth + 5}" y="${chartHeight - (lastValue / maxValue) * chartHeight + 4}" class="bar-label">${formatNumber(lastValue)}</text>`;
  
  svg += `
  </g>
</svg>`;
  
  return svg;
}

function generateWLILOSVG(data) {
  const width = 900;
  const height = 450;
  const margin = { top: 50, right: 90, bottom: 70, left: 80 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  
  const maxValue = Math.max(...data.map(d => d.cumulative));
  const barWidth = chartWidth / data.length;
  
  // WLILO color palette - luxury car catalogue aesthetic
  const colors = {
    bg: '#0a0a0f',
    bgGradient1: '#0a0a0f',
    bgGradient2: '#1a1a2e',
    accent: '#c9a227',      // Gold
    accentLight: '#e8d48a',
    accentDark: '#8b7320',
    bar: '#2a5a8a',         // Deep blue
    barHighlight: '#3a7ab0',
    text: '#e8e8e8',
    textMuted: '#888888',
    grid: 'rgba(255,255,255,0.08)',
    border: 'rgba(201,162,39,0.3)'
  };
  
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <!-- Background gradient -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:${colors.bgGradient1}"/>
      <stop offset="100%" style="stop-color:${colors.bgGradient2}"/>
    </linearGradient>
    
    <!-- Bar gradient -->
    <linearGradient id="barGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:${colors.barHighlight}"/>
      <stop offset="100%" style="stop-color:${colors.bar}"/>
    </linearGradient>
    
    <!-- Today bar gradient (purple) -->
    <linearGradient id="todayGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#9b59b6"/>
      <stop offset="100%" style="stop-color:#6c3483"/>
    </linearGradient>
    
    <!-- Gold accent gradient -->
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${colors.accentDark}"/>
      <stop offset="50%" style="stop-color:${colors.accent}"/>
      <stop offset="100%" style="stop-color:${colors.accentDark}"/>
    </linearGradient>
    
    <!-- Glow filter -->
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  
  <style>
    .title { font: 600 18px 'Segoe UI', system-ui, sans-serif; fill: ${colors.text}; letter-spacing: 2px; }
    .subtitle { font: 300 11px 'Segoe UI', system-ui, sans-serif; fill: ${colors.textMuted}; letter-spacing: 1px; text-transform: uppercase; }
    .axis-label { font: 300 9px 'Segoe UI', system-ui, sans-serif; fill: ${colors.textMuted}; }
    .value-label { font: 600 10px 'Segoe UI', system-ui, sans-serif; fill: ${colors.accent}; }
    .final-value { font: 700 14px 'Segoe UI', system-ui, sans-serif; fill: ${colors.accent}; }
  </style>
  
  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bgGrad)"/>
  
  <!-- Decorative border -->
  <rect x="8" y="8" width="${width - 16}" height="${height - 16}" fill="none" stroke="${colors.border}" stroke-width="1" rx="4"/>
  
  <!-- Corner accents -->
  <path d="M 20 8 L 20 20 L 8 20" stroke="${colors.accent}" stroke-width="2" fill="none"/>
  <path d="M ${width - 20} 8 L ${width - 20} 20 L ${width - 8} 20" stroke="${colors.accent}" stroke-width="2" fill="none"/>
  <path d="M 20 ${height - 8} L 20 ${height - 20} L 8 ${height - 20}" stroke="${colors.accent}" stroke-width="2" fill="none"/>
  <path d="M ${width - 20} ${height - 8} L ${width - 20} ${height - 20} L ${width - 8} ${height - 20}" stroke="${colors.accent}" stroke-width="2" fill="none"/>
  
  <!-- Title -->
  <text x="${width/2}" y="32" text-anchor="middle" class="title">COLLECTION INVENTORY</text>
  <text x="${width/2}" y="46" text-anchor="middle" class="subtitle">Cumulative Downloads · ${data.length} Day Archive</text>
  
  <!-- Chart area -->
  <g transform="translate(${margin.left}, ${margin.top})">
    
    <!-- Y-axis grid lines -->`;
  
  // Y-axis grid lines
  const yTicks = 5;
  for (let i = 0; i <= yTicks; i++) {
    const y = chartHeight - (i / yTicks) * chartHeight;
    const value = Math.round((i / yTicks) * maxValue);
    svg += `
    <line x1="0" y1="${y}" x2="${chartWidth}" y2="${y}" stroke="${colors.grid}" stroke-width="1"/>
    <text x="-12" y="${y + 3}" text-anchor="end" class="axis-label">${formatNumber(value)}</text>`;
  }
  
  // Y-axis line
  svg += `
    <line x1="0" y1="0" x2="0" y2="${chartHeight}" stroke="${colors.border}" stroke-width="1"/>`;
  
  // Bars
  svg += `
    
    <!-- Bars -->`;
  
  // Get today's date string for comparison
  const today = new Date().toISOString().split('T')[0];
  
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    const barHeight = (d.cumulative / maxValue) * chartHeight;
    const x = i * barWidth;
    const y = chartHeight - barHeight;
    
    // Use purple gradient for today's bar
    const isToday = d.day === today;
    const fillGradient = isToday ? 'url(#todayGrad)' : 'url(#barGrad)';
    
    // Bar with slight gap
    svg += `
    <rect x="${x + 0.5}" y="${y}" width="${Math.max(barWidth - 1, 1)}" height="${barHeight}" fill="${fillGradient}" opacity="0.9"/>`;
  }
  
  // X-axis line
  svg += `
    <line x1="0" y1="${chartHeight}" x2="${chartWidth}" y2="${chartHeight}" stroke="${colors.border}" stroke-width="1"/>`;
  
  // X-axis labels (every 10 days)
  svg += `
    
    <!-- X-axis labels -->`;
  
  for (let i = 0; i < data.length; i += 10) {
    const d = data[i];
    const x = i * barWidth + barWidth / 2;
    const label = d.day.slice(5); // MM-DD
    svg += `
    <text x="${x}" y="${chartHeight + 18}" text-anchor="middle" class="axis-label">${label}</text>`;
  }
  
  // Last date label
  const lastDay = data[data.length - 1];
  svg += `
    <text x="${chartWidth}" y="${chartHeight + 18}" text-anchor="middle" class="axis-label">${lastDay.day.slice(5)}</text>`;
  
  // Final value with glow
  const lastValue = lastDay.cumulative;
  const lastY = chartHeight - (lastValue / maxValue) * chartHeight;
  svg += `
    
    <!-- Final value indicator -->
    <line x1="${chartWidth}" y1="${lastY}" x2="${chartWidth + 15}" y2="${lastY}" stroke="${colors.accent}" stroke-width="1"/>
    <circle cx="${chartWidth}" cy="${lastY}" r="3" fill="${colors.accent}" filter="url(#glow)"/>
    <text x="${chartWidth + 20}" y="${lastY + 4}" class="final-value">${lastValue.toLocaleString()}</text>`;
  
  // Starting value
  const firstValue = data[0].cumulative;
  const firstY = chartHeight - (firstValue / maxValue) * chartHeight;
  svg += `
    <text x="-12" y="${firstY + 3}" text-anchor="end" class="value-label">${formatNumber(firstValue)}</text>`;
  
  svg += `
  </g>
  
  <!-- Footer -->
  <text x="${width/2}" y="${height - 12}" text-anchor="middle" class="subtitle">Data Source: HTTP Response Archive</text>
</svg>`;
  
  return svg;
}

function main() {
  if (flags.help || flags.h) {
    console.log(`
db-downloads-chart - Generate SVG bar chart of cumulative downloads

OPTIONS:
  --days <n>       Number of days to show (default: 65)
  --simple         Generate simple B&W version
  --output <file>  Save to file (otherwise prints to stdout)
  --help, -h       Show this help

EXAMPLES:
  node tools/dev/db-downloads-chart.js --output chart.svg
  node tools/dev/db-downloads-chart.js --days 30 --simple
`);
    return;
  }
  
  const data = getCumulativeData(DAYS);
  const svg = SIMPLE ? generateSimpleSVG(data) : generateWLILOSVG(data);
  
  if (OUTPUT) {
    fs.writeFileSync(OUTPUT, svg);
    console.log(`Chart saved to ${OUTPUT}`);
    console.log(`Data range: ${data[0].day} to ${data[data.length - 1].day}`);
    console.log(`Final cumulative: ${data[data.length - 1].cumulative.toLocaleString()} downloads`);
  } else {
    console.log(svg);
  }
}

main();
