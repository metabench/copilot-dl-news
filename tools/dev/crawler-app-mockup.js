#!/usr/bin/env node
"use strict";

/**
 * Crawler App Mockup Generator
 * 
 * Creates SVG mockups showing mobile-app-like design for the Electron crawler.
 * Focus: Hidden complexity, flexible navigation, clean aesthetic.
 * 
 * Usage:
 *   node tools/dev/crawler-app-mockup.js --output tmp/crawler-app-mockup.svg
 *   node tools/dev/crawler-app-mockup.js --simple --output tmp/crawler-app-mockup-simple.svg
 */

const fs = require("fs");
const path = require("path");

// Parse CLI args
const args = process.argv.slice(2);
const isSimple = args.includes("--simple");
const outputIndex = args.indexOf("--output");
const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : null;

// Theme colors
const SIMPLE = {
  bg: "#ffffff",
  bgCard: "#f5f5f5",
  text: "#1a1a1a",
  textMuted: "#666666",
  textDim: "#999999",
  accent: "#22c55e",
  accentDark: "#16a34a",
  error: "#dc2626",
  warning: "#f59e0b",
  border: "#e5e5e5",
  progressBg: "#e5e5e5",
};

const WLILO = {
  // Obsidian backgrounds
  bg: "#0a0d14",
  bgCard: "#141824",
  bgCardHover: "#1a2030",
  bgDark: "#050508",
  
  // Gold accents
  gold: "#c9a227",
  goldDim: "#8b7320",
  goldGlow: "rgba(201, 162, 39, 0.15)",
  
  // Status colors
  success: "#4ade80",
  successDark: "#22c55e",
  error: "#ff6b6b",
  warning: "#ffc87c",
  info: "#6fa8dc",
  
  // Text
  text: "#e8e8e8",
  textMuted: "#94a3b8",
  textDim: "#64748b",
  
  // Other
  border: "rgba(51, 65, 85, 0.5)",
  progressBg: "rgba(0, 0, 0, 0.3)",
};

const theme = isSimple ? SIMPLE : WLILO;

function generateDefs() {
  if (isSimple) return "";
  
  return `
  <defs>
    <!-- Background gradient -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#0a0d14"/>
      <stop offset="100%" style="stop-color:#141824"/>
    </linearGradient>
    
    <!-- Progress bar gradient -->
    <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#22c55e"/>
      <stop offset="100%" style="stop-color:#4ade80"/>
    </linearGradient>
    
    <!-- Card glow -->
    <filter id="cardGlow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="rgba(0,0,0,0.3)"/>
    </filter>
    
    <!-- Gold glow for accents -->
    <filter id="goldGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    
    <!-- Pulse animation -->
    <style>
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      .pulse { animation: pulse 2s ease-in-out infinite; }
    </style>
  </defs>`;
}

function generatePhone(x, y, width, height, content, label) {
  const radius = 24;
  const notchWidth = 60;
  const notchHeight = 20;
  
  const bg = isSimple ? theme.bg : "url(#bgGrad)";
  const bezel = isSimple ? "#1a1a1a" : "#0a0a0f";
  
  return `
  <!-- Phone frame: ${label} -->
  <g transform="translate(${x}, ${y})">
    <!-- Phone bezel -->
    <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}"
          fill="${bezel}" stroke="${isSimple ? '#333' : '#333'}" stroke-width="2"/>
    
    <!-- Screen -->
    <rect x="4" y="4" width="${width - 8}" height="${height - 8}" rx="${radius - 2}" ry="${radius - 2}"
          fill="${bg}"/>
    
    <!-- Notch -->
    <rect x="${(width - notchWidth) / 2}" y="4" width="${notchWidth}" height="${notchHeight}"
          rx="10" ry="10" fill="${bezel}"/>
    
    <!-- Content area -->
    <g transform="translate(16, 40)">
      ${content}
    </g>
    
    <!-- Home indicator -->
    <rect x="${(width - 80) / 2}" y="${height - 16}" width="80" height="4" rx="2" ry="2"
          fill="${isSimple ? '#ccc' : '#333'}"/>
    
    <!-- Label -->
    <text x="${width / 2}" y="${height + 24}" text-anchor="middle"
          font-family="Georgia, serif" font-size="12" fill="${theme.textMuted}"
          letter-spacing="1">${label}</text>
  </g>`;
}

function generateHomeScreen() {
  const w = 248; // Content width (280 - 32 padding)
  const accent = isSimple ? theme.accent : theme.success;
  const cardBg = isSimple ? theme.bgCard : theme.bgCard;
  
  return `
    <!-- Status bar -->
    <text x="0" y="0" font-family="Inter, system-ui" font-size="11" fill="${theme.textDim}">9:41</text>
    <text x="${w}" y="0" text-anchor="end" font-family="Inter, system-ui" font-size="11" fill="${theme.textDim}">100% 🔋</text>
    
    <!-- Title -->
    <text x="${w / 2}" y="40" text-anchor="middle" font-family="Georgia, serif" font-size="18" 
          fill="${isSimple ? theme.text : theme.gold}" font-weight="500">🕷️ Crawler</text>
    
    <!-- Big circular progress -->
    <g transform="translate(${w / 2}, 130)">
      <!-- Outer ring -->
      <circle cx="0" cy="0" r="70" fill="none" stroke="${theme.progressBg}" stroke-width="8"/>
      <circle cx="0" cy="0" r="70" fill="none" stroke="${accent}" stroke-width="8"
              stroke-dasharray="330" stroke-dashoffset="110" stroke-linecap="round"
              transform="rotate(-90)"/>
      
      <!-- Inner content -->
      <text x="0" y="-8" text-anchor="middle" font-family="Inter, system-ui" font-size="32" 
            font-weight="600" fill="${theme.text}">42</text>
      <text x="0" y="12" text-anchor="middle" font-family="Inter, system-ui" font-size="11" 
            fill="${theme.textMuted}">of 100 pages</text>
    </g>
    
    <!-- Stats row -->
    <g transform="translate(0, 230)">
      ${generateStatPill(0, "📥", "Queue", "156", w / 3 - 6)}
      ${generateStatPill(w / 3 + 3, "⚡", "Rate", "2.3/s", w / 3 - 6)}
      ${generateStatPill(2 * w / 3 + 6, "❌", "Errors", "3", w / 3 - 6)}
    </g>
    
    <!-- URL display (tappable card) -->
    <g transform="translate(0, 290)">
      <rect x="0" y="0" width="${w}" height="56" rx="12" ry="12" fill="${cardBg}"
            ${isSimple ? '' : 'filter="url(#cardGlow)"'}/>
      <text x="12" y="20" font-family="Inter, system-ui" font-size="10" fill="${theme.textDim}"
            text-transform="uppercase" letter-spacing="0.5">Target</text>
      <text x="12" y="40" font-family="Inter, system-ui" font-size="12" fill="${theme.textMuted}">
        theguardian.com/world/...</text>
      <text x="${w - 12}" y="32" text-anchor="end" font-family="Inter, system-ui" font-size="14" 
            fill="${isSimple ? theme.accent : theme.gold}">→</text>
    </g>
    
    <!-- Action button -->
    <g transform="translate(0, 370)">
      <rect x="0" y="0" width="${w}" height="48" rx="24" ry="24"
            fill="${isSimple ? theme.accent : 'url(#progressGrad)'}"/>
      <text x="${w / 2}" y="30" text-anchor="middle" font-family="Inter, system-ui" font-size="14"
            font-weight="600" fill="white">⏸ Pause Crawl</text>
    </g>
    
    <!-- Bottom nav dots -->
    <g transform="translate(${w / 2 - 30}, 440)">
      <circle cx="0" cy="0" r="4" fill="${accent}"/>
      <circle cx="20" cy="0" r="4" fill="${theme.textDim}"/>
      <circle cx="40" cy="0" r="4" fill="${theme.textDim}"/>
      <circle cx="60" cy="0" r="4" fill="${theme.textDim}"/>
    </g>
  `;
}

function generateStatPill(x, icon, label, value, width) {
  const bg = isSimple ? theme.bgCard : theme.bgCard;
  
  return `
    <g transform="translate(${x}, 0)">
      <rect x="0" y="0" width="${width}" height="44" rx="10" ry="10" fill="${bg}"/>
      <text x="${width / 2}" y="18" text-anchor="middle" font-size="12">${icon}</text>
      <text x="${width / 2}" y="34" text-anchor="middle" font-family="Inter, system-ui" font-size="11"
            font-weight="600" fill="${theme.text}">${value}</text>
    </g>
  `;
}

function generateUrlListScreen() {
  const w = 248;
  const cardBg = isSimple ? theme.bgCard : theme.bgCard;
  const accent = isSimple ? theme.accent : theme.success;
  
  return `
    <!-- Status bar -->
    <text x="0" y="0" font-family="Inter, system-ui" font-size="11" fill="${theme.textDim}">9:41</text>
    
    <!-- Header with back -->
    <text x="0" y="40" font-family="Inter, system-ui" font-size="14" fill="${accent}">← Back</text>
    <text x="${w / 2}" y="40" text-anchor="middle" font-family="Georgia, serif" font-size="16" 
          fill="${isSimple ? theme.text : theme.gold}">Downloaded</text>
    <text x="${w}" y="40" text-anchor="end" font-family="Inter, system-ui" font-size="10" 
          fill="${theme.textMuted}">42 items</text>
    
    <!-- Search bar -->
    <g transform="translate(0, 60)">
      <rect x="0" y="0" width="${w}" height="40" rx="10" ry="10" fill="${cardBg}"/>
      <text x="14" y="25" font-family="Inter, system-ui" font-size="13" fill="${theme.textDim}">
        🔍 Filter URLs...</text>
    </g>
    
    <!-- URL list items -->
    ${generateUrlItem(0, 110, w, 1, "theguardian.com/world/2026/jan/03/breaking-news", "14:23", 200, true)}
    ${generateUrlItem(0, 176, w, 2, "theguardian.com/uk-news/article/latest-update", "14:23", 200, false)}
    ${generateUrlItem(0, 242, w, 3, "bbc.com/news/world-europe-breaking", "14:22", 200, false)}
    ${generateUrlItem(0, 308, w, 4, "reuters.com/world/asia/china-economy", "14:22", 304, false)}
    ${generateUrlItem(0, 374, w, 5, "nytimes.com/2026/01/03/world/article.html", "14:22", 404, false)}
    
    <!-- Scroll indicator -->
    <rect x="${w - 4}" y="110" width="4" height="80" rx="2" ry="2" fill="${theme.textDim}" opacity="0.3"/>
  `;
}

function generateUrlItem(x, y, width, index, url, time, status, selected) {
  const cardBg = isSimple ? (selected ? "#e8f5e9" : theme.bgCard) : (selected ? theme.bgCardHover : theme.bgCard);
  const accent = isSimple ? theme.accent : theme.success;
  const statusColor = status === 200 ? accent : (status === 304 ? theme.warning : theme.error);
  
  return `
    <g transform="translate(${x}, ${y})">
      <rect x="0" y="0" width="${width}" height="58" rx="10" ry="10" fill="${cardBg}"
            ${!isSimple && selected ? `stroke="${theme.gold}" stroke-width="1"` : ''}/>
      
      <!-- Status dot -->
      <circle cx="14" cy="29" r="5" fill="${statusColor}"/>
      
      <!-- Content -->
      <text x="28" y="20" font-family="Inter, system-ui" font-size="10" fill="${accent}"
            font-weight="600">#${index}</text>
      <text x="${width - 12}" y="20" text-anchor="end" font-family="Inter, system-ui" font-size="10" 
            fill="${theme.textDim}">${time}</text>
      <text x="28" y="38" font-family="JetBrains Mono, monospace" font-size="10" fill="${theme.textMuted}">
        ${url.substring(0, 38)}${url.length > 38 ? '...' : ''}</text>
      <text x="28" y="52" font-family="Inter, system-ui" font-size="9" fill="${theme.textDim}">
        ${status === 200 ? '✓ 127KB' : status === 304 ? '↻ Cached' : '✗ Not Found'}</text>
    </g>
  `;
}

function generateDetailScreen() {
  const w = 248;
  const cardBg = isSimple ? theme.bgCard : theme.bgCard;
  const accent = isSimple ? theme.accent : theme.success;
  
  return `
    <!-- Status bar -->
    <text x="0" y="0" font-family="Inter, system-ui" font-size="11" fill="${theme.textDim}">9:41</text>
    
    <!-- Header with back -->
    <text x="0" y="40" font-family="Inter, system-ui" font-size="14" fill="${accent}">← Back</text>
    <text x="${w / 2}" y="40" text-anchor="middle" font-family="Georgia, serif" font-size="16" 
          fill="${isSimple ? theme.text : theme.gold}">Details</text>
    
    <!-- URL card -->
    <g transform="translate(0, 60)">
      <rect x="0" y="0" width="${w}" height="52" rx="10" ry="10" fill="${cardBg}"/>
      <text x="12" y="18" font-family="Inter, system-ui" font-size="10" fill="${theme.textDim}"
            text-transform="uppercase">URL</text>
      <text x="12" y="38" font-family="JetBrains Mono, monospace" font-size="10" fill="${theme.textMuted}">
        theguardian.com/world/2026/...</text>
    </g>
    
    <!-- Status card -->
    <g transform="translate(0, 122)">
      <rect x="0" y="0" width="${w}" height="44" rx="10" ry="10" fill="${cardBg}"/>
      <text x="12" y="28" font-family="Inter, system-ui" font-size="24" fill="${accent}"
            font-weight="600">200 OK</text>
      <text x="${w - 12}" y="28" text-anchor="end" font-family="Inter, system-ui" font-size="12" 
            fill="${theme.textMuted}">text/html</text>
    </g>
    
    <!-- Timing visualization -->
    <g transform="translate(0, 180)">
      <text x="0" y="14" font-family="Inter, system-ui" font-size="10" fill="${theme.textDim}"
            text-transform="uppercase" letter-spacing="0.5">Timing Breakdown</text>
      
      <!-- Timing bar -->
      <g transform="translate(0, 24)">
        <!-- DNS -->
        <rect x="0" y="0" width="30" height="24" rx="4" fill="#6fa8dc"/>
        <text x="15" y="15" text-anchor="middle" font-family="Inter" font-size="8" fill="white">DNS</text>
        
        <!-- Connect -->
        <rect x="32" y="0" width="50" height="24" rx="4" fill="#da70d6"/>
        <text x="57" y="15" text-anchor="middle" font-family="Inter" font-size="8" fill="white">TCP</text>
        
        <!-- TTFB -->
        <rect x="84" y="0" width="80" height="24" rx="4" fill="${isSimple ? theme.accent : theme.success}"/>
        <text x="124" y="15" text-anchor="middle" font-family="Inter" font-size="8" fill="white">TTFB</text>
        
        <!-- Download -->
        <rect x="166" y="0" width="82" height="24" rx="4" fill="${isSimple ? theme.accent : theme.gold}"/>
        <text x="207" y="15" text-anchor="middle" font-family="Inter" font-size="8" fill="white">Download</text>
      </g>
      
      <!-- Timing labels -->
      <text x="0" y="64" font-family="Inter, system-ui" font-size="9" fill="${theme.textDim}">45ms</text>
      <text x="32" y="64" font-family="Inter, system-ui" font-size="9" fill="${theme.textDim}">89ms</text>
      <text x="84" y="64" font-family="Inter, system-ui" font-size="9" fill="${theme.textDim}">234ms</text>
      <text x="166" y="64" font-family="Inter, system-ui" font-size="9" fill="${theme.textDim}">88ms</text>
      <text x="${w}" y="64" text-anchor="end" font-family="Inter, system-ui" font-size="9" 
            font-weight="600" fill="${theme.text}">= 456ms</text>
    </g>
    
    <!-- Metrics grid -->
    <g transform="translate(0, 270)">
      ${generateMetricCard(0, 0, w / 2 - 6, "Size", "127 KB")}
      ${generateMetricCard(w / 2 + 6, 0, w / 2 - 6, "Compression", "gzip 42%")}
      ${generateMetricCard(0, 60, w / 2 - 6, "Cache", "MISS")}
      ${generateMetricCard(w / 2 + 6, 60, w / 2 - 6, "Downloads", "3×")}
    </g>
    
    <!-- Action buttons -->
    <g transform="translate(0, 400)">
      <rect x="0" y="0" width="${w / 2 - 6}" height="40" rx="10" ry="10" fill="${cardBg}"/>
      <text x="${w / 4 - 3}" y="26" text-anchor="middle" font-family="Inter" font-size="12" 
            fill="${theme.text}">📋 Copy</text>
      
      <rect x="${w / 2 + 6}" y="0" width="${w / 2 - 6}" height="40" rx="10" ry="10" fill="${cardBg}"/>
      <text x="${3 * w / 4 + 3}" y="26" text-anchor="middle" font-family="Inter" font-size="12" 
            fill="${theme.text}">🌐 Open</text>
    </g>
  `;
}

function generateMetricCard(x, y, width, label, value) {
  const cardBg = isSimple ? theme.bgCard : theme.bgCard;
  
  return `
    <g transform="translate(${x}, ${y})">
      <rect x="0" y="0" width="${width}" height="52" rx="10" ry="10" fill="${cardBg}"/>
      <text x="12" y="20" font-family="Inter, system-ui" font-size="10" fill="${theme.textDim}"
            text-transform="uppercase">${label}</text>
      <text x="12" y="40" font-family="Inter, system-ui" font-size="14" font-weight="600" 
            fill="${theme.text}">${value}</text>
    </g>
  `;
}

function generateSettingsScreen() {
  const w = 248;
  const cardBg = isSimple ? theme.bgCard : theme.bgCard;
  const accent = isSimple ? theme.accent : theme.success;
  
  return `
    <!-- Status bar -->
    <text x="0" y="0" font-family="Inter, system-ui" font-size="11" fill="${theme.textDim}">9:41</text>
    
    <!-- Header -->
    <text x="0" y="40" font-family="Inter, system-ui" font-size="14" fill="${accent}">← Back</text>
    <text x="${w / 2}" y="40" text-anchor="middle" font-family="Georgia, serif" font-size="16" 
          fill="${isSimple ? theme.text : theme.gold}">Settings</text>
    
    <!-- Settings sections -->
    <g transform="translate(0, 70)">
      <!-- Section: Crawl Target -->
      <text x="0" y="0" font-family="Inter, system-ui" font-size="10" fill="${theme.textDim}"
            text-transform="uppercase" letter-spacing="0.5">Crawl Target</text>
      <rect x="0" y="10" width="${w}" height="52" rx="10" ry="10" fill="${cardBg}"/>
      <text x="12" y="32" font-family="Inter, system-ui" font-size="10" fill="${theme.textDim}">Start URL</text>
      <text x="12" y="50" font-family="Inter, system-ui" font-size="12" fill="${theme.text}">
        https://www.theguardian.com</text>
    </g>
    
    <g transform="translate(0, 150)">
      <!-- Section: Limits -->
      <text x="0" y="0" font-family="Inter, system-ui" font-size="10" fill="${theme.textDim}"
            text-transform="uppercase" letter-spacing="0.5">Limits</text>
      <rect x="0" y="10" width="${w}" height="110" rx="10" ry="10" fill="${cardBg}"/>
      
      ${generateSettingRow(12, 30, "Max Pages", "100", w - 24)}
      ${generateSettingRow(12, 60, "Max Depth", "3", w - 24)}
      ${generateSettingRow(12, 90, "Timeout", "60s", w - 24)}
    </g>
    
    <g transform="translate(0, 285)">
      <!-- Section: Advanced (collapsed) -->
      <text x="0" y="0" font-family="Inter, system-ui" font-size="10" fill="${theme.textDim}"
            text-transform="uppercase" letter-spacing="0.5">Advanced</text>
      <rect x="0" y="10" width="${w}" height="44" rx="10" ry="10" fill="${cardBg}"/>
      <text x="12" y="38" font-family="Inter, system-ui" font-size="12" fill="${theme.textMuted}">
        Concurrency, Filters, Headers...</text>
      <text x="${w - 12}" y="38" text-anchor="end" font-family="Inter" font-size="14" 
            fill="${theme.textDim}">▸</text>
    </g>
    
    <g transform="translate(0, 360)">
      <!-- Section: Presets -->
      <text x="0" y="0" font-family="Inter, system-ui" font-size="10" fill="${theme.textDim}"
            text-transform="uppercase" letter-spacing="0.5">Presets</text>
      <g transform="translate(0, 14)">
        ${generatePresetChip(0, "Quick (10p)", true)}
        ${generatePresetChip(70, "Standard", false)}
        ${generatePresetChip(150, "Deep", false)}
      </g>
    </g>
    
    <!-- Save button -->
    <g transform="translate(0, 420)">
      <rect x="0" y="0" width="${w}" height="44" rx="22" ry="22"
            fill="${isSimple ? theme.accent : 'url(#progressGrad)'}"/>
      <text x="${w / 2}" y="28" text-anchor="middle" font-family="Inter, system-ui" font-size="14"
            font-weight="600" fill="white">Save Settings</text>
    </g>
  `;
}

function generateSettingRow(x, y, label, value, width) {
  return `
    <text x="${x}" y="${y}" font-family="Inter, system-ui" font-size="12" fill="${theme.textMuted}">${label}</text>
    <text x="${x + width}" y="${y}" text-anchor="end" font-family="Inter, system-ui" font-size="12" 
          font-weight="500" fill="${theme.text}">${value}</text>
  `;
}

function generatePresetChip(x, label, selected) {
  const bg = selected ? (isSimple ? theme.accent : theme.success) : (isSimple ? theme.bgCard : theme.bgCard);
  const textColor = selected ? "white" : theme.textMuted;
  
  return `
    <g transform="translate(${x}, 0)">
      <rect x="0" y="0" width="68" height="28" rx="14" ry="14" fill="${bg}"/>
      <text x="34" y="18" text-anchor="middle" font-family="Inter" font-size="11" fill="${textColor}">${label}</text>
    </g>
  `;
}

function generateNavigationDiagram() {
  const y = 600;
  const accent = isSimple ? theme.accent : theme.gold;
  
  return `
  <!-- Navigation flow diagram -->
  <g transform="translate(0, ${y})">
    <text x="600" y="0" text-anchor="middle" font-family="Georgia, serif" font-size="16" 
          fill="${isSimple ? theme.text : theme.gold}" letter-spacing="2">NAVIGATION FLOW</text>
    
    <!-- Flow arrows -->
    <g transform="translate(70, 30)">
      <!-- Home to URLs -->
      <path d="M 145 -20 Q 220 -50 295 -20" stroke="${accent}" stroke-width="2" fill="none" 
            marker-end="url(#arrowhead)"/>
      <text x="220" y="-45" text-anchor="middle" font-family="Inter" font-size="9" fill="${theme.textDim}">
        tap 📋</text>
      
      <!-- URLs to Detail -->
      <path d="M 430 -20 Q 505 -50 580 -20" stroke="${accent}" stroke-width="2" fill="none"/>
      <text x="505" y="-45" text-anchor="middle" font-family="Inter" font-size="9" fill="${theme.textDim}">
        tap item</text>
      
      <!-- Home to Settings -->
      <path d="M 145 530 Q 220 550 295 530" stroke="${theme.textDim}" stroke-width="1.5" fill="none" 
            stroke-dasharray="4,4"/>
      <text x="220" y="545" text-anchor="middle" font-family="Inter" font-size="9" fill="${theme.textDim}">
        swipe / ⚙️</text>
    </g>
    
    <!-- Gesture hints -->
    <g transform="translate(0, 80)">
      <text x="60" y="0" font-family="Inter" font-size="10" fill="${theme.textMuted}">
        👆 Tap cards → drill down</text>
      <text x="60" y="18" font-family="Inter" font-size="10" fill="${theme.textMuted}">
        👈 Swipe right → go back</text>
      <text x="60" y="36" font-family="Inter" font-size="10" fill="${theme.textMuted}">
        ⟪ Long press → context menu</text>
      <text x="60" y="54" font-family="Inter" font-size="10" fill="${theme.textMuted}">
        👇 Pull down → refresh</text>
    </g>
  </g>`;
}

function generateSVG() {
  const width = 1200;
  const height = 680;
  
  const bg = isSimple ? "#f0f0f0" : theme.bgDark;
  
  // Phone dimensions
  const phoneWidth = 280;
  const phoneHeight = 500;
  const gap = 20;
  
  // Calculate positions for 4 phones
  const startX = (width - (4 * phoneWidth + 3 * gap)) / 2;
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  ${generateDefs()}
  
  <!-- Background -->
  <rect x="0" y="0" width="${width}" height="${height}" fill="${bg}"/>
  
  <!-- Title -->
  <text x="${width / 2}" y="40" text-anchor="middle" font-family="Georgia, serif" font-size="24" 
        fill="${isSimple ? theme.text : theme.gold}" letter-spacing="2">
    🕷️ CRAWLER APP — MOBILE-STYLE NAVIGATION
  </text>
  <text x="${width / 2}" y="62" text-anchor="middle" font-family="Inter, system-ui" font-size="12" 
        fill="${theme.textMuted}">
    Hidden complexity • Flexible navigation • Clean aesthetic
  </text>
  
  <!-- Phone screens -->
  ${generatePhone(startX, 90, phoneWidth, phoneHeight, generateHomeScreen(), "HOME")}
  ${generatePhone(startX + phoneWidth + gap, 90, phoneWidth, phoneHeight, generateUrlListScreen(), "URL LIST")}
  ${generatePhone(startX + 2 * (phoneWidth + gap), 90, phoneWidth, phoneHeight, generateDetailScreen(), "DETAIL")}
  ${generatePhone(startX + 3 * (phoneWidth + gap), 90, phoneWidth, phoneHeight, generateSettingsScreen(), "SETTINGS")}
  
  <!-- Navigation hints -->
  ${generateNavigationDiagram()}
</svg>`;
}

// Main
const svg = generateSVG();

if (outputPath) {
  const fullPath = path.isAbsolute(outputPath) ? outputPath : path.join(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, svg);
  console.log(`Generated: ${fullPath}`);
} else {
  console.log(svg);
}
