#!/usr/bin/env node
/**
 * data-explorer-mockup - Generate SVG mockup for data exploration UI
 * 
 * Shows drill-down navigation:
 *   1. URL List (Recent/Queue tabs)
 *   2. Download History for selected URL
 *   3. Download Metadata detail view
 * 
 * @module tools/dev/data-explorer-mockup
 */
'use strict';

const fs = require('fs');
const path = require('path');

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

const SIMPLE = flags.simple || false;
const OUTPUT_DIR = flags.output || 'tmp';

const THEME = SIMPLE ? {
  bg: '#ffffff',
  panel: '#f8f8f8',
  panelBorder: '#cccccc',
  card: '#ffffff',
  cardBorder: '#dddddd',
  text: '#000000',
  textMuted: '#666666',
  textLight: '#999999',
  accent: '#333333',
  success: '#228B22',
  error: '#8B0000',
  warning: '#B8860B',
  tab: '#e0e0e0',
  tabActive: '#ffffff',
  button: '#e8e8e8',
  link: '#0066cc',
  highlight: '#fff3cd',
  divider: '#e0e0e0',
} : {
  bg: '#0a0a0f',
  bgGradient1: '#0a0a0f',
  bgGradient2: '#1a1a2e',
  panel: '#1e1e2e',
  panelBorder: 'rgba(255,255,255,0.1)',
  card: 'rgba(0,0,0,0.2)',
  cardBorder: 'rgba(255,255,255,0.05)',
  text: '#e8e8e8',
  textMuted: '#888888',
  textLight: '#666666',
  accent: '#c9a227',
  success: '#4ade80',
  error: '#f87171',
  warning: '#fbbf24',
  tab: 'rgba(255,255,255,0.05)',
  tabActive: 'rgba(74,222,128,0.15)',
  button: 'rgba(255,255,255,0.1)',
  link: '#60a5fa',
  highlight: 'rgba(251,191,36,0.1)',
  divider: 'rgba(255,255,255,0.1)',
};

function generateDefs() {
  if (SIMPLE) {
    return `<defs>
    <style>
      .title { font: bold 16px 'Segoe UI', sans-serif; fill: ${THEME.text}; }
      .subtitle { font: 11px 'Segoe UI', sans-serif; fill: ${THEME.textMuted}; }
      .label { font: 600 10px 'Segoe UI', sans-serif; fill: ${THEME.textMuted}; text-transform: uppercase; }
      .value { font: 600 13px 'Segoe UI', sans-serif; fill: ${THEME.text}; }
      .small { font: 11px 'Segoe UI', sans-serif; fill: ${THEME.textMuted}; }
      .tiny { font: 9px 'Segoe UI', sans-serif; fill: ${THEME.textLight}; }
      .link { font: 11px 'Segoe UI', sans-serif; fill: ${THEME.link}; text-decoration: underline; }
      .tab-text { font: 600 11px 'Segoe UI', sans-serif; }
      .badge { font: bold 9px 'Segoe UI', sans-serif; fill: white; }
      .mono { font: 11px 'Consolas', monospace; fill: ${THEME.textMuted}; }
    </style>
  </defs>`;
  }
  
  return `<defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:${THEME.bgGradient1}"/>
      <stop offset="100%" style="stop-color:${THEME.bgGradient2}"/>
    </linearGradient>
    
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="2" dy="3" stdDeviation="4" flood-color="#000" flood-opacity="0.3"/>
    </filter>
    
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    
    <style>
      .title { font: 600 16px 'Segoe UI', sans-serif; fill: ${THEME.success}; }
      .subtitle { font: 300 11px 'Segoe UI', sans-serif; fill: ${THEME.textMuted}; }
      .label { font: 600 10px 'Segoe UI', sans-serif; fill: ${THEME.textMuted}; text-transform: uppercase; letter-spacing: 0.5px; }
      .value { font: 600 13px 'Segoe UI', sans-serif; fill: ${THEME.text}; }
      .small { font: 11px 'Segoe UI', sans-serif; fill: ${THEME.textMuted}; }
      .tiny { font: 9px 'Segoe UI', sans-serif; fill: ${THEME.textLight}; }
      .link { font: 11px 'Segoe UI', sans-serif; fill: ${THEME.link}; }
      .tab-text { font: 600 11px 'Segoe UI', sans-serif; }
      .badge { font: bold 9px 'Segoe UI', sans-serif; fill: ${THEME.bg}; }
      .mono { font: 11px 'Consolas', monospace; fill: ${THEME.textMuted}; }
      .accent { fill: ${THEME.accent}; }
      .success { fill: ${THEME.success}; }
      .error { fill: ${THEME.error}; }
    </style>
  </defs>`;
}

function cornerAccents(x, y, w, h) {
  if (SIMPLE) return '';
  return `
    <path d="M ${x+10} ${y} L ${x+10} ${y+10} L ${x} ${y+10}" stroke="${THEME.accent}" stroke-width="2" fill="none"/>
    <path d="M ${x+w-10} ${y} L ${x+w-10} ${y+10} L ${x+w} ${y+10}" stroke="${THEME.accent}" stroke-width="2" fill="none"/>
    <path d="M ${x+10} ${y+h} L ${x+10} ${y+h-10} L ${x} ${y+h-10}" stroke="${THEME.accent}" stroke-width="2" fill="none"/>
    <path d="M ${x+w-10} ${y+h} L ${x+w-10} ${y+h-10} L ${x+w} ${y+h-10}" stroke="${THEME.accent}" stroke-width="2" fill="none"/>
  `;
}

// Panel 1: URL List with tabs
function generateUrlListPanel(x, y) {
  const w = 340;
  const h = 480;
  
  const urls = [
    { url: 'theguardian.com/world/2026/jan/03/...', status: 200, size: '124KB', time: '14:23:45', count: 3 },
    { url: 'theguardian.com/uk-news/article/...', status: 200, size: '98KB', time: '14:23:42', count: 1 },
    { url: 'theguardian.com/sport/football/...', status: 200, size: '156KB', time: '14:23:38', count: 2 },
    { url: 'theguardian.com/technology/ai/...', status: 200, size: '87KB', time: '14:23:35', count: 1 },
    { url: 'bbc.com/news/world-europe-...', status: 200, size: '112KB', time: '14:22:58', count: 4 },
    { url: 'reuters.com/world/asia/china-...', status: 304, size: '0KB', time: '14:22:45', count: 2 },
    { url: 'nytimes.com/2026/01/03/world/...', status: 200, size: '203KB', time: '14:22:30', count: 1 },
  ];
  
  const filter = SIMPLE ? '' : 'filter="url(#shadow)"';
  
  return `
  <g id="url-list-panel">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${THEME.panel}" stroke="${THEME.panelBorder}" rx="8" ${filter}/>
    ${cornerAccents(x, y, w, h)}
    
    <!-- Header -->
    <text x="${x+16}" y="${y+28}" class="title">📊 Data Explorer</text>
    <text x="${x+16}" y="${y+44}" class="subtitle">Browse and analyze downloaded content</text>
    
    <!-- Tabs -->
    <g transform="translate(${x+12}, ${y+58})">
      <rect width="100" height="28" rx="4" fill="${THEME.tabActive}"/>
      <text x="50" y="18" class="tab-text" text-anchor="middle" fill="${THEME.success}">Recent</text>
      <circle cx="85" cy="14" r="8" fill="${THEME.success}"/>
      <text x="85" y="17" class="badge" text-anchor="middle">42</text>
      
      <rect x="108" width="80" height="28" rx="4" fill="${THEME.tab}"/>
      <text x="148" y="18" class="tab-text" text-anchor="middle" fill="${THEME.textMuted}">Queue</text>
      <circle cx="175" cy="14" r="8" fill="${THEME.warning}"/>
      <text x="175" y="17" class="badge" text-anchor="middle">156</text>
      
      <rect x="196" width="80" height="28" rx="4" fill="${THEME.tab}"/>
      <text x="236" y="18" class="tab-text" text-anchor="middle" fill="${THEME.textMuted}">Errors</text>
      <circle cx="263" cy="14" r="8" fill="${THEME.error}"/>
      <text x="263" y="17" class="badge" text-anchor="middle">3</text>
    </g>
    
    <!-- Search bar -->
    <rect x="${x+12}" y="${y+94}" width="${w-24}" height="32" rx="4" fill="${THEME.card}" stroke="${THEME.cardBorder}"/>
    <text x="${x+20}" y="${y+114}" class="small">🔍 Filter URLs...</text>
    
    <!-- Advanced toggle -->
    <text x="${x+w-16}" y="${y+114}" class="tiny" text-anchor="end">⚙️ Advanced</text>
    
    <!-- URL list -->
    <g transform="translate(${x+12}, ${y+136})">
      ${urls.map((u, i) => {
        const itemY = i * 46;
        const statusColor = u.status === 200 ? THEME.success : (u.status === 304 ? THEME.warning : THEME.error);
        const selected = i === 0;
        const bgFill = selected ? THEME.highlight : THEME.card;
        return `
        <g transform="translate(0, ${itemY})">
          <rect width="${w-24}" height="42" rx="4" fill="${bgFill}" stroke="${selected ? THEME.accent : THEME.cardBorder}"/>
          <circle cx="14" cy="14" r="5" fill="${statusColor}"/>
          <text x="28" y="16" class="small" fill="${THEME.text}">${u.url}</text>
          <text x="28" y="32" class="tiny">${u.status} · ${u.size} · ${u.time}</text>
          ${u.count > 1 ? `
            <rect x="${w-70}" y="8" width="36" height="16" rx="8" fill="${THEME.accent}" opacity="0.2"/>
            <text x="${w-52}" y="20" class="tiny" text-anchor="middle" fill="${THEME.accent}">${u.count}×</text>
          ` : ''}
          <text x="${w-30}" y="21" class="small" fill="${THEME.textMuted}">→</text>
        </g>
        `;
      }).join('')}
    </g>
    
    <!-- Pagination -->
    <g transform="translate(${x+12}, ${y+h-36})">
      <rect width="28" height="24" rx="4" fill="${THEME.button}"/>
      <text x="14" y="17" class="small" text-anchor="middle">◀</text>
      <text x="${(w-24)/2}" y="17" class="tiny" text-anchor="middle">Page 1 of 23 · 550 URLs</text>
      <rect x="${w-52}" width="28" height="24" rx="4" fill="${THEME.button}"/>
      <text x="${w-38}" y="17" class="small" text-anchor="middle">▶</text>
    </g>
    
    <!-- Level indicator -->
    <text x="${x+w/2}" y="${y+h+20}" class="tiny" text-anchor="middle">LEVEL 1: URL LIST</text>
  </g>`;
}

// Panel 2: Download History for a URL
function generateHistoryPanel(x, y) {
  const w = 340;
  const h = 480;
  
  const downloads = [
    { date: '2026-01-03 14:23:45', status: 200, size: '124KB', ttfb: '234ms', total: '456ms', fresh: true },
    { date: '2026-01-02 09:15:22', status: 200, size: '118KB', ttfb: '189ms', total: '412ms', fresh: false },
    { date: '2025-12-28 16:45:10', status: 200, size: '122KB', ttfb: '267ms', total: '534ms', fresh: false },
  ];
  
  const filter = SIMPLE ? '' : 'filter="url(#shadow)"';
  
  return `
  <g id="history-panel">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${THEME.panel}" stroke="${THEME.panelBorder}" rx="8" ${filter}/>
    ${cornerAccents(x, y, w, h)}
    
    <!-- Header with back button -->
    <rect x="${x+12}" y="${y+12}" width="60" height="26" rx="4" fill="${THEME.button}"/>
    <text x="${x+42}" y="${y+29}" class="small" text-anchor="middle">← Back</text>
    
    <text x="${x+16}" y="${y+60}" class="title">📜 Download History</text>
    
    <!-- URL being viewed -->
    <rect x="${x+12}" y="${y+72}" width="${w-24}" height="44" rx="4" fill="${THEME.card}" stroke="${THEME.cardBorder}"/>
    <text x="${x+20}" y="${y+90}" class="label">URL</text>
    <text x="${x+20}" y="${y+106}" class="mono">theguardian.com/world/2026/jan/03/...</text>
    
    <!-- Stats summary -->
    <g transform="translate(${x+12}, ${y+126})">
      <rect width="${(w-32)/3}" height="44" rx="4" fill="${THEME.card}"/>
      <text x="${(w-32)/6}" y="18" class="value" text-anchor="middle" fill="${THEME.success}">3</text>
      <text x="${(w-32)/6}" y="34" class="tiny" text-anchor="middle">Downloads</text>
      
      <rect x="${(w-24)/3}" width="${(w-32)/3}" height="44" rx="4" fill="${THEME.card}"/>
      <text x="${(w-24)/3 + (w-32)/6}" y="18" class="value" text-anchor="middle">121KB</text>
      <text x="${(w-24)/3 + (w-32)/6}" y="34" class="tiny" text-anchor="middle">Avg Size</text>
      
      <rect x="${2*(w-24)/3}" width="${(w-32)/3}" height="44" rx="4" fill="${THEME.card}"/>
      <text x="${2*(w-24)/3 + (w-32)/6}" y="18" class="value" text-anchor="middle">467ms</text>
      <text x="${2*(w-24)/3 + (w-32)/6}" y="34" class="tiny" text-anchor="middle">Avg Time</text>
    </g>
    
    <!-- Download list -->
    <text x="${x+16}" y="${y+195}" class="label">All Downloads</text>
    
    <g transform="translate(${x+12}, ${y+206})">
      ${downloads.map((d, i) => {
        const itemY = i * 70;
        const selected = i === 0;
        const bgFill = selected ? THEME.highlight : THEME.card;
        return `
        <g transform="translate(0, ${itemY})">
          <rect width="${w-24}" height="64" rx="4" fill="${bgFill}" stroke="${selected ? THEME.accent : THEME.cardBorder}"/>
          
          <!-- Date/time -->
          <text x="12" y="18" class="small" fill="${THEME.text}">${d.date}</text>
          ${d.fresh ? `
            <rect x="170" y="6" width="40" height="16" rx="8" fill="${THEME.success}" opacity="0.2"/>
            <text x="190" y="18" class="tiny" text-anchor="middle" fill="${THEME.success}">Latest</text>
          ` : ''}
          
          <!-- Metrics row -->
          <g transform="translate(12, 28)">
            <circle cx="4" cy="10" r="4" fill="${d.status === 200 ? THEME.success : THEME.error}"/>
            <text x="14" y="14" class="tiny">${d.status}</text>
            
            <text x="55" y="14" class="tiny">📦 ${d.size}</text>
            <text x="115" y="14" class="tiny">⏱ ${d.ttfb}</text>
            <text x="175" y="14" class="tiny">⏳ ${d.total}</text>
          </g>
          
          <!-- View details arrow -->
          <text x="${w-40}" y="36" class="small" fill="${THEME.textMuted}">→</text>
        </g>
        `;
      }).join('')}
    </g>
    
    <!-- Actions -->
    <g transform="translate(${x+12}, ${y+h-52})">
      <rect width="100" height="28" rx="4" fill="${THEME.button}"/>
      <text x="50" y="18" class="small" text-anchor="middle">🔄 Re-fetch</text>
      
      <rect x="108" width="100" height="28" rx="4" fill="${THEME.button}"/>
      <text x="158" y="18" class="small" text-anchor="middle">📋 Copy URL</text>
      
      <rect x="216" width="100" height="28" rx="4" fill="${THEME.button}"/>
      <text x="266" y="18" class="small" text-anchor="middle">🌐 Open</text>
    </g>
    
    <!-- Level indicator -->
    <text x="${x+w/2}" y="${y+h+20}" class="tiny" text-anchor="middle">LEVEL 2: DOWNLOAD HISTORY</text>
  </g>`;
}

// Panel 3: Download Metadata Detail
function generateMetadataPanel(x, y) {
  const w = 340;
  const h = 480;
  
  const filter = SIMPLE ? '' : 'filter="url(#shadow)"';
  
  const metadata = [
    { label: 'Response ID', value: '1,247,856' },
    { label: 'URL ID', value: '45,231' },
    { label: 'HTTP Status', value: '200 OK', color: 'success' },
    { label: 'Content Type', value: 'text/html; charset=utf-8' },
    { label: 'Content Length', value: '127,456 bytes (124.5 KB)' },
    { label: 'Fetched At', value: '2026-01-03 14:23:45.234' },
    { label: 'TTFB', value: '234ms' },
    { label: 'Total Time', value: '456ms' },
    { label: 'Compression', value: 'gzip → 42% savings' },
    { label: 'Cache Status', value: 'MISS' },
  ];
  
  const headers = [
    { name: 'Content-Type', value: 'text/html; charset=utf-8' },
    { name: 'Cache-Control', value: 'max-age=60' },
    { name: 'ETag', value: '"abc123..."' },
    { name: 'Last-Modified', value: 'Fri, 03 Jan 2026 14:20:00 GMT' },
  ];
  
  return `
  <g id="metadata-panel">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${THEME.panel}" stroke="${THEME.panelBorder}" rx="8" ${filter}/>
    ${cornerAccents(x, y, w, h)}
    
    <!-- Header with back button -->
    <rect x="${x+12}" y="${y+12}" width="60" height="26" rx="4" fill="${THEME.button}"/>
    <text x="${x+42}" y="${y+29}" class="small" text-anchor="middle">← Back</text>
    
    <text x="${x+16}" y="${y+60}" class="title">🔬 Download Details</text>
    <text x="${x+16}" y="${y+76}" class="subtitle">2026-01-03 14:23:45</text>
    
    <!-- Metadata grid -->
    <g transform="translate(${x+12}, ${y+90})">
      ${metadata.slice(0, 6).map((m, i) => {
        const row = Math.floor(i / 2);
        const col = i % 2;
        const itemX = col * ((w-32)/2 + 4);
        const itemY = row * 44;
        const valueColor = m.color === 'success' ? THEME.success : THEME.text;
        return `
        <g transform="translate(${itemX}, ${itemY})">
          <rect width="${(w-32)/2}" height="40" rx="4" fill="${THEME.card}"/>
          <text x="8" y="14" class="label">${m.label}</text>
          <text x="8" y="30" class="small" fill="${valueColor}">${m.value}</text>
        </g>
        `;
      }).join('')}
    </g>
    
    <!-- Timing section -->
    <text x="${x+16}" y="${y+238}" class="label">Timing Breakdown</text>
    <g transform="translate(${x+12}, ${y+248})">
      <rect width="${w-24}" height="44" rx="4" fill="${THEME.card}"/>
      
      <!-- Timing bar -->
      <rect x="12" y="10" width="${(w-48)*0.4}" height="10" rx="2" fill="${THEME.warning}"/>
      <rect x="${12+(w-48)*0.4}" y="10" width="${(w-48)*0.25}" height="10" rx="2" fill="${THEME.success}"/>
      <rect x="${12+(w-48)*0.65}" y="10" width="${(w-48)*0.35}" height="10" rx="2" fill="${THEME.link}"/>
      
      <text x="12" y="34" class="tiny">DNS 45ms</text>
      <text x="100" y="34" class="tiny">Connect 89ms</text>
      <text x="188" y="34" class="tiny">TTFB 234ms</text>
      <text x="270" y="34" class="tiny">Download 88ms</text>
    </g>
    
    <!-- Headers section (collapsible) -->
    <g transform="translate(${x+12}, ${y+306})">
      <rect width="${w-24}" height="26" rx="4" fill="${THEME.button}"/>
      <text x="12" y="17" class="small">📋 Response Headers (${headers.length})</text>
      <text x="${w-40}" y="17" class="small">▼</text>
    </g>
    
    <g transform="translate(${x+12}, ${y+338})">
      ${headers.map((h, i) => `
        <text x="8" y="${i*18 + 12}" class="tiny" fill="${THEME.accent}">${h.name}:</text>
        <text x="110" y="${i*18 + 12}" class="tiny">${h.value}</text>
      `).join('')}
    </g>
    
    <!-- Actions -->
    <g transform="translate(${x+12}, ${y+h-52})">
      <rect width="100" height="28" rx="4" fill="${THEME.button}"/>
      <text x="50" y="18" class="small" text-anchor="middle">📄 View HTML</text>
      
      <rect x="108" width="100" height="28" rx="4" fill="${THEME.button}"/>
      <text x="158" y="18" class="small" text-anchor="middle">📦 Raw</text>
      
      <rect x="216" width="100" height="28" rx="4" fill="${THEME.button}"/>
      <text x="266" y="18" class="small" text-anchor="middle">💾 Export</text>
    </g>
    
    <!-- Level indicator -->
    <text x="${x+w/2}" y="${y+h+20}" class="tiny" text-anchor="middle">LEVEL 3: DOWNLOAD METADATA</text>
  </g>`;
}

// Navigation flow arrows
function generateFlowArrows(x1, x2, y) {
  if (SIMPLE) {
    return `
      <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${THEME.accent}" stroke-width="2" marker-end="url(#arrow)"/>
      <text x="${(x1+x2)/2}" y="${y-8}" class="tiny" text-anchor="middle">Click URL</text>
    `;
  }
  
  return `
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="${THEME.accent}"/>
      </marker>
    </defs>
    <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${THEME.accent}" stroke-width="2" stroke-dasharray="8 4" marker-end="url(#arrow)" filter="url(#glow)"/>
    <text x="${(x1+x2)/2}" y="${y-10}" class="tiny accent" text-anchor="middle">Click URL →</text>
  `;
}

function generateSVG() {
  const width = 1120;
  const height = 600;
  
  const bgRect = SIMPLE 
    ? `<rect width="${width}" height="${height}" fill="#f0f0f0"/>`
    : `<rect width="${width}" height="${height}" fill="${THEME.bg}"/>
       <rect width="${width}" height="${height}" fill="url(#bgGrad)" opacity="0.5"/>`;
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  ${generateDefs()}
  
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="${THEME.accent}"/>
    </marker>
  </defs>
  
  ${bgRect}
  
  <!-- Title -->
  <text x="${width/2}" y="32" font-size="18" font-weight="bold" fill="${THEME.accent}" text-anchor="middle" letter-spacing="2">
    DATA EXPLORER — DRILL-DOWN NAVIGATION
  </text>
  <text x="${width/2}" y="52" class="subtitle" text-anchor="middle">
    Click through levels: URL List → Download History → Metadata Detail
  </text>
  
  <!-- Three panels -->
  ${generateUrlListPanel(20, 70)}
  ${generateHistoryPanel(390, 70)}
  ${generateMetadataPanel(760, 70)}
  
  <!-- Flow arrows -->
  <g transform="translate(0, 0)">
    <line x1="365" y1="310" x2="385" y2="310" stroke="${THEME.accent}" stroke-width="2" stroke-dasharray="4 2" marker-end="url(#arrow)"/>
    <line x1="735" y1="310" x2="755" y2="310" stroke="${THEME.accent}" stroke-width="2" stroke-dasharray="4 2" marker-end="url(#arrow)"/>
  </g>
  
</svg>`;
}

function main() {
  if (flags.help || flags.h) {
    console.log(`
data-explorer-mockup - Generate SVG mockup for data exploration UI

OPTIONS:
  --simple         Simple B&W version
  --output <dir>   Output directory (default: tmp)
  --help, -h       Show help

EXAMPLES:
  node tools/dev/data-explorer-mockup.js --simple
  node tools/dev/data-explorer-mockup.js --output docs/designs
`);
    return;
  }
  
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  const suffix = SIMPLE ? '-simple' : '-wlilo';
  const filename = `data-explorer-mockup${suffix}.svg`;
  const outputPath = path.join(OUTPUT_DIR, filename);
  
  const svg = generateSVG();
  fs.writeFileSync(outputPath, svg);
  
  console.log(`Generated: ${outputPath}`);
  console.log(`Style: ${SIMPLE ? 'Simple B&W' : 'WLILO themed'}`);
}

main();
