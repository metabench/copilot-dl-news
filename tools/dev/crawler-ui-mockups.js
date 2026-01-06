#!/usr/bin/env node
/**
 * crawler-ui-mockups - Generate SVG mockups of the crawler app UI
 * 
 * Usage:
 *   node tools/dev/crawler-ui-mockups.js --simple     # Simple B&W version
 *   node tools/dev/crawler-ui-mockups.js              # WLILO styled version
 *   node tools/dev/crawler-ui-mockups.js --output dir # Output to directory
 * 
 * @module tools/dev/crawler-ui-mockups
 */
'use strict';

const fs = require('fs');
const path = require('path');

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

const SIMPLE = flags.simple || false;
const OUTPUT_DIR = flags.output || 'tmp';

// Theme colors
const SIMPLE_THEME = {
  bg: '#ffffff',
  panel: '#f5f5f5',
  border: '#333333',
  text: '#000000',
  textMuted: '#666666',
  accent: '#333333',
  success: '#228B22',
  error: '#8B0000',
  button: '#e0e0e0',
  buttonText: '#000000',
};

const WLILO_THEME = {
  bg: '#0a0a0f',
  bgGradient1: '#0a0a0f',
  bgGradient2: '#1a1a2e',
  panel: '#1e1e2e',
  panelBorder: 'rgba(255,255,255,0.1)',
  border: 'rgba(201,162,39,0.3)',
  text: '#e8e8e8',
  textMuted: '#888888',
  accent: '#c9a227',
  success: '#4ade80',
  error: '#f87171',
  button: 'rgba(255,255,255,0.1)',
  buttonText: '#cccccc',
  buttonPrimary: '#22c55e',
  buttonDanger: '#ef4444',
};

function getTheme() {
  return SIMPLE ? SIMPLE_THEME : WLILO_THEME;
}

function generateDefs(theme) {
  if (SIMPLE) {
    return `<defs>
    <style>
      .title { font: bold 14px sans-serif; fill: ${theme.text}; }
      .label { font: 11px sans-serif; fill: ${theme.textMuted}; }
      .value { font: bold 16px sans-serif; fill: ${theme.text}; }
      .small { font: 9px sans-serif; fill: ${theme.textMuted}; }
      .button-text { font: bold 11px sans-serif; fill: ${theme.buttonText}; }
    </style>
  </defs>`;
  }
  
  return `<defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:${theme.bgGradient1}"/>
      <stop offset="100%" style="stop-color:${theme.bgGradient2}"/>
    </linearGradient>
    
    <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#22c55e"/>
      <stop offset="100%" style="stop-color:#4ade80"/>
    </linearGradient>
    
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="2" dy="3" stdDeviation="4" flood-color="#000" flood-opacity="0.4"/>
    </filter>
    
    <style>
      .title { font: 600 14px 'Segoe UI', sans-serif; fill: ${theme.success}; }
      .label { font: 300 10px 'Segoe UI', sans-serif; fill: ${theme.textMuted}; text-transform: uppercase; }
      .value { font: 600 18px 'Segoe UI', sans-serif; fill: ${theme.success}; }
      .small { font: 300 9px 'Segoe UI', sans-serif; fill: ${theme.textMuted}; }
      .button-text { font: 600 11px 'Segoe UI', sans-serif; }
      .panel-title { font: 600 13px 'Segoe UI', sans-serif; fill: ${theme.success}; }
      .menu-item { font: 400 11px 'Segoe UI', sans-serif; fill: ${theme.text}; }
      .accent-text { fill: ${theme.accent}; }
    </style>
  </defs>`;
}

function generateCornerAccents(x, y, w, h, theme) {
  if (SIMPLE) return '';
  
  return `
    <path d="M ${x+12} ${y} L ${x+12} ${y+12} L ${x} ${y+12}" stroke="${theme.accent}" stroke-width="2" fill="none"/>
    <path d="M ${x+w-12} ${y} L ${x+w-12} ${y+12} L ${x+w} ${y+12}" stroke="${theme.accent}" stroke-width="2" fill="none"/>
    <path d="M ${x+12} ${y+h} L ${x+12} ${y+h-12} L ${x} ${y+h-12}" stroke="${theme.accent}" stroke-width="2" fill="none"/>
    <path d="M ${x+w-12} ${y+h} L ${x+w-12} ${y+h-12} L ${x+w} ${y+h-12}" stroke="${theme.accent}" stroke-width="2" fill="none"/>
  `;
}

// Main window mockup
function generateMainWindow(theme, x = 0, y = 0) {
  const w = 320;
  const h = 260;
  
  const bg = SIMPLE 
    ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${theme.bg}" stroke="${theme.border}" stroke-width="2" rx="8"/>`
    : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#bgGrad)" stroke="${theme.border}" stroke-width="1" rx="8" filter="url(#shadow)"/>`;
  
  const progressFill = SIMPLE ? theme.success : 'url(#progressGrad)';
  
  return `
  <g id="main-window">
    ${bg}
    ${generateCornerAccents(x, y, w, h, theme)}
    
    <!-- Title bar -->
    <text x="${x+20}" y="${y+28}" class="title">🕷️ Web Crawler</text>
    
    <!-- Icon buttons -->
    <rect x="${x+w-100}" y="${y+12}" width="26" height="26" rx="4" fill="${theme.button}"/>
    <text x="${x+w-87}" y="${y+29}" font-size="14" text-anchor="middle" fill="${theme.textMuted}">📋</text>
    
    <rect x="${x+w-70}" y="${y+12}" width="26" height="26" rx="4" fill="${theme.button}"/>
    <text x="${x+w-57}" y="${y+29}" font-size="14" text-anchor="middle" fill="${theme.textMuted}">🗄️</text>
    
    <rect x="${x+w-40}" y="${y+12}" width="26" height="26" rx="4" fill="${theme.button}"/>
    <text x="${x+w-27}" y="${y+29}" font-size="12" text-anchor="middle" fill="${theme.textMuted}">⋮</text>
    
    <!-- URL display -->
    <rect x="${x+16}" y="${y+48}" width="${w-32}" height="28" rx="4" fill="${SIMPLE ? '#eee' : 'rgba(0,0,0,0.2)'}"/>
    <text x="${x+26}" y="${y+66}" class="small">https://www.theguardian.com</text>
    
    <!-- Progress bar -->
    <rect x="${x+16}" y="${y+88}" width="${w-32}" height="24" rx="6" fill="${SIMPLE ? '#ddd' : 'rgba(0,0,0,0.3)'}"/>
    <rect x="${x+16}" y="${y+88}" width="${(w-32)*0.42}" height="24" rx="6" fill="${progressFill}"/>
    <text x="${x+w/2}" y="${y+104}" font-size="11" font-weight="bold" fill="white" text-anchor="middle">42 / 100</text>
    
    <!-- Stats row -->
    <g transform="translate(${x+16}, ${y+124})">
      <rect width="${(w-48)/3}" height="50" rx="4" fill="${SIMPLE ? '#f0f0f0' : 'rgba(0,0,0,0.2)'}"/>
      <text x="${(w-48)/6}" y="28" class="value" text-anchor="middle">42</text>
      <text x="${(w-48)/6}" y="42" class="label" text-anchor="middle">Downloaded</text>
    </g>
    
    <g transform="translate(${x+16+(w-32)/3+8}, ${y+124})">
      <rect width="${(w-48)/3}" height="50" rx="4" fill="${SIMPLE ? '#f0f0f0' : 'rgba(0,0,0,0.2)'}"/>
      <text x="${(w-48)/6}" y="28" class="value" text-anchor="middle">156</text>
      <text x="${(w-48)/6}" y="42" class="label" text-anchor="middle">Queued</text>
    </g>
    
    <g transform="translate(${x+16+2*(w-32)/3+16}, ${y+124})">
      <rect width="${(w-48)/3}" height="50" rx="4" fill="${SIMPLE ? '#f0f0f0' : 'rgba(0,0,0,0.2)'}"/>
      <text x="${(w-48)/6}" y="28" class="value" text-anchor="middle" fill="${theme.error}">3</text>
      <text x="${(w-48)/6}" y="42" class="label" text-anchor="middle">Errors</text>
    </g>
    
    <!-- Buttons -->
    <rect x="${x+16}" y="${y+190}" width="${(w-48)/2}" height="36" rx="6" fill="${SIMPLE ? '#90EE90' : theme.buttonPrimary}"/>
    <text x="${x+16+(w-48)/4}" y="${y+213}" class="button-text" text-anchor="middle" fill="${SIMPLE ? '#000' : '#fff'}">Start Crawl</text>
    
    <rect x="${x+16+(w-48)/2+8}" y="${y+190}" width="${(w-48)/2-40}" height="36" rx="6" fill="${SIMPLE ? '#ffb3b3' : theme.buttonDanger}" opacity="0.5"/>
    <text x="${x+16+(w-48)*0.75-12}" y="${y+213}" class="button-text" text-anchor="middle" fill="${SIMPLE ? '#666' : '#666'}">Stop</text>
    
    <rect x="${x+w-56}" y="${y+190}" width="40" height="36" rx="6" fill="${theme.button}"/>
    <text x="${x+w-36}" y="${y+213}" font-size="16" text-anchor="middle" fill="${theme.textMuted}">⚙️</text>
    
    <!-- Label -->
    <text x="${x+w/2}" y="${y+h+20}" class="small" text-anchor="middle">MAIN WINDOW</text>
  </g>`;
}

// Settings modal
function generateSettingsModal(theme, x = 0, y = 0) {
  const w = 280;
  const h = 280;
  
  return `
  <g id="settings-modal">
    <!-- Overlay indicator -->
    <rect x="${x-10}" y="${y-10}" width="${w+20}" height="${h+20}" fill="${SIMPLE ? '#ccc' : 'rgba(0,0,0,0.5)'}" rx="12"/>
    
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${theme.panel}" stroke="${theme.panelBorder || theme.border}" stroke-width="1" rx="10" ${SIMPLE ? '' : 'filter="url(#shadow)"'}/>
    
    <text x="${x+20}" y="${y+30}" class="panel-title">⚙️ Settings</text>
    
    <!-- Form fields -->
    <text x="${x+20}" y="${y+55}" class="label">Start URL</text>
    <rect x="${x+20}" y="${y+60}" width="${w-40}" height="28" rx="4" fill="${SIMPLE ? '#fff' : 'rgba(0,0,0,0.3)'}" stroke="${SIMPLE ? '#ccc' : 'rgba(255,255,255,0.1)'}"/>
    <text x="${x+28}" y="${y+78}" class="small">https://www.theguardian.com</text>
    
    <g transform="translate(${x+20}, ${y+100})">
      <text y="0" class="label">Max Pages</text>
      <rect y="5" width="110" height="28" rx="4" fill="${SIMPLE ? '#fff' : 'rgba(0,0,0,0.3)'}" stroke="${SIMPLE ? '#ccc' : 'rgba(255,255,255,0.1)'}"/>
      <text x="8" y="23" class="small">100</text>
    </g>
    
    <g transform="translate(${x+140}, ${y+100})">
      <text y="0" class="label">Concurrency</text>
      <rect y="5" width="110" height="28" rx="4" fill="${SIMPLE ? '#fff' : 'rgba(0,0,0,0.3)'}" stroke="${SIMPLE ? '#ccc' : 'rgba(255,255,255,0.1)'}"/>
      <text x="8" y="23" class="small">2</text>
    </g>
    
    <g transform="translate(${x+20}, ${y+150})">
      <text y="0" class="label">Max Depth</text>
      <rect y="5" width="110" height="28" rx="4" fill="${SIMPLE ? '#fff' : 'rgba(0,0,0,0.3)'}" stroke="${SIMPLE ? '#ccc' : 'rgba(255,255,255,0.1)'}"/>
      <text x="8" y="23" class="small">3</text>
    </g>
    
    <g transform="translate(${x+140}, ${y+150})">
      <text y="0" class="label">Timeout (ms)</text>
      <rect y="5" width="110" height="28" rx="4" fill="${SIMPLE ? '#fff' : 'rgba(0,0,0,0.3)'}" stroke="${SIMPLE ? '#ccc' : 'rgba(255,255,255,0.1)'}"/>
      <text x="8" y="23" class="small">60000</text>
    </g>
    
    <!-- Buttons -->
    <rect x="${x+20}" y="${y+h-50}" width="110" height="32" rx="6" fill="${theme.button}"/>
    <text x="${x+75}" y="${y+h-30}" class="button-text" text-anchor="middle" fill="${theme.buttonText}">Cancel</text>
    
    <rect x="${x+140}" y="${y+h-50}" width="110" height="32" rx="6" fill="${theme.success}"/>
    <text x="${x+195}" y="${y+h-30}" class="button-text" text-anchor="middle" fill="${SIMPLE ? '#000' : '#1a1a2e'}">Save</text>
    
    <!-- Label -->
    <text x="${x+w/2}" y="${y+h+30}" class="small" text-anchor="middle">SETTINGS MODAL</text>
  </g>`;
}

// URL list panel
function generateUrlListPanel(theme, x = 0, y = 0) {
  const w = 280;
  const h = 300;
  
  const urlItems = [
    { index: 1, url: 'theguardian.com/world/...' },
    { index: 2, url: 'theguardian.com/uk-news/...' },
    { index: 3, url: 'theguardian.com/sport/...' },
    { index: 4, url: 'theguardian.com/tech/...' },
  ];
  
  return `
  <g id="url-list-panel">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${theme.panel}" stroke="${theme.panelBorder || theme.border}" stroke-width="1" rx="8" ${SIMPLE ? '' : 'filter="url(#shadow)"'}/>
    
    <!-- Header -->
    <rect x="${x}" y="${y}" width="${w}" height="40" rx="8" fill="${theme.panel}"/>
    <rect x="${x}" y="${y+32}" width="${w}" height="8" fill="${theme.panel}"/>
    <line x1="${x}" y1="${y+40}" x2="${x+w}" y2="${y+40}" stroke="${theme.panelBorder || theme.border}"/>
    
    <text x="${x+16}" y="${y+26}" class="panel-title">📋 Downloaded URLs</text>
    
    <rect x="${x+w-34}" y="${y+10}" width="22" height="22" rx="4" fill="${theme.button}"/>
    <text x="${x+w-23}" y="${y+25}" font-size="14" text-anchor="middle" fill="${theme.textMuted}">✕</text>
    
    <!-- URL items -->
    ${urlItems.map((item, i) => `
    <g transform="translate(${x+12}, ${y+52 + i*54})">
      <rect width="${w-24}" height="46" rx="4" fill="${SIMPLE ? '#f5f5f5' : 'rgba(0,0,0,0.2)'}"/>
      <text x="10" y="16" font-size="10" font-weight="bold" fill="${theme.success}">#${item.index}</text>
      <text x="10" y="30" class="small">${item.url}</text>
      <text x="10" y="42" font-size="8" fill="${theme.textMuted}">14:23:45</text>
    </g>
    `).join('')}
    
    <!-- Label -->
    <text x="${x+w/2}" y="${y+h+20}" class="small" text-anchor="middle">URL LIST PANEL</text>
  </g>`;
}

// Context menu
function generateContextMenu(theme, x = 0, y = 0) {
  const w = 160;
  const items = [
    { icon: '📋', label: 'Copy URL' },
    { icon: '🌐', label: 'Open in Browser' },
    { divider: true },
    { icon: '🔍', label: 'Analyze' },
    { icon: '📄', label: 'View Content' },
  ];
  
  let h = 12; // padding
  items.forEach(item => {
    h += item.divider ? 10 : 28;
  });
  
  let content = '';
  let yOffset = 6;
  
  items.forEach(item => {
    if (item.divider) {
      content += `<line x1="${x+10}" y1="${y+yOffset+5}" x2="${x+w-10}" y2="${y+yOffset+5}" stroke="${SIMPLE ? '#ccc' : 'rgba(255,255,255,0.1)'}"/>`;
      yOffset += 10;
    } else {
      content += `
        <g transform="translate(${x}, ${y+yOffset})">
          <rect width="${w}" height="28" fill="transparent"/>
          <text x="14" y="19" font-size="12">${item.icon}</text>
          <text x="36" y="18" class="menu-item">${item.label}</text>
        </g>
      `;
      yOffset += 28;
    }
  });
  
  return `
  <g id="context-menu">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${SIMPLE ? '#fff' : '#2a2a3e'}" stroke="${SIMPLE ? '#ccc' : 'rgba(255,255,255,0.1)'}" rx="8" ${SIMPLE ? '' : 'filter="url(#shadow)"'}/>
    ${content}
    
    <!-- Label -->
    <text x="${x+w/2}" y="${y+h+20}" class="small" text-anchor="middle">CONTEXT MENU</text>
  </g>`;
}

// Dropdown menu
function generateDropdownMenu(theme, x = 0, y = 0) {
  const w = 170;
  const items = [
    { icon: '📁', label: 'Export URLs' },
    { icon: '📄', label: 'Open Log File' },
    { divider: true },
    { icon: '🔄', label: 'Clear Session' },
    { icon: '🗑️', label: 'Clear DB Cache', danger: true },
    { divider: true },
    { icon: 'ℹ️', label: 'About' },
  ];
  
  let h = 12;
  items.forEach(item => {
    h += item.divider ? 10 : 32;
  });
  
  let content = '';
  let yOffset = 6;
  
  items.forEach(item => {
    if (item.divider) {
      content += `<line x1="${x+10}" y1="${y+yOffset+5}" x2="${x+w-10}" y2="${y+yOffset+5}" stroke="${SIMPLE ? '#ccc' : 'rgba(255,255,255,0.1)'}"/>`;
      yOffset += 10;
    } else {
      const textColor = item.danger ? theme.error : theme.text;
      content += `
        <g transform="translate(${x}, ${y+yOffset})">
          <rect width="${w}" height="32" fill="transparent"/>
          <text x="14" y="21" font-size="12">${item.icon}</text>
          <text x="40" y="20" class="menu-item" fill="${textColor}">${item.label}</text>
        </g>
      `;
      yOffset += 32;
    }
  });
  
  return `
  <g id="dropdown-menu">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${SIMPLE ? '#fff' : '#2a2a3e'}" stroke="${SIMPLE ? '#ccc' : 'rgba(255,255,255,0.1)'}" rx="8" ${SIMPLE ? '' : 'filter="url(#shadow)"'}/>
    ${content}
    
    <!-- Label -->
    <text x="${x+w/2}" y="${y+h+20}" class="small" text-anchor="middle">MORE MENU (⋮)</text>
  </g>`;
}

// Database stats panel
function generateDbStatsPanel(theme, x = 0, y = 0) {
  const w = 280;
  const h = 280;
  
  const stats = [
    { value: '55,520', label: 'Total URLs' },
    { value: '48,234', label: 'HTTP Responses' },
    { value: '1,247', label: 'Fetched Today' },
    { value: '156', label: 'Unique Hosts' },
    { value: '2.4 GB', label: 'Content Storage', sub: '48,234 items', wide: true },
    { value: '14:23:45', label: 'Last Fetch', sub: 'theguardian.com/...', wide: true },
  ];
  
  return `
  <g id="db-stats-panel">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${theme.panel}" stroke="${theme.panelBorder || theme.border}" stroke-width="1" rx="8" ${SIMPLE ? '' : 'filter="url(#shadow)"'}/>
    
    <!-- Header -->
    <line x1="${x}" y1="${y+40}" x2="${x+w}" y2="${y+40}" stroke="${theme.panelBorder || theme.border}"/>
    <text x="${x+16}" y="${y+26}" class="panel-title">🗄️ Database Stats</text>
    
    <rect x="${x+w-34}" y="${y+10}" width="22" height="22" rx="4" fill="${theme.button}"/>
    <text x="${x+w-23}" y="${y+25}" font-size="14" text-anchor="middle" fill="${theme.textMuted}">✕</text>
    
    <!-- Stats grid -->
    <g transform="translate(${x+12}, ${y+52})">
      <!-- Row 1 -->
      <rect width="122" height="60" rx="6" fill="${SIMPLE ? '#f5f5f5' : 'rgba(0,0,0,0.2)'}"/>
      <text x="61" y="30" class="value" text-anchor="middle">55,520</text>
      <text x="61" y="48" class="label" text-anchor="middle">Total URLs</text>
      
      <rect x="132" width="122" height="60" rx="6" fill="${SIMPLE ? '#f5f5f5' : 'rgba(0,0,0,0.2)'}"/>
      <text x="193" y="30" class="value" text-anchor="middle">48,234</text>
      <text x="193" y="48" class="label" text-anchor="middle">HTTP Responses</text>
      
      <!-- Row 2 -->
      <rect y="68" width="122" height="60" rx="6" fill="${SIMPLE ? '#f5f5f5' : 'rgba(0,0,0,0.2)'}"/>
      <text x="61" y="98" class="value" text-anchor="middle">1,247</text>
      <text x="61" y="116" class="label" text-anchor="middle">Fetched Today</text>
      
      <rect x="132" y="68" width="122" height="60" rx="6" fill="${SIMPLE ? '#f5f5f5' : 'rgba(0,0,0,0.2)'}"/>
      <text x="193" y="98" class="value" text-anchor="middle">156</text>
      <text x="193" y="116" class="label" text-anchor="middle">Unique Hosts</text>
      
      <!-- Row 3 (wide) -->
      <rect y="136" width="254" height="70" rx="6" fill="${SIMPLE ? '#f5f5f5' : 'rgba(0,0,0,0.2)'}"/>
      <text x="127" y="160" class="value" text-anchor="middle">2.4 GB</text>
      <text x="127" y="178" class="label" text-anchor="middle">Content Storage</text>
      <text x="127" y="194" font-size="9" fill="${theme.textMuted}" text-anchor="middle">48,234 items</text>
    </g>
    
    <!-- Label -->
    <text x="${x+w/2}" y="${y+h+20}" class="small" text-anchor="middle">DATABASE STATS PANEL</text>
  </g>`;
}

// Analysis panel
function generateAnalysisPanel(theme, x = 0, y = 0) {
  const w = 280;
  const h = 340;
  
  return `
  <g id="analysis-panel">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${theme.panel}" stroke="${theme.panelBorder || theme.border}" stroke-width="1" rx="8" ${SIMPLE ? '' : 'filter="url(#shadow)"'}/>
    
    <!-- Header -->
    <line x1="${x}" y1="${y+40}" x2="${x+w}" y2="${y+40}" stroke="${theme.panelBorder || theme.border}"/>
    <text x="${x+16}" y="${y+26}" class="panel-title">🔍 URL Analysis</text>
    
    <rect x="${x+w-34}" y="${y+10}" width="22" height="22" rx="4" fill="${theme.button}"/>
    <text x="${x+w-23}" y="${y+25}" font-size="14" text-anchor="middle" fill="${theme.textMuted}">✕</text>
    
    <!-- Back button -->
    <rect x="${x+12}" y="${y+52}" width="80" height="24" rx="4" fill="${theme.button}"/>
    <text x="${x+52}" y="${y+68}" font-size="10" text-anchor="middle" fill="${theme.textMuted}">← Back</text>
    
    <!-- URL section -->
    <text x="${x+12}" y="${y+96}" class="label">URL</text>
    <rect x="${x+12}" y="${y+102}" width="${w-24}" height="36" rx="4" fill="${SIMPLE ? '#f5f5f5' : 'rgba(0,0,0,0.2)'}"/>
    <text x="${x+20}" y="${y+118}" class="small">https://www.theguardian.com</text>
    <text x="${x+20}" y="${y+130}" class="small">/world/2026/jan/03/...</text>
    
    <!-- HTTP Response section -->
    <text x="${x+12}" y="${y+158}" class="label">HTTP Response</text>
    <g transform="translate(${x+12}, ${y+166})">
      <rect width="122" height="44" rx="4" fill="${SIMPLE ? '#f5f5f5' : 'rgba(0,0,0,0.2)'}"/>
      <text x="8" y="14" font-size="8" fill="${theme.textMuted}">STATUS</text>
      <text x="8" y="32" font-size="13" fill="${theme.success}">200</text>
      
      <rect x="132" width="122" height="44" rx="4" fill="${SIMPLE ? '#f5f5f5' : 'rgba(0,0,0,0.2)'}"/>
      <text x="140" y="14" font-size="8" fill="${theme.textMuted}">SIZE</text>
      <text x="140" y="32" font-size="13" fill="${theme.text}">124.5 KB</text>
    </g>
    
    <g transform="translate(${x+12}, ${y+218})">
      <rect width="122" height="44" rx="4" fill="${SIMPLE ? '#f5f5f5' : 'rgba(0,0,0,0.2)'}"/>
      <text x="8" y="14" font-size="8" fill="${theme.textMuted}">TTFB</text>
      <text x="8" y="32" font-size="13" fill="${theme.text}">234ms</text>
      
      <rect x="132" width="122" height="44" rx="4" fill="${SIMPLE ? '#f5f5f5' : 'rgba(0,0,0,0.2)'}"/>
      <text x="140" y="14" font-size="8" fill="${theme.textMuted}">TOTAL TIME</text>
      <text x="140" y="32" font-size="13" fill="${theme.text}">456ms</text>
    </g>
    
    <!-- Database section -->
    <text x="${x+12}" y="${y+282}" class="label">Database Record</text>
    <g transform="translate(${x+12}, ${y+290})">
      <rect width="122" height="36" rx="4" fill="${SIMPLE ? '#f5f5f5' : 'rgba(0,0,0,0.2)'}"/>
      <text x="8" y="13" font-size="8" fill="${theme.textMuted}">URL ID</text>
      <text x="8" y="28" font-size="12" fill="${theme.text}">45,231</text>
      
      <rect x="132" width="122" height="36" rx="4" fill="${SIMPLE ? '#f5f5f5' : 'rgba(0,0,0,0.2)'}"/>
      <text x="140" y="13" font-size="8" fill="${theme.textMuted}">HOST</text>
      <text x="140" y="28" font-size="11" fill="${theme.text}">theguardian.com</text>
    </g>
    
    <!-- Label -->
    <text x="${x+w/2}" y="${y+h+20}" class="small" text-anchor="middle">ANALYSIS PANEL</text>
  </g>`;
}

// Toast notification
function generateToast(theme, x = 0, y = 0) {
  const w = 200;
  const h = 36;
  
  return `
  <g id="toast">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${SIMPLE ? '#fff' : '#2a2a3e'}" stroke="${theme.success}" stroke-width="0" rx="6" ${SIMPLE ? 'stroke="#ccc"' : 'filter="url(#shadow)"'}/>
    <rect x="${x}" y="${y}" width="3" height="${h}" fill="${theme.success}" rx="2"/>
    <text x="${x+16}" y="${y+23}" font-size="12" fill="${theme.text}">✓ URL copied to clipboard</text>
    
    <!-- Label -->
    <text x="${x+w/2}" y="${y+h+16}" class="small" text-anchor="middle">TOAST NOTIFICATION</text>
  </g>`;
}

function generateMasterSVG() {
  const theme = getTheme();
  const width = 1100;
  const height = 800;
  
  const bgRect = SIMPLE 
    ? `<rect width="${width}" height="${height}" fill="#f0f0f0"/>`
    : `<rect width="${width}" height="${height}" fill="${theme.bg}"/>
       <rect width="${width}" height="${height}" fill="url(#bgGrad)" opacity="0.5"/>`;
  
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  ${generateDefs(theme)}
  
  ${bgRect}
  
  <!-- Title -->
  <text x="${width/2}" y="35" font-size="20" font-weight="bold" fill="${theme.accent || theme.text}" text-anchor="middle" letter-spacing="2">
    ${SIMPLE ? 'CRAWLER APP UI MOCKUPS' : 'CRAWLER APP UI MOCKUPS'}
  </text>
  <text x="${width/2}" y="55" font-size="11" fill="${theme.textMuted}" text-anchor="middle">
    Main window and hidden/popup views
  </text>
  
  <!-- Row 1: Main + Settings + URL List -->
  ${generateMainWindow(theme, 40, 90)}
  ${generateSettingsModal(theme, 400, 100)}
  ${generateUrlListPanel(theme, 720, 80)}
  
  <!-- Row 2: Menus + DB Stats + Analysis -->
  ${generateContextMenu(theme, 40, 420)}
  ${generateDropdownMenu(theme, 230, 420)}
  ${generateDbStatsPanel(theme, 440, 420)}
  ${generateAnalysisPanel(theme, 760, 410)}
  
  <!-- Toast at bottom -->
  ${generateToast(theme, 40, 740)}
  
</svg>`;
  
  return svg;
}

function main() {
  if (flags.help || flags.h) {
    console.log(`
crawler-ui-mockups - Generate SVG mockups of the crawler app UI

OPTIONS:
  --simple         Generate simple B&W version
  --output <dir>   Output directory (default: tmp)
  --help, -h       Show this help

EXAMPLES:
  node tools/dev/crawler-ui-mockups.js --simple
  node tools/dev/crawler-ui-mockups.js --output docs/designs
`);
    return;
  }
  
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  const suffix = SIMPLE ? '-simple' : '-wlilo';
  const filename = `crawler-ui-mockups${suffix}.svg`;
  const outputPath = path.join(OUTPUT_DIR, filename);
  
  const svg = generateMasterSVG();
  fs.writeFileSync(outputPath, svg);
  
  console.log(`Generated: ${outputPath}`);
  console.log(`Style: ${SIMPLE ? 'Simple B&W' : 'WLILO themed'}`);
}

main();
