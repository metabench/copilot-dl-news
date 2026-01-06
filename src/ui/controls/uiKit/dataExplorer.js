"use strict";

/**
 * Data Explorer UI Kit
 * 
 * Premium jsgui3 controls for the Data Explorer with:
 * - Industrial Luxury Obsidian (WLILO) theming
 * - SVG decorative elements
 * - Drill-down navigation pattern
 * 
 * Components:
 * - DataExplorerPanel - Base panel with SVG corner accents
 * - DataExplorerTabs - Tab navigation with badge counts
 * - DataExplorerUrlList - Paginated URL listing
 * - DataExplorerHistory - Download history for a URL
 * - DataExplorerMetadata - Detailed download metadata
 * 
 * @module src/ui/controls/uiKit/dataExplorer
 */

const { DataExplorerPanel, DataExplorerPanelCSS } = require("./DataExplorerPanel");
const { DataExplorerTabs, DataExplorerTabsCSS } = require("./DataExplorerTabs");
const { DataExplorerUrlList, DataExplorerUrlListCSS } = require("./DataExplorerUrlList");
const { DataExplorerHistory, DataExplorerHistoryCSS } = require("./DataExplorerHistory");
const { DataExplorerMetadata, DataExplorerMetadataCSS } = require("./DataExplorerMetadata");

/**
 * Combined CSS for all Data Explorer components
 * Include this once in your page
 */
const DataExplorerCSS = `
/* ═══════════════════════════════════════════════════════════════════════════════
   DATA EXPLORER UI KIT
   Industrial Luxury Obsidian themed components
   ═══════════════════════════════════════════════════════════════════════════════ */

/* Base variables */
:root {
  --dex-bg-dark: #0a0d14;
  --dex-bg-base: #0f1420;
  --dex-bg-card: #141824;
  --dex-bg-card-hover: #1a1f2e;
  
  --dex-gold: #c9a227;
  --dex-gold-dim: #8b7500;
  --dex-gold-glow: rgba(201, 162, 39, 0.2);
  
  --dex-emerald: #50c878;
  --dex-ruby: #ff6b6b;
  --dex-sapphire: #6fa8dc;
  --dex-amethyst: #da70d6;
  --dex-topaz: #ffc87c;
  
  --dex-text: #cbd5e1;
  --dex-text-muted: #94a3b8;
  --dex-text-dim: #64748b;
  
  --dex-border: rgba(51, 65, 85, 0.5);
  
  --dex-font-body: "Inter", system-ui, -apple-system, sans-serif;
  --dex-font-heading: Georgia, "Playfair Display", serif;
  --dex-font-mono: "JetBrains Mono", "Fira Code", "Consolas", monospace;
  
  --dex-transition: 0.15s ease;
  --dex-radius: 8px;
}

/* Base styles */
.dex-root {
  font-family: var(--dex-font-body);
  font-size: 14px;
  color: var(--dex-text);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

${DataExplorerPanelCSS}

${DataExplorerTabsCSS}

${DataExplorerUrlListCSS}

${DataExplorerHistoryCSS}

${DataExplorerMetadataCSS}

/* ═══════════════════════════════════════════════════════════════════════════════
   UTILITY CLASSES
   ═══════════════════════════════════════════════════════════════════════════════ */

.dex-flex { display: flex; }
.dex-flex-col { flex-direction: column; }
.dex-items-center { align-items: center; }
.dex-justify-between { justify-content: space-between; }
.dex-gap-sm { gap: 8px; }
.dex-gap-md { gap: 16px; }
.dex-gap-lg { gap: 24px; }

.dex-text-gold { color: var(--dex-gold); }
.dex-text-emerald { color: var(--dex-emerald); }
.dex-text-ruby { color: var(--dex-ruby); }
.dex-text-muted { color: var(--dex-text-muted); }

.dex-bg-card { background: var(--dex-bg-card); }
.dex-border { border: 1px solid var(--dex-border); }
.dex-rounded { border-radius: var(--dex-radius); }

.dex-mono { font-family: var(--dex-font-mono); }
.dex-heading { font-family: var(--dex-font-heading); }

/* Hide scrollbar but keep functionality */
.dex-scrollbar-thin::-webkit-scrollbar {
  width: 6px;
}

.dex-scrollbar-thin::-webkit-scrollbar-track {
  background: var(--dex-bg-dark);
}

.dex-scrollbar-thin::-webkit-scrollbar-thumb {
  background: var(--dex-bg-card-hover);
  border-radius: 3px;
}

.dex-scrollbar-thin::-webkit-scrollbar-thumb:hover {
  background: var(--dex-gold-dim);
}

/* Animations */
@keyframes dex-fade-in {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

.dex-animate-in {
  animation: dex-fade-in 0.2s ease-out;
}

@keyframes dex-glow-pulse {
  0%, 100% { box-shadow: 0 0 8px var(--dex-gold-glow); }
  50% { box-shadow: 0 0 16px var(--dex-gold-glow); }
}

.dex-glow-pulse {
  animation: dex-glow-pulse 2s ease-in-out infinite;
}
`;

/**
 * Inject CSS into the page (for client-side use)
 */
function injectDataExplorerStyles() {
  if (typeof document === "undefined") return;
  
  const existingStyle = document.getElementById("dex-styles");
  if (existingStyle) return;
  
  const style = document.createElement("style");
  style.id = "dex-styles";
  style.textContent = DataExplorerCSS;
  document.head.appendChild(style);
}

module.exports = {
  // Components
  DataExplorerPanel,
  DataExplorerTabs,
  DataExplorerUrlList,
  DataExplorerHistory,
  DataExplorerMetadata,
  
  // CSS
  DataExplorerCSS,
  DataExplorerPanelCSS,
  DataExplorerTabsCSS,
  DataExplorerUrlListCSS,
  DataExplorerHistoryCSS,
  DataExplorerMetadataCSS,
  
  // Helpers
  injectDataExplorerStyles
};
