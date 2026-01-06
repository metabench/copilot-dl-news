"use strict";

const jsgui = require("jsgui3-html");
const StringControl = jsgui.String_Control;

/**
 * DataExplorerMetadata - Detailed metadata for a single download
 * 
 * Shows comprehensive download information:
 * - Response IDs, URL ID
 * - HTTP status, content type, size
 * - Timing breakdown with visual bar
 * - Response headers (collapsible)
 * - Action buttons
 * 
 * @example
 * const metadata = new DataExplorerMetadata({
 *   context,
 *   download: { ... },
 *   onBack: "goBack()",
 *   showHeaders: true
 * });
 */
class DataExplorerMetadata extends jsgui.Control {
  /**
   * @param {Object} spec
   * @param {Object} spec.download - Download record with full metadata
   * @param {string} [spec.onBack] - Back button handler
   * @param {boolean} [spec.showHeaders=true] - Show headers section
   */
  constructor(spec = {}) {
    const context = spec.context || new jsgui.Page_Context();
    super({ context, tagName: "div" });

    this.add_class("dex-metadata");

    const dl = spec.download || {};

    // Back button
    if (spec.onBack) {
      const backBtn = new jsgui.Control({ 
        context, 
        tagName: "button", 
        class: "dex-btn dex-btn--ghost dex-metadata__back" 
      });
      backBtn.dom.attributes.type = "button";
      backBtn.dom.attributes.onclick = spec.onBack;
      backBtn.add(new StringControl({ context, text: "← Back to History" }));
      this.add(backBtn);
    }

    // Timestamp header
    const header = new jsgui.div({ context, class: "dex-metadata__header" });
    const timestamp = new jsgui.div({ context, class: "dex-metadata__timestamp" });
    timestamp.add(new StringControl({ context, text: formatDateTime(dl.fetchedAt || dl.createdAt) }));
    header.add(timestamp);
    this.add(header);

    // Metadata grid
    this.add(this._buildMetadataGrid(context, dl));

    // Timing breakdown
    this.add(this._buildTimingBar(context, dl));

    // Headers section (collapsible)
    if (spec.showHeaders !== false) {
      this.add(this._buildHeadersSection(context, dl.headers || {}));
    }

    // Actions
    this.add(this._buildActions(context));
  }

  _buildMetadataGrid(context, dl) {
    const grid = new jsgui.div({ context, class: "dex-metadata__grid" });
    
    const fields = [
      { label: "Response ID", value: formatNumber(dl.id || dl.responseId) },
      { label: "URL ID", value: formatNumber(dl.urlId) },
      { label: "HTTP Status", value: `${dl.status || "—"} ${dl.statusText || ""}`, variant: getStatusVariant(dl.status) },
      { label: "Content Type", value: dl.contentType || "—" },
      { label: "Content Length", value: dl.contentLength ? `${formatNumber(dl.contentLength)} bytes (${formatBytes(dl.contentLength)})` : "—" },
      { label: "Fetched At", value: formatDateTime(dl.fetchedAt || dl.createdAt) },
      { label: "TTFB", value: dl.ttfb ? `${dl.ttfb}ms` : "—" },
      { label: "Total Time", value: dl.totalTime || dl.duration ? `${dl.totalTime || dl.duration}ms` : "—" },
      { label: "Compression", value: dl.compression || "—" },
      { label: "Cache Status", value: dl.cacheStatus || "—" }
    ];

    fields.forEach(field => {
      const cell = new jsgui.div({ context, class: "dex-metadata__cell" });
      
      const label = new jsgui.div({ context, class: "dex-metadata__cell-label" });
      label.add(new StringControl({ context, text: field.label }));
      cell.add(label);
      
      const value = new jsgui.div({ context, class: "dex-metadata__cell-value" });
      if (field.variant) {
        value.add_class(`dex-metadata__cell-value--${field.variant}`);
      }
      value.add(new StringControl({ context, text: String(field.value) }));
      cell.add(value);
      
      grid.add(cell);
    });
    
    return grid;
  }

  _buildTimingBar(context, dl) {
    const container = new jsgui.div({ context, class: "dex-metadata__timing" });
    
    const label = new jsgui.div({ context, class: "dex-metadata__section-label" });
    label.add(new StringControl({ context, text: "Timing Breakdown" }));
    container.add(label);
    
    const card = new jsgui.div({ context, class: "dex-metadata__timing-card" });
    
    // Calculate timing percentages
    const dns = dl.dnsTime || 45;
    const connect = dl.connectTime || 89;
    const ttfb = dl.ttfb || 234;
    const download = dl.downloadTime || 88;
    const total = dns + connect + ttfb + download;
    
    // SVG timing bar
    const barWidth = 280;
    const barHeight = 12;
    
    const dnsWidth = (dns / total) * barWidth;
    const connectWidth = (connect / total) * barWidth;
    const ttfbWidth = (ttfb / total) * barWidth;
    const downloadWidth = (download / total) * barWidth;
    
    let x = 0;
    const svgBar = `
      <svg width="${barWidth}" height="${barHeight}" viewBox="0 0 ${barWidth} ${barHeight}" class="dex-metadata__timing-svg">
        <rect x="${x}" y="0" width="${dnsWidth}" height="${barHeight}" rx="2" fill="#ffc87c"/>
        <rect x="${x += dnsWidth}" y="0" width="${connectWidth}" height="${barHeight}" fill="#50c878"/>
        <rect x="${x += connectWidth}" y="0" width="${ttfbWidth}" height="${barHeight}" fill="#6fa8dc"/>
        <rect x="${x += ttfbWidth}" y="0" width="${downloadWidth}" height="${barHeight}" rx="2" fill="#da70d6"/>
      </svg>
    `;
    
    const barContainer = new jsgui.div({ context, class: "dex-metadata__timing-bar" });
    barContainer._inner_html = svgBar;
    card.add(barContainer);
    
    // Legend
    const legend = new jsgui.div({ context, class: "dex-metadata__timing-legend" });
    
    const segments = [
      { color: "#ffc87c", label: "DNS", value: `${dns}ms` },
      { color: "#50c878", label: "Connect", value: `${connect}ms` },
      { color: "#6fa8dc", label: "TTFB", value: `${ttfb}ms` },
      { color: "#da70d6", label: "Download", value: `${download}ms` }
    ];
    
    segments.forEach(seg => {
      const item = new jsgui.span({ context, class: "dex-metadata__timing-item" });
      const dot = `<svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="${seg.color}"/></svg>`;
      const dotSpan = new jsgui.span({ context });
      dotSpan._inner_html = dot;
      item.add(dotSpan);
      item.add(new StringControl({ context, text: `${seg.label} ${seg.value}` }));
      legend.add(item);
    });
    
    card.add(legend);
    container.add(card);
    
    return container;
  }

  _buildHeadersSection(context, headers) {
    const container = new jsgui.div({ context, class: "dex-metadata__headers" });
    
    // Collapsible toggle
    const toggle = new jsgui.Control({ 
      context, 
      tagName: "button", 
      class: "dex-btn dex-metadata__headers-toggle" 
    });
    toggle.dom.attributes.type = "button";
    toggle.dom.attributes.onclick = "this.parentElement.classList.toggle('is-expanded')";
    
    const headerEntries = Object.entries(headers);
    toggle.add(new StringControl({ context, text: `📋 Response Headers (${headerEntries.length})` }));
    
    const arrow = new jsgui.span({ context, class: "dex-metadata__headers-arrow" });
    arrow.add(new StringControl({ context, text: "▼" }));
    toggle.add(arrow);
    
    container.add(toggle);
    
    // Headers list (initially hidden)
    const list = new jsgui.div({ context, class: "dex-metadata__headers-list" });
    
    headerEntries.forEach(([name, value]) => {
      const row = new jsgui.div({ context, class: "dex-metadata__headers-row" });
      
      const nameEl = new jsgui.span({ context, class: "dex-metadata__header-name" });
      nameEl.add(new StringControl({ context, text: `${name}:` }));
      row.add(nameEl);
      
      const valueEl = new jsgui.span({ context, class: "dex-metadata__header-value" });
      valueEl.add(new StringControl({ context, text: String(value) }));
      row.add(valueEl);
      
      list.add(row);
    });
    
    container.add(list);
    
    return container;
  }

  _buildActions(context) {
    const actions = new jsgui.div({ context, class: "dex-metadata__actions" });
    
    const buttons = [
      { label: "📄 View HTML", id: "viewHtml" },
      { label: "📦 Raw Response", id: "viewRaw" },
      { label: "💾 Export", id: "export" }
    ];
    
    buttons.forEach(btn => {
      const button = new jsgui.Control({ 
        context, 
        tagName: "button", 
        class: "dex-btn" 
      });
      button.dom.attributes.type = "button";
      button.dom.attributes.id = btn.id;
      button.add(new StringControl({ context, text: btn.label }));
      actions.add(button);
    });
    
    return actions;
  }
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes == null || bytes === 0) return "0B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
}

/**
 * Format date/time
 */
function formatDateTime(value) {
  if (!value) return "—";
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return String(value);
    return date.toISOString().replace("T", " ").substring(0, 23);
  } catch {
    return String(value);
  }
}

/**
 * Format number with thousands separator
 */
function formatNumber(num) {
  if (num == null) return "—";
  return Number(num).toLocaleString("en-US");
}

/**
 * Get variant based on HTTP status
 */
function getStatusVariant(status) {
  if (!status) return null;
  if (status >= 200 && status < 300) return "success";
  if (status >= 300 && status < 400) return "warning";
  if (status >= 400) return "error";
  return null;
}

/**
 * CSS styles for DataExplorerMetadata
 */
const DataExplorerMetadataCSS = `
/* ═══════════════════════════════════════════════════════════════════════════════
   DATA EXPLORER METADATA
   Detailed download metadata view
   ═══════════════════════════════════════════════════════════════════════════════ */

.dex-metadata {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dex-metadata__back {
  align-self: flex-start;
}

.dex-metadata__header {
  margin-bottom: 4px;
}

.dex-metadata__timestamp {
  font-family: Georgia, serif;
  font-size: 14px;
  color: #c9a227;
}

/* Metadata Grid */
.dex-metadata__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.dex-metadata__cell {
  padding: 12px;
  background: rgba(20, 24, 36, 0.6);
  border: 1px solid rgba(51, 65, 85, 0.4);
  border-radius: 6px;
}

.dex-metadata__cell-label {
  font-size: 10px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.dex-metadata__cell-value {
  font-size: 12px;
  color: #cbd5e1;
  word-break: break-word;
}

.dex-metadata__cell-value--success {
  color: #50c878;
}

.dex-metadata__cell-value--warning {
  color: #ffc87c;
}

.dex-metadata__cell-value--error {
  color: #ff6b6b;
}

/* Section label */
.dex-metadata__section-label {
  font-size: 10px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 8px;
}

/* Timing */
.dex-metadata__timing-card {
  padding: 16px;
  background: rgba(20, 24, 36, 0.6);
  border: 1px solid rgba(51, 65, 85, 0.4);
  border-radius: 8px;
}

.dex-metadata__timing-bar {
  margin-bottom: 12px;
}

.dex-metadata__timing-svg {
  display: block;
  width: 100%;
  height: 12px;
  border-radius: 6px;
  overflow: hidden;
}

.dex-metadata__timing-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 11px;
  color: #94a3b8;
}

.dex-metadata__timing-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Headers section */
.dex-metadata__headers {
  margin-top: 8px;
}

.dex-metadata__headers-toggle {
  width: 100%;
  justify-content: space-between;
}

.dex-metadata__headers-arrow {
  transition: transform 0.2s ease;
}

.dex-metadata__headers.is-expanded .dex-metadata__headers-arrow {
  transform: rotate(180deg);
}

.dex-metadata__headers-list {
  display: none;
  margin-top: 8px;
  padding: 12px;
  background: rgba(10, 13, 20, 0.5);
  border: 1px solid rgba(51, 65, 85, 0.3);
  border-radius: 6px;
  max-height: 200px;
  overflow-y: auto;
}

.dex-metadata__headers.is-expanded .dex-metadata__headers-list {
  display: block;
}

.dex-metadata__headers-row {
  display: flex;
  gap: 8px;
  padding: 4px 0;
  font-size: 11px;
  border-bottom: 1px solid rgba(51, 65, 85, 0.2);
}

.dex-metadata__headers-row:last-child {
  border-bottom: none;
}

.dex-metadata__header-name {
  color: #c9a227;
  font-weight: 500;
  flex-shrink: 0;
}

.dex-metadata__header-value {
  color: #94a3b8;
  word-break: break-all;
}

/* Actions */
.dex-metadata__actions {
  display: flex;
  gap: 8px;
  padding-top: 8px;
}
`;

module.exports = {
  DataExplorerMetadata,
  DataExplorerMetadataCSS,
  formatBytes,
  formatDateTime,
  formatNumber,
  getStatusVariant
};
